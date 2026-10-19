const labels={started:'Đã bắt đầu',clarifying:'Bổ sung theo luồng cũ',ready:'Có kết quả',selected:'Có lựa chọn',not_found:'Không có kết quả',error:'Gặp lỗi',abandoned:'Đã hủy',pending:'Chờ duyệt',approved:'Đã duyệt',rejected:'Từ chối',disabled:'Ngừng áp dụng'};
import {autoReviewKnowledgeRows,knowledgeReviewHint} from './knowledge-automation.mjs';
const eventLabels={search_started:'Bắt đầu tra cứu',results_ready:'Nhận kết quả',selection_changed:'Thay đổi lựa chọn',results_applied:'Mở kết quả giá',search_failed:'Tra cứu gặp lỗi'};
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const icons={search:'m21 21-4.4-4.4M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',file:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',open:'M15 3h6v6 M10 14 21 3 M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6',empty:'M9 9l6 6 M15 9l-6 6 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',clock:'M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',check:'m8 12 3 3 5-6 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',refresh:'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-2l2 3 M4 16l2 3a7 7 0 0 0 12-2',download:'M12 3v12 m-5-5 5 5 5-5 M4 16v4h16v-4',filter:'M4 7h16 M7 12h10 M10 17h4',shield:'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z m-4 9 3 3 5-6'};
Object.assign(icons,{edit:'m16 3 5 5 M4 16 16 4a3 3 0 0 1 4 4L8 20l-5 1z',close:'m6 6 12 12 M18 6 6 18',arrow:'M4 12h16 m-6-6 6 6-6 6'});
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');path.setAttribute('d',icons[name] || icons.file);svg.append(path);return svg;}
function setButtonLabel(button,text){const label=button.querySelector('.pk-button-label');if(label)label.textContent=text;else button.textContent=text;}
const btn=(text,action,primary=false,glyph)=>{const n=node('button',undefined,'pl-button pk-button'+(primary?' pk-button-primary':''));n.type='button';if(glyph)n.append(icon(glyph));n.append(node('span',text,'pk-button-label'));n.addEventListener('click',action);return n;};
function iconButton(title,action,glyph){const button=btn(title,action,false,glyph);button.classList.add('pk-icon-button');button.querySelector('.pk-button-label').classList.add('pk-sr-only');button.dataset.tooltip=title;button.setAttribute('aria-label',title);return button;}
function buttonBusy(button,busy,label){button.classList.toggle('pk-button-busy',busy);if(busy){button.dataset.idleLabel=button.querySelector('.pk-button-label')?.textContent || '';button.setAttribute('aria-busy','true');if(label)setButtonLabel(button,label);}else{button.removeAttribute('aria-busy');if(button.dataset.idleLabel!==undefined){setButtonLabel(button,button.dataset.idleLabel);delete button.dataset.idleLabel;}}}
function vehicleChips(row){const wrap=node('div',undefined,'pk-vehicle');wrap.append(node('span',row.brand,'pk-vehicle-brand'));for(const model of row.models || [])wrap.append(node('span',model,'pk-vehicle-model'));wrap.append(node('span',row.years?.length?row.years.join(', '):'Tất cả năm','pk-vehicle-meta'),node('span',({genuine:'Chính hãng',aftermarket:'Hàng ngoài',all:'Tất cả loại hàng'})[row.kind || 'all'],'pk-vehicle-meta'));return wrap;}
const date=value=>{const d=new Date(value);return d.toLocaleTimeString('vi-VN')+' · '+d.toLocaleDateString('vi-VN');};
const scope=c=>[c?.brand,(c?.models || []).join(', '),(c?.years || []).join(', ') || 'Tất cả năm',({genuine:'Chính hãng',aftermarket:'Hàng ngoài',all:'Tất cả loại hàng'})[c?.kind || 'all']].filter(Boolean).join(' · ');
const observed=row=>row.evidence_type==='observed'?'Ghi nhận tự động':'Xác nhận theo luồng cũ';
const localDay=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const formatNumber=value=>Number(value || 0).toLocaleString('vi-VN');
const isKnowledge=view=>!['overview','sessions','events'].includes(view.mode);

export function createPartsKnowledgePage({supabase,getOwner,isAdmin}){
    let host=null,owner='',version=0,controller=null,state=null,writeToken=null;
    const dialogs=new Set(),users=new Map();
    function allowed(){return !!owner&&getOwner()===owner&&isAdmin();}
    function clear(){version++;controller?.abort();writeToken=null;clearTimeout(state?.toastTimer);dialogs.forEach(d=>d.close());dialogs.clear();host?.replaceChildren();host=null;owner='';state=null;users.clear();}
    function toast(view,message,tone='success'){
        if(!allowed()||state!==view)return;
        clearTimeout(view.toastTimer);view.toast.dataset.tone=tone;view.toastIcon.replaceChildren(icon(tone==='success'?'check':'empty'));view.toastText.textContent=message;view.toast.hidden=false;
        view.toastTimer=setTimeout(()=>{view.toast.hidden=true;},tone==='success'?4200:7000);
    }
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
        headers.forEach(value=>{const th=node('th');th.scope='col';th.append(typeof value==='string'?document.createTextNode(value):value);tr.append(th);});head.append(tr);t.append(head,body);wrap.append(t);
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
    function renderMetrics(view,data){
        for(const [key,title,glyph,tone] of [['sessions','Phiên tra cứu','search','blue'],['applied','Phiên đã mở giá','open','violet'],['not_found','Không có kết quả','empty','rose'],['pending','Gợi ý chờ duyệt','clock','amber'],['approved','Kiến thức đã duyệt','check','green']]){
            let card=view.metrics.querySelector('[data-metric="'+key+'"]');
            if(!card){card=node('article',undefined,'pk-metric');card.dataset.metric=key;card.dataset.tone=tone;const symbol=node('span',undefined,'pk-metric-icon'),copy=node('div');symbol.append(icon(glyph));copy.append(node('strong'),node('span',title));card.append(symbol,copy);view.metrics.append(card);}
            card.querySelector('strong').textContent=formatNumber(data?.[key]);
        }
        const pending=Number(data?.pending || 0);
        view.nextTitle.textContent=pending>0?'Bước tiếp theo: kiểm tra '+formatNumber(pending)+' gợi ý trong bộ lọc':'Chưa có gợi ý chờ duyệt trong bộ lọc';
        view.nextCopy.textContent=pending>0?'Đúng tên và phạm vi xe thì bấm Duyệt ngay trên dòng; chọn nhiều dòng để duyệt cùng lúc. Cần điều chỉnh thì mở Chỉnh sửa.':'Hệ thống tạo gợi ý khi người dùng mở kết quả tra cứu có hãng và dòng xe. Bạn có thể đổi bộ lọc để xem các gợi ý khác.';
        setButtonLabel(view.nextButton,'Mở gợi ý chờ duyệt'+(pending>0?' ('+formatNumber(pending)+')':''));
    }
    function renderPagination(view){
        view.pagination.replaceChildren();if(view.mode==='overview')return;
        const knowledge=isKnowledge(view),remaining=knowledge?view.rows.filter(row=>row.status===view.mode).length:view.rows.length,processed=view.rows.length-remaining;
        view.pagination.append(node('span',formatNumber(view.count)+' bản ghi'+(knowledge?(processed?' · '+formatNumber(processed)+' dòng đã xử lý trên trang':''):' · Trang '+(view.page+1))));
        const prev=btn('Trang trước',()=>{if(writeToken)return;if(knowledge)view.offset=Math.max(0,view.offset-25);view.page=Math.max(0,view.page-1);load();});prev.disabled=!!writeToken||(knowledge?view.offset===0:view.page===0);
        const next=btn(knowledge&&processed?'Gợi ý tiếp theo':'Trang sau',()=>{if(writeToken)return;if(knowledge)view.offset+=remaining;view.page++;load();});next.disabled=!!writeToken||(knowledge?view.offset+remaining>=view.count:(view.page+1)*25>=view.count);
        view.pagination.append(prev,next);
    }
    function refreshMetrics(view,message){
        const actor=owner,ticket=version,revision=++view.metricsRevision,f=view.appliedFilters;
        if(!f)return;
        Promise.resolve(supabase.rpc('kgpt_parts_search_overview',{p_from:f.from,p_to:f.to,p_query:f.q,p_user:f.user || null,p_source:f.source || null}).abortSignal(AbortSignal.timeout(12000))).then(result=>{
            if(!allowed()||owner!==actor||state!==view||ticket!==version||revision!==view.metricsRevision)return;
            if(result.error){if(view.status.textContent===message)view.status.textContent+=' Chưa cập nhật được thống kê.';return;}
            const position=window.scrollY,hero=view.metrics.closest('.pk-hero');if(hero)hero.style.minHeight=hero.getBoundingClientRect().height+'px';renderMetrics(view,result.data);window.scrollTo({top:position,behavior:'instant'});
        }).catch(()=>{});
    }
    async function load(){
        if(!allowed()||!state||writeToken)return;
        let f;try{f=filters();}catch(error){state.status.textContent=error.message;return;}
        controller?.abort();controller=new AbortController();const signal=controller.signal,ticket=++version,view=state;
        view.loading=true;view.status.textContent='Đang tải dữ liệu…';view.total.textContent='Đang tải…';view.content.style.minHeight=view.content.getBoundingClientRect().height+'px';view.content.classList.add('is-loading');view.content.setAttribute('inert','');view.pagination.querySelectorAll('button').forEach(button=>{button.disabled=true;});view.export.disabled=true;
        view.appliedFilters=f;view.metricsRevision++;view.applyKnowledgeChange=null;const hero=view.metrics.closest('.pk-hero');if(hero)hero.style.minHeight='';
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
            query=textFilter(query,['alias','canonical_name','source_query'],f.q).order('created_at',{ascending:false}).order('id',{ascending:false}).range(view.offset,view.offset+24);
        }
        const results=await Promise.allSettled([stats,query.abortSignal(signal)]);
        if(!current())return;
        const overview=results[0].status==='fulfilled'?results[0].value:{error:true};
        const rows=results[1].status==='fulfilled'?results[1].value:{error:true};
        if(!overview.error){
            renderMetrics(view,overview.data);
        }else{
            view.nextTitle.textContent='Kiểm tra gợi ý để bổ sung kiến thức';
            view.nextCopy.textContent='Chưa tải được số lượng gợi ý. Bạn vẫn có thể mở danh sách chờ duyệt để kiểm tra.';
            setButtonLabel(view.nextButton,'Mở gợi ý chờ duyệt');
        }
        if(rows.error){view.status.textContent='Chưa tải được dữ liệu. Kiểm tra kết nối và bấm Làm mới.';view.total.textContent='Chưa tải được';view.content.replaceChildren(node('div','Chưa tải được danh sách. Bấm Làm mới để thử lại.','pk-empty'));view.pagination.replaceChildren();view.loading=false;view.content.classList.remove('is-loading');view.content.removeAttribute('inert');view.content.style.minHeight='';return;}
        let automated={rows:rows.data || [],reviewed:0,error:false};
        if(view.mode==='pending'){
            view.status.textContent='Đang đối chiếu tự động các tên tương đương và quy tắc đã duyệt…';
            automated=await autoReviewKnowledgeRows({supabase,rows:automated.rows,signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),isCurrent:current});
            if(!current())return;
        }
        view.rows=automated.rows;view.count=Math.max(0,(rows.count || 0)-automated.reviewed);
        if(isKnowledge(view)&&view.offset>0&&view.offset>=view.count){view.offset=Math.max(0,view.count-25);return load();}
        if(!isKnowledge(view)&&view.mode!=='overview'&&view.page>0&&view.page*25>=view.count){view.page=Math.max(0,Math.ceil(view.count/25)-1);return load();}
        setButtonLabel(view.export,view.mode==='overview'?'Xuất mẫu phiên':'Xuất trang hiện tại');
        view.total.textContent=formatNumber(view.count)+' bản ghi';
        view.content.replaceChildren();
        if(view.mode==='overview')renderOverview(view,view.rows);
        else if(view.mode==='sessions')renderSessions(view,view.rows);
        else if(view.mode==='events')renderEvents(view,view.rows);
        else renderKnowledge(view,view.rows);
        if(!view.rows.length)view.content.append(node('div',view.mode==='pending'?'Chưa có gợi ý chờ duyệt trong bộ lọc. Gợi ý được tạo khi người dùng mở kết quả tra cứu có hãng và dòng xe.':view.mode==='approved'?'Chưa có kiến thức đã duyệt trong bộ lọc. Mở Gợi ý chờ duyệt để kiểm tra và duyệt tên đúng.':'Không có dữ liệu phù hợp với bộ lọc.','pk-empty'));
        view.loading=false;view.content.classList.remove('is-loading');view.content.removeAttribute('inert');view.content.style.minHeight='';renderPagination(view);
        view.export.disabled=!view.rows.length;
        view.status.textContent=(automated.reviewed?'Đã tự duyệt '+formatNumber(automated.reviewed)+' mục đủ điều kiện. ':'')+(automated.error?'Chưa nhận được kết quả tự động; bấm Làm mới để kiểm tra trạng thái. ':'')+(overview.error?'Chưa tải được chỉ số tổng hợp. ':'')+'Cập nhật lúc '+new Date().toLocaleTimeString('vi-VN')+'. Chỉ số tổng hợp dựa trên phiên tạo trong khoảng ngày đã chọn.';
        if(automated.reviewed)refreshMetrics(view,view.status.textContent);
        return ticket;
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
        view.content.append(node('p',view.mode==='pending'?'Các mục đủ điều kiện đã được máy chủ tự xử lý. Tên gọi mới chỉ là đề xuất chạy thử; kiểm tra rồi Duyệt nếu đúng. Có thể chọn nhiều dòng để duyệt cùng lúc.':view.mode==='approved'?'Các tên gọi này được dùng lại trong tra cứu bằng AI khi trùng từ khóa và toàn bộ bộ lọc xe, đồng thời tên còn trong kho. Nhãn Tự duyệt cho biết lý do xử lý.':'Các kiến thức tại đây không được dùng trong tra cứu. Bạn có thể chỉnh sửa hoặc duyệt lại.','pk-note'));
        const selected=new Map(),checks=new Map(),entries=new Map(),all=node('input'),selectionCount=node('span','Chọn gợi ý để duyệt cùng lúc','pk-selection-count'),bulk=btn('Duyệt đã chọn',()=>changeStatus([...selected.values()],'approved'),true,'check');let selectionBar=null;all.type='checkbox';all.setAttribute('aria-label','Chọn tất cả gợi ý chưa xử lý trên trang này');bulk.disabled=true;
        function syncSelection(){
            const eligible=rows.filter(row=>row.status===view.mode&&!view.busyRows.has(row.id)),idle=eligible.filter(row=>selected.has(row.id)),saving=view.busyRows.size;
            selectionCount.textContent=(idle.length?formatNumber(idle.length)+' đã chọn':'Chọn gợi ý để duyệt cùng lúc')+(saving?' · '+formatNumber(saving)+' đang lưu':'');
            buttonBusy(bulk,false);setButtonLabel(bulk,idle.length?'Duyệt đã chọn ('+formatNumber(idle.length)+')':saving?'Đang xử lý':'Duyệt đã chọn');if(!idle.length&&saving)buttonBusy(bulk,true);
            bulk.disabled=!idle.length;all.disabled=!eligible.length;all.checked=eligible.length>0&&idle.length===eligible.length;all.indeterminate=idle.length>0&&idle.length<eligible.length;if(selectionBar)selectionBar.dataset.active=String(idle.length>0||saving>0);
            for(const [id,check] of checks){check.disabled=entries.get(id).row.status!==view.mode||view.busyRows.has(id);check.closest('tr')?.classList.toggle('pk-row-selected',check.checked);}
        }
        if(view.mode==='pending'&&rows.length){selectionBar=node('div',undefined,'pk-selection-bar');const label=node('label',undefined,'pk-select-all');label.append(all,node('span','Chọn cả trang'));all.addEventListener('change',()=>{for(const row of rows){if(row.status!==view.mode||view.busyRows.has(row.id))continue;checks.get(row.id).checked=all.checked;if(all.checked)selected.set(row.id,row);else selected.delete(row.id);}syncSelection();});selectionBar.append(label,selectionCount,bulk);view.content.append(selectionBar);}
        function fillActions(row,actions){
            actions.replaceChildren();
            if(row.status!==view.mode){const done=badge(labels[row.status] || row.status,row.status==='approved'?'green':row.status==='rejected'?'rose':'neutral');done.classList.add('pk-completed');done.prepend(icon(row.status==='approved'?'check':row.status==='rejected'?'close':'clock'));actions.append(done);}
            else{
                if(row.status!=='approved'){const approve=btn('Duyệt',()=>changeStatus([row],'approved'),true,'check');approve.dataset.status='approved';approve.classList.add('pk-approve');actions.append(approve);}
                if(row.status==='pending'){const reject=iconButton('Từ chối: '+row.alias,()=>changeStatus([row],'rejected'),'close');reject.dataset.status='rejected';reject.classList.add('pk-reject');actions.append(reject);}
                if(row.status==='approved'){const disable=btn('Ngừng áp dụng',()=>changeStatus([row],'disabled'));disable.dataset.status='disabled';actions.append(disable);}
            }
            actions.append(iconButton('Chỉnh sửa: '+row.alias,()=>review(row),'edit'),iconButton('Nguồn & lịch sử: '+row.alias,()=>knowledgeEvidence(row),'file'));
        }
        const headers=['Tên gọi → tên kho','Phạm vi xe','Nguồn bằng chứng','Cập nhật','Thao tác'];if(view.mode==='pending')headers.unshift('Chọn');
        view.content.append(table(headers,rows.map(row=>{
            const name=node('div',undefined,'pk-part-mapping'),canonical=node('div',undefined,'pk-canonical-line');canonical.append(icon('arrow'),node('strong',row.canonical_name,'pk-canonical'));name.append(node('span',row.alias,'pk-alias'),canonical,node('small',row.note || '','pk-row-note'));
            const evidence=node('div');evidence.append(badge(observed(row),row.evidence_type==='observed'?'amber':'blue'),node('small',userName(row.created_by)),node('small',knowledgeReviewHint(row),'pk-auto-reason'));
            const actions=node('div',undefined,'pk-row-actions pk-knowledge-actions'),vehicle=vehicleChips(row),updated=node('span',date(row.updated_at)),actionCell=node('div'),feedback=node('span','','pk-row-feedback');fillActions(row,actions);actionCell.append(actions,feedback);
            entries.set(row.id,{row,name,vehicle,evidence,updated,actions,feedback});
            const cells=[name,vehicle,evidence,updated,actionCell];
            if(view.mode==='pending'){const check=node('input');check.type='checkbox';check.className='pk-row-check';check.setAttribute('aria-label','Chọn gợi ý '+row.alias+' → '+row.canonical_name+' · '+scope(row));check.addEventListener('change',()=>{if(check.checked)selected.set(row.id,row);else selected.delete(row.id);syncSelection();});checks.set(row.id,check);cells.unshift(check);}
            return cells;
        })));
        view.setKnowledgeBusy=(ids,status)=>{
            for(const id of ids){const entry=entries.get(id);if(!entry)continue;const tr=entry.actions.closest('tr');
                if(status)view.busyRows.set(id,status);else view.busyRows.delete(id);
                tr?.classList.toggle('pk-row-saving',!!status);tr?.setAttribute('aria-busy',String(!!status));
                if(status){entry.feedback.textContent='';tr?.classList.remove('pk-row-error');}
                for(const button of entry.actions.querySelectorAll('button')){button.disabled=!!status;if(!status)buttonBusy(button,false);else if(button.dataset.status===status)buttonBusy(button,true,status==='approved'?'Đang duyệt':'Đang lưu');}
            }syncSelection();
        };
        view.setKnowledgeError=(id,message)=>{const entry=entries.get(id);if(entry){entry.feedback.textContent=message;entry.actions.closest('tr')?.classList.add('pk-row-error');}};
        view.applyKnowledgeChange=updated=>{
            const entry=entries.get(updated.id);if(!entry)return;
            const row=entry.row,wasCurrent=row.status===view.mode,tr=entry.actions.closest('tr');
            // Keep the row's space so approving a row never pulls the next target away.
            if(tr)tr.style.height=tr.getBoundingClientRect().height+'px';
            Object.assign(row,updated);const matches=row.status===view.mode;
            if(wasCurrent!==matches)view.count=Math.max(0,view.count+(matches?1:-1));
            entry.name.querySelector('.pk-alias').textContent=row.alias;entry.name.querySelector('.pk-canonical').textContent=row.canonical_name;entry.name.querySelector('small').textContent=row.note || '';entry.vehicle.replaceChildren(...vehicleChips(row).childNodes);entry.updated.textContent=date(row.updated_at);entry.feedback.textContent='';fillActions(row,entry.actions);
            entry.evidence.replaceChildren(badge(observed(row),row.evidence_type==='observed'?'amber':'blue'),node('small',userName(row.created_by)),node('small',knowledgeReviewHint(row),'pk-auto-reason'));
            tr?.classList.toggle('pk-row-processed',!matches);if(tr)tr.dataset.status=row.status;
            if(!matches){selected.delete(row.id);const check=checks.get(row.id);if(check)check.checked=false;}
            syncSelection();view.total.textContent=formatNumber(view.count)+' bản ghi';renderPagination(view);
        };
        syncSelection();
    }
    async function changeStatus(rows,status){
        if(!allowed()||!state||state.loading||!rows.length||!['approved','rejected','disabled'].includes(status))return;
        const actor=owner,view=state;
        rows=[...new Map(rows.filter(row=>!view.busyRows.has(row.id)&&row.status!==status).map(row=>[row.id,row])).values()];if(!rows.length)return;
        let token=writeToken;
        if(!token){token={operations:0,controls:[...host.querySelectorAll('.pk-header button,.pk-tabs button,.pk-filters button,.pk-filters input,.pk-filters select,.pk-pagination button,.pk-next-step button')].map(control=>[control,control.disabled])};writeToken=token;token.controls.forEach(([control])=>{control.disabled=true;});}
        token.operations++;view.setKnowledgeBusy?.(rows.map(row=>row.id),status);view.status.textContent='Đang lưu '+formatNumber(view.busyRows.size)+' gợi ý…';
        const current=()=>writeToken===token&&allowed()&&owner===actor&&state===view;let saved=0,failed=0;
        for(let index=0;index<rows.length&&current();index+=3){
            await Promise.allSettled(rows.slice(index,index+3).map(async row=>{
                let result;try{result=await supabase.from('parts_search_knowledge').update({status,...(status==='approved'?{review_method:'manual',review_reason:'',inherited_from:null}:{})}).eq('id',row.id).eq('status',row.status).eq('updated_at',row.updated_at).select('*').abortSignal(AbortSignal.timeout(15000));}catch{result={error:true};}
                if(!current())return;
                view.setKnowledgeBusy?.([row.id],false);
                if(!result.error&&result.data?.length===1){const position=window.scrollY;view.applyKnowledgeChange?.(result.data[0]);window.scrollTo({top:position,behavior:'instant'});saved++;}
                else{failed++;view.setKnowledgeError?.(row.id,result.error?'Chưa lưu được. Bấm lại để thử.':'Dữ liệu đã thay đổi. Hãy làm mới.');}
                view.status.textContent='Đã xử lý '+formatNumber(saved+failed)+' / '+formatNumber(rows.length)+' gợi ý'+(view.busyRows.size?' · '+formatNumber(view.busyRows.size)+' đang lưu':'');
            }));
        }
        if(!current())return;
        token.operations--;if(!token.operations){writeToken=null;token.controls.forEach(([control,disabled])=>{if(control.isConnected)control.disabled=disabled;});}renderPagination(view);
        const message=saved?({approved:'Đã duyệt ',rejected:'Đã từ chối ',disabled:'Đã ngừng áp dụng '})[status]+formatNumber(saved)+' gợi ý.':'Chưa cập nhật được gợi ý.';
        view.status.textContent=message+(failed?' '+formatNumber(failed)+' gợi ý cần thử lại.':'')+(view.busyRows.size?' '+formatNumber(view.busyRows.size)+' gợi ý đang lưu.':'');
        toast(view,view.status.textContent,failed?'warning':'success');
        if(saved)refreshMetrics(view,view.status.textContent);
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
        view.body.append(node('p',knowledgeReviewHint(row),'pk-note'));
        if(row.review_reason)view.body.append(node('p',row.review_reason));
        if(row.inherited_from)view.body.append(node('p','Mã quy tắc nguồn: '+row.inherited_from,'pl-muted'));
        if(row.session_id)view.body.append(btn('Xem phiên và thao tác nguồn',()=>sessionDetail(row.session_id)));
        const {data,error}=await supabase.from('parts_search_knowledge_audit').select('*').eq('knowledge_id',row.id).order('created_at',{ascending:false}).limit(50);
        if(!allowed()||owner!==actor||!view.dialog.open)return;
        if(error){view.status.textContent='Chưa tải được lịch sử duyệt.';return;}
        view.body.append(node('p','50 thay đổi gần nhất.','pl-muted'));
        for(const change of data || []){const card=node('article',undefined,'pl-card'),after=change.after_data,before=change.before_data;card.append(node('h3',(change.action==='proposed'?'Tạo gợi ý':labels[change.action] || change.action)+' · '+date(change.created_at)),node('p','Người thực hiện: '+userName(change.actor_id)));if(before)card.append(node('p','Trước: '+before.alias+' → '+before.canonical_name+' · '+scope(before)));card.append(node('p','Sau: '+after.alias+' → '+after.canonical_name+' · '+scope(after)),node('p',after.review_reason || after.note || 'Chưa có ghi chú'));view.body.append(card);}
    }
    function review(row){
        if(!allowed()||state?.loading||state?.busyRows.has(row.id))return;const actor=owner,view=state,openedVersion=version,form=dialog('Chỉnh sửa kiến thức tìm kiếm'),fields={};
        form.body.append(badge(observed(row),'amber'),node('p','Điều chỉnh tên hoặc phạm vi xe rồi lưu. Ghi chú không bắt buộc.','pl-muted'));
        for(const [key,title,value] of [['alias','Tên gọi tìm kiếm',row.alias],['canonical_name','Tên chính xác trong kho',row.canonical_name],['brand','Hãng xe',row.brand],['models','Dòng xe (mỗi dòng một tên)',row.models.join('\n')],['years','Năm sản xuất (cách nhau bằng dấu phẩy)',row.years.join(', ')],['note','Ghi chú (không bắt buộc)',row.note]]){
            const label=node('label',title),input=node(key==='models'||key==='note'?'textarea':'input');input.value=value;input.maxLength=key==='note'?1000:key==='models'?3000:key==='brand'?100:180;label.append(input);form.body.append(label);fields[key]=input;
        }
        const kind=node('select');for(const [value,title] of [['all','Tất cả loại hàng'],['genuine','Chính hãng'],['aftermarket','Hàng ngoài']]){const option=node('option',title);option.value=value;kind.append(option);}kind.value=row.kind;const kindLabel=node('label','Loại hàng');kindLabel.append(kind);form.body.append(kindLabel);
        let saving=false;
        async function save(status){
            if(saving||!allowed()||owner!==actor)return;
            const models=[...new Set(fields.models.value.split(/[\n,]+/).map(v=>v.trim()).filter(Boolean))].sort(),years=[...new Set(fields.years.value.split(/[,\s]+/).filter(Boolean).map(Number))].sort((a,b)=>a-b);
            if(fields.alias.value.trim().length<2||fields.canonical_name.value.trim().length<2||!fields.brand.value.trim()||!models.length||models.length>30||models.some(m=>m.length>100)||years.length>30||years.some(y=>!Number.isInteger(y)||y<1950||y>2100)){form.status.textContent='Kiểm tra lại tên và phạm vi xe.';return;}
            saving=true;form.footer.querySelectorAll('button').forEach(b=>b.disabled=true);form.status.textContent='Đang lưu…';
            let result;try{result=await supabase.from('parts_search_knowledge').update({alias:fields.alias.value.trim(),canonical_name:fields.canonical_name.value.trim(),brand:fields.brand.value.trim(),models,years,kind:kind.value,note:fields.note.value.trim(),status}).eq('id',row.id).eq('updated_at',row.updated_at).select('*').abortSignal(AbortSignal.timeout(15000));}catch{result={error:true};}
            if(!allowed()||owner!==actor)return;saving=false;form.footer.querySelectorAll('button').forEach(b=>b.disabled=false);
            if(result.error||!result.data?.length){if(form.dialog.open)form.status.textContent='Chưa lưu được hoặc bản ghi đã thay đổi. Đóng và làm mới danh sách để thử lại.';return;}
            const position=window.scrollY;if(form.dialog.open)form.dialog.close();
            if(state!==view||version!==openedVersion)return;
            view.applyKnowledgeChange?.(result.data[0]);window.scrollTo({top:position,behavior:'instant'});view.status.textContent=status==='approved'?'Đã lưu và duyệt gợi ý.':'Đã lưu thay đổi.';toast(view,view.status.textContent);refreshMetrics(view,view.status.textContent);
        }
        form.footer.append(btn('Lưu thay đổi',()=>save(row.status),row.status==='approved'));if(row.status!=='approved')form.footer.append(btn('Lưu & duyệt',()=>save('approved'),true,'check'));
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
        filtersBox.append(btn('Áp dụng bộ lọc',()=>{state.page=0;state.offset=0;load();},false,'filter'));filtersBox.addEventListener('submit',event=>{event.preventDefault();state.page=0;state.offset=0;load();});
        const metrics=node('div',undefined,'pk-metrics'),tabs=node('nav',undefined,'pk-tabs'),content=node('div',undefined,'pk-content'),pagination=node('footer',undefined,'pk-pagination'),status=node('p','','pk-status');status.setAttribute('role','status');
        const workspace=node('section',undefined,'pk-workspace'),panelHead=node('header',undefined,'pk-panel-head'),panelCopy=node('div'),panelTitle=node('h2','Tổng quan tìm kiếm'),panelSubtitle=node('p','Các nội dung được tra cứu và mức độ sử dụng.','pk-panel-subtitle'),total=badge('Đang tải…','blue');panelCopy.append(panelTitle,panelSubtitle);panelHead.append(panelCopy,total);
        tabs.setAttribute('aria-label','Danh mục lịch sử và kiến thức');
        const modes=[['overview','Tổng quan'],['sessions','Phiên tra cứu'],['events','Thao tác'],['pending','Gợi ý chờ duyệt'],['approved','Đã duyệt'],['disabled','Ngừng áp dụng'],['rejected','Từ chối']];
        function selectMode(key){
            if(!allowed()||!state||writeToken)return;
            const title=modes.find(([mode])=>mode===key)?.[1];if(!title)return;
            state.mode=key;state.page=0;state.offset=0;
            panelTitle.textContent=key==='overview'?'Tổng quan tìm kiếm':key==='sessions'?'Lịch sử phiên tra cứu':key==='events'?'Nhật ký thao tác':'Kiến thức · '+title;
            panelSubtitle.textContent=key==='overview'?'Các nội dung được tra cứu và mức độ sử dụng.':key==='sessions'?'Yêu cầu tìm kiếm, phạm vi xe và kết quả của từng phiên.':key==='events'?'Các thao tác được ghi nhận trong quá trình tra cứu.':'Kiểm tra bằng chứng và quản lý kiến thức dùng chung.';
            tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===key)));load();
        }
        const nextStep=node('div',undefined,'pk-next-step'),nextText=node('div'),nextTitle=node('strong','Kiểm tra gợi ý để bổ sung kiến thức','pk-next-title'),nextCopy=node('p','Chỉ tên đã duyệt mới được dùng lại khi trùng từ khóa, phạm vi xe và vẫn còn trong kho.','pk-next-copy'),nextButton=btn('Mở gợi ý chờ duyệt',()=>{selectMode('pending');workspace.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});tabs.querySelector('[data-mode="pending"]')?.focus({preventScroll:true});},true,'check');nextText.append(nextTitle,nextCopy);nextStep.append(nextText,nextButton);
        const notification=node('aside',undefined,'pk-toast'),toastIcon=node('span',undefined,'pk-toast-icon'),toastText=node('span',undefined,'pk-toast-text'),toastClose=iconButton('Đóng thông báo',()=>{notification.hidden=true;},'close');notification.hidden=true;notification.setAttribute('aria-live','polite');notification.setAttribute('aria-atomic','true');notification.append(toastIcon,toastText,toastClose);
        state={mode:'overview',page:0,offset:0,loading:false,metricsRevision:0,appliedFilters:null,applyKnowledgeChange:null,setKnowledgeBusy:null,setKnowledgeError:null,busyRows:new Map(),toast:notification,toastIcon,toastText,toastTimer:null,fields,metrics,content,pagination,status,total,nextTitle,nextCopy,nextButton,rows:[],count:0,export:exportButton};
        for(const [key,title] of modes){const tab=btn(title,()=>selectMode(key));tab.dataset.mode=key;tab.setAttribute('aria-pressed',String(key==='overview'));tabs.append(tab);}
        hero.append(header,metrics,nextStep);workspace.append(panelHead,tabs,filtersBox,status,content,pagination);host.append(hero,workspace,notification);
        const actor=owner;
        const {data}=await supabase.from('user_profiles').select('id,full_name,email').order('full_name',{ascending:true}).limit(1000).abortSignal(AbortSignal.timeout(12000));
        if(!allowed()||owner!==actor)return;
        for(const user of data || []){const name=user.full_name || user.email || user.id.slice(0,8);users.set(user.id,name);const option=node('option',name);option.value=user.id;fields.user.append(option);}
        await load();
    }
    return {show,clear};
}
