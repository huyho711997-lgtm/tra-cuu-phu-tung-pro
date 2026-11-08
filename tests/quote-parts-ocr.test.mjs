import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeQuotePartItems, buildQuotePartsAiPrompt} from '../assets/js/quote-parts-ocr.mjs';

test('OCR báo giá: lấy phụ tùng, bỏ công/sơn/tổng, làm sạch số thứ tự', () => {
    const r = mergeQuotePartItems({items: [
        {ten: '1. Cản trước', loai: 'phu_tung'}, {ten: 'Đèn pha trái (2)', loai: 'phu_tung'}, {ten: 'Công tháo lắp cản', loai: 'cong'},
        {ten: 'Sơn cản trước', loai: 'son'}, {ten: 'Tổng cộng', loai: 'khac'}, {ten: 'Nhân công gò hàn'}, {ten: '  ', loai: 'phu_tung'}, {ten: '12345', loai: 'phu_tung'}]});
    assert.deepEqual(r.items, ['Cản trước', 'Đèn pha trái']);
    assert.equal(r.skipped.labor, 4); assert.equal(r.skipped.invalid, 2);
});
test('OCR báo giá: gộp vào danh sách có sẵn, bỏ trùng, giới hạn số lượng', () => {
    const existing = ['cản trước', 'Capo'];
    const r = mergeQuotePartItems([{ten: 'CẢN TRƯỚC'}, {ten: 'Gương chiếu hậu'}, {ten: 'Capo'}, {ten: 'Ba đờ sốc sau'}], existing, 3);
    assert.deepEqual(r.merged, ['cản trước', 'Capo', 'Gương chiếu hậu']);
    assert.equal(r.skipped.duplicate, 2); assert.equal(r.skipped.overflow, 1);
});
test('OCR báo giá: dữ liệu rác không gây lỗi', () => {
    for (const bad of [null, undefined, 5, 'x', {items: 'a'}, {items: [null, 3, {}, {ten: {x: 1}}]}]) assert.deepEqual(mergeQuotePartItems(bad).items, []);
    assert.ok(buildQuotePartsAiPrompt().includes('"items"'));
});
