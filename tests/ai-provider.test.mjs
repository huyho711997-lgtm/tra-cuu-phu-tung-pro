import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { generateGroqContent, GROQ_MODEL } from '../assets/js/ai-provider.mjs';
import { createGroqUsageTracker } from '../assets/js/groq-usage.mjs';

const success = (content = '{"items":[]}', finish_reason = 'stop') => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason }] }), { status: 200 });
const parts = [{ text: 'Trả JSON cho phụ tùng cản trước.' }];
const core = readFileSync(new URL('../assets/js/app-core.mjs', import.meta.url), 'utf8');
function block(start, end) { return core.slice(core.indexOf(start), core.indexOf(end, core.indexOf(start))); }

test('Groq sends the selected model, bearer key and JSON mode to Groq only', async () => {
    let calls = 0;
    const result = await generateGroqContent(parts, { responseMimeType: 'application/json', maxOutputTokens: 1024 }, {
        apiKey: ' test-key ', fetchImpl: async (url, options) => {
            calls++;
            assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
            assert.equal(options.headers.Authorization, 'Bearer test-key');
            const body = JSON.parse(options.body);
            assert.equal(body.model, GROQ_MODEL);
            assert.equal(body.response_format.type, 'json_object');
            assert.equal(body.max_completion_tokens, 1024);
            assert.equal(body.reasoning_effort, 'low');
            return success();
        }
    });
    assert.equal(calls, 1);
    assert.equal(result.provider, 'groq');
    assert.equal(result.output, '{"items":[]}');
});

test('missing key and binary input fail before network access', async () => {
    const fetchImpl = () => assert.fail('Unexpected request');
    await assert.rejects(generateGroqContent(parts, {}, { apiKey: '', fetchImpl }), /Chưa có Groq/);
    await assert.rejects(generateGroqContent([{ inline_data: {} }], {}, { apiKey: 'key', fetchImpl }), /chỉ nhận văn bản/);
});

for (const status of [401, 403, 413, 429, 503]) {
    test(`HTTP ${status} returns an actionable error without retry or raw key disclosure`, async () => {
        let calls = 0;
        await assert.rejects(generateGroqContent(parts, {}, { apiKey: 'secret', fetchImpl: async () => {
            calls++;
            return new Response(JSON.stringify({ error: { message: 'secret raw upstream message' } }), { status, headers: { 'retry-after': '60' } });
        } }), error => {
            assert.equal(error.status, status);
            assert.equal(error.retryAfter, '60');
            assert.ok(!error.message.includes('secret'));
            return true;
        });
        assert.equal(calls, 1);
    });
}

test('truncated, empty and malformed successful responses are rejected', async () => {
    for (const response of [success('{"items":', 'length'), success(''), new Response('invalid-json')]) {
        await assert.rejects(generateGroqContent(parts, {}, { apiKey: 'key', fetchImpl: async () => response }));
    }
});

test('external cancellation is preserved and the request is not retried', async () => {
    const controller = new AbortController();
    await assert.rejects(generateGroqContent(parts, {}, { apiKey: 'key', signal: controller.signal, fetchImpl: async (_, options) => {
        controller.abort();
        assert.equal(options.signal.aborted, true);
        throw new DOMException('cancelled', 'AbortError');
    } }), { name: 'AbortError' });
    await assert.rejects(generateGroqContent(parts, {}, { apiKey: 'key', signal: controller.signal, fetchImpl: () => assert.fail() }), { name: 'AbortError' });
});

test('timeout and network failures produce clear errors', async () => {
    await assert.rejects(generateGroqContent(parts, {}, { apiKey: 'key', timeoutMs: 5, fetchImpl: (_, { signal }) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')));
    }) }), /quá thời gian/);
    await assert.rejects(generateGroqContent(parts, {}, { apiKey: 'key', fetchImpl: async () => { throw new TypeError('network'); } }), /Không kết nối/);
});

