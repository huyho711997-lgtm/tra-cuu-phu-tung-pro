import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroqKeyPool } from '../assets/js/groq-key-pool.mjs';

const parts = [{ text: 'Phân loại cản trước; chỉ trả JSON.' }];
const fail = status => Object.assign(new Error('Upstream failure'), { status, retryAfter: '10' });

test('uses preferred key once; blank and duplicate slots do not cause repeated requests', async () => {
    const calls = [];
    const pool = createGroqKeyPool({ generate: async (_, __, { apiKey }) => { calls.push(apiKey); return { output: '{}' }; } });
    await pool.generate(parts, {}, { apiKeys: ['a', '', 'b'], preferredKey: 'b' });
    assert.deepEqual(calls, ['b']);
    calls.length = 0;
    const duplicates = createGroqKeyPool({ generate: async (_, __, { apiKey }) => { calls.push(apiKey); throw fail(401); } });
    await assert.rejects(duplicates.generate(parts, {}, { apiKeys: [' a ', 'a', 'b', 'c'] }), { status: 401 });
    assert.deepEqual(calls, ['a', 'b']);
});

for (const status of [401, 403, 429]) {
    test(`${status} falls back to another key with per-attempt usage and unchanged prompt/config`, async () => {
        const calls = [], events = [], config = { responseMimeType: 'application/json' };
        const pool = createGroqKeyPool({ generate: async (actualParts, actualConfig, options) => {
            assert.equal(actualParts, parts); assert.equal(actualConfig, config);
            calls.push(options.apiKey); options.onRequest(); options.onUsage({ status: options.apiKey === 'a' ? status : 200 });
            if (options.apiKey === 'a') throw fail(status);
            return { output: '{}', provider: 'groq' };
        } });
        const result = await pool.generate(parts, config, { apiKeys: ['a', 'b', 'c'],
            onKeyChange: key => events.push(['key', key]), onRequest: key => events.push(['request', key]),
            onUsage: (key, data) => events.push(['usage', key, data.status]) });
        assert.equal(result.provider, 'groq'); assert.deepEqual(calls, ['a', 'b']);
        assert.deepEqual(events, [['key','a'],['request','a'],['usage','a',status],['key','b'],['request','b'],['usage','b',200]]);
    });
}

test('all keys limited stops after three attempts and skips cooling keys until recovery', async () => {
    let now = 100000; const calls = [];
    const pool = createGroqKeyPool({ now: () => now, generate: async (_, __, { apiKey }) => { calls.push(apiKey); throw fail(429); } });
    const options = { apiKeys: ['a','b','c'] };
    await assert.rejects(pool.generate(parts, {}, options), error => error.status === 429 && error.retryAfter === '10');
    assert.deepEqual(calls, ['a','b','c']);
    await assert.rejects(pool.generate(parts, {}, options), { status: 429 });
    assert.equal(calls.length, 3);
    now += 10000;
    await assert.rejects(pool.generate(parts, {}, options), { status: 429 });
    assert.equal(calls.length, 6);
});

test('persisted server cooldowns prevent requests; longer exhausted daily limit wins', async () => {
    let now = 100000; const calls = [];
    const pool = createGroqKeyPool({ now: () => now, generate: async (_, __, options) => {
        calls.push(options.apiKey);
        if (options.apiKey === 'b') return { output: '{}' };
        options.onUsage({ headers: new Headers({ 'x-ratelimit-remaining-requests': '0', 'x-ratelimit-reset-requests': '2h' }) });
        throw fail(429);
    } });
    await pool.generate(parts, {}, { apiKeys: ['a','b'], getRetryAt: async key => key === 'a' ? now + 1000 : 0 });
    assert.deepEqual(calls, ['b']); calls.length = 0;
    await pool.generate(parts, {}, { apiKeys: ['a','b'] });
    assert.deepEqual(calls, ['a','b']); calls.length = 0;
    now += 60000;
    await pool.generate(parts, {}, { apiKeys: ['a','b'] });
    assert.deepEqual(calls, ['b']);
});

test('network, timeout, server errors, payload errors and truncated output never switch keys', async () => {
    for (const error of [new TypeError('network'), new Error('timeout'), fail(400), fail(413), fail(503), new Error('truncated')]) {
        const calls = [];
        const pool = createGroqKeyPool({ generate: async (_, __, { apiKey }) => { calls.push(apiKey); throw error; } });
        await assert.rejects(pool.generate(parts, {}, { apiKeys: ['a','b','c'] }), value => value === error);
        assert.deepEqual(calls, ['a']);
    }
});

test('cancellation before or during fallback and account change stop remaining keys', async () => {
    const controller = new AbortController(), calls = [];
    const pool = createGroqKeyPool({ generate: async (_, __, { apiKey }) => { calls.push(apiKey); controller.abort(); throw fail(429); } });
    await assert.rejects(pool.generate(parts, {}, { apiKeys: ['a','b'], signal: controller.signal }), { name: 'AbortError' });
    assert.deepEqual(calls, ['a']);
    await assert.rejects(pool.generate(parts, {}, { apiKeys: ['a','b'], signal: controller.signal }), { name: 'AbortError' });
    assert.equal(calls.length, 1);
    let current = true;
    const stale = createGroqKeyPool({ generate: async () => { current = false; return { output: '{}' }; } });
    await assert.rejects(stale.generate(parts, {}, { apiKeys: ['a','b'], isCurrent: () => current }), { name: 'AbortError' });
});

test('missing keys fail without network and observer failures never repeat successful requests', async () => {
    let calls = 0;
    const pool = createGroqKeyPool({ generate: async (_, __, options) => { calls++; options.onRequest(); options.onUsage({}); return { output: '{}' }; } });
    await assert.rejects(pool.generate(parts, {}, { apiKeys: [] }), /Chưa có Groq/);
    const badObserver = () => { throw new Error('observer'); };
    await pool.generate(parts, {}, { apiKeys: ['a','b'], getRetryAt: badObserver, onKeyChange: badObserver, onRequest: badObserver, onUsage: badObserver });
    assert.equal(calls, 1);
});
