(function () {
    const pages = {"teacher": "assets/pages/teacher.html", "student": "assets/pages/student.html", "users": "assets/pages/users.html", "feedbacks": "assets/pages/feedbacks.html"};
    window.__loadEmbeddedPage = async function (frame, key) {
        if (!frame || frame.dataset.loaded || frame.dataset.loading) return;
        if (!pages[key]) return;
        frame.dataset.loading = '1';
        frame.setAttribute('aria-busy', 'true');
        try {
            const response = await fetch(new URL(pages[key], document.baseURI));
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const content = await response.text();
            frame.srcdoc = content;
            frame.dataset.loaded = '1';
        } catch (error) {
            console.error('Không tải được trang ' + key, error);
            window.customAlert?.('Không tải được trang. Hãy kiểm tra kết nối và mở lại mục này.', 'error');
        } finally {
            delete frame.dataset.loading;
            frame.removeAttribute('aria-busy');
        }
    };
})();