function settingsHarness() {
    const values = new Map();
    const controls = new Map([
        ['quoteLlmProviderSelect', { value: 'gemini' }], ['quoteGroqKeyInput', { value: '' }],
        ['quoteGeminiKeyInput', { value: '' }], ['quoteOcrSpaceKeyInput', { value: '' }]
    ]);
    const context = vm.createContext({
        auth: { currentUser: { uid: 'user-a' } }, currentUserProfile: {},
        OCRSPACE_DEFAULT_LANGUAGE: 'vnm', OCRSPACE_DEFAULT_ENGINE: '2',
        QUOTE_GEMINI_MODEL_PREFERENCE: 'model', GEMINI_QUOTE_MODEL: 'gemini-test', GEMINI_FALLBACK_MODELS: [],
        localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
        document: { getElementById: id => controls.get(id) || null, querySelectorAll: () => [] },
        generateGroqContent: async () => ({ provider: 'groq' }),
        getActiveGroqUsageTracker: async () => null,
        callGeminiGenerateContentWithRetry: async () => ({ provider: 'gemini' }), getQuoteGeminiKeys: () => ['gemini-key']
    });
    context.window = context;
    vm.runInContext(block('        const QUOTE_AI_STORAGE_KEYS =', '        let QUOTE_SETTINGS_OPEN_REVISION ='), context);
    vm.runInContext('globalThis.api = { getLlmProvider, getGroqKey, callSelectedAiGenerateContent, clearQuoteApiInputsForPrivacy, getQuoteAiProvider };', context);
    return { context, controls, values, api: context.api };
}

test('provider switching routes Gemini and Groq independently and survives reload', async () => {
    const { context, controls, values, api } = settingsHarness();
    assert.equal((await api.callSelectedAiGenerateContent(parts)).provider, 'gemini');
    controls.get('quoteLlmProviderSelect').value = 'groq';
    context.saveLlmProvider();
    controls.get('quoteGroqKeyInput').value = 'gsk-test';
    context.saveGroqKey();
    assert.equal((await api.callSelectedAiGenerateContent(parts)).provider, 'groq');
    assert.equal(values.get('tascoLlmProvider__user-a'), 'groq');
    assert.equal(values.get('tascoGroqKey__user-a'), 'gsk-test');
    api.clearQuoteApiInputsForPrivacy();
    assert.equal(controls.get('quoteGroqKeyInput').value, '');
    assert.equal(api.getLlmProvider(), 'groq');
    assert.equal(api.getGroqKey(), 'gsk-test');
    controls.get('quoteLlmProviderSelect').value = 'gemini';
    context.saveLlmProvider();
    assert.equal((await api.callSelectedAiGenerateContent(parts)).provider, 'gemini');
    assert.equal(api.getGroqKey(), 'gsk-test');
});

test('Groq key and provider are isolated between accounts and clearing a key persists', () => {
    const { context, controls, api } = settingsHarness();
    controls.get('quoteLlmProviderSelect').value = 'groq'; context.saveLlmProvider();
    controls.get('quoteGroqKeyInput').value = 'user-a-key'; context.saveGroqKey();
    context.auth.currentUser.uid = 'user-b';
    api.clearQuoteApiInputsForPrivacy();
    assert.equal(api.getLlmProvider(), 'gemini');
    assert.equal(api.getGroqKey(), '');
    context.auth.currentUser.uid = 'user-a';
    assert.equal(api.getGroqKey(), 'user-a-key');
    controls.get('quoteGroqKeyInput').value = ''; context.saveGroqKey();
    assert.equal(api.getGroqKey(), '');
    assert.equal(api.getQuoteAiProvider(), 'gemini'); // OCR choice is independent.
});

test('the application dispatcher records usage on every Groq request and leaves Gemini uncounted', async () => {
    const { context, controls, api } = settingsHarness();
    const tracker = await createGroqUsageTracker({ ownerId: 'test', apiKey: 'test', storage: null });
    context.getActiveGroqUsageTracker = async () => tracker;
    context.generateGroqContent = (parts, config, options) => generateGroqContent(parts, config, {
        ...options, fetchImpl: async () => new Response(JSON.stringify({ usage: { total_tokens: 500 }, choices: [{ message: { content: '{}' } }] }))
    });
    controls.get('quoteGroqKeyInput').value = 'test'; context.saveGroqKey();
    controls.get('quoteLlmProviderSelect').value = 'groq'; context.saveLlmProvider();
    await api.callSelectedAiGenerateContent(parts);
    assert.equal(tracker.snapshot().requestDay.used, 1);
    assert.equal(tracker.snapshot().tokenDay.used, 500);
    controls.get('quoteLlmProviderSelect').value = 'gemini'; context.saveLlmProvider();
    await api.callSelectedAiGenerateContent(parts);
    assert.equal(tracker.snapshot().requestDay.used, 1);
});

