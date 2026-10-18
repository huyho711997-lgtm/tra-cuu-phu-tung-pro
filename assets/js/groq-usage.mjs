export const GROQ_FREE_LIMITS = Object.freeze({ requestMinute: 30, requestDay: 1000, tokenMinute: 8000, tokenDay: 200000 });
const DAY = 86400000;
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
const dayOf = timestamp => new Date(timestamp).toISOString().slice(0, 10);

export function parseGroqReset(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const text = value.trim();
    if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text) * 1000;
    if (!/^(?:\d+(?:\.\d+)?(?:ms|d|h|m|s))+$/.test(text)) return null;
    const units = { d: DAY, h: 3600000, m: 60000, s: 1000, ms: 1 };
    return [...text.matchAll(/(\d+(?:\.\d+)?)(ms|d|h|m|s)/g)].reduce((sum, match) => sum + Number(match[1]) * units[match[2]], 0);
}

function readRate(headers, kind, at) {
    const read = name => { try { return headers?.get(name); } catch (_) { return null; } };
    const limitText = read(`x-ratelimit-limit-${kind}`), remainingText = read(`x-ratelimit-remaining-${kind}`);
    if (!/^\d+$/.test(limitText || '') || !/^\d+$/.test(remainingText || '')) return null;
    const limit = Number(limitText), remaining = Number(remainingText);
    if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(remaining) || remaining > limit) return null;
    const reset = parseGroqReset(read(`x-ratelimit-reset-${kind}`));
    // Without a reset header, show the observation for at most one minute.
    return { limit, remaining, at, resetAt: at + (reset ?? 60000) };
}

export function groqQuotaTokens(usage) {
    if (!usage || typeof usage !== 'object') return null;
    const prompt = number(usage.prompt_tokens), completion = number(usage.completion_tokens);
    const total = number(usage.total_tokens) ?? (prompt !== null && completion !== null ? prompt + completion : null);
    if (total === null) return null;
    const cached = Math.min(number(usage.prompt_tokens_details?.cached_tokens) ?? 0, prompt ?? total);
    // Completion tokens already include reasoning tokens. Cached input is exempt from rate limits.
    return { total, cached, quota: Math.max(0, total - cached) };
}

// Each request has its own storage entry so simultaneous tabs never overwrite one shared counter.
// Persist only counts/timestamps: never the API key, prompt, result, or vehicle data.
export async function createGroqUsageTracker({ ownerId, apiKey, storage, now = Date.now, randomId } = {}) {
    let fingerprint;
    try {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey || ''));
        fingerprint = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
    } catch (_) {
        // A browser without Web Crypto can still track this tab without persisting a weak key hash.
        fingerprint = Math.random().toString(36).slice(2);
        storage = null;
    }
    if (storage === undefined) { try { storage = globalThis.localStorage; } catch (_) { storage = null; } }
    const prefix = `tascoGroqUsage_v1__${encodeURIComponent(ownerId || 'guest')}__${fingerprint}__`;
    const memory = new Map();
    const id = randomId || (() => globalThis.crypto?.randomUUID?.() || `${now()}-${Math.random().toString(36).slice(2)}`);
    function save(event) {
        memory.set(event.id, event);
        try { storage?.setItem(prefix + event.id, JSON.stringify(event)); } catch (_) {}
    }
    function records(at) {
        const merged = new Map(memory), stale = [];
        try {
            const keys = Array.from({ length: storage?.length || 0 }, (_, index) => storage.key(index)).filter(key => key?.startsWith(prefix));
            keys.forEach(key => {
                try {
                    const entry = JSON.parse(storage.getItem(key));
                    if (!entry || typeof entry.id !== 'string' || key !== prefix + entry.id || number(entry.at) === null || entry.at > at) return;
                    if (at - entry.at > 2 * DAY) { stale.push(key); return; }
                    const existing = merged.get(entry.id);
                    if (!existing || entry.updatedAt > existing.updatedAt) merged.set(entry.id, entry);
                } catch (_) {}
            });
            stale.forEach(key => storage.removeItem(key));
        } catch (_) {}
        return [...merged.values()].filter(event => {
            if (at - event.at > 2 * DAY) { memory.delete(event.id); return false; }
            return event.at <= at;
        });
    }
    return {
        prefix,
        start() {
            const requestId = id(), at = now();
            save({ id: requestId, at, updatedAt: at, completedAt: null, tokens: null, status: null, rates: {} });
            return requestId;
        },
        finish(requestId, { usage, headers, status } = {}) {
            const event = memory.get(requestId);
            if (!event) return;
            const at = now(), rates = { requestDay: readRate(headers, 'requests', at), tokenMinute: readRate(headers, 'tokens', at) };
            const retryMs = status === 429 ? Math.max(1000, parseGroqReset(headers?.get?.('retry-after')) ?? 60000,
                ...Object.values(rates).map(rate => rate?.remaining === 0 ? rate.resetAt - at : 0)) : null;
            save({ ...event, updatedAt: at, completedAt: at, tokens: groqQuotaTokens(usage), status,
                retryAt: status === 429 && retryMs !== null ? at + retryMs : null,
                rates });
        },
        snapshot() {
            const at = now(), events = records(at), today = dayOf(at);
            const requestMinute = events.filter(event => event.at > at - 60000);
            const requestDay = events.filter(event => dayOf(event.at) === today);
            const completedToday = events.filter(event => number(event.completedAt) !== null && dayOf(event.completedAt) === today);
            const tokenMinute = events.filter(event => number(event.completedAt) !== null && event.completedAt > at - 60000 && number(event.tokens?.quota) !== null);
            const nextDay = Date.parse(today + 'T00:00:00Z') + DAY;
            const local = (name, used, resetAt) => ({ limit: GROQ_FREE_LIMITS[name], used, remaining: Math.max(0, GROQ_FREE_LIMITS[name] - used), source: 'local', resetAt });
            const metric = (name, fallback) => {
                const latest = events.map(event => event.rates?.[name]).filter(rate => rate && number(rate.limit) !== null && number(rate.remaining) !== null && rate.remaining <= rate.limit && rate.at <= at && rate.resetAt > at)
                    .sort((a, b) => b.at - a.at)[0];
                return latest ? { ...latest, used: latest.limit - latest.remaining, source: 'groq' } : fallback;
            };
            const sum = list => list.reduce((total, event) => total + (number(event.tokens?.quota) ?? 0), 0);
            const knownToday = completedToday.filter(event => number(event.tokens?.quota) !== null);
            const latest = [...events].sort((a, b) => b.updatedAt - a.updatedAt)[0];
            return {
                requestMinute: local('requestMinute', requestMinute.length, requestMinute.length ? Math.min(...requestMinute.map(event => event.at + 60000)) : null),
                requestDay: metric('requestDay', local('requestDay', requestDay.length, nextDay)),
                tokenMinute: metric('tokenMinute', local('tokenMinute', sum(tokenMinute), tokenMinute.length ? Math.min(...tokenMinute.map(event => event.completedAt + 60000)) : null)),
                tokenDay: local('tokenDay', sum(knownToday), nextDay),
                hasRecords: events.length > 0,
                firstAt: events.length ? Math.min(...events.map(event => event.at)) : null,
                lastAt: latest?.updatedAt || null,
                lastTokens: latest?.tokens?.total ?? null,
                unknownTokens: requestDay.filter(event => !event.tokens).length,
                retryAt: Math.max(0, ...events.map(event => number(event.retryAt) ?? 0)) > at ? Math.max(...events.map(event => number(event.retryAt) ?? 0)) : null
            };
        }
    };
}

