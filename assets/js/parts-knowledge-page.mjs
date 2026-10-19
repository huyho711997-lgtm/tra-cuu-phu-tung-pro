const labels={started:'Đã bắt đầu',clarifying:'Bổ sung theo luồng cũ',ready:'Có kết quả',selected:'Có lựa chọn',not_found:'Không có kết quả',error:'Gặp lỗi',abandoned:'Đã hủy',pending:'Chờ duyệt',approved:'Đã duyệt',rejected:'Từ chối',disabled:'Ngừng áp dụng'};
const eventLabels={search_started:'Bắt đầu tra cứu',results_ready:'Nhận kết quả',selection_changed:'Thay đổi lựa chọn',results_applied:'Mở kết quả giá',search_failed:'Tra cứu gặp lỗi'};
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const icons={search:'m21 21-4.4-4.4M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',file:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',open:'M15 3h6v6 M10 14 21 3 M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6',empty:'M9 9l6 6 M15 9l-6 6 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',clock:'M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',check:'m8 12 3 3 5-6 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',refresh:'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-2l2 3 M4 16l2 3a7 7 0 0 0 12-2',download:'M12 3v12 m-5-5 5 5 5-5 M4 16v4h16v-4',filter:'M4 7h16 M7 12h10 M10 17h4',shield:'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z m-4 9 3 3 5-6'};
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');path.setAttribute('d',icons[name] || icons.file);svg.append(path);return svg;}
function setButtonLabel(button,text){const label=button.querySelector('.pk-button-label');if(label)label.textContent=text;else button.textContent=text;}
const btn=(text,action,primary=false,glyph)=>{const n=node('button',undefined,'pl-button pk-button'+(primary?' pk-button-primary':''));n.type='button';if(glyph)n.append(icon(glyph));n.append(node('span',text,'pk-button-label'));n.addEventListener('click',action);return n;};
const date=value=>{const d=new Date(value);return d.toLocaleTimeString('vi-VN')+' · '+d.toLocaleDateString('vi-VN');};
const scope=c=>[c?.brand,(c?.models || []).join(', '),(c?.years || []).join(', ') || 'Tất cả năm',({genuine:'Chính hãng',aftermarket:'Hàng ngoài',all:'Tất cả loại hàng'})[c?.kind || 'all']].filter(Boolean).join(' · ');
const observed=row=>row.evidence_type==='observed'?'Ghi nhận tự động':'Xác nhận theo luồng cũ';
const localDay=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const formatNumber=value=>Number(value || 0).toLocaleString('vi-VN');

export function createPartsKnowledgePage({supabase,getOwner,isAdmin}){
    let host=null,owner='',version=0,controller=null,state=null;
    const dialogs=new Set(),users=new Map();
    function allowed(){return !!owner&&getOwner()===owner&&isAdmin();}
    function clear(){version++;controller?.abort();dialogs.forEach(d=>d.close());dialogs.clear();host?.replaceChildren();host=null;owner='';state=null;users.clear();}
    function dialog(title){
        const d=node('dialog',undefined,'pl-dialog'),header=node('header'),heading=node('h2',title),body=node('div',undefined,'pl-body'),status=node('p','','pl-status'),footer=node('footer');
        heading.id='pk-dialog-'+crypto.randomUUID();d.setAttribute('aria-labelledby',heading.id);status.setAttribute('role','status');
        header.append(heading,btn('Đóng',()=>d.close()));d.append(header,body,status,footer);document.body.append(d);dialogs.add(d);
        d.addEventListener('close',()=>{dialogs.delete(d);d.remove();},{once:true});d.showModal();return {dialog:d,body,status,footer};
    }
    function userName(id){return users.get(id) || (id?'Tài khoản '+id.slice(0,8):'Tài khoản không còn tồn tại');}
    function badge(text,tone='neutral'){const b=node('span',text,'pk-badge');b.dataset.tone=tone;return b;}
    function table(headers,rows){
        const wrap=node('div',undefined,'pk-table-wrap'),t=node('table'),head=node('thead'),tr=node('tr'),body=node('tbody');
        headers.forEach(text=>tr.append(node('th',text)));head.append(tr);t.append(head,body);wrap.append(t);
        for(const cells of rows){const row=node('tr');for(const cell of cells){const td=node('td');td.append(typeof cell==='string'?document.createTextNode(cell):cell);row.append(td);}body.append(row);}
        return wrap;
    }
    function filters(){
        const f=state.fields,from=new Date(f.from.value+'T00:00:00'),end=new Date(f.to.value+'T00:00:00');end.setDate(end.getDate()+1);
        if(!Number.isFinite(+from)||!Number.isFinite(+end)||end<=from)throw Error('Chọn khoảng ngày hợp lệ.');
        return {from:from.toISOString(),to:end.toISOString(),q:f.query.value.replace(/[^\p{L}\p{N}\s_-]/gu,' ').trim().replace(/\s+/g,' ').slice(0,120),user:f.user.value,source:f.source.value};
    }
    function applyBase(query,f){query=query.gte('created_at',f.from).lt('created_at',f.to);if(f.user)query=query.eq('user_id',f.user);if(f.source)query=query.eq('source',f.source);return query;}
    function textFilter(query,fields,value){
        const safe=value.replace(/[^\p{L}\p{N}\s_-]/gu,' ').trim();if(!safe)return query;
        const pattern=JSON.stringify('%'+safe.replace(/[%_]/g,'\\$&')+'%');return query.or(fields.map(field=>field+'.ilike.'+pattern).join(','));
    }
    async function load(){
        if(!allowed()||!state)return;
        let f;try{f=filters();}catch(error){state.status.textContent=error.message;return;}
        controller?.abort();controller=new AbortController();const signal=controller.signal,ticket=++version,view=state;
        view.status.textContent='Đang tải dữ liệu…';view.total.textContent='Đang tải…';view.content.replaceChildren();view.pagination.replaceChildren();view.export.disabled=true;view.metrics.replaceChildren();
        const current=()=>allowed()&&ticket===version&&state===view;
        const stats=supabase.rpc('kgpt_parts_search_overview',{p_from:f.from,p_to:f.to,p_query:f.q,p_user:f.user || null,p_source:f.source || null}).abortSignal(signal);
        let query;
        if(view.mode==='overview'||view.mode==='sessions'){
            query=textFilter(applyBase(supabase.from('parts_search_sessions').select('*',{count:'exact'}),f),['original_query','resolved_query'],f.q).order('created_at',{ascending:false});
            query=view.mode==='overview'?query.limit(500):query.range(view.page*25,view.page*25+24);
        }else if(view.mode==='events'){
            const inner=!!(f.q||f.source),join=inner?'parts_search_sessions!inner':'parts_search_sessions';
            query=supabase.from('parts_search_events').select('*,session:'+join+'(original_query,context,source)',{count:'exact'}).gte('created_at',f.from).lt('created_at',f.to);
            if(f.user)query=query.eq('user_id',f.user);if(f.source)query=query.eq('session.source',f.source);
            if(f.q)query=query.ilike('session.original_query','%'+f.q.replace(/[%_]/g,'\\$&')+'%');
            query=query.order('created_at',{ascending:false}).range(view.page*25,view.page*25+24);
        }else{
            const join=f.source?'parts_search_sessions!inner':'parts_search_sessions';
            query=supabase.from('parts_search_knowledge').select('*,session:'+join+'(source)',{count:'exact'}).eq('status',view.mode).gte('created_at',f.from).lt('created_at',f.to);
            if(f.user)query=query.eq('created_by',f.user);if(f.source)query=query.eq('session.source',f.source);
            query=textFilter(query,['alias','canonical_name','source_query'],f.q).order('created_at',{ascending:false}).range(view.page*25,view.page*25+24);
        }
        const results=await Promise.allSettled([stats,query.abortSignal(signal)]);
        if(!current())return;
        const overview=results[0].status==='fulfilled'?results[0].value:{error:true};
        const rows=results[1].status==='fulfilled'?results[1].value:{error:true};
        if(!overview.error){
            for(const [key,title,glyph,tone] of [['sessions','Phiên tra cứu','search','blue'],['applied','Phiên đã mở giá','open','violet'],['not_found','Không có kết quả','empty','rose'],['pending','Gợi ý chờ duyệt','clock','amber'],['approved','Kiến thức đã duyệt','check','green']]){const card=node('article',undefined,'pk-metric'),symbol=node('span',undefined,'pk-metric-icon'),copy=node('div');card.dataset.tone=tone;symbol.append(icon(glyph));copy.append(node('strong',formatNumber(overview.data?.[key])),node('span',title));card.append(symbol,copy);view.metrics.append(card);}
            const pending=Number(overview.data?.pending || 0);
            view.nextTitle.textContent=pending>0?'Bước tiếp theo: kiểm tra '+formatNumber(pending)+' gợi ý trong bộ lọc':'Chưa có gợi ý chờ duyệt trong bộ lọc';
            view.nextCopy.textContent=pending>0?'Mở từng gợi ý, xem nguồn, đối chiếu tên kho và phạm vi xe rồi duyệt tên đúng. Chỉ kiến thức đã duyệt mới được dùng lại.':'Hệ thống tạo gợi ý khi người dùng mở kết quả tra cứu có hãng và dòng xe. Bạn có thể đổi bộ lọc để xem các gợi ý khác.';
            setButtonLabel(view.nextButton,'Mở gợi ý chờ duyệt'+(pending>0?' ('+formatNumber(pending)+')':''));
        }else{
            view.nextTitle.textContent='Kiểm tra gợi ý để bổ sung kiến thức';
            view.nextCopy.textContent='Chưa tải được số lượng gợi ý. Bạn vẫn có thể mở danh sách chờ duyệt để kiểm tra.';
            setButtonLabel(view.nextButton,'Mở gợi ý chờ duyệt');
        }
        if(rows.error){view.status.textContent='Chưa tải được dữ liệu. Kiểm tra kết nối và bấm Làm mới.';return;}
        view.rows=rows.data || [];view.count=rows.count || 0;
        setButtonLabel(view.export,view.mode==='overview'?'Xuất mẫu phiên':'Xuất trang hiện tại');
        view.total.textContent=formatNumber(view.count)+' bản ghi';
        if(view.mode==='overview')renderOverview(view,view.rows);
        else if(view.mode==='sessions')renderSessions(view,view.rows);
        else if(view.mode==='events')renderEvents(view,view.rows);
        else renderKnowledge(view,view.rows);
        if(!view.rows.length)view.content.append(node('div',view.mode==='pending'?'Chưa có gợi ý chờ duyệt trong bộ lọc. Gợi ý được tạo khi người dùng mở kết quả tra cứu có hãng và dòng xe.':view.mode==='approved'?'Chưa có kiến thức đã duyệt trong bộ lọc. Mở Gợi ý chờ duyệt để kiểm tra và duyệt tên đúng.':'Không có dữ liệu phù hợp với bộ lọc.','pk-empty'));
        if(view.mode!=='overview'){
            view.pagination.append(node('span',formatNumber(view.count)+' bản ghi · Trang '+(view.page+1)));
            const prev=btn('Trang trước',()=>{view.page--;load();});prev.disabled=view.page===0;
            const next=btn('Trang sau',()=>{view.page++;load();});next.disabled=(view.page+1)*25>=view.count;view.pagination.append(prev,next);
        }
        view.export.disabled=!view.rows.length;
        view.status.textContent=(overview.error?'Chưa tải được chỉ số tổng hợp. ':'')+'Cập nhật lúc '+new Date().toLocaleTimeString('vi-VN')+'. Chỉ số tổng hợp dựa trên phiên tạo trong khoảng ngày đã chọn.';
    }
    function renderOverview(view,rows){
        view.content.append(node('p','Dùng bảng này để phát hiện từ khóa cần bổ sung kiến thức, ưu tiên các lượt chưa có kết quả hoặc gặp lỗi. Tổng hợp tối đa 500 phiên mới nhất trong bộ lọc.','pk-note'));
        const terms=new Map();for(const row of rows){const key=row.original_query.normalize('NFC').toLowerCase(),item=terms.get(key)||{query:row.original_query,total:0,missing:0,selected:0};item.total++;if(['not_found','error'].includes(row.outcome))item.missing++;if(row.selected_names?.length)item.selected++;terms.set(key,item);}
        view.content.append(table(['Nội dung tìm kiếm','Số phiên','Chưa có kết quả / gặp lỗi','Phiên có lựa chọn'],[...terms.values()].sort((a,b)=>b.missing-a.missing||b.total-a.total).slice(0,50).map(item=>[item.query,String(item.total),String(item.missing),String(item.selected)])));
    }
    function renderSessions(view,rows){
        view.content.append(table(['Tài khoản / thời gian','Yêu cầu tìm kiếm','Phạm vi xe','Kết quả','Chi tiết'],rows.map(row=>{
            const actor=node('div',undefined,'pk-user'),avatar=node('span',userName(row.user_id).trim().split(/\s+/).slice(-2).map(s=>s[0]).join('').toUpperCase(),'pk-avatar'),identity=node('div');identity.append(node('strong',userName(row.user_id)),node('small',date(row.created_at)));actor.append(avatar,identity);
            const query=node('div');query.append(node('strong',row.original_query),node('small',(row.answers?.mode==='manual'?'Tìm thường':row.source==='batch'?'Tìm nhiều phụ tùng':'Tìm bằng AI')+(row.previous_session_id?' · Có lượt tìm trước':'')));
            const outcome=node('div');outcome.append(badge(labels[row.outcome] || row.outcome,({selected:'blue',ready:'blue',not_found:'amber',error:'rose'})[row.outcome] || 'neutral'),node('small',(row.selected_names || []).join(' · ')||'Chưa chọn tên'));
            return [actor,query,scope(row.context),outcome,btn('Xem phiên',()=>sessionDetail(row.id),false,'open')];
        })));
    }
    function renderEvents(view,rows){
        view.content.append(table(['Thời gian','Tài khoản','Thao tác','Nội dung / lựa chọn','Chi tiết'],rows.map(row=>{
            const content=node('div');content.append(node('strong',row.session?.original_query || 'Phiên nguồn không còn tồn tại'),node('small',(row.payload?.names || []).join(' · ') || (row.event_type==='selection_changed'?'Đã bỏ chọn tất cả':row.payload?.count!==undefined?row.payload.count+' tên được ghi nhận':'')));
            return [date(row.created_at),userName(row.user_id),eventLabels[row.event_type] || row.event_type,content,row.session_id?btn('Xem phiên',()=>sessionDetail(row.session_id)):node('span','—')];
        })));
    }
    function renderKnowledge(view,rows){
        view.content.append(node('p',view.mode==='pending'?'Với mỗi gợi ý: xem Nguồn & lịch sử → Duyệt / chỉnh sửa → kiểm tra tên và phạm vi xe → nhập căn cứ → Duyệt & áp dụng. Thao tác mở giá chưa chứng minh đúng phụ tùng.':view.mode==='approved'?'Các tên gọi này được dùng lại trong tra cứu bằng AI khi trùng từ khóa và toàn bộ bộ lọc xe, đồng thời tên còn trong kho.':'Các kiến thức tại đây không được dùng trong tra cứu. Bạn có thể mở nguồn và chỉnh sửa để xem xét lại.','pk-note'));
        view.content.append(table(['Tên gọi → tên kho','Phạm vi xe','Nguồn bằng chứng','Cập nhật','Thao tác'],rows.map(row=>{
            const name=node('div');name.append(node('strong',row.alias+' → '+row.canonical_name),node('small',row.note || 'Chưa có ghi chú'));
            const evidence=node('div');evidence.append(badge(observed(row),row.evidence_type==='observed'?'amber':'blue'),node('small',userName(row.created_by)));
            const actions=node('div',undefined,'pk-row-actions');actions.append(btn('Nguồn & lịch sử',()=>knowledgeEvidence(row)),btn('Duyệt / chỉnh sửa',()=>review(row),true));
            return [name,scope(row),evidence,date(row.updated_at),actions];
        })));
    }
    async function sessionDetail(id){
        if(!allowed())return;const actor=owner,view=dialog('Chi tiết phiên tra cứu');view.status.textContent='Đang tải…';
        const results=await Promise.all([
            supabase.from('parts_search_sessions').select('*').eq('id',id).maybeSingle(),
            supabase.from('parts_search_events').select('*').eq('session_id',id).order('created_at',{ascending:false}).limit(100)
        ]);
        if(!allowed()||owner!==actor||!view.dialog.open)return;
        if(results.some(r=>r.error)){view.status.textContent='Chưa tải được chi tiết phiên.';return;}
        const row=results[0].data;if(!row){view.status.textContent='Phiên nguồn không còn tồn tại.';return;}
        view.status.textContent='';view.body.append(node('h3',row.original_query),node('p',scope(row.context),'pl-muted'),node('p','Người tra cứu: '+userName(row.user_id)),node('p','Tên đã gợi ý: '+(row.candidates || []).map(c=>c.name).join(' · ')),node('p','Lựa chọn hiện tại: '+((row.selected_names || []).join(' · ')||'Chưa chọn')));
        if(row.resolved_query!==row.original_query)view.body.append(node('p','Mô tả sau bổ sung theo luồng cũ: '+row.resolved_query));
        if(row.previous_session_id)view.body.append(btn('Xem lượt tìm trước',()=>sessionDetail(row.previous_session_id)));
        view.body.append(node('p','100 thao tác gần nhất của phiên.','pl-muted'));
        (results[1].data || []).reverse().forEach(event=>{const item=node('article',undefined,'pl-card');item.append(node('h3',eventLabels[event.event_type] || event.event_type),node('p',date(event.created_at),'pl-muted'),node('p',(event.payload?.names || []).join(' · ') || (event.event_type==='selection_changed'?'Đã bỏ chọn tất cả':event.payload?.count!==undefined?event.payload.count+' tên được ghi nhận':'')));view.body.append(item);});
        if(!results[1].data?.length)view.body.append(node('p','Phiên thuộc luồng cũ hoặc chưa có thao tác nền được ghi nhận.'));
    }
    async function knowledgeEvidence(row){
        if(!allowed())return;const actor=owner,view=dialog('Bằng chứng & lịch sử kiến thức');
        view.body.append(node('p',observed(row),'pk-note'),node('h3',row.alias+' → '+row.canonical_name),node('p',scope(row),'pl-muted'));
        if(row.session_id)view.body.append(btn('Xem phiên và thao tác nguồn',()=>sessionDetail(row.session_id)));
        const {data,error}=await supabase.from('parts_search_knowledge_audit').select('*').eq('knowledge_id',row.id).order('created_at',{ascending:false}).limit(50);
        if(!allowed()||owner!==actor||!view.dialog.open)return;
        if(error){view.status.textContent='Chưa tải được lịch sử duyệt.';return;}
        view.body.append(node('p','50 thay đổi gần nhất.','pl-muted'));
        for(const change of data || []){const card=node('article',undefined,'pl-card'),after=change.after_data,before=change.before_data;card.append(node('h3',(change.action==='proposed'?'Tạo gợi ý':labels[change.action] || change.action)+' · '+date(change.created_at)),node('p','Người thực hiện: '+userName(change.actor_id)));if(before)card.append(node('p','Trước: '+before.alias+' → '+before.canonical_name+' · '+scope(before)));card.append(node('p','Sau: '+after.alias+' → '+after.canonical_name+' · '+scope(after)),node('p',after.note || 'Chưa có ghi chú'));view.body.append(card);}
    }
    function review(row){
        if(!allowed())return;const actor=owner,form=dialog('Duyệt kiến thức tìm kiếm'),fields={};
        form.body.append(badge(observed(row),'amber'),node('p','Kiểm tra đúng chi tiết và phạm vi xe trước khi duyệt. Thao tác mở giá không chứng minh người dùng đã chọn đúng.','pl-muted'));
        for(const [key,title,value] of [['alias','Tên gọi tìm kiếm',row.alias],['canonical_name','Tên chính xác trong kho',row.canonical_name],['brand','Hãng xe',row.brand],['models','Dòng xe (mỗi dòng một tên)',row.models.join('\n')],['years','Năm sản xuất (cách nhau bằng dấu phẩy)',row.years.join(', ')],['note','Căn cứ duyệt / lý do thay đổi',row.note]]){
            const label=node('label',title),input=node(key==='models'||key==='note'?'textarea':'input');input.value=value;input.maxLength=key==='note'?1000:key==='models'?3000:key==='brand'?100:180;label.append(input);form.body.append(label);fields[key]=input;
        }
        const kind=node('select');for(const [value,title] of [['all','Tất cả loại hàng'],['genuine','Chính hãng'],['aftermarket','Hàng ngoài']]){const option=node('option',title);option.value=value;kind.append(option);}kind.value=row.kind;const kindLabel=node('label','Loại hàng');kindLabel.append(kind);form.body.append(kindLabel);
        const check=node('input');check.type='checkbox';const checkLabel=node('label',undefined,'pl-check');checkLabel.append(check,node('span','Tôi đã kiểm tra loại chi tiết và phạm vi xe áp dụng.'));form.body.append(checkLabel);let saving=false;
        async function save(status){
            if(saving||!allowed()||owner!==actor)return;
            const models=[...new Set(fields.models.value.split(/[\n,]+/).map(v=>v.trim()).filter(Boolean))].sort(),years=[...new Set(fields.years.value.split(/[,\s]+/).filter(Boolean).map(Number))].sort((a,b)=>a-b);
            if(!fields.note.value.trim()){form.status.textContent='Nhập căn cứ hoặc lý do thay đổi.';return;}
            if(status==='approved'&&!check.checked){form.status.textContent='Cần xác nhận đã kiểm tra nghiệp vụ trước khi duyệt.';return;}
            if(fields.alias.value.trim().length<2||fields.canonical_name.value.trim().length<2||!fields.brand.value.trim()||!models.length||models.length>30||models.some(m=>m.length>100)||years.length>30||years.some(y=>!Number.isInteger(y)||y<1950||y>2100)){form.status.textContent='Kiểm tra lại tên và phạm vi xe.';return;}
            saving=true;form.footer.querySelectorAll('button').forEach(b=>b.disabled=true);form.status.textContent='Đang lưu…';
            const {data,error}=await supabase.from('parts_search_knowledge').update({alias:fields.alias.value.trim(),canonical_name:fields.canonical_name.value.trim(),brand:fields.brand.value.trim(),models,years,kind:kind.value,note:fields.note.value.trim(),status}).eq('id',row.id).eq('updated_at',row.updated_at).select('id').abortSignal(AbortSignal.timeout(15000));
            if(!allowed()||owner!==actor||!form.dialog.open)return;saving=false;form.footer.querySelectorAll('button').forEach(b=>b.disabled=false);
            if(error||!data?.length){form.status.textContent='Chưa lưu được hoặc bản ghi đã thay đổi. Đóng và làm mới danh sách để thử lại.';return;}
            form.dialog.close();load();
        }
        form.footer.append(btn('Từ chối',()=>save('rejected')),btn('Ngừng áp dụng',()=>save('disabled')),btn('Lưu chờ duyệt',()=>save('pending')),btn('Duyệt & áp dụng',()=>save('approved'),true));
    }
    function exportPage(){
        if(!allowed()||!state?.rows.length)return;
        const rows=state.rows.map(row=>state.mode==='events'?[date(row.created_at),userName(row.user_id),eventLabels[row.event_type],row.session?.original_query || '',(row.payload?.names || []).join(' | ')]
            :['overview','sessions'].includes(state.mode)?[date(row.created_at),userName(row.user_id),row.original_query,scope(row.context),labels[row.outcome],(row.selected_names || []).join(' | ')]
            :[date(row.created_at),row.alias,row.canonical_name,scope(row),observed(row),labels[row.status],row.note]);
        const escape=value=>{let s=String(value ?? '');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
        const headers=state.mode==='events'?['Thời gian','Tài khoản','Thao tác','Tìm kiếm','Tên kho']:['overview','sessions'].includes(state.mode)?['Thời gian','Tài khoản','Tìm kiếm','Phạm vi','Kết quả','Đã chọn']:['Thời gian','Tên gọi','Tên kho','Phạm vi','Nguồn','Trạng thái','Ghi chú'];
        const url=URL.createObjectURL(new Blob(['\uFEFF'+[headers,...rows].map(row=>row.map(escape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
        const link=node('a');link.href=url;link.download='kien-thuc-tim-kiem-trang-'+(state.page+1)+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    async function show(root){
        if(!getOwner()||!isAdmin()){clear();return;}
        if(host===root&&owner===getOwner()&&state){await load();return;}
        clear();host=root;owner=getOwner();if(!host)return;
        const hero=node('section',undefined,'pk-hero'),header=node('header',undefined,'pk-header'),copy=node('div'),actions=node('div',undefined,'pk-row-actions');
        copy.append(node('p','TRUNG TÂM KIẾN THỨC','pk-eyebrow'),node('h1','Lịch sử & kiến thức tìm kiếm'),node('p','Xem người dùng tìm gì và duyệt tên gọi đúng để dùng lại cho những lần tra cứu sau.','pk-subtitle'));
        const exportButton=btn('Xuất dữ liệu trang',exportPage,false,'download'),refresh=btn('Làm mới',load,true,'refresh');actions.append(exportButton,refresh);header.append(copy,actions);
        const filtersBox=node('form',undefined,'pk-filters'),fields={};
        function field(key,title,type,choices){const label=node('label',title),input=node(choices?'select':'input');if(type)input.type=type;if(choices)for(const [value,text] of choices){const option=node('option',text);option.value=value;input.append(option);}label.append(input);filtersBox.append(label);fields[key]=input;return input;}
        const today=new Date(),start=new Date();start.setDate(start.getDate()-29);
        const search=field('query','Tìm nội dung / tên phụ tùng','search');search.maxLength=120;search.placeholder='Nhập từ khóa cần tìm…';field('from','Từ ngày','date').value=localDay(start);field('to','Đến ngày','date').value=localDay(today);
        field('user','Tài khoản',null,[['','Tất cả tài khoản']]);field('source','Kiểu tra cứu',null,[['','Tất cả'],['single','Một phụ tùng / tìm thường'],['batch','Nhiều phụ tùng']]);
        filtersBox.append(btn('Áp dụng bộ lọc',()=>{state.page=0;load();},false,'filter'));filtersBox.addEventListener('submit',event=>{event.preventDefault();state.page=0;load();});
        const metrics=node('div',undefined,'pk-metrics'),tabs=node('nav',undefined,'pk-tabs'),content=node('div',undefined,'pk-content'),pagination=node('footer',undefined,'pk-pagination'),status=node('p','','pk-status');status.setAttribute('role','status');
        const workspace=node('section',undefined,'pk-workspace'),panelHead=node('header',undefined,'pk-panel-head'),panelCopy=node('div'),panelTitle=node('h2','Tổng quan tìm kiếm'),panelSubtitle=node('p','Các nội dung được tra cứu và mức độ sử dụng.','pk-panel-subtitle'),total=badge('Đang tải…','blue');panelCopy.append(panelTitle,panelSubtitle);panelHead.append(panelCopy,total);
        tabs.setAttribute('aria-label','Danh mục lịch sử và kiến thức');
        const modes=[['overview','Tổng quan'],['sessions','Phiên tra cứu'],['events','Thao tác'],['pending','Gợi ý chờ duyệt'],['approved','Đã duyệt'],['disabled','Ngừng áp dụng'],['rejected','Từ chối']];
        function selectMode(key){
            if(!allowed()||!state)return;
            const title=modes.find(([mode])=>mode===key)?.[1];if(!title)return;
            state.mode=key;state.page=0;
            panelTitle.textContent=key==='overview'?'Tổng quan tìm kiếm':key==='sessions'?'Lịch sử phiên tra cứu':key==='events'?'Nhật ký thao tác':'Kiến thức · '+title;
            panelSubtitle.textContent=key==='overview'?'Các nội dung được tra cứu và mức độ sử dụng.':key==='sessions'?'Yêu cầu tìm kiếm, phạm vi xe và kết quả của từng phiên.':key==='events'?'Các thao tác được ghi nhận trong quá trình tra cứu.':'Kiểm tra bằng chứng và quản lý kiến thức dùng chung.';
            tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===key)));load();
        }
        const nextStep=node('div',undefined,'pk-next-step'),nextText=node('div'),nextTitle=node('strong','Kiểm tra gợi ý để bổ sung kiến thức','pk-next-title'),nextCopy=node('p','Chỉ tên đã duyệt mới được dùng lại khi trùng từ khóa, phạm vi xe và vẫn còn trong kho.','pk-next-copy'),nextButton=btn('Mở gợi ý chờ duyệt',()=>{selectMode('pending');workspace.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});tabs.querySelector('[data-mode="pending"]')?.focus({preventScroll:true});},true,'check');nextText.append(nextTitle,nextCopy);nextStep.append(nextText,nextButton);
        state={mode:'overview',page:0,fields,metrics,content,pagination,status,total,nextTitle,nextCopy,nextButton,rows:[],count:0,export:exportButton};
        for(const [key,title] of modes){const tab=btn(title,()=>selectMode(key));tab.dataset.mode=key;tab.setAttribute('aria-pressed',String(key==='overview'));tabs.append(tab);}
        const help=node('details',undefined,'pk-help'),steps=node('ol',undefined,'pk-help-steps');help.append(node('summary','Trang này hoạt động thế nào? Xem ví dụ'));
        for(const [title,description] of [['1. Tự động ghi nhận','Lưu từ khóa, bộ lọc xe, tên gợi ý và tên người dùng đã mở. Tab Phiên tra cứu và Thao tác giúp xem lại nguồn.'],['2. Bạn kiểm tra và duyệt','Mở Gợi ý chờ duyệt, xem Nguồn & lịch sử, chọn Duyệt / chỉnh sửa. Kiểm tra tên kho, hãng, dòng, năm, loại hàng rồi nhập căn cứ duyệt.'],['3. Dùng lại khi tìm bằng AI','Khi trùng từ khóa và toàn bộ bộ lọc xe, hệ thống đối chiếu tên đã duyệt với kho. Không có kiến thức phù hợp thì tiếp tục gọi AI.']]){const item=node('li');item.append(node('strong',title),node('p',description));steps.append(item);}
        help.append(steps,node('p','Ví dụ: người dùng tìm “cản trước”, mở tên “CẢN TRƯỚC” trong kho. Hệ thống tạo gợi ý tên gọi → tên kho. Sau khi bạn kiểm tra và duyệt đúng phạm vi xe, lần tìm bằng AI với “cản trước” và cùng bộ lọc sẽ dùng lại tên này nếu vẫn có trong kho. Mở giá chỉ là tín hiệu sử dụng; bạn cần kiểm tra đúng phụ tùng trước khi duyệt.','pk-help-example'));
        const notice=node('p',undefined,'pk-notice');notice.append(icon('shield'),node('span','Tự động ghi nhận trong phạm vi tra cứu: nội dung tìm, bộ lọc xe, lựa chọn và thao tác mở kết quả. Dữ liệu các tài khoản chỉ dành cho quản trị viên.'));
        hero.append(header,metrics,nextStep,help,notice);workspace.append(panelHead,tabs,filtersBox,status,content,pagination);host.append(hero,workspace);
        const actor=owner;
        const {data}=await supabase.from('user_profiles').select('id,full_name,email').order('full_name',{ascending:true}).limit(1000).abortSignal(AbortSignal.timeout(12000));
        if(!allowed()||owner!==actor)return;
        for(const user of data || []){const name=user.full_name || user.email || user.id.slice(0,8);users.set(user.id,name);const option=node('option',name);option.value=user.id;fields.user.append(option);}
        await load();
    }
    return {show,clear};
}
