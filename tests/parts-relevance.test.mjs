import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {getPartsCandidateFamily as classifyPartsCandidateFamily,getPartsCandidateRelevance as evaluatePartsCandidateRelevance,canRoutePartsCandidate} from '../assets/js/parts-relevance.mjs';

const source=readFileSync(new URL('../assets/js/app-core.mjs',import.meta.url),'utf8');
const between=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
function classifier({decision='same_part',broken=false}={}) {
    const requests=[];
    const context=vm.createContext({classifyPartsCandidateFamily,evaluatePartsCandidateRelevance,canRoutePartsCandidate,
        loadQuoteApiSettingsForCurrentUser:async()=>{},hasSelectedAiKey:()=>true,
        callSelectedAiGenerateContent:async parts=>{
            const data=JSON.parse(parts[0].text.split('DỮ LIỆU:\n')[1]);requests.push(data);
            return {output:broken?'invalid-json':JSON.stringify({items:data.candidates.map(c=>({id:c.id,relation:decision,reason:decision==='uncertain'?'Chưa đủ thông tin':'Cùng chi tiết'}))})};
        },extractJsonObjectFromGeminiText:JSON.parse,AbortController});
    context.window=context;
    vm.runInContext(between('        function normalizePartsCandidateText(', '        window.createPartsRelatedCandidates ='),context);
    return {context,requests,refine:(query,names)=>context.refinePartsAiCandidates({query,brand:'test',models:['test'],years:[2022],kind:'all'},names.map(name=>({name,record_count:1}))),
        draft:(candidates,query)=>context.suggestPartsAiDraft(candidates,query)};
}

test('screenshot: a compressor is different from its internals and other cooling parts',async()=>{
    const app=classifier();
    const result=await app.refine('máy nén',['Máy nén điều hòa','Bộ hơi máy nén','Giàn nóng','giàn nóng két nước',
        'Thanh đứng khung xương két nước trái','Thanh đứng khung xương két nước phụ','Thanh dưới khung xương két nước',
        'Thanh trên khung xương két nước','Bộ Làm Mát bao gồm Quạt Giàn Nóng Két','Cụm quạt tản nhiệt, giàn nóng',
        'Khung xương két nước','XƯƠNG TĂNG CỨNG TRÊN GIÀN NÓNG']);
    assert.deepEqual(Array.from(result.candidates,c=>c.name),['Máy nén điều hòa']);
    assert.equal(result.relatedCandidates.length,11);
    assert.deepEqual([...app.draft(result.candidates,'máy nén')],[0]);
    assert.equal(app.requests.length,0);
});
test('screenshot: condenser candidates never include radiator frames, fans or compressor internals as matches',async()=>{
    const app=classifier();
    const result=await app.refine('giàn nóng',['Giàn nóng','Thanh đứng khung xương két nước trái','Khung xương két nước',
        'Máy nén điều hòa','Bộ hơi máy nén','ĐƯỜNG ỐNG GAS VÀO MÁY NÉN','Cụm quạt tản nhiệt, giàn nóng','giàn nóng két nước']);
    const match=result.candidates.find(c=>c.name==='Giàn nóng');
    assert.equal(match.relation,'same_part');
    const ambiguous=result.candidates.find(c=>c.name==='giàn nóng két nước');
    assert.equal(ambiguous.relation,'uncertain');assert.equal(ambiguous.relevance_verified,false);
    assert.equal(app.requests.length,1);assert.equal(app.requests[0].candidates.length,1);
    assert.equal(app.requests[0].candidates[0].id,'c7');
    assert.deepEqual([...app.draft(result.candidates,'giàn nóng')],[0]);
    assert.equal(result.relatedCandidates.length,6);
});
test('head component wins over the parent name embedded in a warehouse label',()=>{
    for(const [name,family] of [['Bộ hơi máy nén','compressor-internals'],['Puly máy nén điều hòa','pulley'],
        ['Ly hợp máy nén','clutch'],['Cuộn hút lốc lạnh','coil'],['Ống gas giàn nóng','pipe'],
        ['Cụm quạt tản nhiệt, giàn nóng','fan'],['Thanh trên khung xương két nước','reinforcement']]) {
        assert.equal(classifyPartsCandidateFamily(name),family,name);
    }
});
test('known aliases are matched without an AI request, while different HVAC units are not',async()=>{
    const app=classifier();
    const condenser=await app.refine('dàn nóng',['Giàn nóng','DÀN NÓNG']);
    assert.ok(condenser.candidates.every(c=>c.relation==='same_part'&&c.relevance_verified));
    const compressor=await app.refine('lốc lạnh',['Máy nén điều hòa']);
    assert.equal(compressor.candidates[0].relation,'same_part');assert.equal(app.requests.length,0);
    assert.equal(evaluatePartsCandidateRelevance('máy nén khí','máy nén điều hòa').relation,'related_part');
    assert.equal(evaluatePartsCandidateRelevance('giàn nóng','giàn lạnh').relation,'related_part');
    assert.equal(evaluatePartsCandidateRelevance('két nước','giàn nóng').relation,'related_part');
});
test('unknown or failed AI decisions never auto-select the only remaining candidate',async()=>{
    const uncertain=classifier({decision:'uncertain'});
    let result=await uncertain.refine('bơm nước',['Bơm làm mát']);
    assert.equal(result.candidates[0].relevance_verified,false);
    assert.equal(uncertain.draft(result.candidates,'bơm nước').size,0);
    const failed=classifier({broken:true});result=await failed.refine('bơm nước',['Bơm làm mát']);
    assert.ok(result.validationNotice);assert.equal(failed.draft(result.candidates,'bơm nước').size,0);
});
test('local component/position/technology guards override an incorrect positive AI answer',async()=>{
    const app=classifier();
    const result=await app.refine('đèn pha LED trái',['Đèn pha halogen trái','Đèn pha LED phải','Đèn pha LED','Đèn pha trái']);
    assert.equal(result.relatedCandidates.length,2);
    assert.ok(result.candidates.every(c=>c.relation==='uncertain'&&!c.relevance_verified));
    assert.equal(app.draft(result.candidates,'đèn pha LED trái').size,0);
    assert.equal(app.draft([{name:'Bộ hơi máy nén',relation:'same_part',relevance_verified:true}],'máy nén').size,0);
});
test('routing requires meaningful identity evidence instead of just any valid AI response',()=>{
    assert.equal(canRoutePartsCandidate('máy nén','Giàn nóng'),false);
    assert.equal(canRoutePartsCandidate('giàn nóng','Thanh đứng khung xương két nước'),false);
    assert.equal(canRoutePartsCandidate('máy nén','Bộ hơi máy nén'),false);
    assert.equal(canRoutePartsCandidate('giàn nóng','Dàn nóng'),true);
    assert.equal(canRoutePartsCandidate('lốc lạnh','Máy nén điều hòa'),true);
    assert.equal(canRoutePartsCandidate('bơm nước','Công tắc đèn'),false);
});
