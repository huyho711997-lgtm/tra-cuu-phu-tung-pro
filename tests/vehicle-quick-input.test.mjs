import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVehicleQuickInput as parse, sanitizeVehicleAiHints as sanitize, buildVehicleCatalogText, buildVehicleQuickAiPrompt, buildVehicleQuickExamples} from '../assets/js/vehicle-quick-input.mjs';

const tree = {
    MAZDA: {'CX-5': [2022, 2019, 2018], 'CX-8': [2021, 2020], MAZDA3: [2020, 2019], MAZDA6: [2018]},
    TOYOTA: {VIOS: [2020, 2019, 2018], 'VIOS 1.5G': [2019], CAMRY: [2020, 2019], 'LAND CRUISER': [2018], FORTUNER: [2020, 2019], INNOVA: [2019]},
    'MERCEDES-BENZ': {C300: [2019, 2020], E200: [2018]},
    PEUGEOT: {2008: [2021], 3008: [2020, 2021]},
    'LAND ROVER': {'RANGE ROVER': [2019]},
    FORD: {RANGER: [2020], 'RANGER XLS': [2020], 'RANGER WILDTRAK': [2021, 2020]}
};
const NOW = 2026;
const run = (text, overrides = {}) => parse(text, tree, {now: NOW, ...overrides});

test('đủ hãng, dòng, đời và phụ tùng thì sẵn sàng áp dụng', () => {
    const plan = run('Mazda CX5 2019 cản trước');
    assert.equal(plan.brand, 'MAZDA');
    assert.deepEqual(plan.models, ['CX-5']);
    assert.deepEqual(plan.years, [2019]);
    assert.equal(plan.part, 'cản trước');
    assert.equal(plan.ready, true);
    assert.equal(plan.questions.length, 0);
});

test('thiếu đời xe thì hỏi, chọn đời hoặc bỏ qua đều hoàn tất', () => {
    const plan = run('mazda cx5 cản trước');
    assert.equal(plan.ready, false);
    assert.equal(plan.questions[0].id, 'year');
    assert.deepEqual(plan.questions[0].options.map(option => option.value), [2022, 2019, 2018]);
    assert.equal(plan.questions[0].optional, true);
    const picked = run('mazda cx5 cản trước', {years: [2019]});
    assert.equal(picked.ready, true);
    assert.deepEqual(picked.years, [2019]);
    const skipped = run('mazda cx5 cản trước', {years: [], yearsSkipped: true});
    assert.equal(skipped.ready, true);
    assert.deepEqual(skipped.years, []);
});

test('suy ra hãng từ tên dòng xe và nhận cách gọi tắt', () => {
    assert.equal(run('cx5 2019 đèn pha trái').brand, 'MAZDA');
    const benz = run('mec c300 2020 gương');
    assert.equal(benz.brand, 'MERCEDES-BENZ');
    assert.deepEqual(benz.models, ['C300']);
    assert.equal(run('mercedes benz e200 2018 cản').brand, 'MERCEDES-BENZ');
});

test('"Mazda 3" được hiểu là dòng MAZDA3 dù chữ Mazda đã nhận là hãng', () => {
    const plan = run('mazda 3 2019 cản');
    assert.deepEqual(plan.models, ['MAZDA3']);
    assert.equal(plan.part, 'cản');
});

test('dòng xe có nhiều biến thể thì hỏi lại, trả lời xong mới sẵn sàng', () => {
    const plan = run('toyota vios 2019 cản trước');
    assert.equal(plan.ready, false);
    assert.equal(plan.questions[0].id, 'model');
    assert.deepEqual(plan.questions[0].options.map(option => option.value).sort(), ['VIOS', 'VIOS 1.5G']);
    assert.equal(plan.questions[0].options.find(option => option.value === 'VIOS').preselected, true);
    const answered = run('toyota vios 2019 cản trước', {models: ['VIOS']});
    assert.equal(answered.ready, true);
    assert.equal(answered.part, 'cản trước');
});

test('tên dòng nhiều từ không bị nhầm sang hãng khác (Land Cruiser không phải Land Rover)', () => {
    const plan = run('toyota land cruiser 2018 capo');
    assert.equal(plan.brand, 'TOYOTA');
    assert.deepEqual(plan.models, ['LAND CRUISER']);
    assert.equal(plan.part, 'capo');
    assert.equal(run('range rover 2019 cản').brand, 'LAND ROVER');
});

test('dòng xe là số (Peugeot 2008) không bị nhận thành năm', () => {
    const plan = run('peugeot 2008 2021 cản sau');
    assert.deepEqual(plan.models, ['2008']);
    assert.deepEqual(plan.years, [2021]);
    assert.equal(plan.part, 'cản sau');
});

test('từ trong tên phụ tùng không bị nhận nhầm là dòng xe', () => {
    const plan = run('toyota camry 2020 cam biến lùi');
    assert.deepEqual(plan.models, ['CAMRY']);
    assert.equal(plan.part, 'cam biến lùi');
    const wiper = run('toyota fortuner 2019 gạt mưa');
    assert.deepEqual(wiper.models, ['FORTUNER']);
});

