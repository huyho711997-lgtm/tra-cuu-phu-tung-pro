import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { getPartsCandidateFamily as classifyPartsCandidateFamily, getPartsCandidateRelevance as evaluatePartsCandidateRelevance, canRoutePartsCandidate } from '../assets/js/parts-relevance.mjs';

const source = readFileSync(new URL('../assets/js/app-core.mjs', import.meta.url), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

// Minimal DOM for exercising the actual selection/rendering functions without a database or AI key.
class Element {
    constructor(tag = 'div') {
        this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.events = {};
        this.className = ''; this.textContent = ''; this.hidden = false; this.checked = false; this.disabled = false;
        this.classList = {
            contains: name => this.className.split(' ').includes(name),
            add: (...names) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...names])].join(' '); },
            remove: (...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); },
            toggle: (name, value) => { const on = value ?? !this.classList.contains(name); on ? this.classList.add(name) : this.classList.remove(name); return on; }
        };
    }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.append(node); return node; }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(name, callback) { (this.events[name] ||= []).push(callback); }
    change(checked) { this.checked = checked; (this.events.change || []).forEach(callback => callback()); }
    contains(node) { return node === this || this.children.some(child => child.contains?.(node)); }
    querySelectorAll(selector) {
        const matches = node => selector.startsWith('.') ? node.classList?.contains(selector.slice(1)) : node.tagName === selector.toUpperCase();
        return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...(child.querySelectorAll?.(selector) || [])]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    focus() {}
    scrollIntoView() {}
}

const primary = { name: 'Cản trước', names: ['Cản trước', 'CẢN TRƯỚC'], record_count: 12, relation: 'same_part', review_reasons: [] };
const related = { name: 'Ốp crom cản trước phải', names: ['Ốp crom cản trước phải', 'ỐP CROM CẢN TRƯỚC PHẢI'], record_count: 4, relation: 'related_part', review_reasons: ['Khác loại chi tiết.'] };
const criteria = { query: 'cản trước', brand: 'MITSUBISHI', models: ['XPANDER'], years: [2022], kind: 'genuine' };

function harness() {
    const nodes = new Map();
    for (const id of ['partsAiResults', 'partsAiStatus', 'partsBatchAiReview', 'btnPartsBatchApply', 'statCount', 'exactPartName', 'btnExactPartName', 'dataSection']) nodes.set(id, new Element());
    nodes.set('searchInput', Object.assign(new Element('input'), { value: criteria.query }));
    nodes.set('filterHang', Object.assign(new Element('input'), { value: criteria.brand }));
    nodes.set('filterType', Object.assign(new Element('input'), { value: criteria.kind }));
    const document = { body: new Element('body'), getElementById: id => nodes.get(id) || null,
        createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag),
        querySelectorAll: selector => selector.includes('hieu_xe') ? [{ value: 'XPANDER' }] : selector.includes('nam_sx') ? [{ value: '2022' }] : [] };
    document.activeElement = document.body;
    let searchedNames = [], currentBatch = null;
    const context = vm.createContext({
        document, console, AbortController, Set, Map, classifyPartsCandidateFamily, evaluatePartsCandidateRelevance, canRoutePartsCandidate, auth: { currentUser: { uid: 'user-a' } },
        canCurrentUserAccessPage: () => true, PARTS_BATCH_MODE: false, EXACT_SOURCE_CONTEXT: null,
        requestAnimationFrame: callback => callback(), matchMedia: () => ({ matches: true }),
        isCurrentPartsBatchState: state => state === currentBatch && !state.stale,
        setPartsBatchStatus() {}, formatVND: value => String(value),
        renderPartsBatchResults() {}, resetPartsPriceReview() {},
        refinePartsAiCandidates: async () => ({ candidates: [], relatedCandidates: [] })
    });
    context.window = context;
    context.createPartsBatchButton = (text, action) => { const button = new Element('button'); button.textContent = text; button.addEventListener('click', action); return button; };
    context.searchData = async () => { searchedNames = [...context.api.getSelectedPartsAiNames()]; return true; };
    vm.runInContext(between('        function normalizePartsCandidateText(', '        window.refinePartsAiCandidates ='), context);
    vm.runInContext(between('        window.createPartsRelatedCandidates =', '        // PARTS_CANDIDATE_RELEVANCE_END'), context);
    vm.runInContext(between('        let PARTS_AI_REVISION =', '        // PARTS_AI_SEARCH_END'), context);
    vm.runInContext(between('        function getPartsBatchSelectedNames(', '        async function analysePartsBatchAiGroup('), context);
    vm.runInContext(`globalThis.api = {
        suggestPartsAiDraft, partsAiSelectableCandidates, getPartsBatchSelectedNames, reconcilePartsBatchCandidates,
        changePartsBatchAiChoice, renderPartsBatchAiGroup, getSelectedPartsAiNames,
        makeSingle(data, criteria) {
            PARTS_AI_STATE = { criteria, scope: partsAiScopeKey(criteria), candidates:data.candidates, relatedCandidates:data.relatedCandidates, draft:suggestPartsAiDraft(data.candidates,criteria.query), loading:false, controller:new AbortController() };
            renderPartsAiCandidates(data, PARTS_AI_REVISION); return PARTS_AI_STATE;
        }, ticket: () => PARTS_AI_REVISION
    };`, context);
    return { context, nodes, api: context.api, searched: () => searchedNames,
        setBatch(groups) { currentBatch = { groups, criteria, phase: 'review', controller: new AbortController() }; return currentBatch; } };
}

