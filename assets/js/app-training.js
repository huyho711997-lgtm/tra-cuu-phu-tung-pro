
// ============================================================
// ĐỒNG BỘ DỮ LIỆU ĐÀO TẠO THỰC TẾ (HỌC VIÊN & GIẢNG VIÊN)
// ============================================================
(function() {
    const TRAINING_ASSIGNMENTS_STORAGE_KEY = 'kgpt_shared_assignments_v1';
    const TRAINING_RESULTS_STORAGE_KEY = 'kgpt_student_quiz_results';
    const TRAINING_RESULT_HISTORY_STORAGE_KEY = 'kgpt_student_quiz_result_history';
    let trainingDatabaseLoaded = false;
    let trainingDatabaseLoadPromise = null;
    let trainingDatabaseUserId = '';
    let trainingDatabaseSyncVersion = 0;

    function getTrainingUserId() {
        return String(
            window.currentUserProfile?.uid ||
            window.auth?.currentUser?.uid ||
            ''
        );
    }

    function resetTrainingDatabaseSync(userId = '') {
        const nextUserId = String(userId || '');
        if (trainingDatabaseUserId === nextUserId) return;
        trainingDatabaseSyncVersion += 1;
        trainingDatabaseUserId = nextUserId;
        trainingDatabaseLoaded = false;
        trainingDatabaseLoadPromise = null;
    }

    // Được gọi từ showApp/hideApp nằm ở script module phía trên.
    window.resetTrainingDatabaseSync = resetTrainingDatabaseSync;

    function readTrainingLocalValue(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            return value === null ? fallback : value;
        } catch (error) {
            return fallback;
        }
    }

    function requestPremiumConfirmation(options, targetWindow = window) {
        const config = typeof options === 'string' ? { message: options } : (options || {});
        try {
            // Hộp thoại của bài thi phải nằm trong chính iframe bài thi. Khi iframe
            // đang fullscreen, mọi overlay được tạo ở trang cha đều có thể bị lớp
            // fullscreen che lên dù z-index rất lớn.
            if (targetWindow && typeof targetWindow.premiumConfirm === 'function') {
                return targetWindow.premiumConfirm(config);
            }
            if (typeof window.premiumConfirm === 'function') return window.premiumConfirm(config);
        } catch (error) {}
        return new Promise(resolve => {
            if (targetWindow && typeof targetWindow.customConfirm === 'function') {
                targetWindow.customConfirm(config.message || '', () => resolve(true));
            } else if (typeof window.customConfirm === 'function') window.customConfirm(config.message || '', () => resolve(true));
            else resolve(false);
        });
    }

    function showPremiumTrainingAlert(message, options = {}) {
        try {
            if (typeof window.premiumAlert === 'function') return window.premiumAlert(message, options);
        } catch (error) {}
        window.customAlert?.(String(message || ''), options.type || 'error');
        return Promise.resolve(true);
    }

    async function waitForTrainingDatabase() {
        for (let attempt = 0; attempt < 40; attempt += 1) {
            if (window.kgptTrainingDatabase?.isReady?.()) return window.kgptTrainingDatabase;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('Vui lòng đăng nhập trước khi đồng bộ dữ liệu bài tập.');
    }

    async function loadTrainingDataFromDatabase(force = false) {
        const requestedUserId = getTrainingUserId();
        if (!requestedUserId) {
            throw new Error('Vui lòng đăng nhập trước khi đồng bộ dữ liệu bài tập.');
        }
        if (trainingDatabaseUserId !== requestedUserId) {
            resetTrainingDatabaseSync(requestedUserId);
        }
        if (force) {
            trainingDatabaseSyncVersion += 1;
            trainingDatabaseLoaded = false;
            trainingDatabaseLoadPromise = null;
        }
        if (trainingDatabaseLoaded) return;
        if (trainingDatabaseLoadPromise) return trainingDatabaseLoadPromise;
        const requestVersion = trainingDatabaseSyncVersion;
        const requestPromise = (async () => {
            const store = await waitForTrainingDatabase();
            // Clear stale answer-bearing data left by an older version before a
            // learner session loads its server-sanitized assignment metadata.
            const profileRole = window.currentUserProfile?.role || '';
            if (profileRole !== 'admin' && profileRole !== 'teacher') {
                localStorage.removeItem(TRAINING_ASSIGNMENTS_STORAGE_KEY);
                localStorage.removeItem(TRAINING_RESULTS_STORAGE_KEY);
                localStorage.removeItem(TRAINING_RESULT_HISTORY_STORAGE_KEY);
            }
            const databaseData = await store.load();
            // Nếu user đã đăng xuất/đổi tài khoản trong khi RPC đang chạy thì
            // bỏ kết quả cũ, tránh ghi nhầm bài tập vào phiên đăng nhập mới.
            if (requestVersion !== trainingDatabaseSyncVersion || requestedUserId !== getTrainingUserId()) {
                return;
            }
            // Server data is authoritative. Never upload legacy local scores or
            // answer-bearing assignment caches as an automatic fallback.
            localStorage.setItem(
                TRAINING_ASSIGNMENTS_STORAGE_KEY,
                JSON.stringify(Array.isArray(databaseData.assignments) ? databaseData.assignments : [])
            );
            localStorage.setItem(
                TRAINING_RESULTS_STORAGE_KEY,
                JSON.stringify(databaseData.results && typeof databaseData.results === 'object' && !Array.isArray(databaseData.results) ? databaseData.results : {})
            );
            localStorage.setItem(
                TRAINING_RESULT_HISTORY_STORAGE_KEY,
                JSON.stringify(Array.isArray(databaseData.resultHistory) ? databaseData.resultHistory : [])
            );

            trainingDatabaseLoaded = true;
            setTimeout(() => window.renderTrainingLeaderboard?.(), 0);
        })();
        trainingDatabaseLoadPromise = requestPromise;
        try {
            return await requestPromise;
        } catch (error) {
            console.error('Không tải được dữ liệu đào tạo từ Supabase:', error);
            throw error;
        } finally {
            if (trainingDatabaseLoadPromise === requestPromise) {
                trainingDatabaseLoadPromise = null;
            }
        }
    }

    const escapeCompetitionHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const normalizeCompetitionText = value => String(value || '').trim().toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    const competitionInitials = value => {
        const words = String(value || 'HV').trim().split(/\s+/).filter(Boolean);
        return (words.length > 1 ? words.slice(-2) : words).map(word => word.charAt(0)).join('').toLocaleUpperCase('vi-VN') || 'HV';
    };
    const getCompetitionTimestamp = item => {
        const value = item?.completedAt || item?.submittedAt || item?.updatedAt || item?.createdAt || '';
        if (value && typeof value === 'object') {
            const seconds = Number(value.seconds ?? value._seconds);
            if (Number.isFinite(seconds)) return seconds * 1000;
        }
        const timestamp = new Date(value).getTime();
        return Number.isFinite(timestamp) ? timestamp : 0;
    };
    const getCompetitionUserKey = item => {
        const userId = String(item?.userId || item?.studentId || item?.uid || '').trim();
        const email = String(item?.studentEmail || item?.email || '').trim().toLowerCase();
        const name = normalizeCompetitionText(item?.studentName || item?.fullName || item?.name || 'Học viên');
        return userId ? `id:${userId}` : (email ? `email:${email}` : `name:${name}`);
    };

    function collectCompetitionAttempts() {
        const assignments = readTrainingLocalValue(TRAINING_ASSIGNMENTS_STORAGE_KEY, []);
        const currentResults = readTrainingLocalValue(TRAINING_RESULTS_STORAGE_KEY, {});
        const history = readTrainingLocalValue(TRAINING_RESULT_HISTORY_STORAGE_KEY, []);
        const attempts = [];
        const pushAttempt = (item, fallbackTaskId = '') => {
            if (!item || typeof item !== 'object') return;
            const taskId = String(item.taskId || item.assignmentId || fallbackTaskId || '').trim();
            if (!taskId) return;
            attempts.push({ ...item, taskId, score: Math.max(0, Math.min(10, Number(item.score) || 0)) });
        };
        Object.entries(currentResults && typeof currentResults === 'object' && !Array.isArray(currentResults) ? currentResults : {}).forEach(([taskId, value]) => {
            if (Array.isArray(value)) value.forEach(item => pushAttempt(item, taskId));
            else if (value && typeof value === 'object' && ('score' in value || 'studentName' in value || 'completedAt' in value)) pushAttempt(value, taskId);
            else if (value && typeof value === 'object') Object.values(value).forEach(item => pushAttempt(item, taskId));
        });
        (Array.isArray(history) ? history : []).forEach(item => pushAttempt(item));
        const unique = new Map();
        attempts.forEach(item => {
            const key = String(item.attemptId || item.id || [item.taskId, getCompetitionUserKey(item), getCompetitionTimestamp(item), item.score].join('|'));
            if (!unique.has(key) || getCompetitionTimestamp(item) >= getCompetitionTimestamp(unique.get(key))) unique.set(key, item);
        });
        return {
            assignments: Array.isArray(assignments) ? assignments : [],
            attempts: Array.from(unique.values())
        };
    }

    function buildCompetitionRows(attempts) {
        const grouped = new Map();
        attempts.forEach(item => {
            const userKey = getCompetitionUserKey(item);
            if (!grouped.has(userKey)) grouped.set(userKey, { key: userKey, attempts: [] });
            grouped.get(userKey).attempts.push(item);
        });
        const profile = window.currentUserProfile || {};
        const profileIds = new Set([
            profile.uid ? `id:${String(profile.uid)}` : '',
            profile.email ? `email:${String(profile.email).trim().toLowerCase()}` : '',
            profile.fullName ? `name:${normalizeCompetitionText(profile.fullName)}` : ''
        ].filter(Boolean));
        const rows = Array.from(grouped.values()).map(group => {
            const bestByTask = new Map();
            group.attempts.forEach(item => {
                const current = bestByTask.get(item.taskId);
                if (!current || item.score > current.score || (item.score === current.score && getCompetitionTimestamp(item) > getCompetitionTimestamp(current))) bestByTask.set(item.taskId, item);
            });
            const bestResults = Array.from(bestByTask.values());
            const newest = [...group.attempts].sort((a, b) => getCompetitionTimestamp(b) - getCompetitionTimestamp(a))[0] || {};
            const scores = bestResults.map(item => Number(item.score) || 0);
            const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
            const highest = scores.length ? Math.max(...scores) : 0;
            const passed = scores.filter(score => score >= 7).length;
            const userKeys = new Set(group.attempts.flatMap(item => {
                const keys = [getCompetitionUserKey(item)];
                if (item.userId || item.studentId || item.uid) keys.push(`id:${String(item.userId || item.studentId || item.uid)}`);
                if (item.studentEmail || item.email) keys.push(`email:${String(item.studentEmail || item.email).trim().toLowerCase()}`);
                if (item.studentName || item.fullName || item.name) keys.push(`name:${normalizeCompetitionText(item.studentName || item.fullName || item.name)}`);
                return keys;
            }));
            return {
                key: group.key,
                name: String(newest.studentName || newest.fullName || newest.name || 'Học viên').trim() || 'Học viên',
                email: String(newest.studentEmail || newest.email || '').trim(),
                average,
                highest,
                completed: bestResults.length,
                passed,
                passRate: bestResults.length ? passed * 100 / bestResults.length : 0,
                latestAt: Math.max(0, ...group.attempts.map(getCompetitionTimestamp)),
                isCurrent: Array.from(profileIds).some(key => userKeys.has(key))
            };
        });
        rows.sort((a, b) => b.average - a.average || b.completed - a.completed || b.highest - a.highest || a.latestAt - b.latestAt || a.name.localeCompare(b.name, 'vi'));
        rows.forEach((row, index) => { row.rank = index + 1; });
        return rows;
    }

    function updateCompetitionTaskFilter(assignments) {
        const select = document.getElementById('competitionTaskFilter');
        if (!select) return;
        const previousValue = select.value || 'all';
        const options = ['<option value="all">Tất cả bài tập</option>'].concat(assignments.map(item => `<option value="${escapeCompetitionHtml(item.id)}">${escapeCompetitionHtml(item.title || item.topic || 'Bài tập')}</option>`));
        select.innerHTML = options.join('');
        select.value = Array.from(select.options).some(option => option.value === previousValue) ? previousValue : 'all';
        window.KGPTPremiumDropdown?.sync?.(select);
    }

    function renderCompetitionPodium(rows) {
        const podium = document.getElementById('competitionPodium');
        if (!podium) return;
        const top = rows.slice(0, 3);
        podium.className = `competition-podium count-${top.length}`;
        if (!top.length) {
            podium.innerHTML = '<div class="competition-podium-empty"><svg fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path d="M8 4h8v3.5a4 4 0 0 1-8 0V4ZM8 6H5v1.5A3.5 3.5 0 0 0 8.5 11M16 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 12v4m-3 4h6" stroke-linecap="round" stroke-linejoin="round"/></svg><strong>Chưa có dữ liệu thi đua</strong><span>Kết quả sẽ xuất hiện sau khi học viên hoàn thành bài trắc nghiệm.</span></div>';
            return;
        }
        const rankClass = ['first', 'second', 'third'];
        podium.innerHTML = top.map((row, index) => `<div class="competition-podium-item ${rankClass[index]}"><div class="competition-podium-avatar">${escapeCompetitionHtml(competitionInitials(row.name))}<span class="competition-rank-badge">${index + 1}</span></div><div class="competition-podium-name" title="${escapeCompetitionHtml(row.name)}">${escapeCompetitionHtml(row.name)}</div><div class="competition-podium-score">${row.average.toFixed(1)} điểm</div><div class="competition-podium-base">${row.completed} bài hoàn thành</div></div>`).join('');
    }

    function updateCompetitionCurrentUser(rows, assignmentCount) {
        const container = document.getElementById('competitionCurrentUser');
        const current = rows.find(row => row.isCurrent);
        if (container) {
            container.innerHTML = current
                ? `<div class="competition-current-kicker">Thành tích của bạn</div><div class="competition-current-row"><div class="competition-current-rank">#${current.rank}</div><div class="competition-current-copy"><strong>${escapeCompetitionHtml(current.name)}</strong><span>${current.average.toFixed(1)} điểm · ${current.completed} bài hoàn thành</span></div></div>`
                : '<div class="competition-current-kicker">Thành tích của bạn</div><div class="competition-current-row"><div class="competition-current-rank">—</div><div class="competition-current-copy"><strong>Chưa có thứ hạng</strong><span>Hãy hoàn thành bài trắc nghiệm đầu tiên</span></div></div>';
        }
        const completed = current?.completed || 0;
        const percent = assignmentCount ? Math.min(100, Math.round(completed * 100 / assignmentCount)) : 0;
        const progressText = document.getElementById('competitionProgressText');
        const progressPercent = document.getElementById('competitionProgressPercent');
        const progressFill = document.getElementById('competitionProgressFill');
        if (progressText) progressText.textContent = `${completed} / ${assignmentCount} bài`;
        if (progressPercent) progressPercent.textContent = `${percent}%`;
        if (progressFill) progressFill.style.width = `${percent}%`;
    }

    function renderTrainingLeaderboard() {
        const section = document.getElementById('trainingRankingSection');
        if (!section) return;
        const data = collectCompetitionAttempts();
        updateCompetitionTaskFilter(data.assignments);
        const taskFilter = document.getElementById('competitionTaskFilter')?.value || 'all';
        const periodFilter = document.getElementById('competitionPeriodFilter')?.value || 'all';
        const search = normalizeCompetitionText(document.getElementById('competitionSearchInput')?.value || '');
        const cutoff = periodFilter === 'all' ? 0 : Date.now() - Number(periodFilter) * 86400000;
        const filteredAttempts = data.attempts.filter(item => (taskFilter === 'all' || String(item.taskId) === taskFilter) && (!cutoff || getCompetitionTimestamp(item) >= cutoff));
        const rankedRows = buildCompetitionRows(filteredAttempts);
        const tableRows = search ? rankedRows.filter(row => normalizeCompetitionText(row.name).includes(search)) : rankedRows;
        const totalBestResults = rankedRows.reduce((sum, row) => sum + row.completed, 0);
        const average = rankedRows.length ? rankedRows.reduce((sum, row) => sum + row.average, 0) / rankedRows.length : 0;
        const passed = rankedRows.reduce((sum, row) => sum + row.passed, 0);
        const metrics = {
            competitionParticipantCount: rankedRows.length,
            competitionAverageScore: average.toFixed(1),
            competitionPassRate: `${totalBestResults ? Math.round(passed * 100 / totalBestResults) : 0}%`,
            competitionCompletionCount: totalBestResults
        };
        Object.entries(metrics).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.textContent = value; });
        renderCompetitionPodium(rankedRows);
        updateCompetitionCurrentUser(rankedRows, taskFilter === 'all' ? data.assignments.length : 1);
        const rows = document.getElementById('competitionRankingRows');
        const empty = document.getElementById('competitionTableEmpty');
        const table = rows?.closest('table');
        if (rows) {
            rows.innerHTML = tableRows.map(row => {
                const rankClass = row.rank <= 3 ? ` top-${row.rank}` : '';
                const passedClass = row.passRate >= 70 ? '' : ' low';
                const updated = row.latestAt ? new Date(row.latestAt).toLocaleDateString('vi-VN') : '—';
                const identity = row.isCurrent ? 'Bạn · Học viên' : 'Học viên';
                return `<tr class="${row.isCurrent ? 'is-current' : ''}"><td><div class="competition-rank-cell"><span class="competition-rank-number${rankClass}">${row.rank}</span></div></td><td><div class="competition-person"><div class="competition-person-avatar">${escapeCompetitionHtml(competitionInitials(row.name))}</div><div class="competition-person-copy"><strong>${escapeCompetitionHtml(row.name)}</strong><small>${escapeCompetitionHtml(identity)}</small></div></div></td><td><span class="competition-score">${row.average.toFixed(1)} <small>/ 10</small></span></td><td><span class="competition-complete">${row.completed} bài</span></td><td><b>${row.highest.toFixed(1)}</b> / 10</td><td><span class="competition-pass${passedClass}">${Math.round(row.passRate)}% đạt</span></td><td><span class="competition-updated">${updated}</span></td></tr>`;
            }).join('');
        }
        if (empty) empty.style.display = tableRows.length ? 'none' : 'block';
        if (table) table.style.display = tableRows.length ? 'table' : 'none';
        const taskName = taskFilter === 'all' ? 'tất cả bài tập' : (data.assignments.find(item => String(item.id) === taskFilter)?.title || 'bài tập đã chọn');
        const subtitle = document.getElementById('competitionTableSubtitle');
        const info = document.getElementById('competitionResultInfo');
        if (subtitle) subtitle.textContent = `Xếp hạng theo ${taskName} · dùng điểm tốt nhất của mỗi bài`;
        if (info) info.textContent = tableRows.length ? `Hiển thị ${tableRows.length} / ${rankedRows.length} học viên · Cập nhật ${new Date().toLocaleString('vi-VN')}` : 'Chưa có kết quả phù hợp với bộ lọc hiện tại.';
    }

    async function refreshTrainingLeaderboard() {
        const button = document.getElementById('competitionRefreshButton');
        if (button) { button.disabled = true; button.classList.add('is-loading'); }
        try {
            await loadTrainingDataFromDatabase(true);
            renderTrainingLeaderboard();
        } catch (error) {
            console.error('Không cập nhật được bảng xếp hạng:', error);
            showPremiumTrainingAlert(error.message || 'Không thể cập nhật bảng xếp hạng lúc này.', { title: 'Đồng bộ thất bại' });
        } finally {
            if (button) { button.disabled = false; button.classList.remove('is-loading'); }
        }
    }

    window.renderTrainingLeaderboard = renderTrainingLeaderboard;
    window.refreshTrainingLeaderboard = refreshTrainingLeaderboard;

    async function saveAssignmentsToDatabase() {
        try {
            await loadTrainingDataFromDatabase();
            const store = await waitForTrainingDatabase();
            const assignments = readTrainingLocalValue(TRAINING_ASSIGNMENTS_STORAGE_KEY, []);
            await store.saveAssignments(Array.isArray(assignments) ? assignments : []);
        } catch (error) {
            console.error('Không lưu được bài tập vào Supabase:', error);
        }
    }

    async function saveResultsToDatabase() {
        try {
            // Never trust a browser-created score. Refresh the signed-in user's
            // authoritative result after the server has graded the attempt.
            await loadTrainingDataFromDatabase(true);
        } catch (error) {
            console.error('Không tải lại được kết quả đã chấm từ Supabase:', error);
        }
    }

    async function saveResultHistoryToDatabase() {
        try {
            await loadTrainingDataFromDatabase(true);
        } catch (error) {
            console.error('Không tải lại được lịch sử làm bài từ Supabase:', error);
        }
    }

    function getRealAppUser() {
        const name = (
            window.currentUserProfile?.fullName ||
            (window.auth?.currentUser?.displayName) ||
            document.getElementById('userDisplayName')?.textContent ||
            'Hồ Quang Huy'
        ).trim();
        const role = window.currentUserProfile?.role === 'admin'
            ? 'Quản trị viên'
            : (window.currentUserProfile?.role === 'teacher' ? 'Giảng viên' : 'Giám định viên');
        const email = (
            window.currentUserProfile?.email ||
            window.auth?.currentUser?.email ||
            ''
        ).trim();
        return {
            fullName: name,
            role: role,
            email: email,
            avatar: (name.charAt(0) || 'U').toLocaleUpperCase('vi-VN')
        };
    }

    function dispatchUserToFrames() {
        const user = getRealAppUser();
        const tFrame = document.getElementById('teacherLearningFrame');
        const sFrame = document.getElementById('studentLearningFrame');

        if (tFrame?.contentWindow) {
            try { tFrame.contentWindow.postMessage({ type: 'kgpt:sync-user', user }, '*'); } catch (e) {}
        }
        if (sFrame?.contentWindow) {
            try { sFrame.contentWindow.postMessage({ type: 'kgpt:sync-user', user }, '*'); } catch (e) {}
        }
    }

    function dispatchAssignmentsRefresh() {
        const tFrame = document.getElementById('teacherLearningFrame');
        const sFrame = document.getElementById('studentLearningFrame');

        if (tFrame?.contentWindow) {
            try { tFrame.contentWindow.postMessage({ type: 'kgpt:refresh-assignments' }, '*'); } catch (e) {}
        }
        if (sFrame?.contentWindow) {
            try { sFrame.contentWindow.postMessage({ type: 'kgpt:refresh-assignments' }, '*'); } catch (e) {}
        }
    }

    async function syncTrainingWorkspace() {
        if (!getTrainingUserId()) return;
        dispatchUserToFrames();
        await loadTrainingDataFromDatabase();
        dispatchAssignmentsRefresh();
        // Một lượt dự phòng ngắn cho trường hợp iframe vừa hoàn tất srcdoc và
        // đăng ký message listener ngay sau lần dispatch đầu tiên.
        setTimeout(dispatchAssignmentsRefresh, 120);
    }

    window.isStudentQuizInProgress = function() {
        const frame = document.getElementById('studentLearningFrame');
        const doc = frame?.contentDocument;
        return !!(doc?.getElementById('quiz')?.classList.contains('active') && !doc?.getElementById('resultModal')?.classList.contains('open'));
    };

    function deactivateStudentExamSecurity() {
        const frame = document.getElementById('studentLearningFrame');
        const frameWindow = frame?.contentWindow;
        const frameDoc = frame?.contentDocument;
        if (frameWindow) frameWindow.__kgptExamSecurityActive = false;
        frameDoc?.getElementById('quiz')?.classList.remove('kgpt-secure-exam', 'kgpt-capture-blocked');
        if (document.fullscreenElement === frame) document.exitFullscreen?.().catch(() => {});
    }

    function activateStudentExamSecurity(requestFullscreen = false) {
        const frame = document.getElementById('studentLearningFrame');
        const frameWindow = frame?.contentWindow;
        const frameDoc = frame?.contentDocument;
        const quiz = frameDoc?.getElementById('quiz');
        if (!frameWindow || !frameDoc || !quiz || !quiz.classList.contains('active')) return;
        frameWindow.__kgptExamSecurityActive = true;
        quiz.classList.add('kgpt-secure-exam');

        if (!frameDoc.getElementById('kgptExamSecurityStyle')) {
            const style = frameDoc.createElement('style');
            style.id = 'kgptExamSecurityStyle';
            style.textContent = '#quiz.kgpt-secure-exam{position:relative}.kgpt-secure-watermark{position:fixed;inset:0;z-index:9990;display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:90px;align-content:center;gap:24px;overflow:hidden;pointer-events:none;opacity:.055;color:#1d4ed8;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.kgpt-secure-watermark span{display:flex;align-items:center;justify-content:center;white-space:nowrap;transform:rotate(-24deg)}#quiz.kgpt-capture-blocked:after{content:"Chụp màn hình không được phép";position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:#081426;color:#fff;font-size:16px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}#quiz.kgpt-capture-blocked .quiz-shell{filter:blur(22px)}';
            frameDoc.head.appendChild(style);
        }
        let watermark = frameDoc.querySelector('.kgpt-secure-watermark');
        if (!watermark) {
            watermark = frameDoc.createElement('div');
            watermark.className = 'kgpt-secure-watermark';
            const identity = (frameDoc.getElementById('studentFullName')?.textContent || document.getElementById('userDisplayName')?.textContent || 'Học viên').trim();
            Array.from({ length: 18 }).forEach(() => {
                const mark = frameDoc.createElement('span');
                mark.textContent = `${identity} · KHO GIÁ PHỤ TÙNG`;
                watermark.appendChild(mark);
            });
            quiz.appendChild(watermark);
        }

        if (!frameWindow.__kgptExamListenersInstalled) {
            frameWindow.__kgptExamListenersInstalled = true;
            const forceSubmitOnLeave = () => {
                if (!frameWindow.__kgptExamSecurityActive || !window.isStudentQuizInProgress?.() || frameWindow.__kgptSecuritySubmitting) return;
                frameWindow.__kgptSecuritySubmitting = true;
                frameWindow.showToast?.('Bạn đã rời màn hình làm bài. Hệ thống tự động nộp bài hiện tại.');
                try { frameWindow.submitQuiz?.(true); } finally { setTimeout(() => { frameWindow.__kgptSecuritySubmitting = false; }, 800); }
            };
            frameDoc.addEventListener('visibilitychange', () => { if (frameDoc.hidden) forceSubmitOnLeave(); });
            frameWindow.addEventListener('blur', () => setTimeout(() => {
                if (!frameDoc.hasFocus()) forceSubmitOnLeave();
            }, 180));
            frameDoc.addEventListener('keydown', event => {
                if (!frameWindow.__kgptExamSecurityActive) return;
                const key = String(event.key || '').toLowerCase();
                const captureShortcut = key === 'printscreen' || (event.ctrlKey && event.shiftKey && (key === 's' || key === 'i'));
                if (!captureShortcut) return;
                event.preventDefault();
                event.stopPropagation();
                quiz.classList.add('kgpt-capture-blocked');
                frameWindow.showToast?.('Không cho phép chụp màn hình trong thời gian làm bài.');
                setTimeout(() => quiz.classList.remove('kgpt-capture-blocked'), 1300);
                navigator.clipboard?.writeText('').catch(() => {});
            }, true);
        }

        if (requestFullscreen && document.fullscreenEnabled && !document.fullscreenElement) {
            frame.requestFullscreen?.().then(() => { frameWindow.__kgptFullscreenEntered = true; }).catch(() => {
                frameWindow.showToast?.('Vui lòng giữ nguyên cửa sổ này trong suốt thời gian làm bài.');
            });
        }
    }

    function enforceTeacherResultReview() {
        const frame = document.getElementById('teacherLearningFrame');
        const frameWindow = frame?.contentWindow;
        const frameDoc = frame?.contentDocument;
        if (!frameWindow || !frameDoc || !frameDoc.getElementById('resultsModal')) return;

        if (!frameDoc.getElementById('kgptResultReviewStyle')) {
            const style = frameDoc.createElement('style');
            style.id = 'kgptResultReviewStyle';
            style.textContent = '.kgpt-result-actions{display:flex;align-items:center;gap:7px;white-space:nowrap}.kgpt-view-result-btn,.kgpt-retake-btn{height:36px;padding:0 12px;border-radius:10px;font-size:9.5px;font-weight:800;cursor:pointer}.kgpt-view-result-btn{border:1px solid #bfd2f8;background:#f5f8ff;color:#2456c8}.kgpt-view-result-btn:hover{background:#eaf1ff;border-color:#85aaf2}.kgpt-retake-btn{border:0;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;box-shadow:0 10px 22px -13px #1d4ed8}.kgpt-learner-result-row{cursor:pointer;transition:background .18s}.kgpt-learner-result-row:hover{background:#f7faff}.kgpt-learner-result-row.is-open{background:#f3f7ff}.kgpt-learner-name{display:inline-flex;align-items:center;gap:7px;color:#172033}.kgpt-learner-name:after{content:"Xem";padding:3px 6px;border-radius:999px;background:#edf4ff;color:#315fc5;font-size:7.5px;font-weight:900;text-transform:uppercase}.kgpt-retake-count{display:inline-flex;align-items:center;justify-content:center;min-width:48px;padding:6px 9px;border:1px solid #d8e5fb;border-radius:999px;background:#f5f8ff;color:#315fc5;font-size:9px;font-weight:900}.kgpt-attempt-label{display:block;margin-top:4px;color:#8a96a8;font-size:8px;font-weight:700}.kgpt-result-detail-row[hidden]{display:none}.kgpt-result-detail-row td{padding:16px!important;background:#f8faff}.kgpt-answer-list{display:grid;gap:9px;margin-top:14px}.kgpt-answer-card{padding:12px 14px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}.kgpt-answer-card.correct{border-color:#b7ebcf;background:#f1fbf5}.kgpt-answer-card.wrong{border-color:#fecaca;background:#fff7f7}.kgpt-answer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px}.kgpt-answer-title{font-size:11px;font-weight:800;color:#172033;line-height:1.5}.kgpt-answer-state{flex:none;padding:5px 8px;border-radius:999px;font-size:8px;font-weight:900;text-transform:uppercase}.kgpt-answer-card.correct .kgpt-answer-state{color:#087a46;background:#dcfce7}.kgpt-answer-card.wrong .kgpt-answer-state{color:#b42318;background:#fee2e2}.kgpt-answer-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:9.5px;color:#526076}.kgpt-answer-meta span{padding:8px 10px;border-radius:9px;background:rgba(255,255,255,.78);border:1px solid rgba(203,213,225,.7)}.kgpt-answer-meta b{display:block;margin-bottom:3px;color:#334155}.kgpt-legacy-result{margin-top:14px;padding:13px 14px;border:1px solid #fde68a;border-radius:12px;background:#fffbeb;color:#92400e;font-size:10px;line-height:1.6}.kgpt-export-results-btn{height:42px;padding:0 15px;border:1px solid #bcd0f2;border-radius:12px;background:linear-gradient(180deg,#fff,#f4f8ff);color:#2456c8;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:10.5px;font-weight:850;cursor:pointer;box-shadow:0 10px 22px -19px #1d4ed8;transition:.18s}.kgpt-export-results-btn:hover{border-color:#84a9ed;background:#edf4ff;transform:translateY(-1px);box-shadow:0 14px 26px -19px #1d4ed8}.kgpt-export-results-btn svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.kgpt-export-results-btn.modal-export{height:36px;margin-left:auto;padding:0 12px;border-radius:10px;font-size:9.5px}.kgpt-export-assignment{color:#2563eb!important;border-color:#c8d9f5!important;background:#f6f9ff!important}.kgpt-export-assignment:hover{background:#eaf2ff!important;border-color:#8fb0eb!important}.kgpt-export-assignment svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}@media(max-width:650px){.kgpt-answer-meta{grid-template-columns:1fr}.kgpt-result-actions{flex-direction:column;align-items:stretch}.kgpt-export-results-btn span{display:none}.kgpt-export-results-btn{width:42px;padding:0}}';
            frameDoc.head.appendChild(style);
        }

        if (!frameDoc.getElementById('kgptQuestionSamplingStyle')) {
            const samplingStyle = frameDoc.createElement('style');
            samplingStyle.id = 'kgptQuestionSamplingStyle';
            samplingStyle.textContent = '.kgpt-sampling-field{grid-column:1/-1;padding:0!important;border:1px solid #cbdcf6;border-radius:16px;background:#fff;overflow:hidden;box-shadow:0 14px 34px -28px rgba(30,64,175,.65),inset 0 1px 0 #fff}.kgpt-sampling-head{min-height:58px;padding:12px 15px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #dce7f7;background:linear-gradient(135deg,#f9fbff,#eef5ff)}.kgpt-sampling-title-wrap{display:flex;align-items:center;gap:11px}.kgpt-sampling-icon{width:36px;height:36px;display:grid;place-items:center;flex:0 0 36px;border:1px solid #c7d9f7;border-radius:11px;background:linear-gradient(145deg,#fff,#e8f1ff);color:#2563eb;box-shadow:0 9px 18px -14px #1d4ed8}.kgpt-sampling-icon svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.kgpt-sampling-eyebrow{color:#5876b8;font-size:8px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.kgpt-sampling-title{margin-top:2px;color:#172033;font-size:12.5px;font-weight:900}.kgpt-sampling-status{padding:6px 9px;border:1px solid #b9d1fb;border-radius:999px;background:#fff;color:#315fc5;font-size:8px;font-weight:900;text-transform:uppercase}.kgpt-sampling-control{display:grid;grid-template-columns:minmax(0,220px) 1fr;align-items:stretch;gap:16px;padding:14px 15px}.kgpt-sampling-number{padding:11px;border:1px solid #d8e4f5;border-radius:13px;background:linear-gradient(180deg,#fff,#f8faff)}.kgpt-sampling-number>span{display:block;margin-bottom:7px;color:#6a7890;font-size:8.5px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.kgpt-sampling-input-wrap{height:54px;display:flex;align-items:center;border:1px solid #bcd0f2;border-radius:11px;background:#fff;overflow:hidden;box-shadow:0 8px 18px -16px #1d4ed8}.kgpt-sampling-input-wrap input{min-width:0;height:100%!important;border:0!important;border-radius:0!important;box-shadow:none!important;text-align:center;font-size:20px!important;font-weight:900;color:#1d4ed8}.kgpt-sampling-input-wrap>span{height:28px;padding:0 12px;display:flex;align-items:center;border-left:1px solid #e2e8f0;color:#7a879a;font-size:10px;white-space:nowrap}.kgpt-sampling-help{padding:4px 0;display:flex;flex-direction:column;justify-content:center}.kgpt-sampling-help strong{display:block;color:#1e3a6d;font-size:12px;margin-bottom:4px}.kgpt-sampling-help>span{color:#6b7d98;font-size:10.5px;line-height:1.55}.kgpt-sampling-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}.kgpt-sampling-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid #d6e3f7;border-radius:999px;background:#f8fbff;color:#50698f;font-size:8.5px;font-weight:800}.kgpt-sampling-chip:before{content:"✓";color:#2563eb}.kgpt-sampling-presets{display:flex;align-items:center;gap:6px;margin-top:10px}.kgpt-sampling-preset{height:30px;padding:0 10px;border:1px solid #d3e0f4;border-radius:9px;background:#fff;color:#50617b;font-size:9px;font-weight:800;cursor:pointer;transition:.18s}.kgpt-sampling-preset:hover{border-color:#8eb1ee;background:#f2f7ff;color:#2456c8}.kgpt-sampling-preset.active{border-color:#7ea5ed;background:#eaf2ff;color:#1d4ed8;box-shadow:0 7px 14px -12px #1d4ed8}.kgpt-sampling-preset:disabled{opacity:.38;cursor:not-allowed}.kgpt-random-meta{color:#315fc5;font-weight:800}#modal .modal{width:min(1280px,calc(100vw - 56px))!important;max-width:1280px!important;max-height:94vh!important;border-radius:24px!important}#modal .modal-head{padding-left:30px!important;padding-right:30px!important}#modal .form{padding-left:30px!important;padding-right:30px!important}#modal .modal-foot{padding-left:30px!important;padding-right:30px!important}#modal .form>.field label,#modal .grid2>.field label{font-size:10.5px!important}#modal .form>.field input,#modal .grid2>.field input,#modal .grid2>.field select{font-size:12.5px!important}#modal .question-card{padding:18px!important}#modal .question-card-head b{font-size:13px!important}#modal .question-number{font-size:11px!important}#modal .points-control{font-size:10.5px!important}#modal .points-control input{font-size:11.5px!important}#modal .question-prompt{min-height:82px!important;padding:13px 14px!important;font-size:13.5px!important;line-height:1.6!important;color:#172033!important}#modal .premium-answers{gap:10px!important}#modal .premium-answer-option{min-height:47px!important;padding:0 11px!important}#modal .answer-key{width:27px!important;height:27px!important;font-size:11px!important}#modal .answer-text{font-size:12.5px!important;line-height:1.45!important;color:#243047!important}#modal .add-question-btn{font-size:12.5px!important}@media(max-width:900px){#modal .modal{width:calc(100vw - 28px)!important;max-height:96vh!important}#modal .modal-head,#modal .form,#modal .modal-foot{padding-left:18px!important;padding-right:18px!important}}@media(max-width:650px){.kgpt-sampling-control{grid-template-columns:1fr}.kgpt-sampling-status{display:none}#modal .question-prompt{font-size:13px!important}#modal .answer-text{font-size:12px!important}}';
            frameDoc.head.appendChild(samplingStyle);
        }

        if (!frameDoc.getElementById('kgptCustomDurationStyle')) {
            const durationStyle = frameDoc.createElement('style');
            durationStyle.id = 'kgptCustomDurationStyle';
            durationStyle.textContent = '.kgpt-custom-duration{display:none;margin-top:9px;padding:11px 12px;border:1px solid #d5e1f1;border-radius:13px;background:linear-gradient(180deg,#fff,#fbfdff);box-shadow:0 10px 24px -22px rgba(15,23,42,.55),inset 0 1px 0 #fff}.kgpt-custom-duration.is-visible{display:block;animation:kgptDurationReveal .2s ease}.kgpt-custom-duration-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px}.kgpt-custom-duration-meta{min-width:0}.kgpt-custom-duration-heading{display:flex;align-items:center;gap:8px}.kgpt-custom-duration-icon{width:30px;height:30px;display:grid;place-items:center;flex:0 0 30px;border:1px solid #d2e0f5;border-radius:9px;background:#f2f7ff;color:#2563eb}.kgpt-custom-duration-icon svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.kgpt-custom-duration-copy strong{display:block;color:#263854;font-size:10.5px;font-weight:900}.kgpt-custom-duration-copy span{display:block;margin-top:2px;color:#8997aa;font-size:8.5px;font-weight:650}.kgpt-duration-stepper{height:40px;display:flex;align-items:center;border:1px solid #bfd1ef;border-radius:11px;background:#fff;overflow:hidden;box-shadow:0 8px 18px -16px rgba(37,99,235,.75)}.kgpt-duration-step{width:34px;height:100%;padding:0;border:0;background:#f6f9ff;color:#3568ca;font-size:17px;font-weight:700;cursor:pointer}.kgpt-duration-step:hover{background:#eaf2ff}.kgpt-custom-duration-input{width:58px!important;height:100%!important;padding:0 5px!important;border:0!important;border-left:1px solid #e3eaf4!important;border-right:1px solid #e3eaf4!important;border-radius:0!important;background:#fff!important;color:#1d4ed8!important;font-size:14px!important;font-weight:900!important;text-align:center;outline:none}.kgpt-custom-duration-input:focus{box-shadow:inset 0 0 0 2px rgba(59,130,246,.13)!important}.kgpt-custom-duration-input::-webkit-inner-spin-button,.kgpt-custom-duration-input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}.kgpt-custom-duration-unit{padding:0 9px;color:#65758d;font-size:9px;font-weight:850}.kgpt-duration-presets{display:flex;gap:5px;margin-top:8px;margin-left:38px}.kgpt-duration-preset{height:25px;padding:0 8px;border:1px solid #dbe4f1;border-radius:8px;background:#fff;color:#65758c;font-size:8px;font-weight:850;cursor:pointer}.kgpt-duration-preset:hover,.kgpt-duration-preset.active{border-color:#91afe7;background:#eef5ff;color:#2456c8}@keyframes kgptDurationReveal{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}@media(max-width:620px){.kgpt-custom-duration-row{grid-template-columns:1fr}.kgpt-duration-stepper{width:100%}.kgpt-custom-duration-input{flex:1;width:auto!important}.kgpt-duration-presets{margin-left:0}}';
            frameDoc.head.appendChild(durationStyle);
        }

        const durationSelect = frameDoc.getElementById('newDuration');
        const durationField = durationSelect?.closest('.field');
        if (durationField && !frameDoc.getElementById('kgptCustomDuration')) {
            const customDuration = frameDoc.createElement('div');
            customDuration.id = 'kgptCustomDuration';
            customDuration.className = 'kgpt-custom-duration';
            customDuration.innerHTML = '<div class="kgpt-custom-duration-row"><div class="kgpt-custom-duration-meta"><div class="kgpt-custom-duration-heading"><span class="kgpt-custom-duration-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle><path d="M12 8v5l3 2"></path></svg></span><span class="kgpt-custom-duration-copy"><strong>Thời lượng tùy chỉnh</strong><span>Từ 1 đến 480 phút</span></span></div><div class="kgpt-duration-presets"><button type="button" class="kgpt-duration-preset" data-duration-minutes="75">75 phút</button><button type="button" class="kgpt-duration-preset" data-duration-minutes="90">90 phút</button><button type="button" class="kgpt-duration-preset" data-duration-minutes="120">120 phút</button></div></div><div class="kgpt-duration-stepper"><button type="button" class="kgpt-duration-step" data-duration-step="-5" aria-label="Giảm 5 phút">−</button><input class="kgpt-custom-duration-input" id="kgptCustomDurationMinutes" type="number" min="1" max="480" step="1" value="90" aria-label="Nhập thời gian làm bài tùy chọn"><span class="kgpt-custom-duration-unit">phút</span><button type="button" class="kgpt-duration-step" data-duration-step="5" aria-label="Tăng 5 phút">+</button></div></div>';
            durationField.appendChild(customDuration);
            const customInput = customDuration.querySelector('#kgptCustomDurationMinutes');
            const syncDurationPreset = () => customDuration.querySelectorAll('[data-duration-minutes]').forEach(button => button.classList.toggle('active', Number(button.dataset.durationMinutes) === Number(customInput.value)));
            customInput.addEventListener('input', syncDurationPreset);
            customDuration.querySelectorAll('[data-duration-minutes]').forEach(button => button.addEventListener('click', () => {
                customInput.value = button.dataset.durationMinutes;
                syncDurationPreset();
                customInput.focus();
            }));
            customDuration.querySelectorAll('[data-duration-step]').forEach(button => button.addEventListener('click', () => {
                const nextValue = Math.max(1, Math.min(480, (Number(customInput.value) || 0) + Number(button.dataset.durationStep)));
                customInput.value = String(nextValue);
                syncDurationPreset();
                customInput.focus();
            }));
            syncDurationPreset();
        }
        const syncCustomDurationVisibility = () => {
            const customDuration = frameDoc.getElementById('kgptCustomDuration');
            customDuration?.classList.toggle('is-visible', durationSelect?.value === 'custom');
        };
        if (durationSelect && durationSelect.dataset.customDurationBound !== '1') {
            durationSelect.dataset.customDurationBound = '1';
            durationSelect.addEventListener('change', syncCustomDurationVisibility);
        }
        syncCustomDurationVisibility();
        const getConfiguredDuration = () => {
            if (durationSelect?.value !== 'custom') return durationSelect?.value || '30 phút';
            const minutes = Math.max(1, Math.min(480, Number(frameDoc.getElementById('kgptCustomDurationMinutes')?.value) || 0));
            return `${minutes} phút`;
        };
        const validateConfiguredDuration = () => {
            if (durationSelect?.value !== 'custom') return true;
            const input = frameDoc.getElementById('kgptCustomDurationMinutes');
            const minutes = Number(input?.value);
            if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 480) return true;
            showPremiumTrainingAlert('Thời gian tự chọn phải từ 1 đến 480 phút.', { title: 'Thời gian chưa hợp lệ' });
            input?.focus();
            return false;
        };

        if (!frameDoc.getElementById('kgptDeliveryQuestionCount')) {
            if (durationField) {
                const field = frameDoc.createElement('div');
                field.className = 'field kgpt-sampling-field';
                field.innerHTML = '<div class="kgpt-sampling-head"><div class="kgpt-sampling-title-wrap"><div class="kgpt-sampling-icon"><svg viewBox="0 0 24 24"><path d="M4 7h3c4.5 0 5 10 10 10h3"></path><path d="m17 14 3 3-3 3M4 17h3c1.8 0 2.9-1.6 4-3.5M14 7.5c.8-.4 1.8-.5 3-.5h3"></path><path d="m17 4 3 3-3 3"></path></svg></div><div><div class="kgpt-sampling-eyebrow">Cấu hình bộ đề</div><div class="kgpt-sampling-title">Phân phối câu hỏi ngẫu nhiên</div></div></div><span class="kgpt-sampling-status">Cá nhân hóa</span></div><div class="kgpt-sampling-control"><div class="kgpt-sampling-number"><span>Số câu trong mỗi đề</span><div class="kgpt-sampling-input-wrap"><input type="number" id="kgptDeliveryQuestionCount" min="1" step="1" placeholder="Tất cả"><span>/<b id="kgptQuestionBankTotal">0</b>&nbsp;câu</span></div><div class="kgpt-sampling-presets"><button class="kgpt-sampling-preset" type="button" data-sampling-preset="all">Tất cả</button><button class="kgpt-sampling-preset" type="button" data-sampling-preset="20">20 câu</button><button class="kgpt-sampling-preset" type="button" data-sampling-preset="half">50%</button></div></div><div class="kgpt-sampling-help"><strong id="kgptSamplingSummary">Tạo bộ đề riêng cho từng người</strong><span id="kgptSamplingDescription">Mỗi giám định viên nhận một tổ hợp câu hỏi khác nhau từ ngân hàng.</span><div class="kgpt-sampling-chips"><span class="kgpt-sampling-chip">Tráo câu hỏi</span><span class="kgpt-sampling-chip">Tráo đáp án</span><span class="kgpt-sampling-chip">Chấm điểm tự động</span></div></div></div>';
                durationField.after(field);
                const samplingInput = field.querySelector('#kgptDeliveryQuestionCount');
                samplingInput?.addEventListener('input', () => syncSamplingQuestionCount());
                field.querySelectorAll('[data-sampling-preset]').forEach(button => button.addEventListener('click', () => {
                    const total = frameDoc.querySelectorAll('#questionListContainer .question-card').length;
                    const preset = button.dataset.samplingPreset;
                    if (preset === 'all') samplingInput.value = '';
                    else if (preset === 'half') samplingInput.value = String(Math.max(1, Math.ceil(total / 2)));
                    else samplingInput.value = String(Math.min(total, Number(preset) || total));
                    syncSamplingQuestionCount();
                }));
            }
        }

        const syncSamplingQuestionCount = () => {
            const total = frameDoc.querySelectorAll('#questionListContainer .question-card').length;
            const input = frameDoc.getElementById('kgptDeliveryQuestionCount');
            const totalLabel = frameDoc.getElementById('kgptQuestionBankTotal');
            if (totalLabel) totalLabel.textContent = total;
            if (input) {
                input.max = String(Math.max(1, total));
                if (input.value && Number(input.value) > total) input.value = String(total);
            }
            const effectiveCount = input?.value ? Math.max(1, Math.min(total, Number(input.value) || total)) : total;
            const summary = frameDoc.getElementById('kgptSamplingSummary');
            const description = frameDoc.getElementById('kgptSamplingDescription');
            if (summary) summary.textContent = effectiveCount < total ? `Mỗi người nhận ${effectiveCount} trong ${total} câu` : `Mỗi người nhận toàn bộ ${total} câu`;
            if (description) description.textContent = effectiveCount < total
                ? `Hệ thống chọn ngẫu nhiên ${effectiveCount} câu và tiếp tục tráo vị trí đáp án cho từng tài khoản.`
                : 'Toàn bộ câu hỏi được sử dụng nhưng thứ tự câu và đáp án vẫn được tráo riêng cho từng tài khoản.';
            frameDoc.querySelectorAll('[data-sampling-preset]').forEach(button => {
                const preset = button.dataset.samplingPreset;
                const presetValue = preset === 'all' ? total : preset === 'half' ? Math.max(1, Math.ceil(total / 2)) : Math.min(total, Number(preset) || total);
                button.classList.toggle('active', (preset === 'all' && !input?.value) || (preset !== 'all' && !!input?.value && Number(input.value) === presetValue));
                if (preset === '20') button.disabled = total < 20;
            });
        };
        syncSamplingQuestionCount();
        const questionContainer = frameDoc.getElementById('questionListContainer');
        if (questionContainer && !frameWindow.__kgptSamplingQuestionObserver) {
            frameWindow.__kgptSamplingQuestionObserver = new MutationObserver(syncSamplingQuestionCount);
            frameWindow.__kgptSamplingQuestionObserver.observe(questionContainer, { childList: true });
        }

        if (!frameWindow.__kgptQuestionSamplingInstalled) {
            frameWindow.__kgptQuestionSamplingInstalled = true;
            const originalOpenModal = frameWindow.openModal;
            if (typeof originalOpenModal === 'function') {
                frameWindow.openModal = function() {
                    frameWindow.__kgptEditingAssignmentId = null;
                    const result = originalOpenModal.apply(this, arguments);
                    const modal = frameDoc.getElementById('modal');
                    const heading = modal?.querySelector('.modal-head h2');
                    const primaryButton = modal?.querySelector('.modal-foot .primary');
                    if (heading) heading.textContent = 'Tạo bài tập mới';
                    if (primaryButton) primaryButton.textContent = 'Tạo & giao bài →';
                    setTimeout(syncSamplingQuestionCount, 0);
                    return result;
                };
            }

            frameWindow.openEditAssignment = async function(taskId) {
                const storedAssignments = readTrainingLocalValue(TRAINING_ASSIGNMENTS_STORAGE_KEY, []);
                const task = storedAssignments.find(item => String(item.id) === String(taskId));
                if (!task) {
                    frameWindow.showToast?.('Không tìm thấy bài tập cần chỉnh sửa');
                    return;
                }
                const existingResult = readTrainingLocalValue(TRAINING_RESULTS_STORAGE_KEY, {})[taskId];
                if (existingResult) {
                    const approved = await requestPremiumConfirmation({
                        title: 'Chỉnh sửa bài đã có kết quả?',
                        message: 'Bài tập đã có người nộp. Kết quả đã nộp sẽ được giữ nguyên trong lịch sử, còn nội dung mới áp dụng cho lượt làm tiếp theo.',
                        confirmText: 'Tiếp tục sửa',
                        cancelText: 'Quay lại'
                    }, frameWindow);
                    if (!approved) return;
                }
                originalOpenModal?.call(frameWindow);
                frameWindow.__kgptEditingAssignmentId = task.id;

                const modal = frameDoc.getElementById('modal');
                const heading = modal?.querySelector('.modal-head h2');
                const primaryButton = modal?.querySelector('.modal-foot .primary');
                if (heading) heading.textContent = 'Chỉnh sửa bài tập';
                if (primaryButton) primaryButton.textContent = 'Lưu thay đổi →';
                const setValue = (id, value) => {
                    const element = frameDoc.getElementById(id);
                    if (element) element.value = value ?? '';
                };
                setValue('newTitle', task.title);
                setValue('newTopic', task.topic);
                setValue('newAudience', task.audience || 'Tất cả học viên');
                setValue('newDeadline', task.deadline || '');
                const storedDuration = task.duration || '30 phút';
                const matchingDuration = [...(durationSelect?.options || [])].some(option => option.value === storedDuration && option.value !== 'custom');
                setValue('newDuration', matchingDuration ? storedDuration : 'custom');
                if (!matchingDuration) setValue('kgptCustomDurationMinutes', Math.max(1, Math.min(480, parseInt(storedDuration, 10) || 90)));
                durationSelect?.dispatchEvent(new frameWindow.Event('change', { bubbles: true }));
                setValue('kgptDeliveryQuestionCount', task.deliveryQuestionCount || (task.questions || []).length);

                const questionList = frameDoc.getElementById('questionListContainer');
                if (questionList) questionList.innerHTML = '';
                (task.questions || []).forEach(question => frameWindow.addQuestionCard?.({
                    prompt: question.q || '',
                    answers: Array.isArray(question.a) ? question.a : ['', '', '', ''],
                    correct: Number(question.c) || 0,
                    points: Number(question.points) || 1
                }));
                if (!(task.questions || []).length) frameWindow.addQuestionCard?.();
                syncSamplingQuestionCount();
                modal?.querySelector('.form')?.scrollTo({ top: 0, behavior: 'instant' });
            };

            const originalSaveAssignmentForm = frameWindow.saveAssignmentForm;
            if (typeof originalSaveAssignmentForm === 'function') {
                frameWindow.saveAssignmentForm = function(status = 'publish') {
                    const totalQuestions = frameDoc.querySelectorAll('#questionListContainer .question-card').length;
                    const input = frameDoc.getElementById('kgptDeliveryQuestionCount');
                    const rawValue = String(input?.value || '').trim();
                    const requestedCount = rawValue ? Number(rawValue) : totalQuestions;
                    if (!validateConfiguredDuration()) return false;
                    if (status !== 'draft' && (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > totalQuestions)) {
                        showPremiumTrainingAlert(`Số câu phát phải từ 1 đến ${totalQuestions}.`, { title: 'Số câu chưa hợp lệ' });
                        input?.focus();
                        return false;
                    }
                    const editingId = frameWindow.__kgptEditingAssignmentId;
                    if (editingId) {
                        const title = String(frameDoc.getElementById('newTitle')?.value || '').trim();
                        if (!title) {
                            showPremiumTrainingAlert('Vui lòng nhập tên bài tập.', { title: 'Thiếu thông tin' });
                            frameDoc.getElementById('newTitle')?.focus();
                            return false;
                        }
                        const questionsData = [];
                        frameDoc.querySelectorAll('#questionListContainer .question-card').forEach(card => {
                            const prompt = String(card.querySelector('.question-prompt')?.value || '').trim();
                            const answers = [...card.querySelectorAll('.answer-text')].map(element => String(element.value || '').trim());
                            const checked = card.querySelector('input[type="radio"]:checked');
                            if (prompt) questionsData.push({
                                q: prompt,
                                a: answers,
                                c: checked ? Number(checked.value) : 0,
                                points: Number(card.querySelector('.q-points')?.value) || 1
                            });
                        });
                        if (status !== 'draft' && !questionsData.length) {
                            showPremiumTrainingAlert('Vui lòng tạo ít nhất một câu hỏi.', { title: 'Chưa có câu hỏi' });
                            return false;
                        }
                        const storedAssignments = readTrainingLocalValue(TRAINING_ASSIGNMENTS_STORAGE_KEY, []);
                        const taskIndex = storedAssignments.findIndex(item => String(item.id) === String(editingId));
                        if (taskIndex < 0) {
                            showPremiumTrainingAlert('Không tìm thấy bài tập cần cập nhật.', { title: 'Không thể cập nhật' });
                            return false;
                        }
                        const topic = frameDoc.getElementById('newTopic')?.value || 'Nghiệp vụ';
                        const deadline = frameDoc.getElementById('newDeadline')?.value || '';
                        const deadlineDate = deadline ? new Date(deadline) : null;
                        const deadlineLabel = deadlineDate && !Number.isNaN(deadlineDate.getTime())
                            ? `${deadlineDate.toLocaleDateString('vi-VN')} · ${deadlineDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                            : 'Chưa thiết lập';
                        const effectiveCount = questionsData.length ? Math.max(1, Math.min(questionsData.length, requestedCount || questionsData.length)) : 0;
                        storedAssignments[taskIndex] = {
                            ...storedAssignments[taskIndex],
                            title,
                            topic,
                            audience: frameDoc.getElementById('newAudience')?.value || 'Tất cả học viên',
                            deadline,
                            deadlineLabel,
                            duration: getConfiguredDuration(),
                            questions: questionsData,
                            deliveryQuestionCount: effectiveCount,
                            randomizeQuestions: true,
                            randomizeAnswers: true,
                            description: `${questionsData.length} câu trong ngân hàng · mỗi học viên nhận ${effectiveCount} câu ngẫu nhiên thuộc chuyên đề ${topic}.`,
                            status: status === 'draft' ? 'draft' : 'open',
                            updatedAt: new Date().toISOString()
                        };
                        localStorage.setItem(TRAINING_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(storedAssignments));
                        frameWindow.__kgptEditingAssignmentId = null;
                        frameWindow.loadAssignments?.();
                        frameWindow.closeModal?.();
                        frameWindow.showToast?.('Đã cập nhật bài tập thành công');
                        window.postMessage({ type: 'kgpt:refresh-assignments' }, '*');
                        return true;
                    }
                    const beforeIds = new Set(readTrainingLocalValue(TRAINING_ASSIGNMENTS_STORAGE_KEY, []).map(item => String(item.id)));
                    const result = originalSaveAssignmentForm.apply(this, arguments);
                    const storedAssignments = readTrainingLocalValue(TRAINING_ASSIGNMENTS_STORAGE_KEY, []);
                    const createdAssignment = storedAssignments.find(item => !beforeIds.has(String(item.id)));
                    if (createdAssignment) {
                        const effectiveCount = totalQuestions ? Math.max(1, Math.min(totalQuestions, requestedCount || totalQuestions)) : 0;
                        createdAssignment.deliveryQuestionCount = effectiveCount;
                        createdAssignment.randomizeQuestions = true;
                        createdAssignment.randomizeAnswers = true;
                        createdAssignment.audience = frameDoc.getElementById('newAudience')?.value || 'Tất cả học viên';
                        createdAssignment.duration = getConfiguredDuration();
                        createdAssignment.description = `${totalQuestions} câu trong ngân hàng · mỗi học viên nhận ${effectiveCount} câu ngẫu nhiên thuộc chuyên đề ${createdAssignment.topic}.`;
                        localStorage.setItem(TRAINING_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(storedAssignments));
                        frameWindow.loadAssignments?.();
                        window.postMessage({ type: 'kgpt:refresh-assignments' }, '*');
                    }
                    return result;
                };
            }
        }

        const exportIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 14v5h14v-5"></path></svg>';
        const collectTrainingAttempts = taskId => {
            const assignments = readTrainingLocalValue(TRAINING_ASSIGNMENTS_STORAGE_KEY, []);
            const results = readTrainingLocalValue(TRAINING_RESULTS_STORAGE_KEY, {});
            const history = readTrainingLocalValue(TRAINING_RESULT_HISTORY_STORAGE_KEY, []);
            const assignmentMap = new Map((Array.isArray(assignments) ? assignments : []).map(item => [String(item.id), item]));
            const attempts = [];

            Object.entries(results && typeof results === 'object' ? results : {}).forEach(([storedTaskId, result]) => {
                if (!result || typeof result !== 'object') return;
                attempts.push({ ...result, taskId: result.taskId || storedTaskId, __current: true });
            });
            (Array.isArray(history) ? history : []).forEach(result => {
                if (!result || typeof result !== 'object' || !result.taskId) return;
                attempts.push({ ...result, __current: false });
            });

            const filtered = attempts.filter(item => !taskId || String(item.taskId) === String(taskId));
            const grouped = new Map();
            filtered.forEach(item => {
                const key = `${String(item.taskId)}::${String(item.studentName || 'Học viên')}`;
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key).push(item);
            });
            grouped.forEach(items => {
                items.sort((a, b) => new Date(a.completedAt || 0) - new Date(b.completedAt || 0));
                items.forEach((item, index) => { item.__attemptNumber = index + 1; });
            });
            filtered.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
            return { assignments: Array.isArray(assignments) ? assignments : [], assignmentMap, attempts: filtered };
        };

        const formatExportDate = value => {
            if (!value) return '';
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN');
        };

        const safeExportFileName = value => String(value || 'ket-qua-bai-tap')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
            .replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'ket-qua-bai-tap';

        frameWindow.exportTrainingResults = async function(taskId = null) {
            try { await window.ensureDocumentLibrary('xlsx'); }
            catch (error) { showPremiumTrainingAlert(error.message, { title: 'Không thể kết xuất' }); return false; }
            const XLSXLib = window.XLSX || frameWindow.XLSX;
            if (!XLSXLib?.utils) {
                showPremiumTrainingAlert('Chưa tải được thư viện tạo Excel. Vui lòng kiểm tra kết nối mạng và thử lại.', { title: 'Không thể kết xuất' });
                return false;
            }
            const exportData = collectTrainingAttempts(taskId);
            if (!exportData.attempts.length) {
                showPremiumTrainingAlert(taskId ? 'Bài tập này chưa có kết quả để kết xuất.' : 'Chưa có kết quả làm bài nào để kết xuất.', { title: 'Chưa có dữ liệu' });
                return false;
            }

            const summaryRows = exportData.attempts.map((attempt, index) => {
                const task = exportData.assignmentMap.get(String(attempt.taskId)) || {};
                const details = Array.isArray(attempt.answerDetails) ? attempt.answerDetails : [];
                const correctCount = details.filter(item => item.isCorrect).length;
                const totalQuestions = details.length || Number(task.deliveryQuestionCount) || (task.questions || []).length || '';
                return {
                    'STT': index + 1,
                    'Mã bài tập': attempt.taskId || '',
                    'Tên bài tập': task.title || 'Bài tập không còn trong danh sách',
                    'Chuyên đề': task.topic || '',
                    'Học viên': attempt.studentName || 'Học viên',
                    'Lượt làm': Number(attempt.__attemptNumber) || 1,
                    'Phân loại': attempt.__current ? 'Kết quả hiện tại' : 'Lịch sử làm lại',
                    'Thời gian nộp': formatExportDate(attempt.completedAt),
                    'Điểm / 10': Number(attempt.score) || 0,
                    'Điểm đạt được': Number(attempt.earnedPoints) || 0,
                    'Tổng điểm': Number(attempt.totalPoints) || 0,
                    'Số câu đúng': details.length ? correctCount : '',
                    'Tổng số câu': totalQuestions,
                    'Tỷ lệ đúng': details.length ? `${Math.round(correctCount * 100 / details.length)}%` : '',
                    'Đánh giá': Number(attempt.score) >= 7 ? 'Đạt' : 'Chưa đạt'
                };
            });

            const detailRows = [];
            exportData.attempts.forEach(attempt => {
                const task = exportData.assignmentMap.get(String(attempt.taskId)) || {};
                const details = Array.isArray(attempt.answerDetails) ? attempt.answerDetails : [];
                details.forEach((answer, questionIndex) => {
                    detailRows.push({
                        'Mã bài tập': attempt.taskId || '',
                        'Tên bài tập': task.title || 'Bài tập không còn trong danh sách',
                        'Học viên': attempt.studentName || 'Học viên',
                        'Lượt làm': Number(attempt.__attemptNumber) || 1,
                        'Thời gian nộp': formatExportDate(attempt.completedAt),
                        'Câu số': questionIndex + 1,
                        'Nội dung câu hỏi': answer.question || '',
                        'Câu trả lời của học viên': answer.selectedAnswer || 'Chưa trả lời',
                        'Đáp án đúng': answer.correctAnswer || '',
                        'Kết quả': answer.isCorrect ? 'Đúng' : 'Sai'
                    });
                });
            });

            const relevantAssignments = taskId
                ? exportData.assignments.filter(item => String(item.id) === String(taskId))
                : exportData.assignments;
            const assignmentRows = relevantAssignments.map((task, index) => {
                const taskAttempts = exportData.attempts.filter(item => String(item.taskId) === String(task.id));
                const scores = taskAttempts.map(item => Number(item.score)).filter(Number.isFinite);
                return {
                    'STT': index + 1,
                    'Mã bài tập': task.id || '',
                    'Tên bài tập': task.title || '',
                    'Chuyên đề': task.topic || '',
                    'Thời hạn nộp': task.deadlineLabel || formatExportDate(task.deadline),
                    'Thời gian làm bài': task.duration || '',
                    'Câu trong ngân hàng': (task.questions || []).length,
                    'Câu phát mỗi người': Number(task.deliveryQuestionCount) || (task.questions || []).length,
                    'Tổng lượt nộp': taskAttempts.length,
                    'Điểm trung bình': scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)) : 0,
                    'Trạng thái': task.status === 'draft' ? 'Bản nháp' : 'Đang mở'
                };
            });

            const workbook = XLSXLib.utils.book_new();
            const summarySheet = XLSXLib.utils.json_to_sheet(summaryRows);
            summarySheet['!cols'] = [6, 18, 34, 22, 24, 10, 18, 22, 12, 14, 12, 12, 12, 12, 14].map(width => ({ wch: width }));
            summarySheet['!autofilter'] = { ref: summarySheet['!ref'] };
            XLSXLib.utils.book_append_sheet(workbook, summarySheet, 'Tong_quan_ket_qua');

            if (detailRows.length) {
                const detailSheet = XLSXLib.utils.json_to_sheet(detailRows);
                detailSheet['!cols'] = [18, 34, 24, 10, 22, 9, 58, 42, 42, 12].map(width => ({ wch: width }));
                detailSheet['!autofilter'] = { ref: detailSheet['!ref'] };
                XLSXLib.utils.book_append_sheet(workbook, detailSheet, 'Chi_tiet_dap_an');
            }

            if (assignmentRows.length) {
                const assignmentSheet = XLSXLib.utils.json_to_sheet(assignmentRows);
                assignmentSheet['!cols'] = [6, 18, 36, 22, 22, 18, 18, 18, 14, 16, 14].map(width => ({ wch: width }));
                assignmentSheet['!autofilter'] = { ref: assignmentSheet['!ref'] };
                XLSXLib.utils.book_append_sheet(workbook, assignmentSheet, 'Danh_sach_bai_tap');
            }

            const selectedTask = taskId ? exportData.assignmentMap.get(String(taskId)) : null;
            const datePart = new Date().toISOString().slice(0, 10);
            const fileName = `${safeExportFileName(selectedTask ? `ket-qua-${selectedTask.title}` : 'ket-qua-bai-tap')}-${datePart}.xlsx`;
            XLSXLib.writeFile(workbook, fileName, { compression: true });
            frameWindow.showToast?.(`Đã kết xuất ${exportData.attempts.length} lượt làm bài`);
            return true;
        };

        const createAssignmentButton = [...frameDoc.querySelectorAll('button')].find(button => /Tạo bài tập mới/i.test(button.textContent || ''));
        if (createAssignmentButton?.parentElement && !frameDoc.getElementById('kgptExportAllResults')) {
            const exportAllButton = frameDoc.createElement('button');
            exportAllButton.id = 'kgptExportAllResults';
            exportAllButton.type = 'button';
            exportAllButton.className = 'kgpt-export-results-btn';
            exportAllButton.innerHTML = `${exportIcon}<span>Kết xuất kết quả</span>`;
            exportAllButton.title = 'Kết xuất toàn bộ kết quả làm bài ra Excel';
            exportAllButton.addEventListener('click', () => frameWindow.exportTrainingResults());
            createAssignmentButton.parentElement.insertBefore(exportAllButton, createAssignmentButton);
        }

        const syncTaskSamplingMeta = () => {
            const storedAssignments = readTrainingLocalValue(TRAINING_ASSIGNMENTS_STORAGE_KEY, []);
            frameDoc.querySelectorAll('#taskRows tr[data-task-id]').forEach(row => {
                const task = storedAssignments.find(item => String(item.id) === String(row.dataset.taskId));
                const meta = row.querySelector('.task-meta');
                if (!task || !meta) return;
                const bankTotal = (task.questions || []).length;
                const deliveryCount = Math.min(bankTotal, Number(task.deliveryQuestionCount) || bankTotal);
                meta.innerHTML = `${bankTotal} câu ngân hàng · <span class="kgpt-random-meta">phát ngẫu nhiên ${deliveryCount} câu/người</span> · ${escape(task.duration || '30 phút')} · ${escape(task.topic || 'Nghiệp vụ')}`;
                const actionGroup = row.querySelector('.action-group');
                if (actionGroup && !actionGroup.querySelector('.kgpt-edit-assignment')) {
                    const editButton = frameDoc.createElement('button');
                    editButton.className = 'icon-btn kgpt-edit-assignment';
                    editButton.type = 'button';
                    editButton.title = 'Chỉnh sửa bài tập';
                    editButton.setAttribute('aria-label', 'Chỉnh sửa bài tập');
                    editButton.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 20h4l11-11-4-4L4 16v4Zm9.5-13.5 4 4M13 20h7"/></svg>';
                    editButton.addEventListener('click', event => {
                        event.stopPropagation();
                        frameWindow.openEditAssignment?.(row.dataset.taskId);
                    });
                    const deleteButton = actionGroup.querySelector('.danger');
                    actionGroup.insertBefore(editButton, deleteButton || null);
                }
                if (actionGroup && !actionGroup.querySelector('.kgpt-export-assignment')) {
                    const exportButton = frameDoc.createElement('button');
                    exportButton.className = 'icon-btn kgpt-export-assignment';
                    exportButton.type = 'button';
                    exportButton.title = 'Kết xuất kết quả bài tập';
                    exportButton.setAttribute('aria-label', 'Kết xuất kết quả bài tập');
                    exportButton.innerHTML = exportIcon;
                    exportButton.addEventListener('click', event => {
                        event.stopPropagation();
                        frameWindow.exportTrainingResults?.(row.dataset.taskId);
                    });
                    const deleteButton = actionGroup.querySelector('.danger');
                    actionGroup.insertBefore(exportButton, deleteButton || null);
                }
            });
        };
        setTimeout(syncTaskSamplingMeta, 0);
        const taskRows = frameDoc.getElementById('taskRows');
        if (taskRows && !frameWindow.__kgptSamplingTaskObserver) {
            frameWindow.__kgptSamplingTaskObserver = new MutationObserver(syncTaskSamplingMeta);
            frameWindow.__kgptSamplingTaskObserver.observe(taskRows, { childList: true });
        }

        const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        frameWindow.allowRetakeForStudent = async function(taskId) {
            const results = readTrainingLocalValue(TRAINING_RESULTS_STORAGE_KEY, {});
            const result = results?.[taskId];
            const learner = result?.studentName || 'học viên này';
            if (!result?.userId) {
                showPremiumTrainingAlert('Kết quả cũ chưa có mã người dùng tin cậy. Hãy đồng bộ lại dữ liệu trước khi mở lượt làm lại.', { title: 'Thiếu định danh người học' });
                return;
            }
            const approved = await requestPremiumConfirmation({
                title: 'Cho phép làm lại bài?',
                message: `Mở lượt làm mới cho ${learner}. Kết quả hiện tại sẽ được chuyển vào lịch sử và hệ thống tạo một bộ câu hỏi ngẫu nhiên mới.`,
                confirmText: 'Cho làm lại',
                cancelText: 'Hủy'
            }, frameWindow);
            if (!approved) return;
            try {
                const store = await waitForTrainingDatabase();
                await store.allowRetake(taskId, result.userId);
                await loadTrainingDataFromDatabase(true);
                frameWindow.closeResultsModal?.();
                frameWindow.loadAssignments?.();
                frameWindow.showToast?.(`Đã mở lượt làm lại cho ${learner}`);
                dispatchAssignmentsRefresh();
            } catch (error) {
                console.error('Không mở được lượt làm lại:', error);
                showPremiumTrainingAlert(error.message || 'Không mở được lượt làm lại trên máy chủ.', { title: 'Thao tác thất bại' });
            }
        };

        frameWindow.toggleLearnerResultDetails = function(taskId) {
            const detailRow = frameDoc.getElementById(`kgptResultDetail-${taskId}`);
            const summaryRow = frameDoc.getElementById(`kgptResultSummary-${taskId}`);
            const button = frameDoc.getElementById(`kgptViewResult-${taskId}`);
            if (!detailRow) return;
            const willOpen = detailRow.hidden;
            detailRow.hidden = !willOpen;
            summaryRow?.classList.toggle('is-open', willOpen);
            if (button) button.textContent = willOpen ? 'Thu gọn' : 'Xem kết quả';
            if (willOpen) setTimeout(() => detailRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 40);
        };

        frameWindow.viewTaskResults = function(taskId) {
            const assignments = readTrainingLocalValue(TRAINING_ASSIGNMENTS_STORAGE_KEY, []);
            const task = assignments.find(item => String(item.id) === String(taskId));
            if (!task) return;
            const results = readTrainingLocalValue(TRAINING_RESULTS_STORAGE_KEY, {});
            const result = results[taskId];
            const resultHistory = readTrainingLocalValue(TRAINING_RESULT_HISTORY_STORAGE_KEY, []);
            const modal = frameDoc.getElementById('resultsModal');
            const title = frameDoc.getElementById('resultModalTitle');
            const tbody = frameDoc.getElementById('resultSubmissionsBody');
            const table = tbody?.closest('table');
            if (!modal || !tbody || !table) return;
            const modalCard = modal.querySelector('.modal');
            modalCard?.style.setProperty('width', 'min(1080px, calc(100vw - 48px))');
            modalCard?.style.setProperty('max-width', '1080px');
            title.textContent = `Kết quả: ${task.title}`;
            frameWindow.__kgptCurrentResultTaskId = taskId;
            const modalHead = modal.querySelector('.modal-head');
            if (modalHead && !frameDoc.getElementById('kgptExportCurrentResult')) {
                const exportCurrentButton = frameDoc.createElement('button');
                exportCurrentButton.id = 'kgptExportCurrentResult';
                exportCurrentButton.type = 'button';
                exportCurrentButton.className = 'kgpt-export-results-btn modal-export';
                exportCurrentButton.innerHTML = `${exportIcon}<span>Xuất Excel</span>`;
                exportCurrentButton.title = 'Kết xuất kết quả của bài tập đang xem';
                exportCurrentButton.addEventListener('click', event => {
                    event.stopPropagation();
                    frameWindow.exportTrainingResults?.(frameWindow.__kgptCurrentResultTaskId);
                });
                const closeButton = modalHead.querySelector('.close');
                modalHead.insertBefore(exportCurrentButton, closeButton || null);
            }
            table.querySelector('thead').innerHTML = '<tr><th>Học viên</th><th>Thời gian nộp</th><th>Điểm số</th><th>Đánh giá</th><th>Làm lại</th><th>Thao tác</th></tr>';
            if (!result) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:#8792a3">Chưa có học viên nào nộp bài tập này.</td></tr>';
            } else {
                const submittedAt = result.completedAt ? new Date(result.completedAt).toLocaleString('vi-VN') : '—';
                const passed = Number(result.score) >= 7;
                const retakeCount = (Array.isArray(resultHistory) ? resultHistory : []).filter(item => String(item.taskId) === String(taskId) && (!item.studentName || !result.studentName || item.studentName === result.studentName)).length;
                const attemptNumber = retakeCount + 1;
                const details = Array.isArray(result.answerDetails) ? result.answerDetails : [];
                const detailHtml = details.length ? `<div class="kgpt-answer-list">${details.map((item, index) => `
                    <div class="kgpt-answer-card ${item.isCorrect ? 'correct' : 'wrong'}">
                        <div class="kgpt-answer-head"><div class="kgpt-answer-title">Câu ${index + 1}: ${escape(item.question)}</div><span class="kgpt-answer-state">${item.isCorrect ? 'Đúng' : 'Sai'}</span></div>
                        <div class="kgpt-answer-meta"><span><b>Người dùng chọn</b>${escape(item.selectedAnswer || 'Chưa trả lời')}</span><span><b>Đáp án đúng</b>${escape(item.correctAnswer || '—')}</span></div>
                    </div>`).join('')}</div>` : '<div class="kgpt-legacy-result">Kết quả này được tạo trước khi bật lưu chi tiết đáp án nên chưa thể hiện đúng/sai từng câu. Hãy cho phép học viên làm lại để hệ thống ghi nhận đầy đủ.</div>';
                tbody.innerHTML = `
                    <tr class="kgpt-learner-result-row" id="kgptResultSummary-${escape(taskId)}" onclick="toggleLearnerResultDetails('${escape(taskId)}')"><td><b class="kgpt-learner-name">${escape(result.studentName || 'Học viên')}</b></td><td>${submittedAt}</td><td><b style="color:#2563eb;font-size:13px">${escape(result.score)}</b> / 10</td><td><span class="badge ${passed ? 'green' : 'amber'}">${passed ? '● Đạt' : '● Chưa đạt'}</span></td><td><span class="kgpt-retake-count">${retakeCount} lần</span><span class="kgpt-attempt-label">Đang ở lượt ${attemptNumber}</span></td><td><div class="kgpt-result-actions"><button class="kgpt-view-result-btn" id="kgptViewResult-${escape(taskId)}" onclick="event.stopPropagation();toggleLearnerResultDetails('${escape(taskId)}')">Xem kết quả</button><button class="kgpt-retake-btn" onclick="event.stopPropagation();allowRetakeForStudent('${escape(taskId)}')">Cho làm lại</button></div></td></tr>
                    <tr class="kgpt-result-detail-row" id="kgptResultDetail-${escape(taskId)}" hidden><td colspan="6"><div style="font-size:10px;font-weight:800;color:#475569;margin-top:4px">CHI TIẾT ĐÚNG / SAI TỪNG CÂU · LƯỢT ${attemptNumber}</div>${detailHtml}</td></tr>`;
            }
            modal.classList.add('open');
        };
    }

    if (!window.__kgptFullscreenGuardInstalled) {
        window.__kgptFullscreenGuardInstalled = true;
        document.addEventListener('fullscreenchange', function() {
            const frame = document.getElementById('studentLearningFrame');
            const frameWindow = frame?.contentWindow;
            if (!frameWindow?.__kgptExamSecurityActive || !frameWindow.__kgptFullscreenEntered || document.fullscreenElement === frame || !window.isStudentQuizInProgress?.() || frameWindow.__kgptSecuritySubmitting) return;
            frameWindow.__kgptSecuritySubmitting = true;
            frameWindow.showToast?.('Bạn đã thoát chế độ toàn màn hình. Hệ thống tự động nộp bài hiện tại.');
            try { frameWindow.submitQuiz?.(true); } finally {
                setTimeout(() => { frameWindow.__kgptSecuritySubmitting = false; }, 800);
            }
        });
    }

    function enforceStudentSingleAttempt() {
        const frame = document.getElementById('studentLearningFrame');
        const frameWindow = frame?.contentWindow;
        const frameDoc = frame?.contentDocument;
        const startButton = frameDoc?.getElementById('btnStartQuiz');
        if (!frameWindow || !frameDoc || !startButton) return;

        if (!frameDoc.getElementById('kgptSingleAttemptStyle')) {
            const style = frameDoc.createElement('style');
            style.id = 'kgptSingleAttemptStyle';
            style.textContent = '#btnStartQuiz[disabled]{cursor:not-allowed;transform:none!important;color:#64748b!important;border:1px solid #dbe4ef!important;background:#eef2f7!important;box-shadow:none!important;opacity:1!important}.detail-actions.single-attempt-locked p{color:#64748b!important}#quiz.active{box-sizing:border-box;min-height:100vh;width:100%;padding:28px;align-items:center;justify-content:center}#quiz.active .quiz-shell{width:min(1500px,100%);margin:auto}#quiz.active .quiz-main,#quiz.active .quiz-nav{box-shadow:0 24px 60px -38px rgba(15,23,42,.45)}@media(min-height:720px){#quiz.active{display:flex}}@media(max-height:719px){#quiz.active{display:block;padding:18px}}@media(max-width:1050px){#quiz.active{align-items:flex-start}#quiz.active .quiz-shell{width:100%}}';
            frameDoc.head.appendChild(style);
        }

        if (!frameDoc.getElementById('kgptQuizReadableTypeStyle')) {
            const style = frameDoc.createElement('style');
            style.id = 'kgptQuizReadableTypeStyle';
            style.textContent = '#quiz.active .quiz-progress span{font-size:12px!important;line-height:1.5}#quiz.active .quiz-progress b{font-size:14px!important}#quiz.active .timer{font-size:13.5px!important;padding:9px 13px}#quiz.active .question{padding:30px 28px 18px}#quiz.active .question-num{font-size:12px!important}#quiz.active .question h2{font-size:22px!important;line-height:1.5!important;margin:13px 0 22px!important;letter-spacing:-.018em}#quiz.active .options{gap:11px}#quiz.active .option{min-height:60px;padding:16px!important;font-size:14px!important;line-height:1.5!important}#quiz.active .letter{font-size:12px!important;flex:0 0 auto}#quiz.active .quiz-nav h3{font-size:15px!important}#quiz.active .quiz-nav p{font-size:11px!important;line-height:1.45}#quiz.active .qbtn{font-size:12px!important}#quiz.active .legend,#quiz.active .legend span{font-size:10.5px!important}#quiz.active .quiz-actions button,#quiz.active .submit{font-size:12px!important;font-weight:850!important}@media(max-width:650px){#quiz.active .question{padding:22px 18px 14px}#quiz.active .question h2{font-size:19px!important}#quiz.active .option{font-size:13px!important;padding:14px!important;min-height:54px}}';
            frameDoc.head.appendChild(style);
        }

        if (!frameDoc.getElementById('kgptDetailInfoLabelsStyle')) {
            const style = frameDoc.createElement('style');
            style.id = 'kgptDetailInfoLabelsStyle';
            style.textContent = '#taskSelectedView .info-grid.kgpt-expanded-info-labels .info{min-height:80px;display:flex;flex-direction:column;justify-content:center}#taskSelectedView .info-grid.kgpt-expanded-info-labels .info>span{min-height:25px;margin-bottom:6px;font-size:8.25px!important;line-height:1.35!important;letter-spacing:.055em!important;white-space:normal;text-wrap:balance}#taskSelectedView .info-grid.kgpt-expanded-info-labels .info>b{line-height:1.25}@media(max-width:720px){#taskSelectedView .info-grid.kgpt-expanded-info-labels .info>span{min-height:0;font-size:8.75px!important}}';
            frameDoc.head.appendChild(style);
        }

        if (!frameDoc.getElementById('kgptWrongReviewStyle')) {
            const style = frameDoc.createElement('style');
            style.id = 'kgptWrongReviewStyle';
            style.textContent = '.kgpt-review-header-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;max-width:520px}.kgpt-review-header-actions .deadline{margin:0!important}.kgpt-review-header-actions .kgpt-review-wrong-btn{min-height:38px;padding:0 13px;border-radius:999px;background:rgba(255,255,255,.86);box-shadow:0 10px 22px -19px rgba(180,35,24,.65)}.kgpt-review-wrong-btn{min-height:46px;padding:0 17px;border:1px solid #f6b8b8;border-radius:12px;background:linear-gradient(180deg,#fff,#fff7f7);color:#b42318;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:11.5px;font-weight:900;cursor:pointer;box-shadow:0 12px 24px -20px rgba(180,35,24,.65);transition:.18s}.kgpt-review-wrong-btn:hover{border-color:#ef8e8e;background:#fff1f1;transform:translateY(-1px)}.kgpt-review-wrong-btn svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.kgpt-review-wrong-btn[hidden]{display:none!important}.kgpt-result-button-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.kgpt-result-button-row>button{width:100%;margin:0!important}.kgpt-review-modal{position:fixed;inset:0;z-index:999;display:none;align-items:center;justify-content:center;padding:22px;background:rgba(7,15,29,.66);backdrop-filter:blur(10px)}.kgpt-review-modal.open{display:flex;animation:kgptReviewFade .2s ease}.kgpt-review-dialog{width:min(1040px,calc(100vw - 34px));max-height:min(88vh,820px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.7);border-radius:24px;background:#fff;box-shadow:0 42px 100px -34px rgba(2,8,23,.75);animation:kgptReviewRise .25s cubic-bezier(.2,.8,.2,1)}.kgpt-review-head{padding:22px 26px 18px;display:flex;align-items:flex-start;justify-content:space-between;gap:20px;border-bottom:1px solid #e7edf5;background:radial-gradient(circle at 90% 0,rgba(248,113,113,.12),transparent 30%),linear-gradient(135deg,#fff,#f8fbff)}.kgpt-review-eyebrow{margin-bottom:6px;color:#dc2626;font-size:10px;font-weight:950;letter-spacing:.16em;text-transform:uppercase}.kgpt-review-head h2{margin:0;color:#111c31;font-size:21px;letter-spacing:-.03em}.kgpt-review-head p{margin:7px 0 0;color:#75839a;font-size:12px;line-height:1.55}.kgpt-review-close{width:38px;height:38px;flex:0 0 38px;border:1px solid #dce4ef;border-radius:11px;background:#fff;color:#64748b;font-size:21px;cursor:pointer}.kgpt-review-close:hover{color:#dc2626;border-color:#fecaca;background:#fff7f7}.kgpt-review-summary{padding:14px 26px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #edf1f6;background:#fbfcfe}.kgpt-review-stat{padding:8px 11px;border:1px solid #dde6f2;border-radius:10px;background:#fff;color:#64748b;font-size:10.5px;font-weight:850}.kgpt-review-stat b{margin-right:4px;color:#172033;font-size:14px}.kgpt-review-stat.danger{border-color:#fecaca;background:#fff7f7;color:#b42318}.kgpt-review-stat.danger b{color:#dc2626}.kgpt-review-body{flex:1;overflow:auto;padding:18px 26px 26px;background:#f7f9fc}.kgpt-review-list{display:grid;gap:12px}.kgpt-review-card{padding:16px;border:1px solid #f4c3c3;border-radius:16px;background:#fff;box-shadow:0 13px 28px -26px rgba(15,23,42,.5)}.kgpt-review-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}.kgpt-review-question{color:#172033;font-size:13.5px;font-weight:850;line-height:1.55}.kgpt-review-state{flex:0 0 auto;padding:5px 9px;border-radius:999px;background:#fee2e2;color:#b42318;font-size:9.5px;font-weight:950;text-transform:uppercase}.kgpt-review-answer-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.kgpt-review-answer{padding:11px 12px;border:1px solid #e2e8f0;border-radius:11px;background:#f8fafc;color:#526076;font-size:11.5px;line-height:1.55}.kgpt-review-answer b{display:block;margin-bottom:4px;color:#64748b;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase}.kgpt-review-answer.wrong{border-color:#fecaca;background:#fff7f7;color:#991b1b}.kgpt-review-answer.correct{border-color:#bbefd2;background:#f2fbf6;color:#087a46}.kgpt-review-empty{padding:50px 24px;text-align:center;border:1px solid #ccebd9;border-radius:18px;background:#f1fbf5}.kgpt-review-empty-icon{width:54px;height:54px;margin:0 auto 14px;display:grid;place-items:center;border-radius:18px;background:#dcfce7;color:#059669;font-size:25px;font-weight:900}.kgpt-review-empty h3{margin:0 0 7px;color:#10613c;font-size:17px}.kgpt-review-empty p{margin:0;color:#56806b;font-size:12px}.kgpt-review-foot{padding:15px 26px;display:flex;align-items:center;justify-content:space-between;gap:16px;border-top:1px solid #e7edf5;background:#fff}.kgpt-review-note{color:#8793a5;font-size:10.5px}.kgpt-review-back{height:40px;padding:0 16px;border:0;border-radius:11px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;font-size:11px;font-weight:900;cursor:pointer;box-shadow:0 12px 24px -16px #1d4ed8}@keyframes kgptReviewFade{from{opacity:0}to{opacity:1}}@keyframes kgptReviewRise{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}@media(max-width:700px){.kgpt-review-header-actions{width:100%;max-width:none;justify-content:flex-start}.kgpt-review-answer-grid{grid-template-columns:1fr}.kgpt-result-button-row{grid-template-columns:1fr}.kgpt-review-summary{flex-wrap:wrap}.kgpt-review-dialog{max-height:92vh}.kgpt-review-head,.kgpt-review-body,.kgpt-review-foot{padding-left:17px;padding-right:17px}}';
            style.textContent += '.kgpt-review-header-actions{max-width:560px}.kgpt-review-header-actions .deadline,.kgpt-review-header-actions .kgpt-review-wrong-btn{box-sizing:border-box!important;height:40px!important;min-height:40px!important;padding:0 15px!important;border-radius:999px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;line-height:1!important;font-size:10.5px!important;font-weight:850!important;white-space:nowrap}.kgpt-review-header-actions .kgpt-review-wrong-btn svg{width:15px;height:15px;flex:0 0 15px}.kgpt-answer-summary[hidden]{display:none!important}.kgpt-answer-summary{margin:0 22px 16px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.kgpt-answer-stat{min-height:66px;padding:12px 15px;display:flex;align-items:center;gap:12px;border:1px solid;border-radius:13px;background:#fff}.kgpt-answer-stat-icon{width:36px;height:36px;flex:0 0 36px;display:grid;place-items:center;border-radius:11px;font-size:18px;font-weight:950}.kgpt-answer-stat-copy{min-width:0}.kgpt-answer-stat-copy span{display:block;margin-bottom:3px;font-size:9px;font-weight:900;letter-spacing:.075em;text-transform:uppercase}.kgpt-answer-stat-copy strong{display:block;font-size:17px;line-height:1.1}.kgpt-answer-stat.correct{border-color:#bde9d1;background:linear-gradient(145deg,#f3fcf7,#fff)}.kgpt-answer-stat.correct .kgpt-answer-stat-icon{background:#dcfce7;color:#07814d}.kgpt-answer-stat.correct span,.kgpt-answer-stat.correct strong{color:#087a46}.kgpt-answer-stat.wrong{border-color:#fecaca;background:linear-gradient(145deg,#fff7f7,#fff)}.kgpt-answer-stat.wrong .kgpt-answer-stat-icon{background:#fee2e2;color:#dc2626}.kgpt-answer-stat.wrong span,.kgpt-answer-stat.wrong strong{color:#b42318}@media(max-width:560px){.kgpt-answer-summary{grid-template-columns:1fr;margin-left:17px;margin-right:17px}}';
            style.textContent += '.kgpt-answer-summary{position:relative;isolation:isolate;margin:0 22px 16px;padding:16px;grid-template-columns:minmax(275px,1.08fr) minmax(0,1.42fr);gap:16px;overflow:hidden;border:1px solid #d8e4f3;border-radius:18px;background:radial-gradient(circle at 0 0,rgba(59,130,246,.10),transparent 30%),linear-gradient(135deg,#f8fbff 0%,#f5f8fc 56%,#fbfdff 100%);box-shadow:0 16px 34px -29px rgba(15,23,42,.5),inset 0 1px 0 #fff}.kgpt-answer-summary:before{content:none}.kgpt-answer-summary:after{content:"";position:absolute;z-index:-1;right:-54px;top:-76px;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(59,130,246,.10),transparent 68%)}.kgpt-performance-overview{min-width:0;padding:5px 18px 5px 3px;border-right:1px solid #dfe8f3}.kgpt-performance-head{display:flex;align-items:center;gap:11px}.kgpt-performance-icon{width:38px;height:38px;flex:0 0 38px;display:grid;place-items:center;border:1px solid #c9dcfa;border-radius:12px;background:linear-gradient(145deg,#fff,#eaf2ff);color:#2563eb;box-shadow:0 9px 20px -16px #1d4ed8}.kgpt-performance-icon svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.kgpt-performance-title{min-width:0}.kgpt-performance-title span{display:block;margin-bottom:3px;color:#6681b8;font-size:7.5px;font-weight:950;letter-spacing:.14em;text-transform:uppercase}.kgpt-performance-title strong{display:block;color:#172033;font-size:12px;font-weight:900}.kgpt-performance-status{margin-left:auto;padding:6px 9px;border:1px solid #bce8d0;border-radius:999px;background:#ecfdf3;color:#087a46;font-size:8px;font-weight:950;text-transform:uppercase;white-space:nowrap}.kgpt-performance-status.not-passed{border-color:#fed7aa;background:#fff7ed;color:#c2410c}.kgpt-performance-score-row{margin:13px 0 8px;display:flex;align-items:flex-end;gap:7px}.kgpt-performance-score{color:#174fca;font-size:29px;font-weight:950;line-height:.95;letter-spacing:-.055em}.kgpt-performance-score-unit{padding-bottom:2px;color:#718096;font-size:9px;font-weight:800}.kgpt-performance-accuracy{margin-left:auto;padding-bottom:2px;color:#315fc5;font-size:10px;font-style:normal;font-weight:900}.kgpt-performance-track{height:6px;overflow:hidden;border-radius:999px;background:#e2e8f0;box-shadow:inset 0 1px 2px rgba(15,23,42,.08)}.kgpt-performance-track i{display:block;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#2563eb,#60a5fa);transition:none!important;animation:none!important}.kgpt-performance-note{display:block;margin-top:7px;color:#8a97aa;font-size:8px;line-height:1.4}.kgpt-answer-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.kgpt-answer-stat{position:relative;min-height:92px;padding:13px 14px;gap:12px;overflow:hidden;border-radius:14px;box-shadow:0 10px 24px -22px rgba(15,23,42,.55),inset 0 1px 0 rgba(255,255,255,.95)}.kgpt-answer-stat:after{content:"";position:absolute;right:-22px;top:-28px;width:72px;height:72px;border-radius:50%;background:currentColor;opacity:.045}.kgpt-answer-stat-icon{width:42px;height:42px;flex-basis:42px;border:1px solid currentColor;background:#fff!important}.kgpt-answer-stat-icon svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.kgpt-answer-stat-copy span{margin-bottom:5px;font-size:8px;letter-spacing:.11em}.kgpt-answer-stat-copy strong{font-size:25px;letter-spacing:-.045em}.kgpt-answer-stat-copy small{display:block;margin-top:4px;color:#7f8b9e!important;font-size:8px;line-height:1.35}.kgpt-answer-stat.correct{color:#087a46;border-color:#bce9d1;background:linear-gradient(145deg,#f1fcf6,#fff)}.kgpt-answer-stat.correct .kgpt-answer-stat-icon{border-color:#b8e7cd;color:#059669}.kgpt-answer-stat.wrong{color:#b42318;border-color:#fecaca;background:linear-gradient(145deg,#fff5f5,#fff)}.kgpt-answer-stat.wrong .kgpt-answer-stat-icon{border-color:#fecaca;color:#dc2626}html.dark .kgpt-answer-summary{border-color:#334155;background:linear-gradient(145deg,#111827,#172033);box-shadow:none}html.dark .kgpt-performance-overview{border-color:#334155}html.dark .kgpt-performance-title strong{color:#f8fafc}html.dark .kgpt-performance-icon{border-color:#3b4f70;background:#1e293b}html.dark .kgpt-answer-stat.correct{background:linear-gradient(145deg,rgba(6,78,59,.28),#111827)}html.dark .kgpt-answer-stat.wrong{background:linear-gradient(145deg,rgba(127,29,29,.25),#111827)}html.dark .kgpt-answer-stat-icon{background:#172033!important}@media(max-width:760px){.kgpt-answer-summary{grid-template-columns:1fr}.kgpt-performance-overview{padding-right:3px;padding-bottom:15px;border-right:0;border-bottom:1px solid #dfe8f3}}@media(max-width:560px){.kgpt-answer-metrics{grid-template-columns:1fr}.kgpt-answer-summary{margin-left:17px;margin-right:17px;padding:13px}}';
            frameDoc.head.appendChild(style);
        }

        const reviewIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM8 9h8M8 13h5"></path><path d="m16 16 4 4m0-4-4 4"></path></svg>';
        if (!frameDoc.getElementById('kgptWrongReviewModal')) {
            const reviewModal = frameDoc.createElement('div');
            reviewModal.id = 'kgptWrongReviewModal';
            reviewModal.className = 'kgpt-review-modal';
            reviewModal.innerHTML = '<section class="kgpt-review-dialog" role="dialog" aria-modal="true" aria-labelledby="kgptWrongReviewTitle"><header class="kgpt-review-head"><div><div class="kgpt-review-eyebrow">Ôn tập sau đánh giá</div><h2 id="kgptWrongReviewTitle">Các câu cần xem lại</h2><p id="kgptWrongReviewSubtitle">Đối chiếu câu trả lời của bạn với đáp án đúng.</p></div><button type="button" class="kgpt-review-close" id="kgptWrongReviewClose" aria-label="Đóng">×</button></header><div class="kgpt-review-summary" id="kgptWrongReviewSummary"></div><div class="kgpt-review-body" id="kgptWrongReviewBody"></div><footer class="kgpt-review-foot"><span class="kgpt-review-note">Chế độ chỉ xem · Không thay đổi kết quả đã ghi nhận</span><button type="button" class="kgpt-review-back" id="kgptWrongReviewBack">Quay về bài tập</button></footer></section>';
            frameDoc.body.appendChild(reviewModal);
            reviewModal.addEventListener('click', event => {
                if (event.target === reviewModal) frameWindow.closeWrongAnswerReview?.();
            });
            reviewModal.querySelector('#kgptWrongReviewClose')?.addEventListener('click', () => frameWindow.closeWrongAnswerReview?.());
            reviewModal.querySelector('#kgptWrongReviewBack')?.addEventListener('click', () => frameWindow.closeWrongAnswerReview?.());
        }

        const detailActions = startButton.closest('.detail-actions');
        const detailTopline = frameDoc.querySelector('#taskSelectedView .detail-topline');
        const detailInfoGrid = frameDoc.querySelector('#taskSelectedView .info-grid');
        const deadlineBadge = frameDoc.getElementById('deadline');
        if (detailInfoGrid) {
            const infoLabels = detailInfoGrid.querySelectorAll('.info > span');
            const expandedLabels = [
                'Số lượng câu hỏi bài kiểm tra',
                'Thời gian làm bài',
                'Số lần làm bài',
                'Số điểm tối thiểu phải đạt'
            ];
            infoLabels.forEach((label, index) => {
                if (expandedLabels[index]) label.textContent = expandedLabels[index];
            });
            detailInfoGrid.classList.add('kgpt-expanded-info-labels');
        }
        if (detailInfoGrid && !frameDoc.getElementById('kgptAnswerSummary')) {
            const answerSummary = frameDoc.createElement('div');
            answerSummary.id = 'kgptAnswerSummary';
            answerSummary.className = 'kgpt-answer-summary';
            answerSummary.hidden = true;
            answerSummary.innerHTML = '<section class="kgpt-performance-overview"><div class="kgpt-performance-head"><div class="kgpt-performance-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9m5 10V5m5 14v-7m5 7V3"></path></svg></div><div class="kgpt-performance-title"><span>Kết quả đã xác thực</span><strong>Hiệu suất lượt làm</strong></div><span class="kgpt-performance-status" id="kgptPerformanceStatus">Đạt</span></div><div class="kgpt-performance-score-row"><strong class="kgpt-performance-score" id="kgptPerformanceScore">0.0</strong><span class="kgpt-performance-score-unit">/ 10 điểm</span><em class="kgpt-performance-accuracy" id="kgptPerformanceAccuracy">0% chính xác</em></div><div class="kgpt-performance-track"><i id="kgptPerformanceAccuracyBar"></i></div><small class="kgpt-performance-note">Kết quả được chấm và ghi nhận trực tiếp từ hệ thống.</small></section><div class="kgpt-answer-metrics"><div class="kgpt-answer-stat correct"><div class="kgpt-answer-stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg></div><div class="kgpt-answer-stat-copy"><span>Câu trả lời đúng</span><strong id="kgptCorrectAnswerCount">0</strong><small id="kgptCorrectAnswerMeta">0 / 0 câu</small></div></div><div class="kgpt-answer-stat wrong"><div class="kgpt-answer-stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"></path></svg></div><div class="kgpt-answer-stat-copy"><span>Câu trả lời sai</span><strong id="kgptWrongAnswerCount">0</strong><small id="kgptWrongAnswerMeta">0 / 0 câu</small></div></div></div>';
            detailInfoGrid.insertAdjacentElement('afterend', answerSummary);
        }
        let reviewHeaderActions = frameDoc.getElementById('kgptReviewHeaderActions');
        if (!reviewHeaderActions && detailTopline && deadlineBadge) {
            reviewHeaderActions = frameDoc.createElement('div');
            reviewHeaderActions.id = 'kgptReviewHeaderActions';
            reviewHeaderActions.className = 'kgpt-review-header-actions';
            detailTopline.insertBefore(reviewHeaderActions, deadlineBadge);
            reviewHeaderActions.appendChild(deadlineBadge);
        }
        if ((reviewHeaderActions || detailActions) && !frameDoc.getElementById('kgptReviewWrongFromDetail')) {
            const reviewButton = frameDoc.createElement('button');
            reviewButton.id = 'kgptReviewWrongFromDetail';
            reviewButton.type = 'button';
            reviewButton.className = 'kgpt-review-wrong-btn';
            reviewButton.hidden = true;
            reviewButton.innerHTML = `${reviewIcon}<span>Xem câu chưa đạt</span>`;
            reviewButton.addEventListener('click', () => frameWindow.openWrongAnswerReview?.());
            if (reviewHeaderActions) reviewHeaderActions.insertBefore(reviewButton, deadlineBadge || null);
            else detailActions.insertBefore(reviewButton, startButton);
        }

        const resultCard = frameDoc.getElementById('resultModal')?.querySelector('.result-card');
        if (resultCard && !frameDoc.getElementById('kgptReviewWrongAfterSubmit')) {
            const backButton = resultCard.querySelector('button.primary');
            if (backButton) {
                const buttonRow = frameDoc.createElement('div');
                buttonRow.className = 'kgpt-result-button-row';
                const reviewButton = frameDoc.createElement('button');
                reviewButton.id = 'kgptReviewWrongAfterSubmit';
                reviewButton.type = 'button';
                reviewButton.className = 'kgpt-review-wrong-btn';
                reviewButton.innerHTML = `${reviewIcon}<span>Xem câu chưa đạt</span>`;
                reviewButton.addEventListener('click', () => frameWindow.openWrongAnswerReview?.());
                backButton.before(buttonRow);
                buttonRow.append(reviewButton, backButton);
            }
        }

        const getSelectedStudentTaskId = () => {
            try { return frameWindow.eval('selectedAssignment?.id || null'); } catch (error) { return null; }
        };
        const escapeReviewHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        frameWindow.openWrongAnswerReview = function(taskId = null) {
            const activeTaskId = taskId || getSelectedStudentTaskId();
            const result = readTrainingLocalValue(TRAINING_RESULTS_STORAGE_KEY, {})?.[activeTaskId];
            const task = readTrainingLocalValue(TRAINING_ASSIGNMENTS_STORAGE_KEY, []).find(item => String(item.id) === String(activeTaskId));
            const details = Array.isArray(result?.answerDetails) ? result.answerDetails : [];
            const wrongAnswers = details.map((item, index) => ({ ...item, originalIndex: index })).filter(item => !item.isCorrect);
            const modal = frameDoc.getElementById('kgptWrongReviewModal');
            const body = frameDoc.getElementById('kgptWrongReviewBody');
            const summary = frameDoc.getElementById('kgptWrongReviewSummary');
            const title = frameDoc.getElementById('kgptWrongReviewTitle');
            const subtitle = frameDoc.getElementById('kgptWrongReviewSubtitle');
            if (!modal || !body || !summary || !title) return false;
            if (!result) {
                frameWindow.showToast?.('Chưa có kết quả làm bài để xem lại.');
                return false;
            }
            title.textContent = `Câu cần xem lại · ${task?.title || 'Bài tập'}`;
            if (subtitle) subtitle.textContent = `Điểm đã ghi nhận: ${Number(result.score || 0).toFixed(1)}/10 · Nộp lúc ${result.completedAt ? new Date(result.completedAt).toLocaleString('vi-VN') : '—'}`;
            const correctCount = details.filter(item => item.isCorrect).length;
            summary.innerHTML = `<span class="kgpt-review-stat"><b>${details.length}</b> Tổng câu</span><span class="kgpt-review-stat"><b>${correctCount}</b> Câu đúng</span><span class="kgpt-review-stat danger"><b>${wrongAnswers.length}</b> Cần xem lại</span>`;
            if (!details.length) {
                body.innerHTML = '<div class="kgpt-review-empty" style="border-color:#fde68a;background:#fffbeb"><div class="kgpt-review-empty-icon" style="background:#fef3c7;color:#d97706">!</div><h3 style="color:#92400e">Kết quả cũ chưa có chi tiết đáp án</h3><p style="color:#a16207">Hãy liên hệ giảng viên để mở lượt làm mới; hệ thống sẽ ghi nhận chi tiết từ lượt tiếp theo.</p></div>';
            } else if (!wrongAnswers.length) {
                body.innerHTML = '<div class="kgpt-review-empty"><div class="kgpt-review-empty-icon">✓</div><h3>Bạn đã trả lời đúng tất cả câu hỏi</h3><p>Không có câu nào cần xem lại trong lượt làm này.</p></div>';
            } else {
                body.innerHTML = `<div class="kgpt-review-list">${wrongAnswers.map(item => `<article class="kgpt-review-card"><div class="kgpt-review-card-head"><div class="kgpt-review-question">Câu ${item.originalIndex + 1}: ${escapeReviewHtml(item.question || '')}</div><span class="kgpt-review-state">${item.selectedAnswer ? 'Chưa đạt' : 'Chưa trả lời'}</span></div><div class="kgpt-review-answer-grid"><div class="kgpt-review-answer wrong"><b>Câu trả lời của bạn</b>${escapeReviewHtml(item.selectedAnswer || 'Chưa trả lời')}</div><div class="kgpt-review-answer correct"><b>Đáp án đúng</b>${escapeReviewHtml(item.correctAnswer || '—')}</div></div></article>`).join('')}</div>`;
            }
            frameDoc.getElementById('resultModal')?.classList.remove('open');
            modal.classList.add('open');
            body.scrollTop = 0;
            return true;
        };

        frameWindow.closeWrongAnswerReview = function() {
            frameDoc.getElementById('kgptWrongReviewModal')?.classList.remove('open');
            frameWindow.backDashboard?.();
        };

        const syncWrongReviewActions = () => {
            const taskId = getSelectedStudentTaskId();
            const result = taskId ? readTrainingLocalValue(TRAINING_RESULTS_STORAGE_KEY, {})?.[taskId] : null;
            const details = Array.isArray(result?.answerDetails) ? result.answerDetails : [];
            const serverCorrectCount = Number(result?.correctCount);
            const serverWrongCount = Number(result?.wrongCount);
            const hasServerCounts = Number.isFinite(serverCorrectCount) && Number.isFinite(serverWrongCount);
            const correctCount = hasServerCounts ? serverCorrectCount : details.filter(item => item.isCorrect).length;
            const wrongCount = hasServerCounts ? serverWrongCount : details.filter(item => !item.isCorrect).length;
            const serverQuestionCount = Number(result?.questionCount);
            const questionCount = Number.isFinite(serverQuestionCount) && serverQuestionCount >= 0
                ? serverQuestionCount
                : (hasServerCounts ? correctCount + wrongCount : details.length);
            const answerSummary = frameDoc.getElementById('kgptAnswerSummary');
            const correctCountElement = frameDoc.getElementById('kgptCorrectAnswerCount');
            const wrongCountElement = frameDoc.getElementById('kgptWrongAnswerCount');
            const correctMetaElement = frameDoc.getElementById('kgptCorrectAnswerMeta');
            const wrongMetaElement = frameDoc.getElementById('kgptWrongAnswerMeta');
            const scoreElement = frameDoc.getElementById('kgptPerformanceScore');
            const accuracyElement = frameDoc.getElementById('kgptPerformanceAccuracy');
            const accuracyBarElement = frameDoc.getElementById('kgptPerformanceAccuracyBar');
            const statusElement = frameDoc.getElementById('kgptPerformanceStatus');
            const hasCountData = !!result && (hasServerCounts || details.length > 0);
            const score = Number(result?.score) || 0;
            const accuracy = questionCount > 0 ? Math.round(correctCount * 100 / questionCount) : 0;
            const wrongRate = questionCount > 0 ? Math.round(wrongCount * 100 / questionCount) : 0;
            const passed = score >= 7;
            if (answerSummary) answerSummary.hidden = !hasCountData;
            if (correctCountElement) correctCountElement.textContent = String(correctCount);
            if (wrongCountElement) wrongCountElement.textContent = String(wrongCount);
            if (correctMetaElement) correctMetaElement.textContent = `${correctCount} / ${questionCount} câu · ${accuracy}%`;
            if (wrongMetaElement) wrongMetaElement.textContent = `${wrongCount} / ${questionCount} câu · ${wrongRate}%`;
            if (scoreElement) scoreElement.textContent = score.toFixed(1);
            if (accuracyElement) accuracyElement.textContent = `${accuracy}% chính xác`;
            if (accuracyBarElement) accuracyBarElement.style.width = `${Math.max(0, Math.min(100, accuracy))}%`;
            if (statusElement) {
                statusElement.textContent = passed ? 'Đạt' : 'Chưa đạt';
                statusElement.classList.toggle('not-passed', !passed);
            }
            const detailButton = frameDoc.getElementById('kgptReviewWrongFromDetail');
            const resultButton = frameDoc.getElementById('kgptReviewWrongAfterSubmit');
            if (detailButton) {
                detailButton.hidden = !result;
                const label = detailButton.querySelector('span');
                if (label) label.textContent = details.length ? (wrongCount ? `Xem lại ${wrongCount} câu chưa đạt` : 'Xem lại kết quả') : 'Xem lại kết quả';
            }
            if (resultButton) {
                resultButton.hidden = !result;
                const label = resultButton.querySelector('span');
                if (label) label.textContent = details.length ? (wrongCount ? `Xem ${wrongCount} câu chưa đạt` : 'Xem lại kết quả') : 'Xem lại kết quả';
            }
        };

        const syncAttemptState = () => {
            const button = frameDoc.getElementById('btnStartQuiz');
            const attemptInfo = frameDoc.getElementById('attemptInfo');
            if (!button) return;
            if (attemptInfo) attemptInfo.textContent = '1 lần';
            const buttonText = (button.textContent || '').trim();
            if (/Bắt đầu làm bài/i.test(buttonText)) {
                button.dataset.singleAttemptLocked = '0';
                button.disabled = false;
                button.closest('.detail-actions')?.classList.remove('single-attempt-locked');
            } else if (/Làm lại bài/i.test(buttonText) || /Đã hoàn thành/i.test(buttonText)) {
                button.dataset.singleAttemptLocked = '1';
                button.disabled = true;
                if (buttonText !== 'Đã hoàn thành · Không được làm lại') button.textContent = 'Đã hoàn thành · Không được làm lại';
                button.closest('.detail-actions')?.classList.add('single-attempt-locked');
            }
            syncWrongReviewActions();
        };

        if (!frameWindow.__kgptSingleAttemptInstalled) {
            frameWindow.__kgptSingleAttemptInstalled = true;
            const originalSelectTask = frameWindow.selectTask;
            if (typeof originalSelectTask === 'function') {
                frameWindow.selectTask = function(taskId) {
                    const result = originalSelectTask.apply(this, arguments);
                    const task = readTrainingLocalValue(TRAINING_ASSIGNMENTS_STORAGE_KEY, []).find(item => String(item.id) === String(taskId));
                    if (task) {
                        const bankTotal = (task.questions || []).length;
                        const deliveryCount = Math.min(bankTotal, Number(task.deliveryQuestionCount) || bankTotal);
                        const countLabel = frameDoc.getElementById('questionCount');
                        if (countLabel) countLabel.textContent = deliveryCount === bankTotal ? `${bankTotal} câu` : `${deliveryCount} / ${bankTotal} câu`;
                        const description = frameDoc.getElementById('detailDesc');
                        if (description && deliveryCount < bankTotal) description.textContent = `Hệ thống sẽ chọn ngẫu nhiên ${deliveryCount} trong ${bankTotal} câu và tráo đáp án riêng cho tài khoản của bạn.`;
                    }
                    return result;
                };
            }
            const originalSubmitQuiz = frameWindow.submitQuiz;
            if (typeof originalSubmitQuiz === 'function') {
                frameWindow.submitQuiz = async function(auto = false) {
                    if (frameWindow.__kgptSecureSubmitting) return false;
                    let questions = [];
                    let submittedAnswers = {};
                    let assignment = null;
                    try {
                        assignment = frameWindow.eval('selectedAssignment');
                        questions = frameWindow.eval('selectedAssignment?.questions || []');
                        submittedAnswers = frameWindow.eval('answers');
                    } catch (error) {}
                    const answeredCount = Object.keys(submittedAnswers || {}).length;
                    if (!auto && answeredCount < questions.length) {
                        const approved = await requestPremiumConfirmation({
                            title: 'Nộp bài khi chưa hoàn thành?',
                            message: `Bạn mới trả lời ${answeredCount}/${questions.length} câu. Các câu chưa trả lời sẽ không được tính điểm.`,
                            confirmText: 'Vẫn nộp bài',
                            cancelText: 'Tiếp tục làm'
                        }, frameWindow);
                        if (!approved) return false;
                    }
                    const attemptId = assignment?.__kgptAttemptId || frameWindow.__kgptAttemptId;
                    if (!attemptId || !questions.length) {
                        showPremiumTrainingAlert('Phiên làm bài không có mã xác thực từ máy chủ. Bài không được chấm để tránh ghi nhận kết quả giả mạo.', { title: 'Không thể nộp bài' });
                        return false;
                    }

                    frameWindow.__kgptSecureSubmitting = true;
                    try {
                        try { frameWindow.eval('clearInterval(timerHandle)'); } catch (error) {}
                        const answerPayload = questions.map((question, index) => ({
                            questionId: String(question.id || ''),
                            selectedIndex: submittedAnswers[index] === undefined ? null : Number(submittedAnswers[index])
                        }));
                        const store = await waitForTrainingDatabase();
                        const trustedResult = await store.submitQuiz(attemptId, answerPayload);
                        const score = Number(trustedResult?.score) || 0;
                        const earnedPoints = Number(trustedResult?.earnedPoints) || 0;
                        const totalPoints = Number(trustedResult?.totalPoints) || 0;
                        const resultForDisplay = {
                            taskId: String(trustedResult?.taskId || assignment.id),
                            attemptId: String(trustedResult?.attemptId || attemptId),
                            userId: String(trustedResult?.userId || ''),
                            studentName: trustedResult?.studentName || 'Học viên',
                            score,
                            earnedPoints,
                            totalPoints,
                            questionCount: Number(trustedResult?.questionCount) || questions.length,
                            correctCount: Number(trustedResult?.correctCount) || 0,
                            wrongCount: Number(trustedResult?.wrongCount) || 0,
                            completedAt: trustedResult?.completedAt || new Date().toISOString()
                        };

                        // Cache only the trusted public result for immediate UI use.
                        // A refresh always replaces this cache with server data.
                        const cachedResults = readTrainingLocalValue(TRAINING_RESULTS_STORAGE_KEY, {});
                        cachedResults[resultForDisplay.taskId] = resultForDisplay;
                        localStorage.setItem(TRAINING_RESULTS_STORAGE_KEY, JSON.stringify(cachedResults));

                        const scoreElement = frameDoc.getElementById('resultScore');
                        const detailElement = frameDoc.getElementById('resultDetails');
                        if (scoreElement) scoreElement.textContent = score.toFixed(1);
                        if (detailElement) detailElement.textContent = `Điểm số do máy chủ chấm: ${earnedPoints}/${totalPoints} điểm (${score >= 7 ? 'Đạt' : 'Chưa đạt'})`;
                        frameDoc.getElementById('resultModal')?.classList.add('open');
                        deactivateStudentExamSecurity();
                        setTimeout(syncWrongReviewActions, 0);
                        frameWindow.parent.postMessage({
                            type: 'kgpt:quiz-completed',
                            taskId: resultForDisplay.taskId
                        }, '*');
                        return trustedResult;
                    } catch (error) {
                        console.error('Máy chủ không chấm được bài:', error);
                        showPremiumTrainingAlert(error.message || 'Không thể chấm bài trên máy chủ. Kết quả chưa được ghi nhận.', { title: 'Nộp bài thất bại' });
                        return false;
                    } finally {
                        frameWindow.__kgptSecureSubmitting = false;
                    }
                };
            }
            const originalStartQuiz = frameWindow.startQuiz;
            if (typeof originalStartQuiz === 'function') {
                frameWindow.startQuiz = async function() {
                    const button = frameDoc.getElementById('btnStartQuiz');
                    if (button?.dataset.singleAttemptLocked === '1' || button?.disabled) {
                        frameWindow.showToast?.('Bài tập chỉ được làm một lần. Vui lòng liên hệ giảng viên nếu cần mở lại.');
                        return false;
                    }
                    let taskId = null;
                    try { taskId = frameWindow.eval('selectedAssignment?.id || null'); } catch (error) {}
                    if (!taskId) {
                        showPremiumTrainingAlert('Không xác định được bài tập cần bắt đầu.', { title: 'Thiếu bài tập' });
                        return false;
                    }
                    const originalText = button?.textContent || 'Bắt đầu làm bài →';
                    if (button) {
                        button.disabled = true;
                        button.textContent = 'Đang nhận đề bảo mật…';
                    }
                    try {
                        const store = await waitForTrainingDatabase();
                        const serverQuiz = await store.startQuiz(taskId);
                        if (!serverQuiz?.attemptId || !Array.isArray(serverQuiz?.assignment?.questions)) {
                            throw new Error('Máy chủ không trả về phiên làm bài hợp lệ.');
                        }
                        frameWindow.__kgptServerAssignment = serverQuiz.assignment;
                        frameWindow.eval('selectedAssignment = window.__kgptServerAssignment');
                        delete frameWindow.__kgptServerAssignment;
                        frameWindow.__kgptAttemptId = serverQuiz.attemptId;
                        frameWindow.__kgptActiveShuffleInfo = {
                            applied: true,
                            attemptNumber: Number(serverQuiz.attemptNumber) || 1,
                            generatedAt: new Date().toISOString(),
                            serverGraded: true
                        };
                        const result = originalStartQuiz.call(frameWindow);
                        frameWindow.showToast?.(`Đã nhận đề bảo mật cho lượt ${Number(serverQuiz.attemptNumber) || 1}`);
                        activateStudentExamSecurity(true);
                        return result;
                    } catch (error) {
                        console.error('Không nhận được đề thi bảo mật:', error);
                        showPremiumTrainingAlert(error.message || 'Không thể nhận đề từ máy chủ. Bài thi không được mở để tránh lộ đáp án.', { title: 'Không thể bắt đầu' });
                        if (button) {
                            button.disabled = false;
                            button.textContent = originalText;
                        }
                        return false;
                    }
                };
            }
            const originalSaveQuizResult = frameWindow.saveQuizResult;
            if (typeof originalSaveQuizResult === 'function') {
                frameWindow.saveQuizResult = function() {
                    throw new Error('Đã vô hiệu hóa ghi điểm từ trình duyệt. Hãy dùng chấm điểm phía máy chủ.');
                };
            }
        }

        syncAttemptState();
        if (frame.__kgptSingleAttemptObserver) frame.__kgptSingleAttemptObserver.disconnect();
        frame.__kgptSingleAttemptObserver = new MutationObserver(syncAttemptState);
        frame.__kgptSingleAttemptObserver.observe(startButton, { childList: true, subtree: true, characterData: true });
    }

    // Lắng nghe sự kiện chuyển đổi tab tra cứu/học tập
    const origSwitchTab = window.switchMainLookupTab;
    if (typeof origSwitchTab === 'function') {
        window.switchMainLookupTab = function(tab, persist) {
            const res = origSwitchTab.apply(this, arguments);
            if (res === false) return false;
            if (tab === 'teacher' || tab === 'student') {
                setTimeout(dispatchUserToFrames, 60);
                setTimeout(dispatchUserToFrames, 300);
                setTimeout(function() {
                    syncTrainingWorkspace().catch(error => console.error('Không đồng bộ được dữ liệu bài tập khi mở trang:', error));
                }, 80);
                if (tab === 'teacher') {
                    setTimeout(enforceTeacherResultReview, 90);
                    setTimeout(enforceTeacherResultReview, 360);
                }
                if (tab === 'student') {
                    setTimeout(enforceStudentSingleAttempt, 90);
                    setTimeout(enforceStudentSingleAttempt, 360);
                }
            }
            if (tab === 'ranking') {
                setTimeout(function() {
                    renderTrainingLeaderboard();
                    loadTrainingDataFromDatabase()
                        .then(renderTrainingLeaderboard)
                        .catch(error => console.error('Không đồng bộ được bảng xếp hạng:', error));
                }, 60);
            }
            return res;
        };
    }

    // Lắng nghe postMessage từ các iframe con
    window.addEventListener('message', function(event) {
        const data = event.data || {};
        if (data.type === 'kgpt:student-ready' || data.type === 'kgpt:teacher-ready') {
            dispatchUserToFrames();
            if (data.type === 'kgpt:student-ready') setTimeout(enforceStudentSingleAttempt, 120);
            if (data.type === 'kgpt:teacher-ready') setTimeout(enforceTeacherResultReview, 120);
            syncTrainingWorkspace()
                .then(() => { setTimeout(enforceStudentSingleAttempt, 220); })
                .catch(error => console.error('Không đồng bộ được dữ liệu bài tập:', error));
        }
        if (data.type === 'kgpt:refresh-assignments') {
            saveAssignmentsToDatabase().then(dispatchAssignmentsRefresh);
        }
        if (data.type === 'kgpt:quiz-completed') {
            deactivateStudentExamSecurity();
            saveResultsToDatabase().then(dispatchAssignmentsRefresh);
        }
        if (data.type === 'kgpt:quiz-retake-enabled') {
            Promise.all([saveResultsToDatabase(), saveResultHistoryToDatabase()]).then(() => {
                dispatchAssignmentsRefresh();
                setTimeout(enforceStudentSingleAttempt, 180);
            });
        }
    });

    // Khi iframe load xong
    const tFrame = document.getElementById('teacherLearningFrame');
    const sFrame = document.getElementById('studentLearningFrame');

    if (tFrame) {
        tFrame.addEventListener('load', function() {
            setTimeout(dispatchUserToFrames, 80);
            setTimeout(function() {
                syncTrainingWorkspace().catch(error => console.error('Không đồng bộ được dữ liệu bài tập sau khi iframe tải:', error));
            }, 100);
            setTimeout(enforceTeacherResultReview, 160);
        });
    }
    if (sFrame) {
        sFrame.addEventListener('load', function() {
            setTimeout(dispatchUserToFrames, 80);
            setTimeout(function() {
                syncTrainingWorkspace().catch(error => console.error('Không đồng bộ được dữ liệu bài tập sau khi iframe tải:', error));
            }, 100);
            setTimeout(enforceStudentSingleAttempt, 160);
        });
    }

    // Lắng nghe khi profile user thay đổi ở app chính
    function startTrainingDatabaseSyncAfterAuth(event) {
        resetTrainingDatabaseSync(event?.detail?.uid || getTrainingUserId());
        syncTrainingWorkspace()
            .catch(error => console.error('Không đồng bộ được dữ liệu bài tập sau đăng nhập:', error));
    }

    document.addEventListener('kgpt:auth-ready', function(event) {
        setTimeout(() => startTrainingDatabaseSyncAfterAuth(event), 0);
    });

    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(dispatchUserToFrames, 500);
        // Không gọi Supabase tại đây: DOMContentLoaded có thể xảy ra trước khi
        // Supabase khôi phục xong session. Đồng bộ sẽ được kích hoạt bởi
        // sự kiện kgpt:auth-ready ngay sau khi profile/RLS đã được xác minh.
        const nameEl = document.getElementById('userDisplayName');
        if (nameEl) {
            new MutationObserver(dispatchUserToFrames).observe(nameEl, { childList: true, subtree: true, characterData: true });
        }
    });
})();
