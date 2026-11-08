const MAX_BODY = 20 * 1024 * 1024;
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];
const KEY_NAMES = ['gemini', 'groq1', 'groq2', 'groq3', 'ocrspace'];
const MAX_GEMINI_KEYS = 10;
const allKeys = value => [...new Set(String(value || '').split(/[\n,;]+/).map(k => k.trim()).filter(Boolean))];
const splitKeys = value => allKeys(value).slice(0, MAX_GEMINI_KEYS);
const RATE_HEADERS = ['retry-after', 'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests',
  'x-ratelimit-reset-requests', 'x-ratelimit-limit-tokens', 'x-ratelimit-remaining-tokens', 'x-ratelimit-reset-tokens'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

class HttpError extends Error {
  constructor(status, code, message, extra = {}) { super(message); Object.assign(this, { status, code, ...extra }); }
}
const invalid = () => new HttpError(400, 'INVALID_INPUT', 'Dữ liệu gửi lên không hợp lệ hoặc vượt giới hạn.');

export function validateGenerate(body) {
  if (!['gemini', 'groq'].includes(body.provider) || !Array.isArray(body.parts) || !body.parts.length || body.parts.length > 30) throw invalid();
  for (const part of body.parts) {
    if (!object(part)) throw invalid();
    if (typeof part.text === 'string' && Object.keys(part).length === 1) {
      if (part.text.length > 500000) throw invalid();
    } else {
      const binary = part.inline_data || part.inlineData;
      if (body.provider !== 'gemini' || Object.keys(part).length !== 1 || !object(binary)
        || !['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'].includes(binary.mime_type || binary.mimeType)
        || typeof binary.data !== 'string' || binary.data.length > 18 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(binary.data)) throw invalid();
    }
  }
  if (body.provider === 'gemini' && !GEMINI_MODELS.includes(body.model)) throw invalid();
  if (body.preferredSlot !== undefined && !['1','2','3'].includes(String(body.preferredSlot))) throw invalid();
  const config = body.config ?? {};
  if (!object(config)) throw invalid();
  const output = Number(config.maxOutputTokens ?? 4096);
  const temperature = Number(config.temperature ?? 0.1);
  if (!Number.isFinite(output) || output < 1 || output > 8192 || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw invalid();
  if (config.responseMimeType !== undefined && !['application/json','text/plain'].includes(config.responseMimeType)) throw invalid();
  return { maxOutputTokens: Math.floor(output), temperature, ...(config.responseMimeType ? { responseMimeType: config.responseMimeType } : {}) };
}

function validateSave(body) {
  if (!object(body.keys ?? {}) || !object(body.settings ?? {}) || !Array.isArray(body.clear ?? [])) throw invalid();
  if (Object.entries(body.keys ?? {}).some(([name,key]) => !KEY_NAMES.includes(name) || typeof key !== 'string' || key.trim().length < 8 || key.length > 8192)) throw invalid();
  if ((body.clear ?? []).length > 5 || (body.clear ?? []).some(name => !KEY_NAMES.includes(name))) throw invalid();
  if (body.targetUserId !== undefined && !uuid(body.targetUserId)) throw invalid();
  if (body.onlyIfMissing !== undefined && typeof body.onlyIfMissing !== 'boolean') throw invalid();
  if (body.appendKeys !== undefined && (!Array.isArray(body.appendKeys) || body.appendKeys.some(name => name !== 'gemini'))) throw invalid();
  if (typeof body.keys?.gemini === 'string' && (allKeys(body.keys.gemini).length > MAX_GEMINI_KEYS || allKeys(body.keys.gemini).some(key => key.length < 8))) throw invalid();
  const allowed = {
    ocrProvider: v => ['gemini','ocrspace'].includes(v), llmProvider: v => ['gemini','groq'].includes(v),
    ocrLanguage: v => typeof v === 'string' && /^[a-z]{3}$/.test(v), ocrEngine: v => ['1','2','3'].includes(v),
    groqActiveKey: v => ['1','2','3'].includes(v), allowSelfEdit: v => typeof v === 'boolean',
  };
  if (Object.entries(body.settings ?? {}).some(([name,value]) => !allowed[name]?.(value))) throw invalid();
}

// Key dùng chung: chỉ admin gọi (handler kiểm tra role, RPC kiểm tra lại). Dùng cùng quy tắc kiểm tra key như key riêng.
function validateSharedSave(body) {
  const keys = body.keys ?? {}, clear = body.clear ?? [];
  if (!object(keys) || !Array.isArray(clear) || clear.length > 5 || clear.some(name => !KEY_NAMES.includes(name))) throw invalid();
  if (Object.entries(keys).some(([name,key]) => !KEY_NAMES.includes(name) || typeof key !== 'string' || key.trim().length < 8 || key.length > 8192)) throw invalid();
  if (body.appendKeys !== undefined && (!Array.isArray(body.appendKeys) || body.appendKeys.some(name => name !== 'gemini'))) throw invalid();
  if (typeof keys.gemini === 'string' && allKeys(keys.gemini).some(key => key.length < 8)) throw invalid();
  if (typeof keys.gemini === 'string' && allKeys(keys.gemini).length > MAX_GEMINI_KEYS) throw new HttpError(400,'TOO_MANY_KEYS','Tối đa ' + MAX_GEMINI_KEYS + ' key Gemini.');
  if (!Object.keys(keys).length && !clear.length) throw invalid();
}
function validateGrant(body) {
  const targets = body.targetUserIds;
  if (!Array.isArray(targets) || !targets.length || targets.length > 1000 || !targets.every(uuid) || typeof body.allow !== 'boolean') throw invalid();
  return [...new Set(targets)];
}

const FP = /^[0-9a-f]{8}$/;
function validateSharedTarget(body, required) {
  if (body.name === undefined && body.fp === undefined && !required) return {};
  if (!KEY_NAMES.includes(body.name) || (body.fp !== undefined && !FP.test(body.fp)) || (required && body.fp === undefined)) throw invalid();
  return { name: body.name, ...(body.fp !== undefined ? { fp: body.fp } : {}) };
}

// Kiểm tra tình trạng một key dùng chung bằng lệnh liệt kê model (không tốn lượt tạo nội dung). Không bao giờ trả key hay nội dung lỗi của nhà cung cấp.
async function checkSharedKey(fetchImpl, item, signal, ctx) {
  const { cooldowns, now } = ctx;
  const base = { name: item.name, no: item.no, fp: item.fp, checkedAt: new Date(now()).toISOString() };
  if (item.name === 'ocrspace') return { ...base, status: 'unsupported', message: 'OCR.Space không có cách kiểm tra miễn phí; key được thử khi dùng thật.' };
  const groq = item.name.startsWith('groq');
  try {
    const response = await upstream(fetchImpl, groq ? 'https://api.groq.com/openai/v1/models' : 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
      { method: 'GET', headers: groq ? { Authorization: `Bearer ${item.key}` } : { 'x-goog-api-key': item.key } }, signal);
    await response.arrayBuffer().catch(() => null);
    const fp = await fingerprint(item.key);
    const waits = {};
    if (!groq) for (const model of GEMINI_MODELS) {
      const left = Math.ceil((Math.max(cooldowns.get(fp + '|' + model) || 0, cooldowns.get(fp + '|*') || 0) - now()) / 1000);
      if (left > 0) waits[model] = left;
    }
    if (response.ok) return Object.keys(waits).length
      ? { ...base, status: 'limited', cooldowns: waits, message: 'Key hợp lệ nhưng đang tạm nghỉ vì hết lượt ở ít nhất một model.' }
      : { ...base, status: 'ok', message: 'Key hợp lệ.' };
    if ([400, 401, 403].includes(response.status)) return { ...base, status: 'invalid', message: 'Key không hợp lệ, đã bị thu hồi hoặc bị hạn chế.' };
    if (response.status === 429) return { ...base, status: 'limited', cooldowns: waits, message: 'Key đang bị giới hạn lượt dùng. Hãy thử lại sau.' };
    return { ...base, status: 'error', message: 'Nhà cung cấp tạm thời chưa phản hồi đúng. Hãy kiểm tra lại sau.' };
  } catch (_) {
    return { ...base, status: 'error', message: 'Không kết nối được nhà cung cấp. Hãy kiểm tra lại sau.' };
  }
}

async function readBounded(req) {
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY) throw new HttpError(413, 'BODY_TOO_LARGE', 'Dữ liệu quá lớn. Hãy chia nhỏ file.');
  if (!req.body) throw invalid();
  const reader = req.body.getReader(), chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BODY) { await reader.cancel(); throw new HttpError(413, 'BODY_TOO_LARGE', 'Dữ liệu quá lớn. Hãy chia nhỏ file.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return bytes;
}

function providerFailure(status, provider, attempts, extra = {}) {
  const label = provider === 'groq' ? 'Groq' : provider === 'gemini' ? 'Gemini' : 'OCR.Space';
  const message = [401,403].includes(status) ? `${label} key không hợp lệ hoặc chưa được cấp quyền. Hãy thay key trong Cài đặt AI.`
    : status === 429 ? (extra.keyCount > 1 ? `Cả ${extra.keyCount} key ${label} đều đang hết lượt${extra.daily ? ' trong ngày' : ''}. ${extra.retryAfter ? 'Thử lại sau khoảng ' + (extra.retryAfter >= 3600 ? Math.ceil(extra.retryAfter / 3600) + ' giờ' : extra.retryAfter >= 90 ? Math.ceil(extra.retryAfter / 60) + ' phút' : extra.retryAfter + ' giây') + ', hoặc thêm key từ dự án Google khác.' : 'Hãy đợi rồi thử lại hoặc thêm key từ dự án Google khác.'}` : `${label} đang giới hạn lượt dùng. Hãy đợi rồi thử lại.`)
    : status === 404 ? `${label} chưa hỗ trợ model đã chọn. Hãy kiểm tra model trong Cài đặt AI.`
    : status === 413 ? 'Dữ liệu vượt giới hạn nhà cung cấp. Hãy chia nhỏ file.'
    : `${label} chưa xử lý được yêu cầu. Hãy thử lại sau hoặc chia nhỏ dữ liệu.`;
  // Provider authentication failures must not be confused with app-session failures.
  return new HttpError(status === 429 ? 429 : 502, 'PROVIDER_ERROR', message, { attempts, providerStatus: status, ...(extra.retryAfter ? { retryAfter: extra.retryAfter } : {}) });
}

async function upstream(fetchImpl, url, init, signal) {
  try {
    return await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(75000)]) });
  } catch (_) {
    throw new HttpError(504, 'PROVIDER_UNAVAILABLE', 'Không kết nối được dịch vụ AI hoặc xử lý quá thời gian. Hãy thử lại.');
  }
}

