// [hub] Extrait de hub.js — workspaces/workspace-modal.js (portée globale, script classique)
        let _wsModalProjects = [];      // tous les projets GitLab du user
        const _wsModalSelected = new Set();  // ids des projets cochés
        let _wsModalMode = 'create';    // 'create' | 'edit'
        let _wsModalEditingId = null;   // id du ws en cours d'édition (si edit)

        async function wsOpenModal(mode, wsId) {
            console.log('[ws] openModal mode=', mode, 'wsId=', wsId);
            if (!auth || !auth.gitlabUrl || !auth.token) {
                _wsToast('Auth GitLab manquante — recharge la page', 'error');
                return;
            }

            _wsModalMode = mode;
            _wsModalEditingId = (mode === 'edit') ? (wsId || _wsState.currentId) : null;
            _wsModalSelected.clear();

            // Préremplir le nom + cocher les repos existants si mode=edit
            const nameInput = document.getElementById('wsModalName');
            const titleEl   = document.getElementById('wsModalTitle');
            if (mode === 'edit' && _wsModalEditingId) {
                const data = _wsReadStorage();
                const ws = data && data.workspaces.find(w => w.id === _wsModalEditingId);
                if (!ws) {
                    _wsToast('Workspace introuvable', 'error');
                    return;
                }
                titleEl.textContent = `Modifier "${ws.name}"`;
                nameInput.value = ws.name;
                (ws.repositories || []).forEach(r => _wsModalSelected.add(r.id));
            } else {
                titleEl.textContent = 'Nouveau workspace';
                nameInput.value = '';
            }

            document.getElementById('wsModalSearch').value = '';
            _wsCloseDropdown();

            // Ouverture EXPLICITE (style direct, pas de class) pour éliminer tout problème CSS
            const overlay = document.getElementById('wsModal');
            overlay.style.display = 'flex';
            overlay.classList.add('is-open');  // pour l'animation au cas où

            // Liste : loading
            const listEl = document.getElementById('wsModalList');
            listEl.innerHTML = '<div class="ws-modal-loading">⏳ Chargement des projets GitLab…</div>';
            _wsUpdateSaveBtn();

            // Fetch GitLab — toutes les pages, via la pagination commune (bornée)
            try {
                const allProjects = await Salsifi.gitlabPaginate(
                    auth.gitlabUrl, auth.token,
                    '/projects?membership=true&order_by=name&sort=asc',
                    { throwOnError: true }
                );
                _wsModalProjects = allProjects;
                console.log('[ws] projets reçus:', _wsModalProjects.length);
                wsRenderModalRepos();
            } catch (e) {
                console.error('[ws] fetch GitLab a échoué:', e);
                listEl.innerHTML = `<div class="ws-modal-empty">❌ ${_wsEscape(e.message || String(e))}</div>`;
            }
        }

        function wsCloseModal() {
            const overlay = document.getElementById('wsModal');
            overlay.style.display = 'none';
            overlay.classList.remove('is-open');
            _wsModalSelected.clear();
            _wsModalEditingId = null;
        }

        function wsRenderModalRepos() {
            const search = document.getElementById('wsModalSearch').value.toLowerCase();
            const listEl = document.getElementById('wsModalList');

            const filtered = _wsModalProjects.filter(p => {
                if (!search) return true;
                return (p.name && p.name.toLowerCase().includes(search))
                    || (p.path_with_namespace && p.path_with_namespace.toLowerCase().includes(search));
            });

            if (filtered.length === 0) {
                listEl.innerHTML = '<div class="ws-modal-empty">Aucun projet trouvé.</div>';
                return;
            }

            listEl.innerHTML = filtered.map(p => {
                const sel = _wsModalSelected.has(p.id);
                return `
                    <div class="ws-modal-row ${sel ? 'is-selected' : ''}" onclick="wsToggleModalRepo(${p.id})">
                        <input type="checkbox" ${sel ? 'checked' : ''}
                            onclick="event.stopPropagation(); wsToggleModalRepo(${p.id})">
                        <div class="ws-modal-row-info">
                            <div class="ws-modal-row-name">${_wsEscape(p.name)}</div>
                            <div class="ws-modal-row-path">${_wsEscape(p.path_with_namespace || '')}</div>
                        </div>
                        <span class="ws-modal-badge ${p.visibility || 'private'}">${p.visibility || 'private'}</span>
                    </div>
                `;
            }).join('');
        }

        function wsToggleModalRepo(id) {
            if (_wsModalSelected.has(id)) _wsModalSelected.delete(id);
            else _wsModalSelected.add(id);
            wsRenderModalRepos();
            _wsUpdateSaveBtn();
        }

        function _wsUpdateSaveBtn() {
            const n = _wsModalSelected.size;
            const name = document.getElementById('wsModalName').value.trim();
            document.getElementById('wsModalCount').textContent =
                n === 0 ? 'Aucun repo sélectionné' : `${n} repo${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''}`;
            // Sauver autorisé dès qu'il y a un nom (les repos peuvent être 0, on autorise un workspace vide)
            document.getElementById('wsModalSaveBtn').disabled = (name.length === 0);
        }

        function wsSaveModal() {
            const name = document.getElementById('wsModalName').value.trim();
            if (!name) { _wsToast('Donne un nom au workspace', 'error'); return; }

            const data = _wsReadStorage() || _wsBootstrapEmptyStorage();
            if (!data) { _wsToast('Storage indisponible', 'error'); return; }

            // Format identique workspace-hub.html
            const selectedRepos = _wsModalProjects
                .filter(p => _wsModalSelected.has(p.id))
                .map(p => ({
                    id: p.id,
                    name: p.name,
                    path: p.path_with_namespace,
                    url: p.web_url,
                    visibility: p.visibility,
                    defaultBranch: p.default_branch || 'main'
                }));

            let savedWs;
            if (_wsModalMode === 'edit' && _wsModalEditingId) {
                // Édition : on remplace nom + repositories
                const ws = data.workspaces.find(w => w.id === _wsModalEditingId);
                if (!ws) { _wsToast('Workspace introuvable', 'error'); return; }
                // Anti-doublon nom (sauf le ws lui-même)
                const others = new Set(data.workspaces.filter(w => w.id !== ws.id).map(w => w.name));
                if (others.has(name)) {
                    _wsToast(`Un autre workspace s'appelle déjà "${name}"`, 'error');
                    return;
                }
                ws.name = name;
                ws.repositories = selectedRepos;
                ws.updated = new Date().toISOString();
                savedWs = ws;
            } else {
                // Création : anti-doublon nom
                let finalName = name;
                const existing = new Set(data.workspaces.map(w => w.name));
                if (existing.has(finalName)) {
                    let n = 2;
                    while (existing.has(`${name} (${n})`)) n++;
                    finalName = `${name} (${n})`;
                }
                savedWs = {
                    id: (crypto.randomUUID ? crypto.randomUUID() : 'ws_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
                    name: finalName,
                    repositories: selectedRepos,
                    created: new Date().toISOString(),
                    updated: new Date().toISOString()
                };
                data.workspaces.push(savedWs);
            }

            _wsWriteData(data);
            // sessionStorage pour compat avec dora-workspace.html / gouvernance-repo.html
            try { sessionStorage.setItem('current_workspace', JSON.stringify(savedWs)); } catch (e) { /* noop */ }
            wsCloseModal();
            _wsPopulateDropdown();
            wsOpenView(savedWs.id);
            _wsToast(`✓ "${savedWs.name}" sauvegardé (${selectedRepos.length} repo${selectedRepos.length > 1 ? 's' : ''})`);
        }
