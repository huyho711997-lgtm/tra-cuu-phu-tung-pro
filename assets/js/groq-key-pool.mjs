import { generateGroqContent } from './ai-provider.mjs';
import { parseGroqReset } from './groq-usage.mjs';

export function createGroqKeyPool({ generate = generateGroqContent, now = Date.now } = {}) {
    const cooldowns = new Map();
    return {
        async generate(parts, config = {}, options = {}) {
            const { apiKeys = [], preferredKey, isCurrent = () => true, getRetryAt,
                onKeyChange, onRequest, onUsage, ...requestOptions } = options;
            const keys = [...new Set(apiKeys.slice(0, 3).map(key => String(key || '').trim()).filter(Boolean))];
            if (!keys.length) throw new Error('Chưa có Groq API key. Mở Cài đặt AI để nhập key.');
            const preferred = keys.indexOf(preferredKey);
            const ordered = preferred > 0 ? [...keys.slice(preferred), ...keys.slice(0, preferred)] : keys;
            const checkCurrent = () => {
                if (requestOptions.signal?.aborted || !isCurrent()) throw new DOMException('Đã hủy xử lý AI.', 'AbortError');
            };
            const notify = (callback, ...args) => { try { callback?.(...args); } catch (_) {} };
            let lastError, earliestRetry = Infinity;
            for (const apiKey of ordered) {
                checkCurrent();
                let savedRetry = 0;
                try { savedRetry = await getRetryAt?.(apiKey) || 0; } catch (_) {}
                checkCurrent();
                const retryAt = Math.max(cooldowns.get(apiKey) || 0, savedRetry);
                if (retryAt > now()) { earliestRetry = Math.min(earliestRetry, retryAt); continue; }
                let metadata;
                notify(onKeyChange, apiKey);
                try {
                    const result = await generate(parts, config, { ...requestOptions, apiKey,
                        onRequest() { notify(onRequest, apiKey); },
                        onUsage(value) { metadata = value; notify(onUsage, apiKey, value); }
                    });
                    checkCurrent();
                    return result;
                } catch (error) {
                    checkCurrent();
                    if (![401, 403, 429].includes(error.status)) throw error;
                    lastError = error;
                    if (error.status === 429) {
                        let delay = parseGroqReset(error.retryAfter) ?? 60000;
                        for (const kind of ['requests', 'tokens']) {
                            if (metadata?.headers?.get('x-ratelimit-remaining-' + kind) === '0') {
                                delay = Math.max(delay, parseGroqReset(metadata.headers.get('x-ratelimit-reset-' + kind)) ?? 0);
                            }
                        }
                        const until = now() + Math.max(1000, delay);
                        cooldowns.set(apiKey, until); earliestRetry = Math.min(earliestRetry, until);
                    }
                }
            }
            checkCurrent();
            if (Number.isFinite(earliestRetry)) {
                const error = new Error('Các key Groq còn lại đang chờ hạn mức phục hồi. Thử lại sau khoảng ' + Math.max(1, Math.ceil((earliestRetry - now()) / 1000)) + ' giây; kiểm tra từng key trong Cài đặt AI.');
                error.status = 429; error.retryAfter = String(Math.max(1, Math.ceil((earliestRetry - now()) / 1000)));
                throw error;
            }
            throw lastError;
        }
    };
}