// Gemini free tier tính hạn mức theo dự án Google Cloud và theo từng model: key hết lượt ở model này vẫn có thể dùng model khác,
// và key của dự án khác có hạn mức riêng. Bộ nhớ tạm này chỉ sống trong một instance Edge Function (không lưu key, chỉ dấu vân tay).
const toHex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
async function fingerprint(key) { return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))).slice(0, 16); }
// Số giây đến 00:00 giờ Thái Bình Dương (lúc Google reset hạn mức ngày).
export function secondsUntilPacificMidnight(nowMs) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(nowMs)).map(p => [p.type, p.value]));
  const passed = (Number(parts.hour) % 24) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  return Math.max(60, 86400 - passed);
}
function readRateLimit(response, data, nowMs) {
  const text = JSON.stringify(data?.error ?? {}).slice(0, 4000);
  const daily = /PerDay|per day|daily/i.test(text);
  let seconds = Number(response.headers.get('retry-after'));
  if (!Number.isFinite(seconds) || seconds <= 0) {
    const match = /retry(?:Delay"?:?\s*"?| in )\s*([0-9.]+)\s*s/i.exec(text);
    seconds = match ? Math.ceil(Number(match[1])) : 0;
  }
  if (daily) seconds = secondsUntilPacificMidnight(nowMs);
  else seconds = Math.min(Math.max(seconds || 65, 5), 600);
  return { daily, seconds };
}

