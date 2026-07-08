// [hub] Extrait de hub.js — workspaces/workspace-storage.js (portée globale, script classique)
        const WS_STORAGE_KEY = 'devops_hub_workspaces';
        let _wsState = {
            data: null,         // référence vers l'objet localStorage parsé
            dropdownInit: false,
            currentId: null     // workspace courant si vue active
        };

        function _wsReadStorage() {
            try {
                const raw = localStorage.getItem(WS_STORAGE_KEY);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                return (parsed && Array.isArray(parsed.workspaces)) ? parsed : null;
            } catch (e) {
                console.warn('[ws] localStorage illisible:', e);
                return null;
            }
        }

        function _wsEscape(str) {
            const div = document.createElement('div');
            div.textContent = String(str ?? '');
            return div.innerHTML;
        }

        function _wsPopulateDropdown() {
            _wsState.data = _wsReadStorage();
            const list = document.getElementById('wsDropdownList');
            if (!list) return;

            if (!_wsState.data || _wsState.data.workspaces.length === 0) {
                list.innerHTML = `
                    <div class="ws-dropdown-empty">
                        Aucun workspace configuré.<br>
                        Crée-en un, ou importe un JSON existant.
                    </div>`;
                return;
            }
            list.innerHTML = _wsState.data.workspaces.map(ws => {
                const id = _wsEscape(ws.id);
                const count = (ws.repositories || []).length;
                return `
                    <div class="ws-item">
                        <div class="ws-item-icon" onclick="wsOpenView('${id}')" style="cursor:pointer;">🗂️</div>
                        <div class="ws-item-info" onclick="wsOpenView('${id}')" style="cursor:pointer;">
                            <div class="ws-item-name">${_wsEscape(ws.name)}</div>
                            <div class="ws-item-meta">${count} repo${count > 1 ? 's' : ''}</div>
                        </div>
                        <div class="ws-item-actions" onclick="event.stopPropagation()">
                            <button class="ws-item-action" title="Exporter en JSON" onclick="wsExportWorkspace('${id}')">📤</button>
                            <button class="ws-item-action" title="Renommer" onclick="wsRenameWorkspace('${id}')">✏️</button>
                            <button class="ws-item-action is-danger" title="Supprimer" onclick="wsDeleteWorkspace('${id}')">🗑️</button>
                        </div>
                    </div>
                `;
            }).join('');
            _wsState.dropdownInit = true;
        }

        function wsToggleDropdown(e) {
            if (e) e.stopPropagation();
            const dd = document.getElementById('wsDropdown');
            const isOpening = !dd.classList.contains('is-open');
            if (isOpening) _wsPopulateDropdown();  // lazy refresh à chaque ouverture
            dd.classList.toggle('is-open');
        }

        function _wsCloseDropdown() {
            document.getElementById('wsDropdown')?.classList.remove('is-open');
        }

        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('wsPillWrap');
            if (wrap && !wrap.contains(e.target)) _wsCloseDropdown();
        });

        function wsOpenView(id) {
            const data = _wsState.data || _wsReadStorage();
            if (!data) return;
            const ws = data.workspaces.find(w => w.id === id);
            if (!ws) return;

            _wsState.currentId = id;
            document.getElementById('wsBreadcrumbName').textContent = ws.name;
            document.getElementById('wsBreadcrumb').classList.add('is-visible');
            document.getElementById('repoPicker').style.display = 'none';
            document.getElementById('wsViewTitle').textContent = ws.name;
            const repos = ws.repositories || [];
            const reposCount = repos.length;
            const tagline = reposCount > 0
                ? `<strong>${reposCount}</strong> repo${reposCount > 1 ? 's' : ''} regroupés dans ce workspace`
                : `Workspace vide`;
            document.getElementById('wsViewTagline').innerHTML = tagline;
            document.getElementById('wsStatRepoCount').textContent = reposCount;
            document.getElementById('wsReposCount').textContent = reposCount > 0 ? `(${reposCount})` : '';

            // Liste des repos
            const listEl = document.getElementById('wsReposList');
            if (reposCount === 0) {
                listEl.innerHTML = `<div class="ws-repos-empty">Aucun repo dans ce workspace.</div>`;
            } else {
                listEl.innerHTML = repos.map(r => `
                    <div class="ws-repo-row">
                        <div>
                            <div class="ws-repo-name">${_wsEscape(r.name || r.path || 'repo')}</div>
                            <div class="ws-repo-path">${_wsEscape(r.path_with_namespace || r.path || '')}</div>
                        </div>
                        <span class="ws-repo-arrow">→</span>
                    </div>
                `).join('');
            }

            document.body.classList.add('is-workspace-mode');
            document.getElementById('viewWorkspace').classList.add('is-active');
            _wsCloseDropdown();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function wsCloseView() {
            document.body.classList.remove('is-workspace-mode');
            document.getElementById('viewWorkspace').classList.remove('is-active');
            document.getElementById('wsBreadcrumb').classList.remove('is-visible');
            document.getElementById('repoPicker').style.display = '';
            _wsState.currentId = null;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function wsGoToSelector() {
            wsOpenModal('create');
        }

        // ───── Gestion workspaces : storage write helper ──────────────────
        function _wsWriteData(data) {
            // Écriture localStorage : ne touche QUE .workspaces (et meta minimales du parent).
            // token, gitlabUrl, username, activeWorkspaceId préservés tels quels.
            localStorage.setItem(WS_STORAGE_KEY, JSON.stringify(data));
            _wsState.data = data;
        }

        function _wsBootstrapEmptyStorage() {
            // Si le user n'a jamais eu de workspace mais qu'il est auth, on crée le squelette.
            if (!auth || !auth.gitlabUrl || !auth.token) return null;
            return {
                gitlabUrl: auth.gitlabUrl,
                token: auth.token,
                username: auth.username || 'user',
                activeWorkspaceId: null,
                workspaces: []
            };
        }

        // ═══════════════════════════════════════════════════════════════════
        // MODAL UNIQUE — créer / éditer un workspace (nom + repos en un coup)
        // ═══════════════════════════════════════════════════════════════════
