import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchGarageQuoteItems, buildGarageQuoteImagePrompt, buildGarageQuoteTextPrompt, buildGarageQuoteMapPrompt, garageCatalogLines, GARAGE_OCR_TEXT_MAX} from '../assets/js/garage-quote-ocr.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const catalogJson = JSON.parse(html.match(/<script id="outsideGarageCatalog" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const catalog = {items: catalogJson.items, aliases: {1: 'ca pô nắp capo bonnet hood', 17: 'ba đờ sốc cản trước bumper', 24: 'la zăng mâm bánh xe'}, groups: catalogJson.groups.map(g => ({id: g.id, label: g.label, models: g.models}))};
const ids = r => r.matched.map(m => m.id);

test('Báo giá gara: dùng mã AI trả về, gộp dòng cùng hạng mục và đếm số lần', () => {
    const r = matchGarageQuoteItems({items: [
        {ten: '1. Sơn cửa trước trái', stt: '5', muc: 'A'}, {ten: 'Sơn cửa sau phải', stt: 5, muc: 'b'},
        {ten: 'Sơn cản trước', stt: '17'}, {ten: 'Sơn nắp capo', stt: ''}]}, catalog);
    assert.deepEqual(ids(r), ['5', '17', '1']);
    assert.equal(r.matched[0].count, 2); assert.equal(r.matched[0].level, 'B');
    assert.deepEqual(r.matched[0].papers, ['Sơn cửa trước trái', 'Sơn cửa sau phải']);
});
test('Báo giá gara: khớp dự phòng theo tên khi AI không trả mã; dòng lạ vào danh sách chưa khớp', () => {
    const r = matchGarageQuoteItems([{ten: 'Đồng sơn Capo'}, {ten: 'Sơn đại tu'}, {ten: 'Gương chiếu hậu điện'}, 'Sơn Galang'], catalog);
    assert.deepEqual(ids(r), ['1', '32', '2']);
    assert.deepEqual(r.unmatched, ['Gương chiếu hậu điện']);
});
test('Báo giá gara: phân biệt Lazang và Phay Lazang theo chữ "phay"', () => {
    const r = matchGarageQuoteItems([{ten: 'Sơn lazang', stt: '24'}, {ten: 'Phay lazang', stt: '24'}, {ten: 'Phay mâm', stt: '24-phay'}], catalog);
    assert.deepEqual(ids(r), ['24', '24-phay']);
});
test('Báo giá gara: bỏ dòng phụ tùng/nhân công, dữ liệu rác không gây lỗi', () => {
    const r = matchGarageQuoteItems([{ten: 'Công tháo lắp', loai: 'cong'}, {ten: '  '}, {ten: '12345'}, null, 3, {ten: {x: 1}}, {ten: 'Cản trước', loai: 'son', stt: '17'}], catalog);
    assert.deepEqual(ids(r), ['17']); assert.equal(r.skipped.notPaint, 1); assert.equal(r.skipped.invalid, 5);
    for (const bad of [null, undefined, 5, 'x', {items: 'a'}]) assert.deepEqual(matchGarageQuoteItems(bad, catalog).matched, []);
    assert.deepEqual(matchGarageQuoteItems([{ten: 'Cản'}], null).unmatched, ['Cản']);
});
test('Báo giá gara: bước 1 chỉ chép dòng đồng/sơn (không cần danh mục), bản OCR cắt độ dài', () => {
    const prompt = buildGarageQuoteImagePrompt();
    assert.ok(prompt.includes('"items"') && prompt.includes('"xe"') && prompt.includes('ĐỒNG') && prompt.includes('SƠN'));
    const text = buildGarageQuoteTextPrompt('x'.repeat(GARAGE_OCR_TEXT_MAX * 2));
    assert.ok(text.includes('văn bản do OCR') && !text.includes('đọc ảnh/PDF báo giá') && text.length < prompt.length + GARAGE_OCR_TEXT_MAX + 1500);
});
test('Báo giá gara: bước 2 (suy luận) có danh mục, nhóm xe, xe trên báo giá và các dòng cần khớp', () => {
    assert.ok(garageCatalogLines(catalog).split('; ').length === catalog.items.length);
    const prompt = buildGarageQuoteMapPrompt([{ten: 'Gò nắp capo', viec: 'dong'}, 'Sơn cản trước trên', {ten: ' '}], 'VinFast Limo Green', catalog);
    assert.ok(prompt.includes('24-phay=Phay Lazang') && prompt.includes('1=Capo (ca pô') && prompt.includes('mpv=Xe 7–9 chỗ'));
    assert.ok(prompt.includes('VinFast Limo Green') && prompt.includes('"Gò nắp capo"') && prompt.includes('Sơn cản trước trên') && prompt.includes('ly_do'));
    assert.ok(prompt.indexOf('"ly_do"') < prompt.indexOf('"stt"', prompt.indexOf('Trả về DUY NHẤT')));
    assert.ok(buildGarageQuoteMapPrompt(null, '', null).includes('(không ghi)'));
});
test('Báo giá gara: kết quả suy luận — gộp gò + sơn cùng chi tiết, lý do, cần kiểm tra, gợi ý, nhóm xe', () => {
    const r = matchGarageQuoteItems({nhom: 'mpv', items: [
        {ten: 'Gò nắp capo', ly_do: 'Nắp capo = Capo', stt: '1', do_chac: 'cao'},
        {ten: 'Sơn nắp capo trong ngoài', ly_do: 'Cùng chi tiết capo', stt: '1', muc: 'B', do_chac: 'cao'},
        {ten: 'Sơn cản trước trên', ly_do: 'Miếng trên của cản trước', stt: '20', do_chac: 'thap'}],
      chua_khop: [{ten: 'Sơn xương dưới két nước', ly_do: 'Không có hạng mục xương', goi_y: ['2', '999', '18']}, {ten: 'Hàn pát xương ngang đầu xe', goi_y: []}]}, catalog);
    assert.deepEqual(ids(r), ['1', '20']);
    assert.equal(r.matched[0].count, 2); assert.equal(r.matched[0].level, 'B'); assert.equal(r.matched[0].check, false);
    assert.deepEqual(r.matched[0].reasons, ['Nắp capo = Capo', 'Cùng chi tiết capo']);
    assert.equal(r.matched[1].check, true);
    assert.deepEqual(r.unmatched, ['Sơn xương dưới két nước', 'Hàn pát xương ngang đầu xe']);
    assert.deepEqual(r.suggestions, {'Sơn xương dưới két nước': ['2', '18']});
    assert.equal(r.group, 'mpv');
    assert.equal(matchGarageQuoteItems({nhom: 'xyz', items: []}, catalog).group, '');
});
