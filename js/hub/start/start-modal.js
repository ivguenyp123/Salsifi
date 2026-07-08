// [hub] Extrait de hub.js — start/start-modal.js (portée globale, script classique)
        function openStartModal() {
            if (!allRepos || allRepos.length === 0) { return; }
            const overlay = document.getElementById('startModal');
            overlay.style.display = 'flex';
            requestAnimationFrame(() => overlay.classList.add('is-open'));
            document.getElementById('startModalSearch').value = '';
            renderStartModalRepos();
            document.getElementById('startModalSearch').focus();
        }
        function closeStartModal() {
            const overlay = document.getElementById('startModal');
            overlay.classList.remove('is-open');
            setTimeout(() => { overlay.style.display = 'none'; }, 200);
        }
        function renderStartModalRepos() {
            const list = document.getElementById('startModalList');
            const q = (document.getElementById('startModalSearch').value || '').trim().toLowerCase();
            const filtered = q
                ? allRepos.filter(r =>
                    r.name.toLowerCase().includes(q) ||
                    (r.path || '').toLowerCase().includes(q))
                : allRepos;
            if (filtered.length === 0) {
                list.innerHTML = `<div class="ws-modal-loading">${q ? 'Aucun résultat' : 'Aucun projet accessible'}</div>`;
                return;
            }
            list.innerHTML = filtered.map(r => `
                <div class="repo-item" data-repo-id="${r.id}" role="button" tabindex="0">
                    <span class="repo-item-icon">📦</span>
                    <div class="repo-item-body">
                        <div class="repo-item-name">${escapeHtml(r.name)}</div>
                        <div class="repo-item-path">${escapeHtml(r.path || '')}</div>
                    </div>
                    <span class="repo-item-check" style="opacity:0.45">→</span>
                </div>`).join('');
            list.querySelectorAll('.repo-item').forEach(el => {
                const id = parseInt(el.dataset.repoId, 10);
                el.addEventListener('click', () => launchScaffolder(id));
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launchScaffolder(id); }
                });
            });
        }
        function launchScaffolder(repoId) {
            const repo = (allRepos || []).find(r => r.id === repoId);
            if (!repo || !auth) return;
            // Le Scaffolder lit l'auth via localStorage (modèle plateforme) et le repo via ?repo=.
            window.location.href = 'project-scaffolder.html?repo=' + encodeURIComponent(repo.id);
        }