test('không nhận ra dòng xe thì hỏi toàn bộ dòng của hãng và báo cần AI', () => {
    const plan = run('mazda xyz 2019 cản');
    assert.equal(plan.brand, 'MAZDA');
    assert.equal(plan.needsAi, true);
    assert.equal(plan.questions[0].id, 'model');
    assert.deepEqual(plan.questions[0].options.map(option => option.value), ['CX-5', 'CX-8', 'MAZDA3', 'MAZDA6']);
    const hinted = run('mazda xyz 2019 cản', {hints: {brand: 'MAZDA', models: ['CX-5'], years: [], kind: '', part: 'cản'}});
    assert.deepEqual(hinted.models, ['CX-5']);
    assert.equal(hinted.needsAi, false);
    assert.deepEqual(hinted.years, [2019]);
});

test('không có hãng lẫn dòng thì hỏi hãng', () => {
    const plan = run('cản trước 2019');
    assert.equal(plan.questions[0].id, 'brand');
    assert.equal(plan.needsAi, true);
    assert.ok(plan.questions[0].options.some(option => option.value === 'TOYOTA'));
});

test('nhiều phụ tùng cách nhau dấu phẩy', () => {
    const plan = run('mazda cx5 2019 cản trước, đèn pha; gương trái');
    assert.deepEqual(plan.parts, ['cản trước', 'đèn pha', 'gương trái']);
});

test('loại hàng chính hãng / hàng ngoài được tách khỏi tên phụ tùng', () => {
    const genuine = run('mazda cx5 2019 cản trước chính hãng');
    assert.equal(genuine.kind, 'genuine');
    assert.equal(genuine.part, 'cản trước');
    const outside = run('mazda cx5 2019 hàng ngoài đèn pha');
    assert.equal(outside.kind, 'aftermarket');
    assert.equal(outside.part, 'đèn pha');
    assert.equal(run('mazda cx5 2019 cản').kind, 'all');
});

test('đời xe nhập dạng 2 số, khoảng năm, hoặc chữ "đời" / "năm"', () => {
    assert.deepEqual(run('mazda cx5 đời 19 cản trước').years, [2019]);
    assert.deepEqual(run('mazda cx5 năm sx 2019 cản trước').years, [2019]);
    const range = run('cx5 2018-2022 cản');
    assert.deepEqual(range.years, [2018, 2019, 2022]);
    assert.match(range.notes[0], /2020, 2021/);
    assert.deepEqual(run('cx5 2018 đến 2019 cản').years, [2018, 2019]);
});

test('đời xe không có trong kho thì hỏi lại', () => {
    const plan = run('mazda cx5 2015 cản');
    assert.equal(plan.ready, false);
    assert.equal(plan.questions[0].id, 'year');
    assert.match(plan.questions[0].prompt, /2015/);
});

test('từ đệm "xe" và "tìm" không lẫn vào tên phụ tùng', () => {
    assert.equal(run('cản trước xe mazda cx5 2019').part, 'cản trước');
    assert.equal(run('tìm mazda cx5 2019 đèn pha').part, 'đèn pha');
});

test('dòng xe chỉ có một năm thì không hỏi đời', () => {
    const plan = run('mazda mazda6 cản');
    assert.deepEqual(plan.models, ['MAZDA6']);
    assert.equal(plan.ready, true);
});

test('hai hãng cùng tên dòng thì hỏi hãng, chọn xong thì tiếp tục', () => {
    const shared = {HYUNDAI: {ACCENT: [2019, 2020]}, DAEWOO: {ACCENT: [2019]}};
    const plan = parse('accent 2019 cản', shared, {now: NOW});
    assert.equal(plan.questions[0].id, 'brand');
    assert.deepEqual(plan.questions[0].options.map(option => option.value).sort(), ['DAEWOO', 'HYUNDAI']);
    const answered = parse('accent 2019 cản', shared, {now: NOW, brand: 'HYUNDAI'});
    assert.equal(answered.ready, true);
    assert.deepEqual(answered.models, ['ACCENT']);
});

test('câu trống hoặc chưa có dữ liệu xe', () => {
    assert.equal(run('   ').empty, true);
    assert.equal(parse('mazda cx5', {}, {now: NOW}).ready, false);
});

test('chỉ giữ kết quả AI khi khớp đúng cây gia phả xe', () => {
    const hints = sanitize({brand: 'mazda', models: ['cx 5', 'KHONG-CO', 5], years: [2019, '2020', 1800, 'abc', 2099], kind: 'genuine', part: '  cản   trước  '}, tree, NOW);
    assert.equal(hints.brand, 'MAZDA');
    assert.deepEqual(hints.models, ['CX-5']);
    assert.deepEqual(hints.years, [2019, 2020]);
    assert.equal(hints.kind, 'genuine');
    assert.equal(hints.part, 'cản trước');
    assert.deepEqual(sanitize({brand: 'HANG-LA', models: ['XYZ'], kind: 'rm -rf'}, tree, NOW), {brand: '', models: [], years: [], kind: '', part: ''});
    assert.equal(sanitize({models: ['C300']}, tree, NOW).brand, 'MERCEDES-BENZ');
    assert.deepEqual(sanitize(null, tree), {brand: '', models: [], years: [], kind: '', part: ''});
});

