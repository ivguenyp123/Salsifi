// [hub] Extrait de hub.js — workspaces/workspace-actions.js (portée globale, script classique)
        function wsOpenModule(kind) {
            if (!_wsState.currentId) return;
            const data = _wsState.data || _wsReadStorage();
            const ws = data && data.workspaces.find(w => w.id === _wsState.currentId);
            if (!ws) return;
            // Pattern existant : on passe le workspace courant via sessionStorage
            sessionStorage.setItem('current_workspace', JSON.stringify(ws));
            if (kind === 'dora')        window.location.href = 'dora-workspace.html';
            else if (kind === 'gouvernance') window.location.href = 'gouvernance-repo.html?scope=workspace';
            else if (kind === 'access')      window.location.href = 'access-workspace.html';
        }

        function wsRenameWorkspace(id) {
            console.log('[ws] rename id=', id);
            const data = _wsReadStorage();
            if (!data) { _wsToast('Storage indisponible', 'error'); return; }
            const ws = data.workspaces.find(w => w.id === id);
            if (!ws) { _wsToast('Workspace introuvable', 'error'); return; }
            const newName = (prompt('Nouveau nom :', ws.name) || '').trim();
            if (!newName || newName === ws.name) return;
            const existing = new Set(data.workspaces.filter(w => w.id !== id).map(w => w.name));
            if (existing.has(newName)) {
                _wsToast(`Un workspace "${newName}" existe déjà.`, 'error');
                return;
            }
            ws.name = newName;
            ws.updated = new Date().toISOString();
            _wsWriteData(data);
            _wsPopulateDropdown();
            if (_wsState.currentId === id) {
                document.getElementById('wsBreadcrumbName').textContent = newName;
                document.getElementById('wsViewTitle').textContent = newName;
            }
            _wsToast(`✓ Renommé en "${newName}"`);
        }

        function wsDeleteWorkspace(id) {
            console.log('[ws] delete id=', id);
            const data = _wsReadStorage();
            if (!data) { _wsToast('Storage indisponible', 'error'); return; }
            const ws = data.workspaces.find(w => w.id === id);
            if (!ws) { _wsToast('Workspace introuvable', 'error'); return; }
            if (!confirm(`Supprimer le workspace "${ws.name}" ?\n\n(Les repos GitLab eux-mêmes ne sont PAS supprimés.)`)) return;
            data.workspaces = data.workspaces.filter(w => w.id !== id);
            if (data.activeWorkspaceId === id) {
                data.activeWorkspaceId = data.workspaces[0]?.id || null;
            }
            _wsWriteData(data);
            _wsPopulateDropdown();
            if (_wsState.currentId === id) wsCloseView();
            _wsToast(`✓ "${ws.name}" supprimé`);
        }

        function wsExportWorkspace(id) {
            console.log('[ws] export id=', id);
            const data = _wsReadStorage();
            if (!data) { _wsToast('Storage indisponible', 'error'); return; }
            const ws = data.workspaces.find(w => w.id === id);
            if (!ws) {
                _wsToast('Workspace introuvable (id=' + id + ')', 'error');
                console.error('[ws] export: ws not found. Available ids:', data.workspaces.map(w => w.id));
                return;
            }
            try {
                const blob = new Blob([JSON.stringify(ws, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const safe = (ws.name || 'workspace').replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
                a.href = url;
                a.download = `workspace-${safe}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                _wsToast(`✓ "${ws.name}" exporté`);
            } catch (e) {
                console.error('[ws] export failed:', e);
                _wsToast('Échec de l\'export : ' + e.message, 'error');
            }
        }

        function wsOpenModule(kind) {
            if (!_wsState.currentId) return;
            const data = _wsState.data || _wsReadStorage();
            const ws = data && data.workspaces.find(w => w.id === _wsState.currentId);
            if (!ws) return;
            // Pattern existant : on passe le workspace courant via sessionStorage
            sessionStorage.setItem('current_workspace', JSON.stringify(ws));
            if (kind === 'dora')        window.location.href = 'dora-workspace.html';
            else if (kind === 'gouvernance') window.location.href = 'gouvernance-repo.html?scope=workspace';
            else if (kind === 'access')      window.location.href = 'access-workspace.html';
        }

        // ───── Import JSON ─────────────────────────────────────────────────
        // Réplique stricte du pattern workspace-selector.html, pour rester
        // interopérable. N'écrit QUE le champ .workspaces ; préserve token,
        // gitlabUrl, username, activeWorkspaceId.
        function wsTriggerImport() {
            document.getElementById('wsImportInput').click();
        }

        function wsHandleImport(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                let parsed;
                try {
                    parsed = JSON.parse(e.target.result);
                } catch (err) {
                    _wsToast('Fichier JSON invalide : ' + err.message, 'error');
                    return;
                }
                if (!parsed || typeof parsed !== 'object') {
                    _wsToast('Le fichier ne contient pas un workspace valide.', 'error');
                    return;
                }
                if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
                    _wsToast('Champ "name" manquant ou invalide.', 'error');
                    return;
                }
                if (!Array.isArray(parsed.repositories)) {
                    _wsToast('Champ "repositories" manquant ou invalide.', 'error');
                    return;
                }

                // Recharge frais depuis localStorage (peut avoir changé depuis l'ouverture)
                const data = _wsReadStorage();
                if (!data) {
                    _wsToast('Aucun workspace storage trouvé. Connecte-toi d\'abord.', 'error');
                    return;
                }

                const newWs = {
                    ...parsed,
                    id: (crypto.randomUUID ? crypto.randomUUID() : 'ws_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
                    created: parsed.created || new Date().toISOString()
                };
                const existingNames = new Set(data.workspaces.map(w => w.name));
                if (existingNames.has(newWs.name)) {
                    let suffix = 2;
                    while (existingNames.has(`${parsed.name} (${suffix})`)) suffix++;
                    newWs.name = `${parsed.name} (${suffix})`;
                }
                data.workspaces.push(newWs);
                // Écriture : token, gitlabUrl, username, activeWorkspaceId préservés
                localStorage.setItem(WS_STORAGE_KEY, JSON.stringify(data));
                _wsState.data = data;
                _wsPopulateDropdown();
                _wsCloseDropdown();
                _wsToast(`✓ "${newWs.name}" importé (${newWs.repositories.length} repos)`);
                // On ouvre la vue du workspace fraîchement importé
                wsOpenView(newWs.id);
            };
            reader.onerror = function() {
                _wsToast('Erreur de lecture du fichier.', 'error');
            };
            reader.readAsText(file);
        }

        // ───── Toast ───────────────────────────────────────────────────────
        function _wsToast(msg, type) {
            const t = document.createElement('div');
            t.className = 'ws-toast' + (type === 'error' ? ' is-error' : '');
            t.textContent = msg;
            document.body.appendChild(t);
            requestAnimationFrame(() => t.classList.add('is-visible'));
            setTimeout(() => {
                t.classList.remove('is-visible');
                setTimeout(() => t.remove(), 320);
            }, 2800);
        }
        // ═══════════════════════════════════════════════════════════════
        // FIN AJOUT WORKSPACE
        // ═══════════════════════════════════════════════════════════════

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  DÉMARRER — modal de sélection repo → pont vers Project Scaffolder ║
        // ╚══════════════════════════════════════════════════════════════════╝
        // Le mockup garde l'auth dans localStorage (auth = {gitlabUrl, token, username}).
        // Le Scaffolder (page séparée) lit le sessionStorage gitlab_*. On fait le pont ici.