export function renderGroqUsagePanel(host, snapshot, { hasKey = true, now = Date.now() } = {}) {
    if (!host) return;
    const format = value => value.toLocaleString('vi-VN');
    const text = (element, value) => { if (element && element.textContent !== value) element.textContent = value; };
    const duration = ms => {
        const seconds = Math.max(0, Math.ceil(ms / 1000));
        return seconds >= 3600 ? `${Math.floor(seconds / 3600)} giờ ${Math.floor(seconds % 3600 / 60)} phút`
            : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    };
    host.querySelectorAll('[data-groq-metric]').forEach(card => {
        const name = card.dataset.groqMetric;
        const metric = snapshot?.[name] || { limit: GROQ_FREE_LIMITS[name], used: 0, remaining: GROQ_FREE_LIMITS[name], source: 'local' };
        const remote = metric.source === 'groq';
        text(card.querySelector('.groq-usage-value'), `${format(metric.used)} / ${format(metric.limit)}`);
        text(card.querySelector('.groq-usage-remaining'), !hasKey ? 'Chưa có API key' : `${remote ? 'Còn' : 'Ước tính còn'} ${format(metric.remaining)}`);
        text(card.querySelector('.groq-usage-source'), remote ? 'Từ phản hồi Groq' : 'Ghi nhận trên máy này');
        card.dataset.source = metric.source;
        const progress = card.querySelector('progress');
        if (progress) { progress.max = metric.limit || 1; progress.value = Math.min(metric.used, metric.limit); }
        const ratio = metric.limit ? metric.used / metric.limit : 0;
        card.dataset.level = ratio >= 1 ? 'full' : ratio >= .8 ? 'high' : 'normal';
        const label = remote ? 'Phục hồi sau khoảng ' : name.endsWith('Day') ? 'Ngày UTC mới sau ' : 'Giảm số đã dùng sau ';
        text(card.querySelector('.groq-usage-reset'), hasKey && metric.resetAt > now ? label + duration(metric.resetAt - now) : '');
    });
    text(host.querySelector('.groq-usage-updated'), snapshot?.lastAt ? 'Cập nhật ' + new Date(snapshot.lastAt).toLocaleTimeString('vi-VN') : 'Chưa có dữ liệu');
    text(host.querySelector('.groq-usage-last-call'), snapshot?.retryAt > now ? 'Có thể thử lại sau ' + duration(snapshot.retryAt - now)
        : snapshot?.lastTokens !== null && snapshot?.lastTokens !== undefined ? 'Lần gọi gần nhất: ' + format(snapshot.lastTokens) + ' token' : '');
    const notice = host.querySelector('.groq-usage-notice');
    text(notice, !hasKey ? 'Nhập Groq API key để bắt đầu ghi nhận sử dụng.'
        : snapshot?.retryAt > now ? 'Groq đang giới hạn tốc độ. Chờ hạn mức phục hồi rồi thử lại.'
        : snapshot?.unknownTokens ? 'Có lượt gọi chưa nhận được số token. Tổng token ghi nhận có thể chưa đầy đủ.'
        : snapshot?.hasRecords ? 'Số liệu được cập nhật sau mỗi lần gọi Groq.' : 'Chưa ghi nhận lượt gọi. Bảng sẽ cập nhật khi bạn dùng Groq.');
    if (notice) notice.dataset.warning = String(!!(snapshot?.retryAt > now || snapshot?.unknownTokens));
}
