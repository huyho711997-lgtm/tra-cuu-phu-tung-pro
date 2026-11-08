import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/kgpt-ai/handler.mjs';

const ADMIN = '11111111-1111-4111-8111-111111111111', USER = '22222222-2222-4222-8222-222222222222', OTHER = '33333333-3333-4333-8333-333333333333';
const origin = 'https://huyho711997-lgtm.github.io';
const SECRET = 'AIzaSy-super-secret-shared-key-0001';

function server({role = 'admin', rpcError, credentials = {}} = {}) {
    const calls = [];
    const actor = role === 'admin' ? ADMIN : USER;
    const client = {
        auth: {getUser: async () => ({data: {user: {id: actor}}})},
        from: () => ({select: () => ({eq: () => ({maybeSingle: async () => ({data: {role, status: 'active'}})})})}),
        rpc: async (name, args) => {
            calls.push([name, args]);
            if (rpcError?.name === name) return {data: null, error: rpcError.error};
            if (name === 'kgpt_ai_consume_rate') return {data: true};
            if (name === 'kgpt_ai_credentials') return {data: credentials};
            if (name === 'kgpt_ai_shared_read') return {data: {credentials: {gemini: {id: 'rev', suffix: '0001', count: 2}}, grantedCount: 1, activeCount: 4}};
            if (name === 'kgpt_ai_shared_save') return {data: {credentials: {gemini: {id: 'rev2', suffix: '0002', count: 3}}, grantedCount: 1, activeCount: 4}};
            if (name === 'kgpt_ai_shared_grant') return {data: {updated: args.p_targets.length, allow: args.p_allow, grantedCount: 2, activeCount: 4}};
            throw new Error('Unexpected RPC ' + name);
        },
    };
    const handler = createHandler({createClient: () => client, env: n => ({SUPABASE_URL: 'https://t.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's'})[n], fetchImpl: async () => { throw new Error('không được gọi nhà cung cấp'); }});
    const request = body => handler(new Request('https://t.supabase.co/functions/v1/kgpt-ai', {method: 'POST', headers: {Origin: origin, Authorization: 'Bearer tok', 'Content-Type': 'application/json'}, body: JSON.stringify(body)}));
    return {request, calls};
}
const used = (app, name) => app.calls.filter(([n]) => n === name);

test('người dùng thường không đọc/lưu/cấp quyền key dùng chung và không chạm tới CSDL key', async () => {
    const app = server({role: 'user'});
    for (const body of [{action: 'shared'}, {action: 'sharedSave', keys: {gemini: SECRET}}, {action: 'grant', targetUserIds: [USER], allow: true}]) {
        const res = await app.request(body);
        assert.equal(res.status, 403, body.action); assert.equal((await res.json()).code, 'ACCESS_DENIED');
    }
    assert.ok(!app.calls.some(([n]) => /shared/.test(n)), 'không được gọi RPC key dùng chung');
});

test('admin đọc metadata key dùng chung; danh tính lấy từ phiên đăng nhập, không từ nội dung gửi lên', async () => {
    const app = server();
    const res = await app.request({action: 'shared', actor: OTHER, p_actor: OTHER});
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.credentials.gemini.count, 2); assert.equal(data.grantedCount, 1);
    assert.equal(used(app, 'kgpt_ai_shared_read')[0][1].p_actor, ADMIN);
});

test('admin lưu key dùng chung: gửi đúng tham số, key không lộ trong phản hồi', async () => {
    const app = server();
    const res = await app.request({action: 'sharedSave', targetUserId: OTHER, keys: {gemini: SECRET + ',AIzaSy-second-key-0002', groq1: 'gsk_groq_shared_key'}, clear: ['ocrspace'], appendKeys: ['gemini']});
    assert.equal(res.status, 200);
    const args = used(app, 'kgpt_ai_shared_save')[0][1];
    assert.equal(args.p_actor, ADMIN); assert.deepEqual(args.p_clear, ['ocrspace']); assert.deepEqual(args.p_append, ['gemini']);
    assert.equal(args.p_keys.groq1, 'gsk_groq_shared_key');
    assert.ok(!JSON.stringify(await res.json()).includes(SECRET));
    assert.ok(!app.calls.some(([n]) => n === 'kgpt_ai_credentials'), 'key cũ không được đọc ra ngoài Vault để gộp');
});

test('lưu key dùng chung: dữ liệu sai bị từ chối trước khi chạm CSDL', async () => {
    const app = server();
    const tooMany = Array.from({length: 11}, (_, i) => 'AIzaSy-key-number-' + String(i).padStart(3, '0')).join(',');
    const cases = [
        [{action: 'sharedSave', keys: {evil: SECRET}}, 400, 'INVALID_INPUT'],
        [{action: 'sharedSave', keys: {gemini: 'short'}}, 400, 'INVALID_INPUT'],
        [{action: 'sharedSave', keys: {gemini: SECRET + ',short'}}, 400, 'INVALID_INPUT'],
        [{action: 'sharedSave', keys: {gemini: 123456789}}, 400, 'INVALID_INPUT'],
        [{action: 'sharedSave', keys: {gemini: tooMany}}, 400, 'TOO_MANY_KEYS'],
        [{action: 'sharedSave', keys: {}, clear: []}, 400, 'INVALID_INPUT'],
        [{action: 'sharedSave', keys: {gemini: SECRET}, appendKeys: ['groq1']}, 400, 'INVALID_INPUT'],
        [{action: 'sharedSave', keys: [], clear: []}, 400, 'INVALID_INPUT'],
        [{action: 'sharedSave', clear: ['nope']}, 400, 'INVALID_INPUT'],
    ];
    for (const [body, status, code] of cases) {
        const res = await app.request(body);
        assert.equal(res.status, status, JSON.stringify(body)); assert.equal((await res.json()).code, code);
    }
    assert.equal(used(app, 'kgpt_ai_shared_save').length, 0);
});

test('chỉ xóa key (không nhập key mới) vẫn hợp lệ', async () => {
    const app = server();
    assert.equal((await app.request({action: 'sharedSave', clear: ['gemini']})).status, 200);
    assert.deepEqual(used(app, 'kgpt_ai_shared_save')[0][1].p_clear, ['gemini']);
});

test('CSDL báo vượt 10 key thì trả 400 TOO_MANY_KEYS, và lỗi nội bộ không lộ chi tiết', async () => {
    let app = server({rpcError: {name: 'kgpt_ai_shared_save', error: {message: 'AI_TOO_MANY_KEYS', code: 'P0001'}}});
    let res = await app.request({action: 'sharedSave', keys: {gemini: SECRET}, appendKeys: ['gemini']});
    assert.equal(res.status, 400); assert.equal((await res.json()).code, 'TOO_MANY_KEYS');
    app = server({rpcError: {name: 'kgpt_ai_shared_save', error: {message: 'boom ' + SECRET, code: 'XX000'}}});
    res = await app.request({action: 'sharedSave', keys: {gemini: SECRET}});
    assert.equal(res.status, 503); assert.ok(!(await res.text()).includes(SECRET));
});

test('cấp / thu hồi quyền: kiểm tra danh sách uuid, bỏ trùng, allow phải là boolean', async () => {
    const app = server();
    let res = await app.request({action: 'grant', targetUserIds: [USER, USER, OTHER], allow: true});
    assert.equal(res.status, 200);
    let args = used(app, 'kgpt_ai_shared_grant')[0][1];
    assert.deepEqual(args.p_targets, [USER, OTHER]); assert.equal(args.p_allow, true); assert.equal(args.p_actor, ADMIN);
    res = await app.request({action: 'grant', targetUserIds: [USER], allow: false});
    assert.equal(used(app, 'kgpt_ai_shared_grant')[1][1].p_allow, false);
    const many = Array.from({length: 1001}, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    for (const body of [{targetUserIds: [], allow: true}, {targetUserIds: ['not-a-uuid'], allow: true}, {targetUserIds: USER, allow: true},
        {targetUserIds: [USER], allow: 'true'}, {targetUserIds: [USER]}, {targetUserIds: many, allow: true}, {allow: true}]) {
        res = await app.request({action: 'grant', ...body});
        assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
    }
    assert.equal(used(app, 'kgpt_ai_shared_grant').length, 2);
});

test('người dùng không thể tự cấp quyền qua action lưu cài đặt cũ', async () => {
    const app = server({role: 'user'});
    const res = await app.request({action: 'save', settings: {useSharedKeys: true}});
    assert.equal(res.status, 400);
    assert.ok(!app.calls.some(([n]) => n === 'kgpt_ai_settings_save'));
});

test('chưa được cấp key: báo rõ cần liên hệ quản trị viên và không gọi nhà cung cấp', async () => {
    const app = server({role: 'user', credentials: {}});
    const res = await app.request({action: 'generate', provider: 'gemini', model: 'gemini-3.8-flash', parts: [{text: 'x'}]});
    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.code, 'KEY_NOT_CONFIGURED'); assert.match(data.error, /quản trị viên/);
});

test('người được cấp quyền dùng key dùng chung qua kgpt_ai_credentials và key không lộ về trình duyệt', async () => {
    const calls = [];
    const app = server({role: 'user', credentials: {gemini: {id: 'shared-rev', key: SECRET}}});
    const handler = createHandler({
        createClient: () => ({
            auth: {getUser: async () => ({data: {user: {id: USER}}})},
            from: () => ({select: () => ({eq: () => ({maybeSingle: async () => ({data: {role: 'user', status: 'active'}})})})}),
            rpc: async (name, args) => name === 'kgpt_ai_consume_rate' ? {data: true} : {data: {gemini: {id: 'shared-rev', key: SECRET}}},
        }),
        env: n => ({SUPABASE_URL: 'https://t.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's'})[n],
        fetchImpl: async (url, init) => { calls.push(init.headers['x-goog-api-key']); return new Response(JSON.stringify({candidates: [{content: {parts: [{text: '{"ok":1}'}]}, finishReason: 'STOP'}]}), {status: 200, headers: {'Content-Type': 'application/json'}}); },
    });
    const res = await handler(new Request('https://t.supabase.co/functions/v1/kgpt-ai', {method: 'POST', headers: {Origin: origin, Authorization: 'Bearer tok', 'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'generate', provider: 'gemini', model: 'gemini-3.8-flash', parts: [{text: 'x'}]})}));
    assert.equal(res.status, 200); assert.deepEqual(calls, [SECRET]);
    assert.ok(!(await res.text()).includes(SECRET));
    void app;
});
