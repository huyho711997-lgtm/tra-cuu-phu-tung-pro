import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchGarageQuoteItems, buildGarageQuoteImagePrompt, buildGarageQuoteTextPrompt, garageCatalogLines, GARAGE_OCR_TEXT_MAX} from '../assets/js/garage-quote-ocr.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const catalogJson = JSON.parse(html.match(/<script id="outsideGarageCatalog" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const catalog = {items: catalogJson.items, aliases: {1: 'ca pô nắp capo bonnet hood', 17: 'ba đờ sốc cản trước bumper', 24: 'la zăng mâm bánh xe'}};
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
test('Báo giá gara: prompt có danh mục bảng giá, JSON mẫu; bản OCR cắt độ dài', () => {
    const prompt = buildGarageQuoteImagePrompt(catalog);
    assert.ok(prompt.includes('"items"') && prompt.includes('24-phay=Phay Lazang') && prompt.includes('1=Capo'));
    assert.ok(garageCatalogLines(catalog).split('; ').length === catalog.items.length);
    const text = buildGarageQuoteTextPrompt('x'.repeat(GARAGE_OCR_TEXT_MAX * 2), catalog);
    assert.ok(text.includes('văn bản do OCR') && !text.includes('đọc ảnh/PDF báo giá') && text.length < prompt.length + GARAGE_OCR_TEXT_MAX + 1500);
});
