import test from 'node:test';
import assert from 'node:assert/strict';
import {exactKnowledgeKey,knowledgeReviewHint,autoReviewKnowledgeRows} from '../assets/js/knowledge-automation.mjs';

const row=(id,alias='ba đờ sốc trước',canonical_name='CẢN TRƯỚC')=>({id,alias,canonical_name,status:'pending',review_method:'manual'});
test('only case, whitespace and Unicode composition are exact equivalences',()=>{
    assert.equal(exactKnowledgeKey('  CẢN   TRƯỚC '),exactKnowledgeKey('cản trước'.normalize('NFD')));
    for(const [first,second] of [['cản trước','can truoc'],['cần','cản'],['cản trước','ốp cản trước'],['cản trái','cản phải'],['AB-12','AB12']])assert.notEqual(exactKnowledgeKey(first),exactKnowledgeKey(second));
});
test('new synonyms stay in trial and different parts have a review hint',()=>{
    assert.match(knowledgeReviewHint(row('a')),/chưa tự duyệt/);
    assert.match(knowledgeReviewHint(row('b','cản trước','Ốp crom cản trước')),/loại chi tiết/);
    assert.match(knowledgeReviewHint({...row('c'),status:'approved',review_method:'approved_rule'}),/Tự duyệt/);
});
const client=reply=>({rpc(name,args){assert.equal(name,'kgpt_auto_review_parts_knowledge');return{abortSignal:async()=>typeof reply==='function'?reply(args):reply};}});
test('only pending page IDs are submitted and only acknowledged automatic approvals change rows',async()=>{
    const a=row('a'),b=row('b'),already={...row('old'),status:'rejected'};
    const result=await autoReviewKnowledgeRows({rows:[a,b,already],supabase:client(args=>{
        assert.deepEqual(args.p_ids,['a','b']);return{data:{reviewed:[{...a,status:'approved',review_method:'exact_name'},{...row('foreign'),status:'approved',review_method:'exact_name'}],held:[{id:'b',reason:'Cần kiểm tra tên gọi mới.'}]}};
    })});
    assert.equal(result.reviewed,1);assert.equal(result.rows[0].status,'approved');assert.equal(result.rows[1].status,'pending');assert.equal(result.rows[1].automation_hint,'Cần kiểm tra tên gọi mới.');assert.equal(result.rows[2],already);
});
test('RPC failure, malformed response and account changes leave original selections untouched',async()=>{
    const rows=[row('a')];
    for(const response of [{error:true},{data:{}},()=>{throw Error('network');}]){
        const result=await autoReviewKnowledgeRows({rows,supabase:client(response)});
        assert.equal(result.rows,rows);assert.equal(result.reviewed,0);assert.equal(result.error,true);
    }
    let current=true;
    const result=await autoReviewKnowledgeRows({rows,isCurrent:()=>current,supabase:client(()=>{current=false;return{data:{reviewed:[{...rows[0],status:'approved',review_method:'exact_name'}],held:[]}};})});
    assert.equal(result.rows,rows);assert.equal(result.reviewed,0);
});
test('empty pages and stale owners never call server; batches are limited to 25 pending rows',async()=>{
    const never={rpc(){assert.fail('Unexpected RPC');}};
    await autoReviewKnowledgeRows({rows:[],supabase:never});await autoReviewKnowledgeRows({rows:[row('a')],supabase:never,isCurrent:()=>false});
    const rows=Array.from({length:40},(_,i)=>row(String(i)));
    await autoReviewKnowledgeRows({rows,supabase:client(args=>{assert.equal(args.p_ids.length,25);return{data:{reviewed:[],held:[]}};})});
});
