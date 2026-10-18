(function(root){
  'use strict';
  function createPartsStatsEngine(){
    const clean=v=>String(v??'').trim().replace(/\s+/g,' ');
    const key=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
    const collator=new Intl.Collator('vi',{numeric:true});
    let length,capacity,columns,brands,models,years,names,brandIds,modelIds,yearIds,nameIds,cleanCache,kindCache,generation=0,cache;
    function reset(){
      generation++;length=0;capacity=2048;columns=Array.from({length:5},()=>new Uint32Array(capacity));
      brands=[];models=[];years=[];names=[];brandIds=new Map();modelIds=new Map();yearIds=new Map();nameIds=new Map();cleanCache=new Map();kindCache=new Map();cache=null;
    }
    function text(v){const raw=String(v??'');let value=cleanCache.get(raw);if(value===undefined){value=clean(raw);cleanCache.set(raw,value);}return value;}
    function intern(map,list,value,make){let id=map.get(value);if(id===undefined){id=list.length;list.push(make?make(value):value);map.set(value,id);}return id;}
    function kind(value){
      const raw=String(value??'');if(kindCache.has(raw))return kindCache.get(raw);
      const k=key(raw);let result=2;
      if(/thay the|hang ngoai|ngoai hang|khong chinh hang|khong hang chinh hang|aftermarket/.test(k)||['false','no','n','0'].includes(k))result=1;
      else if(/chinh hang|genuine|original/.test(k)||['true','yes','y','1','oem'].includes(k))result=0;
      kindCache.set(raw,result);return result;
    }
    function append(rows){
      const needed=length+rows.length;
      if(needed>capacity){while(capacity<needed)capacity*=2;columns=columns.map(old=>{const next=new Uint32Array(capacity);next.set(old);return next;});}
      for(const r of rows){
        const b=text(r.hang_xe),m=text(r.hieu_xe),y=text(r.nam_sx),n=key(text(r.ten_phu_tung));
        const bi=intern(brandIds,brands,b,v=>({text:v,search:key(v),models:new Set()}));
        const mi=intern(modelIds,models,JSON.stringify([bi,m]),()=>({text:m,brand:bi,search:key(`${b} ${m}`),years:new Set()}));
        const yi=intern(yearIds,years,y);const ni=intern(nameIds,names,n);
        brands[bi].models.add(mi);models[mi].years.add(yi);
        columns[0][length]=bi;columns[1][length]=mi;columns[2][length]=yi;columns[3][length]=ni;columns[4][length]=kind(r.chinh_hang);length++;
      }
      cache=null;return {sourceTotal:length};
    }
    function group(brand,model){return {brand,model,total:0,genuine:0,aftermarket:0,unknown:0,modelCount:0,_models:new Set()};}
    function add(g,mi,k){g.total++;g[['genuine','aftermarket','unknown'][k]]++;if(models[mi].text)g._models.add(mi);}
    function serialize(g){return {brand:g.brand,model:g.model,total:g.total,genuine:g.genuine,aftermarket:g.aftermarket,unknown:g.unknown,modelCount:g._models.size};}
    function sortGroups(groups,descending=true){return groups.slice().sort((a,b)=>(descending?b.total-a.total:a.total-b.total)||collator.compare(a.brand,b.brand)||collator.compare(a.model,b.model));}
    async function query(filters={},yieldTask=null){
      const stamp=generation;
      const selected=v=>v==='__missing__'?'':v;
      const b=filters.brand||'',m=filters.model||'',y=filters.year||'',t=filters.type||'',q=key(filters.search||'');
      const filterKey=JSON.stringify([b,m,y,t,q]);
      if(!cache||cache.key!==filterKey){
        const brandOptions=brands.map(v=>v.text).sort(collator.compare);
        const modelOptions=new Set(),yearOptions=new Set();
        for(const model of models){if(b&&brands[model.brand].text!==selected(b))continue;modelOptions.add(model.text);if(m&&model.text!==selected(m))continue;for(const yi of model.years)yearOptions.add(years[yi]);}
        const result={total:0,sourceTotal:length,brandCount:0,modelCount:0,nameCount:0,missingBrands:0,kinds:{genuine:0,aftermarket:0,unknown:0},brandOptions,modelOptions:[...modelOptions].sort(collator.compare),yearOptions:[...yearOptions].sort(collator.compare).reverse()};
        const matchedBrands=new Set(),matchedModels=new Set(),matchedNames=new Set(),brandGroups=new Map(),modelGroups=new Map();
        const targetKind={genuine:0,aftermarket:1,unknown:2}[t];
        for(let i=0;i<length;i++){
          if(yieldTask&&i>0&&i%2048===0){await yieldTask();if(stamp!==generation)throw new Error('STATS_CANCELLED');}
          const bi=columns[0][i],mi=columns[1][i],yi=columns[2][i],ni=columns[3][i],k=columns[4][i],brand=brands[bi],model=models[mi];
          if((b&&brand.text!==selected(b))||(m&&model.text!==selected(m))||(y&&years[yi]!==selected(y))||(t&&k!==targetKind))continue;
          if(q&&!`${model.search} ${names[ni]}`.includes(q))continue;
          result.total++;result.kinds[['genuine','aftermarket','unknown'][k]]++;
          if(brand.text)matchedBrands.add(bi);else result.missingBrands++;
          if(model.text)matchedModels.add(mi);if(names[ni])matchedNames.add(ni);
          let bg=brandGroups.get(bi);if(!bg){bg=group(brand.text,'');brandGroups.set(bi,bg);}add(bg,mi,k);
          let mg=modelGroups.get(mi);if(!mg){mg=group(brand.text,model.text);modelGroups.set(mi,mg);}add(mg,mi,k);
        }
        if(stamp!==generation)throw new Error('STATS_CANCELLED');
        result.brandCount=matchedBrands.size;result.modelCount=matchedModels.size;result.nameCount=matchedNames.size;
        cache={key:filterKey,result,brands:[...brandGroups.values()].map(serialize),models:[...modelGroups.values()].map(serialize)};
      }
      const chartSource=b?cache.models:cache.brands;
      return {...cache.result,chartGroups:sortGroups(chartSource),chartCount:chartSource.length,groups:sortGroups(filters.group==='brand'?cache.brands:cache.models,filters.descending!==false)};
    }
    function snapshot(){
      return {version:1,length,columns:columns.map(c=>c.slice(0,length)),brands:brands.map(b=>b.text),models:models.map(m=>({text:m.text,brand:m.brand})),years:years.slice(),names:names.slice()};
    }
    function restore(saved){
      const invalid=()=>{throw new Error('Bản lưu thống kê không hợp lệ.');};
      if(!saved||saved.version!==1||!Number.isSafeInteger(saved.length)||saved.length<0||!Array.isArray(saved.columns)||saved.columns.length!==5)invalid();
      const {columns:cols,brands:bs,models:ms,years:ys,names:ns}=saved;
      if(![bs,ms,ys,ns].every(Array.isArray)||![bs,ys,ns].every(a=>a.every(v=>typeof v==='string')))invalid();
      if(!cols.every(c=>c instanceof Uint32Array&&c.length===saved.length)||!ms.every(m=>m&&typeof m.text==='string'&&Number.isInteger(m.brand)&&m.brand>=0&&m.brand<bs.length))invalid();
      for(let i=0;i<saved.length;i++)if(cols[0][i]>=bs.length||cols[1][i]>=ms.length||cols[2][i]>=ys.length||cols[3][i]>=ns.length||cols[4][i]>2||ms[cols[1][i]].brand!==cols[0][i])invalid();
      reset();length=saved.length;capacity=Math.max(2048,length);columns=cols.map(c=>{const result=new Uint32Array(capacity);result.set(c);return result;});
      brands=bs.map(text=>({text,search:key(text),models:new Set()}));
      models=ms.map(m=>({text:m.text,brand:m.brand,search:key(`${bs[m.brand]} ${m.text}`),years:new Set()}));
      years=ys.slice();names=ns.slice();
      brands.forEach((b,i)=>brandIds.set(b.text,i));models.forEach((m,i)=>{modelIds.set(JSON.stringify([m.brand,m.text]),i);brands[m.brand].models.add(i);});
      years.forEach((y,i)=>yearIds.set(y,i));names.forEach((n,i)=>nameIds.set(n,i));
      for(let i=0;i<length;i++)models[columns[1][i]].years.add(columns[2][i]);
      return {sourceTotal:length};
    }
    reset();return {reset,append,query,snapshot,restore,count:()=>length};
  }
  root.KGPTCreateStatsEngine=createPartsStatsEngine;
})(typeof window==='undefined'?globalThis:window);

