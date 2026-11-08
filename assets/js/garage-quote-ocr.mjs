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

export const garageCatalogLines = catalog => (catalog?.items || []).map(item => {
    const extra = catalog?.aliases?.[item.no];
    return item.id + '=' + item.name + (extra ? ' (' + extra + ')' : '');
}).join('; ');

// Bước 1 — chỉ chép: ảnh/PDF -> các dòng công việc đồng/sơn (nhanh, không suy luận). Việc khớp hạng mục làm ở bước 2.
export function buildGarageQuoteImagePrompt() {
    return [
        'Bạn đọc ảnh/PDF báo giá sửa chữa ô tô (garage/gara Việt Nam). Liệt kê MỌI dòng công việc thuộc phần thân vỏ: nhóm ĐỒNG (gò, hàn, nắn, sửa pát/xương) và nhóm SƠN.',
        'Bỏ qua: tiêu đề, thông tin khách hàng, biển số, bảng PHỤ TÙNG thay mới, công việc chung (tháo lắp, sạc gas, nhân công cơ khí), tổng tiền, VAT. Chỉ chép tên có trên giấy, không dịch, không đoán, không gộp, không tự thêm.',
        'Trả về DUY NHẤT một JSON: {"xe":"","items":[{"ten":"","viec":"son","muc":""}]}.',
        '- xe: nhãn hiệu + dòng xe ghi trên báo giá (VD "VinFast Limo Green"); "" nếu không có.',
        '- ten: tên dòng công việc đúng như trên giấy, bỏ số thứ tự, mã công việc, đơn vị, số lượng, đơn giá, thành tiền.',
        '- viec: "dong" nếu dòng thuộc nhóm Đồng/gò/hàn; "son" nếu thuộc nhóm Sơn.',
        '- muc: "A" nếu giấy ghi trầy xước nhẹ; "B" nếu ghi xước sâu/lõm/móp; "" nếu không ghi.',
        'Giữ nguyên thứ tự từ trên xuống dưới. Không bỏ sót dòng nào.'
    ].join('\n');
}

export const GARAGE_OCR_TEXT_MAX = 14000;
// Bản dành cho văn bản OCR (không có ảnh): dùng với OCR.Space + Groq.
export function buildGarageQuoteTextPrompt(ocrText) {
    return [
        buildGarageQuoteImagePrompt().replace('Bạn đọc ảnh/PDF báo giá', 'Bạn nhận văn bản do OCR đọc từ báo giá'),
        'Văn bản OCR có thể lệch dòng, dính cột hoặc sai vài ký tự; tên công việc và số tiền có thể nằm ở các dòng liền nhau. Chỉ lấy cột tên công việc, không lấy số tiền.',
        '--- VĂN BẢN OCR ---',
        String(ocrText || '').slice(0, GARAGE_OCR_TEXT_MAX)
    ].join('\n');
}

