// Compatibility adapter. All network calls go through the authenticated backend.
export const GROQ_MODEL = 'openai/gpt-oss-120b';
export async function generateGroqContent(parts,config = {},options = {}) {
    if (options.signal?.aborted) throw new DOMException('Đã hủy xử lý AI.','AbortError');
    if (!options.secureClient?.generate) throw new Error('Hãy dùng backend Supabase đã xác thực để gọi Groq.');
    return options.secureClient.generate(parts,config,{provider:'groq',preferredSlot:options.preferredSlot,signal:options.signal});
}