(() => {
  'use strict';
  const views=new WeakMap();
  const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'d').toLowerCase();
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icons={pdBrand:'<path d="M4 20V6l8-3 8 3v14M8 8h1m6 0h1M8 12h1m6 0h1M9 20v-4h6v4M2 20h20"/>',pdModel:'<path d="m4 10 2-6h12l2 6M3 10h18v8H3zm2 8v2m14-2v2M6 14h2m8 0h2"/>',pdYear:'<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16M8 15h3m-3 3h6"/>',pdType:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>'};
  const svg=path=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+path+'</svg>';
  let layer,search,viewport,spacer,countLabel,activeView=null,filtered=[],activeIndex=-1,frame=0;
  const rowHeight=42;
  function close(focus=false){if(!activeView)return;const previous=activeView;activeView=null;layer.hidden=true;previous.trigger.setAttribute('aria-expanded','false');previous.trigger.removeAttribute('aria-activedescendant');if(focus)previous.trigger.focus({preventScroll:true});}
  function renderWindow(){
    if(!activeView)return;
    const start=Math.max(0,Math.floor(viewport.scrollTop/rowHeight)-2),end=Math.min(filtered.length,start+Math.ceil((viewport.clientHeight||252)/rowHeight)+5);
    spacer.style.height=`${filtered.length*rowHeight}px`;
    if(!filtered.length){spacer.innerHTML='<div class="pd-select-empty">Không tìm thấy lựa chọn phù hợp</div>';spacer.style.height='80px';activeView.trigger.removeAttribute('aria-activedescendant');return;}
    const selected=activeView.select.value;
    spacer.innerHTML=filtered.slice(start,end).map((item,offset)=>{const index=start+offset,tone=activeView.select.id==='pdType'?(item.value==='genuine'?' genuine':item.value==='aftermarket'?' aftermarket':item.value==='unknown'?' unknown':''):'';return `<button type="button" role="option" id="pdSelectOption${index}" class="pd-select-option${tone}${index===activeIndex?' is-active':''}" aria-selected="${item.value===selected}" data-index="${index}" tabindex="-1" style="top:${index*rowHeight}px"${item.disabled?' disabled':''}><span class="pd-select-option-text">${esc(item.text)}</span><span class="pd-select-option-check">${svg('<path d="m5 12 4 4L19 6"/>')}</span></button>`;}).join('');
    if(activeIndex>=start&&activeIndex<end)activeView.trigger.setAttribute('aria-activedescendant',`pdSelectOption${activeIndex}`);else activeView.trigger.removeAttribute('aria-activedescendant');
  }
  function filterOptions(reset=true){
    if(!activeView)return;
    const query=fold(search.value).trim();filtered=activeView.items.filter(item=>!query||item.search.includes(query));
    activeIndex=Math.max(0,filtered.findIndex(item=>item.value===activeView.select.value));
    countLabel.textContent=`${filtered.length.toLocaleString('vi-VN')} lựa chọn`;
    if(reset)viewport.scrollTop=0;
    positionLayer();renderWindow();
  }
  function moveTo(index){
    activeIndex=Math.max(0,Math.min(filtered.length-1,index));
    const top=activeIndex*rowHeight,bottom=top+rowHeight;
    if(top<viewport.scrollTop)viewport.scrollTop=top;else if(bottom>viewport.scrollTop+viewport.clientHeight)viewport.scrollTop=bottom-viewport.clientHeight;
    renderWindow();
  }
  function choose(index){const view=activeView,item=filtered[index];if(!view||!item||item.disabled)return;view.select.value=item.value;syncOne(view);close(true);view.select.dispatchEvent(new Event('change',{bubbles:true}));}
  function buildLayer(){
    if(layer)return;
    layer=document.createElement('div');layer.id='pdDropdownLayer';layer.hidden=true;layer.setAttribute('aria-label','Danh sách bộ lọc');
    layer.innerHTML=`<div class="pd-select-search">${svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>')}<input id="pdSelectSearch" type="search" placeholder="Tìm nhanh…" aria-label="Tìm trong danh sách" autocomplete="off" spellcheck="false"/></div><div class="pd-select-viewport" role="listbox" id="pdSelectList"><div class="pd-select-spacer"></div></div><div class="pd-select-footer"><span id="pdSelectCount"></span><span>↑ ↓ chọn · Enter xác nhận</span></div>`;
    document.body.appendChild(layer);search=layer.querySelector('input');viewport=layer.querySelector('.pd-select-viewport');spacer=layer.querySelector('.pd-select-spacer');countLabel=layer.querySelector('#pdSelectCount');
    search.addEventListener('input',()=>filterOptions());
    viewport.addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;renderWindow();});},{passive:true});
    spacer.addEventListener('click',event=>{const option=event.target.closest('[data-index]');if(option)choose(Number(option.dataset.index));});
    layer.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close(true);}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();moveTo(activeIndex+(event.key==='ArrowDown'?1:-1));}else if(event.key==='Enter'){event.preventDefault();choose(activeIndex);}else if(event.key==='Tab')close();});
    document.addEventListener('pointerdown',event=>{if(activeView&&!layer.contains(event.target)&&!activeView.trigger.contains(event.target))close();});
    window.addEventListener('resize',()=>close());
    window.addEventListener('scroll',event=>{if(activeView&&!layer.contains(event.target))close();},true);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)close();});
  }
  function open(view){
    if(activeView===view){close();return;}close();activeView=view;buildLayer();
    syncOne(view);search.value='';layer.hidden=false;view.trigger.setAttribute('aria-expanded','true');
    viewport.setAttribute('aria-label',view.label.textContent.trim());search.placeholder=`Tìm ${view.label.textContent.trim().toLowerCase()}…`;
    filterOptions();moveTo(activeIndex);search.focus({preventScroll:true});
  }
  function positionLayer(){
    if(!activeView)return;
    const screenWidth=document.documentElement.clientWidth||window.innerWidth,rect=activeView.trigger.getBoundingClientRect(),width=Math.min(Math.max(rect.width,275),screenWidth-24),below=window.innerHeight-rect.bottom-12,above=rect.top-12;
    const desired=Math.min(338,Math.max(80,filtered.length*rowHeight)+88),height=Math.min(desired,Math.max(150,Math.max(below,above)));
    viewport.style.maxHeight=`${Math.max(80,height-88)}px`;layer.style.width=`${width}px`;layer.style.left=`${Math.max(12,Math.min(rect.left,screenWidth-width-12))}px`;
    const opensUp=below<height&&above>below;layer.style.top=`${Math.max(12,opensUp?rect.top-height-7:rect.bottom+7)}px`;
  }
  function syncOne(view){
    const select=view.select,signature=select.__pdOptionsSignature||'';
    if(signature!==view.signature||select.options.length!==view.items.length){view.items=Array.from(select.options,option=>({value:option.value,text:option.textContent.trim(),search:fold(option.textContent),disabled:option.disabled}));view.signature=signature;if(activeView===view)filterOptions(false);}
    view.value.textContent=select.options[select.selectedIndex]?.textContent||select.options[0]?.textContent||'Chọn giá trị';
    view.trigger.disabled=select.disabled;view.trigger.dataset.tone=select.id==='pdType'?select.value:'';
  }
  function init(root){
    buildLayer();
    for(const select of root.querySelectorAll('.pd-filter select')){
      if(views.has(select)){syncOne(views.get(select));continue;}
      const label=root.querySelector(`label[for="${select.id}"]`);if(!label)continue;
      const trigger=document.createElement('button');trigger.type='button';trigger.id=select.id+'Trigger';trigger.className='pd-select-trigger';trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-controls','pdSelectList');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label',label.textContent.trim());
      trigger.innerHTML=`<span class="pd-select-icon">${svg(icons[select.id]||icons.pdType)}</span><span class="pd-select-value"></span>${svg('<path d="m7 10 5 5 5-5"/>')}`;
      select.classList.add('pd-native-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');select.insertAdjacentElement('afterend',trigger);
      const view={select,label,trigger,value:trigger.querySelector('.pd-select-value'),items:[],signature:null};views.set(select,view);syncOne(view);
      trigger.addEventListener('click',()=>open(view));
      trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();open(view);}else if(event.key==='Escape')close(true);});
      label.addEventListener('click',event=>{event.preventDefault();trigger.focus();});select.addEventListener('change',()=>syncOne(view));
    }
  }
  window.KGPTDashboardSelects={init,sync(root){for(const select of root.querySelectorAll('.pd-filter select')){const view=views.get(select);if(view)syncOne(view);}},close};
})();

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const nf = new Intl.NumberFormat('vi-VN');
  const fmt = n => nf.format(n);
  const percentFormat = new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1});
  const pct = (n,d) => percentFormat.format(d ? n / d * 100 : 0) + '%';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const types = [{id:'genuine',label:'Chính hãng',color:'#059669'},{id:'aftermarket',label:'Không chính hãng',color:'#ea580c'},{id:'unknown',label:'Chưa phân loại',color:'#94a3b8'}];
  const state = {sourceTotal:0,total:0,summary:null,chartExpanded:false,queryRevision:0,groups:[],page:1,pageSize:7,group:'model',descending:true,loading:false,loaded:false,owner:null,scope:null,revision:0,config:null};
  let toastTimer;
  const baseTitle = document.title;
  const idleJob = () => ({phase:'idle',loaded:0,total:null,startedAt:0,finishedAt:0,minimized:false,dismissed:false,unread:false,message:''});
  let job = idleJob(),jobTimer;
  function dashboardVisible(){const el=$('partsDashboard');return !!el&&getComputedStyle(el).display!=='none'&&el.getClientRects().length>0;}
  function jobPercent(){return job.phase==='success'?100:(Number.isFinite(job.total)&&job.total>0?Math.min(100,Math.floor(job.loaded/job.total*100)):null);}
  function elapsed(){const seconds=Math.max(0,Math.floor(((job.finishedAt||Date.now())-job.startedAt)/1000));return seconds>=60?`${Math.floor(seconds/60)} phút ${seconds%60} giây`:`${seconds} giây`;}
  function syncJob(){
    const phase=job.phase,active=phase!=='idle',visible=dashboardVisible(),loading=phase==='loading',success=phase==='success',percent=jobPercent();
    if(!visible)window.KGPTDashboardSelects?.close();
    if(active&&!loading&&visible&&document.visibilityState!=='hidden')job.unread=false;
    const title=loading?(job.stage==='analyzing'?'Đang tính toán thống kê':'Đang đọc dữ liệu phụ tùng'):success?'Thống kê đã hoàn tất':'Chưa hoàn tất thống kê';
    const count=loading?(job.loaded?`Đã đọc ${fmt(job.loaded)}${job.total!==null?' / '+fmt(Math.max(job.loaded,job.total)):''} bản ghi`:'Đang kết nối dữ liệu…'):`${success?'Đã tổng hợp':'Đã đọc'} ${fmt(job.loaded)} bản ghi`;
    const message=job.message||(loading?'Bạn có thể chuyển mục trong hệ thống hoặc làm việc ở tab khác. Giữ tab này mở để tiến trình tiếp tục.':success?'Kết quả đã sẵn sàng. Các biểu đồ và bảng chi tiết đã được cập nhật.':'Vui lòng kiểm tra kết nối và nhấn “Làm mới” để thử lại.');
    if($('pdProgress')){
      $('pdProgress').hidden=!active||success;$('pdProgress').dataset.state=phase;
      $('pdProgressTitle').textContent=title;$('pdProgressMessage').textContent=message;
      $('pdProgressPercent').textContent=success?'Hoàn tất':phase==='error'?'Cần thử lại':percent===null?'Đang xử lý':`${percent}%`;
      $('pdProgressCount').textContent=count;$('pdProgressElapsed').textContent=active?`${loading?'Đã chạy':'Thời gian xử lý'}: ${elapsed()}`:'';
      const track=$('pdProgressTrack');track.classList.toggle('pd-indeterminate',loading&&percent===null);track.querySelector('i').style.width=`${percent??0}%`;
      if(percent===null)track.removeAttribute('aria-valuenow');else track.setAttribute('aria-valuenow',String(percent));
      track.setAttribute('aria-valuetext',`${title}. ${count}`);
    }
    const nav=$('tiPartsStatisticsNav'),badge=$('pdNavJob');
    if(nav&&badge){const notify=active&&(loading||job.unread);nav.classList.toggle('pd-has-job',notify);badge.hidden=!notify;badge.dataset.state=phase;badge.textContent=loading?(percent===null?'…':`${percent}%`):success?'✓':'!';nav.title=notify?`${title}${loading&&percent!==null?' · '+percent+'%':''}`:'Thống kê phụ tùng';}
    const dock=$('pdJobDock');
    if(dock){
      dock.hidden=!active||visible||job.dismissed||(!loading&&!job.unread);dock.dataset.state=phase;dock.classList.toggle('pd-dock-minimized',job.minimized);
      $('pdDockTitle').textContent=title;$('pdDockCount').textContent=count;$('pdDockTime').textContent=active?elapsed():'';
      $('pdDockPercent').textContent=loading?(percent===null?'Đang xử lý':`${percent}%`):success?'Hoàn tất':'Cần thử lại';
      $('pdDockOpen').textContent=loading?'Xem tiến trình':success?'Xem kết quả':'Quay lại dashboard';
      $('pdDockDismiss').setAttribute('aria-label',loading?'Thu gọn thông báo':'Đóng thông báo');
      $('pdDockMini').textContent=`${loading?'◌':success?'✓':'!'} Thống kê phụ tùng · ${loading?(percent===null?'Đang xử lý':percent+'%'):success?'Hoàn tất':'Cần thử lại'}`;
      const track=$('pdDockTrack');track.classList.toggle('pd-indeterminate',loading&&percent===null);track.querySelector('i').style.width=`${percent??0}%`;
    }
    document.title=loading?`Đang tổng hợp${percent===null?'':' '+percent+'%'} · ${baseTitle}`:active&&job.unread?`${success?'✓ Hoàn tất thống kê':'! Thống kê cần thử lại'} · ${baseTitle}`:baseTitle;
  }
  function startJob(){clearInterval(jobTimer);job={...idleJob(),phase:'loading',startedAt:Date.now()};syncJob();jobTimer=setInterval(syncJob,1000);}
  function finishJob(phase,message=''){clearInterval(jobTimer);job={...job,phase,finishedAt:Date.now(),minimized:false,dismissed:false,unread:true,message};syncJob();if(phase==='success'&&dashboardVisible()&&$('pdToast'))toast(`Đã cập nhật thống kê · ${fmt(job.loaded)} bản ghi`);}
  function resetJob(){clearInterval(jobTimer);job=idleJob();syncJob();}
  function openJob(){
    const nav=$('tiPartsStatisticsNav');
    if(typeof window.tiNavigate==='function')window.tiNavigate('stats',nav);
    else if(typeof window.switchMainLookupTab==='function')window.switchMainLookupTab('stats');
    syncJob();
    if(dashboardVisible())(job.phase==='success'?$('pdTitle'):$('pdProgress')).scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
  }
  function initJobNotifications(){
    const nav=$('tiPartsStatisticsNav');if(nav&&!$('pdNavJob')){const badge=document.createElement('i');badge.id='pdNavJob';badge.className='pd-nav-job';badge.hidden=true;badge.setAttribute('aria-hidden','true');nav.appendChild(badge);}
    const dock=document.createElement('aside');dock.id='pdJobDock';dock.hidden=true;dock.setAttribute('aria-label','Thông báo tiến trình thống kê');
    dock.innerHTML='<button type="button" id="pdDockMini" class="pd-dock-mini" aria-label="Mở rộng thông báo tiến trình"></button><div class="pd-dock-full"><div class="pd-dock-top"><span class="pd-dock-icon" aria-hidden="true">◌</span><strong id="pdDockTitle" role="status" aria-live="polite"></strong><button type="button" id="pdDockDismiss" class="pd-dock-close" aria-label="Thu gọn thông báo">×</button></div><p id="pdDockCount"></p><div class="pd-progress-track" id="pdDockTrack" aria-hidden="true"><i></i></div><div class="pd-dock-meta"><span id="pdDockPercent"></span><span id="pdDockTime"></span></div><button type="button" id="pdDockOpen" class="pd-dock-open">Xem tiến trình</button></div>';
    document.body.appendChild(dock);
    $('pdDockOpen').addEventListener('click',openJob);$('pdDockMini').addEventListener('click',()=>{job.minimized=false;syncJob();});
    $('pdDockDismiss').addEventListener('click',()=>{if(job.phase==='loading')job.minimized=true;else{job.dismissed=true;job.unread=false;}syncJob();});
    new MutationObserver(syncJob).observe($('partsDashboard'),{attributes:true,attributeFilter:['style','class','hidden']});
    document.addEventListener('visibilitychange',syncJob);
  }
  let statsBridge=null,loadingBridge=null;
  const statsCache=window.KGPTCreateStatsCache();
  const optionsCache=new WeakMap();
  const yieldMain=()=>new Promise(resolve=>setTimeout(resolve,0));
  function emptySummary(){return {total:0,sourceTotal:0,brandCount:0,modelCount:0,nameCount:0,missingBrands:0,kinds:{genuine:0,aftermarket:0,unknown:0},brandOptions:[],modelOptions:[],yearOptions:[],groups:[],chartGroups:[],chartCount:0};}
  async function createBridge(){
    const factory=window.KGPTCreateStatsEngine;
    if(typeof factory!=='function')throw new Error('Thiếu bộ xử lý thống kê.');
    if(typeof Worker!=='undefined'){
      let worker,url;
      const pending=new Map();let serial=0;
      try{
        const source='const engine=('+factory.toString()+')();self.onmessage=async function(event){const {id,type,payload}=event.data;try{let value;if(type==="reset")engine.reset();else if(type==="append")value=engine.append(payload);else if(type==="query")value=await engine.query(payload);else if(type==="snapshot")value=engine.snapshot();else if(type==="restore")value=engine.restore(payload);self.postMessage({id,ok:true,value});}catch(error){self.postMessage({id,ok:false,error:error.message});}};';
        url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));worker=new Worker(url);
        const fail=error=>{for(const entry of pending.values()){clearTimeout(entry.timeout);entry.reject(error);}pending.clear();};
        worker.onmessage=event=>{const entry=pending.get(event.data.id);if(!entry)return;pending.delete(event.data.id);clearTimeout(entry.timeout);event.data.ok?entry.resolve(event.data.value):entry.reject(new Error(event.data.error));};
        worker.onerror=event=>{event.preventDefault?.();fail(new Error('Bộ xử lý thống kê không phản hồi.'));};
        const bridge={mode:'worker',call(type,payload){return new Promise((resolve,reject)=>{const id=++serial;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Bộ xử lý thống kê quá thời gian phản hồi.'));},60000);pending.set(id,{resolve,reject,timeout});try{worker.postMessage({id,type,payload});}catch(error){clearTimeout(timeout);pending.delete(id);reject(error);}});},dispose(){worker.terminate();URL.revokeObjectURL(url);fail(new Error('STATS_CANCELLED'));}};
        // A short startup timeout also handles browsers that block blob workers.
        let startupTimer;try{await Promise.race([bridge.call('reset'),new Promise((_,reject)=>{startupTimer=setTimeout(()=>reject(new Error('Worker unavailable')),1500);})]);}finally{clearTimeout(startupTimer);}
        return bridge;
      }catch(error){worker?.terminate();if(url)URL.revokeObjectURL(url);for(const entry of pending.values()){clearTimeout(entry.timeout);entry.reject(error);}pending.clear();}
    }
    const engine=factory();let disposed=false;
    return {mode:'cooperative',async call(type,payload){if(disposed)throw new Error('STATS_CANCELLED');if(type==='reset'){engine.reset();return;}if(type==='append'){for(let i=0;i<payload.length;i+=256){if(disposed)throw new Error('STATS_CANCELLED');engine.append(payload.slice(i,i+256));await yieldMain();}return {sourceTotal:engine.count()};}if(type==='snapshot')return engine.snapshot();if(type==='restore')return engine.restore(payload);if(type==='query')return engine.query(payload,async()=>{await yieldMain();if(disposed)throw new Error('STATS_CANCELLED');});},dispose(){disposed=true;engine.reset();}};
  }
  function toast(message){$('pdToast').textContent=message;$('pdToast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('pdToast').hidden=true,4500);}
  function status(message,tone='info'){const el=$('pdStatus');el.textContent=message;el.dataset.tone=tone;el.hidden=!message;}
  function setOptions(id,values,label){
    const select=$(id),signature=JSON.stringify([label,values]);
    if(optionsCache.get(select)===signature)return;
    const previous=select.value,fragment=document.createDocumentFragment();fragment.appendChild(new Option(label,''));
    let restore=previous==='';for(const value of values){const optionValue=value||'__missing__';fragment.appendChild(new Option(value||'Chưa xác định',optionValue));if(optionValue===previous)restore=true;}
    // A single DOM replacement avoids thousands of enhancer observer callbacks.
    select.replaceChildren(fragment);if(restore)select.value=previous;optionsCache.set(select,signature);select.__pdOptionsSignature=signature;
  }
  function readFilters(){return {brand:$('pdBrand').value,model:$('pdModel').value,year:$('pdYear').value,type:$('pdType').value,search:$('pdSearch').value,group:state.group,descending:state.descending};}
  function facets(summary){setOptions('pdBrand',summary.brandOptions,'Tất cả hãng xe');setOptions('pdModel',summary.modelOptions,'Tất cả hiệu xe');setOptions('pdYear',summary.yearOptions,'Tất cả năm');window.KGPTDashboardSelects?.sync($('partsDashboard'));}
  async function requestRender(){
    if(state.loading||!state.loaded||!statsBridge)return;
    if(!state.config?.user()||!state.config.canRead()){clear();return;}
    const queryRevision=++state.queryRevision,owner=state.owner;
    status('Đang áp dụng bộ lọc…');
    try{
      const summary=await statsBridge.call('query',readFilters());
      if(queryRevision!==state.queryRevision||state.loading||owner!==state.config.user())return;
      render(summary);status('');
    }catch(error){if(queryRevision===state.queryRevision&&error.message!=='STATS_CANCELLED')status('Chưa áp dụng được bộ lọc. Vui lòng thử lại.','error');}
  }
  function render(summary=state.summary||emptySummary()){
    state.summary=summary;state.sourceTotal=summary.sourceTotal;state.total=summary.total;state.groups=summary.groups;
    facets(summary);
    $('pdTotal').textContent=fmt(summary.total);$('pdBrands').innerHTML=fmt(summary.brandCount)+'<span>hãng</span>';$('pdModels').innerHTML=fmt(summary.modelCount)+'<span>hiệu xe</span>';$('pdNames').textContent=fmt(summary.nameCount);
    $('pdTotalNote').innerHTML=summary.total===summary.sourceTotal?(state.config?.demo?'Tổng hợp từ dữ liệu minh họa':'Toàn bộ dữ liệu được phép xem'):`<b>${pct(summary.total,summary.sourceTotal)}</b> trên tổng ${fmt(summary.sourceTotal)} bản ghi`;
    $('pdBrandNote').textContent=summary.missingBrands?`${fmt(summary.missingBrands)} bản ghi chưa có hãng`:'Hãng có dữ liệu phụ tùng';
    renderChart(summary);renderDonut(summary);renderTable();
    $('pdGroupBrand').setAttribute('aria-pressed',String(state.group==='brand'));$('pdGroupModel').setAttribute('aria-pressed',String(state.group==='model'));
    $('pdSort').closest('th').setAttribute('aria-sort',state.descending?'descending':'ascending');$('pdExport').disabled=!summary.total||state.loading;
  }
  let chartScrollLock=null;
  function renderChartBars(id,groups,byModel,max,fullscreen=false){
    const container=$(id);
    container.innerHTML=groups.length?groups.map((g,i)=>`<button type="button" class="pd-bar-row" data-chart="${i}" title="Lọc ${esc(byModel?g.model:g.brand)||'Chưa xác định'}: ${fmt(g.total)} bản ghi"><span class="pd-bar-name">${esc(byModel?g.model:g.brand)||'Chưa xác định'}</span><span class="pd-bar-track"><span class="pd-bar-fill" style="width:${g.total/max*100}%"></span></span><span class="pd-bar-value">${fmt(g.total)}</span></button>`).join(''):'<div class="pd-empty"><strong>Chưa có dữ liệu phù hợp</strong>Thử thay đổi hoặc đặt lại bộ lọc.</div>';
    container.querySelectorAll('[data-chart]').forEach(button=>button.addEventListener('click',()=>{
      if(fullscreen)closeChartDialog();
      focusGroup(groups[Number(button.dataset.chart)],byModel);
    }));
  }
  function renderChart(summary){
    const byModel=!!$('pdBrand').value,allGroups=summary.chartGroups,chartGroups=allGroups.slice(0,8);
    const max=allGroups.reduce((value,g)=>Math.max(value,g.total),1);
    $('pdChartKicker').textContent='TOP '+Math.min(8,allGroups.length);
    const expandButton=$('pdChartExpand');
    expandButton.hidden=allGroups.length<=8;expandButton.disabled=state.loading;
    expandButton.textContent='Xem tất cả ('+fmt(allGroups.length)+')';
    expandButton.setAttribute('aria-expanded',String(state.chartExpanded));
    $('pdChartTitle').textContent=byModel?'Phân bổ theo hiệu xe':'Phân bổ theo hãng xe';
    $('pdChartSubtitle').textContent=byModel?`Hiệu xe thuộc ${$('pdBrand').value==='__missing__'?'nhóm chưa xác định':$('pdBrand').value}`:'Các hãng có số lượng phụ tùng nhiều nhất';
    $('pdChartTotal').textContent=fmt(chartGroups.length)+' / '+fmt(summary.chartCount)+(byModel?' hiệu xe':' hãng xe');
    $('pdBars').setAttribute('aria-label',byModel?'Biểu đồ theo hiệu xe':'Biểu đồ theo hãng xe');
    renderChartBars('pdBars',chartGroups,byModel,max);
    if(state.chartExpanded)renderChartDialog(summary);
  }
  function renderChartDialog(summary){
    const byModel=!!$('pdBrand').value,groups=summary.chartGroups;
    $('pdChartDialogTitle').textContent=byModel?'Phân bổ theo hiệu xe':'Phân bổ theo hãng xe';
    $('pdChartDialogSubtitle').textContent=byModel?`Hiệu xe thuộc ${$('pdBrand').value==='__missing__'?'nhóm chưa xác định':$('pdBrand').value}`:'Toàn bộ hãng xe theo bộ lọc hiện tại';
    $('pdChartDialogCount').textContent=fmt(groups.length)+(byModel?' hiệu xe':' hãng xe')+' · '+fmt(summary.total)+' bản ghi';
    $('pdChartDialogBars').setAttribute('aria-label',byModel?'Biểu đồ đầy đủ theo hiệu xe':'Biểu đồ đầy đủ theo hãng xe');
    renderChartBars('pdChartDialogBars',groups,byModel,groups.reduce((value,g)=>Math.max(value,g.total),1),true);
  }
  function openChartDialog(){
    if(state.loading||!state.summary||$('pdChartDialog').open)return;
    if(!state.config?.user()||!state.config.canRead()){clear();return;}
    window.KGPTDashboardSelects?.close();
    const dialog=$('pdChartDialog');
    renderChartDialog(state.summary);
    dialog.showModal();state.chartExpanded=true;
    chartScrollLock={html:document.documentElement.style.overflow,body:document.body.style.overflow};
    document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';
    $('pdChartExpand').setAttribute('aria-expanded','true');
    $('pdChartDialogBars').scrollTop=0;
    $('pdChartClose').focus({preventScroll:true});
  }
  function closeChartDialog(focus=true){
    const dialog=$('pdChartDialog'),wasOpen=dialog.open;
    state.chartExpanded=false;
    if(wasOpen)dialog.close();
    if(chartScrollLock){document.documentElement.style.overflow=chartScrollLock.html;document.body.style.overflow=chartScrollLock.body;chartScrollLock=null;}
    $('pdChartExpand').setAttribute('aria-expanded','false');
    $('pdChartDialogBars').replaceChildren();
    const trigger=$('pdChartExpand');
    if(focus&&wasOpen&&!trigger.hidden&&!trigger.disabled)trigger.focus({preventScroll:true});
  }
  function renderDonut(summary){
    const counts=summary.kinds;let current=0;
    const gradients=types.map(t=>{const start=current;current+=summary.total?counts[t.id]/summary.total*100:0;return `${t.color} ${start}% ${current}%`;});
    $('pdDonut').style.background=summary.total?`conic-gradient(${gradients.join(',')})`:'#e5ecf7';
    $('pdDonut').setAttribute('aria-label',types.map(t=>`${t.label}: ${fmt(counts[t.id])}, ${pct(counts[t.id],summary.total)}`).join('; '));$('pdDonutTotal').textContent=fmt(summary.total);
    $('pdDonut').closest('.pd-panel').querySelector('.pd-chart-foot b').textContent=summary.total?'100%':'—';
    $('pdTypes').innerHTML=types.map(t=>`<div class="pd-type-row" data-kind="${t.id}"><span class="pd-dot" style="background:${t.color}"></span>${t.label}<b>${fmt(counts[t.id])}</b><small>${pct(counts[t.id],summary.total)}</small></div>`).join('');
  }
  function focusGroup(g,includeModel=false){$('pdBrand').value=g.brand||'__missing__';$('pdModel').value=includeModel?(g.model||'__missing__'):'';$('pdYear').value='';state.page=1;requestRender();}
  function renderTable(){
    const count=state.groups.length,pages=Math.max(1,Math.ceil(count/state.pageSize));state.page=Math.min(state.page,pages);
    const start=(state.page-1)*state.pageSize,display=state.groups.slice(start,start+state.pageSize),isBrand=state.group==='brand';
    $('pdModelHeading').textContent=isBrand?'Số hiệu xe':'Hiệu xe';
    $('pdTableBody').innerHTML=display.length?display.map((g,i)=>`<tr><td><div class="pd-name-cell"><span class="pd-brand-mark" aria-hidden="true">${esc(g.brand.slice(0,2).toUpperCase()||'—')}</span><div><strong>${esc(g.brand)||'Chưa xác định'}</strong><small>${isBrand?'Danh mục hãng xe':'Danh mục hiệu xe'}</small></div></div></td><td class="pd-model">${isBrand?fmt(g.modelCount)+' hiệu xe':esc(g.model)||'Chưa xác định'}</td><td><div class="pd-share"><div class="pd-share-track"><i style="width:${state.total?g.total/state.total*100:0}%"></i></div><span>${pct(g.total,state.total)}</span></div></td><td><strong class="pd-number">${fmt(g.total)}</strong></td><td><span class="pd-type-chip pd-genuine">${fmt(g.genuine)}</span></td><td><span class="pd-type-chip pd-aftermarket">${fmt(g.aftermarket)}</span></td><td><button type="button" class="pd-open" data-row="${i}" aria-label="Lọc ${esc(g.brand)} ${esc(g.model)}" title="Lọc nhóm xe này"><svg viewBox="0 0 24 24"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button></td></tr>`).join(''):'<tr><td colspan="7"><div class="pd-empty"><strong>Không tìm thấy dữ liệu</strong>Đặt lại bộ lọc hoặc thử từ khóa khác.</div></td></tr>';
    $('pdTableBody').querySelectorAll('[data-row]').forEach(button=>button.addEventListener('click',()=>{state.group='model';focusGroup(display[Number(button.dataset.row)],!isBrand);}));
    $('pdPageInfo').innerHTML=count?`Hiển thị <b>${start+1}–${Math.min(start+state.pageSize,count)}</b> trên <b>${fmt(count)}</b> ${isBrand?'hãng xe':'nhóm hiệu xe'}`:'Không có nhóm xe phù hợp';
    const pageNumbers=[...new Set([1,state.page-1,state.page,state.page+1,pages])].filter(p=>p>0&&p<=pages).sort((a,b)=>a-b);
    let pageHtml=`<button type="button" data-page="${state.page-1}" ${state.page===1?'disabled':''} aria-label="Trang trước"><svg viewBox="0 0 24 24"><path d="m14 6-6 6 6 6"/></svg></button>`;
    pageNumbers.forEach((p,i)=>{if(i&&p-pageNumbers[i-1]>1)pageHtml+='<span style="padding:0 3px">…</span>';pageHtml+=`<button type="button" data-page="${p}" class="${p===state.page?'pd-current':''}" ${p===state.page?'aria-current="page"':''}>${p}</button>`;});
    pageHtml+=`<button type="button" data-page="${state.page+1}" ${state.page===pages?'disabled':''} aria-label="Trang sau"><svg viewBox="0 0 24 24"><path d="m10 6 6 6-6 6"/></svg></button>`;$('pdPages').innerHTML=pageHtml;
    $('pdPages').querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>{state.page=Number(button.dataset.page);renderTable();}));
  }
  function exportReport(){
    if(!state.total)return;
    const safe=value=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
    const lines=[['Hãng xe',state.group==='brand'?'Số hiệu xe':'Hiệu xe','Số bản ghi','Chính hãng','Không chính hãng','Chưa phân loại','Tỷ trọng'],...state.groups.map(g=>[g.brand||'Chưa xác định',state.group==='brand'?g.modelCount:g.model||'Chưa xác định',g.total,g.genuine,g.aftermarket,g.unknown,pct(g.total,state.total)])];
    const blob=new Blob(['\uFEFF'+lines.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`thong-ke-phu-tung${state.config?.demo?'-minh-hoa':''}-${new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'})}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast(`Đã xuất ${fmt(state.groups.length)} nhóm xe theo bộ lọc hiện tại.`);
  }
  function clear(){
    closeChartDialog(false);
    state.revision++;state.queryRevision++;state.controller?.abort();statsBridge?.dispose();loadingBridge?.dispose();statsBridge=null;loadingBridge=null;
    state.loading=false;state.sourceTotal=0;state.total=0;state.summary=null;state.chartExpanded=false;state.groups=[];state.owner=null;state.scope=null;state.loaded=false;state.page=1;state.group='model';state.descending=true;
    ['pdBrand','pdModel','pdYear','pdType','pdSearch'].forEach(id=>$(id).value='');$('pdUpdated').textContent='Chưa cập nhật';$('pdCacheNote').textContent='';$('pdSourceBadge').textContent=state.config?.demo?'Dữ liệu minh họa':'Dữ liệu hệ thống';$('partsDashboard').classList.remove('pd-loading');$('pdRefresh').disabled=false;render(emptySummary());status('');resetJob();
  }
  async function refresh(force=false){
    if(!state.config)return;
    const owner=state.config.user(),scope=String(state.config.cacheScope?.()||(state.config.demo?'demo':'system'));
    if(!owner||!state.config.canRead()){clear();status('Tài khoản chưa được cấp quyền Xem Thống kê phụ tùng.','error');return;}
    if(owner!==state.owner||scope!==state.scope){clear();state.owner=owner;state.scope=scope;}
    if(state.loading||state.loaded&&!force)return;
    const cacheKey=JSON.stringify([scope,owner]),revision=++state.revision;
    state.queryRevision++;state.controller=new AbortController();const signal=state.controller.signal;
    state.loading=true;$('partsDashboard').classList.add('pd-loading');$('pdRefresh').disabled=true;$('pdExport').disabled=true;$('pdChartExpand').disabled=true;status('');startJob();
    let nextBridge;
    const valid=()=>revision===state.revision&&owner===state.config.user()&&state.config.canRead()&&scope===String(state.config.cacheScope?.()||(state.config.demo?'demo':'system'));
    try{
      nextBridge=await createBridge();if(!valid()){nextBridge.dispose();return;}loadingBridge=nextBridge;
      let restored=false,savedAt=null,stored=false;
      if(!force){
        job.stage='restoring';job.message='Đang mở dữ liệu đã lưu trong trình duyệt…';syncJob();
        try{
          const saved=await statsCache.read(cacheKey,signal);
          if(!valid()){nextBridge.dispose();return;}
          if(saved&&saved.version===1&&saved.owner===owner&&saved.scope===scope&&Number.isFinite(saved.savedAt)&&saved.savedAt>0){
            await nextBridge.call('restore',saved.snapshot);
            restored=true;stored=true;savedAt=saved.savedAt;
          }
        }catch(error){
          if(!valid()||signal.aborted){nextBridge.dispose();return;}
          await nextBridge.call('reset');
          console.warn('Chưa dùng được bản thống kê đã lưu:',error);
        }
      }
      if(!valid()){nextBridge.dispose();return;}
      if(!restored){
        job.stage='reading';job.message=force?'Đang tải dữ liệu mới nhất…':'Chưa có bản lưu phù hợp. Đang tải dữ liệu thống kê…';syncJob();
        let streamed=false;
        const append=async batch=>{if(!valid()||signal.aborted)throw new Error('STATS_CANCELLED');streamed=true;await nextBridge.call('append',batch);};
        const loaded=await state.config.load((count,total)=>{if(valid()){job.loaded=Math.max(0,Number(count)||0);job.total=Number.isFinite(total)&&total>=0?total:null;syncJob();}},signal,append);
        if(!valid()){nextBridge.dispose();return;}
        if(!streamed&&Array.isArray(loaded)){for(let from=0;from<loaded.length;from+=1000)await append(loaded.slice(from,from+1000));}
        savedAt=Date.now();
      }
      job.stage='analyzing';job.message=restored?'Đang khôi phục báo cáo từ dữ liệu đã lưu.':'Đã đọc xong dữ liệu. Đang tính toán thống kê…';syncJob();
      let summary,filters;
      do{filters=readFilters();summary=await nextBridge.call('query',filters);if(!valid()){nextBridge.dispose();return;}}while(JSON.stringify(filters)!==JSON.stringify(readFilters()));
      if(!valid()){nextBridge.dispose();return;}
      if(!restored){
        try{
          const snapshot=await nextBridge.call('snapshot');
          if(!valid()){nextBridge.dispose();return;}
          await statsCache.write(cacheKey,{version:1,owner,scope,savedAt,snapshot},signal);
          stored=true;
        }catch(error){if(!valid()||signal.aborted){nextBridge.dispose();return;}console.warn('Không lưu được thống kê trong trình duyệt:',error);}
      }
      if(!valid()){nextBridge.dispose();return;}
      // Filters can change while the browser commits the cache transaction.
      while(JSON.stringify(filters)!==JSON.stringify(readFilters())){filters=readFilters();summary=await nextBridge.call('query',filters);if(!valid()){nextBridge.dispose();return;}}
      statsBridge?.dispose();statsBridge=nextBridge;loadingBridge=null;state.loaded=true;
      render(summary);status('');
      $('pdUpdated').textContent='Cập nhật '+new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(savedAt));
      $('pdSourceBadge').textContent=state.config.demo?'Dữ liệu minh họa':restored?'Dữ liệu đã lưu':'Dữ liệu hệ thống';
      $('pdCacheNote').textContent=stored?'Đã lưu trên trình duyệt · Bấm “Làm mới” để cập nhật':'Chưa lưu được trên trình duyệt. Dữ liệu hiện vẫn dùng được; lần mở sau sẽ tải lại.';
      job.loaded=summary.sourceTotal;job.total=summary.sourceTotal;
      finishJob('success',restored?'Đã mở bản dữ liệu lưu trong trình duyệt. Bấm “Làm mới” khi cần dữ liệu mới nhất.':'Đã cập nhật báo cáo.'+(stored?' Dữ liệu đã được lưu cho lần mở sau.':''));
    }catch(error){
      nextBridge?.dispose();if(loadingBridge===nextBridge)loadingBridge=null;
      if(revision!==state.revision)return;if(owner!==state.config.user()||!state.config.canRead()){clear();return;}
      console.error('Không tải được thống kê phụ tùng:',error);
      finishJob('error',(state.loaded?'Không thể làm mới. Đang giữ dữ liệu của lần cập nhật trước. ':'Chưa thể tải thống kê. ')+'Vui lòng kiểm tra kết nối, quyền xem dữ liệu và thử “Làm mới”.');
    }finally{
      if(revision===state.revision){state.loading=false;$('partsDashboard').classList.remove('pd-loading');$('pdRefresh').disabled=false;$('pdExport').disabled=!state.total;$('pdChartExpand').disabled=false;}
    }
  }
  function init(){
    if(!$('partsDashboard'))return;
    window.KGPTDashboardSelects?.init($('partsDashboard'));
    initJobNotifications();
    $('pdChartExpand').addEventListener('click',openChartDialog);
    $('pdChartClose').addEventListener('click',()=>closeChartDialog());
    $('pdChartDialog').addEventListener('cancel',event=>{event.preventDefault();closeChartDialog();});
    $('pdChartDialog').addEventListener('close',()=>{if(!$('pdChartDialog').open)closeChartDialog(false);});
    ['pdBrand','pdModel','pdYear','pdType'].forEach(id=>$(id).addEventListener('change',()=>{if(id==='pdBrand'){$('pdModel').value='';$('pdYear').value='';}if(id==='pdModel')$('pdYear').value='';state.page=1;requestRender();}));
    let searchTimer;$('pdSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.page=1;requestRender();},200);});
    $('pdReset').addEventListener('click',()=>{['pdBrand','pdModel','pdYear','pdType','pdSearch'].forEach(id=>$(id).value='');state.page=1;requestRender();});
    $('pdGroupBrand').addEventListener('click',()=>{state.group='brand';state.page=1;requestRender();});$('pdGroupModel').addEventListener('click',()=>{state.group='model';state.page=1;requestRender();});$('pdSort').addEventListener('click',()=>{state.descending=!state.descending;state.page=1;requestRender();});
    $('pdRefresh').addEventListener('click',()=>refresh(true));$('pdExport').addEventListener('click',exportReport);render();
  }
  window.kgptStats={configure(config){state.config=config;if(config.demo){$('pdSourceBadge').textContent='Dữ liệu minh họa';$('pdSourceBadge').classList.add('pd-demo');}},refresh,clear};
  window.partsDashboardRefresh=()=>refresh();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
