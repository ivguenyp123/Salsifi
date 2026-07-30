/* releasenotes · index.js — entrée & câblage (chargé en dernier). */

        const ACTION_HANDLERS = {
            'go-back':              () => goBack(),
            'refresh-all':          () => refreshAll(),
            'generate-all-missing': () => generateAllMissing(),
            'close-modal':          () => closeModal(),
            'download-markdown':    () => downloadMarkdown(),
            'push-to-gitlab':       () => pushToGitLab(),
            'open-push-modal':      () => openPushModal(),
            'select-tag':           (e, el) => selectTag(el.dataset.tagName),
            'view-existing':        (e, el) => viewExistingRelease(el.dataset.tagName),
            'switch-tab':           (e, el) => switchPreviewTab(el.dataset.tab, el),
            'modal-overlay-click':  (e, el) => { if (e.target === el) closeModal(); }
        };


        function attachEventDelegation() {
            document.body.addEventListener('click', (e) => {
                const el = e.target.closest('[data-action]');
                if (!el) return;
                const handler = ACTION_HANDLERS[el.dataset.action];
                if (handler) handler(e, el);
            });
            // Fermeture du modal via Escape (avant : seulement × ou Annuler).
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeModal();
            });
            // Listener "input" sur l'éditeur via delegation (avant : oninput inline).
            document.body.addEventListener('input', (e) => {
                if (e.target.id === 'markdownEditor') updateMarkdownFromEditor();
            });
        }

        // ══════════════════════════════════════════════════════════════════
        //  INIT
        // ══════════════════════════════════════════════════════════════════

        document.addEventListener('DOMContentLoaded', () => {
            // Nouveau format hub v2 : localStorage 'devops_hub_workspaces' (JSON)
            // + 'hub_selected_repo_id' + cache 'hub_cache_repos_<username>' pour le nom.
            // Fallback ancien format sessionStorage pour rétro-compat.
            // Pattern aligné sur bus-factor.js.
            // Auth centralisee (devops_hub_workspaces + fallback sessionStorage legacy)
            const _auth = window.Salsifi.loadAuth({ redirect: false });
            if (_auth) { token = _auth.token; gitlabBaseUrl = _auth.gitlabUrl; }

            // Project ID : nouveau format (sélection hub) puis ancien
            projectId = localStorage.getItem('hub_selected_repo_id')
                     || sessionStorage.getItem('gitlab_project_id')
                     || '';

            // Nom du projet : sessionStorage en priorité (vient peut-être de la page précédente),
            // sinon on essaie le cache repos du hub.
            projectName = sessionStorage.getItem('gitlab_project') || '';
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
            if (!projectName) projectName = projectId ? `Projet #${projectId}` : 'Projet';

            document.getElementById('projectName').textContent = projectName;

            // Guard strict — sinon on retourne à l'auth.
            if (!token || !projectId || !gitlabBaseUrl) {
                window.location.href = 'login.html';
                return;
            }

            attachEventDelegation();
            loadAll();
        });

