import {sameKnowledgeScope,normalizePartName} from './parts-search-intelligence.mjs?v=20261019-passive-v1';
import {createPartsKnowledgePage} from './parts-knowledge-page.mjs?v=20261019-knowledge-ui-v6';
const scope=c=>({brand:String(c.brand || ''),models:[...new Set(c.models || [])].map(String).sort(),years:[...new Set((c.years || []).map(Number))].sort((a,b)=>a-b),kind:c.kind || 'all'});
const namesOf=list=>[...new Set((list || []).filter(n=>typeof n==='string'&&n.trim().length>=2&&n.length<=180).map(n=>n.trim()))].slice(0,40);
export function createPartsSearchLearning({supabase,getOwner,isAdmin,canSearch}){
    let epoch=0,authenticatedId=null,manualDraft=null;
    const recent=new Map();
    const page=createPartsKnowledgePage({supabase,getOwner,isAdmin});
    function valid(owner,revision=epoch){return !!owner&&getOwner()===owner&&revision===epoch&&canSearch();}
    function notice(text){const node=document.getElementById('partsLearningStatus');if(node)node.textContent=text;}
    supabase.auth.onAuthStateChange((event,session)=>{
        const next=session?.user?.id || '';
        if(authenticatedId!==null&&next!==authenticatedId){epoch++;recent.clear();manualDraft=null;page.clear();notice('');}
        authenticatedId=next;
    });
    function schedule(draft,event,{names=[],origin='system',applied=false}={}){
        if(!draft)return;
        const owner=draft.owner,revision=draft.epoch;
        const payload={original_query:draft.originalQuery,resolved_query:draft.resolvedQuery,context:scope(draft.context),answers:{...draft.answers},candidates:structuredClone(draft.candidates),selected_names:[...draft.selectedNames],outcome:draft.outcome,confirmed:false};
        const eventPayload={origin,...(names.length||event==='selection_changed'?{names:namesOf(names)}:{}),...(event==='results_ready'?{count:draft.candidates.length}:{})};
        async function operation(){
            if(!valid(owner,revision))return;
            const query=draft.persisted?supabase.from('parts_search_sessions').update(payload).eq('id',draft.id).eq('user_id',owner)
                :supabase.from('parts_search_sessions').insert({...payload,id:draft.id,user_id:owner,source:draft.source,previous_session_id:draft.previousId || null});
            let result=await query.select('id').abortSignal(AbortSignal.timeout(12000));
            if(result.error?.code==='23505'&&!draft.persisted&&valid(owner,revision))result=await supabase.from('parts_search_sessions').update(payload).eq('id',draft.id).eq('user_id',owner).select('id').abortSignal(AbortSignal.timeout(12000));
            if(!valid(owner,revision))return;
            if(result.error||!result.data?.length)throw Error('session');
            draft.persisted=true;
            if(applied){
                const {error}=await supabase.rpc('kgpt_observe_parts_search',{p_session_id:draft.id,p_names:namesOf(names)}).abortSignal(AbortSignal.timeout(15000));
                if(error)throw Error('observation');
            }else if(event){
                const {error}=await supabase.from('parts_search_events').insert({session_id:draft.id,event_type:event,payload:eventPayload}).abortSignal(AbortSignal.timeout(12000));
                if(error)throw Error('event');
            }
            if(valid(owner,revision))draft.saveError=false;
        }
        draft.queue=(draft.queue || Promise.resolve()).catch(()=>{}).then(operation).catch(()=>{
            draft.saveError=true;
            if(valid(owner,revision))notice('Tạm thời chưa ghi nhận được lịch sử tra cứu.');
        });
    }
    function begin(terms,criteria,{source='single',mode='passive'}={}){
        const owner=getOwner();if(!valid(owner))return [];
        return terms.map(query=>{
            const context=scope(criteria),key=owner+':'+mode+':'+JSON.stringify(context),previous=recent.get(key);
            const draft={id:crypto.randomUUID(),owner,epoch,source,originalQuery:query.slice(0,180),resolvedQuery:query.slice(0,180),answers:{mode},context,candidates:[],selectedNames:[],outcome:'started',persisted:false,
                previousId:source==='single'&&previous?.persisted&&previous.originalQuery!==query&&Date.now()-previous.started<300000?previous.id:null,started:Date.now()};
            if(source==='single'){recent.set(key,draft);if(recent.size>100)recent.delete(recent.keys().next().value);}
            schedule(draft,'search_started',{origin:mode==='manual'?'manual':source==='batch'?'batch':'ai'});
            return draft;
        });
    }
    async function search(criteria,options,rawSearch) {
        const owner=getOwner(),revision=epoch;
        const timeout=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000);
        const {data,error}=await supabase.from('parts_search_knowledge').select('id,alias,canonical_name,brand,models,years,kind,note').eq('status','approved').eq('alias_key',normalizePartName(criteria.query)).eq('brand',criteria.brand).limit(100).abortSignal(timeout);
        if(!valid(owner,revision)||options.signal?.aborted)throw new DOMException('Yêu cầu đã thay đổi.','AbortError');
        const rules=error?[]:[...new Map((data || []).filter(rule=>sameKnowledgeScope(rule,criteria)).map(rule=>[rule.canonical_name,rule])).values()];
        const known=[];
        for(const rule of rules){
            let query=supabase.from('lich_su_bao_gia').select('id',{count:'exact',head:true}).eq('ten_phu_tung',rule.canonical_name).eq('hang_xe',criteria.brand).in('hieu_xe',criteria.models);
            if(criteria.years?.length)query=query.in('nam_sx',criteria.years.map(Number));
            if(criteria.kind==='genuine')query=query.eq('chinh_hang','Chính hãng');
            if(criteria.kind==='aftermarket')query=query.in('chinh_hang',['Thay thế','Hàng ngoài']);
            query=query.abortSignal(options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000));
            const {count,error:warehouseError}=await query;
            if(!valid(owner,revision)||options.signal?.aborted)throw new DOMException('Yêu cầu đã thay đổi.','AbortError');
            if(!warehouseError&&count>0)known.push({name:rule.canonical_name,record_count:count,knowledge_verified:true,knowledge_id:rule.id});
        }
        if(known.length)return {normalized_name:criteria.query,candidates:known,knowledge_used:true,clarification:'Đối chiếu bằng kiến thức đã duyệt; tên vẫn tồn tại trong kho theo đúng bộ lọc.'};
        return rawSearch(criteria,options);
    }
    function ready(draft,refined){
        if(!draft)return;
        const entries=[...(refined.candidates || []),...(refined.relatedCandidates || [])];
        const names=namesOf(entries.flatMap(c=>[c.name,...(c.names || [])]));
        const fingerprint=JSON.stringify(names);
        draft.candidates=names.map(name=>({name,relation:refined.candidates?.some(c=>c.name===name&&c.relation==='same_part')?'same_part':'review'}));
        draft.selectedNames=draft.selectedNames.filter(name=>names.includes(name));
        draft.outcome=draft.selectedNames.length?'selected':names.length?'ready':'not_found';
        if(fingerprint===draft.readyFingerprint)return;
        draft.readyFingerprint=fingerprint;schedule(draft,'results_ready');
    }
    function selection(draft,names,origin='checkbox'){
        if(!draft)return;
        const selected=namesOf(names),changed=JSON.stringify([...selected].sort())!==JSON.stringify([...draft.selectedNames].sort());
        draft.selectedNames=selected;
        draft.candidates=namesOf([...selected,...draft.candidates.map(c=>c.name)]).map(name=>draft.candidates.find(c=>c.name===name)||{name,relation:'review'});
        draft.outcome=selected.length?'selected':draft.candidates.length?'ready':'not_found';
        if(changed)schedule(draft,'selection_changed',{names:selected,origin});
    }
    function applied(draft,names){
        if(!draft||!names.length)return;
        selection(draft,names,'apply');schedule(draft,null,{names,origin:'apply',applied:true});
    }
    function startManual(criteria){
        if(criteria.query.length<2)return;
        const draft=begin([criteria.query],criteria,{mode:'manual'})[0];
        if(draft){manualDraft=draft;draft.openedNames=new Set();}return draft;
    }
    function recordManual(criteria,names,existing){
        const draft=existing || startManual(criteria);
        if(draft)ready(draft,{candidates:namesOf(names).map(name=>({name}))});
    }
    function openedManual(criteria,name){
        const draft=manualDraft;
        if(!draft||!valid(draft.owner,draft.epoch)||!name||draft.openedNames.has(name))return;
        if(criteria.query.normalize('NFC').toLowerCase().trim()!==draft.originalQuery.normalize('NFC').toLowerCase().trim()||JSON.stringify(scope(criteria))!==JSON.stringify(scope(draft.context)))return;
        draft.openedNames.add(name);applied(draft,[...draft.openedNames]);
    }
    return {begin,search,ready,selection,applied,startManual,recordManual,openedManual,
        assess:(_draft,refined)=>refined,hasMissing:()=>false,
        fail:draft=>{if(draft){draft.outcome='error';schedule(draft,'search_failed');}},
        showPage:()=>page.show(document.getElementById('searchKnowledgeSection')),
        clearPage:()=>page.clear(),
        openHistory:()=>window.tiNavigate?.('knowledge',document.getElementById('tiSearchKnowledgeNav')),
        notice};
}
