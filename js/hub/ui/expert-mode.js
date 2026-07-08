// [hub] Extrait de hub.js — ui/expert-mode.js (portée globale, script classique)
        // ───── MODE EXPERT : grille de tous les modules des 4 chemins ──────
        // Réutilise EXACTEMENT la même navigation que les chemins :
        // MODULE_URLS + MODULE_REPO_AWARE + currentRepo (?repo=<id>).
        function openExpertMode() {
            const overlay = document.getElementById('expertModal');
            const grid = document.getElementById('expert-modules');
            if (!overlay || !grid) return;

            // Aplatit les modules des 4 chemins dans l'ordre measure → deliver → inspect → collab
            const cards = [];
            Object.keys(DIRECTIONS).forEach(key => {
                const dir = DIRECTIONS[key];
                (dir.modules || []).forEach(m => {
                    cards.push(moduleCardHtml(m));
                });
            });
            grid.innerHTML = cards.join('');

            overlay.scrollTop = 0;
            requestAnimationFrame(() => overlay.classList.add('active'));
            document.body.style.overflow = 'hidden';
        }

        function closeExpertMode() {
            const overlay = document.getElementById('expertModal');
            if (!overlay) return;
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }

        // Clic sur un module de la grille expert : même logique que #dd-modules
        document.getElementById('expert-modules')?.addEventListener('click', e => {
            const card = e.target.closest('.dd-module[data-module-name]');
            if (!card) return;
            const name = card.dataset.moduleName;
            if (MODULE_DISABLED[name]) {
                showHubToast(`🔒 <strong>${escapeHtml(name)}</strong> — ${escapeHtml(MODULE_DISABLED[name])}`, 'info');
                return;
            }
            let url = MODULE_URLS[name];
            if (url) {
                if (MODULE_REPO_AWARE.has(name) && currentRepo) {
                    url += '?repo=' + encodeURIComponent(currentRepo.id);
                }
                window.location.href = url;
            } else {
                showHubToast(`📦 Module <strong>${escapeHtml(name)}</strong> à venir`, 'info');
            }
        });

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  AUTH + REPO PICKER + DONNÉES GITLAB                             ║
        // ╚══════════════════════════════════════════════════════════════════╝