function searchHarness({ provider = 'groq', pages, terms = ['cản trước'] } = {}) {
    const calls = [], patterns = [], controller = new AbortController();
    let networkCalls = 0, aiCalls = 0;
    const builder = {};
    for (const method of ['select', 'in', 'eq', 'order', 'range', 'abortSignal']) builder[method] = (...args) => { calls.push([method, ...args]); return builder; };
    builder.or = pattern => { patterns.push(pattern); return builder; };
    builder.then = (resolve, reject) => Promise.resolve(pages?.[networkCalls++] ?? { data: [], count: 0, error: null }).then(resolve, reject);
    const context = vm.createContext({
        DOMException, getLlmProvider: () => provider, getQuoteApiOwnerId: () => 'user-a', assertAuthenticatedDataAccess: () => calls.push(['auth']),
        collection: () => ({ table: 'lich_su_bao_gia' }), db: {}, where: (...args) => args,
        applySupabaseConstraint: (query, _, condition) => { calls.push(['constraint', condition]); return query; },
        callSelectedAiGenerateContent: async () => { aiCalls++; return { output: JSON.stringify({ terms }) }; },
        extractJsonObjectFromGeminiText: JSON.parse, partsAiNameKey: value => value.toLowerCase(),
        supabase: { from: table => { calls.push(['table', table]); return builder; }, functions: { invoke: async () => { calls.push(['edge']); return { data: { candidates: [] } }; } } }
    });
    vm.runInContext(block('        async function requestPartsAiSearch(', '        async function createPartsAiRequestError('), context);
    return { context, calls, patterns, controller, stats: () => ({ networkCalls, aiCalls }) };
}
const criteria = { query: 'cản trước', brand: 'Toyota', models: ['Vios'], years: [2020], kind: 'genuine' };

test('Groq warehouse search preserves all vehicle filters and returns only database names', async () => {
    const harness = searchHarness({ pages: [{ data: [{ id: 'a', ten_phu_tung: 'Cản trước' }, { id: 'b', ten_phu_tung: 'Cản trước' }], count: 2 }] });
    const result = await harness.context.requestPartsAiSearch(criteria, { signal: harness.controller.signal });
    assert.equal(result.provider, 'groq');
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].record_count, 2);
    assert.equal(result.candidates[0].name, 'Cản trước');
    assert.ok(!harness.calls.some(([method]) => method === 'edge'));
    assert.ok(harness.calls.some(call => call[0] === 'constraint' && call[1][0] === 'hang_xe'));
    assert.ok(harness.calls.some(call => call[0] === 'constraint' && call[1][0] === 'hieu_xe'));
    assert.ok(harness.calls.some(call => call[0] === 'in' && call[1] === 'nam_sx'));
    assert.ok(harness.calls.some(call => call[0] === 'eq' && call[1] === 'chinh_hang'));
});

test('Gemini search keeps its existing Edge Function and never invokes Groq', async () => {
    const harness = searchHarness({ provider: 'gemini' });
    await harness.context.requestPartsAiSearch(criteria);
    assert.deepEqual(harness.stats(), { networkCalls: 0, aiCalls: 0 });
    assert.ok(harness.calls.some(call => call[0] === 'edge'));
});

test('warehouse search paginates before counting candidates and stops on errors', async () => {
    const rows = Array.from({ length: 500 }, (_, index) => ({ id: String(index), ten_phu_tung: 'Cản trước' }));
    const harness = searchHarness({ pages: [{ data: rows, count: 501 }, { data: [{ id: '500', ten_phu_tung: 'Cản trước' }], count: 501 }] });
    const result = await harness.context.requestPartsAiSearch(criteria);
    assert.equal(result.candidates[0].record_count, 501);
    assert.equal(harness.stats().networkCalls, 2);
    const failed = searchHarness({ pages: [{ data: null, error: { message: 'RLS failure' }, count: null }] });
    await assert.rejects(failed.context.requestPartsAiSearch(criteria), /chưa đọc được kho/);
    const truncated = searchHarness({ pages: [{ data: [], count: 5 }] });
    await assert.rejects(truncated.context.requestPartsAiSearch(criteria), /Chưa tải đủ/);
});

test('model output cannot inject PostgREST filter syntax or invent warehouse candidates', async () => {
    const harness = searchHarness({ terms: ['x%),id.neq.0', '"; drop table parts', 42, null] });
    const result = await harness.context.requestPartsAiSearch(criteria);
    assert.equal(result.candidates.length, 0);
    assert.ok(!harness.patterns[0].includes('id.neq'));
    assert.ok(!harness.patterns[0].includes('drop table parts"'));
});