test('prompt AI chỉ chứa câu nhập và catalog, giới hạn độ dài', () => {
    const prompt = buildVehicleQuickAiPrompt('mazda xyz', tree, 'MAZDA');
    assert.match(prompt, /CX-5 \| CX-8/);
    assert.doesNotMatch(prompt, /TOYOTA/);
    const huge = {BIG: Object.fromEntries(Array.from({length: 3000}, (_, i) => ['MODEL ' + i, [2020]]))};
    assert.ok(buildVehicleCatalogText(huge, '', 1000).length <= 1000);
});

test('AI chỉ đoán đúng hãng thì không được ghi đè phụ tùng / năm / loại hàng đã tách được', () => {
    const hints = sanitize({brand: 'MAZDA', models: ['HACKER-9000'], years: [2022], kind: 'genuine', part: 'x'}, tree, NOW);
    const plan = run('mazda xyz 2020 đèn pha', {hints});
    assert.equal(plan.brand, 'MAZDA');
    assert.equal(plan.questions[0].id, 'model');
    // "xyz" không nhận ra được nên còn nằm trong phần phụ tùng để người dùng sửa; quan trọng là phụ tùng giả "x" của AI không ghi đè.
    assert.equal(plan.part, 'xyz đèn pha');
    assert.equal(plan.kind, 'all');
    // Khi AI xác định được cả dòng xe thì mới dùng phần AI tách cho các trường còn thiếu.
    const full = run('mazda xyz đèn pha', {hints: sanitize({brand: 'MAZDA', models: ['CX-8'], years: [2020], kind: 'genuine', part: 'đèn pha trước'}, tree, NOW)});
    assert.deepEqual(full.models, ['CX-8']);
    assert.deepEqual(full.years, [2020]);
    assert.equal(full.kind, 'genuine');
    assert.equal(full.part, 'đèn pha trước');
});

test('người dùng sửa lại tên phụ tùng khi chọn dòng xe (bỏ chữ là tên xe, tách nhiều phụ tùng)', () => {
    const edited = run('mazda xyz 2020 đèn pha', {models: ['CX-8'], part: '  đèn pha ;  gương trái '});
    assert.deepEqual(edited.models, ['CX-8']);
    assert.deepEqual(edited.parts, ['đèn pha', 'gương trái']);
    assert.equal(edited.ready, true);
    assert.deepEqual(run('mazda xyz 2020 đèn pha', {models: ['CX-8'], part: '   '}).parts, []);
});

test('ví dụ bấm nhanh lấy từ dữ liệu kho và luôn được hiểu trọn vẹn không phải hỏi lại', () => {
    const examples = buildVehicleQuickExamples(tree, 3, undefined, NOW);
    assert.equal(examples.length, 3);
    for (const text of examples) {
        const plan = run(text);
        assert.equal(plan.ready, true, text);
        assert.equal(plan.questions.length, 0, text);
    }
    // TOYOTA có nhiều dòng nhất nhưng VIOS bị trùng tiền tố với VIOS 1.5G nên phải bị bỏ qua.
    assert.ok(examples[0].startsWith('Toyota '), examples[0]);
    assert.ok(!/Vios (2020|2019|2018)/i.test(examples[0]), examples[0]);
    assert.ok(examples.some(text => /^Mercedes-Benz /.test(text)) || examples.some(text => /^Mazda /.test(text)));
    assert.deepEqual(buildVehicleQuickExamples({}, 3, undefined, NOW), []);
    assert.deepEqual(buildVehicleQuickExamples(null), []);
});

import {normalizeRegistrationFields, buildRegistrationAiPrompt} from '../assets/js/vehicle-quick-input.mjs';
test('đăng kiểm: chuẩn hoá trường AI trả về', () => {
    const f = normalizeRegistrationFields({bien_so: '47a-123.45', nhan_hieu: ' vinfast ', ten_thuong_mai: 'VF5 PLUS', so_loai: 'X', nam_san_xuat: 'Năm 2024', so_khung: 'rl4abc'}, 2026);
    assert.equal(f.text, 'vinfast VF5 PLUS 2024'); assert.equal(f.plate, '47A-123.45'); assert.equal(f.vin, 'RL4ABC'); assert.equal(f.found, true);
});
test('đăng kiểm: năm vô lý bị bỏ, thiếu tên thương mại thì dùng số loại, dữ liệu rác không lỗi', () => {
    assert.equal(normalizeRegistrationFields({nhan_hieu: 'TOYOTA', so_loai: 'CAMRY 2.5Q', nam_san_xuat: '2099'}, 2026).text, 'TOYOTA CAMRY 2.5Q');
    assert.equal(normalizeRegistrationFields(null).found, false);
    assert.equal(normalizeRegistrationFields({nhan_hieu: {x: 1}, nam_san_xuat: ['2020']}).found, false);
    assert.ok(buildRegistrationAiPrompt().includes('nhan_hieu'));
});
