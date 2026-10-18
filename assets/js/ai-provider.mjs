export const GROQ_MODEL = 'openai/gpt-oss-120b';

// One request per action: do not spend a free account's quota on automatic retries.
export async function generateGroqContent(parts, config = {}, options = {}) {
    const { apiKey, signal, timeoutMs = 60000, fetchImpl = globalThis.fetch } = options;
    if (signal?.aborted) throw new DOMException('Đã hủy xử lý AI.', 'AbortError');
    if (!apiKey?.trim()) throw new Error('Chưa có Groq API key. Mở Cài đặt AI để nhập key.');
    if (!Array.isArray(parts) || parts.some(part => typeof part.text !== 'string')) {
        throw new Error('Groq chỉ nhận văn bản. Hãy dùng OCR.Space lấy chữ từ ảnh/PDF trước.');
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
        const response = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
            signal: controller.signal,
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: 'Trả lời bằng tiếng Việt. Chỉ dùng dữ liệu được cung cấp; không bịa mã phụ tùng, giá hoặc độ tương thích. Khi được yêu cầu JSON, trả một JSON object hợp lệ.' },
                    { role: 'user', content: parts.map(part => part.text).join('\n\n') }
                ],
                reasoning_effort: 'low',
                temperature: config.temperature ?? 0.1,
                max_completion_tokens: Math.min(config.maxOutputTokens || 4096, 8192),
                ...(config.responseMimeType === 'application/json' ? { response_format: { type: 'json_object' } } : {})
            })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const messages = {
                400: 'Groq không nhận được yêu cầu hợp lệ hoặc dữ liệu quá dài. Hãy chia nhỏ nội dung.',
                401: 'Groq API key không hợp lệ. Kiểm tra lại key trong Cài đặt AI.',
                403: 'Tài khoản Groq chưa có quyền truy cập model này.',
                413: 'Dữ liệu vượt giới hạn Groq. Hãy chia nhỏ file hoặc danh sách phụ tùng.',
                429: 'Groq đã chạm hạn mức miễn phí hoặc giới hạn tốc độ. Chờ hạn mức phục hồi rồi thử lại.'
            };
            const error = new Error(messages[response.status] || `Groq tạm thời không xử lý được (HTTP ${response.status}). Hãy thử lại sau.`);
            error.status = response.status;
            error.retryAfter = response.headers?.get('retry-after') || null;
            throw error;
        }
        const choice = payload.choices?.[0];
        if (choice?.finish_reason === 'length') throw new Error('Groq trả kết quả chưa đầy đủ vì hết giới hạn đầu ra. Hãy chia nhỏ dữ liệu rồi thử lại.');
        const output = choice?.message?.content;
        if (typeof output !== 'string' || !output.trim()) throw new Error('Groq không trả về nội dung. Hãy thử lại.');
        return { output, model: GROQ_MODEL, provider: 'groq' };
    } catch (error) {
        if (signal?.aborted) throw new DOMException('Đã hủy xử lý AI.', 'AbortError');
        if (controller.signal.aborted) throw new Error('Groq xử lý quá thời gian. Hãy chia nhỏ dữ liệu hoặc thử lại.');
        if (error instanceof TypeError) throw new Error('Không kết nối được Groq. Hãy kiểm tra kết nối mạng và thử lại.');
        throw error;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
    }
}