test('single search renders related checkboxes unchecked and merges only explicitly selected names', async () => {
    const { context, api, nodes, searched } = harness();
    const state = api.makeSingle({ candidates: [primary], relatedCandidates: [related] }, criteria);
    const inputs = nodes.get('partsAiResults').querySelectorAll('input');
    assert.equal(inputs.length, 2);
    assert.equal(inputs[0].checked, true);
    assert.equal(inputs[1].checked, false);
    assert.equal(state.controls.counter.textContent, '1/2 tên đã chọn');
    inputs[1].change(true);
    assert.equal(state.controls.counter.textContent, '2/2 tên đã chọn');
    assert.equal(state.controls.applyCount.textContent, '2');
    await context.applyPartsAiSelection(api.ticket());
    assert.deepEqual(searched(), [...primary.names, ...related.names]);
    assert.equal(state.collapsed, true);
    assert.ok(state.controls.summary.textContent.includes(related.name));
    assert.deepEqual(state.criteria, criteria);
});

test('deselecting a related item removes it from the applied query and select-all covers both sections', async () => {
    const { context, api, nodes, searched } = harness();
    const state = api.makeSingle({ candidates: [primary], relatedCandidates: [related] }, criteria);
    context.selectAllPartsAiCandidates(api.ticket(), true);
    assert.equal(state.draft.size, 2);
    assert.ok(nodes.get('partsAiResults').querySelectorAll('input').every(input => input.checked));
    nodes.get('partsAiResults').querySelectorAll('input')[1].change(false);
    await context.applyPartsAiSelection(api.ticket());
    assert.deepEqual(searched(), primary.names);
    context.selectAllPartsAiCandidates(api.ticket(), false);
    assert.equal(state.draft.size, 0);
    assert.equal(state.controls.apply.disabled, true);
});

test('related-only results can be selected, including all aliases, without automatic selection', async () => {
    const { context, api, nodes, searched } = harness();
    const state = api.makeSingle({ candidates: [], relatedCandidates: [related] }, criteria);
    assert.equal(state.draft.size, 0);
    assert.equal(api.suggestPartsAiDraft([related], criteria.query).size, 0);
    const input = nodes.get('partsAiResults').querySelectorAll('input')[0];
    input.change(true);
    assert.equal(state.controls.apply.disabled, false);
    await context.applyPartsAiSelection(api.ticket());
    assert.deepEqual(searched(), related.names);
});

test('busy and stale single searches cannot change or apply related selections', async () => {
    const { context, api, nodes, searched } = harness();
    const state = api.makeSingle({ candidates: [primary], relatedCandidates: [related] }, criteria);
    state.loading = true;
    context.togglePartsAiCandidate(1, api.ticket(), true);
    assert.equal(state.draft.has(1), false);
    await context.applyPartsAiSelection(api.ticket());
    assert.deepEqual(searched(), []);
    state.loading = false;
    nodes.get('searchInput').value = 'đèn trước';
    context.togglePartsAiCandidate(1, api.ticket(), true);
    await context.applyPartsAiSelection(api.ticket());
    assert.deepEqual(searched(), []);
    assert.equal(nodes.get('partsAiResults').hidden, true);
});

function group(term = criteria.query) {
    return { term, candidates: [primary], relatedCandidates: [related], rawCandidates: [primary, related], selected: new Set([0]), aiStatus: 'ready', request: 0 };
}

test('batch related checkbox updates selection totals and the exact names used to fetch prices', () => {
    const { api, nodes, setBatch } = harness(), entry = group();
    const state = setBatch([entry]);
    api.renderPartsBatchAiGroup(state, 0);
    assert.equal(entry.choiceInputs.length, 2);
    assert.equal(entry.choiceInputs[1].checked, false);
    entry.choiceInputs[1].change(true);
    assert.deepEqual([...api.getPartsBatchSelectedNames(entry)], [...primary.names, ...related.names]);
    assert.equal(entry.selectionLabel.textContent, '2/2 tên đã chọn');
    assert.equal(nodes.get('btnPartsBatchApply').disabled, false);
    entry.choiceInputs[0].change(false);
    assert.deepEqual([...api.getPartsBatchSelectedNames(entry)], related.names);
});

