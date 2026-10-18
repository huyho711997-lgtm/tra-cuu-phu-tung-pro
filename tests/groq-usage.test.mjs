import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroqUsageTracker, groqQuotaTokens, parseGroqReset } from '../assets/js/groq-usage.mjs';
import { generateGroqContent } from '../assets/js/ai-provider.mjs';

function fakeStorage() {
    const map = new Map();
    return { get length() { return map.size; }, key(index) { return [...map.keys()][index]; },
        getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key), map };
}
const usage = { prompt_tokens: 1000, completion_tokens: 400, total_tokens: 1400, prompt_tokens_details: { cached_tokens: 200 }, completion_tokens_details: { reasoning_tokens: 100 } };
const headers = () => new Headers({
    'x-ratelimit-limit-requests': '1000', 'x-ratelimit-remaining-requests': '997', 'x-ratelimit-reset-requests': '23h59m',
    'x-ratelimit-limit-tokens': '8000', 'x-ratelimit-remaining-tokens': '6500', 'x-ratelimit-reset-tokens': '20s'
});
async function fixture(extra = {}) {
    let at = Date.parse('2026-10-18T12:00:00Z'), count = 0;
    const storage = fakeStorage();
    const options = { ownerId: 'user-a', apiKey: 'gsk-not-a-real-key', storage, now: () => at, randomId: () => 'request-' + ++count, ...extra };
    return { tracker: await createGroqUsageTracker(options), options, storage, advance: ms => at += ms, setTime: value => at = Date.parse(value) };
}

test('empty ledger is explicitly local, not a fabricated account-wide usage total', async () => {
    const { tracker } = await fixture();
    const snapshot = tracker.snapshot();
    assert.equal(snapshot.hasRecords, false);
    assert.equal(snapshot.requestDay.source, 'local');
    assert.equal(snapshot.tokenDay.source, 'local');
    assert.equal(snapshot.lastAt, null);
    assert.equal(snapshot.tokenDay.limit, 200000);
});

test('Groq headers measure daily requests and minute tokens, while other counters remain local', async () => {
    const { tracker } = await fixture();
    tracker.finish(tracker.start(), { status: 200, headers: headers(), usage });
    const snapshot = tracker.snapshot();
    assert.equal(snapshot.requestMinute.used, 1);
    assert.equal(snapshot.requestMinute.limit, 30);
    assert.equal(snapshot.requestDay.used, 3);
    assert.equal(snapshot.requestDay.remaining, 997);
    assert.equal(snapshot.requestDay.source, 'groq');
    assert.equal(snapshot.tokenMinute.used, 1500);
    assert.equal(snapshot.tokenMinute.remaining, 6500);
    assert.equal(snapshot.tokenMinute.source, 'groq');
    assert.equal(snapshot.tokenDay.used, 1200);
    assert.equal(snapshot.tokenDay.source, 'local');
    assert.equal(snapshot.lastTokens, 1400);
});

test('missing or browser-hidden headers fall back to observed local counts', async () => {
    const { tracker } = await fixture();
    tracker.finish(tracker.start(), { status: 200, headers: new Headers(), usage });
    const snapshot = tracker.snapshot();
    assert.equal(snapshot.requestDay.used, 1);
    assert.equal(snapshot.requestDay.source, 'local');
    assert.equal(snapshot.tokenMinute.used, 1200);
    assert.equal(snapshot.tokenMinute.source, 'local');
});

test('counts survive reload and parallel tabs cannot lose each other’s requests', async () => {
    const { tracker: first, options } = await fixture();
    const second = await createGroqUsageTracker({ ...options, randomId: () => 'other-tab' });
    const one = first.start(), two = second.start();
    first.finish(one, { status: 200, usage });
    second.finish(two, { status: 200, usage });
    const reloaded = await createGroqUsageTracker(options);
    for (const tracker of [first, second, reloaded]) {
        assert.equal(tracker.snapshot().requestDay.used, 2);
        assert.equal(tracker.snapshot().tokenDay.used, 2400);
    }
});

test('ledger is separated by account and API key and never stores credentials or prompts', async () => {
    const { tracker, storage, options } = await fixture();
    tracker.finish(tracker.start(), { status: 200, usage });
    const differentUser = await createGroqUsageTracker({ ...options, ownerId: 'user-b' });
    const differentKey = await createGroqUsageTracker({ ...options, apiKey: 'another-key' });
    assert.equal(differentUser.snapshot().requestDay.used, 0);
    assert.equal(differentKey.snapshot().requestDay.used, 0);
    const stored = JSON.stringify([...storage.map]);
    assert.ok(!stored.includes(options.apiKey));
    assert.ok(!stored.includes('prompt_tokens'));
    assert.notEqual(differentKey.prefix, tracker.prefix);
});

test('minute counters expire automatically; expired server observations are no longer authoritative', async () => {
    const { tracker, advance } = await fixture();
    tracker.finish(tracker.start(), { status: 200, usage, headers: headers() });
    advance(21000);
    assert.equal(tracker.snapshot().tokenMinute.source, 'local');
    assert.equal(tracker.snapshot().tokenMinute.used, 1200);
    advance(39000);
    assert.equal(tracker.snapshot().requestMinute.used, 0);
    assert.equal(tracker.snapshot().tokenMinute.used, 0);
    assert.equal(tracker.snapshot().tokenDay.used, 1200);
});

