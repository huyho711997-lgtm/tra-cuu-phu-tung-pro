
(function(){
    const STYLE_ID = 'kgpt-unified-premium-dropdown-style';
    const SELECTOR = 'select:not([data-kgpt-native="1"]):not(.premium-time-native):not([aria-hidden="true"]):not([tabindex="-1"]):not(.kgpt-select-native)';
    const styleText = `
        .kgpt-premium-select{position:relative;display:inline-block;min-width:168px;vertical-align:middle;font-family:'Plus Jakarta Sans','Segoe UI',sans-serif}
        .kgpt-premium-select.kgpt-select-full{display:block;width:100%;min-width:0}.kgpt-premium-select.kgpt-select-compact{min-width:112px}
        .kgpt-select-trigger{width:100%;height:44px;padding:0 11px 0 8px;border:1px solid #d6e1ef;border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.99),rgba(248,251,255,.97));color:#344258;display:flex;align-items:center;gap:9px;font-family:inherit;font-size:12px;line-height:1.25;font-weight:700;text-align:left;white-space:nowrap;cursor:pointer;outline:none;box-shadow:0 8px 20px -20px rgba(15,23,42,.72),inset 0 1px 0 rgba(255,255,255,.94);transition:border-color .17s ease,box-shadow .17s ease,background .17s ease,transform .17s ease}
        .kgpt-select-trigger:hover{border-color:#9ab8ec;background:#fff;box-shadow:0 0 0 3px rgba(37,99,235,.055),0 13px 26px -22px rgba(37,99,235,.7)}
        .kgpt-premium-select.is-open .kgpt-select-trigger,.kgpt-select-trigger:focus-visible{border-color:#79a3ef;background:#fff;box-shadow:0 0 0 3px rgba(37,99,235,.095),0 16px 30px -23px rgba(37,99,235,.75)}
        .kgpt-select-trigger:disabled{opacity:.58;cursor:not-allowed;background:#f1f5f9}.kgpt-select-leading{width:28px;height:28px;flex:none;border-radius:9px;display:grid;place-items:center;background:linear-gradient(145deg,#edf4ff,#e2edff);color:#3970d4;box-shadow:inset 0 1px 0 #fff}.kgpt-select-leading svg{width:15px;height:15px}.kgpt-select-label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .kgpt-select-chevron{width:16px;height:16px;flex:none;color:#7d8fa9;transition:transform .18s ease,color .18s ease}.kgpt-premium-select.is-open .kgpt-select-chevron{color:#2563eb;transform:rotate(180deg)}
        .kgpt-select-native{position:absolute!important;inset:auto!important;width:1px!important;height:1px!important;margin:0!important;padding:0!important;border:0!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important}
        .kgpt-select-menu{position:fixed;z-index:2147483200;display:none;min-width:168px;max-width:min(390px,calc(100vw - 24px));max-height:276px;padding:7px;border:1px solid #d8e3f1;border-radius:14px;background:rgba(255,255,255,.985);box-shadow:0 26px 62px -24px rgba(15,23,42,.48),0 12px 27px -20px rgba(37,99,235,.34);overflow:auto;overscroll-behavior:contain;backdrop-filter:blur(18px);opacity:0;visibility:hidden;transform:translateY(-5px) scale(.985);transform-origin:top;transition:opacity .16s ease,visibility .16s ease,transform .16s ease;scrollbar-width:thin;scrollbar-color:#bfd0e8 transparent}
        .kgpt-select-menu.is-open{display:block;opacity:1;visibility:visible;transform:none}.kgpt-select-menu.opens-up{transform-origin:bottom}
        .kgpt-select-option{position:relative;width:100%;min-height:41px;padding:9px 37px 9px 11px;border:0;border-radius:10px;background:transparent;color:#475569;display:flex;align-items:center;font-family:inherit;font-size:12px;line-height:1.35;font-weight:650;text-align:left;cursor:pointer;outline:none;transition:background .14s ease,color .14s ease,transform .14s ease}
        .kgpt-select-option:hover,.kgpt-select-option:focus-visible{background:#f0f5ff;color:#2457bf}.kgpt-select-option.is-selected{background:linear-gradient(135deg,#edf4ff,#f3f7ff);color:#1d4ed8;font-weight:800}.kgpt-select-option:disabled{opacity:.45;cursor:not-allowed}
        .kgpt-select-check{position:absolute;right:11px;top:50%;width:16px;height:16px;color:#2563eb;opacity:0;transform:translateY(-50%) scale(.72);transition:.15s}.kgpt-select-option.is-selected .kgpt-select-check{opacity:1;transform:translateY(-50%) scale(1)}
        .kgpt-select-compact .kgpt-select-trigger{height:36px;border-radius:10px;padding-left:11px;font-size:11.5px}.kgpt-select-compact .kgpt-select-leading{display:none}.kgpt-select-compact .kgpt-select-option{min-height:36px;font-size:11.5px}
        .competition-filters .kgpt-premium-select{min-width:185px}.competition-filters #competitionTaskFilter+.kgpt-select-trigger,.competition-filters .kgpt-premium-select:has(#competitionTaskFilter){min-width:220px}.competition-filters .kgpt-select-trigger{height:48px;border-radius:13px}
        .competition-filters .kgpt-select-trigger,.competition-search input{font-family:'Plus Jakarta Sans','Segoe UI',sans-serif!important;font-size:13px!important;line-height:1.3!important;font-weight:700!important;letter-spacing:0!important}.competition-search input::placeholder{font-family:'Plus Jakarta Sans','Segoe UI',sans-serif!important;font-size:13px!important;font-weight:700!important;letter-spacing:0!important;color:#718198!important;opacity:1!important}.kgpt-select-menu-competition .kgpt-select-option{font-size:13px!important;line-height:1.35!important;font-weight:650!important}
        .user-api-field .kgpt-premium-select,.quote-settings-field .kgpt-premium-select,.premium-input-group .kgpt-premium-select{display:block;width:100%;min-width:0}
        #userModal .field .kgpt-premium-select{display:block;width:100%;min-width:0}#userModal .field .kgpt-select-trigger{height:44px;border-radius:11px;padding:0 12px 0 9px;font-size:12px;gap:8px;box-shadow:none;background:#fbfcfe}#userModal .field .kgpt-select-trigger:hover{border-color:#8cafef;background:#fff}.user-api-field .kgpt-select-trigger{height:46px;border-radius:15px}.quote-settings-field .kgpt-select-trigger{height:52px;border-radius:16px}.kgpt-select-height-48 .kgpt-select-trigger{height:48px}.kgpt-select-height-56 .kgpt-select-trigger{height:56px}.mapping-status-stack .kgpt-premium-select{min-width:112px}
        html.dark .kgpt-select-trigger{border-color:#334155;background:linear-gradient(180deg,#1c283b,#172235);color:#e2e8f0;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}html.dark .kgpt-select-trigger:hover,html.dark .kgpt-premium-select.is-open .kgpt-select-trigger{border-color:#5275b3;background:#1b2940;box-shadow:0 0 0 3px rgba(59,130,246,.12)}html.dark .kgpt-select-leading{background:linear-gradient(145deg,#243451,#1f2e48);color:#93c5fd;box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}html.dark .kgpt-select-chevron{color:#93a4bb}html.dark .kgpt-select-menu{border-color:#334155;background:rgba(17,24,39,.985);box-shadow:0 28px 65px -22px rgba(0,0,0,.8)}html.dark .kgpt-select-option{color:#cbd5e1}html.dark .kgpt-select-option:hover,html.dark .kgpt-select-option:focus-visible{background:#1d2b42;color:#bfdbfe}html.dark .kgpt-select-option.is-selected{background:linear-gradient(135deg,#1e3a66,#1b3155);color:#93c5fd}
        @media(max-width:640px){.competition-filters .kgpt-premium-select{display:block;width:100%;min-width:0}.kgpt-select-menu{max-width:calc(100vw - 20px)}}
    `;

    function ensureStyle(doc){
        if(!doc || doc.getElementById(STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = styleText;
        (doc.head || doc.documentElement).appendChild(style);
    }

    function hasCustomSelectUi(select){
        return !!select && (
            select.dataset.premium === '1' || !!select.dataset.premiumReady || !!select.dataset.premiumFilterReady ||
            select.matches('.premium-select-native,.premium-filter-native,.premium-user-filter-native,.premium-time-native') ||
            !!select.closest('.premium-select,.premium-filter,.premium-user-filter,.premium-dropdown,.premium-time-dropdown')
        );
    }
    function shouldSkip(select){
        return !select || select.dataset.kgptNative === '1' || hasCustomSelectUi(select) || select.dataset.kgptPremiumSelect === '1' || !!select.closest('.hidden,[hidden]');
    }

    function closeAll(doc, except){
        if(!doc) return;
        doc.querySelectorAll('.kgpt-premium-select.is-open').forEach(wrapper => {
            if(wrapper !== except && typeof wrapper.__kgptClose === 'function') wrapper.__kgptClose();
        });
    }

    function getLeadingIcon(select){
        const id = String(select.id || '').toLowerCase();
        if(id.includes('period')) return '<svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24"><path d="M6 3v3M18 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        if(id.includes('task')) return '<svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke-linejoin="round"/><path d="M15 3v5h4M9 12h6M9 16h5" stroke-linecap="round"/></svg>';
        if(id.includes('role')) return '<svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.8 2.9 7.8 7 9.5 4.1-1.7 7-4.7 7-9.5V6l-7-3Z" stroke-linejoin="round"/><path d="m9 12 2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        if(id.includes('lang')) return '<svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21c-2.2-2.5-3.3-5.5-3.3-9S9.8 5.5 12 3Z" stroke-linecap="round"/></svg>';
        if(id.includes('engine')) return '<svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6" stroke-linecap="round"/><circle cx="14" cy="7" r="2"/><circle cx="7" cy="17" r="2"/></svg>';
        if(id.includes('provider')) return '<svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24"><path d="m12 3 1.4 4.2L18 9l-4.6 1.8L12 15l-1.4-4.2L6 9l4.6-1.8L12 3ZM18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" stroke-linejoin="round"/></svg>';
        return '<svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h9" stroke-linecap="round"/></svg>';
    }

    function enhanceSelect(select){
        if(hasCustomSelectUi(select)) {
            select.__kgptPremiumWrapper?.__kgptDestroy?.();
            select.tabIndex = -1;
            return null;
        }
        if(shouldSkip(select)) return null;
        const doc = select.ownerDocument;
        const view = doc.defaultView || window;
        ensureStyle(doc);
        select.dataset.kgptPremiumSelect = '1';
        const wrapper = doc.createElement('span');
        wrapper.className = 'kgpt-premium-select';
        if(select.classList.contains('w-full') || select.classList.contains('user-api-select') || select.classList.contains('quote-settings-select') || select.id === 'addUserRole' || select.id === 'editUserRole') wrapper.classList.add('kgpt-select-full');
        if(select.classList.contains('quote-ocr-status')) wrapper.classList.add('kgpt-select-compact');
        if(select.classList.contains('h-12')) wrapper.classList.add('kgpt-select-height-48');
        if(select.classList.contains('h-14')) wrapper.classList.add('kgpt-select-height-56');
        const trigger = doc.createElement('button');
        trigger.type = 'button';
        trigger.className = 'kgpt-select-trigger';
        trigger.setAttribute('aria-haspopup','listbox');
        trigger.setAttribute('aria-expanded','false');
        const leading = doc.createElement('span');
        leading.className = 'kgpt-select-leading';
        leading.setAttribute('aria-hidden','true');
        leading.innerHTML = getLeadingIcon(select);
        const label = doc.createElement('span');
        label.className = 'kgpt-select-label';
        const chevron = doc.createElementNS('http://www.w3.org/2000/svg','svg');
        chevron.setAttribute('class','kgpt-select-chevron');
        chevron.setAttribute('viewBox','0 0 24 24');
        chevron.setAttribute('fill','none');
        chevron.setAttribute('stroke','currentColor');
        chevron.setAttribute('stroke-width','2');
        chevron.innerHTML = '<path d="m7 10 5 5 5-5" stroke-linecap="round" stroke-linejoin="round"/>';
        trigger.append(leading,label,chevron);
        const menu = doc.createElement('div');
        menu.className = 'kgpt-select-menu';
        if(select.closest('.competition-filters')) menu.classList.add('kgpt-select-menu-competition');
        menu.setAttribute('role','listbox');
        select.parentNode.insertBefore(wrapper,select);
        wrapper.append(select,trigger);
        doc.body.appendChild(menu);
        const previousTabIndex = select.getAttribute('tabindex');
        select.classList.add('kgpt-select-native');
        select.tabIndex = -1;

        function positionMenu(){
            if(!wrapper.classList.contains('is-open')) return;
            const rect = trigger.getBoundingClientRect();
            const viewportWidth = Math.max(320,view.innerWidth || doc.documentElement.clientWidth || 0);
            const viewportHeight = Math.max(320,view.innerHeight || doc.documentElement.clientHeight || 0);
            const width = Math.min(Math.max(rect.width,168),viewportWidth - 20);
            menu.style.width = `${width}px`;
            menu.style.maxWidth = `${width}px`;
            menu.style.left = `${Math.max(10,Math.min(rect.left,viewportWidth - width - 10))}px`;
            const menuHeight = Math.min(menu.scrollHeight || 276,276);
            const opensUp = rect.bottom + 8 + menuHeight > viewportHeight - 10 && rect.top > menuHeight + 18;
            menu.classList.toggle('opens-up',opensUp);
            menu.style.top = `${opensUp ? Math.max(10,rect.top - menuHeight - 8) : Math.min(viewportHeight - menuHeight - 10,rect.bottom + 8)}px`;
        }

        function sync(){
            const selected = select.options[select.selectedIndex] || select.options[0];
            label.textContent = selected?.textContent?.trim() || select.getAttribute('placeholder') || 'Chọn giá trị';
            trigger.disabled = !!select.disabled;
            trigger.setAttribute('aria-label',select.getAttribute('aria-label') || label.textContent);
            menu.innerHTML = '';
            Array.from(select.options).forEach((nativeOption,index) => {
                const option = doc.createElement('button');
                option.type = 'button';
                option.className = 'kgpt-select-option';
                option.dataset.value = nativeOption.value;
                option.setAttribute('role','option');
                option.setAttribute('aria-selected',String(index === select.selectedIndex));
                option.disabled = !!nativeOption.disabled;
                option.classList.toggle('is-selected',index === select.selectedIndex);
                const optionLabel = doc.createElement('span');
                optionLabel.textContent = nativeOption.textContent;
                const check = doc.createElementNS('http://www.w3.org/2000/svg','svg');
                check.setAttribute('class','kgpt-select-check');
                check.setAttribute('viewBox','0 0 24 24');
                check.setAttribute('fill','none');
                check.setAttribute('stroke','currentColor');
                check.setAttribute('stroke-width','2.4');
                check.innerHTML = '<path d="m6 12 4 4 8-9" stroke-linecap="round" stroke-linejoin="round"/>';
                option.append(optionLabel,check);
                option.addEventListener('click',event => {
                    event.stopPropagation();
                    if(option.disabled) return;
                    select.value = nativeOption.value;
                    sync();
                    close();
                    select.dispatchEvent(new view.Event('change',{bubbles:true}));
                    trigger.focus({preventScroll:true});
                });
                menu.appendChild(option);
            });
            if(wrapper.classList.contains('is-open')) positionMenu();
        }

        function open(){
            if(trigger.disabled) return;
            sync();
            closeAll(doc,wrapper);
            wrapper.classList.add('is-open');
            menu.style.display = 'block';
            menu.style.visibility = 'hidden';
            menu.classList.add('is-open');
            positionMenu();
            menu.style.visibility = '';
            trigger.setAttribute('aria-expanded','true');
            const active = menu.querySelector('.kgpt-select-option.is-selected');
            active?.scrollIntoView({block:'nearest'});
        }
        function close(){
            wrapper.classList.remove('is-open');
            menu.classList.remove('is-open','opens-up');
            menu.style.display = '';
            menu.style.visibility = '';
            trigger.setAttribute('aria-expanded','false');
        }
        wrapper.__kgptClose = close;
        wrapper.__kgptSync = sync;
        wrapper.__kgptMenu = menu;
        select.__kgptPremiumWrapper = wrapper;
        trigger.addEventListener('click',event => { event.stopPropagation(); wrapper.classList.contains('is-open') ? close() : open(); });
        trigger.addEventListener('keydown',event => {
            if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
                event.preventDefault();
                if(!wrapper.classList.contains('is-open')) open();
                const options = Array.from(menu.querySelectorAll('.kgpt-select-option:not(:disabled)'));
                const focusedIndex = options.indexOf(doc.activeElement);
                const current = focusedIndex < 0 ? (event.key === 'ArrowUp' ? options.length : -1) : focusedIndex;
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key === 'ArrowUp' ? Math.max(0,current - 1) : Math.min(options.length - 1,current + 1);
                options[next]?.focus();
            } else if(event.key === 'Escape') close();
        });
        menu.addEventListener('keydown',event => {
            const options = Array.from(menu.querySelectorAll('.kgpt-select-option:not(:disabled)'));
            const current = Math.max(0,options.indexOf(doc.activeElement));
            if(event.key === 'ArrowDown' || event.key === 'ArrowUp'){
                event.preventDefault();
                options[event.key === 'ArrowDown' ? Math.min(options.length - 1,current + 1) : Math.max(0,current - 1)]?.focus();
            } else if(event.key === 'Escape'){ event.preventDefault(); close(); trigger.focus({preventScroll:true}); }
        });
        select.addEventListener('change',sync);
        const nativeObserver = new view.MutationObserver(() => {
            if(hasCustomSelectUi(select)) wrapper.__kgptDestroy();
            else sync();
        });
        wrapper.__kgptDestroy = function(){
            if(select.__kgptPremiumWrapper !== wrapper) return;
            const wasFocused = doc.activeElement === trigger;
            const customTrigger = wrapper.querySelector('.premium-filter-trigger,.premium-select-trigger,.premium-user-filter-trigger,.premium-dropdown-trigger');
            close();
            nativeObserver.disconnect();
            select.removeEventListener('change',sync);
            select.classList.remove('kgpt-select-native');
            delete select.dataset.kgptPremiumSelect;
            delete select.__kgptPremiumWrapper;
            if(hasCustomSelectUi(select)) select.tabIndex = -1;
            else if(previousTabIndex === null) select.removeAttribute('tabindex');
            else select.setAttribute('tabindex',previousTabIndex);
            // A custom enhancer may have inserted its own widget inside this wrapper.
            // Restore every custom child in place while removing only our trigger/menu.
            const parent = wrapper.parentNode;
            if(parent){
                Array.from(wrapper.childNodes).forEach(node => {
                    if(node !== trigger) parent.insertBefore(node,wrapper);
                });
            }
            menu.remove();
            wrapper.remove();
            if(wasFocused) customTrigger?.focus({preventScroll:true});
        };
        nativeObserver.observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','label','class','data-premium','data-premium-ready','data-premium-filter-ready']});
        sync();
        return wrapper;
    }

    function enhanceAll(doc=document){
        if(!doc?.querySelectorAll) return;
        ensureStyle(doc);
        doc.querySelectorAll(SELECTOR).forEach(enhanceSelect);
        if(doc.documentElement.dataset.kgptPremiumDropdownObserver === '1') return;
        doc.documentElement.dataset.kgptPremiumDropdownObserver = '1';
        doc.addEventListener('click',event => {
            const insideMenu = event.target.closest?.('.kgpt-select-menu');
            const insideTrigger = event.target.closest?.('.kgpt-premium-select');
            if(!insideMenu && !insideTrigger) closeAll(doc);
        });
        doc.addEventListener('keydown',event => { if(event.key === 'Escape') closeAll(doc); });
        const view = doc.defaultView || window;
        view.addEventListener('resize',() => closeAll(doc));
        view.addEventListener('scroll',() => closeAll(doc),true);
        new view.MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.removedNodes.forEach(node => {
                    if(node.nodeType !== 1) return;
                    if(node.matches?.('.kgpt-premium-select')) node.__kgptMenu?.remove?.();
                    node.querySelectorAll?.('.kgpt-premium-select').forEach(wrapper => wrapper.__kgptMenu?.remove?.());
                });
                mutation.addedNodes.forEach(node => {
                    if(node.nodeType !== 1) return;
                    if(node.matches?.(SELECTOR)) enhanceSelect(node);
                    node.querySelectorAll?.(SELECTOR).forEach(enhanceSelect);
                    if(node.matches?.('iframe')){ node.addEventListener('load',() => installFrame(node)); installFrame(node); }
                    node.querySelectorAll?.('iframe').forEach(frame => { frame.addEventListener('load',() => installFrame(frame)); installFrame(frame); });
                });
                const ownerSelect = mutation.target?.closest?.('select');
                ownerSelect?.__kgptPremiumWrapper?.__kgptSync?.();
            });
        }).observe(doc.body,{childList:true,subtree:true});
    }

    function installFrame(frame){
        try{ const doc = frame?.contentDocument; if(doc?.body) enhanceAll(doc); }catch(error){ console.warn('Không thể đồng bộ dropdown trong iframe:',error); }
    }
    window.KGPTPremiumDropdown = { enhance:enhanceSelect, enhanceAll, sync(select){ select?.__kgptPremiumWrapper?.__kgptSync?.(); }, closeAll:() => closeAll(document) };
    enhanceAll(document);
    document.querySelectorAll('iframe').forEach(frame => {
        frame.addEventListener('load',() => installFrame(frame));
        installFrame(frame);
    });
    [250,800,1800].forEach(delay => setTimeout(() => {
        enhanceAll(document);
        document.querySelectorAll('.kgpt-premium-select').forEach(wrapper => wrapper.__kgptSync?.());
        document.querySelectorAll('iframe').forEach(installFrame);
    },delay));
})();
