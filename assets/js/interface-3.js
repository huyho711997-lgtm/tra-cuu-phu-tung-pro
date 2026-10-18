
function tiCloseSidebar(){var s=document.getElementById('tiSidebar');if(s)s.classList.remove('open');document.getElementById('tiMobileToggle')?.setAttribute('aria-expanded','false')}
function tiToggleSidebar(){var s=document.getElementById('tiSidebar');if(s){var open=s.classList.toggle('open');document.getElementById('tiMobileToggle')?.setAttribute('aria-expanded',open?'true':'false')}}
function tiCloseAccountMenu(){var menu=document.getElementById('tiAccountMenu');var trigger=document.getElementById('tiAccountTrigger');if(menu)menu.classList.remove('open');if(trigger)trigger.setAttribute('aria-expanded','false')}
function tiToggleAccountMenu(event){if(event)event.stopPropagation();var menu=document.getElementById('tiAccountMenu');var trigger=document.getElementById('tiAccountTrigger');if(!menu||!trigger)return;var willOpen=!menu.classList.contains('open');menu.classList.toggle('open',willOpen);trigger.setAttribute('aria-expanded',willOpen?'true':'false')}

var tiHoverSidebarMedia=window.matchMedia('(min-width:1024px) and (hover:hover) and (pointer:fine)');
function tiUsesHoverSidebar(){return tiHoverSidebarMedia.matches}
function tiSetSidebarCollapsed(collapsed,animate){
    var app=document.getElementById('mainApp');var sidebar=document.getElementById('tiSidebar');
    if(!app||!sidebar)return;
    app.classList.toggle('ti-sidebar-instant',animate===false);
    app.classList.toggle('ti-sidebar-collapsed',!!collapsed);
    sidebar.dataset.expanded=collapsed?'false':'true';
}
function tiInitSidebarHover(){
    var app=document.getElementById('mainApp');var sidebar=document.getElementById('tiSidebar');
    if(!app||!sidebar||sidebar.dataset.hoverReady)return;
    sidebar.dataset.hoverReady='1';
    app.classList.add('ti-sidebar-auto');
    var edge=document.createElement('span');edge.className='ti-sidebar-edge';edge.setAttribute('aria-hidden','true');sidebar.appendChild(edge);
    var closeTimer=0;var pointerInside=false;var keyboardInside=false;
    function cancelClose(){clearTimeout(closeTimer);closeTimer=0}
    function open(){cancelClose();if(tiUsesHoverSidebar())tiSetSidebarCollapsed(false)}
    function scheduleClose(){
        cancelClose();
        if(tiUsesHoverSidebar()&&!pointerInside&&!keyboardInside){
            closeTimer=setTimeout(function(){if(!pointerInside&&!keyboardInside)tiSetSidebarCollapsed(true)},140);
        }
    }
    function syncMode(){
        cancelClose();pointerInside=sidebar.matches(':hover');keyboardInside=false;
        tiCloseSidebar();
        tiSetSidebarCollapsed(tiUsesHoverSidebar()&&!pointerInside,false);
    }
    sidebar.addEventListener('pointerenter',function(event){
        if(!tiUsesHoverSidebar()||event.pointerType==='touch')return;
        pointerInside=true;open();
    });
    sidebar.addEventListener('pointerleave',function(event){
        if(event.pointerType==='touch')return;
        pointerInside=false;scheduleClose();
    });
    sidebar.addEventListener('pointerdown',function(){keyboardInside=false});
    sidebar.addEventListener('focusin',function(event){
        if(tiUsesHoverSidebar()&&event.target.matches(':focus-visible')){keyboardInside=true;open()}
    });
    sidebar.addEventListener('focusout',function(){
        queueMicrotask(function(){
            keyboardInside=sidebar.contains(document.activeElement)&&document.activeElement.matches(':focus-visible');
            if(!keyboardInside)scheduleClose();
        });
    });
    tiHoverSidebarMedia.addEventListener('change',syncMode);
    syncMode();
}
function tiNavigate(view,button){
    if(typeof switchMainLookupTab==='function'&&switchMainLookupTab(view)===false)return;
    document.querySelectorAll('.ti-nav-btn[data-ti-view]').forEach(function(el){el.classList.remove('active')});
    if(button)button.classList.add('active');tiCloseSidebar();window.scrollTo({top:0,behavior:'smooth'});
}
document.addEventListener('click',function(event){
    var sidebar=document.getElementById('tiSidebar');var toggle=document.getElementById('tiMobileToggle');
    if(!tiUsesHoverSidebar()&&sidebar&&sidebar.classList.contains('open')&&!sidebar.contains(event.target)&&!(toggle&&toggle.contains(event.target)))tiCloseSidebar();
    var account=document.getElementById('tiAccountWrap');if(account&&!account.contains(event.target))tiCloseAccountMenu();
});
document.addEventListener('keydown',function(event){if(event.key==='Escape'){tiCloseAccountMenu();tiCloseSidebar()}});
document.addEventListener('DOMContentLoaded',function(){
    var name=document.getElementById('userDisplayName');var avatar=document.getElementById('tiAccountAvatar');var role=document.getElementById('tiAccountRole');var roleSource=document.getElementById('heroUserRoleBadge');
    var syncIdentity=function(){if(name&&avatar){var value=(name.textContent||'U').trim();avatar.textContent=value.charAt(0).toLocaleUpperCase('vi-VN')||'U'}if(role&&roleSource&&roleSource.textContent.trim())role.textContent=roleSource.textContent.trim()};
    syncIdentity();if(name)new MutationObserver(syncIdentity).observe(name,{childList:true,subtree:true,characterData:true});if(roleSource)new MutationObserver(syncIdentity).observe(roleSource,{childList:true,subtree:true,characterData:true});
});
document.addEventListener('DOMContentLoaded',function(){
    tiInitSidebarHover();
    var source=document.getElementById('sysMgrBtn');var target=document.getElementById('tiSidebarAdmin');
    if(!source||!target)return;
    var syncAdmin=function(){target.hidden=source.classList.contains('hidden')||source.hidden};
    syncAdmin();new MutationObserver(syncAdmin).observe(source,{attributes:true,attributeFilter:['class','hidden']});
});
function tiUpdateLiveDateTime(){
    var heroTime=document.getElementById('heroCurrentTimeText')||document.getElementById('portalCurrentTimeText');
    if(heroTime)heroTime.textContent=new Date().toLocaleString('vi-VN',{weekday:'long',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Ho_Chi_Minh'});
    var dateEl=document.getElementById('tiLiveDate');var timeEl=document.getElementById('tiLiveTime');var weekdayEl=document.getElementById('tiLiveWeekdayShort');var wrap=document.getElementById('tiLiveDateTime');
    if(!dateEl||!timeEl||!weekdayEl||!wrap)return;
    var now=new Date();var timeZone='Asia/Ho_Chi_Minh';
    var weekday=new Intl.DateTimeFormat('vi-VN',{weekday:'long',timeZone:timeZone}).format(now);
    weekday=weekday.charAt(0).toLocaleUpperCase('vi-VN')+weekday.slice(1);
    var weekdayKey=weekday.toLocaleLowerCase('vi-VN');
    var weekdayShortMap={'chủ nhật':'CN','thứ hai':'T2','thứ ba':'T3','thứ tư':'T4','thứ năm':'T5','thứ sáu':'T6','thứ bảy':'T7'};
    var weekdayShort=weekdayShortMap[weekdayKey]||weekday.slice(0,2).toLocaleUpperCase('vi-VN');
    var date=new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:timeZone}).format(now);
    var time=new Intl.DateTimeFormat('vi-VN',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:timeZone}).format(now);
    weekdayEl.textContent=weekdayShort;dateEl.textContent=weekday+', '+date;timeEl.textContent=time;wrap.setAttribute('aria-label',weekday+', '+date+' lúc '+time);
}
document.addEventListener('DOMContentLoaded',function(){
    tiUpdateLiveDateTime();
    if(window.__tiLiveDateTimeTimer)clearInterval(window.__tiLiveDateTimeTimer);
    window.__tiLiveDateTimeTimer=setInterval(tiUpdateLiveDateTime,1000);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)tiUpdateLiveDateTime()});
});