test('local daily counters reset on UTC midnight without discarding the last 60 seconds', async () => {
    const { tracker, setTime, advance } = await fixture();
    setTime('2026-10-18T23:59:55Z');
    const request = tracker.start();
    advance(10000);
    tracker.finish(request, { status: 200, usage });
    const snapshot = tracker.snapshot();
    assert.equal(snapshot.requestDay.used, 0);
    assert.equal(snapshot.requestMinute.used, 1);
    assert.equal(snapshot.tokenDay.used, 1200);
    assert.equal(snapshot.tokenMinute.used, 1200);
    advance(60000);
    assert.equal(tracker.snapshot().tokenMinute.used, 0);
});

test('tokens exclude cache and never add reasoning twice; absent usage stays unknown', () => {
    assert.deepEqual(groqQuotaTokens(usage), { total: 1400, cached: 200, quota: 1200 });
    assert.deepEqual(groqQuotaTokens({ prompt_tokens: 100, completion_tokens: 50 }), { total: 150, cached: 0, quota: 150 });
    assert.equal(groqQuotaTokens(undefined), null);
    assert.equal(groqQuotaTokens({ total_tokens: -1 }), null);
});

test('failed or pending requests are counted as sends with unknown token use', async () => {
    const { tracker } = await fixture();
    tracker.start();
    tracker.finish(tracker.start(), { status: 401, headers: new Headers() });
    const snapshot = tracker.snapshot();
    assert.equal(snapshot.requestDay.used, 2);
    assert.equal(snapshot.tokenDay.used, 0);
    assert.equal(snapshot.unknownTokens, 2);
});

test('429 responses update remaining quota and retry countdown before throwing', async () => {
    const { tracker, advance } = await fixture();
    const limited = headers(); limited.set('retry-after', '15'); limited.set('x-ratelimit-remaining-tokens', '0');
    let request;
    await assert.rejects(generateGroqContent([{ text: 'Trả JSON' }], {}, {
        apiKey: 'test', onRequest: () => request = tracker.start(), onUsage: event => tracker.finish(request, event),
        fetchImpl: async () => new Response('{"error":{"message":"limited"}}', { status: 429, headers: limited })
    }), error => error.status === 429);
    assert.equal(tracker.snapshot().tokenMinute.remaining, 0);
    assert.ok(tracker.snapshot().retryAt);
    assert.equal(tracker.snapshot().requestMinute.used, 1);
    advance(15000);
    assert.ok(tracker.snapshot().retryAt); // Token quota needs 20 seconds, even if retry-after is shorter.
    advance(5000);
    assert.equal(tracker.snapshot().retryAt, null);
});

test('429 without exposed headers survives reload with a bounded one-minute cooldown', async () => {
    const { tracker, storage, options, advance } = await fixture();
    tracker.finish(tracker.start(), { status: 429, headers: new Headers() });
    advance(30000);
    const restored = await createGroqUsageTracker({ ...options, storage });
    assert.ok(restored.snapshot().retryAt);
    advance(30000);
    assert.equal(restored.snapshot().retryAt, null);
});

test('recording malformed/truncated successful completions still counts consumed tokens', async () => {
    const { tracker } = await fixture();
    let request;
    await assert.rejects(generateGroqContent([{ text: 'JSON' }], {}, {
        apiKey: 'test', onRequest: () => request = tracker.start(), onUsage: event => tracker.finish(request, event),
        fetchImpl: async () => new Response(JSON.stringify({ usage, choices: [{ finish_reason: 'length', message: { content: '{' } }] }))
    }), /chưa đầy đủ/);
    assert.equal(tracker.snapshot().tokenDay.used, 1200);
});

test('blocked browser storage and observer errors never stop the AI request', async () => {
    const storage = { get length() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    const { tracker } = await fixture({ storage });
    tracker.finish(tracker.start(), { usage, status: 200 });
    assert.equal(tracker.snapshot().tokenDay.used, 1200);
    const result = await generateGroqContent([{ text: 'JSON' }], {}, {
        apiKey: 'test', onRequest() { throw new Error('observer failed'); }, onUsage() { throw new Error('observer failed'); },
        fetchImpl: async () => new Response('{"choices":[{"message":{"content":"{}"}}]}')
    });
    assert.equal(result.output, '{}');
});

test('rate headers honor actual limits and safely ignore invalid values', async () => {
    const { tracker } = await fixture();
    const actual = headers(); actual.set('x-ratelimit-limit-requests', '2000'); actual.set('x-ratelimit-remaining-requests', '1500');
    actual.set('x-ratelimit-limit-tokens', 'broken');
    tracker.finish(tracker.start(), { status: 200, headers: actual, usage });
    assert.equal(tracker.snapshot().requestDay.limit, 2000);
    assert.equal(tracker.snapshot().requestDay.used, 500);
    assert.equal(tracker.snapshot().tokenMinute.source, 'local');
});

test('reset durations parse correctly including fractional seconds and reject unrelated text', () => {
    assert.equal(parseGroqReset('2m59.56s'), 179560);
    assert.equal(parseGroqReset('1d2h3m4s'), 93784000);
    assert.equal(parseGroqReset('500ms'), 500);
    assert.equal(parseGroqReset('7.66s'), 7660);
    assert.equal(parseGroqReset('2'), 2000);
    assert.equal(parseGroqReset('tomorrow'), null);
    assert.equal(parseGroqReset(null), null);
});
