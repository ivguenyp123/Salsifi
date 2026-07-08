// [hub] Extrait de hub.js — ui/toast.js (portée globale, script classique)
        // ───── Toast simple ────────────────────────────────────────────────
        function showHubToast(html, type = 'info', duration = 3500) {
            let host = document.getElementById('hubToastHost');
            if (!host) {
                host = document.createElement('div');
                host.id = 'hubToastHost';
                host.style.cssText = `
                    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
                    z-index: 10000; display: flex; flex-direction: column; gap: 8px;
                    pointer-events: none;
                `;
                document.body.appendChild(host);
            }
            const t = document.createElement('div');
            t.style.cssText = `
                background: rgba(26, 18, 48, 0.95);
                border: 1px solid var(--border-strong);
                color: var(--text-primary);
                padding: 12px 22px;
                border-radius: 999px;
                font-family: var(--font-body);
                font-size: 14px;
                backdrop-filter: blur(20px);
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
                pointer-events: auto;
                opacity: 0;
                transform: translateY(20px);
                transition: opacity 0.25s, transform 0.25s;
            `;
            t.innerHTML = html;
            host.appendChild(t);
            requestAnimationFrame(() => {
                t.style.opacity = '1';
                t.style.transform = 'translateY(0)';
            });
            setTimeout(() => {
                t.style.opacity = '0';
                t.style.transform = 'translateY(20px)';
                setTimeout(() => t.remove(), 300);
            }, duration);
        }

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  DRILLDOWN STATS — calculs par chemin                            ║
        // ╚══════════════════════════════════════════════════════════════════╝
