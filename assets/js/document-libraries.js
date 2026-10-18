(function () {
    'use strict';
    const libraries = {"xlsx": ["XLSX", "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"], "mammoth": ["mammoth", "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js"], "jszip": ["JSZip", "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"]};
    const pending = new Map();
    window.ensureDocumentLibrary = function (name) {
        const entry = libraries[name];
        if (!entry) return Promise.reject(new Error('Thư viện không được hỗ trợ: ' + name));
        if (window[entry[0]]) return Promise.resolve(window[entry[0]]);
        if (pending.has(name)) return pending.get(name);
        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            let timer;
            const fail = () => {
                clearTimeout(timer);
                script.onload = script.onerror = null;
                script.remove();
                reject(new Error('Không tải được thư viện ' + name + '. Hãy kiểm tra kết nối mạng và thử lại.'));
            };
            script.src = entry[1];
            script.async = true;
            script.onload = () => {
                clearTimeout(timer);
                script.onload = script.onerror = null;
                if (window[entry[0]]) resolve(window[entry[0]]);
                else fail();
            };
            script.onerror = fail;
            timer = setTimeout(fail, 30000);
            document.head.appendChild(script);
        }).catch(error => { pending.delete(name); throw error; });
        pending.set(name, promise);
        return promise;
    };
})();
