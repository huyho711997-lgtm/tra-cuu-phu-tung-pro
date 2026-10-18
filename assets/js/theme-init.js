document.documentElement.classList.toggle('dark', localStorage.getItem('theme') === 'dark');
        function toggleTheme() {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        }
        window.getPremiumEmptyStateHTML = function({ icon = 'search', title = 'Không tìm thấy dữ liệu', desc = '', actionText = '', actionClick = '' }) {
            let svgIcon = '';
            if (icon === 'search') {
                svgIcon = `
                <svg class="premium-empty-svg text-blue-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-dasharray="3 3" class="opacity-20" />
                    <g transform="translate(-0.125 -0.125)">
                        <circle cx="10.5" cy="10.5" r="5" stroke="currentColor" stroke-width="1.8" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M14.25 14.25l4.5 4.5" />
                    </g>
                </svg>`;
            } else if (icon === 'ocr') {
                svgIcon = `
                <svg class="premium-empty-svg text-cyan-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    <path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3 11.5h18" class="opacity-80 animate-pulse" />
                </svg>`;
            } else if (icon === 'compare') {
                svgIcon = `
                <svg class="premium-empty-svg text-indigo-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0-4.5 4.5M21 7.5H7.5" />
                    <circle cx="12" cy="12" r="3.5" stroke="currentColor" stroke-dasharray="2 2" class="opacity-50" />
                </svg>`;
            } else if (icon === 'excel') {
                svgIcon = `
                <svg class="premium-empty-svg text-emerald-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125V3.375c0-.621.504-1.125 1.125-1.125h12.75c.621 0 1.125.504 1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375V18.375c0 .621-.504 1.125-1.125 1.125m-17.25 0H21m-18-6h18M5.25 6h.008v.008H5.25V6ZM7.5 6h.008v.008H7.5V6Zm2.25 0h.008v.008H9.75V6Z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-5m3 5v-3m3 3v-2" stroke-width="1.2" class="opacity-70" />
                </svg>`;
            } else if (icon === 'feedback') {
                svgIcon = `
                <svg class="premium-empty-svg text-amber-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
                </svg>`;
            }
            let actionButton = '';
            if (actionText && actionClick) {
                const actionIcon = icon === 'ocr'
                    ? `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke-linecap="round" stroke-width="2"></path></svg>`
                    : icon === 'compare'
                        ? `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="5.5" stroke-width="2"></circle><path d="m14.5 14.5 4 4M8 10.5h5M10.5 8v5" stroke-linecap="round" stroke-width="2"></path></svg>`
                        : '';
                actionButton = `<button type="button" onclick="${actionClick}" class="premium-empty-action">${actionIcon}<span>${actionText}</span></button>`;
            }
            return `
                <div class="premium-empty-state premium-empty-${icon}">
                    <div class="premium-empty-visual" aria-hidden="true">
                        <span class="premium-empty-gear"></span>
                        <span class="premium-empty-orbit"></span>
                        <span class="premium-empty-sweep"></span>
                        <span class="premium-empty-node node-a"></span>
                        <span class="premium-empty-node node-b"></span>
                        <span class="premium-empty-node node-c"></span>
                        ${svgIcon}
                    </div>
                    <div class="premium-empty-title">${title}</div>
                    <div class="premium-empty-desc">${desc}</div>
                    ${actionButton}
                </div>
            `;
        };