// Bước 2 — suy luận: quy từng dòng về hạng mục bảng giá (dùng model có suy luận). ly_do đặt TRƯỚC stt để model nghĩ rồi mới chọn.
export function buildGarageQuoteMapPrompt(lines, vehicle, catalog) {
    const list = (Array.isArray(lines) ? lines : []).slice(0, 80).map(line => {
        const name = typeof line === 'string' ? line : line?.ten ?? line?.name;
        const kind = typeof line === 'object' && line ? line.viec : '';
        const level = typeof line === 'object' && line ? line.muc : '';
        return {ten: cleanName(name), ...(kind ? {viec: String(kind)} : {}), ...(level ? {muc: String(level)} : {})};
    }).filter(line => line.ten);
    return [
        'Bạn là giám định viên bồi thường xe cơ giới Việt Nam, giàu kinh nghiệm đọc báo giá đồng sơn của gara. Hãy SUY LUẬN để quy từng dòng công việc đồng/sơn trên báo giá về hạng mục tương ứng trong BẢNG GIÁ ĐỒNG SƠN GARA NGOÀI.',
        'Quy tắc:',
        '1. Bảng giá là đơn giá ĐỒNG + SƠN theo từng chi tiết thân vỏ. Dòng gò/hàn/nắn và dòng sơn của cùng một chi tiết quy về CÙNG một hạng mục (không phải hai hạng mục khác nhau).',
        '2. Hiểu thuật ngữ gara: ba đờ sốc/cản = bumper; ca pô/capo = nắp động cơ; ga lăng/két nước = lưới tản nhiệt, mặt ca lăng; tai xe = chắn bùn/cánh trước; "xương ..." = khung/xương đỡ nằm sau chi tiết đó; P = phải, T = trái; "trên/dưới" = miếng trên/miếng dưới của chi tiết.',
        '3. Chọn hạng mục gần nghĩa nhất. Xương/pát/giá đỡ nằm sau chi tiết nào thì quy về chi tiết đó nếu hợp lý (VD "xương dưới capo" -> Capo). Nếu thật sự không có hạng mục tương ứng (VD xương két nước, xương ngang đầu xe, xương bắt cản) thì để vào "chua_khop", kèm tối đa 3 mã gợi ý gần nghĩa nhất (hoặc rỗng nếu không có).',
        '4. Mỗi dòng chỉ thuộc một hạng mục. Không bịa hạng mục ngoài danh mục. Không bỏ sót dòng nào: dòng nào cũng phải nằm trong "items" hoặc "chua_khop".',
        'Danh mục bảng giá (mã=tên (từ khóa)): ' + garageCatalogLines(catalog) + '.',
        'Nhóm xe trong bảng giá (mã=tên: dòng xe): ' + (catalog?.groups || []).map(group => group.id + '=' + group.label + (group.models?.length ? ': ' + group.models.slice(0, 12).join(', ') : '')).join('; ') + '.',
        'Xe trên báo giá: ' + (cleanName(vehicle) || '(không ghi)') + '.',
        'Các dòng cần khớp (JSON): ' + JSON.stringify(list),
        'Trả về DUY NHẤT một JSON: {"nhom":"","items":[{"ten":"","ly_do":"","stt":"","muc":"","do_chac":"cao"}],"chua_khop":[{"ten":"","ly_do":"","goi_y":[]}]}.',
        '- ten: giữ nguyên tên dòng đã cho. ly_do: 1 câu ngắn vì sao khớp (viết TRƯỚC khi chọn stt). stt: mã hạng mục trong danh mục (VD "20" hoặc "24-phay").',
        '- muc: "A"/"B"/"" như dòng đã cho. do_chac: "cao" | "vua" | "thap" (mức chắc chắn của việc khớp).',
        '- nhom: mã nhóm xe phù hợp nhất với xe trên báo giá; "" nếu không chắc.'
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

// raw: JSON AI trả ({items:[...], chua_khop:[...], nhom} hoặc mảng dòng); catalog: {items:[{id,no,name}], aliases:{no:'từ khóa khác'}, groups:[{id}]}.
// Trả {matched:[{id,no,name,papers,level,count,reasons,check}], unmatched:[tên dòng không khớp], suggestions:{tên:[mã]}, group, skipped:{invalid,notPaint}}.
export function matchGarageQuoteItems(raw, catalog) {
    const list = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
    const items = Array.isArray(catalog?.items) ? catalog.items : [];
    const byId = new Map(items.map(item => [String(item.id), item]));
    const entries = items.map(item => ({ item, name: fold(item.name), all: fold(item.name + ' ' + (catalog?.aliases?.[item.no] || '')) }));
    const matched = new Map(), unmatched = [], suggestions = {}, skipped = { invalid: 0, notPaint: 0 };
    const addUnmatched = (name, hints) => {
        if (!unmatched.includes(name)) unmatched.push(name);
        const ids = (Array.isArray(hints) ? hints : []).map(id => String(id).trim()).filter(id => byId.has(id));
        if (ids.length) suggestions[name] = [...new Set([...(suggestions[name] || []), ...ids])].slice(0, 3);
    };
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
        if (!item) { addUnmatched(name, obj.goi_y); continue; }
        const level = normalizeLevel(obj.muc ?? obj.mức);
        const found = matched.get(item.id) || { id: item.id, no: item.no, name: item.name, papers: [], level: '', count: 0, reasons: [], check: false };
        found.count++;
        if (!found.papers.includes(name)) found.papers.push(name);
        const reason = typeof obj.ly_do === 'string' ? cleanName(obj.ly_do).slice(0, 200) : '';
        if (reason && !found.reasons.includes(reason)) found.reasons.push(reason);
        if (fold(obj.do_chac) === 'thap') found.check = true;
        if (level && !found.level) found.level = level;
        else if (level && found.level && found.level !== level) found.level = 'B'; // lẫn A/B: lấy mức nặng hơn để không báo thấp
        matched.set(item.id, found);
    }
    // Dòng AI xếp vào "chua_khop" (không có hạng mục tương ứng), kèm gợi ý gần nghĩa.
    for (const entry of (Array.isArray(raw?.chua_khop) ? raw.chua_khop : []).slice(0, 100)) {
        const name = cleanName(typeof entry === 'string' ? entry : entry?.ten ?? entry?.name);
        if (!name || name.length > MAX_NAME || !/[a-zà-ỹ]/i.test(name)) continue;
        addUnmatched(name, entry?.goi_y);
    }
    const group = (catalog?.groups || []).some(g => g.id === raw?.nhom) ? raw.nhom : '';
    return { matched: [...matched.values()], unmatched, suggestions, group, skipped };
}
