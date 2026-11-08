import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler, secondsUntilPacificMidnight} from '../supabase/functions/kgpt-ai/handler.mjs';

const USER = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222';
const origin = 'https://huyho711997-lgtm.github.io';
const K1 = 'AIzaKEY-one-aaaaaaaaaaaa', K2 = 'AIzaKEY-two-bbbbbbbbbbbb', K3 = 'AIzaKEY-three-cccccccccc';
const ask = {action: 'generate', provider: 'gemini', model: 'gemini-3.8-flash', parts: [{text: 'x'}], config: {responseMimeType: 'application/json'}};
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json', ...headers}});
const ok = text => json({candidates: [{content: {parts: [{text}]}, finishReason: 'STOP'}]});
const limited = (message = 'quota', headers = {}) => json({error: {code: 429, message, status: 'RESOURCE_EXHAUSTED'}}, 429, headers);

function server({keys = [K1, K2, K3], role = 'user', random = () => 0, fetchImpl, clock = {t: Date.parse('2026-11-08T08:00:00Z')}, stored = {gemini: {id: 'rev-1', key: keys.join('\n')}}} = {}) {
    const calls = [], upstream = [];
    const client = {
        auth: {getUser: async () => ({data: {user: {id: USER}}})},
        from: () => ({select: () => ({eq: () => ({maybeSingle: async () => ({data: {role, status: 'active'}})})})}),
        rpc: async (name, args) => {
            calls.push([name, args]);
            if (name === 'kgpt_ai_consume_rate') return {data: true};
            if (name === 'kgpt_ai_credentials') return {data: stored};
            if (name === 'kgpt_ai_settings_save') return {data: {userId: args.p_target, settings: {}, credentials: {gemini: {id: 'rev-2', suffix: 'cccc'}}}};
            throw new Error('Unexpected RPC ' + name);
        },
    };
    const handler = createHandler({createClient: () => client, env: n => ({SUPABASE_URL: 'https://t.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's'})[n], random, now: () => clock.t,
        fetchImpl: async (url, init) => { upstream.push({url, key: init.headers['x-goog-api-key'], model: String(url).match(/models\/([^:]+):/)?.[1]}); return fetchImpl ? fetchImpl(url, init, upstream.length) : ok('{"ok":1}'); }});
    const request = (body = ask) => handler(new Request('https://t.supabase.co/functions/v1/kgpt-ai', {method: 'POST', headers: {Origin: origin, Authorization: 'Bearer tok', 'Content-Type': 'application/json'}, body: JSON.stringify(body)}));
    return {request, upstream, calls, clock};
}
const leaked = (data, ...secrets) => secrets.some(s => JSON.stringify(data).includes(s));

test('Gemini: tải được trải đều — điểm bắt đầu xoay giữa các key', async () => {
    for (const [random, first] of [[() => 0, K1], [() => 0.5, K2], [() => 0.99, K3]]) {
        const app = server({random}); const res = await app.request();
        assert.equal(res.status, 200); assert.equal(app.upstream[0].key, first);
        const data = await res.json(); assert.equal(data.keyCount, 3); assert.ok(!leaked(data, K1, K2, K3));
    }
});
test('Gemini: key bị 429 thì chuyển key kế tiếp và key đó nghỉ ở các yêu cầu sau (không gọi lại)', async () => {
    const app = server({fetchImpl: (url, init) => init.headers['x-goog-api-key'] === K1 ? limited() : ok('{"ok":1}')});
    let data = await (await app.request()).json();
    assert.equal(app.upstream.length, 2); assert.equal(data.keyNo, 2); assert.equal(data.attempts[0].status, 429);
    const before = app.upstream.length;
    data = await (await app.request()).json();
    assert.equal(app.upstream.length - before, 1, 'key 1 đang nghỉ, đi thẳng key 2'); assert.equal(app.upstream.at(-1).key, K2);
});
test('Gemini: key nghỉ xong (hết thời gian chờ) thì được dùng lại', async () => {
    const app = server({fetchImpl: (url, init, n) => init.headers['x-goog-api-key'] === K1 && n === 1 ? limited('quota', {'retry-after': '30'}) : ok('{}')});
    await app.request(); app.clock.t += 31000;
    await app.request(); assert.equal(app.upstream.at(-1).key, K1);
});
test('Gemini: hết lượt NGÀY thì key nghỉ đến nửa đêm giờ Thái Bình Dương', async () => {
    const app = server({keys: [K1, K2], fetchImpl: (url, init) => init.headers['x-goog-api-key'] === K1 ? limited('Quota exceeded for metric: generate_content_free_tier_requests, limit: 1500 PerDay') : ok('{}')});
    await app.request(); app.clock.t += 3 * 3600 * 1000;
    const n = app.upstream.length; await app.request();
    assert.equal(app.upstream.length - n, 1, 'sau 3 giờ vẫn nghỉ');
    assert.ok(secondsUntilPacificMidnight(Date.parse('2026-11-08T08:00:00Z')) > 0 && secondsUntilPacificMidnight(Date.parse('2026-11-08T08:00:00Z')) <= 86400);
});
test('Gemini: hết lượt ở model ưu tiên thì thử model dự phòng (hạn mức tính theo model), vẫn xoay key', async () => {
    const app = server({keys: [K1, K2], fetchImpl: url => String(url).includes('gemini-3.8-flash') ? limited() : ok('{}')});
    const res = await app.request(), data = await res.json();
    assert.equal(res.status, 200); assert.equal(data.model, 'gemini-3.5-flash-lite');
    assert.deepEqual(app.upstream.map(u => u.model), ['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite']);
});
test('Gemini: mọi key đều hết lượt -> 429 rõ ràng; yêu cầu kế tiếp không gọi nhà cung cấp nữa', async () => {
    const app = server({fetchImpl: () => limited('quota', {'retry-after': '40'})});
    let res = await app.request(), data = await res.json();
    assert.equal(res.status, 429); assert.match(data.error, /Cả 3 key Gemini/); assert.ok(!leaked(data, K1, K2, K3));
    const n = app.upstream.length;
    res = await app.request(); data = await res.json();
    assert.equal(res.status, 429); assert.equal(app.upstream.length, n, 'không gọi dồn khi mọi key đang nghỉ'); assert.ok(data.retryAfter >= 1 && data.retryAfter <= 600);
});
test('Gemini: key sai (401/403) bị bỏ qua tạm thời, key còn lại vẫn phục vụ', async () => {
    const app = server({keys: [K1, K2], fetchImpl: (url, init) => init.headers['x-goog-api-key'] === K1 ? json({error: {message: K1}}, 403) : ok('{}')});
    const res = await app.request(); assert.equal(res.status, 200); assert.ok(!leaked(await res.json(), K1));
    const n = app.upstream.length; await app.request(); assert.equal(app.upstream.length - n, 1);
});
test('Gemini: lỗi 5xx của model thì sang model dự phòng, không đốt hết key', async () => {
    const app = server({fetchImpl: url => String(url).includes('gemini-3.8-flash') ? json({}, 503) : ok('{}')});
    const data = await (await app.request()).json();
    assert.equal(data.model, 'gemini-3.5-flash-lite'); assert.equal(app.upstream.length, 2);
});
test('Gemini: tách key theo dòng, dấu phẩy, chấm phẩy; bỏ trùng; tối đa 10', async () => {
    const many = Array.from({length: 12}, (_, i) => 'AIzaKEY-' + String(i).padStart(2, '0') + '-xxxxxxxxxxxx');
    const app = server({stored: {gemini: {id: 'r', key: many.join(',') + '\n' + many[0] + ';' + many[1]}}});
    const data = await (await app.request()).json(); assert.equal(data.keyCount, 10);
});
test('Lưu key: nhiều key hợp lệ; quá 10 hoặc key quá ngắn bị từ chối trước khi lưu', async () => {
    const app = server();
    assert.equal((await app.request({action: 'save', keys: {gemini: [K1, K2].join('\n')}})).status, 200);
    assert.equal((await app.request({action: 'save', keys: {gemini: Array.from({length: 11}, (_, i) => 'AIzaKEY-' + i + '-xxxxxxxxxxxx').join(',')}})).status, 400);
    assert.equal((await app.request({action: 'save', keys: {gemini: K1 + ',short'}})).status, 400);
    assert.equal((await app.request({action: 'save', keys: {gemini: K1}, appendKeys: ['groq1']})).status, 400);
});
test('Thêm key: gộp vào key đã lưu, bỏ trùng, không ghi đè; không trả key về trình duyệt', async () => {
    const app = server({stored: {gemini: {id: 'r', key: K1 + '\n' + K2}}});
    const res = await app.request({action: 'save', keys: {gemini: K2 + '\n' + K3}, appendKeys: ['gemini']});
    assert.equal(res.status, 200);
    const saved = app.calls.find(([n]) => n === 'kgpt_ai_settings_save')[1];
    assert.deepEqual(saved.p_keys.gemini.split('\n'), [K1, K2, K3]);
    assert.ok(!leaked(await res.json(), K1, K2, K3));
});
test('Thêm key: vượt 10 key báo lỗi và không lưu; người thường không được thêm key cho tài khoản khác', async () => {
    const ten = Array.from({length: 10}, (_, i) => 'AIzaKEY-' + i + '-xxxxxxxxxxxx');
    let app = server({stored: {gemini: {id: 'r', key: ten.join('\n')}}});
    let res = await app.request({action: 'save', keys: {gemini: K3}, appendKeys: ['gemini']});
    assert.equal(res.status, 400); assert.ok(!app.calls.some(([n]) => n === 'kgpt_ai_settings_save'));
    app = server();
    res = await app.request({action: 'save', targetUserId: OTHER, keys: {gemini: K3}, appendKeys: ['gemini']});
    assert.equal(res.status, 403); assert.ok(!app.calls.some(([n]) => n === 'kgpt_ai_credentials'));
    app = server({role: 'admin'});
    res = await app.request({action: 'save', targetUserId: OTHER, keys: {gemini: K3}, appendKeys: ['gemini']});
    assert.equal(res.status, 200);
});

import {createSecureAiClient} from '../assets/js/secure-ai.mjs';
test('Client: save gửi appendKeys khi được yêu cầu, không gửi khi không', async () => {
    const bodies = [];
    const supabase = {auth: {getSession: async () => ({data: {session: {user: {id: USER}, access_token: 't'}}})},
        functions: {invoke: async (name, {body}) => { bodies.push(body); return {data: {}}; }}};
    const client = createSecureAiClient({supabase, getOwner: () => USER});
    await client.save(USER, {}, {gemini: K1}, [], {appendKeys: ['gemini']});
    await client.save(USER, {}, {gemini: K1}, [], {});
    assert.deepEqual(bodies[0].appendKeys, ['gemini']); assert.equal('appendKeys' in bodies[1], false);
});
