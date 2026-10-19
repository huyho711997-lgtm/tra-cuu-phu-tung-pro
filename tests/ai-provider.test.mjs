import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const core = readFileSync(new URL('../assets/js/app-core.mjs', import.meta.url), 'utf8');
function block(start, end) { return core.slice(core.indexOf(start), core.indexOf(end, core.indexOf(start))); }

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

test('Gemini search preserves the authenticated warehouse Edge Function', async () => {
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

test('Gemini preserves PDF/image input to the secure dispatcher with no OCR.Space requirement', async () => {
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
