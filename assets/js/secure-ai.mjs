// Browser code receives only credential metadata. Provider keys never come back from the server.
export function createSecureAiClient({supabase,getOwner}) {
    async function request(body, {signal} = {}) {
        const owner = getOwner();
        if (!owner || owner === 'guest') throw new Error('Vui lòng đăng nhập để sử dụng AI.');
        if (signal?.aborted) throw new DOMException('Đã hủy xử lý AI.','AbortError');
        const {data:sessionData,error:sessionError} = await supabase.auth.getSession();
        if (signal?.aborted || owner !== getOwner()) throw new DOMException('Tài khoản hoặc yêu cầu đã thay đổi.','AbortError');
        if (sessionError || sessionData?.session?.user?.id !== owner || !sessionData.session.access_token) throw new Error('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
        const {data,error} = await supabase.functions.invoke('kgpt-ai',{body,signal,headers:{Authorization:'Bearer '+sessionData.session.access_token}});
        if (signal?.aborted || owner !== getOwner()) throw new DOMException('Tài khoản hoặc yêu cầu đã thay đổi.','AbortError');
        if (error) {
            let details;
            try { details = await error.context?.json(); } catch (_) {}
            const failure = new Error(details?.error || 'Không kết nối được backend AI. Hãy thử lại sau.');
            failure.status = error.context?.status || 0;
            failure.code = details?.code;
            failure.attempts = details?.attempts || [];
            throw failure;
        }
        return data;
    }
    return {
        read: targetUserId => request({action:'settings',...(targetUserId?{targetUserId}:{})}),
        list: () => request({action:'list'}),
        save: (targetUserId,settings,keys={},clear=[],options={}) => request({action:'save',targetUserId,settings,keys,clear,onlyIfMissing:options.onlyIfMissing === true}),
        generate: (parts,config,options={}) => request({action:'generate',provider:options.provider,model:options.model,
            preferredSlot:options.preferredSlot,parts,config},{signal:options.signal}),
        ocr: (file,language,engine,options={}) => {
            const form = new FormData();
            form.append('file',file,file.name || 'quote');
            form.append('language',language);
            form.append('OCREngine',engine);
            return request(form,options);
        },
    };
}

export const LEGACY_KEY_NAMES = ['tascoGroqKey','tascoGroqKey2','tascoGroqKey3','tascoGeminiQuoteKey','tascoOcrSpaceQuoteKey'];
const credentialNames = ['groq1','groq2','groq3','gemini','ocrspace'];

// Delete old local values only after the server acknowledges this account's upload.
// Never overwrite an already stored server key with an old browser copy.
export async function migrateLegacyKeys({storage,owner,credentials,save,isCurrent}) {
    const keys = {}, entries = [];
    LEGACY_KEY_NAMES.forEach((base,index) => {
        const storageKey = `${base}__${owner}`;
        const value = storage.getItem(storageKey);
        if (!value) return;
        entries.push([storageKey,value]);
        if (!credentials[credentialNames[index]]) keys[credentialNames[index]] = value.trim();
    });
    if (!entries.length) return null;
    if (!isCurrent()) throw new DOMException('Tài khoản đã thay đổi.','AbortError');
    const result = Object.keys(keys).length ? await save(keys) : null;
    if (!isCurrent()) throw new DOMException('Tài khoản đã thay đổi.','AbortError');
    // Preserve newer edits from another tab while migration was in flight.
    for (const [name,value] of entries) if (storage.getItem(name) === value) storage.removeItem(name);
    return result;
}
