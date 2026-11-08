// Đọc hạng mục SƠN từ ảnh/PDF báo giá sửa chữa rồi khớp với bảng giá sơn sửa gara ngoài.
// AI chỉ trả danh sách dòng (kèm số thứ tự hạng mục trong bảng giá nếu nhận ra); ở đây kiểm tra lại, khớp dự phòng bằng tên và gộp.
const MAX_NAME = 120;
const fold = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
const cleanName = raw => String(raw ?? '').replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/^\s*(?:[-•*]|\(?\d{1,3}[.)]|\d{1,3}\s*[-–:])\s*/, '')
    .replace(/\s+/g, ' ').trim();
// Từ chỉ công việc đứng đầu dòng ("Sơn cản trước", "Đồng sơn cửa"...) không thuộc tên chi tiết.
const WORK_PREFIX = /^(?:gohansondong|gohanson|dongson|gohan|goson|sondong|son|dong|go)+/;
const NOT_PAINT_KIND = /^(?:phutung|vattu|cong|nhancong|tong|khac)$/;

export const garageCatalogLines = catalog => (catalog?.items || []).map(item => item.id + '=' + item.name).join('; ');

export function buildGarageQuoteImagePrompt(catalog) {
    return [
        'Bạn đọc ảnh/PDF báo giá sửa chữa ô tô (garage/gara Việt Nam). Chỉ liệt kê các dòng thuộc phần SƠN / ĐỒNG SƠN / GÒ HÀN SƠN, kể cả khi dòng chỉ ghi tên chi tiết nằm trong mục sơn (VD "Cản trước" dưới tiêu đề SƠN).',
        'Bỏ qua phụ tùng thay mới, nhân công tháo lắp, tiêu đề, thông tin khách hàng, biển số, tổng tiền, VAT. Chỉ chép tên có trên giấy, không dịch, không tự thêm.',
        'Danh mục bảng giá sơn (mã=tên): ' + garageCatalogLines(catalog) + '.',
        'Trả về DUY NHẤT một JSON: {"items":[{"ten":"","stt":"","muc":""}]}.',
        '- ten: tên hạng mục đúng như trên giấy, bỏ số thứ tự, đơn vị, số lượng, đơn giá, thành tiền.',
        '- stt: mã của hạng mục tương ứng trong danh mục trên (VD "17" hoặc "24-phay"); để "" nếu không có hạng mục nào tương ứng hoặc không chắc. Trái/phải/trước/sau: chọn hạng mục có tên phù hợp (VD "Cửa sau phải" -> Cửa trước/sau).',
        '- muc: "A" nếu giấy ghi trầy xước nhẹ; "B" nếu ghi xước sâu/lõm/móp; "" nếu không ghi.',
        'Giữ nguyên thứ tự từ trên xuống dưới. Không bỏ sót dòng sơn nào.'
    ].join('\n');
}

export const GARAGE_OCR_TEXT_MAX = 14000;
// Bản dành cho văn bản OCR (không có ảnh): dùng với OCR.Space + Groq.
export function buildGarageQuoteTextPrompt(ocrText, catalog) {
    return [
        buildGarageQuoteImagePrompt(catalog).replace('Bạn đọc ảnh/PDF báo giá', 'Bạn nhận văn bản do OCR đọc từ báo giá'),
        'Văn bản OCR có thể lệch dòng, dính cột hoặc sai vài ký tự; tên hạng mục và số tiền có thể nằm ở các dòng liền nhau. Chỉ lấy cột tên hạng mục, không lấy số tiền.',
        '--- VĂN BẢN OCR ---',
        String(ocrText || '').slice(0, GARAGE_OCR_TEXT_MAX)
    ].join('\n');
}

const normalizeLevel = value => { const key = fold(value); return key === 'a' ? 'A' : key === 'b' ? 'B' : ''; };

// Khớp dự phòng khi AI không trả mã: tên chi tiết trùng/chứa tên hạng mục, hoặc nằm gọn trong đúng một hạng mục (tên + từ khác).
function matchByName(name, entries) {
    const full = fold(name), stripped = fold(name).replace(WORK_PREFIX, '') || full;
    for (const key of [full, stripped]) {
        const exact = entries.find(entry => entry.name === key);
        if (exact) return exact.item;
    }
    const contained = entries.filter(entry => entry.name.length >= 4 && stripped.includes(entry.name)).sort((a, b) => b.name.length - a.name.length);
    if (contained.length) return contained[0].item;
    if (stripped.length >= 5) {
        const within = entries.filter(entry => entry.all.includes(stripped));
        if (within.length === 1) return within[0].item;
    }
    return null;
}

// raw: JSON AI trả ({items:[...]} hoặc mảng); catalog: {items:[{id,no,name}], aliases:{no:'từ khóa khác'}}.
// Trả {matched:[{id,no,name,papers,level,count}], unmatched:[tên dòng không khớp], skipped:{invalid,notPaint}}.
export function matchGarageQuoteItems(raw, catalog) {
    const list = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
    const items = Array.isArray(catalog?.items) ? catalog.items : [];
    const byId = new Map(items.map(item => [String(item.id), item]));
    const entries = items.map(item => ({ item, name: fold(item.name), all: fold(item.name + ' ' + (catalog?.aliases?.[item.no] || '')) }));
    const matched = new Map(), unmatched = [], skipped = { invalid: 0, notPaint: 0 };
    for (const entry of list.slice(0, 200)) {
        const rawName = typeof entry === 'string' ? entry : entry?.ten ?? entry?.name;
        const name = typeof rawName === 'string' ? cleanName(rawName) : '';
        const key = fold(name);
        if (!name || !key || name.length > MAX_NAME || !/[a-zà-ỹ]/i.test(name)) { skipped.invalid++; continue; }
        const obj = typeof entry === 'object' && entry ? entry : {};
        if (NOT_PAINT_KIND.test(fold(obj.loai)) && !key.includes('son')) { skipped.notPaint++; continue; }
        let item = byId.get(String(obj.stt ?? obj.id ?? '').trim()) || null;
        // Lazang và Phay Lazang cùng mục 24 trong bảng gốc: phân biệt theo chữ "phay" trên giấy.
        if (item && item.no === 24) item = byId.get(key.includes('phay') ? '24-phay' : '24') || item;
        if (!item) item = matchByName(name, entries);
        if (!item) { if (!unmatched.includes(name)) unmatched.push(name); continue; }
        const level = normalizeLevel(obj.muc ?? obj.mức);
        const found = matched.get(item.id) || { id: item.id, no: item.no, name: item.name, papers: [], level: '', count: 0 };
        found.count++;
        if (!found.papers.includes(name)) found.papers.push(name);
        if (level && !found.level) found.level = level;
        else if (level && found.level && found.level !== level) found.level = 'B'; // lẫn A/B: lấy mức nặng hơn để không báo thấp
        matched.set(item.id, found);
    }
    return { matched: [...matched.values()], unmatched, skipped };
}
