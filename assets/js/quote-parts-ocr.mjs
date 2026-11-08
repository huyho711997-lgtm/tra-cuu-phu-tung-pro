// OCR hạng mục từ ảnh/PDF báo giá sửa chữa: AI trả danh sách dòng, ở đây chỉ làm sạch và gộp vào ô "Tìm nhiều phụ tùng".
const MAX_NAME = 120;
const fold = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
// Dòng không phải phụ tùng cần thay (nhân công, tổng tiền, thuế...).
const NOT_PART = /^(tong|cong tho|cong sua|cong thao|nhan cong|tien cong|cong lap|thue|vat|chiet khau|giam gia|thanh tien|phi |dich vu|van chuyen)/;
const LABOR_KINDS = new Set(['cong', 'nhan_cong', 'son', 'khac', 'tong']);

export function buildQuotePartsAiPrompt() {
    return [
        'Bạn đọc ảnh/PDF báo giá sửa chữa ô tô (garage/gara Việt Nam). Liệt kê các dòng hạng mục trong bảng báo giá.',
        'Chỉ chép tên có trên giấy, không dịch, không đoán, không gộp, không tự thêm. Bỏ qua tiêu đề, thông tin khách hàng, biển số, tổng tiền, VAT.',
        'Trả về DUY NHẤT một JSON: {"items":[{"ten":"","loai":"phu_tung"}]}.',
        '- ten: tên hạng mục đúng như trên giấy, bỏ số thứ tự, đơn vị, số lượng, đơn giá, thành tiền.',
        '- loai: "phu_tung" nếu là phụ tùng/vật tư thay thế; "cong" nếu là nhân công/tiền công sửa, tháo lắp, gò; "son" nếu là sơn; "khac" nếu không rõ.',
        'Giữ nguyên thứ tự từ trên xuống dưới. Không bỏ sót dòng phụ tùng nào.'
    ].join('\n');
}

const cleanName = raw => String(raw ?? '').replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/^\s*(?:[-•*]|\(?\d{1,3}[.)]|\d{1,3}\s*[-–:])\s*/, '')      // số thứ tự
    .replace(/\s*[\(\[]\s*(?:x\s*)?\d+\s*(?:cái|chiếc|bộ|pcs|cai|chiec|bo)?\s*[\)\]]\s*$/i, '') // (2) cuối dòng
    .replace(/\s+/g, ' ').trim();

// existing: các tên đã có trong ô nhập; trả {items (tên mới được thêm), merged (toàn bộ danh sách), skipped:{labor,duplicate,invalid,overflow}}
export function mergeQuotePartItems(raw, existing = [], max = 20) {
    const list = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
    const merged = existing.slice(), seen = new Set(existing.map(fold));
    const skipped = {labor: 0, duplicate: 0, invalid: 0, overflow: 0}, items = [];
    for (const entry of list.slice(0, 200)) {
        const rawName = typeof entry === 'string' ? entry : entry?.ten ?? entry?.name;
        const kind = typeof entry === 'object' && entry ? fold(entry.loai).replace(/ /g, '_') : '';
        const name = typeof rawName === 'string' ? cleanName(rawName) : '';
        const key = fold(name);
        if (!name || !key || name.length > MAX_NAME || !/[a-zà-ỹ]/i.test(name)) { skipped.invalid++; continue; }
        if (LABOR_KINDS.has(kind) || NOT_PART.test(key)) { skipped.labor++; continue; }
        if (seen.has(key)) { skipped.duplicate++; continue; }
        if (merged.length >= max) { skipped.overflow++; continue; }
        seen.add(key); merged.push(name); items.push(name);
    }
    return {items, merged, skipped};
}