test('cancelled warehouse search performs no AI or database request', async () => {
    const harness = searchHarness();
    harness.controller.abort();
    await assert.rejects(harness.context.requestPartsAiSearch(criteria, { signal: harness.controller.signal }), { name: 'AbortError' });
    assert.deepEqual(harness.stats(), { networkCalls: 0, aiCalls: 0 });
});

function extractionHarness(provider, ocrKey = 'ocr-key') {
    const requests = [], ocrCalls = [];
    const context = vm.createContext({
        getLlmProvider: () => provider, getLlmProviderName: () => provider, hasSelectedAiKey: () => true,
        getQuoteOcrMode: () => 'parts', getQuoteOcrSpaceKey: () => ocrKey,
        buildGeminiQuotePrompt: () => 'quote JSON prompt', buildGeminiAppraisalPrompt: () => 'appraisal JSON prompt',
        callOcrSpaceApi: async file => { ocrCalls.push(file); return { text: 'OCR text from image' }; },
        fileToBase64: async () => 'binary-data',
        callSelectedAiGenerateContent: async parts => { requests.push(parts); return { output: '{"items":[]}' }; },
        extractJsonObjectFromGeminiText: JSON.parse, setQuoteStatus() {}, setAppraisalStatus() {}
    });
    vm.runInContext(block('        async function callGeminiQuoteExtraction(', '        function getQuoteOcrSpaceKey('), context);
    vm.runInContext(block('        async function callGeminiAppraisalExtraction(', '        async function extractAppraisalDataFromFile('), context);
    return { context, requests, ocrCalls };
}

test('Groq quote and appraisal images use OCR.Space then send text only', async () => {
    const { context, requests, ocrCalls } = extractionHarness('groq');
    const file = { name: 'quote.pdf', type: 'application/pdf' };
    await context.callGeminiQuoteExtraction({ file });
    await context.callGeminiAppraisalExtraction({ file });
    assert.equal(ocrCalls.length, 2);
    for (const request of requests) {
        assert.ok(request.some(part => part.text === 'OCR text from image'));
        assert.ok(request.every(part => typeof part.text === 'string'));
    }
});

test('Groq media without OCR key fails clearly; text extraction needs no OCR key', async () => {
    const { context, requests, ocrCalls } = extractionHarness('groq', '');
    await assert.rejects(context.callGeminiQuoteExtraction({ file: { name: 'photo.jpg' } }), /OCR.Space API key/);
    await assert.rejects(context.callGeminiAppraisalExtraction({ file: { name: 'photo.jpg' } }), /OCR.Space API key/);
    assert.equal(requests.length, 0);
    await context.callGeminiQuoteExtraction({ text: 'Cản trước 1.000.000' });
    await context.callGeminiAppraisalExtraction({ text: 'Thay thế cản trước' });
    assert.equal(ocrCalls.length, 0);
    assert.equal(requests.length, 2);
});

test('Gemini preserves direct PDF/image processing with no OCR.Space requirement', async () => {
    const { context, requests, ocrCalls } = extractionHarness('gemini', '');
    await context.callGeminiQuoteExtraction({ file: { name: 'quote.pdf', type: 'application/pdf' } });
    await context.callGeminiAppraisalExtraction({ file: { name: 'photo.jpg', type: 'image/jpeg' } });
    assert.equal(ocrCalls.length, 0);
    assert.equal(requests[0][1].inline_data.mime_type, 'application/pdf');
    assert.equal(requests[1][1].inline_data.mime_type, 'image/jpeg');
});

test('both searches, price review and document extraction use the provider dispatcher', () => {
    assert.equal((core.match(/await requestPartsAiSearch\(criteria/g) || []).length, 2);
    assert.equal((core.match(/const result = await callSelectedAiGenerateContent\(/g) || []).length, 4);
    assert.equal((core.match(/if \(file && getLlmProvider\(\) === 'groq'\)/g) || []).length, 2);
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /id="quoteLlmProviderSelect"/);
    assert.match(html, /value="groq"/);
    assert.match(html, /id="quoteGroqKeyInput"[^>]*type="password"/);
    assert.doesNotMatch(html, /class="[^"]*quote-ocr-only[^"]*"[^>]*id="quoteLlmProviderSelect"/);
});
