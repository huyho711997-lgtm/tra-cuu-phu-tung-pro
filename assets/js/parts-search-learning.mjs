import { clarificationQuestions, resolveSearchQuery, sameKnowledgeScope, unresolvedQuestions, applyUnresolvedQuestions, normalizePartName } from './parts-search-intelligence.mjs';

const labels = {started:'Đã bắt đầu',clarifying:'Đang bổ sung',ready:'Đã tìm tên',selected:'Đã chọn',not_found:'Chưa có tên phù hợp',error:'Tìm kiếm gặp lỗi',abandoned:'Đã hủy',pending:'Chờ duyệt',approved:'Đã duyệt',rejected:'Từ chối',disabled:'Ngừng áp dụng'};
const scope = c => ({brand:String(c.brand || ''),models:[...new Set(c.models || [])].map(String).sort(),years:[...new Set((c.years || []).map(Number))].sort((a,b)=>a-b),kind:c.kind || 'all'});
const scopeLabel = c => [c.brand,(c.models || []).join(', '),(c.years || []).join(', ') || 'Chưa giới hạn năm',({all:'Tất cả loại hàng',genuine:'Chính hãng',aftermarket:'Hàng ngoài'})[c.kind || 'all']].filter(Boolean).join(' · ');
const el = (tag, text, cls) => {const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const button = (label, action, primary=false) => {const node=el('button',label,primary?'pl-button pl-primary':'pl-button');node.type='button';node.addEventListener('click',action);return node;};
const dateLabel = date => new Date(date).toLocaleString('vi-VN');
const candidateNames = candidates => [...new Set((candidates || []).flatMap(c=>[c.name,...(c.names || [])]).filter(Boolean))];
const answerLabels={component:'Loại máy nén',position:'Vị trí',side:'Bên xe',technology:'Công nghệ đèn',vehicle_year:'Năm sản xuất',description:'Mô tả đã sửa'};
const answerValue=value=>({unknown:'Chưa rõ',from_filter:'Theo bộ lọc',ac:'Máy nén điều hòa',air:'Máy nén khí',internals:'Bộ hơi máy nén',front:'Phía trước',rear:'Phía sau',left:'Bên trái',right:'Bên phải',led:'LED',halogen:'Halogen',xenon:'Xenon'})[value] || String(value);
function appendAnswers(host,answers){for(const [key,value] of Object.entries(answers || {})){if(key==='mode')continue;host.append(el('p',(answerLabels[key] || key)+': '+answerValue(value)));}}

export function createPartsSearchLearning({supabase,getOwner,isAdmin,canSearch}) {
    let preparing=false, currentWizard=null, epoch=0, authenticatedId=null;
    const dialogs=new Set();
    function notice(text,error=false) {
        const node=document.getElementById('partsLearningStatus');
        if(node){node.textContent=text;node.dataset.error=String(error);}
    }
    function valid(owner,revision=epoch){return !!owner&&getOwner()===owner&&revision===epoch&&canSearch();}
    function modal(title) {
        const dialog=el('dialog',undefined,'pl-dialog'),header=el('header'),heading=el('h2',title),close=button('Đóng',()=>dialog.close());
        const body=el('div',undefined,'pl-body'),status=el('p','','pl-status'),footer=el('footer');
        heading.id='pl-title-'+crypto.randomUUID();dialog.setAttribute('aria-labelledby',heading.id);status.setAttribute('role','status');
        header.append(heading,close);dialog.append(header,body,status,footer);document.body.append(dialog);dialogs.add(dialog);
        dialog.addEventListener('close',()=>{dialogs.delete(dialog);dialog.remove();},{once:true});
        dialog.showModal();return {dialog,body,status,footer};
    }
    supabase.auth.onAuthStateChange((event,session)=>{
        const next=session?.user?.id || '';
        if(authenticatedId!==null&&next!==authenticatedId){
            epoch++;for(const dialog of dialogs)dialog.close();notice('');
        }
        authenticatedId=next;
    });
    async function persist(draft) {
        const owner=draft.owner,revision=draft.epoch;
        const payload={original_query:draft.originalQuery,resolved_query:draft.resolvedQuery,context:scope(draft.context),answers:{...draft.answers},
            candidates:draft.candidates || [],selected_names:draft.selectedNames || [],outcome:draft.outcome,confirmed:!!draft.confirmed,updated_at:new Date().toISOString()};
        const operation=async()=>{
            if(!valid(owner,revision))return false;
            const query=draft.persisted
                ? supabase.from('parts_search_sessions').update(payload).eq('id',draft.id).eq('user_id',owner)
                : supabase.from('parts_search_sessions').insert({...payload,id:draft.id,user_id:owner,source:draft.source});
            let {data,error}=await query.select('id').abortSignal(AbortSignal.timeout(12000));
            if(error?.code==='23505'&&!draft.persisted&&valid(owner,revision)){
                const retry=await supabase.from('parts_search_sessions').update(payload).eq('id',draft.id).eq('user_id',owner).select('id').abortSignal(AbortSignal.timeout(12000));
                data=retry.data;error=retry.error;
            }
            if(!valid(owner,revision))return false;
            if(error||!data?.length){draft.saveError=true;notice('Chưa lưu được phiên tìm kiếm. Bạn có thể thử lưu lại trong phần xác nhận kết quả.',true);return false;}
            draft.persisted=true;draft.saveError=false;return true;
        };
        draft.queue=(draft.queue || Promise.resolve()).catch(()=>false).then(operation).catch(()=>{draft.saveError=true;if(valid(owner,revision))notice('Mất kết nối khi lưu lịch sử tìm kiếm.',true);return false;});
        return draft.queue;
    }
    async function clarify(terms,criteria,{source='single',previous=null,isCurrent=()=>true}={}) {
        if(preparing)return null;
        const owner=getOwner(),revision=epoch;
        if(!valid(owner,revision))return null;
        preparing=true;
        const drafts=terms.map((query,index)=>({id:crypto.randomUUID(),owner,epoch:revision,source,originalQuery:query,resolvedQuery:query,
            answers:{...(previous?.[index]?.answers || {})},context:scope(criteria),outcome:'clarifying',confirmed:false,candidates:[],selectedNames:[]}));
        try {
            await Promise.all(drafts.map(d=>persist(d)));
            if(!valid(owner,revision)||!isCurrent())return null;
            let year='';
            const steps=[];
            const years=[...new Set(Array.from(document.querySelectorAll('input[name="nam_sx"]')).map(n=>n.value))].sort().reverse();
            if(!previous&&!criteria.years?.length&&years.length)steps.push({key:'year',title:'Bạn biết năm sản xuất của xe không?',years});
            drafts.forEach((draft,index)=>{
                clarificationQuestions(draft.originalQuery).forEach(question=>steps.push({...question,index}));
                if(previous)steps.push({key:'description',title:'Chỉnh mô tả dùng để tìm kiếm',index});
            });
            if(steps.length){
                const view=modal('Bổ sung thông tin tìm kiếm');currentWizard=view.dialog;
                const completed=await new Promise(resolve=>{
                    let cursor=0,finished=false;
                    view.dialog.addEventListener('close',()=>resolve(finished),{once:true});
                    function render(){
                        const step=steps[cursor],draft=drafts[step.index];view.body.replaceChildren();view.footer.replaceChildren();
                        view.body.append(el('p',scopeLabel(criteria),'pl-muted'),el('p','Bước '+(cursor+1)+' / '+steps.length,'pl-kicker'));
                        if(draft)view.body.append(el('h3',draft.originalQuery));
                        view.body.append(el('p',step.title,'pl-question'));
                        let read;
                        if(step.key==='year'){
                            const select=el('select');select.setAttribute('aria-label','Năm sản xuất');
                            const unknown=el('option','Chưa rõ — giữ tất cả năm');unknown.value='';select.append(unknown);
                            step.years.forEach(value=>{const option=el('option',value);option.value=value;select.append(option);});select.value=year;view.body.append(select);read=()=>year=select.value;
                        }else if(step.key==='description'){
                            const input=el('input');input.type='text';input.maxLength=180;input.value=draft.answers.description || resolveSearchQuery(draft.originalQuery,draft.answers);input.setAttribute('aria-label','Mô tả tìm kiếm');view.body.append(input);
                            read=()=>{const value=input.value.trim();if(value.length<2){view.status.textContent='Mô tả cần ít nhất 2 ký tự.';return false;}draft.answers.description=value;};
                        }else{
                            const choices=el('div',undefined,'pl-choices');
                            [...step.options,['unknown','Chưa rõ','']].forEach(([id,label])=>{
                                const row=el('label'),input=el('input');input.type='radio';input.name='pl-answer';input.value=id;input.checked=(draft.answers[step.key] || 'unknown')===id;row.append(input,el('span',label));choices.append(row);
                            });view.body.append(choices);read=()=>{const value=choices.querySelector('input:checked')?.value || 'unknown';if(draft.answers[step.key]!==value)delete draft.answers.description;draft.answers[step.key]=value;};
                        }
                        view.body.append(el('p','Chỉ bổ sung điều bạn biết. Phần chưa rõ sẽ cần xác nhận khi chọn tên kho.','pl-muted'));
                        if(cursor)view.footer.append(button('Quay lại',()=>{if(read()===false)return;cursor--;render();}));
                        view.footer.append(button('Hủy tìm kiếm',()=>view.dialog.close()),button(cursor===steps.length-1?'Áp dụng và tìm kiếm':'Tiếp tục',()=>{
                            if(read()===false)return;
                            if(cursor<steps.length-1){cursor++;render();}else{finished=true;view.dialog.close();}
                        },true));
                        view.status.textContent='';
                        view.body.querySelector('input,select')?.focus();
                    }render();
                });
                currentWizard=null;
                if(!completed||!valid(owner,revision)||!isCurrent()){
                    drafts.forEach(d=>d.outcome='abandoned');await Promise.all(drafts.map(d=>persist(d)));return null;
                }
            }
            // Update the actual vehicle filter so subsequent price lookups use the same scope.
            if(year){document.querySelectorAll('input[name="nam_sx"]').forEach(input=>input.checked=input.value===year);window.onNamSXChange?.();}
            const context={...scope(criteria),years:year?[Number(year)]:scope(criteria).years};
            for(const draft of drafts){draft.context=context;draft.answers.vehicle_year=year || (criteria.years?.length?'from_filter':'unknown');draft.resolvedQuery=resolveSearchQuery(draft.originalQuery,draft.answers);draft.outcome='started';}
            await Promise.all(drafts.map(d=>persist(d)));
            if(!valid(owner,revision))return null;
            return drafts;
        }finally{preparing=false;}
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
    async function ready(draft,refined){
        draft.candidates=candidateNames([...(refined.candidates || []),...(refined.relatedCandidates || [])]).slice(0,40).map(name=>({name,relation:refined.candidates?.some(c=>c.name===name&&c.relation==='same_part')?'same_part':'review'}));
        const previous=draft.selectedNames || [];
        draft.selectedNames=previous.filter(name=>draft.candidates.some(candidate=>candidate.name===name));
        if(draft.selectedNames.length!==previous.length)draft.confirmed=false;
        draft.outcome=draft.selectedNames.length?'selected':draft.candidates.length?'ready':'not_found';await persist(draft);
    }
    async function recordManual(criteria,names){
        const owner=getOwner();if(!valid(owner)||criteria.query.length<2)return;
        const draft={id:crypto.randomUUID(),owner,epoch,source:'single',originalQuery:criteria.query.slice(0,180),resolvedQuery:criteria.query.slice(0,180),context:scope(criteria),answers:{mode:'manual'},candidates:[...new Set(names)].slice(0,40).map(name=>({name})),selectedNames:[],confirmed:false,outcome:names.length?'ready':'not_found'};
        await persist(draft);
    }
    function selection(draft,names){
        if(!draft)return;
        const same=JSON.stringify([...(draft.selectedNames || [])].sort())===JSON.stringify([...names].sort());
        draft.selectedNames=names.slice(0,40);
        draft.candidates=[...new Set([...draft.selectedNames,...(draft.candidates || []).map(candidate=>candidate.name)])].slice(0,40).map(name=>(draft.candidates || []).find(candidate=>candidate.name===name)||{name,relation:'review'});
        if(!same)draft.confirmed=false;
        draft.outcome=names.length?'selected':draft.candidates.length?'ready':'not_found';return persist(draft);
    }
    function feedback(host,draft,getNames,onEdit,isCurrent=()=>true,{onNoMatch=()=>{},onBusy=()=>{}}={}){
        if(!draft)return;
        const box=el('div',undefined,'pl-feedback'),summary=el('p','Mô tả tìm kiếm: '+draft.resolvedQuery,'pl-muted'),actions=el('div',undefined,'pl-actions'),message=el('p','','pl-status');message.setAttribute('role','status');
        const note=el('input');note.type='text';note.maxLength=1000;note.placeholder='Ghi chú nghiệp vụ (không bắt buộc)';note.setAttribute('aria-label','Ghi chú xác nhận tên phụ tùng');
        const confirm=button('Xác nhận đúng tên đã chọn',async()=>{
            if(!isCurrent()||!valid(draft.owner,draft.epoch))return;
            const names=getNames();if(!names.length){message.textContent='Chọn tên kho phù hợp trước khi xác nhận.';return;}
            if(names.length>40){message.textContent='Mỗi phiên xác nhận tối đa 40 tên kho.';return;}
            box.querySelectorAll('button,input').forEach(node=>node.disabled=true);onBusy(true);message.textContent='Đang lưu xác nhận…';
            try{
                await selection(draft,names);if(draft.saveError)throw Error('Chưa lưu được phiên. Hãy thử lại.');
                if(!isCurrent()||!valid(draft.owner,draft.epoch))return;
                const {data,error}=await supabase.rpc('kgpt_confirm_parts_search',{p_session_id:draft.id,p_names:names,p_note:note.value.trim()}).abortSignal(AbortSignal.timeout(20000));
                if(!isCurrent()||!valid(draft.owner,draft.epoch))return;
                if(error)throw Error('Chưa gửi được xác nhận. Hãy thử lại.');
                draft.confirmed=true;message.textContent=data.proposals?'Đã xác nhận và gửi đề nghị kiến thức để quản trị viên duyệt.':'Đã xác nhận; kiến thức tương ứng đã được ghi nhận.';notice(message.textContent);
            }catch(error){if(valid(draft.owner,draft.epoch))message.textContent=error.message;}finally{box.querySelectorAll('button,input').forEach(node=>node.disabled=false);onBusy(false);}
        },true);
        actions.append(confirm,button('Chưa có tên phù hợp',async()=>{
            if(!isCurrent())return;onNoMatch();draft.outcome='not_found';draft.selectedNames=[];draft.confirmed=false;message.textContent=await persist(draft)?'Đã ghi nhận chưa có tên phù hợp. Bạn có thể bổ sung mô tả hoặc sửa bộ lọc.':'Chưa lưu được. Hãy thử lại.';
        }),button('Bổ sung / sửa mô tả',()=>{if(isCurrent())onEdit();}));
        box.append(summary,note,actions,message);host.append(box);
    }
    async function openHistory(){
        if(!getOwner()||!canSearch()){notice('Vui lòng đăng nhập bằng tài khoản có quyền tra cứu.',true);return;}
        const owner=getOwner(),revision=epoch,view=modal('Lịch sử & kiến thức tìm kiếm'),tabs=el('nav',undefined,'pl-tabs'),list=el('div');let mode='mine',page=0,loadVersion=0;
        const modes=[['mine','Lịch sử của tôi'],...(isAdmin()?[['pending','Chờ duyệt'],['approved','Đã duyệt'],['rejected','Từ chối'],['disabled','Ngừng áp dụng'],['insights','Cần cải thiện']]:[])];
        view.body.append(tabs,list);modes.forEach(([value,label])=>tabs.append(button(label,()=>{mode=value;page=0;load();})));
        async function load(){
            const version=++loadVersion;list.replaceChildren(el('p','Đang tải…'));view.footer.replaceChildren();
            tabs.querySelectorAll('button').forEach((node,index)=>node.setAttribute('aria-pressed',String(modes[index][0]===mode)));
            let query;
            if(mode==='mine')query=supabase.from('parts_search_sessions').select('*').eq('user_id',owner).order('created_at',{ascending:false}).range(page*30,page*30+29);
            else if(mode==='insights')query=supabase.from('parts_search_sessions').select('original_query,resolved_query,outcome,confirmed,answers,selected_names').order('created_at',{ascending:false}).limit(500);
            else query=supabase.from('parts_search_knowledge').select('*').eq('status',mode).order('created_at',{ascending:false}).range(page*30,page*30+29);
            const {data,error}=await query;
            if(version!==loadVersion||!valid(owner,revision)||!view.dialog.open)return;
            list.replaceChildren();if(error){list.append(el('p','Chưa tải được dữ liệu. Hãy thử lại.'));return;}
            if(mode==='insights'){
                list.append(el('p','Tổng hợp tối đa 500 phiên mới nhất. Số lượt tìm kiếm không phải số lượt xác nhận đúng.','pl-muted'));
                const questions=el('details'),questionSummary=el('summary','Thống kê câu trả lời bổ sung');questions.append(questionSummary);
                for(const [key,label] of Object.entries(answerLabels)){
                    const asked=(data || []).filter(row=>row.answers?.[key]&&row.answers[key]!=='from_filter');
                    if(!asked.length)continue;
                    const answered=asked.filter(row=>row.answers[key]!=='unknown');
                    questions.append(el('p',label+': '+answered.length+'/'+asked.length+' lượt có bổ sung · '+answered.filter(row=>row.confirmed).length+' phiên đã xác nhận kết quả'));
                }list.append(questions);
                const counts=new Map();for(const row of data || []){const key=normalizePartName(row.original_query),item=counts.get(key)||{name:row.original_query,total:0,missing:0,confirmed:0};item.total++;if(['not_found','error'].includes(row.outcome))item.missing++;if(row.confirmed)item.confirmed++;counts.set(key,item);}
                [...counts.values()].sort((a,b)=>b.missing-a.missing||b.total-a.total).slice(0,50).forEach(item=>{const card=el('article',undefined,'pl-card');card.append(el('h3',item.name),el('p',item.total+' lượt · '+item.missing+' lượt chưa có kết quả hoặc gặp lỗi · '+item.confirmed+' lượt xác nhận'));list.append(card);});
            }else for(const row of data || []){
                const card=el('article',undefined,'pl-card');
                if(mode==='mine'){
                    card.append(el('h3',row.original_query),el('p',scopeLabel(row.context),'pl-muted'),el('p','Tìm theo: '+row.resolved_query),el('p',(labels[row.outcome] || row.outcome)+(row.confirmed?' · Đã xác nhận':' · Chưa xác nhận')+' · '+dateLabel(row.created_at)),el('p','Đã chọn: '+((row.selected_names || []).join(' · ')||'Chưa chọn')));
                    const details=el('details'),summary=el('summary','Câu trả lời & tên đã gợi ý');details.append(summary);appendAnswers(details,row.answers);
                    details.append(el('p','Tên đã gợi ý: '+((row.candidates || []).map(candidate=>candidate.name).join(' · ')||'Chưa có')));card.append(details);
                }else{
                    card.append(el('h3',row.alias+' → '+row.canonical_name),el('p',scopeLabel(row),'pl-muted'),el('p','Yêu cầu gốc: '+row.source_query),el('p',row.note || 'Chưa có ghi chú'));
                    const actions=el('div',undefined,'pl-actions');actions.append(button('Xem nguồn & lịch sử',()=>evidence(row)),button('Xem / duyệt / chỉnh sửa',()=>review(row,load),true));card.append(actions);
                }list.append(card);
            }
            if(!data?.length)list.append(el('p','Chưa có dữ liệu trong mục này.'));
            if(page>0)view.footer.append(button('Trang trước',()=>{page--;load();}));
            view.footer.append(button('Làm mới',load));
            if(mode!=='insights'&&data?.length===30)view.footer.append(button('Trang sau',()=>{page++;load();}));
        }
        async function evidence(row){
            const detail=modal('Nguồn kiến thức & lịch sử thay đổi');
            const results=await Promise.all([
                row.session_id?supabase.from('parts_search_sessions').select('*').eq('id',row.session_id).maybeSingle():Promise.resolve({data:null,error:null}),
                supabase.from('parts_search_knowledge_audit').select('action,before_data,after_data,created_at,actor_id').eq('knowledge_id',row.id).order('created_at',{ascending:false}).limit(50)
            ]);
            if(!valid(owner,revision)||!detail.dialog.open)return;
            if(results.some(r=>r.error)){detail.status.textContent='Chưa tải được bằng chứng.';return;}
            const session=results[0].data,changes=results[1].data || [];
            if(session){const source=el('article',undefined,'pl-card');source.append(el('h3','Phiên tìm kiếm gốc'),el('p',session.original_query+' → '+session.resolved_query),el('p',scopeLabel(session.context),'pl-muted'));appendAnswers(source,session.answers);source.append(el('p','Tên đã chọn: '+(session.selected_names || []).join(' · ')),el('p',session.confirmed?'Người dùng đã xác nhận':'Phiên hiện chưa được xác nhận'));detail.body.append(source);}
            else detail.body.append(el('p','Phiên nguồn không còn tồn tại. Lịch sử duyệt bên dưới vẫn được giữ.'));
            detail.body.append(el('p','Tối đa 50 thay đổi mới nhất.','pl-muted'));
            const actorIds=[...new Set(changes.map(change=>change.actor_id).filter(Boolean))];
            const actors=actorIds.length?await supabase.from('user_profiles').select('id,full_name').in('id',actorIds):{data:[]};
            if(!valid(owner,revision)||!detail.dialog.open)return;
            const actorNames=new Map((actors.data || []).map(actor=>[actor.id,actor.full_name]));
            changes.forEach(change=>{
                const card=el('article',undefined,'pl-card'),after=change.after_data,before=change.before_data;
                card.append(el('h3',(change.action==='proposed'?'Đề nghị mới':labels[change.action] || change.action)+' · '+dateLabel(change.created_at)),el('p','Người thực hiện: '+(actorNames.get(change.actor_id)|| (change.actor_id?'Tài khoản '+change.actor_id.slice(0,8):'Tài khoản đã xóa'))));
                if(before)card.append(el('p','Trước: '+before.alias+' → '+before.canonical_name+' · '+scopeLabel(before)));
                card.append(el('p','Sau: '+after.alias+' → '+after.canonical_name+' · '+scopeLabel(after)),el('p',after.note || 'Chưa có ghi chú'));detail.body.append(card);
            });
        }
        function review(row,onSaved){
            const form=modal('Duyệt kiến thức tìm kiếm'),fields={};
            form.body.append(el('p','Kiến thức chỉ dùng lại khi tên còn trong kho và bộ lọc xe trùng phạm vi đã duyệt.','pl-muted'));
            for(const [key,label,value] of [['alias','Mô tả / tên gọi',row.alias],['canonical_name','Tên chính xác trong kho',row.canonical_name],['brand','Hãng xe',row.brand],['models','Dòng xe (mỗi dòng một tên)',row.models.join('\n')],['years','Năm sản xuất (cách nhau bằng dấu phẩy; trống là chưa giới hạn)',row.years.join(', ')],['note','Căn cứ duyệt / lý do thay đổi',row.note]]){
                const labelNode=el('label',label),input=el(key==='models'||key==='note'?'textarea':'input');input.value=value;input.maxLength=key==='note'?1000:key==='models'?3000:180;labelNode.append(input);form.body.append(labelNode);fields[key]=input;
            }
            const kind=el('select');for(const [value,label] of [['all','Tất cả loại hàng'],['genuine','Chính hãng'],['aftermarket','Hàng ngoài']]){const option=el('option',label);option.value=value;kind.append(option);}kind.value=row.kind;const kindLabel=el('label','Loại hàng');kindLabel.append(kind);form.body.append(kindLabel);
            const checked=el('input');checked.type='checkbox';const checkLabel=el('label',undefined,'pl-check');checkLabel.append(checked,el('span','Tôi đã kiểm tra đây là cùng chi tiết và phạm vi xe áp dụng.'));form.body.append(checkLabel);
            let saving=false;
            async function save(status){
                if(saving||!isAdmin()||!valid(owner,revision))return;
                if(!fields.note.value.trim()){form.status.textContent='Ghi rõ căn cứ hoặc lý do thay đổi.';return;}
                if(status==='approved'&&!checked.checked){form.status.textContent='Cần xác nhận đã kiểm tra loại chi tiết và phạm vi xe.';return;}
                const models=[...new Set(fields.models.value.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean))].sort();
                const years=[...new Set(fields.years.value.split(/[,\s]+/).filter(Boolean).map(Number))].sort((a,b)=>a-b);
                if(!models.length||models.length>30||models.some(m=>m.length>100)||years.some(y=>!Number.isInteger(y)||y<1950||y>2100)||years.length>30||fields.alias.value.trim().length<2||fields.canonical_name.value.trim().length<2||!fields.brand.value.trim()){form.status.textContent='Kiểm tra tên, hãng, dòng xe và năm sản xuất.';return;}
                saving=true;form.footer.querySelectorAll('button').forEach(n=>n.disabled=true);form.status.textContent='Đang lưu…';
                const {data,error}=await supabase.from('parts_search_knowledge').update({alias:fields.alias.value.trim(),canonical_name:fields.canonical_name.value.trim(),brand:fields.brand.value.trim(),models,years,kind:kind.value,note:fields.note.value.trim(),status}).eq('id',row.id).eq('updated_at',row.updated_at).select('id');
                if(!valid(owner,revision)||!form.dialog.open)return;
                saving=false;form.footer.querySelectorAll('button').forEach(n=>n.disabled=false);
                if(error||!data?.length){form.status.textContent='Chưa lưu được hoặc bản ghi đã thay đổi. Đóng và làm mới danh sách để thử lại.';return;}
                form.dialog.close();onSaved();
            }
            form.footer.append(button('Từ chối',()=>save('rejected')),button('Ngừng áp dụng',()=>save('disabled')),button('Lưu chờ duyệt',()=>save('pending')),button('Duyệt & áp dụng',()=>save('approved'),true));
        }
        await load();
    }
    return {clarify,search,ready,selection,feedback,openHistory,recordManual,assess:applyUnresolvedQuestions,hasMissing:draft=>unresolvedQuestions(draft).length>0,
        fail:async draft=>{if(draft){draft.outcome='error';draft.confirmed=false;await persist(draft);}},
        cancel:()=>currentWizard?.close(),notice,isPreparing:()=>preparing};
}