async function generate(fetchImpl, body, credentials, signal, ctx) {
  const { cooldowns, random, now } = ctx;
  const config = validateGenerate(body), attempts = [];
  const names = body.provider === 'groq' ? [1,2,3].map(n => 'groq' + n) : ['gemini'];
  if (body.provider === 'groq') {
    const start = Math.max(0,names.indexOf('groq' + (body.preferredSlot || '1')));
    names.push(...names.splice(0,start));
  }
  const unique = new Set();
  let keys = [];
  for (const name of names) {
    const credential = credentials[name];
    if (!credential?.key) continue;
    const values = name === 'gemini' ? splitKeys(credential.key) : [credential.key];
    for (const key of values) if (!unique.has(key)) { unique.add(key); keys.push({ name, key, id: credential.id }); }
  }
  if (!keys.length) throw new HttpError(409,'KEY_NOT_CONFIGURED','Tài khoản chưa được cấp key AI. Hãy liên hệ quản trị viên để được cấp quyền dùng key dùng chung.');
  for (const [index, credential] of keys.entries()) { credential.no = index + 1; credential.fp = await fingerprint(credential.key); }
  // Trải đều tải: mỗi yêu cầu Gemini bắt đầu từ một key khác nhau thay vì luôn dồn vào key đầu.
  if (body.provider === 'gemini' && keys.length > 1) { const start = Math.floor(random() * keys.length) % keys.length; keys = [...keys.slice(start), ...keys.slice(0, start)]; }
  const models = body.provider === 'groq' ? ['openai/gpt-oss-120b'] : [body.model, ...GEMINI_MODELS.filter(m => m !== body.model)];
  let lastStatus = 502, tried = 0, daily = false, soonest = Infinity;
  const deadline = now() + 120000;
  const coolUntil = (credential, model) => Math.max(cooldowns.get(credential.fp + '|' + model) || 0, cooldowns.get(credential.fp + '|*') || 0);
  // Model là vòng ngoài: dùng hết key cho model ưu tiên rồi mới hạ xuống model dự phòng (hạn mức tính theo model).
  for (const model of models) {
    for (const credential of keys) {
      if (now() > deadline) throw providerFailure(503,body.provider,attempts);
      const until = coolUntil(credential, model);
      if (until > now()) { soonest = Math.min(soonest, until); continue; }
      tried++;
      const groq = body.provider === 'groq';
      const url = groq ? 'https://api.groq.com/openai/v1/chat/completions'
        : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const payload = groq ? {
        model, messages: [
          { role:'system',content:'Trả lời bằng tiếng Việt. Chỉ dùng dữ liệu được cung cấp; không bịa mã phụ tùng, giá hoặc độ tương thích. Khi được yêu cầu JSON, trả một JSON object hợp lệ.' },
          { role:'user',content:body.parts.map(p => p.text).join('\n\n') },
        ], reasoning_effort:'low', temperature:config.temperature, max_completion_tokens:config.maxOutputTokens,
        ...(config.responseMimeType === 'application/json' ? { response_format:{type:'json_object'} } : {}),
      } : { contents:[{role:'user',parts:body.parts}], generationConfig:{...config,temperature:1} };
      const response = await upstream(fetchImpl,url,{
        method:'POST',headers:{'Content-Type':'application/json',...(groq ? {Authorization:`Bearer ${credential.key}`} : {'x-goog-api-key':credential.key})},
        body:JSON.stringify(payload),
      },signal);
      const data = await response.json().catch(() => ({}));
      const headers = Object.fromEntries(RATE_HEADERS.map(h => [h,response.headers.get(h)])
        .filter(([,v]) => v !== null && v.length <= 64 && /^[0-9.msdh]+$/.test(v)));
      const usage = groq ? data.usage : undefined;
      const safeUsage = usage && object(usage) ? Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens'].filter(k => Number.isFinite(usage[k])).map(k => [k,usage[k]])) : undefined;
      if (safeUsage && Number.isFinite(usage.prompt_tokens_details?.cached_tokens)) safeUsage.prompt_tokens_details = {cached_tokens:usage.prompt_tokens_details.cached_tokens};
      attempts.push({keyId:credential.id,slot:credential.name,...(groq ? {} : {keyNo:credential.no,model}),status:response.status,headers,usage:safeUsage});
      if (!response.ok) {
        lastStatus = response.status;
        if (response.status === 429) {
          const limit = readRateLimit(response, data, now());
          daily = daily || limit.daily;
          cooldowns.set(credential.fp + '|' + model, now() + limit.seconds * 1000);
          soonest = Math.min(soonest, now() + limit.seconds * 1000);
          continue; // key khác (hoặc model khác) có thể còn lượt
        }
        if ([401,403].includes(response.status)) { cooldowns.set(credential.fp + '|*', now() + 600000); continue; }
        if (!groq && [404,408,500,502,503,504].includes(response.status)) break; // lỗi của model/dịch vụ: thử model dự phòng
        throw providerFailure(response.status,body.provider,attempts);
      }
      const finish = groq ? data.choices?.[0]?.finish_reason : data.candidates?.[0]?.finishReason;
      if (finish === 'length' || finish === 'MAX_TOKENS') throw new HttpError(502,'OUTPUT_TRUNCATED','AI trả kết quả chưa đầy đủ. Hãy chia nhỏ dữ liệu.',{attempts});
      const output = groq ? data.choices?.[0]?.message?.content : data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n');
      if (typeof output !== 'string' || !output.trim()) throw new HttpError(502,'EMPTY_OUTPUT','AI chưa trả nội dung. Hãy thử lại.',{attempts});
      return {output,model,provider:body.provider,slot:credential.name,...(body.provider === 'gemini' ? {keyNo:credential.no,keyCount:keys.length} : {}),attempts};
    }
  }
  // Không gọi nhà cung cấp lần nào vì mọi key đang trong thời gian chờ: báo ngay, không gọi dồn.
  if (!tried) lastStatus = 429;
  const retryAfter = Number.isFinite(soonest) ? Math.max(1, Math.ceil((soonest - now()) / 1000)) : 0;
  throw providerFailure(lastStatus,body.provider,attempts,{ keyCount: keys.length, daily, retryAfter: lastStatus === 429 ? retryAfter : 0 });
}