test('changing a related selection after batch results marks prices stale and cancels active loads', () => {
    const { api, setBatch } = harness(), entry = group();
    const state = setBatch([entry]); state.phase = 'results';
    const previous = state.controller;
    api.changePartsBatchAiChoice(state, 0, 1, true);
    assert.equal(state.selectionDirty, true);
    assert.equal(previous.signal.aborted, true);
    assert.equal(entry.request, 1);
    assert.ok(api.getPartsBatchSelectedNames(entry).includes(related.name));
});

test('reconciling groups preserves a manually selected related part even if another group owns it', async () => {
    const { api, setBatch } = harness();
    const entry = group(); entry.selected = new Set([1]);
    const other = { ...group('ốp crom cản trước phải'), candidates: [{ ...related, relation: 'same_part' }], relatedCandidates: [], rawCandidates: [related], selected: new Set([0]) };
    const state = setBatch([entry, other]);
    await api.reconcilePartsBatchCandidates(state);
    assert.equal(entry.relatedCandidates.length, 1);
    assert.deepEqual([...api.getPartsBatchSelectedNames(entry)], related.names);
});

test('reconciling newly inserted primary suggestions remaps related indices by name', async () => {
    const { context, api, setBatch } = harness();
    const entry = group(); entry.selected = new Set([1]);
    const extra = { ...primary, name: 'Cản trước nhựa', names: ['Cản trước nhựa'], relevance_verified: true };
    const other = { ...group('cản trước nhựa'), candidates: [extra], relatedCandidates: [], rawCandidates: [extra], selected: new Set([0]) };
    context.refinePartsAiCandidates = async request => ({ candidates: request.query === criteria.query ? [extra] : [], relatedCandidates: [] });
    const state = setBatch([entry, other]);
    await api.reconcilePartsBatchCandidates(state);
    assert.equal(entry.candidates.length, 2);
    assert.equal(entry.selected.has(2), true);
    assert.deepEqual([...api.getPartsBatchSelectedNames(entry)], related.names);
});

test('batch reconciliation cannot promote an uncertain AI response from another group',async()=>{
    const {context,api,setBatch}=harness();
    const pump={...primary,name:'Bơm nước',names:['Bơm nước']};
    const foreign={name:'Bơm nước phụ',names:['Bơm nước phụ'],record_count:9};
    const entry={...group('bơm nước'),candidates:[pump],relatedCandidates:[],rawCandidates:[pump],selected:new Set([0])};
    const other={...group('vòi phun'),candidates:[],relatedCandidates:[],rawCandidates:[foreign],selected:new Set()};
    let calls=0;
    context.refinePartsAiCandidates=async()=>{calls++;return {candidates:[{...foreign,relation:'uncertain',relevance_verified:true,review_reasons:['Chưa đủ thông tin']}],relatedCandidates:[]};};
    await api.reconcilePartsBatchCandidates(setBatch([entry,other]));
    assert.equal(calls,1);
    assert.equal(entry.candidates.length,1);
    assert.deepEqual([...api.getPartsBatchSelectedNames(entry)],['Bơm nước']);
});

test('HVAC groups do not request AI to classify unrelated foreign warehouse names',async()=>{
    const {context,api,setBatch}=harness();
    const compressor={...primary,name:'Máy nén điều hòa',names:['Máy nén điều hòa']};
    const condenser={...primary,name:'Giàn nóng',names:['Giàn nóng']};
    const internal={...related,name:'Bộ hơi máy nén',names:['Bộ hơi máy nén']};
    const frame={...related,name:'Thanh đứng khung xương két nước trái',names:['Thanh đứng khung xương két nước trái']};
    const entry={...group('máy nén'),candidates:[compressor],relatedCandidates:[internal],rawCandidates:[compressor,internal],selected:new Set([0])};
    const other={...group('giàn nóng'),candidates:[condenser],relatedCandidates:[frame],rawCandidates:[condenser,frame],selected:new Set([0])};
    context.refinePartsAiCandidates=async()=>assert.fail('Unrelated names must not be imported for classification');
    await api.reconcilePartsBatchCandidates(setBatch([entry,other]));
    assert.deepEqual(entry.candidates.map(c=>c.name),['Máy nén điều hòa']);
    assert.deepEqual(other.candidates.map(c=>c.name),['Giàn nóng']);
});

test('a user who deselected every candidate is not auto-selected again during routing',async()=>{
    const {api,setBatch}=harness(),entry=group();
    const state=setBatch([entry]);
    api.changePartsBatchAiChoice(state,0,0,false);
    assert.equal(entry.selectionTouched,true);assert.equal(entry.selected.size,0);
    await api.reconcilePartsBatchCandidates(state);
    assert.equal(entry.selected.size,0);
});
