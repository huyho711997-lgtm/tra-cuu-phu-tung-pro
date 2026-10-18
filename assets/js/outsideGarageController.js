
(function(){
  'use strict';
  const root=document.getElementById('outsideGarageSection');
  const catalogElement=document.getElementById('outsideGarageCatalog');
  if(!root||!catalogElement)return;
  const catalog=JSON.parse(catalogElement.textContent);
  const el=id=>document.getElementById(id);
  const money=new Intl.NumberFormat('vi-VN');
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fold=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]/g,'');
  const state={group:'sedan',model:'',query:'',level:'all',status:'all',page:1,size:10};
  const aliases={1:'ca pô nắp capo bonnet hood',2:'ga lăng lưới tản nhiệt',5:'cửa trước cửa sau',17:'ba đờ sốc cản trước bumper',18:'quây dưới ba đờ sốc cản',19:'ốp đầu ba đờ sốc cản',20:'ba đờ sốc cản trước miếng trên',21:'ba đờ sốc cản trước miếng dưới',22:'ba đờ sốc cản sau',24:'la zăng mâm bánh xe'};
  const searchableItems=new Map(catalog.items.map(item=>[item.id,fold(item.name+' '+(aliases[item.no]||''))]));
  function parseItemQuery(value){return [...new Set(value.split(/[,;\r\n]+/).map(fold).filter(Boolean))];}
  const groups=catalog.groups;
  let vehicleChoices=[],focusIndex=-1;
  let visibleItems=[];
  function styleLookupSelectMenus(){
    ['pgDamage','pgPageSize'].forEach(id=>el(id).__kgptPremiumWrapper?.__kgptMenu?.classList.add('pg-owned-select-menu'));
  }
  function groupIndex(){return groups.findIndex(g=>g.id===state.group);}
  function currentGroup(){return groups[groupIndex()];}
  function rates(item){const index=groupIndex();return item.rates.common?{common:item.rates.common[index]}:{A:item.rates.A?.[index]??null,B:item.rates.B?.[index]??null};}
  function hasRate(item){const rate=rates(item);if(Object.hasOwn(rate,'common'))return rate.common!==null;return state.level==='all'?(rate.A!==null||rate.B!==null):rate[state.level]!==null;}
  function priceHtml(value,common=false){
    if(value===null)return '<span>Chưa có giá</span>'+(common?'<small>Ô trống trong bảng gốc</small>':'');
    return escape(money.format(value))+'<span class="pg-price-unit">₫</span>'+((common||value===0)?'<small>'+ (value===0?'Ghi 0 trong bảng gốc':state.level==='all'?'Đơn giá chung · Không phân mức':'Đơn giá chung')+'</small>':'');
  }
  function priceCell(value,label,common=false){
    const span=common&&state.level==='all'?' colspan="2"':'';
    const classes='pg-price'+(common?' pg-common':'')+(value===null?' pg-empty-price':value===0?' pg-zero':'');
    return '<td class="'+classes+'"'+span+' data-pg-label="'+escape(label)+'">'+priceHtml(value,common)+'</td>';
  }
  function render(){
    styleLookupSelectMenus();
    const group=currentGroup(),index=groupIndex();
    el('pgVehicleValue').textContent=state.model||group.label;
    el('pgGroupContext').textContent=group.label;
    el('pgModelContext').textContent=state.model?'Dòng xe tham chiếu: '+state.model:'Tra cứu theo nhóm trong bảng giá';
    const all=catalog.items;
    const priced=all.filter(hasRate).length;
    el('pgPricedCount').textContent=priced;
    el('pgMissingCount').textContent=all.length-priced;
    el('pgMissingNote').textContent='Chưa có đơn giá'+(state.level==='all'?'':' · Mức '+state.level);
    const overhaul=all.find(item=>item.no===32).rates.common[index];
    el('pgOverhaulPrice').innerHTML=money.format(overhaul)+' <small>₫</small>';
    const terms=parseItemQuery(state.query);
    const matches=all.filter(item=>!terms.length||terms.some(term=>searchableItems.get(item.id).includes(term)));
    const searchHelp=terms.length>1?'Đang tìm '+terms.length+' từ khóa · Dùng , hoặc ;':'Nhiều hạng mục: cách nhau bằng , hoặc ;';
    if(el('pgItemSearchHelp').textContent!==searchHelp)el('pgItemSearchHelp').textContent=searchHelp;
    const matchesPriced=matches.filter(hasRate);
    el('pgAllCount').textContent=matches.length;
    el('pgAvailableCount').textContent=matchesPriced.length;
    el('pgUnavailableCount').textContent=matches.length-matchesPriced.length;
    root.querySelectorAll('[data-pg-status]').forEach(button=>{const active=button.dataset.pgStatus===state.status;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    visibleItems=matches.filter(item=>state.status==='all'||(state.status==='priced'?hasRate(item):!hasRate(item)));
    const pages=Math.max(1,Math.ceil(visibleItems.length/state.size));
    state.page=Math.min(state.page,pages);
    const start=(state.page-1)*state.size;
    const shown=visibleItems.slice(start,start+state.size);
    el('pgResultCount').textContent=visibleItems.length;
    el('pgResultSubtitle').textContent=(state.model?state.model+' · ':'')+group.label+' · Bảng giá 2024';
    const levelHead=level=>'<th scope="col"><span class="pg-th-level"><i class="pg-th-dot'+(level==='B'?' pg-b':'')+'"></i>MỨC '+level+'</span><small>'+(level==='A'?'Trầy xước nhẹ':'Xước sâu, lõm hoặc móp')+'</small></th>';
    el('pgTableHead').innerHTML='<tr><th scope="col">STT</th><th scope="col">HẠNG MỤC SƠN SỬA</th>'+(state.level==='all'?levelHead('A')+levelHead('B'):levelHead(state.level))+'<th scope="col">NGUỒN<small>Trang PDF</small></th></tr>';
    el('pgTableBody').classList.toggle('pg-single-level',state.level!=='all');
    el('pgTableBody').innerHTML=shown.length?shown.map(item=>{
      const rate=rates(item);
      const cells=Object.hasOwn(rate,'common')?priceCell(rate.common,'ĐƠN GIÁ CHUNG',true):state.level==='all'?priceCell(rate.A,'MỨC A')+priceCell(rate.B,'MỨC B'):priceCell(rate[state.level],'MỨC '+state.level);
      return '<tr data-pg-item="'+item.id+'"'+(item.no===32?' class="pg-overhaul-row"':'')+'><td class="pg-row-no">'+item.no+'</td><td class="pg-name-cell"><span class="pg-item-name">'+escape(item.name)+(item.no===32?'<span class="pg-item-full">TOÀN XE</span>':'')+'</span><span class="pg-item-meta">'+(item.id==='24-phay'?'Hạng mục thuộc danh mục 24':Object.hasOwn(rate,'common')?'Đơn giá theo hạng mục':'Phân mức theo hư hỏng A / B')+'</span></td>'+cells+'<td class="pg-source-cell"><a href="'+catalog.source+'#page='+item.page+'" target="_blank" rel="noopener" aria-label="Đối chiếu '+escape(item.name)+' tại trang '+item.page+' của PDF">'+item.page+'<svg viewBox="0 0 24 24"><path d="M7 17 17 7M7 7h10v10"/></svg></a></td></tr>';
    }).join(''):'<tr><td class="pg-empty-state" colspan="'+(state.level==='all'?5:4)+'"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><strong>Không tìm thấy hạng mục phù hợp</strong><p>Thử từ khóa khác hoặc chuyển trạng thái đơn giá.</p><button type="button" data-pg-clear-items data-premium-delete-bypass="1">Xóa bộ lọc hạng mục</button></td></tr>';
    el('pgPageSummary').textContent=visibleItems.length?'Hiển thị '+(start+1)+'–'+(start+shown.length)+' / '+visibleItems.length+' hạng mục':'0 hạng mục phù hợp';
    el('pgPageNumber').textContent=state.page+' / '+pages;
    el('pgPrev').disabled=state.page<=1;
    el('pgNext').disabled=state.page>=pages;
    el('pgClearSearch').hidden=!state.query;
  }
  function choicesForQuery(query){
    const q=fold(query);
    const choices=[];
    groups.forEach(group=>{
      if(!q||fold(group.label+' '+group.sourceLabel).includes(q))choices.push({group:group.id,model:'',label:group.label,detail:group.models.length?group.models.join(', '):'Tra cứu theo nhóm xe trong bảng giá'});
      if(q)group.models.forEach(model=>{if(fold(model).includes(q))choices.push({group:group.id,model,label:model,detail:'Nhóm giá: '+group.label});});
    });
    return choices;
  }
  function renderChoices(){
    vehicleChoices=choicesForQuery(el('pgVehicleSearch').value);
    focusIndex=-1;
    el('pgVehicleSearch').removeAttribute('aria-activedescendant');
    el('pgVehicleOptions').innerHTML=vehicleChoices.length?vehicleChoices.map((choice,i)=>{
      const selected=choice.group===state.group&&choice.model===state.model;
      return '<button type="button" role="option" tabindex="-1" class="pg-vehicle-option" id="pgVehicleOption'+i+'" data-pg-choice="'+i+'" aria-selected="'+selected+'"><span class="pg-vehicle-option-copy"><strong>'+escape(choice.label)+'</strong><small>'+escape(choice.detail)+'</small></span><span class="pg-option-count">33 hạng mục</span><span class="pg-option-check">'+(selected?'<svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg>':'')+'</span></button>';
    }).join(''):'<div class="pg-picker-empty">Không có dòng xe này trong danh sách tham chiếu.<br>Thử tìm nhóm xe: sedan, SUV, bán tải…</div>';
  }
  function closePicker(restore=false){
    el('pgVehicleMenu').hidden=true;
    el('pgVehicleTrigger').setAttribute('aria-expanded','false');
    el('pgVehicleSearch').setAttribute('aria-expanded','false');
    if(restore)el('pgVehicleTrigger').focus();
  }
  function openPicker(){
    el('pgVehicleSearch').value='';
    renderChoices();
    el('pgVehicleMenu').hidden=false;
    el('pgVehicleTrigger').setAttribute('aria-expanded','true');
    el('pgVehicleSearch').setAttribute('aria-expanded','true');
    el('pgVehicleSearch').focus();
  }
  function choose(index){
    const choice=vehicleChoices[index];if(!choice)return;
    state.group=choice.group;state.model=choice.model;state.page=1;
    render();closePicker(true);
  }
  function focusChoice(index){
    if(!vehicleChoices.length)return;
    focusIndex=(index+vehicleChoices.length)%vehicleChoices.length;
    el('pgVehicleOptions').querySelectorAll('.pg-vehicle-option').forEach((button,i)=>button.classList.toggle('pg-focused',i===focusIndex));
    const focused=el('pgVehicleOption'+focusIndex);
    el('pgVehicleSearch').setAttribute('aria-activedescendant',focused.id);
    const list=el('pgVehicleOptions');
    const top=focused.offsetTop-list.offsetTop;
    if(top<list.scrollTop)list.scrollTop=top;
    else if(top+focused.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=top+focused.offsetHeight-list.clientHeight;
  }
  function clearItems(){state.query='';state.status='all';state.page=1;el('pgItemSearch').value='';render();el('pgItemSearch').focus();}
  el('pgVehicleTrigger').addEventListener('click',()=>el('pgVehicleMenu').hidden?openPicker():closePicker());
  el('pgVehicleTrigger').addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();openPicker();focusChoice(0);}});
  el('pgVehicleSearch').addEventListener('input',renderChoices);
  el('pgVehicleOptions').addEventListener('click',event=>{const button=event.target.closest('[data-pg-choice]');if(button)choose(Number(button.dataset.pgChoice));});
  el('pgVehicleMenu').addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();closePicker(true);}
    if(event.key==='Tab')closePicker();
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();focusChoice(focusIndex+(event.key==='ArrowDown'?1:-1));}
    if(event.key==='Enter'&&event.target===el('pgVehicleSearch')){event.preventDefault();choose(focusIndex<0?0:focusIndex);}
  });
  document.addEventListener('click',event=>{if(!event.target.closest('.pg-vehicle-field'))closePicker();});
  const damageGuide=el('pgDamageGuide');
  function positionDamageGuide(){
    damageGuide.classList.remove('pg-guide-opens-up','pg-guide-fixed');
    if(!damageGuide.open)return;
    const anchor=damageGuide.querySelector('summary').getBoundingClientRect();
    const popup=damageGuide.querySelector('.pg-damage-popover');
    const height=popup.getBoundingClientRect().height;
    const headerBottom=document.querySelector('.app-topbar')?.getBoundingClientRect().bottom||0;
    const below=window.innerHeight-anchor.bottom-20;
    const above=anchor.top-Math.max(12,headerBottom)-20;
    if(height>below)damageGuide.classList.add(height<=above?'pg-guide-opens-up':'pg-guide-fixed');
  }
  damageGuide.addEventListener('toggle',positionDamageGuide);
  window.addEventListener('resize',positionDamageGuide,{passive:true});
  document.addEventListener('click',event=>{if(!damageGuide.contains(event.target))damageGuide.open=false;});
  damageGuide.addEventListener('keydown',event=>{if(event.key==='Escape'){damageGuide.open=false;damageGuide.querySelector('summary').focus();}});
  root.addEventListener('focusout',event=>{if(!event.relatedTarget?.closest('.pg-vehicle-field'))closePicker();});
  el('pgItemSearch').addEventListener('input',event=>{state.query=event.target.value.trim();state.page=1;render();});
  el('pgItemSearch').addEventListener('paste',event=>{
    const text=event.clipboardData?.getData('text')||'';
    if(!/[\r\n]/.test(text))return;
    event.preventDefault();
    const input=event.currentTarget;
    input.setRangeText(text.replace(/\r\n?|\n/g,', '),input.selectionStart??input.value.length,input.selectionEnd??input.value.length,'end');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  // Filter resets are reversible and must not invoke the app's data-deletion confirmation guard.
  el('pgClearSearch').addEventListener('click',()=>{state.query='';state.page=1;el('pgItemSearch').value='';render();el('pgItemSearch').focus();});
  el('pgDamage').addEventListener('change',event=>{state.level=event.target.value;state.page=1;render();});
  root.querySelectorAll('[data-pg-status]').forEach(button=>button.addEventListener('click',()=>{state.status=button.dataset.pgStatus;state.page=1;render();}));
  el('pgTableBody').addEventListener('click',event=>{if(event.target.closest('[data-pg-clear-items]'))clearItems();});
  el('pgPrev').addEventListener('click',()=>{state.page--;render();});
  el('pgNext').addEventListener('click',()=>{state.page++;render();});
  el('pgPageSize').addEventListener('change',event=>{state.size=Number(event.target.value);state.page=1;render();});
  el('pgReset').addEventListener('click',()=>{
    Object.assign(state,{group:'sedan',model:'',query:'',level:'all',status:'all',page:1,size:10});
    el('pgItemSearch').value='';el('pgDamage').value='all';el('pgPageSize').value='10';
    // Keep the existing shared select UI in sync without assigning it a second owner.
    el('pgDamage').dispatchEvent(new Event('change',{bubbles:true}));
    el('pgPageSize').dispatchEvent(new Event('change',{bubbles:true}));
    closePicker();render();
  });
  window.paintGarageRefresh=render;
  document.addEventListener('DOMContentLoaded',styleLookupSelectMenus,{once:true});
  render();
})();

