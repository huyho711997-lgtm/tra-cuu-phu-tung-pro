
(function () {
    const originalEmbeddedLoader = window.__loadEmbeddedPage;

    function installPremiumDeleteDialog(targetWindow) {
        const win = targetWindow;
        const doc = win && win.document;
        if (!doc || doc.getElementById('kgpt-system-delete-style')) return;

        const style = doc.createElement('style');
        style.id = 'kgpt-system-delete-style';
        style.textContent = `
            .kgpt-delete-overlay{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:20px;background:rgba(5,12,26,.62);backdrop-filter:blur(9px) saturate(.85);opacity:0;visibility:hidden;transition:opacity .2s ease,visibility .2s ease;font-family:'Plus Jakarta Sans',Arial,sans-serif}
            .kgpt-delete-overlay.is-open{opacity:1;visibility:visible}
            .kgpt-delete-dialog{position:relative;width:min(420px,calc(100vw - 32px));overflow:hidden;border:1px solid rgba(255,255,255,.92);border-radius:19px;background:#fff;box-shadow:0 30px 80px -24px rgba(2,6,23,.52);transform:translateY(14px) scale(.97);transition:transform .24s cubic-bezier(.2,.9,.25,1);isolation:isolate}
            .kgpt-delete-overlay.is-open .kgpt-delete-dialog{transform:translateY(0) scale(1)}
            .kgpt-delete-dialog:before,.kgpt-delete-dialog:after{display:none}
            .kgpt-delete-main{padding:24px 32px 13px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:0}
            .kgpt-delete-icon{width:64px;height:64px;border:0;border-radius:50%;background:#ffe6e7;color:#ff4d57;display:grid;place-items:center;box-shadow:0 10px 24px -15px rgba(239,68,68,.48)}
            .kgpt-delete-icon svg{width:32px;height:32px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
            .kgpt-delete-eyebrow{display:none}
            .kgpt-delete-title{margin:17px 0 0;color:#20242c;font-size:18px;line-height:1.35;font-weight:800;letter-spacing:-.025em}
            .kgpt-delete-message{max-width:340px;margin:8px auto 0;color:#777d88;font-size:13px;line-height:1.62;font-weight:500;white-space:pre-line}
            .kgpt-delete-warning{display:none}
            .kgpt-delete-warning svg{width:16px;height:16px;flex:0 0 16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
            .kgpt-delete-actions{padding:12px 24px 24px;border:0;background:#fff;display:flex;justify-content:center;gap:9px}
            .kgpt-delete-btn{height:40px;min-width:96px;padding:0 18px;border-radius:11px;font-family:inherit;font-size:12px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,background .18s ease}
            .kgpt-delete-btn svg{display:none}
            .kgpt-delete-cancel{border:1px solid #f0f1f3;background:#f7f7f8;color:#2f333b;box-shadow:none}
            .kgpt-delete-cancel:hover{border-color:#e2e4e8;background:#f0f1f3;transform:translateY(-1px)}
            .kgpt-delete-confirm{min-width:110px;border:1px solid #e52d46;background:linear-gradient(145deg,#ef3d54,#e52d46);color:#fff;box-shadow:0 12px 22px -13px rgba(229,45,70,.82)}
            .kgpt-delete-confirm:hover{filter:saturate(1.06);transform:translateY(-1px);box-shadow:0 16px 26px -13px rgba(229,45,70,.92)}
            .kgpt-delete-overlay.is-primary .kgpt-delete-icon{background:#eaf2ff;color:#2563eb;box-shadow:0 10px 24px -15px rgba(37,99,235,.55)}
            .kgpt-delete-overlay.is-primary .kgpt-delete-confirm{border-color:#1d4ed8;background:linear-gradient(145deg,#3b82f6,#1d4ed8);box-shadow:0 12px 22px -13px rgba(29,78,216,.82)}
            .kgpt-delete-overlay.is-primary .kgpt-delete-confirm:hover{box-shadow:0 16px 26px -13px rgba(29,78,216,.92)}
            .kgpt-delete-overlay.is-alert .kgpt-delete-cancel{display:none}
            .kgpt-delete-overlay.is-alert .kgpt-delete-actions{justify-content:center}
            .kgpt-delete-overlay.is-alert .kgpt-delete-confirm{min-width:132px}
            .kgpt-delete-btn:active{transform:translateY(0) scale(.97)}
            .kgpt-delete-btn:focus-visible{outline:3px solid rgba(59,130,246,.18);outline-offset:2px}
            html.dark .kgpt-delete-dialog{border-color:#334155;background:#172033}
            html.dark .kgpt-delete-title{color:#f8fafc}html.dark .kgpt-delete-message{color:#aebbd0}
            html.dark .kgpt-delete-actions{background:#172033}
            html.dark .kgpt-delete-cancel{border-color:#3a485d;background:#172033;color:#cbd5e1}
            @media(max-width:520px){.kgpt-delete-main{padding:22px 22px 12px}.kgpt-delete-icon{width:58px;height:58px}.kgpt-delete-title{font-size:17px}.kgpt-delete-actions{padding:11px 18px 20px}.kgpt-delete-btn{flex:1}}
            @media(prefers-reduced-motion:reduce){.kgpt-delete-overlay,.kgpt-delete-dialog,.kgpt-delete-btn{transition:none!important}}
        `;
        (doc.head || doc.documentElement).appendChild(style);

        const overlay = doc.createElement('div');
        overlay.className = 'kgpt-delete-overlay';
        overlay.setAttribute('role', 'presentation');
        overlay.innerHTML = '<section class="kgpt-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="kgptDeleteTitle" aria-describedby="kgptDeleteMessage"><div class="kgpt-delete-main"><div class="kgpt-delete-icon"><svg viewBox="0 0 24 24"><path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"></path><path d="M12 9v4M12 17h.01"></path></svg></div><div><div class="kgpt-delete-eyebrow">XÁC NHẬN THAO TÁC</div><h2 class="kgpt-delete-title" id="kgptDeleteTitle">Xác nhận xóa</h2><p class="kgpt-delete-message" id="kgptDeleteMessage"></p></div><div class="kgpt-delete-warning"><span>Hành động này không thể hoàn tác.</span></div></div><div class="kgpt-delete-actions"><button class="kgpt-delete-btn kgpt-delete-cancel" type="button"><span>Hủy bỏ</span></button><button class="kgpt-delete-btn kgpt-delete-confirm" type="button"><span>Xóa ngay</span></button></div></section>';
        (doc.body || doc.documentElement).appendChild(overlay);

        const titleNode = overlay.querySelector('.kgpt-delete-title');
        const messageNode = overlay.querySelector('.kgpt-delete-message');
        const iconNode = overlay.querySelector('.kgpt-delete-icon');
        const cancelButton = overlay.querySelector('.kgpt-delete-cancel');
        const confirmButton = overlay.querySelector('.kgpt-delete-confirm');
        let activeResolver = null;
        let previousFocus = null;
        let previousBodyOverflow = '';

        function finish(result) {
            if (!activeResolver) return;
            const resolve = activeResolver;
            activeResolver = null;
            overlay.classList.remove('is-open');
            doc.body.style.overflow = previousBodyOverflow;
            win.setTimeout(function () {
                overlay.style.visibility = '';
                if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
                resolve(result);
            }, 180);
        }

        function showDeleteConfirm(options) {
            const config = typeof options === 'string' ? { message: options } : (options || {});
            if (activeResolver) finish(false);
            const isPrimary = config.variant === 'primary' || config.mode === 'alert';
            const isAlert = config.mode === 'alert';
            previousFocus = doc.activeElement;
            previousBodyOverflow = doc.body.style.overflow;
            overlay.classList.toggle('is-primary', isPrimary);
            overlay.classList.toggle('is-alert', isAlert);
            iconNode.innerHTML = isAlert
                ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 10v6M12 7h.01"></path></svg>'
                : isPrimary
                    ? '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 1-9 9 9 9 0 0 1 9-9Z"></path><path d="m8.5 12 2.2 2.2 4.8-5"></path></svg>'
                    : '<svg viewBox="0 0 24 24"><path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"></path><path d="M12 9v4M12 17h.01"></path></svg>';
            titleNode.textContent = config.title || (isAlert ? 'Thông báo' : isPrimary ? 'Xác nhận thao tác' : 'Xác nhận xóa dữ liệu?');
            messageNode.textContent = config.message || 'Bạn có chắc chắn muốn xóa mục đã chọn khỏi hệ thống?';
            confirmButton.querySelector('span').textContent = config.confirmText || (isAlert ? 'Đã hiểu' : isPrimary ? 'Xác nhận' : 'Xóa ngay');
            cancelButton.querySelector('span').textContent = config.cancelText || 'Hủy bỏ';
            doc.body.style.overflow = 'hidden';
            overlay.classList.add('is-open');
            return new Promise(function (resolve) {
                activeResolver = resolve;
                win.setTimeout(function () { cancelButton.focus(); }, 30);
            });
        }

        function requestDeleteConfirm(options) {
            try {
                if (win.parent && win.parent !== win && typeof win.parent.premiumDeleteConfirm === 'function') {
                    return win.parent.premiumDeleteConfirm(options);
                }
            } catch (error) {}
            return showDeleteConfirm(options);
        }

        cancelButton.addEventListener('click', function () { finish(false); });
        confirmButton.addEventListener('click', function () { finish(true); });
        overlay.addEventListener('click', function (event) { if (event.target === overlay) finish(false); });
        doc.addEventListener('keydown', function (event) {
            if (!activeResolver) return;
            if (event.key === 'Escape') { event.preventDefault(); finish(false); }
            if (event.key === 'Tab') {
                const next = doc.activeElement === cancelButton ? confirmButton : cancelButton;
                event.preventDefault();
                next.focus();
            }
        });

        function destructiveText(value) {
            return /(?:xóa|xoá|delete|remove|gỡ\s+(?:hồ sơ|tài khoản|dữ liệu))/i.test(String(value || ''));
        }

        function getDeleteTarget(node) {
            const button = node && node.closest ? node.closest('button,a,[role="button"]') : null;
            if (!button || button.disabled || button.closest('.kgpt-delete-overlay') || button.dataset.premiumDeleteBypass === '1') return null;
            const code = button.getAttribute('onclick') || '';
            if (/\b(clear|reset)/i.test(code) && !/\b(delete|remove)/i.test(code)) return null;
            const signature = [code, button.title, button.getAttribute('aria-label'), button.textContent].join(' ');
            return destructiveText(signature) ? button : null;
        }

        function describeDelete(button) {
            const code = button.getAttribute('onclick') || '';
            const row = button.closest('tr,.question-card,.admin-user-card,.card');
            const taskNode = row && row.querySelector('.task-name');
            const userNode = row && row.querySelector('.user-name,.admin-user-name,[data-user-name]');
            const labelNode = taskNode || userNode || (row && row.querySelector('.quote-part-name,.feedback-title,[data-delete-label]'));
            const label = labelNode ? labelNode.textContent.trim() : '';
            const allData = /deleteAll|xóa\s+toàn\s+bộ|xoá\s+toàn\s+bộ/i.test(code + ' ' + button.textContent);
            const question = /question-card|refreshQuestionNumbers/i.test((row ? row.className : '') + ' ' + code);
            const quoteRow = /deleteQuoteOcrRow/i.test(code);
            if (allData) return { title: 'Xác nhận xóa toàn bộ dữ liệu', message: 'Bạn có chắc chắn muốn xóa toàn bộ dữ liệu trong khu vực này không? Dữ liệu sau khi xóa sẽ không thể phục hồi!', confirmText: 'Xóa ngay' };
            if (question) return { title: 'Xác nhận xóa câu hỏi', message: 'Bạn có chắc chắn muốn xóa câu hỏi này khỏi bài tập không? Dữ liệu sau khi xóa sẽ không thể phục hồi!', confirmText: 'Xóa ngay' };
            if (quoteRow) return { title: 'Xác nhận xóa dòng dữ liệu', message: 'Bạn có chắc chắn muốn xóa dòng phụ tùng này khỏi danh sách không? Dữ liệu sau khi xóa sẽ không thể phục hồi!', confirmText: 'Xóa ngay' };
            if (label) return { title: taskNode ? 'Xác nhận xóa bài tập' : userNode ? 'Xác nhận xóa người dùng' : 'Xác nhận xóa dữ liệu', message: 'Bạn có chắc chắn muốn xóa “' + label + '” khỏi hệ thống không? Dữ liệu sau khi xóa sẽ không thể phục hồi!', confirmText: 'Xóa ngay' };
            return { title: 'Xác nhận xóa dữ liệu', message: 'Bạn có chắc chắn muốn xóa mục đã chọn khỏi hệ thống không? Dữ liệu sau khi xóa sẽ không thể phục hồi!', confirmText: 'Xóa ngay' };
        }

        doc.addEventListener('click', function (event) {
            const button = getDeleteTarget(event.target);
            if (!button) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const details = describeDelete(button);
            requestDeleteConfirm(details).then(function (approved) {
                if (!approved || !button.isConnected) return;
                button.dataset.premiumDeleteBypass = '1';
                const oldNativeConfirm = win.confirm;
                const oldCustomConfirm = win.customConfirm;
                const nativeBypass = function () { return true; };
                const customBypass = function (message, callback) { return typeof callback === 'function' ? callback() : true; };
                win.confirm = nativeBypass;
                if (typeof oldCustomConfirm === 'function') win.customConfirm = customBypass;
                try { button.click(); }
                finally {
                    win.setTimeout(function () {
                        if (win.confirm === nativeBypass) win.confirm = oldNativeConfirm;
                        if (win.customConfirm === customBypass) win.customConfirm = oldCustomConfirm;
                        delete button.dataset.premiumDeleteBypass;
                    }, 0);
                }
            });
        }, true);

        const oldCustomConfirm = win.customConfirm;
        if (typeof oldCustomConfirm === 'function') {
            win.customConfirm = function (message, callback) {
                if (!destructiveText(message)) return oldCustomConfirm.apply(this, arguments);
                return requestDeleteConfirm({ title: 'Xác nhận xóa dữ liệu', message: String(message), confirmText: 'Xóa ngay' }).then(function (approved) {
                    if (approved && typeof callback === 'function') return callback();
                    return approved;
                });
            };
        }
        win.premiumDeleteConfirm = showDeleteConfirm;
        win.premiumConfirm = function(options) {
            const config = typeof options === 'string' ? { message: options } : (options || {});
            return showDeleteConfirm({ ...config, variant: 'primary' });
        };
        win.premiumAlert = function(message, options = {}) {
            const config = typeof message === 'object' ? message : { ...options, message: String(message || '') };
            return showDeleteConfirm({ ...config, variant: 'primary', mode: 'alert' });
        };
        win.alert = function(message) {
            win.premiumAlert(String(message || ''), { title: 'Thông báo' });
        };
    }

    function enhanceStudentWorkspace(frame) {
        const doc = frame && frame.contentDocument;
        if (!doc || doc.getElementById('kgpt-premium-student-ui')) return;
        const style = doc.createElement('style');
        style.id = 'kgpt-premium-student-ui';
        style.textContent = `
            #dashboard{padding:20px 24px 34px;background:radial-gradient(circle at 95% 5%,rgba(59,130,246,.055),transparent 23%),#f3f6fb}
            #dashboard .hero{position:relative;display:grid;grid-template-columns:minmax(330px,.95fr) minmax(470px,1.45fr) 255px;align-items:center;gap:18px;overflow:hidden;min-height:148px;padding:22px 24px;border:1px solid #d7e4f8;border-radius:20px;background:radial-gradient(circle at 91% 3%,rgba(96,165,250,.17),transparent 28%),radial-gradient(circle at 72% 105%,rgba(16,185,129,.06),transparent 24%),linear-gradient(115deg,#fff 0%,#fbfdff 48%,#eaf1ff 100%);box-shadow:0 24px 55px -39px rgba(37,99,235,.5);isolation:isolate}
            #dashboard .hero:before{content:"";position:absolute;left:-55px;bottom:-95px;width:210px;height:210px;border-radius:50%;background:radial-gradient(circle,rgba(37,99,235,.08),transparent 68%);z-index:-1}
            #dashboard .hero>div:first-child{position:relative;z-index:1;max-width:760px}
            #dashboard .hero .eyebrow{display:flex;align-items:center;gap:8px;color:#3f69c8;font-size:9px;font-weight:900;letter-spacing:.15em}
            #dashboard .hero .eyebrow:before{content:"";width:7px;height:7px;border-radius:50%;background:#4f83ee;box-shadow:0 0 0 4px rgba(79,131,238,.12)}
            #dashboard .hero h1{margin:9px 0 6px;font-size:25px;line-height:1.15;letter-spacing:-.045em;color:#0f172a}
            #dashboard .hero p{font-size:11.5px;line-height:1.7;color:#718096}
            #dashboard .student-stat-grid{position:relative;z-index:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
            #dashboard .student-stat{position:relative;display:flex;align-items:center;gap:11px;min-width:0;min-height:88px;padding:14px 13px;overflow:hidden;border:1px solid rgba(255,255,255,.95);border-radius:16px;background:rgba(255,255,255,.88);box-shadow:0 18px 38px -29px rgba(30,58,138,.7),inset 0 1px 0 #fff;backdrop-filter:blur(12px);transition:transform .2s ease,box-shadow .2s ease}
            #dashboard .student-stat:after{content:"";position:absolute;right:-23px;top:-27px;width:68px;height:68px;border-radius:50%;background:var(--stat-glow)}
            #dashboard .student-stat:hover{transform:translateY(-3px);box-shadow:0 22px 40px -27px rgba(30,58,138,.8),inset 0 1px 0 #fff}
            #dashboard .student-stat-icon{position:relative;z-index:1;display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border-radius:12px;color:var(--stat-color);background:var(--stat-soft);box-shadow:inset 0 1px 0 rgba(255,255,255,.82)}
            #dashboard .student-stat-icon svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
            #dashboard .student-stat-copy{position:relative;z-index:1;min-width:0}
            #dashboard .student-stat-label{display:block;margin-bottom:4px;overflow:hidden;color:#76849a;font-size:8.5px;font-weight:800;letter-spacing:.035em;line-height:1.3;text-overflow:ellipsis;white-space:nowrap}
            #dashboard .student-stat strong{display:block;color:#172033;font-size:21px;line-height:1;font-weight:850;letter-spacing:-.04em}
            #dashboard .student-stat small{display:block;margin-top:5px;overflow:hidden;color:#96a1b2;font-size:7.5px;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}
            #dashboard .student-stat-total{--stat-color:#2563eb;--stat-soft:#eaf2ff;--stat-glow:rgba(59,130,246,.10)}
            #dashboard .student-stat-completed{--stat-color:#059669;--stat-soft:#e9faf3;--stat-glow:rgba(16,185,129,.11)}
            #dashboard .student-stat-pending{--stat-color:#d97706;--stat-soft:#fff4e5;--stat-glow:rgba(245,158,11,.12)}
            #dashboard .hero-score{position:relative;z-index:1;width:255px;min-width:255px;padding:15px 17px;border:1px solid rgba(255,255,255,.95);border-radius:16px;background:rgba(255,255,255,.88);box-shadow:0 18px 38px -27px rgba(30,58,138,.65),inset 0 1px 0 #fff;backdrop-filter:blur(12px)}
            #dashboard .hero-score-top{font-size:9.5px;color:#64748b}
            #dashboard .hero-score strong{font-size:11px;color:#245bd2}
            #dashboard .hero-score .bar{position:relative;height:8px;margin:11px 0 8px;background:#e5ebf5;box-shadow:inset 0 1px 2px rgba(15,23,42,.08)}
            #dashboard .hero-score .bar i{position:relative;background:linear-gradient(90deg,#2563eb,#4f8cf5 62%,#60a5fa);box-shadow:0 3px 10px -4px #2563eb;transition:none!important;animation:none!important}
            #dashboard .hero-score .bar i:after{display:none!important;content:none!important;animation:none!important}
            #dashboard .hero-score small{font-size:8.5px;line-height:1.5;color:#8b98aa}
            #dashboard .layout{grid-template-columns:minmax(300px,340px) minmax(0,1fr);gap:16px;margin-top:16px;align-items:stretch}
            #dashboard .panel{border:1px solid #dce5f1;border-radius:19px;background:rgba(255,255,255,.97);box-shadow:0 25px 55px -40px rgba(15,23,42,.52),0 10px 25px -23px rgba(37,99,235,.22)}
            #dashboard .panel-head{min-height:70px;padding:17px 18px;border-bottom-color:#e7edf5;background:linear-gradient(180deg,#fff,#fbfcfe)}
            #dashboard .panel-title{font-size:15.5px;line-height:1.3;letter-spacing:-.02em;color:#182237}
            #dashboard .panel-sub{margin-top:5px;font-size:10px;line-height:1.45;color:#8b98aa}
            #dashboard .count{min-width:48px;padding:7px 10px;border:1px solid #dbe7fb;border-radius:999px;background:linear-gradient(145deg,#f4f8ff,#eaf2ff);color:#285cca;font-size:9px;box-shadow:0 7px 15px -13px #2563eb}
            #dashboard .task-list{padding:12px;min-height:420px;background:linear-gradient(180deg,#fff,#fbfcfe)}
            #dashboard .task{position:relative;overflow:hidden;padding:15px;border:1px solid #e3eaf4;border-radius:14px;background:linear-gradient(145deg,#fff,#fbfdff);box-shadow:0 8px 18px -17px rgba(15,23,42,.55);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease}
            #dashboard .task:before{display:none}
            #dashboard .task:hover{border-color:#bcd0f4;background:#f9fbff;transform:translateY(-2px);box-shadow:0 15px 27px -20px rgba(37,99,235,.55)}
            #dashboard .task.active{border-color:#85aaf0;background:radial-gradient(circle at 100% 0,rgba(96,165,250,.12),transparent 28%),linear-gradient(145deg,#f2f7ff,#fbfdff);box-shadow:0 15px 29px -20px rgba(37,99,235,.72),inset 0 1px 0 #fff}
            #dashboard .task h3{font-size:13px;line-height:1.45;margin-bottom:6px;color:#172033}
            #dashboard .task p{font-size:10px;line-height:1.55;color:#718096}
            #dashboard .status{padding:6px 9px;border:1px solid transparent;font-size:8.5px;box-shadow:inset 0 1px 0 rgba(255,255,255,.75)}
            #dashboard .status.done{border-color:#d9ccfb;background:linear-gradient(145deg,#f5f1ff,#eee8ff);color:#6d28d9;box-shadow:0 7px 15px -12px rgba(109,40,217,.65),inset 0 1px 0 #fff}#dashboard .status.open{border-color:#c7ead8}#dashboard .status.new{border-color:#d5e3fb}
            #dashboard .task-foot{margin-top:13px;padding-top:11px;border-top-color:#e8eef6}
            #dashboard .task-foot span,#dashboard .task-foot b{font-size:9.5px}
            #dashboard .task:has(.status.done) .task-foot span:first-child{color:#07814d;font-weight:800}
            #dashboard .detail{min-height:540px}
            #dashboard .detail-top{padding:21px 22px;border-bottom-color:#e5ebf3;background:radial-gradient(circle at 95% 0,rgba(59,130,246,.11),transparent 28%),linear-gradient(145deg,#fff,#f8fbff)}
            #dashboard .detail-topline>div:first-child{position:relative;min-height:58px;padding-left:68px}
            #dashboard .detail-icon{position:absolute;left:0;top:0;width:52px;height:52px;margin:0;border:1px solid #d4e3fb;border-radius:16px;background:linear-gradient(145deg,#eff6ff,#dbeafe);color:#2563eb;box-shadow:0 14px 27px -20px rgba(37,99,235,.68),inset 0 1px 0 #fff}
            #dashboard .detail-icon svg{width:25px}
            #dashboard .detail .eyebrow{padding-top:2px;font-size:9px;letter-spacing:.13em;font-weight:900;color:#4c72cf}
            #dashboard .detail h2{margin:5px 0 6px;font-size:20px;line-height:1.25;letter-spacing:-.035em;color:#111b2e}
            #dashboard .detail-desc{font-size:11px;line-height:1.6;color:#718096}
            #dashboard .deadline{padding:9px 12px;border-color:#fed09a;border-radius:999px;background:linear-gradient(145deg,#fffaf2,#fff4e5);color:#b45309;font-size:9px;box-shadow:0 8px 18px -16px rgba(217,119,6,.62)}
            #dashboard .info-grid{gap:10px;padding:17px 22px 16px}
            #dashboard .info{position:relative;overflow:hidden;min-height:70px;padding:14px 15px;border-color:#dfe7f1;border-radius:13px;background:linear-gradient(145deg,#fff,#f8fafc);box-shadow:0 8px 18px -18px rgba(15,23,42,.55)}
            #dashboard .info:after{content:"";position:absolute;width:58px;height:58px;right:-28px;top:-30px;border-radius:50%;background:rgba(59,130,246,.08)}
            #dashboard .info:nth-child(2):after{background:rgba(16,185,129,.09)}#dashboard .info:nth-child(3):after{background:rgba(245,158,11,.10)}#dashboard .info:nth-child(4):after{background:rgba(139,92,246,.09)}
            #dashboard .info span{margin-bottom:7px;font-size:9px;letter-spacing:.075em;color:#8491a5}
            #dashboard .info b{font-size:12.5px;color:#172033}
            #dashboard .info:nth-child(4) b{color:#6d28d9}
            #dashboard .instructions{position:relative;margin:0 22px;padding:18px 20px 18px 50px;border:1px solid #dbe7f8;border-radius:15px;background:radial-gradient(circle at 100% 0,rgba(59,130,246,.07),transparent 25%),linear-gradient(145deg,#f8fbff,#f4f8ff);box-shadow:inset 0 1px 0 #fff}
            #dashboard .instructions:before{content:"✓";position:absolute;left:17px;top:17px;width:23px;height:23px;border-radius:8px;background:linear-gradient(145deg,#4f8cf5,#2563eb);color:#fff;display:grid;place-items:center;font-size:12px;font-weight:900;box-shadow:0 8px 15px -10px #1d4ed8}
            #dashboard .instructions h3{margin:1px 0 12px;font-size:14px;line-height:1.4;color:#20304a}
            #dashboard .instructions ul{padding-left:18px;font-size:12.5px;line-height:1.8;color:#5f6f85}
            #dashboard .instructions li::marker{color:#3b82f6}
            #dashboard .detail-actions{margin-top:17px;padding:17px 22px;border-top:1px solid #e8eef6;background:linear-gradient(180deg,#fbfcfe,#fff)}
            #dashboard .detail-actions p{font-size:12px;line-height:1.65;color:#718096}
            #dashboard #btnStartQuiz{position:relative;overflow:hidden;min-width:190px;height:46px;border-radius:12px;background:linear-gradient(145deg,#3f7cf0,#255bd8 58%,#1d4ed8);font-size:11px;box-shadow:0 14px 27px -14px rgba(37,99,235,.9),inset 0 1px 0 rgba(255,255,255,.28)}
            #dashboard #btnStartQuiz:before{content:"";position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.25),transparent 45%);pointer-events:none}
            #dashboard #btnStartQuiz:hover{transform:translateY(-2px);box-shadow:0 18px 31px -14px rgba(37,99,235,1)}
            #dashboard .empty-box svg{padding:11px;border:1px solid #dbe7fb;border-radius:16px;background:linear-gradient(145deg,#f4f8ff,#e9f1ff);color:#4f7fe1;box-shadow:0 14px 27px -22px rgba(37,99,235,.65)}
            #dashboard .empty-box h4{font-size:14px;color:#172033}#dashboard .empty-box p{font-size:10.5px;line-height:1.65;color:#7b899d}
            #quiz .quiz-main,#quiz .quiz-nav{border-color:#dce5f1;border-radius:19px;box-shadow:0 24px 55px -40px rgba(15,23,42,.55)}
            #quiz .quiz-head{background:linear-gradient(145deg,#fff,#f7faff)}
            #quiz .question{padding:30px 28px 18px}#quiz .question h2{font-size:19px}
            #quiz .option{min-height:52px;border-color:#dfe7f1;background:linear-gradient(145deg,#fff,#fbfcfe);font-size:11.5px;box-shadow:0 7px 16px -17px rgba(15,23,42,.55)}
            #quiz .option:hover{border-color:#9eb9eb;background:#f5f8ff;transform:translateY(-1px)}
            #quiz .option.selected{border-color:#79a2ee;background:linear-gradient(145deg,#edf4ff,#f7faff);box-shadow:0 0 0 3px rgba(59,130,246,.08)}
            @media(max-width:1350px){#dashboard .hero{grid-template-columns:minmax(0,1fr) 255px}#dashboard .student-stat-grid{grid-column:1/-1;grid-row:2}}
            @media(max-width:1050px){#dashboard .layout{grid-template-columns:1fr}#dashboard .task-list{min-height:auto}#dashboard .detail{min-height:auto}}
            @media(max-width:720px){#dashboard{padding:16px}#dashboard .hero{grid-template-columns:1fr;align-items:flex-start;padding:18px}#dashboard .student-stat-grid{grid-column:1;grid-row:auto;width:100%}#dashboard .hero-score{width:100%;min-width:0}#dashboard .info-grid{grid-template-columns:repeat(2,1fr)}#dashboard .detail-topline{flex-direction:column}#dashboard .deadline{align-self:flex-start}#dashboard .detail-actions{align-items:stretch;flex-direction:column;gap:13px}#dashboard #btnStartQuiz{width:100%;justify-content:center}}
            @media(max-width:560px){#dashboard .student-stat-grid{grid-template-columns:1fr}#dashboard .student-stat{min-height:72px}}
            @media(max-width:460px){#dashboard .info-grid{grid-template-columns:1fr}#dashboard .detail-topline>div:first-child{padding-left:0}#dashboard .detail-icon{position:relative;margin-bottom:13px}}
            @media(prefers-reduced-motion:reduce){#dashboard .hero-score .bar i:after,#dashboard .task,#dashboard #btnStartQuiz,#quiz .option{animation:none!important;transition:none!important}}
        `;
        doc.head.appendChild(style);

        const hero = doc.querySelector('#dashboard .hero');
        const progressCard = hero && hero.querySelector('.hero-score');
        if (hero && progressCard && !doc.getElementById('studentStatGrid')) {
            const stats = doc.createElement('div');
            stats.className = 'student-stat-grid';
            stats.id = 'studentStatGrid';
            stats.setAttribute('aria-label', 'Thống kê bài tập');
            stats.innerHTML = `
                <article class="student-stat student-stat-total">
                    <span class="student-stat-icon"><svg viewBox="0 0 24 24"><path d="M8 3h8a2 2 0 0 1 2 2v16H6V5a2 2 0 0 1 2-2Z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg></span>
                    <div class="student-stat-copy"><span class="student-stat-label">Bài tập được giao</span><strong id="studentStatTotal">0</strong><small>Tổng bài đang triển khai</small></div>
                </article>
                <article class="student-stat student-stat-completed">
                    <span class="student-stat-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg></span>
                    <div class="student-stat-copy"><span class="student-stat-label">Đã hoàn thành</span><strong id="studentStatCompleted">0</strong><small>Bài đã nộp và ghi nhận</small></div>
                </article>
                <article class="student-stat student-stat-pending">
                    <span class="student-stat-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>
                    <div class="student-stat-copy"><span class="student-stat-label">Chưa làm</span><strong id="studentStatPending">0</strong><small>Bài đang chờ hoàn thành</small></div>
                </article>
            `;
            hero.insertBefore(stats, progressCard);

            const updateStudentDashboardStats = function () {
                const tasks = doc.querySelectorAll('#taskListContainer .task');
                const completed = doc.querySelectorAll('#taskListContainer .task .status.done').length;
                const total = tasks.length;
                const pending = Math.max(0, total - completed);
                const totalEl = doc.getElementById('studentStatTotal');
                const completedEl = doc.getElementById('studentStatCompleted');
                const pendingEl = doc.getElementById('studentStatPending');
                if (totalEl) totalEl.textContent = String(total);
                if (completedEl) completedEl.textContent = String(completed);
                if (pendingEl) pendingEl.textContent = String(pending);
            };

            updateStudentDashboardStats();
            const taskList = doc.getElementById('taskListContainer');
            if (taskList && frame.contentWindow.MutationObserver) {
                frame.contentWindow.__kgptStudentStatsObserver = new frame.contentWindow.MutationObserver(updateStudentDashboardStats);
                frame.contentWindow.__kgptStudentStatsObserver.observe(taskList, { childList: true, subtree: true });
            }
        }
    }

    function enhanceUsersWorkspace(frame) {
        const doc = frame && frame.contentDocument;
        if (!doc || doc.getElementById('kgpt-premium-users-ui')) return;

        const style = doc.createElement('style');
        style.id = 'kgpt-premium-users-ui';
        style.textContent = `
            .page{width:100%!important;max-width:none!important;margin:0!important;padding:22px 24px 38px;box-sizing:border-box!important}
            .hero{position:relative;overflow:visible;padding:20px 22px 18px;border:1px solid #d8e4f8;border-radius:18px;background:radial-gradient(circle at 88% 5%,rgba(96,165,250,.13),transparent 27%),linear-gradient(112deg,#fff 0%,#fbfdff 53%,#edf3ff 100%);box-shadow:0 22px 52px -38px rgba(37,99,235,.48);isolation:isolate}
            .hero:before{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(120deg,rgba(255,255,255,.58),transparent 42%);z-index:-1;pointer-events:none}
            .hero-row{align-items:flex-start;gap:22px}
            .hero-row>div:first-child{min-width:300px;flex:1;padding-top:1px}
            .hero .eyebrow{display:flex;align-items:center;gap:8px;color:#426bc7;font-size:9px;letter-spacing:.14em;font-weight:900}
            .hero .eyebrow:before{content:"";width:7px;height:7px;border-radius:50%;background:#4f83ee;box-shadow:0 0 0 4px rgba(79,131,238,.12)}
            .hero h1{margin:8px 0 5px;font-size:25px;line-height:1.15;letter-spacing:-.045em;color:#0f172a}
            .hero p{max-width:690px;font-size:11.5px;line-height:1.65;color:#738198}
            .user-hero-actions{position:relative;z-index:20;display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-left:auto;flex:0 0 auto}
            .user-hero-actions .tools{display:flex;align-items:center;gap:10px;overflow:visible}
            .user-hero-actions>.primary{height:42px;min-width:142px;padding:0 17px;border-radius:11px;background:linear-gradient(145deg,#3f7cf0,#255bd8 58%,#1d4ed8);font-size:11.5px;box-shadow:0 13px 25px -14px rgba(37,99,235,.92),inset 0 1px 0 rgba(255,255,255,.28);white-space:nowrap}
            .user-hero-actions>.primary:hover{transform:translateY(-1px);box-shadow:0 17px 29px -14px rgba(37,99,235,1),inset 0 1px 0 rgba(255,255,255,.3)}
            .user-search-wrap{position:relative;width:250px}
            .user-search-icon{position:absolute;z-index:2;left:13px;top:50%;width:17px;height:17px;transform:translateY(-50%);fill:none;stroke:#7184a3;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
            .user-search-wrap .search{width:100%;height:42px;padding:0 14px 0 40px;border:1px solid #d7e2f1;border-radius:11px;background:rgba(255,255,255,.94);color:#26354d;font-size:11.5px;font-weight:600;box-shadow:0 10px 24px -18px rgba(15,23,42,.62),inset 0 1px 0 #fff;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}
            .user-search-wrap .search::placeholder{color:#99a6b9;font-weight:550}
            .user-search-wrap .search:hover{border-color:#b7cae5;background:#fff}
            .user-search-wrap .search:focus{border-color:#79a4f1;box-shadow:0 0 0 4px rgba(59,130,246,.10),0 13px 27px -20px rgba(37,99,235,.7);transform:translateY(-1px)}
            .premium-user-filter-native{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important}
            .premium-user-filter{position:relative;width:168px;flex:0 0 168px}
            .premium-user-filter-trigger{position:relative;width:100%;height:42px;padding:0 38px 0 12px;border:1px solid #d7e2f1;border-radius:11px;background:linear-gradient(180deg,#fff,#fbfdff);color:#3d4d65;display:flex;align-items:center;gap:9px;cursor:pointer;text-align:left;box-shadow:0 10px 24px -18px rgba(15,23,42,.62),inset 0 1px 0 #fff;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}
            .premium-user-filter-trigger:hover{border-color:#a9c1e5;background:#fff;transform:translateY(-1px);box-shadow:0 13px 26px -19px rgba(37,99,235,.62)}
            .premium-user-filter.open .premium-user-filter-trigger,.premium-user-filter-trigger:focus-visible{outline:none;border-color:#79a4f1;box-shadow:0 0 0 4px rgba(59,130,246,.10),0 14px 28px -20px rgba(37,99,235,.72)}
            .premium-user-filter-icon{width:22px;height:22px;flex:0 0 22px;display:grid;place-items:center;color:#5270a4}
            .premium-user-filter-icon svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
            .premium-user-filter-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:750}
            .premium-user-filter-chevron{position:absolute;right:12px;top:50%;width:15px;height:15px;transform:translateY(-50%);fill:none;stroke:#7890b3;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .18s ease}
            .premium-user-filter.open .premium-user-filter-chevron{transform:translateY(-50%) rotate(180deg);stroke:#2563eb}
            .premium-user-filter-menu{position:absolute;z-index:140;top:calc(100% + 7px);right:0;width:100%;padding:6px;border:1px solid #d7e2f0;border-radius:13px;background:rgba(255,255,255,.985);box-shadow:0 22px 48px -24px rgba(15,23,42,.5),0 9px 22px -17px rgba(37,99,235,.25);backdrop-filter:blur(16px);opacity:0;visibility:hidden;transform:translateY(-6px) scale(.985);transform-origin:top right;transition:opacity .17s ease,visibility .17s ease,transform .17s ease}
            .premium-user-filter.open .premium-user-filter-menu{opacity:1;visibility:visible;transform:translateY(0) scale(1)}
            .premium-user-filter-option{width:100%;min-height:39px;padding:7px 9px;border:0;border-radius:9px;background:transparent;color:#44536a;display:flex;align-items:center;gap:9px;text-align:left;cursor:pointer;font-size:11px;font-weight:650;transition:background .16s ease,color .16s ease,transform .16s ease}
            .premium-user-filter-option:hover,.premium-user-filter-option:focus-visible{outline:none;background:linear-gradient(90deg,#f0f6ff,#f8fbff);color:#1d4ed8;transform:translateX(1px)}
            .premium-user-filter-dot{width:22px;height:22px;flex:0 0 22px;border:1px solid #dfe7f1;border-radius:7px;background:#f8fafc;display:grid;place-items:center;color:transparent}
            .premium-user-filter-dot:after{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
            .premium-user-filter-option[aria-selected="true"]{background:linear-gradient(90deg,#eaf2ff,#f5f9ff);color:#1d4ed8;font-weight:800}
            .premium-user-filter-option[aria-selected="true"] .premium-user-filter-dot{border-color:#8bb2f6;background:#eff6ff;color:#2563eb;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
            .stats{margin-top:15px;gap:10px}
            .stat{position:relative;overflow:hidden;min-height:68px;padding:11px 13px;border-radius:12px;background:rgba(255,255,255,.93);box-shadow:0 9px 22px -20px rgba(15,23,42,.6);isolation:isolate;transition:transform .18s ease,box-shadow .18s ease}
            .stat:after{content:"";position:absolute;z-index:-1;width:70px;height:70px;right:-28px;top:-37px;border-radius:50%}
            .stat:hover{transform:translateY(-2px);box-shadow:0 14px 26px -20px rgba(37,99,235,.5)}
            .stat:nth-child(1){border-color:#cbd9fa}.stat:nth-child(1):after{background:rgba(59,130,246,.12)}
            .stat:nth-child(2){border-color:#c6ead8}.stat:nth-child(2):after{background:rgba(34,197,94,.12)}
            .stat:nth-child(3){border-color:#dfd4fb}.stat:nth-child(3):after{background:rgba(139,92,246,.12)}
            .stat:nth-child(4){border-color:#fed7aa}.stat:nth-child(4):after{background:rgba(249,115,22,.12)}
            .hero .stat:nth-child(1) .stat-icon{background:#edf4ff!important;color:#2563eb!important}.hero .stat:nth-child(2) .stat-icon{background:#eafaf2!important;color:#087a46!important}.hero .stat:nth-child(3) .stat-icon{background:#f2ebff!important;color:#7c3aed!important}.hero .stat:nth-child(4) .stat-icon{background:#fff5e6!important;color:#b54708!important}
            .stat-icon{width:36px;height:36px;border-radius:11px}
            .stat-icon svg{width:18px;height:18px}
            .stat b{font-size:19px;line-height:1.05;color:#172033}
            .stat span{display:block;margin-top:4px;font-size:9.5px;line-height:1.25;color:#718096}
            .panel{margin-top:16px;border-color:#dce5f1;box-shadow:0 25px 55px -40px rgba(15,23,42,.52),0 10px 25px -23px rgba(37,99,235,.22)}
            .panel-head{min-height:72px;padding:18px 20px;background:linear-gradient(180deg,#fff,#fbfcfe)}
            .title{font-size:16px;line-height:1.3;letter-spacing:-.015em}.sub{font-size:11px;line-height:1.55;margin-top:4px}
            .table th{height:48px;padding:0 17px;font-size:10.5px;line-height:1.3}.table td{padding:16px 17px;font-size:12.5px;line-height:1.5}
            .table tbody tr{transition:background .16s ease}.table tbody tr:hover{background:#f8fbff}
            .avatar{box-shadow:inset 0 1px 0 #fff,0 8px 18px -15px #2563eb}
            .user-pagination{position:relative;z-index:15;display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-left:auto}
            .user-page-nav,.user-page-number{width:34px;height:34px;padding:0;border:1px solid #dbe5f1;border-radius:9px;background:linear-gradient(180deg,#fff,#f9fbfe);color:#6f809a;display:inline-grid;place-items:center;cursor:pointer;font-size:11px;font-weight:800;box-shadow:0 5px 13px -12px rgba(15,23,42,.65);transition:transform .16s ease,border-color .16s ease,background .16s ease,color .16s ease,box-shadow .16s ease}
            .user-page-nav svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
            .user-page-nav:hover:not(:disabled),.user-page-number:hover:not(.active){border-color:#a9c2ea;background:#f4f8ff;color:#2563eb;transform:translateY(-1px)}
            .user-page-nav:disabled{opacity:.42;cursor:not-allowed;box-shadow:none}
            .user-page-number.active{border-color:#3269db;background:linear-gradient(145deg,#4f83ec,#315fcf);color:#fff;box-shadow:0 10px 18px -12px rgba(37,99,235,.9)}
            .user-page-numbers{display:flex;align-items:center;gap:6px}
            .user-page-ellipsis{width:20px;text-align:center;color:#9aa7ba;font-size:11px;font-weight:800}
            .user-page-size-control{position:relative;height:34px;margin-left:4px;padding:0 8px 0 10px;border:1px solid #dbe5f1;border-radius:9px;background:#fff;display:flex;align-items:center;gap:7px;color:#718096;font-size:10px;font-weight:650;box-shadow:0 5px 13px -12px rgba(15,23,42,.6)}
            .user-page-size-dropdown{position:relative}
            .user-page-size-trigger{position:relative;height:26px;min-width:54px;padding:0 24px 0 9px;border:1px solid #d7e2f1;border-radius:7px;background:linear-gradient(180deg,#fff,#f8fbff);color:#263b5e;display:flex;align-items:center;cursor:pointer;font-size:10.5px;font-weight:800;transition:border-color .16s ease,box-shadow .16s ease}
            .user-page-size-trigger:hover,.user-page-size-dropdown.open .user-page-size-trigger{border-color:#88acf0;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
            .user-page-size-trigger svg{position:absolute;right:7px;top:50%;width:13px;height:13px;transform:translateY(-50%);fill:none;stroke:#7185a5;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .17s ease}
            .user-page-size-dropdown.open .user-page-size-trigger svg{transform:translateY(-50%) rotate(180deg);stroke:#2563eb}
            .user-page-size-menu{position:absolute;z-index:170;right:0;top:calc(100% + 7px);width:86px;padding:5px;border:1px solid #d8e3f0;border-radius:11px;background:rgba(255,255,255,.99);box-shadow:0 20px 42px -23px rgba(15,23,42,.52);opacity:0;visibility:hidden;transform:translateY(-5px) scale(.98);transform-origin:top right;transition:opacity .16s ease,visibility .16s ease,transform .16s ease}
            .user-page-size-dropdown.open .user-page-size-menu{opacity:1;visibility:visible;transform:translateY(0) scale(1)}
            .user-page-size-option{width:100%;height:32px;padding:0 9px;border:0;border-radius:7px;background:transparent;color:#526176;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-size:10.5px;font-weight:750;transition:background .15s ease,color .15s ease}
            .user-page-size-option:hover,.user-page-size-option:focus-visible{outline:none;background:#f0f6ff;color:#1d4ed8}
            .user-page-size-option[aria-selected="true"]{background:#eaf2ff;color:#1d4ed8;font-weight:850}
            .user-page-size-option[aria-selected="true"]:after{content:"✓";font-size:10px}
            .hero .stats{grid-template-columns:repeat(5,minmax(0,1fr))}
            .stat.kgpt-pending-stat{border-color:#fde1a8}.stat.kgpt-pending-stat:after{background:rgba(245,158,11,.14)}
            .stat.kgpt-pending-stat .stat-icon{background:#fff7e8!important;color:#b45309!important}
            .badge.pending{background:#fff7e6;color:#a85308;border:1px solid #fed7aa}
            .kgpt-approve-user{color:#087a46!important;border-color:#b9e8d0!important;background:#effcf5!important}
            .kgpt-approve-user:hover{color:#fff!important;border-color:#0f9f61!important;background:#0f9f61!important;box-shadow:0 9px 18px -12px rgba(15,159,97,.75)!important;transform:translateY(-1px)}
            .kgpt-approve-user:disabled{opacity:.55;cursor:wait;transform:none!important}
            .kgpt-approve-user.is-loading svg{animation:kgptApprovePulse .8s ease-in-out infinite alternate}
            @keyframes kgptApprovePulse{from{opacity:.35;transform:scale(.82)}to{opacity:1;transform:scale(1.08)}}
            .pending-approval-filter{height:42px;padding:0 14px;border:1px solid #f4cc82;border-radius:11px;background:linear-gradient(180deg,#fffaf0,#fff7e8);color:#a85308;display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 10px 23px -19px rgba(180,83,9,.65);transition:.18s ease}
            .pending-approval-filter svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
            .pending-approval-filter b{min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#f59e0b;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:10px}
            .pending-approval-filter:hover,.pending-approval-filter.active{border-color:#f59e0b;background:#f59e0b;color:#fff;transform:translateY(-1px);box-shadow:0 12px 24px -16px rgba(180,83,9,.8)}
            .pending-approval-filter.active b{background:#fff;color:#b45309}
            html.kgpt-user-modal-open,html.kgpt-user-modal-open body{height:100%!important;overflow:hidden!important;overscroll-behavior:none}
            #userModal.modal-bg{padding:clamp(14px,3vh,28px)!important;overflow:hidden!important;align-items:center!important}
            #userModal .modal{width:min(960px,calc(100vw - 32px))!important;max-height:min(880px,calc(100vh - 32px))!important;border-radius:24px!important;overflow:hidden!important;box-shadow:0 38px 95px -30px rgba(3,12,29,.72),0 0 0 1px rgba(255,255,255,.4)!important}
            #userModal .modal-head{flex:0 0 auto;padding:20px 24px!important;background:linear-gradient(135deg,#fff,#f8fbff)!important}
            #userModal .form{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;margin:0 7px 0 0!important;padding:20px 17px 22px 24px!important;scrollbar-gutter:stable;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#9db3d1 transparent}
            #userModal .form::-webkit-scrollbar{width:8px}
            #userModal .form::-webkit-scrollbar-track{background:transparent;margin:10px 0}
            #userModal .form::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#b7c7dc,#8da5c5);border:2px solid transparent;background-clip:padding-box;border-radius:999px;min-height:46px}
            #userModal .form::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#7fa6df,#5f88c8);border:1px solid transparent;background-clip:padding-box}
            #userModal .modal-foot{position:relative;z-index:3;flex:0 0 auto;padding:14px 24px!important;background:rgba(255,255,255,.97)!important;box-shadow:0 -14px 32px -28px rgba(15,23,42,.5)!important}
            #userModal .perm-table{overflow:hidden;border-radius:15px}
            @media(max-width:1180px){.hero-row{flex-direction:column}.user-hero-actions{width:100%;margin-left:0;justify-content:flex-start}.user-hero-actions .tools{flex:1}.user-search-wrap{flex:1;width:auto}}
            @media(max-width:760px){.page{padding:16px}.hero{padding:17px}.user-hero-actions{align-items:stretch;flex-direction:column}.user-hero-actions .tools{width:100%;flex-wrap:wrap}.user-search-wrap{width:100%;flex-basis:100%}.premium-user-filter{width:100%;flex-basis:100%}.pending-approval-filter{width:100%;justify-content:center}.user-hero-actions>.primary{width:100%}.hero .stats{grid-template-columns:repeat(2,1fr)}.panel-head{align-items:flex-start;flex-direction:column}.user-pagination{width:100%;margin-left:0;justify-content:flex-start;flex-wrap:wrap}#userModal.modal-bg{padding:8px!important;align-items:stretch!important}#userModal .modal{width:100%!important;max-height:100%!important;border-radius:19px!important}#userModal .modal-head{padding:17px 18px!important}#userModal .form{margin-right:4px!important;padding:17px 10px 20px 18px!important}#userModal .modal-foot{padding:12px 18px!important}}
            @media(max-width:520px){.stats{grid-template-columns:1fr}}
            @media(prefers-reduced-motion:reduce){.stat,.user-search-wrap .search,.premium-user-filter-trigger,.premium-user-filter-menu,.premium-user-filter-option,.user-page-nav,.user-page-number,.user-page-size-trigger,.user-page-size-menu,.user-page-size-option{transition:none!important}}
        `;
        doc.head.appendChild(style);

        const heroRow = doc.querySelector('.hero .hero-row');
        const panelTools = doc.querySelector('.panel .panel-head .tools');
        const createButton = heroRow && heroRow.querySelector('.primary');
        if (heroRow && panelTools && createButton && !heroRow.querySelector('.user-hero-actions')) {
            const actionBar = doc.createElement('div');
            actionBar.className = 'user-hero-actions';
            actionBar.appendChild(panelTools);
            actionBar.appendChild(createButton);
            heroRow.appendChild(actionBar);
        }

        const search = doc.getElementById('search');
        if (search && !search.closest('.user-search-wrap')) {
            const searchWrap = doc.createElement('div');
            searchWrap.className = 'user-search-wrap';
            search.parentNode.insertBefore(searchWrap, search);
            searchWrap.appendChild(search);
            searchWrap.insertAdjacentHTML('afterbegin', '<svg class="user-search-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.7-3.7"></path></svg>');
        }

        const nativeFilter = doc.getElementById('roleFilter');
        if (nativeFilter && !doc.querySelector('.premium-user-filter')) {
            nativeFilter.classList.add('premium-user-filter-native');
            const filter = doc.createElement('div');
            filter.className = 'premium-user-filter';
            const trigger = doc.createElement('button');
            trigger.type = 'button';
            trigger.className = 'premium-user-filter-trigger';
            trigger.setAttribute('aria-haspopup', 'listbox');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.innerHTML = '<span class="premium-user-filter-icon"><svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"></path></svg></span><span class="premium-user-filter-label"></span><svg class="premium-user-filter-chevron" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"></path></svg>';
            const menu = doc.createElement('div');
            menu.className = 'premium-user-filter-menu';
            menu.setAttribute('role', 'listbox');
            filter.appendChild(trigger);
            filter.appendChild(menu);
            nativeFilter.parentNode.insertBefore(filter, nativeFilter.nextSibling);

            const syncFilter = function () {
                const selected = nativeFilter.options[nativeFilter.selectedIndex] || nativeFilter.options[0];
                trigger.querySelector('.premium-user-filter-label').textContent = selected ? selected.textContent : 'Tất cả vai trò';
                menu.querySelectorAll('.premium-user-filter-option').forEach(function (option) {
                    option.setAttribute('aria-selected', option.dataset.value === nativeFilter.value ? 'true' : 'false');
                });
            };

            Array.from(nativeFilter.options).forEach(function (option) {
                const item = doc.createElement('button');
                item.type = 'button';
                item.className = 'premium-user-filter-option';
                item.dataset.value = option.value;
                item.setAttribute('role', 'option');
                const dot = doc.createElement('span');
                dot.className = 'premium-user-filter-dot';
                const label = doc.createElement('span');
                label.textContent = option.textContent;
                item.appendChild(dot);
                item.appendChild(label);
                item.addEventListener('click', function () {
                    nativeFilter.value = option.value;
                    nativeFilter.dispatchEvent(new frame.contentWindow.Event('change', { bubbles: true }));
                    filter.classList.remove('open');
                    trigger.setAttribute('aria-expanded', 'false');
                    syncFilter();
                });
                menu.appendChild(item);
            });

            trigger.addEventListener('click', function () {
                const open = !filter.classList.contains('open');
                filter.classList.toggle('open', open);
                trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
            doc.addEventListener('click', function (event) {
                if (!filter.contains(event.target)) {
                    filter.classList.remove('open');
                    trigger.setAttribute('aria-expanded', 'false');
                }
            });
            nativeFilter.addEventListener('change', syncFilter);
            syncFilter();
        }

        const panelHead = doc.querySelector('.panel .panel-head');
        const userRows = doc.getElementById('userRows');
        const emptyState = doc.getElementById('empty');
        const userStatusSelect = doc.getElementById('status');
        if (userStatusSelect && !userStatusSelect.querySelector('option[value="pending"]')) {
            const pendingOption = doc.createElement('option');
            pendingOption.value = 'pending';
            pendingOption.textContent = 'Chờ phê duyệt';
            userStatusSelect.insertBefore(pendingOption, userStatusSelect.firstChild);
        }

        const stats = doc.querySelector('.hero .stats');
        if (stats && !doc.getElementById('pendingUsers')) {
            const pendingStat = doc.createElement('div');
            pendingStat.className = 'stat kgpt-pending-stat';
            pendingStat.innerHTML = '<div class="stat-icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 7v5l3 2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="12" cy="12" r="9" stroke-width="2"></circle></svg></div><div><b id="pendingUsers">0</b><span>Chờ phê duyệt</span></div>';
            stats.appendChild(pendingStat);
        }

        const userActionBar = doc.querySelector('.user-hero-actions');
        let pendingFilterButton = doc.getElementById('pendingApprovalFilter');
        if (userActionBar && !pendingFilterButton) {
            pendingFilterButton = doc.createElement('button');
            pendingFilterButton.type = 'button';
            pendingFilterButton.id = 'pendingApprovalFilter';
            pendingFilterButton.className = 'pending-approval-filter';
            pendingFilterButton.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-5"></path><circle cx="12" cy="12" r="9"></circle></svg><span>Chờ phê duyệt</span><b>0</b>';
            userActionBar.insertBefore(pendingFilterButton, userActionBar.querySelector('.primary'));
            pendingFilterButton.addEventListener('click', function () {
                const enabled = doc.body.dataset.kgptApprovalOnly !== 'true';
                doc.body.dataset.kgptApprovalOnly = enabled ? 'true' : 'false';
                pendingFilterButton.classList.toggle('active', enabled);
                pendingFilterButton.setAttribute('aria-pressed', String(enabled));
                if (frame.contentWindow.__kgptApplyUserPagination) frame.contentWindow.__kgptApplyUserPagination(true);
            });
        }

        const roleDisplay = function (role) {
            return role === 'admin' ? 'Quản trị viên' : role === 'teacher' ? 'Giảng viên' : 'Người dùng';
        };
        if (!doc.getElementById('kgpt-approval-bridge')) {
            const approvalBridge = doc.createElement('script');
            approvalBridge.id = 'kgpt-approval-bridge';
            approvalBridge.textContent = `document.addEventListener('click',function(event){
                const button=event.target.closest('.kgpt-approve-user');
                if(!button||button.disabled)return;
                window.parent.postMessage({type:'kgpt:approve-user',payload:{uid:button.dataset.uid||'',email:button.dataset.email||''}},'*');
            },true);`;
            doc.body.appendChild(approvalBridge);
        }
        const decorateApprovalState = function (users) {
            const list = Array.isArray(users) ? users : [];
            const byId = new Map(list.map(function (user) { return [String(user.uid || ''), user]; }));
            const pendingCount = list.filter(function (user) { return user.status === 'pending'; }).length;
            const activeCount = list.filter(function (user) { return (user.status || 'active') === 'active'; }).length;
            const lockedCount = list.filter(function (user) { return user.status === 'locked'; }).length;
            const pendingStatValue = doc.getElementById('pendingUsers');
            if (pendingStatValue) pendingStatValue.textContent = String(pendingCount);
            const totalStatValue = doc.getElementById('totalUsers');
            const activeStatValue = doc.getElementById('activeUsers');
            const lockedStatValue = doc.getElementById('lockedUsers');
            if (totalStatValue) totalStatValue.textContent = String(list.length);
            if (activeStatValue) activeStatValue.textContent = String(activeCount);
            if (lockedStatValue) lockedStatValue.textContent = String(lockedCount);
            if (pendingFilterButton) {
                const count = pendingFilterButton.querySelector('b');
                if (count) count.textContent = String(pendingCount);
                pendingFilterButton.title = pendingCount ? pendingCount + ' tài khoản đang chờ quản trị viên phê duyệt' : 'Không có tài khoản chờ phê duyệt';
                if (pendingCount === 0 && doc.body.dataset.kgptApprovalOnly === 'true') {
                    doc.body.dataset.kgptApprovalOnly = 'false';
                    pendingFilterButton.classList.remove('active');
                    pendingFilterButton.setAttribute('aria-pressed', 'false');
                }
            }

            if (!userRows) return;
            userRows.querySelectorAll('tr[data-uid]').forEach(function (row) {
                const user = byId.get(String(row.dataset.uid || ''));
                if (!user) return;
                row.dataset.status = user.status || 'active';
                const statusCell = row.children[2];
                if (statusCell && user.status === 'pending') statusCell.innerHTML = '<span class="badge pending">● Chờ duyệt</span>';
                const actionWrap = row.querySelector('td:last-child > div') || row.querySelector('td:last-child');
                if (!actionWrap) return;
                const existing = actionWrap.querySelector('.kgpt-approve-user');
                if (user.status !== 'pending') {
                    if (existing) existing.remove();
                    return;
                }
                if (existing) return;
                const approve = doc.createElement('button');
                approve.type = 'button';
                approve.className = 'icon-btn kgpt-approve-user';
                approve.title = 'Phê duyệt tài khoản';
                approve.setAttribute('aria-label', approve.title);
                approve.dataset.uid = String(user.uid || '');
                approve.dataset.email = String(user.email || '');
                approve.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="m5 12 4 4L19 7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
                approve.addEventListener('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    approve.disabled = true;
                    approve.classList.add('is-loading');
                    approve.title = 'Đang phê duyệt...';
                    frame.contentWindow.__kgptApprovingUid = String(user.uid || '');
                    frame.contentWindow.clearTimeout(frame.contentWindow.__kgptApprovalTimeout);
                    frame.contentWindow.__kgptApprovalTimeout = frame.contentWindow.setTimeout(function () {
                        if (!approve.isConnected) return;
                        approve.disabled = false;
                        approve.classList.remove('is-loading');
                        approve.title = 'Phê duyệt tài khoản';
                        if (typeof frame.contentWindow.showToast === 'function') frame.contentWindow.showToast('Phê duyệt quá thời gian. Vui lòng thử lại.');
                    }, 15000);
                });
                actionWrap.insertBefore(approve, actionWrap.firstChild);
            });
            if (frame.contentWindow.__kgptApplyUserPagination) frame.contentWindow.__kgptApplyUserPagination();
        };

        const originalEditPermissions = frame.contentWindow.editPermissions;
        if (typeof originalEditPermissions === 'function' && !frame.contentWindow.__kgptApprovalEditWrapped) {
            frame.contentWindow.editPermissions = function (button) {
                originalEditPermissions(button);
                doc.documentElement.classList.add('kgpt-user-modal-open');
                const row = button && button.closest('tr[data-uid]');
                if (row && userStatusSelect) userStatusSelect.value = row.dataset.status || 'active';
            };
            frame.contentWindow.__kgptApprovalEditWrapped = true;
        }
        const userModal = doc.getElementById('userModal');
        if (userModal && !frame.contentWindow.__kgptUserModalScrollObserver) {
            const syncUserModalScrollLock = function () {
                doc.documentElement.classList.toggle('kgpt-user-modal-open', userModal.classList.contains('open'));
                const formBody = userModal.querySelector('.form');
                if (formBody && userModal.classList.contains('open')) formBody.scrollTop = 0;
            };
            const modalObserver = new frame.contentWindow.MutationObserver(syncUserModalScrollLock);
            modalObserver.observe(userModal, { attributes: true, attributeFilter: ['class'] });
            frame.contentWindow.__kgptUserModalScrollObserver = modalObserver;
            syncUserModalScrollLock();
        }
        frame.contentWindow.addEventListener('message', function (event) {
            const data = event.data || {};
            if (data.type === 'kgpt:user-list') {
                frame.contentWindow.clearTimeout(frame.contentWindow.__kgptApprovalTimeout);
                frame.contentWindow.setTimeout(function () { decorateApprovalState(data.users || []); }, 0);
                frame.contentWindow.setTimeout(function () { decorateApprovalState(data.users || []); }, 80);
            }
            if (data.type === 'kgpt:operation-result') {
                frame.contentWindow.clearTimeout(frame.contentWindow.__kgptApprovalTimeout);
                const approvingUid = frame.contentWindow.__kgptApprovingUid || '';
                if (data.ok && approvingUid) {
                    const approvedRow = userRows && userRows.querySelector('tr[data-uid="' + approvingUid.replace(/"/g, '\\"') + '"]');
                    if (approvedRow) {
                        approvedRow.dataset.status = 'active';
                        const statusCell = approvedRow.children[2];
                        if (statusCell) statusCell.innerHTML = '<span class="badge active">● Hoạt động</span>';
                        const approveButton = approvedRow.querySelector('.kgpt-approve-user');
                        if (approveButton) approveButton.remove();
                        const pendingValue = doc.getElementById('pendingUsers');
                        const activeValue = doc.getElementById('activeUsers');
                        if (pendingValue) pendingValue.textContent = String(Math.max(0, Number(pendingValue.textContent || 0) - 1));
                        if (activeValue) activeValue.textContent = String(Number(activeValue.textContent || 0) + 1);
                        const filterCount = pendingFilterButton && pendingFilterButton.querySelector('b');
                        if (filterCount) filterCount.textContent = pendingValue ? pendingValue.textContent : String(Math.max(0, Number(filterCount.textContent || 0) - 1));
                        if (pendingValue && Number(pendingValue.textContent || 0) === 0 && doc.body.dataset.kgptApprovalOnly === 'true') {
                            doc.body.dataset.kgptApprovalOnly = 'false';
                            if (pendingFilterButton) {
                                pendingFilterButton.classList.remove('active');
                                pendingFilterButton.setAttribute('aria-pressed', 'false');
                            }
                        }
                        if (frame.contentWindow.__kgptApplyUserPagination) frame.contentWindow.__kgptApplyUserPagination();
                    }
                }
                frame.contentWindow.__kgptApprovingUid = '';
                doc.querySelectorAll('.kgpt-approve-user:disabled').forEach(function (button) {
                    button.disabled = false;
                    button.classList.remove('is-loading');
                    button.title = 'Phê duyệt tài khoản';
                });
            }
        });
        if (panelHead && userRows && !doc.getElementById('userPagination')) {
            const pagination = doc.createElement('div');
            pagination.className = 'user-pagination';
            pagination.id = 'userPagination';
            pagination.setAttribute('aria-label', 'Phân trang người dùng');
            pagination.innerHTML = `
                <button class="user-page-nav user-page-prev" type="button" aria-label="Trang trước"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"></path></svg></button>
                <div class="user-page-numbers"></div>
                <button class="user-page-nav user-page-next" type="button" aria-label="Trang sau"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"></path></svg></button>
                <div class="user-page-size-control"><span>Hiển thị</span><div class="user-page-size-dropdown"><button class="user-page-size-trigger" type="button"><span>10</span><svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"></path></svg></button><div class="user-page-size-menu" role="listbox"></div></div><span>dòng</span></div>
            `;
            panelHead.appendChild(pagination);

            const state = { page: 1, size: 10 };
            const prev = pagination.querySelector('.user-page-prev');
            const next = pagination.querySelector('.user-page-next');
            const numbers = pagination.querySelector('.user-page-numbers');
            const sizeDropdown = pagination.querySelector('.user-page-size-dropdown');
            const sizeTrigger = pagination.querySelector('.user-page-size-trigger');
            const sizeLabel = sizeTrigger.querySelector('span');
            const sizeMenu = pagination.querySelector('.user-page-size-menu');

            const getDataRows = function () {
                return Array.from(userRows.querySelectorAll('tr')).filter(function (row) {
                    return !!row.querySelector('.user-name');
                });
            };

            const getFilteredRows = function () {
                const query = search ? search.value.trim().toLowerCase() : '';
                const role = nativeFilter ? nativeFilter.value : '';
                const approvalOnly = doc.body.dataset.kgptApprovalOnly === 'true';
                return getDataRows().filter(function (row) {
                    const matchesQuery = !query || row.innerText.toLowerCase().includes(query);
                    const matchesRole = !role || row.dataset.role === role;
                    const matchesApproval = !approvalOnly || row.dataset.status === 'pending';
                    return matchesQuery && matchesRole && matchesApproval;
                });
            };

            const buildPageList = function (totalPages) {
                if (totalPages <= 5) return Array.from({ length: totalPages }, function (_, index) { return index + 1; });
                if (state.page <= 3) return [1, 2, 3, 'ellipsis', totalPages];
                if (state.page >= totalPages - 2) return [1, 'ellipsis', totalPages - 2, totalPages - 1, totalPages];
                return [1, 'ellipsis', state.page, 'ellipsis', totalPages];
            };

            const applyUserPagination = function () {
                const allRows = getDataRows();
                const filteredRows = getFilteredRows();
                const totalPages = Math.max(1, Math.ceil(filteredRows.length / state.size));
                state.page = Math.min(Math.max(1, state.page), totalPages);
                const start = (state.page - 1) * state.size;
                const visibleRows = new Set(filteredRows.slice(start, start + state.size));

                allRows.forEach(function (row) {
                    row.style.display = visibleRows.has(row) ? '' : 'none';
                });
                if (emptyState) emptyState.style.display = filteredRows.length ? 'none' : 'block';

                prev.disabled = state.page <= 1 || filteredRows.length === 0;
                next.disabled = state.page >= totalPages || filteredRows.length === 0;
                numbers.innerHTML = '';
                buildPageList(totalPages).forEach(function (page) {
                    if (page === 'ellipsis') {
                        const ellipsis = doc.createElement('span');
                        ellipsis.className = 'user-page-ellipsis';
                        ellipsis.textContent = '…';
                        numbers.appendChild(ellipsis);
                        return;
                    }
                    const button = doc.createElement('button');
                    button.type = 'button';
                    button.className = 'user-page-number' + (page === state.page ? ' active' : '');
                    button.textContent = String(page);
                    button.setAttribute('aria-label', 'Trang ' + page);
                    if (page === state.page) button.setAttribute('aria-current', 'page');
                    button.addEventListener('click', function () {
                        state.page = page;
                        applyUserPagination();
                    });
                    numbers.appendChild(button);
                });
            };

            [10, 20, 50].forEach(function (size) {
                const option = doc.createElement('button');
                option.type = 'button';
                option.className = 'user-page-size-option';
                option.textContent = String(size);
                option.dataset.size = String(size);
                option.setAttribute('role', 'option');
                option.setAttribute('aria-selected', size === state.size ? 'true' : 'false');
                option.addEventListener('click', function () {
                    state.size = size;
                    state.page = 1;
                    sizeLabel.textContent = String(size);
                    sizeMenu.querySelectorAll('.user-page-size-option').forEach(function (item) {
                        item.setAttribute('aria-selected', item === option ? 'true' : 'false');
                    });
                    sizeDropdown.classList.remove('open');
                    applyUserPagination();
                });
                sizeMenu.appendChild(option);
            });

            prev.addEventListener('click', function () {
                if (state.page > 1) {
                    state.page -= 1;
                    applyUserPagination();
                }
            });
            next.addEventListener('click', function () {
                const totalPages = Math.max(1, Math.ceil(getFilteredRows().length / state.size));
                if (state.page < totalPages) {
                    state.page += 1;
                    applyUserPagination();
                }
            });
            sizeTrigger.addEventListener('click', function () {
                sizeDropdown.classList.toggle('open');
            });
            doc.addEventListener('click', function (event) {
                if (!sizeDropdown.contains(event.target)) sizeDropdown.classList.remove('open');
            });
            if (search) search.addEventListener('input', function () {
                state.page = 1;
                applyUserPagination();
            });
            if (nativeFilter) nativeFilter.addEventListener('change', function () {
                state.page = 1;
                applyUserPagination();
            });

            const observer = new frame.contentWindow.MutationObserver(function () {
                state.page = Math.min(state.page, Math.max(1, Math.ceil(getFilteredRows().length / state.size)));
                applyUserPagination();
            });
            observer.observe(userRows, { childList: true });
            frame.contentWindow.__kgptUserPaginationObserver = observer;
            frame.contentWindow.__kgptApplyUserPagination = applyUserPagination;
            applyUserPagination();
        }
    }

    function enhanceTeacherWorkspace(frame) {
        const doc = frame && frame.contentDocument;
        if (!doc || doc.getElementById('kgpt-premium-teacher-ui')) return;

        const style = doc.createElement('style');
        style.id = 'kgpt-premium-teacher-ui';
        style.textContent = `
            .premium-field{position:relative}
            .premium-field>label{display:flex;align-items:center;gap:7px;color:#44536a;letter-spacing:.085em}
            .premium-field>label:before{content:"";width:6px;height:6px;border-radius:999px;background:linear-gradient(135deg,#60a5fa,#2563eb);box-shadow:0 0 0 4px rgba(37,99,235,.08)}
            .premium-select-native{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important}
            .premium-select{position:relative;width:100%}
            .premium-select-trigger{position:relative;width:100%;height:48px;padding:0 42px 0 11px;border:1px solid #d9e3f1;border-radius:13px;background:linear-gradient(180deg,#fff 0%,#fbfdff 100%);color:#1e293b;display:flex;align-items:center;gap:10px;cursor:pointer;text-align:left;box-shadow:0 8px 20px -18px rgba(15,23,42,.7),inset 0 1px 0 rgba(255,255,255,.95);transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease,background .2s ease}
            .premium-select-trigger:before{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(110deg,rgba(255,255,255,.55),transparent 40%);pointer-events:none}
            .premium-select-trigger:hover{border-color:#a9c3ef;background:#fff;box-shadow:0 12px 25px -19px rgba(37,99,235,.75),0 0 0 3px rgba(59,130,246,.055);transform:translateY(-1px)}
            .premium-select.open .premium-select-trigger,.premium-select-trigger:focus-visible{outline:none;border-color:#75a2f5;box-shadow:0 0 0 4px rgba(59,130,246,.12),0 14px 28px -20px rgba(37,99,235,.8);background:#fff}
            .premium-select-icon{position:relative;z-index:1;width:30px;height:30px;flex:0 0 30px;border:1px solid #d7e5fb;border-radius:9px;background:linear-gradient(145deg,#f5f9ff,#e8f1ff);color:#3167cf;display:grid;place-items:center;box-shadow:inset 0 1px 0 #fff,0 8px 16px -13px #2563eb}
            .premium-select-icon svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
            .premium-select-value{position:relative;z-index:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;font-weight:750;color:#27354a}
            .premium-select-chevron{position:absolute;z-index:1;right:14px;top:50%;width:16px;height:16px;transform:translateY(-50%);color:#7890b3;transition:transform .22s ease,color .22s ease}
            .premium-select.open .premium-select-chevron{transform:translateY(-50%) rotate(180deg);color:#2563eb}
            .premium-select-menu{position:absolute;z-index:120;left:0;right:0;top:calc(100% + 7px);padding:6px;border:1px solid rgba(203,216,234,.95);border-radius:14px;background:rgba(255,255,255,.98);box-shadow:0 22px 48px -24px rgba(15,23,42,.48),0 8px 20px -15px rgba(37,99,235,.22);backdrop-filter:blur(18px);opacity:0;visibility:hidden;transform:translateY(-6px) scale(.985);transform-origin:top;transition:opacity .17s ease,transform .17s ease,visibility .17s;max-height:230px;overflow:auto}
            .premium-select.open .premium-select-menu{opacity:1;visibility:visible;transform:translateY(0) scale(1)}
            .premium-select-option{width:100%;min-height:39px;padding:8px 9px;border:0;border-radius:10px;background:transparent;color:#3d4b61;display:flex;align-items:center;gap:9px;text-align:left;cursor:pointer;font-size:11.5px;font-weight:650;transition:background .16s ease,color .16s ease,transform .16s ease}
            .premium-select-option:hover,.premium-select-option:focus-visible{outline:none;background:linear-gradient(90deg,#f0f6ff,#f7faff);color:#1d4ed8;transform:translateX(1px)}
            .premium-select-option[aria-selected="true"]{background:linear-gradient(90deg,#eaf2ff,#f4f8ff);color:#1d4ed8;font-weight:800}
            .premium-select-check{width:22px;height:22px;flex:0 0 22px;border:1px solid #e0e7f0;border-radius:7px;background:#f8fafc;color:transparent;display:grid;place-items:center;transition:.16s}
            .premium-select-check svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
            .premium-select-option[aria-selected="true"] .premium-select-check{border-color:#3978eb;background:linear-gradient(145deg,#4f8cf5,#2563eb);color:#fff;box-shadow:0 7px 14px -9px #1d4ed8}
            .premium-deadline-field{position:relative}
            .premium-deadline-input{width:100%;height:48px!important;padding:0 48px 0 14px!important;border:1px solid #d9e3f1!important;border-radius:13px!important;background-color:#fbfdff!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%233167cf' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3.5' y='5.5' width='17' height='15' rx='3'/%3E%3Cpath d='M8 3.5v4M16 3.5v4M3.5 10h17'/%3E%3Cpath d='M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01' stroke-width='2.4'/%3E%3C/svg%3E")!important;background-repeat:no-repeat!important;background-position:calc(100% - 14px) 50%!important;background-size:19px 19px!important;color:#27354a!important;font-family:inherit!important;font-size:11.5px!important;font-weight:700!important;line-height:48px!important;outline:none!important;box-shadow:0 8px 20px -18px rgba(15,23,42,.7),inset 0 1px 0 rgba(255,255,255,.95)!important;color-scheme:light;transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease,background-color .2s ease}
            .premium-deadline-input:hover{border-color:#a9c3ef!important;background-color:#fff!important;box-shadow:0 12px 25px -19px rgba(37,99,235,.75),0 0 0 3px rgba(59,130,246,.055)!important;transform:translateY(-1px)}
            .premium-deadline-input:focus{border-color:#75a2f5!important;background-color:#fff!important;box-shadow:0 0 0 4px rgba(59,130,246,.12),0 14px 28px -20px rgba(37,99,235,.8)!important}
            .premium-deadline-input::-webkit-calendar-picker-indicator{width:34px;height:34px;margin-right:-7px;opacity:0;cursor:pointer}
            .premium-deadline-input::-webkit-datetime-edit{padding:0;color:#27354a}
            .premium-deadline-input::-webkit-datetime-edit-fields-wrapper{padding:0}
            .premium-deadline-input::-webkit-datetime-edit-text{padding:0 3px;color:#8a9ab1}
            .premium-deadline-input::-webkit-datetime-edit-day-field,.premium-deadline-input::-webkit-datetime-edit-month-field,.premium-deadline-input::-webkit-datetime-edit-year-field,.premium-deadline-input::-webkit-datetime-edit-hour-field,.premium-deadline-input::-webkit-datetime-edit-minute-field{padding:3px 2px;border-radius:5px}
            .premium-deadline-input::-webkit-datetime-edit-day-field:focus,.premium-deadline-input::-webkit-datetime-edit-month-field:focus,.premium-deadline-input::-webkit-datetime-edit-year-field:focus,.premium-deadline-input::-webkit-datetime-edit-hour-field:focus,.premium-deadline-input::-webkit-datetime-edit-minute-field:focus{background:#eaf2ff;color:#1d4ed8;outline:none}
            .premium-deadline-input{cursor:pointer}
            .premium-datetime-picker{position:fixed;z-index:1000;width:min(374px,calc(100vw - 24px));padding:10px;border:1px solid rgba(196,211,232,.96);border-radius:18px;background:rgba(255,255,255,.985);box-shadow:0 30px 70px -28px rgba(15,23,42,.62),0 16px 34px -25px rgba(37,99,235,.36),inset 0 1px 0 #fff;backdrop-filter:blur(22px);opacity:0;visibility:hidden;transform:translateY(-7px) scale(.985);transform-origin:top;transition:opacity .18s ease,visibility .18s ease,transform .18s ease}
            .premium-datetime-picker.open{opacity:1;visibility:visible;transform:translateY(0) scale(1)}
            .premium-datetime-picker:before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(circle at 100% 0,rgba(59,130,246,.11),transparent 31%),linear-gradient(120deg,rgba(255,255,255,.5),transparent 42%)}
            .premium-datetime-inner{position:relative;z-index:1}
            .premium-datetime-head{height:48px;padding:0 4px 8px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #edf1f6}
            .premium-datetime-title{display:flex;align-items:center;gap:9px;color:#172033;font-size:13px;font-weight:900;text-transform:capitalize}
            .premium-datetime-title:before{content:"";width:8px;height:8px;border-radius:50%;background:#3b82f6;box-shadow:0 0 0 4px rgba(59,130,246,.1)}
            .premium-calendar-nav{display:flex;gap:5px}
            .premium-calendar-nav button{width:32px;height:32px;padding:0;border:1px solid #dce5f1;border-radius:9px;background:linear-gradient(180deg,#fff,#f8fbff);color:#667b9c;display:grid;place-items:center;cursor:pointer;box-shadow:0 5px 12px -11px rgba(15,23,42,.7);transition:.16s ease}
            .premium-calendar-nav button:hover{border-color:#9ebbf0;background:#eef5ff;color:#2563eb;transform:translateY(-1px)}
            .premium-calendar-nav svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
            .premium-calendar-weekdays,.premium-calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
            .premium-calendar-weekdays{padding:10px 2px 6px}
            .premium-calendar-weekdays span{text-align:center;color:#93a0b3;font-size:8px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
            .premium-calendar-grid{padding:0 2px}
            .premium-calendar-day{position:relative;height:34px;padding:0;border:0;border-radius:9px;background:transparent;color:#42516a;font-family:inherit;font-size:10.5px;font-weight:750;cursor:pointer;transition:background .15s ease,color .15s ease,transform .15s ease,box-shadow .15s ease}
            .premium-calendar-day:hover{background:#eef5ff;color:#1d4ed8;transform:translateY(-1px)}
            .premium-calendar-day.outside{color:#c0c9d6;font-weight:600}
            .premium-calendar-day.today:after{content:"";position:absolute;left:50%;bottom:4px;width:4px;height:4px;border-radius:50%;background:#3b82f6;transform:translateX(-50%)}
            .premium-calendar-day.selected{background:linear-gradient(145deg,#4d88f3,#2563eb 62%,#1d4ed8);color:#fff;box-shadow:0 10px 19px -11px rgba(37,99,235,.95),inset 0 1px 0 rgba(255,255,255,.28)}
            .premium-calendar-day.selected:after{background:#fff}
            .premium-datetime-tools{margin-top:10px;padding:10px;border:1px solid #e1e9f3;border-radius:13px;background:linear-gradient(145deg,#f9fbff,#f4f7fb);box-shadow:inset 0 1px 0 #fff}
            .premium-time-row{display:flex;align-items:center;justify-content:space-between;gap:10px}
            .premium-time-label{display:flex;align-items:center;gap:7px;color:#5f708a;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
            .premium-time-label svg{width:16px;height:16px;fill:none;stroke:#3770d6;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
            .premium-time-inputs{display:flex;align-items:center;gap:5px}
            .premium-time-dropdown{position:relative;width:64px}
            .premium-time-native{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important}
            .premium-time-trigger{position:relative;width:64px;height:34px;padding:0 25px 0 10px;border:1px solid #cedbef;border-radius:9px;background:linear-gradient(180deg,#fff,#f8fbff);color:#20304a;display:flex;align-items:center;justify-content:center;font-family:inherit;font-size:12px;font-weight:850;letter-spacing:.03em;cursor:pointer;outline:none;box-shadow:0 6px 14px -13px rgba(15,23,42,.7),inset 0 1px 0 #fff;transition:border-color .16s ease,box-shadow .16s ease,background .16s ease,transform .16s ease}
            .premium-time-trigger:hover{border-color:#9db9e9;background:#fff;transform:translateY(-1px)}
            .premium-time-dropdown.open .premium-time-trigger,.premium-time-trigger:focus-visible{border-color:#79a4f1;background:#fff;box-shadow:0 0 0 3px rgba(59,130,246,.1),0 9px 18px -14px rgba(37,99,235,.72)}
            .premium-time-chevron{position:absolute;right:7px;top:50%;width:13px;height:13px;transform:translateY(-50%);fill:none;stroke:#7185a5;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .17s ease,stroke .17s ease}
            .premium-time-dropdown.open .premium-time-chevron{transform:translateY(-50%) rotate(180deg);stroke:#2563eb}
            .premium-time-menu{position:absolute;z-index:40;left:0;right:0;bottom:calc(100% + 7px);max-height:190px;padding:5px;border:1px solid #d4e0ef;border-radius:11px;background:rgba(255,255,255,.99);box-shadow:0 22px 48px -23px rgba(15,23,42,.58),0 9px 20px -16px rgba(37,99,235,.28);backdrop-filter:blur(16px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#b8c9e3 transparent;opacity:0;visibility:hidden;transform:translateY(5px) scale(.98);transform-origin:bottom;transition:opacity .16s ease,visibility .16s ease,transform .16s ease}
            .premium-time-dropdown.open .premium-time-menu{opacity:1;visibility:visible;transform:translateY(0) scale(1)}
            .premium-time-menu::-webkit-scrollbar{width:5px}.premium-time-menu::-webkit-scrollbar-track{background:transparent}.premium-time-menu::-webkit-scrollbar-thumb{border-radius:999px;background:#b8c9e3}
            .premium-time-option{width:100%;height:32px;padding:0;border:0;border-radius:7px;background:transparent;color:#53637a;display:grid;place-items:center;font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer;transition:background .14s ease,color .14s ease,transform .14s ease}
            .premium-time-option:hover,.premium-time-option:focus-visible{outline:none;background:#eef5ff;color:#1d4ed8;transform:translateX(1px)}
            .premium-time-option[aria-selected="true"]{background:linear-gradient(145deg,#4a84ef,#2563eb);color:#fff;font-weight:900;box-shadow:0 7px 14px -10px rgba(37,99,235,.9)}
            .premium-time-separator{color:#70819b;font-size:13px;font-weight:900}
            .premium-datetime-actions{margin-top:9px;display:flex;align-items:center;justify-content:space-between;gap:8px}
            .premium-date-quick{display:flex;gap:5px}
            .premium-date-quick button,.premium-datetime-cancel,.premium-datetime-apply{height:34px;padding:0 10px;border-radius:9px;font-family:inherit;font-size:9.5px;font-weight:850;cursor:pointer;transition:.16s ease}
            .premium-date-quick button{border:1px solid #dce5f1;background:#fff;color:#657791}
            .premium-date-quick button:hover{border-color:#a9c2ea;background:#f0f6ff;color:#2563eb}
            .premium-datetime-commit{display:flex;gap:6px}
            .premium-datetime-cancel{border:1px solid #dce5f1;background:#fff;color:#687991}
            .premium-datetime-apply{border:1px solid #1d4ed8;background:linear-gradient(145deg,#4381f0,#2563eb 58%,#1d4ed8);color:#fff;box-shadow:0 10px 19px -12px rgba(37,99,235,.9)}
            .premium-datetime-cancel:hover,.premium-datetime-apply:hover{transform:translateY(-1px)}
            @media(max-width:520px){.premium-datetime-picker{width:calc(100vw - 20px)}.premium-datetime-actions{align-items:stretch;flex-direction:column}.premium-date-quick,.premium-datetime-commit{width:100%}.premium-date-quick button,.premium-datetime-commit button{flex:1}}
            .question-builder-head{padding:15px 17px;background:linear-gradient(180deg,#fff,#fcfdff)}
            .question-builder-actions{padding:5px;border:1px solid #dce6f3;border-radius:14px;background:linear-gradient(145deg,#f8fbff,#f4f7fb);box-shadow:inset 0 1px 0 #fff,0 10px 24px -21px rgba(15,23,42,.7);gap:6px}
            .question-builder-actions .template-excel-btn,.question-builder-actions .import-excel-btn{position:relative;overflow:hidden;height:40px;padding:0 13px;border-radius:10px;font-size:11px;font-weight:800;box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 7px 16px -14px currentColor;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,background .18s ease}
            .question-builder-actions .template-excel-btn:before,.question-builder-actions .import-excel-btn:before{content:"";position:absolute;inset:0;background:linear-gradient(120deg,rgba(255,255,255,.55),transparent 45%);pointer-events:none}
            .question-builder-actions .template-excel-btn{border-color:#bfe7d2;background:linear-gradient(145deg,#fbfffd,#effbf5);color:#11804e}
            .question-builder-actions .import-excel-btn{border-color:#bfd4fa;background:linear-gradient(145deg,#fbfdff,#edf4ff);color:#2861c9}
            .question-builder-actions .template-excel-btn:hover{transform:translateY(-1px);border-color:#71d09d;background:linear-gradient(145deg,#f4fff9,#e5f8ee);box-shadow:0 12px 22px -15px rgba(16,185,129,.65)}
            .question-builder-actions .import-excel-btn:hover{transform:translateY(-1px);border-color:#7da8f3;background:linear-gradient(145deg,#f4f8ff,#e4efff);box-shadow:0 12px 22px -15px rgba(37,99,235,.65)}
            .question-builder-actions button:active{transform:translateY(0) scale(.97)!important}
            .question-builder-actions button svg{position:relative;z-index:1;width:15px!important;height:15px!important;stroke-width:2.25!important}
            .question-builder-actions button span{position:relative;z-index:1}
            .question-builder-actions .question-count-pill{height:40px;min-width:64px;padding:0 11px;border-color:#d2dff1;border-radius:10px;background:linear-gradient(145deg,#fff,#f4f7fc);justify-content:center;box-shadow:inset 0 1px 0 #fff}
            .question-builder-actions .question-count-pill b{width:24px;height:24px;border-radius:8px;background:linear-gradient(145deg,#3b82f6,#1d4ed8);color:#fff;display:grid;place-items:center;font-size:11px;box-shadow:0 8px 15px -10px #1d4ed8}
            .question-builder-actions .question-count-pill span{font-size:10px;color:#63728a;text-transform:uppercase;letter-spacing:.045em}
            .hero{position:relative;overflow:visible;padding:20px 22px 18px;border:1px solid #d8e4f8;border-radius:18px;background:radial-gradient(circle at 88% 5%,rgba(96,165,250,.13),transparent 27%),linear-gradient(112deg,#fff 0%,#fbfdff 53%,#edf3ff 100%);box-shadow:0 22px 52px -38px rgba(37,99,235,.48);isolation:isolate}
            .hero:before{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(120deg,rgba(255,255,255,.58),transparent 42%);z-index:-1;pointer-events:none}
            .hero-head{align-items:flex-start;gap:22px}
            .hero-head>div:first-child{min-width:280px;flex:1;padding-top:1px}
            .hero .eyebrow{display:flex;align-items:center;gap:8px;color:#426bc7;font-size:9px;letter-spacing:.14em;font-weight:900}
            .hero .eyebrow:before{content:"";width:7px;height:7px;border-radius:50%;background:#4f83ee;box-shadow:0 0 0 4px rgba(79,131,238,.12)}
            .hero h1{margin:8px 0 5px;font-size:25px;line-height:1.15;letter-spacing:-.045em;color:#0f172a}
            .hero p{max-width:700px;font-size:11.5px;line-height:1.65;color:#738198}
            .teacher-hero-actions{position:relative;z-index:20;display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-left:auto;flex:0 0 auto}
            .teacher-hero-actions .filters{gap:10px}
            .teacher-hero-actions>.primary{height:42px;min-width:154px;padding:0 17px;border-radius:11px;background:linear-gradient(145deg,#3f7cf0,#255bd8 58%,#1d4ed8);box-shadow:0 13px 25px -14px rgba(37,99,235,.92),inset 0 1px 0 rgba(255,255,255,.28);white-space:nowrap}
            .teacher-hero-actions>.primary:hover{transform:translateY(-1px);box-shadow:0 17px 29px -14px rgba(37,99,235,1),inset 0 1px 0 rgba(255,255,255,.3)}
            .stats{margin-top:15px;gap:10px}
            .stat{position:relative;overflow:hidden;min-height:68px;padding:11px 13px;border-radius:12px;background:rgba(255,255,255,.93);box-shadow:0 9px 22px -20px rgba(15,23,42,.6);isolation:isolate}
            .stat:after{content:"";position:absolute;z-index:-1;width:70px;height:70px;right:-28px;top:-37px;border-radius:50%;background:rgba(96,165,250,.10)}
            .stat:nth-child(1){border-color:#cbd9fa}.stat:nth-child(1):after{background:rgba(139,92,246,.12)}
            .stat:nth-child(2){border-color:#c6ead8}.stat:nth-child(2):after{background:rgba(34,197,94,.12)}
            .stat:nth-child(3){border-color:#fed7aa}.stat:nth-child(3):after{background:rgba(249,115,22,.12)}
            .stat:nth-child(4){border-color:#d7def8}.stat:nth-child(4):after{background:rgba(99,102,241,.11)}
            .stat-icon{width:36px;height:36px;border-radius:11px}
            .stat-icon svg{width:18px;height:18px}
            .stat b{font-size:19px;line-height:1.05;color:#172033}
            .stat span{margin-top:4px;font-size:9.5px;line-height:1.25;color:#718096}
            .panel-head{padding:20px 20px}
            .panel-head .panel-title{font-size:16px;line-height:1.3;letter-spacing:-.015em}
            .panel-head .panel-sub{font-size:11px;line-height:1.55;margin-top:4px}
            .filters{position:relative;display:flex;align-items:center;gap:10px;overflow:visible}
            .assignment-search-wrap{position:relative;width:270px}
            .assignment-search-icon{position:absolute;z-index:2;left:13px;top:50%;width:17px;height:17px;transform:translateY(-50%);fill:none;stroke:#7184a3;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
            .filters .search.assignment-search{width:100%;height:42px;padding:0 14px 0 40px;border:1px solid #d7e2f1;border-radius:11px;background:rgba(255,255,255,.94);color:#26354d;font-size:12px;font-weight:600;outline:none;box-shadow:0 10px 24px -18px rgba(15,23,42,.62),inset 0 1px 0 #fff;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}
            .filters .search.assignment-search::placeholder{color:#99a6b9;font-weight:550}
            .filters .search.assignment-search:hover{border-color:#b7cae5;background:#fff}
            .filters .search.assignment-search:focus{border-color:#79a4f1;box-shadow:0 0 0 4px rgba(59,130,246,.10),0 13px 27px -20px rgba(37,99,235,.7);transform:translateY(-1px)}
            .premium-filter-native{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important}
            .premium-filter{position:relative;width:184px;flex:0 0 184px}
            .premium-filter-trigger{position:relative;width:100%;height:42px;padding:0 38px 0 12px;border:1px solid #d7e2f1;border-radius:11px;background:linear-gradient(180deg,#fff,#fbfdff);color:#3d4d65;display:flex;align-items:center;gap:9px;cursor:pointer;text-align:left;box-shadow:0 10px 24px -18px rgba(15,23,42,.62),inset 0 1px 0 #fff;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}
            .premium-filter-trigger:hover{border-color:#a9c1e5;background:#fff;transform:translateY(-1px);box-shadow:0 13px 26px -19px rgba(37,99,235,.62)}
            .premium-filter.open .premium-filter-trigger,.premium-filter-trigger:focus-visible{outline:none;border-color:#79a4f1;box-shadow:0 0 0 4px rgba(59,130,246,.10),0 14px 28px -20px rgba(37,99,235,.72)}
            .premium-filter-icon{width:22px;height:22px;flex:0 0 22px;display:grid;place-items:center;color:#5270a4}
            .premium-filter-icon svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
            .premium-filter-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;font-weight:750}
            .premium-filter-chevron{position:absolute;right:12px;top:50%;width:15px;height:15px;transform:translateY(-50%);fill:none;stroke:#7890b3;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .18s ease,color .18s ease}
            .premium-filter.open .premium-filter-chevron{transform:translateY(-50%) rotate(180deg);stroke:#2563eb}
            .premium-filter-menu{position:absolute;z-index:140;top:calc(100% + 7px);right:0;width:100%;padding:6px;border:1px solid #d7e2f0;border-radius:13px;background:rgba(255,255,255,.985);box-shadow:0 22px 48px -24px rgba(15,23,42,.5),0 9px 22px -17px rgba(37,99,235,.25);backdrop-filter:blur(16px);opacity:0;visibility:hidden;transform:translateY(-6px) scale(.985);transform-origin:top right;transition:opacity .17s ease,visibility .17s ease,transform .17s ease}
            .premium-filter.open .premium-filter-menu{opacity:1;visibility:visible;transform:translateY(0) scale(1)}
            .premium-filter-option{width:100%;min-height:39px;padding:7px 9px;border:0;border-radius:9px;background:transparent;color:#44536a;display:flex;align-items:center;gap:9px;text-align:left;cursor:pointer;font-family:inherit;font-size:11.5px;font-weight:650;transition:background .16s ease,color .16s ease,transform .16s ease}
            .premium-filter-option:hover,.premium-filter-option:focus-visible{outline:none;background:linear-gradient(90deg,#f0f6ff,#f8fbff);color:#1d4ed8;transform:translateX(1px)}
            .premium-filter-dot{width:22px;height:22px;flex:0 0 22px;border:1px solid #dfe7f1;border-radius:7px;background:#f8fafc;display:grid;place-items:center;color:transparent}
            .premium-filter-dot:after{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
            .premium-filter-option[aria-selected="true"]{background:linear-gradient(90deg,#eaf2ff,#f5f9ff);color:#1d4ed8;font-weight:800}
            .premium-filter-option[aria-selected="true"] .premium-filter-dot{border-color:#8bb2f6;background:#eff6ff;color:#2563eb;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
            .assignment-pagination{position:relative;z-index:15;display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-left:auto}
            .page-nav-btn,.page-number-btn{width:34px;height:34px;padding:0;border:1px solid #dbe5f1;border-radius:9px;background:linear-gradient(180deg,#fff,#f9fbfe);color:#6f809a;display:inline-grid;place-items:center;cursor:pointer;font-family:inherit;font-size:11px;font-weight:800;box-shadow:0 5px 13px -12px rgba(15,23,42,.65);transition:transform .16s ease,border-color .16s ease,background .16s ease,color .16s ease,box-shadow .16s ease}
            .page-nav-btn svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
            .page-nav-btn:hover:not(:disabled),.page-number-btn:hover:not(.active){border-color:#a9c2ea;background:#f4f8ff;color:#2563eb;transform:translateY(-1px)}
            .page-nav-btn:disabled{opacity:.42;cursor:not-allowed;box-shadow:none}
            .page-number-btn.active{border-color:#3269db;background:linear-gradient(145deg,#4f83ec,#315fcf);color:#fff;box-shadow:0 10px 18px -12px rgba(37,99,235,.9)}
            .page-ellipsis{width:20px;text-align:center;color:#9aa7ba;font-size:11px;font-weight:800}
            .page-size-control{position:relative;height:34px;margin-left:4px;padding:0 8px 0 10px;border:1px solid #dbe5f1;border-radius:9px;background:#fff;display:flex;align-items:center;gap:7px;color:#718096;font-size:10px;font-weight:650;box-shadow:0 5px 13px -12px rgba(15,23,42,.6)}
            .page-size-dropdown{position:relative}
            .page-size-trigger{height:26px;min-width:54px;padding:0 24px 0 9px;border:1px solid #d7e2f1;border-radius:7px;background:linear-gradient(180deg,#fff,#f8fbff);color:#263b5e;display:flex;align-items:center;cursor:pointer;font-family:inherit;font-size:10.5px;font-weight:800;transition:border-color .16s ease,box-shadow .16s ease}
            .page-size-trigger:hover,.page-size-dropdown.open .page-size-trigger{border-color:#88acf0;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
            .page-size-trigger svg{position:absolute;right:7px;top:50%;width:13px;height:13px;transform:translateY(-50%);fill:none;stroke:#7185a5;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .17s ease}
            .page-size-dropdown.open .page-size-trigger svg{transform:translateY(-50%) rotate(180deg);stroke:#2563eb}
            .page-size-menu{position:absolute;z-index:170;right:0;top:calc(100% + 7px);width:86px;padding:5px;border:1px solid #d8e3f0;border-radius:11px;background:rgba(255,255,255,.99);box-shadow:0 20px 42px -23px rgba(15,23,42,.52);opacity:0;visibility:hidden;transform:translateY(-5px) scale(.98);transform-origin:top right;transition:opacity .16s ease,visibility .16s ease,transform .16s ease}
            .page-size-dropdown.open .page-size-menu{opacity:1;visibility:visible;transform:translateY(0) scale(1)}
            .page-size-option{width:100%;height:32px;padding:0 9px;border:0;border-radius:7px;background:transparent;color:#526176;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-family:inherit;font-size:10.5px;font-weight:750;transition:background .15s ease,color .15s ease}
            .page-size-option:hover,.page-size-option:focus-visible{outline:none;background:#f0f6ff;color:#1d4ed8}
            .page-size-option[aria-selected="true"]{background:#eaf2ff;color:#1d4ed8;font-weight:850}
            .page-size-option[aria-selected="true"]:after{content:"✓";font-size:10px}
            .assignment-pagination-footer{min-height:48px;padding:10px 18px;border-top:1px solid #e8eef6;background:linear-gradient(180deg,#fbfcfe,#f8fafd);display:flex;align-items:center;justify-content:space-between;gap:14px;color:#7b899e;font-size:10.5px;font-weight:600}
            .assignment-page-summary{white-space:nowrap}
            .assignment-page-indicator{padding:7px 10px;border:1px solid #dbe5f1;border-radius:9px;background:#fff;color:#5270a4;font-size:10px;font-weight:750;box-shadow:0 5px 14px -13px rgba(15,23,42,.6)}
            .assignment-filter-empty td{height:220px;padding:30px!important;text-align:center!important;color:#7a879a!important;background:radial-gradient(circle at 50% 48%,rgba(59,130,246,.055),transparent 24%)}
            .assignment-filter-empty b{display:block;margin-top:11px;color:#172033;font-size:15px;line-height:1.35}
            .assignment-filter-empty span{display:block;margin-top:6px;color:#8290a3;font-size:11px;line-height:1.5}
            .assignment-empty-icon{width:56px;height:56px;margin:0 auto;border:1px solid #d8e5fb;border-radius:17px;background:linear-gradient(145deg,#f4f8ff,#eaf2ff);color:#4f7fe1;display:grid;place-items:center;box-shadow:0 13px 25px -20px rgba(37,99,235,.65)}
            .assignment-empty-icon svg{width:27px;height:27px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
            .table th{height:48px;padding:0 17px;font-size:10.5px;line-height:1.3;letter-spacing:.065em;font-weight:800}
            .table td{padding:17px;font-size:12.5px;line-height:1.5}
            .task-name{font-size:14px;line-height:1.4;margin-bottom:6px;letter-spacing:-.01em}
            .task-meta{font-size:11px;line-height:1.5}
            .table .badge{min-height:28px;padding:6px 10px;font-size:10px;line-height:1;font-weight:800}
            .table .progress{width:104px;height:6px;margin-top:8px}
            .table .icon-btn{width:35px;height:35px;border-radius:10px}
            .table .icon-btn svg{width:17px;height:17px}
            @media(max-width:1250px){.assignment-search-wrap{width:225px}.premium-filter{width:170px;flex-basis:170px}.teacher-hero-actions>.primary{min-width:142px;padding:0 14px}}
            @media(max-width:980px){.hero-head{flex-direction:column}.teacher-hero-actions{width:100%;margin-left:0;justify-content:flex-start}.teacher-hero-actions .filters{flex:1}.assignment-search-wrap{flex:1;width:auto}.stats{grid-template-columns:repeat(2,1fr)}}
            @media(max-width:650px){.question-builder-head{align-items:flex-start;flex-direction:column}.question-builder-actions{width:100%;flex-wrap:wrap}.question-builder-actions .template-excel-btn,.question-builder-actions .import-excel-btn{flex:1;justify-content:center}.premium-select-menu{max-height:190px}.hero{padding:17px}.teacher-hero-actions{align-items:stretch;flex-direction:column}.teacher-hero-actions .filters{width:100%;flex-wrap:wrap}.teacher-hero-actions>.primary{width:100%;justify-content:center}.panel-head{align-items:flex-start;flex-direction:column}.filters{width:100%;flex-wrap:wrap}.assignment-search-wrap{width:100%;flex-basis:100%}.premium-filter{width:100%;flex-basis:100%}.assignment-pagination{width:100%;margin-left:0;justify-content:flex-start;flex-wrap:wrap}.page-size-control{margin-left:0}.assignment-pagination-footer{align-items:flex-start;flex-direction:column}.stats{grid-template-columns:1fr}.table th{font-size:10px}.table td{font-size:12px}}
            @media(prefers-reduced-motion:reduce){.premium-select-trigger,.premium-select-menu,.premium-select-chevron,.premium-select-option,.question-builder-actions button,.filters .search.assignment-search,.premium-filter-trigger,.premium-filter-menu,.premium-filter-option,.page-nav-btn,.page-number-btn,.page-size-trigger,.page-size-menu,.page-size-option{transition:none!important}}
        `;
        doc.head.appendChild(style);

        const heroHead = doc.querySelector('.hero .hero-head');
        const panelFilters = doc.querySelector('.panel .panel-head .filters');
        const createButton = heroHead && heroHead.querySelector('.primary');
        if (heroHead && panelFilters && createButton && !heroHead.querySelector('.teacher-hero-actions')) {
            const actionBar = doc.createElement('div');
            actionBar.className = 'teacher-hero-actions';
            actionBar.appendChild(panelFilters);
            actionBar.appendChild(createButton);
            heroHead.appendChild(actionBar);
        }

        const icons = {
            newTopic: '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"></path><path d="M4 5.5v16M8 7h8M8 11h6"></path></svg>',
            newAudience: '<svg viewBox="0 0 24 24"><path d="M16 20v-1.6A3.4 3.4 0 0 0 12.6 15H6.4A3.4 3.4 0 0 0 3 18.4V20"></path><circle cx="9.5" cy="8" r="3.5"></circle><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 15.2a3.4 3.4 0 0 1 3 3.4V20"></path></svg>',
            newDuration: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2.6 1.6M9 3h6"></path></svg>'
        };
        const chevron = '<svg class="premium-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 10 5 5 5-5" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
        const check = '<span class="premium-select-check"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"></path></svg></span>';
        const widgets = [];

        function closeMenus(except) {
            widgets.forEach(function (widget) {
                if (widget !== except) {
                    widget.classList.remove('open');
                    widget.querySelector('.premium-select-trigger').setAttribute('aria-expanded', 'false');
                }
            });
        }

        ['newTopic', 'newAudience', 'newDuration'].forEach(function (id) {
            const select = doc.getElementById(id);
            if (!select || select.dataset.premiumReady) return;
            if (id === 'newDuration' && !Array.from(select.options).some(function (option) { return option.value === 'custom'; })) {
                const customOption = doc.createElement('option');
                customOption.value = 'custom';
                customOption.textContent = 'Tự chọn thời gian';
                select.appendChild(customOption);
            }
            select.dataset.premiumReady = '1';
            select.classList.add('premium-select-native');
            const field = select.closest('.field');
            if (field) field.classList.add('premium-field');

            const widget = doc.createElement('div');
            widget.className = 'premium-select';
            const trigger = doc.createElement('button');
            trigger.type = 'button';
            trigger.className = 'premium-select-trigger';
            trigger.setAttribute('aria-haspopup', 'listbox');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.setAttribute('aria-label', 'Mở danh sách ' + ((field && field.querySelector('label')) ? field.querySelector('label').textContent.trim() : id));
            trigger.innerHTML = '<span class="premium-select-icon">' + icons[id] + '</span><span class="premium-select-value"></span>' + chevron;

            const menu = doc.createElement('div');
            menu.className = 'premium-select-menu';
            menu.setAttribute('role', 'listbox');
            Array.from(select.options).forEach(function (option) {
                const item = doc.createElement('button');
                item.type = 'button';
                item.className = 'premium-select-option';
                item.setAttribute('role', 'option');
                item.dataset.value = option.value;
                item.innerHTML = check + '<span></span>';
                item.querySelector('span:last-child').textContent = option.textContent;
                item.addEventListener('click', function () {
                    select.value = option.value;
                    select.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
                    select.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
                    sync();
                    closeMenus();
                    trigger.focus();
                });
                menu.appendChild(item);
            });
            widget.appendChild(trigger);
            widget.appendChild(menu);
            select.insertAdjacentElement('afterend', widget);
            widgets.push(widget);

            function sync() {
                const current = select.options[select.selectedIndex] || select.options[0];
                trigger.querySelector('.premium-select-value').textContent = current ? current.textContent : '';
                menu.querySelectorAll('.premium-select-option').forEach(function (item) {
                    item.setAttribute('aria-selected', String(current && item.dataset.value === current.value));
                });
            }
            trigger.addEventListener('click', function () {
                const willOpen = !widget.classList.contains('open');
                closeMenus(widget);
                widget.classList.toggle('open', willOpen);
                trigger.setAttribute('aria-expanded', String(willOpen));
                if (willOpen) {
                    const selected = menu.querySelector('[aria-selected="true"]');
                    if (selected) selected.scrollIntoView({ block: 'nearest' });
                }
            });
            trigger.addEventListener('keydown', function (event) {
                if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                    if (!widget.classList.contains('open')) {
                        event.preventDefault();
                        trigger.click();
                        const selected = menu.querySelector('[aria-selected="true"]') || menu.firstElementChild;
                        if (selected) selected.focus();
                    }
                }
            });
            select.addEventListener('change', sync);
            sync();
        });

        const deadlineInput = doc.getElementById('newDeadline');
        if (deadlineInput && !deadlineInput.dataset.premiumReady) {
            deadlineInput.dataset.premiumReady = '1';
            deadlineInput.classList.add('premium-deadline-input');
            deadlineInput.setAttribute('aria-label', 'Chọn ngày và giờ hết hạn nộp bài');
            deadlineInput.readOnly = true;
            deadlineInput.setAttribute('inputmode', 'none');
            const deadlineField = deadlineInput.closest('.field');
            if (deadlineField) deadlineField.classList.add('premium-field', 'premium-deadline-field');

            const picker = doc.createElement('div');
            picker.className = 'premium-datetime-picker';
            picker.setAttribute('role', 'dialog');
            picker.setAttribute('aria-label', 'Chọn thời hạn nộp bài');
            picker.innerHTML = `
                <div class="premium-datetime-inner">
                    <div class="premium-datetime-head">
                        <div class="premium-datetime-title"></div>
                        <div class="premium-calendar-nav">
                            <button type="button" data-calendar-nav="prev" aria-label="Tháng trước"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"></path></svg></button>
                            <button type="button" data-calendar-nav="next" aria-label="Tháng sau"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"></path></svg></button>
                        </div>
                    </div>
                    <div class="premium-calendar-weekdays"><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span></div>
                    <div class="premium-calendar-grid"></div>
                    <div class="premium-datetime-tools">
                        <div class="premium-time-row">
                            <span class="premium-time-label"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle><path d="M12 8v5l3 2"></path></svg>Thời gian</span>
                            <div class="premium-time-inputs">
                                <div class="premium-time-dropdown" data-time-dropdown="hour"><select class="premium-time-hour premium-time-native" aria-label="Giờ"></select><button type="button" class="premium-time-trigger" aria-haspopup="listbox" aria-expanded="false"><span class="premium-time-value">00</span><svg class="premium-time-chevron" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"></path></svg></button><div class="premium-time-menu" role="listbox"></div></div>
                                <span class="premium-time-separator">:</span>
                                <div class="premium-time-dropdown" data-time-dropdown="minute"><select class="premium-time-minute premium-time-native" aria-label="Phút"></select><button type="button" class="premium-time-trigger" aria-haspopup="listbox" aria-expanded="false"><span class="premium-time-value">00</span><svg class="premium-time-chevron" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"></path></svg></button><div class="premium-time-menu" role="listbox"></div></div>
                            </div>
                        </div>
                        <div class="premium-datetime-actions">
                            <div class="premium-date-quick"><button type="button" data-date-quick="today">Hôm nay</button><button type="button" data-date-quick="tomorrow">Ngày mai</button></div>
                            <div class="premium-datetime-commit"><button type="button" class="premium-datetime-cancel">Hủy</button><button type="button" class="premium-datetime-apply">Xác nhận</button></div>
                        </div>
                    </div>
                </div>`;
            doc.body.appendChild(picker);

            const calendarTitle = picker.querySelector('.premium-datetime-title');
            const calendarGrid = picker.querySelector('.premium-calendar-grid');
            const hourSelect = picker.querySelector('.premium-time-hour');
            const minuteSelect = picker.querySelector('.premium-time-minute');
            const timeDropdowns = Array.from(picker.querySelectorAll('.premium-time-dropdown'));
            let selectedDate = new Date();
            let viewYear = selectedDate.getFullYear();
            let viewMonth = selectedDate.getMonth();

            function padDatePart(value) { return String(value).padStart(2, '0'); }
            function toDateKey(date) {
                return date.getFullYear() + '-' + padDatePart(date.getMonth() + 1) + '-' + padDatePart(date.getDate());
            }
            function toDateTimeValue(date) {
                return toDateKey(date) + 'T' + padDatePart(date.getHours()) + ':' + padDatePart(date.getMinutes());
            }
            function sameDate(a, b) {
                return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
            }
            function fillTimeSelects() {
                hourSelect.innerHTML = Array.from({ length: 24 }, function (_, hour) {
                    const value = padDatePart(hour);
                    return '<option value="' + value + '">' + value + '</option>';
                }).join('');
                minuteSelect.innerHTML = Array.from({ length: 60 }, function (_, minute) {
                    const value = padDatePart(minute);
                    return '<option value="' + value + '">' + value + '</option>';
                }).join('');
            }
            function closeTimeDropdowns(except) {
                timeDropdowns.forEach(function (dropdown) {
                    if (dropdown !== except) {
                        dropdown.classList.remove('open');
                        dropdown.querySelector('.premium-time-trigger').setAttribute('aria-expanded', 'false');
                    }
                });
            }
            function buildTimeDropdown(select) {
                const dropdown = select.closest('.premium-time-dropdown');
                const trigger = dropdown.querySelector('.premium-time-trigger');
                const valueLabel = dropdown.querySelector('.premium-time-value');
                const menu = dropdown.querySelector('.premium-time-menu');
                menu.innerHTML = '';

                Array.from(select.options).forEach(function (option) {
                    const item = doc.createElement('button');
                    item.type = 'button';
                    item.className = 'premium-time-option';
                    item.dataset.value = option.value;
                    item.textContent = option.textContent;
                    item.setAttribute('role', 'option');
                    item.addEventListener('click', function () {
                        select.value = option.value;
                        select.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
                        syncTimeDropdown(dropdown);
                        closeTimeDropdowns();
                        trigger.focus();
                    });
                    menu.appendChild(item);
                });

                trigger.addEventListener('click', function () {
                    const willOpen = !dropdown.classList.contains('open');
                    closeTimeDropdowns(dropdown);
                    dropdown.classList.toggle('open', willOpen);
                    trigger.setAttribute('aria-expanded', String(willOpen));
                    if (willOpen) {
                        const selected = menu.querySelector('[aria-selected="true"]');
                        if (selected) selected.scrollIntoView({ block: 'center' });
                    }
                });
                trigger.addEventListener('keydown', function (event) {
                    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (!dropdown.classList.contains('open')) trigger.click();
                        const selected = menu.querySelector('[aria-selected="true"]') || menu.firstElementChild;
                        if (selected) selected.focus();
                    }
                });
            }
            function syncTimeDropdown(dropdown) {
                const select = dropdown.querySelector('select');
                dropdown.querySelector('.premium-time-value').textContent = select.value || '00';
                dropdown.querySelectorAll('.premium-time-option').forEach(function (item) {
                    item.setAttribute('aria-selected', String(item.dataset.value === select.value));
                });
            }
            function syncTimeDropdowns() {
                timeDropdowns.forEach(syncTimeDropdown);
            }
            function syncTimeSelects() {
                hourSelect.value = padDatePart(selectedDate.getHours());
                minuteSelect.value = padDatePart(selectedDate.getMinutes());
                syncTimeDropdowns();
            }
            function renderCalendar() {
                const firstDay = new Date(viewYear, viewMonth, 1);
                const mondayOffset = (firstDay.getDay() + 6) % 7;
                const gridStart = new Date(viewYear, viewMonth, 1 - mondayOffset);
                const today = new Date();
                calendarTitle.textContent = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(firstDay);
                calendarGrid.innerHTML = '';
                for (let index = 0; index < 42; index += 1) {
                    const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
                    const button = doc.createElement('button');
                    button.type = 'button';
                    button.className = 'premium-calendar-day';
                    if (cellDate.getMonth() !== viewMonth) button.classList.add('outside');
                    if (sameDate(cellDate, today)) button.classList.add('today');
                    if (sameDate(cellDate, selectedDate)) button.classList.add('selected');
                    button.textContent = String(cellDate.getDate());
                    button.dataset.date = toDateKey(cellDate);
                    button.setAttribute('aria-label', new Intl.DateTimeFormat('vi-VN', { dateStyle: 'full' }).format(cellDate));
                    button.addEventListener('click', function () {
                        const parts = button.dataset.date.split('-').map(Number);
                        selectedDate = new Date(parts[0], parts[1] - 1, parts[2], Number(hourSelect.value), Number(minuteSelect.value));
                        viewYear = selectedDate.getFullYear();
                        viewMonth = selectedDate.getMonth();
                        renderCalendar();
                    });
                    calendarGrid.appendChild(button);
                }
            }
            function positionPicker() {
                if (!picker.classList.contains('open')) return;
                const rect = deadlineInput.getBoundingClientRect();
                const pickerWidth = Math.min(374, doc.defaultView.innerWidth - 24);
                const measuredHeight = picker.offsetHeight || 420;
                let left = Math.max(12, Math.min(rect.left, doc.defaultView.innerWidth - pickerWidth - 12));
                let top = rect.bottom + 8;
                if (top + measuredHeight > doc.defaultView.innerHeight - 10 && rect.top > measuredHeight + 18) top = rect.top - measuredHeight - 8;
                picker.style.left = left + 'px';
                picker.style.top = Math.max(10, top) + 'px';
            }
            function openPicker() {
                const parsed = deadlineInput.value ? new Date(deadlineInput.value) : new Date();
                selectedDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
                selectedDate.setSeconds(0, 0);
                viewYear = selectedDate.getFullYear();
                viewMonth = selectedDate.getMonth();
                syncTimeSelects();
                renderCalendar();
                picker.classList.add('open');
                positionPicker();
            }
            function closePicker() {
                closeTimeDropdowns();
                picker.classList.remove('open');
            }
            function chooseQuickDate(offset) {
                const quickDate = new Date();
                quickDate.setDate(quickDate.getDate() + offset);
                quickDate.setHours(Number(hourSelect.value), Number(minuteSelect.value), 0, 0);
                selectedDate = quickDate;
                viewYear = selectedDate.getFullYear();
                viewMonth = selectedDate.getMonth();
                renderCalendar();
            }

            fillTimeSelects();
            buildTimeDropdown(hourSelect);
            buildTimeDropdown(minuteSelect);
            syncTimeDropdowns();
            deadlineInput.addEventListener('click', function (event) { event.preventDefault(); openPicker(); });
            deadlineInput.addEventListener('keydown', function (event) {
                if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    openPicker();
                }
                if (event.key === 'Escape') closePicker();
            });
            picker.querySelector('[data-calendar-nav="prev"]').addEventListener('click', function () {
                viewMonth -= 1;
                if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
                renderCalendar();
            });
            picker.querySelector('[data-calendar-nav="next"]').addEventListener('click', function () {
                viewMonth += 1;
                if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
                renderCalendar();
            });
            picker.querySelector('[data-date-quick="today"]').addEventListener('click', function () { chooseQuickDate(0); });
            picker.querySelector('[data-date-quick="tomorrow"]').addEventListener('click', function () { chooseQuickDate(1); });
            picker.querySelector('.premium-datetime-cancel').addEventListener('click', closePicker);
            picker.querySelector('.premium-datetime-apply').addEventListener('click', function () {
                selectedDate.setHours(Number(hourSelect.value), Number(minuteSelect.value), 0, 0);
                deadlineInput.value = toDateTimeValue(selectedDate);
                deadlineInput.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
                deadlineInput.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
                closePicker();
                deadlineInput.focus();
            });
            doc.addEventListener('mousedown', function (event) {
                if (!event.target.closest('.premium-time-dropdown')) closeTimeDropdowns();
                if (picker.classList.contains('open') && !picker.contains(event.target) && event.target !== deadlineInput) closePicker();
            });
            doc.addEventListener('keydown', function (event) { if (event.key === 'Escape') { closeTimeDropdowns(); closePicker(); } });
            doc.addEventListener('scroll', positionPicker, true);
            doc.defaultView.addEventListener('resize', positionPicker);
        }

        const assignmentSearch = doc.getElementById('search');
        if (assignmentSearch && !assignmentSearch.closest('.assignment-search-wrap')) {
            const searchWrap = doc.createElement('div');
            searchWrap.className = 'assignment-search-wrap';
            const searchIcon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
            searchIcon.setAttribute('class', 'assignment-search-icon');
            searchIcon.setAttribute('viewBox', '0 0 24 24');
            searchIcon.innerHTML = '<circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path>';
            assignmentSearch.parentNode.insertBefore(searchWrap, assignmentSearch);
            searchWrap.appendChild(searchIcon);
            searchWrap.appendChild(assignmentSearch);
            assignmentSearch.classList.add('assignment-search');
            assignmentSearch.setAttribute('aria-label', 'Tìm kiếm bài tập');
        }

        const statusSelect = doc.getElementById('statusFilter');
        if (statusSelect && !statusSelect.dataset.premiumFilterReady) {
            statusSelect.dataset.premiumFilterReady = '1';
            statusSelect.classList.add('premium-filter-native');
            const filterWidget = doc.createElement('div');
            filterWidget.className = 'premium-filter';
            const filterTrigger = doc.createElement('button');
            filterTrigger.type = 'button';
            filterTrigger.className = 'premium-filter-trigger';
            filterTrigger.setAttribute('aria-haspopup', 'listbox');
            filterTrigger.setAttribute('aria-expanded', 'false');
            filterTrigger.setAttribute('aria-label', 'Lọc bài tập theo trạng thái');
            filterTrigger.innerHTML = '<span class="premium-filter-icon"><svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"></path></svg></span><span class="premium-filter-label"></span><svg class="premium-filter-chevron" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"></path></svg>';
            const filterMenu = doc.createElement('div');
            filterMenu.className = 'premium-filter-menu';
            filterMenu.setAttribute('role', 'listbox');

            Array.from(statusSelect.options).forEach(function (option) {
                const item = doc.createElement('button');
                item.type = 'button';
                item.className = 'premium-filter-option';
                item.dataset.value = option.value;
                item.setAttribute('role', 'option');
                item.innerHTML = '<span class="premium-filter-dot"></span><span></span>';
                item.querySelector('span:last-child').textContent = option.textContent;
                item.addEventListener('click', function () {
                    statusSelect.value = option.value;
                    statusSelect.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
                    statusSelect.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
                    syncFilter();
                    closeFilter();
                    filterTrigger.focus();
                });
                filterMenu.appendChild(item);
            });
            filterWidget.appendChild(filterTrigger);
            filterWidget.appendChild(filterMenu);
            statusSelect.insertAdjacentElement('afterend', filterWidget);

            function syncFilter() {
                const current = statusSelect.options[statusSelect.selectedIndex] || statusSelect.options[0];
                filterTrigger.querySelector('.premium-filter-label').textContent = current ? current.textContent : 'Bộ lọc';
                filterMenu.querySelectorAll('.premium-filter-option').forEach(function (item) {
                    item.setAttribute('aria-selected', String(current && item.dataset.value === current.value));
                });
            }
            function closeFilter() {
                filterWidget.classList.remove('open');
                filterTrigger.setAttribute('aria-expanded', 'false');
            }
            filterTrigger.addEventListener('click', function () {
                const willOpen = !filterWidget.classList.contains('open');
                closeMenus();
                filterWidget.classList.toggle('open', willOpen);
                filterTrigger.setAttribute('aria-expanded', String(willOpen));
                if (willOpen) {
                    const selected = filterMenu.querySelector('[aria-selected="true"]');
                    if (selected) selected.scrollIntoView({ block: 'nearest' });
                }
            });
            filterTrigger.addEventListener('keydown', function (event) {
                if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                    if (!filterWidget.classList.contains('open')) {
                        event.preventDefault();
                        filterTrigger.click();
                        const selected = filterMenu.querySelector('[aria-selected="true"]') || filterMenu.firstElementChild;
                        if (selected) selected.focus();
                    }
                }
            });
            statusSelect.addEventListener('change', syncFilter);
            doc.addEventListener('click', function (event) {
                if (!event.target.closest('.premium-filter')) closeFilter();
            });
            doc.addEventListener('keydown', function (event) {
                if (event.key === 'Escape') closeFilter();
            });
            syncFilter();
        }

        const taskPanel = doc.querySelector('.workspace .panel');
        const paginationHead = taskPanel && taskPanel.querySelector('.panel-head');
        const taskTableWrap = taskPanel && taskPanel.querySelector('.table-wrap');
        if (taskPanel && paginationHead && taskTableWrap && !doc.getElementById('assignmentPagination')) {
            const pageState = { current: 1, size: 10 };
            const pagination = doc.createElement('div');
            pagination.className = 'assignment-pagination';
            pagination.id = 'assignmentPagination';
            pagination.innerHTML = '<button class="page-nav-btn page-prev" type="button" aria-label="Trang trước"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"></path></svg></button><div class="page-number-list" style="display:flex;align-items:center;gap:6px"></div><button class="page-nav-btn page-next" type="button" aria-label="Trang sau"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"></path></svg></button><div class="page-size-control"><span>Hiển thị</span><div class="page-size-dropdown"><button class="page-size-trigger" type="button" aria-haspopup="listbox" aria-expanded="false"><span>10</span><svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"></path></svg></button><div class="page-size-menu" role="listbox"></div></div><span>dòng</span></div>';
            paginationHead.appendChild(pagination);

            const footer = doc.createElement('div');
            footer.className = 'assignment-pagination-footer';
            footer.innerHTML = '<span class="assignment-page-summary">Đang tải dữ liệu...</span><span class="assignment-page-indicator">Trang 1 / 1</span>';
            taskPanel.appendChild(footer);

            const previousButton = pagination.querySelector('.page-prev');
            const nextButton = pagination.querySelector('.page-next');
            const numberList = pagination.querySelector('.page-number-list');
            const sizeDropdown = pagination.querySelector('.page-size-dropdown');
            const sizeTrigger = pagination.querySelector('.page-size-trigger');
            const sizeMenu = pagination.querySelector('.page-size-menu');
            const summary = footer.querySelector('.assignment-page-summary');
            const indicator = footer.querySelector('.assignment-page-indicator');

            [5, 10, 20, 50].forEach(function (size) {
                const option = doc.createElement('button');
                option.type = 'button';
                option.className = 'page-size-option';
                option.dataset.value = String(size);
                option.setAttribute('role', 'option');
                option.textContent = String(size);
                option.addEventListener('click', function () {
                    pageState.size = size;
                    pageState.current = 1;
                    syncPageSize();
                    closePageSize();
                    applyPagination();
                    sizeTrigger.focus();
                });
                sizeMenu.appendChild(option);
            });

            function syncPageSize() {
                sizeTrigger.querySelector('span').textContent = String(pageState.size);
                sizeMenu.querySelectorAll('.page-size-option').forEach(function (option) {
                    option.setAttribute('aria-selected', String(Number(option.dataset.value) === pageState.size));
                });
            }
            function closePageSize() {
                sizeDropdown.classList.remove('open');
                sizeTrigger.setAttribute('aria-expanded', 'false');
            }
            function getPageSequence(totalPages) {
                if (totalPages <= 5) return Array.from({ length: totalPages }, function (_, index) { return index + 1; });
                const selected = [1, totalPages, pageState.current - 1, pageState.current, pageState.current + 1]
                    .filter(function (page) { return page >= 1 && page <= totalPages; })
                    .filter(function (page, index, list) { return list.indexOf(page) === index; })
                    .sort(function (a, b) { return a - b; });
                const sequence = [];
                selected.forEach(function (page, index) {
                    if (index && page - selected[index - 1] > 1) sequence.push('ellipsis-' + page);
                    sequence.push(page);
                });
                return sequence;
            }
            function renderPageNumbers(totalPages) {
                numberList.innerHTML = '';
                getPageSequence(totalPages).forEach(function (entry) {
                    if (typeof entry === 'string') {
                        const dots = doc.createElement('span');
                        dots.className = 'page-ellipsis';
                        dots.textContent = '…';
                        numberList.appendChild(dots);
                        return;
                    }
                    const button = doc.createElement('button');
                    button.type = 'button';
                    button.className = 'page-number-btn' + (entry === pageState.current ? ' active' : '');
                    button.textContent = String(entry);
                    button.setAttribute('aria-label', 'Trang ' + entry);
                    if (entry === pageState.current) button.setAttribute('aria-current', 'page');
                    button.addEventListener('click', function () {
                        pageState.current = entry;
                        applyPagination();
                    });
                    numberList.appendChild(button);
                });
            }
            function applyPagination(resetPage) {
                if (resetPage) pageState.current = 1;
                const tbody = doc.getElementById('taskRows');
                if (!tbody) return;
                const oldEmpty = tbody.querySelector('.assignment-filter-empty');
                if (oldEmpty) oldEmpty.remove();
                const allRows = Array.from(tbody.querySelectorAll('tr[data-task-id]'));
                const query = ((doc.getElementById('search') || {}).value || '').toLowerCase().trim();
                const status = ((doc.getElementById('statusFilter') || {}).value || '');
                const filteredRows = allRows.filter(function (row) {
                    const matchesText = !query || row.textContent.toLowerCase().includes(query);
                    const rowStatus = row.querySelector('.badge.gray') ? 'draft' : 'open';
                    return matchesText && (!status || rowStatus === status);
                });
                allRows.forEach(function (row) { row.style.display = 'none'; });
                const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageState.size));
                pageState.current = Math.min(Math.max(1, pageState.current), totalPages);
                const start = (pageState.current - 1) * pageState.size;
                const end = Math.min(start + pageState.size, filteredRows.length);
                filteredRows.slice(start, end).forEach(function (row) { row.style.display = ''; });

                if (allRows.length && !filteredRows.length) {
                    const emptyRow = doc.createElement('tr');
                    emptyRow.className = 'assignment-filter-empty';
                    emptyRow.innerHTML = '<td colspan="6"><div class="assignment-empty-icon"><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM8 9h8M8 13h5"></path></svg></div><b>Không tìm thấy bài tập</b><span>Thử thay đổi trạng thái hoặc từ khóa tìm kiếm.</span></td>';
                    tbody.appendChild(emptyRow);
                }

                previousButton.disabled = pageState.current <= 1;
                nextButton.disabled = pageState.current >= totalPages;
                renderPageNumbers(totalPages);
                summary.textContent = filteredRows.length ? 'Hiển thị ' + (start + 1) + '–' + end + ' trong ' + filteredRows.length + ' bài tập' : 'Không có dữ liệu phù hợp';
                indicator.textContent = 'Trang ' + pageState.current + ' / ' + totalPages;
            }

            previousButton.addEventListener('click', function () {
                if (pageState.current > 1) { pageState.current -= 1; applyPagination(); }
            });
            nextButton.addEventListener('click', function () {
                pageState.current += 1;
                applyPagination();
            });
            sizeTrigger.addEventListener('click', function () {
                const willOpen = !sizeDropdown.classList.contains('open');
                sizeDropdown.classList.toggle('open', willOpen);
                sizeTrigger.setAttribute('aria-expanded', String(willOpen));
            });
            doc.addEventListener('click', function (event) {
                if (!event.target.closest('.page-size-dropdown')) closePageSize();
            });
            doc.addEventListener('keydown', function (event) {
                if (event.key === 'Escape') closePageSize();
            });

            const teacherWindow = frame.contentWindow;
            const originalRenderTable = teacherWindow.renderTable;
            if (typeof originalRenderTable === 'function') {
                teacherWindow.renderTable = function () {
                    const result = originalRenderTable.apply(this, arguments);
                    pageState.current = 1;
                    applyPagination();
                    return result;
                };
            }
            teacherWindow.filterRows = function () {
                applyPagination(true);
            };
            syncPageSize();
            applyPagination();
        }

        doc.addEventListener('click', function (event) {
            if (!event.target.closest('.premium-select')) closeMenus();
        });
        doc.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') closeMenus();
        });
        const form = doc.getElementById('createForm');
        if (form) form.addEventListener('reset', function () {
            doc.defaultView.setTimeout(function () {
                form.querySelectorAll('select').forEach(function (select) {
                    select.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
                });
            }, 0);
        });
    }

    window.__loadEmbeddedPage = function (frame, key) {
        if (!frame || frame.dataset.loaded || frame.dataset.loading) return;
        if (key === 'feedbacks') return originalEmbeddedLoader(frame, key);
        frame.addEventListener('load', function () {
            installPremiumDeleteDialog(frame.contentWindow);
            if (key === 'teacher') enhanceTeacherWorkspace(frame);
            if (key === 'student') enhanceStudentWorkspace(frame);
            if (key === 'users') enhanceUsersWorkspace(frame);
        }, { once: true });
        return originalEmbeddedLoader(frame, key);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { installPremiumDeleteDialog(window); }, { once: true });
    } else {
        installPremiumDeleteDialog(window);
    }
})();
