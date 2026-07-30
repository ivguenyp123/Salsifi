/* bus-factor · index.js — entrée & câblage (chargé en dernier). */

        async function init() {
            // Nouveau format hub : localStorage 'devops_hub_workspaces' (JSON) + 'hub_selected_repo_id'
            // Auth centralisee (devops_hub_workspaces + fallback sessionStorage legacy)
            const _auth = window.Salsifi.loadAuth({ redirect: false });
            if (_auth) { token = _auth.token; GITLAB_URL = _auth.gitlabUrl; }

            // Project ID : nouveau format puis ancien
            const selectedRepoId = localStorage.getItem('hub_selected_repo_id');
            projectId = selectedRepoId || sessionStorage.getItem('gitlab_project_id');

            if (!token || !GITLAB_URL || !projectId) {
                window.location.href = 'login.html';
                return;
            }

            // Nom du projet : ancien format sinon depuis le cache repos du hub
            let projectName = sessionStorage.getItem('gitlab_project');
            if (!projectName && _auth) {
                try {
                    const cacheKey = 'hub_cache_repos_' + (_auth.username || '');
                    const cacheRaw = localStorage.getItem(cacheKey);
                    if (cacheRaw) {
                        const cache = JSON.parse(cacheRaw);
                        const found = cache.repos && cache.repos.find(r => String(r.id) === String(projectId));
                        if (found) projectName = found.name;
                    }
                } catch { /* ignore */ }
            }
            document.getElementById('projectName').textContent = projectName || `Projet #${projectId}`;

            attachEventDelegation();
            await loadBusFactorData();
        }

        // Event delegation centralisée pour les data-action (anciennement onclick inline).

        function attachEventDelegation() {
            document.body.addEventListener('click', (e) => {
                const el = e.target.closest('[data-action]');
                if (!el) return;
                if (el.dataset.action === 'refresh') refresh();
            });
        }

        // ══════════════════════════════════════════════════════════════════
        //  CHARGEMENT DES DONNÉES
        // ══════════════════════════════════════════════════════════════════


        async function refresh() {
            const btn = document.getElementById('refreshBtn');
            btn.classList.add('loading');
            btn.disabled = true;
            btn.innerHTML = '⏳ Chargement...';

            document.getElementById('mainContent').style.display = 'none';
            document.getElementById('loadingState').style.display = 'block';
            // Réinjecter le loading par défaut (loadBusFactorData peut l'avoir
            // remplacé par un message d'erreur lors du précédent run).
            document.getElementById('loadingState').innerHTML = `
                <div class="loading-spinner">🚌</div>
                <div class="loading-text">Analyse des contributions en cours...</div>
            `;

            await loadBusFactorData();

            btn.classList.remove('loading');
            btn.disabled = false;
            btn.innerHTML = '🔄 Actualiser';
        }

        // ══════════════════════════════════════════════════════════════════
        //  DÉMARRAGE
        // ══════════════════════════════════════════════════════════════════

        // Wrapper DOMContentLoaded explicite (avant : init() en fin de fichier).
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