export function createHandler({createClient,env,fetchImpl=globalThis.fetch,random=Math.random,now=Date.now}) {
  const cooldowns = new Map();
  return async req => {
    const origin = req.headers.get('origin');
    const allowed = (env('ALLOWED_ORIGINS') || 'https://huyho711997-lgtm.github.io,https://tra-cuu-phu-tung-pro.vercel.app').split(',').map(s => s.trim()).filter(Boolean);
    const cors = {Vary:'Origin','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods':'POST, OPTIONS',...(origin && allowed.includes(origin) ? {'Access-Control-Allow-Origin':origin} : {})};
    const reply = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    if (origin && !allowed.includes(origin)) return reply({error:'Nguồn truy cập không được hỗ trợ.',code:'ORIGIN_DENIED'},403);
    if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
    if (req.method !== 'POST') return reply({error:'Chỉ hỗ trợ POST.',code:'METHOD_NOT_ALLOWED'},405);
    try {
      const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
      if (!token) throw new HttpError(401,'UNAUTHENTICATED','Vui lòng đăng nhập lại.');
      const url = env('SUPABASE_URL'), serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
      if (!url || !serviceKey) throw new HttpError(503,'NOT_CONFIGURED','Backend chưa được cấu hình.');
      const service = createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
      const {data:auth,error:authError} = await service.auth.getUser(token);
      if (authError || !uuid(auth?.user?.id)) throw new HttpError(401,'UNAUTHENTICATED','Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
      const actor = auth.user.id;
      const {data:profile,error:profileError} = await service.from('user_profiles').select('role,status').eq('id',actor).maybeSingle();
      if (profileError || profile?.status !== 'active') throw new HttpError(403,'ACCESS_DENIED','Tài khoản chưa được cấp quyền hoặc đã bị khóa.');
      const rpc = async (name,args) => {
        const {data,error} = await service.rpc(name,args);
        if (error) {
          if (error.code === '42501') throw new HttpError(403,'ACCESS_DENIED','Bạn không có quyền thay đổi cấu hình này.');
          if (/AI_TOO_MANY_KEYS/.test(error.message || '')) throw new HttpError(400,'TOO_MANY_KEYS','Tối đa ' + MAX_GEMINI_KEYS + ' key Gemini. Hãy xóa bớt key cũ trước khi thêm.');
          if (/AI_KEY_NOT_FOUND/.test(error.message || '')) throw new HttpError(409,'KEY_NOT_FOUND','Key này không còn trong kho. Hãy tải lại danh sách.');
          if (/AI_INVALID/.test(error.message || '')) throw invalid();
          throw new HttpError(503,'STORAGE_UNAVAILABLE','Không truy cập được kho key. Hãy thử lại sau.');
        }
        return data;
      };
      const bytes = await readBounded(req);
      let body, form;
      const type = req.headers.get('content-type') || '';
      if (type.startsWith('multipart/form-data')) {
        try { form = await new Response(bytes,{headers:{'Content-Type':type}}).formData(); } catch (_) { throw invalid(); }
        body = {action:'ocr'};
      } else if (type.startsWith('application/json')) {
        try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch (_) { throw invalid(); }
      } else throw invalid();
      if (!object(body) || !['settings','save','list','generate','ocr','shared','sharedSave','grant','sharedCheck','sharedRemove'].includes(body.action)) throw invalid();
      const ai = ['generate','ocr'].includes(body.action);
      if (body.action === 'list' && profile.role !== 'admin') throw new HttpError(403,'ACCESS_DENIED','Chỉ quản trị viên được xem danh sách cấu hình.');
      if (['shared','sharedSave','grant','sharedCheck','sharedRemove'].includes(body.action) && profile.role !== 'admin') throw new HttpError(403,'ACCESS_DENIED','Chỉ quản trị viên được quản lý key dùng chung.');
      if (!await rpc('kgpt_ai_consume_rate',{p_user_id:actor,p_category:ai?'ai':'settings'})) throw new HttpError(429,'APP_RATE_LIMIT','Bạn thao tác quá nhanh hoặc đã hết hạn mức ngày của ứng dụng. Hãy thử lại sau.');
      if (body.action === 'shared') return reply(await rpc('kgpt_ai_shared_read',{p_actor:actor}));
      if (body.action === 'sharedSave') {
        validateSharedSave(body);
        // Việc gộp key (append) và giới hạn 10 key làm ngay trong CSDL: key cũ không rời khỏi Vault.
        return reply(await rpc('kgpt_ai_shared_save',{p_actor:actor,p_keys:body.keys || {},p_clear:body.clear || [],p_append:body.appendKeys || []}));
      }
      if (body.action === 'sharedRemove') {
        const target = validateSharedTarget(body, true);
        if (target.name !== 'gemini') throw invalid();
        return reply(await rpc('kgpt_ai_shared_remove_key',{p_actor:actor,p_name:target.name,p_fp:target.fp}));
      }
      if (body.action === 'sharedCheck') {
        const target = validateSharedTarget(body, false);
        const items = (await rpc('kgpt_ai_shared_secrets',{p_actor:actor}) || []).filter(item => (!target.name || item.name === target.name) && (!target.fp || item.fp === target.fp)).slice(0,15);
        if (target.fp && !items.length) throw new HttpError(409,'KEY_NOT_FOUND','Key này không còn trong kho. Hãy tải lại danh sách.');
        const signal = AbortSignal.any([req.signal,AbortSignal.timeout(60000)]);
        return reply({results: await Promise.all(items.map(item => checkSharedKey(fetchImpl,item,signal,{cooldowns,now})))});
      }
      if (body.action === 'grant') return reply(await rpc('kgpt_ai_shared_grant',{p_actor:actor,p_targets:validateGrant(body),p_allow:body.allow}));
      if (body.action === 'settings' || body.action === 'list') {
        if (body.targetUserId !== undefined && !uuid(body.targetUserId)) throw invalid();
        return reply(await rpc('kgpt_ai_settings_read',{p_actor:actor,p_target:body.targetUserId || actor,p_list:body.action==='list'}));
      }
      if (body.action === 'save') {
        validateSave(body);
        const target = body.targetUserId || actor;
        let keys = body.keys || {};
        // "Thêm key": gộp key Gemini mới vào các key đã lưu (tối đa 10) thay vì ghi đè. Chỉ đọc key của chính mình hoặc khi là quản trị viên;
        // quyền ghi vẫn do RPC lưu kiểm tra. Key cũ không bao giờ được trả về trình duyệt.
        if (body.appendKeys?.includes('gemini') && typeof keys.gemini === 'string') {
          if (target !== actor && profile.role !== 'admin') throw new HttpError(403,'ACCESS_DENIED','Bạn không có quyền thay đổi cấu hình này.');
          const current = (await rpc('kgpt_ai_credentials',{p_user_id:target}))?.gemini?.key || '';
          const merged = allKeys([current, keys.gemini].join('\n'));
          if (merged.length > MAX_GEMINI_KEYS) throw new HttpError(400,'TOO_MANY_KEYS','Tối đa ' + MAX_GEMINI_KEYS + ' key Gemini. Hãy xóa bớt key cũ trước khi thêm.');
          keys = { ...keys, gemini: merged.join('\n') };
        }
        return reply(await rpc('kgpt_ai_settings_save',{p_actor:actor,p_target:target,p_settings:body.settings || {},p_keys:keys,p_clear:body.clear || [],p_only_missing:body.onlyIfMissing === true}));
      }
      if (body.action === 'generate') validateGenerate(body);
      const credentials = await rpc('kgpt_ai_credentials',{p_user_id:actor});
      if (body.action === 'generate') {
        if (cooldowns.size > 500) for (const [name,until] of cooldowns) if (until <= now()) cooldowns.delete(name);
        return reply(await generate(fetchImpl,body,credentials,AbortSignal.any([req.signal,AbortSignal.timeout(120000)]),{cooldowns,random,now}));
      }
      const file = form?.get('file');
      const language = String(form?.get('language') || 'vnm'), engine = String(form?.get('OCREngine') || '2');
      if (!(file instanceof Blob) || !file.size || file.size > 12*1024*1024
        || !['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)
        || !/^[a-z]{3}$/.test(language) || !['1','2','3'].includes(engine)) throw invalid();
      if (!credentials.ocrspace?.key) throw new HttpError(409,'KEY_NOT_CONFIGURED','Chưa lưu OCR.Space key. Mở Cài đặt AI để cấu hình.');
      const payload = new FormData();
      payload.append('file',file,'quote' + (file.type==='application/pdf'?'.pdf':'.png'));
      for (const [k,v] of Object.entries({language,OCREngine:engine,isOverlayRequired:'false',isTable:'true',scale:'true',detectOrientation:'true',isCreateSearchablePdf:'false'})) payload.append(k,v);
      const response = await upstream(fetchImpl,'https://api.ocr.space/parse/image',{method:'POST',headers:{apikey:credentials.ocrspace.key},body:payload},req.signal);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.IsErroredOnProcessing) throw providerFailure(response.ok?502:response.status,'ocrspace',[]);
      const text = (data.ParsedResults || []).map(p => p.ParsedText || '').filter(Boolean).join('\n\n--- PAGE BREAK ---\n\n').trim();
      if (!text) throw new HttpError(502,'EMPTY_OCR','OCR.Space không đọc được chữ. Hãy dùng file rõ nét hơn.');
      return reply({text,engine,language});
    } catch (error) {
      if (error instanceof HttpError) return reply({error:error.message,code:error.code,...(error.attempts?{attempts:error.attempts}:{}),...(error.providerStatus?{providerStatus:error.providerStatus}:{}),...(error.retryAfter?{retryAfter:error.retryAfter}:{})},error.status);
      // Never log request bodies, provider errors, credentials, or SDK error objects.
      return reply({error:'Backend chưa xử lý được yêu cầu. Hãy thử lại sau.',code:'INTERNAL_ERROR'},500);
    }
  };
}
