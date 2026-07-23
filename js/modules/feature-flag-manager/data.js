/* feature-flag-manager · data.js — I/O GitLab + fichier client (couche données). */


        async function fetchGitLab(endpoint, init = {}) {
            try {
                return await window.Salsifi.gitlabFetch(GITLAB_URL, token, endpoint, init);
            } catch (e) {
                console.error(`[fetchGitLab] erreur sur ${endpoint}:`, e);
                throw e;
            }
        }

        // Pagination automatique (garde-fou 50 pages = 5000 résultats max).

        async function fetchAllGitLab(endpoint) {
            return window.Salsifi.gitlabPaginate(GITLAB_URL, token, endpoint, { throwOnError: true });
        }

        // Échappement HTML — utilisé partout où on injecte une valeur dynamique
        // via innerHTML / template string. NB : redéfini plus bas localement pour
        // compatibilité avec un usage existant ; les deux fonctions retournent
        // le même résultat.

        async function loadFeatureFlags() {
            try {
                // Auparavant un seul fetch sans per_page → 20 flags max retournés
                // par défaut. Maintenant paginé pour récupérer la totalité, avec
                // retry 429 intégré via fetchGitLab.
                const r = await fetchGitLab(`/projects/${projectId}/feature_flags?per_page=100`);
                if (!r.ok) {
                    if (r.status === 403) { showNoAccess(); return; }
                    throw new Error(`API error: ${r.status}`);
                }
                // Si le premier page indique qu'il y en a plus, on pagine.
                let flags = await r.json();
                if (Array.isArray(flags) && flags.length === 100) {
                    // Probablement tronqué — relancer en paginé complet.
                    flags = await fetchAllGitLab(`/projects/${projectId}/feature_flags`);
                }

                currentFlags = flags.map(analyzeFlag);

                renderDashboard();
                renderCleanupPanel();

            } catch (error) {
                console.error('Erreur chargement flags:', error);
                showError(error.message);
            }
        }

        function loadDemoData() {
            // Données de démo pour illustrer les différents statuts
            const demoFlags = [
                { name: 'enable-apple-pay', created_at: daysAgo(21), updated_at: daysAgo(7), active: true, strategies: [{ name: 'default' }] },
                { name: 'enable-new-dashboard', created_at: daysAgo(18), updated_at: daysAgo(5), active: true, strategies: [{ name: 'default' }] },
                { name: 'enable-instant-transfer', created_at: daysAgo(5), updated_at: daysAgo(2), active: true, strategies: [{ name: 'gradualRolloutUserId', parameters: { percentage: '25' } }] },
                { name: 'enable-old-scoring', created_at: daysAgo(45), updated_at: daysAgo(30), active: true, strategies: [{ name: 'default' }] },
                { name: 'test-legacy-feature', created_at: daysAgo(68), updated_at: daysAgo(60), active: true, strategies: [{ name: 'default' }] },
                { name: 'disable-external-api', created_at: daysAgo(120), updated_at: daysAgo(90), active: true, strategies: [{ name: 'default' }] },
                { name: 'disable-ocr-service', created_at: daysAgo(200), updated_at: daysAgo(150), active: true, strategies: [{ name: 'default' }] },
            ];

            currentFlags = demoFlags.map(analyzeFlag);
            renderDashboard();
            renderCleanupPanel();
        }

        async function detectExistingClientFile() {
            const filePath = document.getElementById('client-file-path').value.trim();
            const statusDiv = document.getElementById('client-file-status');
            
            if (!filePath) {
                statusDiv.innerHTML = '<span style="color: #f87171;">❌ Chemin requis</span>';
                return;
            }
            
            statusDiv.innerHTML = '<span style="color: #fbbf24;">🔍 Recherche en cours...</span>';
            
            try {
                // API GitLab pour récupérer un fichier
                const response = await fetch(
                    `${GITLAB_URL}/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}?ref=main`,
                    { headers: { 'PRIVATE-TOKEN': token } }
                );
                
                if (response.ok) {
                    const data = await response.json();
                    existingFileContent = atob(data.content);
                    clientFileExists = true;
                    
                    // Extraire les flags existants du fichier
                    existingFlags = extractFlagsFromContent(existingFileContent);
                    
                    statusDiv.innerHTML = `
                        <span style="color: #34d399;">✅ Fichier trouvé !</span><br>
                        <span style="opacity: 0.7;">${existingFlags.length} flag(s) existant(s) : ${existingFlags.join(', ') || 'aucun'}</span>
                    `;
                } else if (response.status === 404) {
                    clientFileExists = false;
                    existingFlags = [];
                    existingFileContent = '';
                    
                    statusDiv.innerHTML = `
                        <span style="color: #fbbf24;">📄 Fichier non trouvé</span><br>
                        <span style="opacity: 0.7;">Un nouveau fichier complet sera créé avec le client Unleash</span>
                    `;
                } else {
                    throw new Error(`Erreur API: ${response.status}`);
                }
            } catch (error) {
                statusDiv.innerHTML = `<span style="color: #f87171;">❌ Erreur: ${error.message}</span>`;
            }
        }
        
        // Extraire les noms de flags du contenu existant

        async function createClientFileMR(filePath, content, flagName, isNewFile) {
            const branchName = `feature/add-flag-${flagName}-${Date.now()}`;
            const commitMessage = isNewFile 
                ? `feat(feature-flags): initialize client with ${flagName}`
                : `feat(feature-flags): add ${flagName} to FeatureFlags type`;
            
            try {
                // 1. Créer la branche
                await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/repository/branches`, {
                    method: 'POST',
                    headers: {
                        'PRIVATE-TOKEN': token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        branch: branchName,
                        ref: 'main'
                    })
                });
                
                // 2. Créer/Mettre à jour le fichier
                const fileAction = isNewFile ? 'create' : 'update';
                const fileResponse = await fetch(
                    `${GITLAB_URL}/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}`,
                    {
                        method: isNewFile ? 'POST' : 'PUT',
                        headers: {
                            'PRIVATE-TOKEN': token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            branch: branchName,
                            content: content,
                            commit_message: commitMessage
                        })
                    }
                );
                
                if (!fileResponse.ok) {
                    const error = await fileResponse.json();
                    throw new Error(error.message || 'Erreur création fichier');
                }
                
                // 3. Créer la MR
                const mrResponse = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/merge_requests`, {
                    method: 'POST',
                    headers: {
                        'PRIVATE-TOKEN': token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        source_branch: branchName,
                        target_branch: 'main',
                        title: `🚩 ${isNewFile ? 'Init' : 'Add'} Feature Flag: ${flagName}`,
                        description: `## 🚩 Feature Flag: \`${flagName}\`

### Changements
${isNewFile 
    ? `- ✨ Création du fichier client Feature Flags
- 📄 Fichier: \`${filePath}\`
- 🔧 Configuration Unleash incluse
- 📝 Types TypeSafe pour les flags`
    : `- ➕ Ajout du flag \`${flagName}\` au type \`FeatureFlags\`
- 📄 Fichier: \`${filePath}\``
}

### Généré automatiquement par le DevOps Hub 🤖

---
⚠️ **Rappel**: Ce flag doit être nettoyé dans **4 semaines maximum**.
`,
                        remove_source_branch: true
                    })
                });
                
                if (mrResponse.ok) {
                    const mrData = await mrResponse.json();
                    return {
                        success: true,
                        mrUrl: mrData.web_url,
                        mrIid: mrData.iid
                    };
                } else {
                    const error = await mrResponse.json();
                    throw new Error(error.message || 'Erreur création MR');
                }
                
            } catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // GÉNÉRATION DE FICHIERS
        // ══════════════════════════════════════════════════════════════════

        function logAudit() { /* no-op : audit GitLab natif utilisé à la place */ }

        // ══════════════════════════════════════════════════════════════════
        // HISTORIQUE — source de vérité : GitLab /audit_events (Premium)
        //   + état courant de chaque FF depuis currentFlags
        // ══════════════════════════════════════════════════════════════════

        async function fetchFeatureFlagAuditEvents() {
            const MAX_PAGES = 5;
            const PER_PAGE = 100;
            const all = [];

            for (let page = 1; page <= MAX_PAGES; page++) {
                const url = `${GITLAB_URL}/api/v4/projects/${projectId}/audit_events?per_page=${PER_PAGE}&page=${page}`;
                const res = await fetch(url, { headers: { 'PRIVATE-TOKEN': token } });

                if (!res.ok) {
                    if (res.status === 403) {
                        throw new Error('Accès refusé aux audit events (nécessite rôle Maintainer/Owner + GitLab Premium sur le projet).');
                    }
                    if (res.status === 404) {
                        throw new Error('Endpoint audit_events indisponible sur ce projet.');
                    }
                    throw new Error(`Audit events API : HTTP ${res.status}`);
                }

                const batch = await res.json();
                all.push(...batch);
                if (batch.length < PER_PAGE) break;
            }

            return all.filter(ev =>
                ev && ev.details && ev.details.target_type === 'Operations::FeatureFlag'
            );
        }

        async function loadAuditHistory() {
            const container = document.getElementById('history-list');
            const meta = document.getElementById('history-meta');
            if (!container) return;

            container.innerHTML = `
                <div class="empty-state"><div class="loading-spinner"></div>
                <p style="margin-top:16px;">Chargement depuis GitLab audit events…</p></div>`;
            if (meta) meta.textContent = '';

            try {
                const events = await fetchFeatureFlagAuditEvents();
                AUDIT_EVENTS_CACHE.byFlag = groupAuditEventsByFlag(events);
                AUDIT_EVENTS_CACHE.total = events.length;
                AUDIT_EVENTS_CACHE.fetchedAt = new Date();
                AUDIT_EVENTS_CACHE.error = null;

                if (meta) {
                    const n = events.length;
                    meta.textContent = `${n} événement${n > 1 ? 's' : ''} GitLab · chargé à ${AUDIT_EVENTS_CACHE.fetchedAt.toLocaleTimeString('fr-FR')}`;
                }
                renderFlagHistoryList();
            } catch (err) {
                AUDIT_EVENTS_CACHE.byFlag = null;
                AUDIT_EVENTS_CACHE.error = err.message;
                // Fallback doux : on rend quand même la liste des flags sans events
                renderFlagHistoryList();
                if (meta) {
                    meta.innerHTML = `<span style="color:var(--yellow);">⚠️ ${escapeHtml(err.message)} — affichage limité aux dates created_at / updated_at.</span>`;
                }
            }
        }
        

        function getHealthStorageKey() {
            return 'ff_health_history_' + (projectId || 'default');
        }

        function saveHealthScore(score) {
            try {
                var key = getHealthStorageKey();
                var history = JSON.parse(localStorage.getItem(key) || '[]');
                var now = Date.now();
                // Ne sauvegarder qu'une fois par heure max
                var last = history[history.length - 1];
                if (last && (now - last.t) < 3600000) {
                    // Mettre à jour le dernier point si même heure
                    last.s = score;
                } else {
                    history.push({ t: now, s: score });
                }
                // Garder 30 jours max (720 entrées si toutes les heures)
                var cutoff = now - 30 * 24 * 3600000;
                history = history.filter(function(e) { return e.t >= cutoff; });
                localStorage.setItem(key, JSON.stringify(history));
            } catch(e) {}
        }

        function loadHealthHistory() {
            try {
                var key = getHealthStorageKey();
                return JSON.parse(localStorage.getItem(key) || '[]');
            } catch(e) { return []; }
        }

        async function cwExecuteToggle(flagName, activate) {
            const resultEl = document.getElementById('modal-api-result');
            resultEl.style.display = 'block';
            resultEl.innerHTML = '<div class="alert alert-info"><div class="alert-icon">⏳</div><div class="alert-content"><div class="alert-title">En cours...</div></div></div>';
            try {
                const response = await fetch(GITLAB_URL + '/api/v4/projects/' + projectId + '/feature_flags/' + encodeURIComponent(flagName), {
                    method: 'PUT',
                    headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ active: activate })
                });
                if (!response.ok) throw new Error((await response.json()).message || 'Erreur ' + response.status);
                logAudit('UPDATE', flagName, { active: !activate }, { active: activate },
                    (activate ? 'Activation' : 'Desactivation') + ' via wizard PO');
                const icon = activate ? '🟢' : '⏸️';
                const word = activate ? 'activé' : 'désactivé';
                const state = activate ? 'ON' : 'OFF';
                resultEl.innerHTML = '<div class="alert alert-success"><div class="alert-icon">' + icon + '</div><div class="alert-content"><div class="alert-title">Flag ' + word + ' avec succès</div><div class="alert-text"><strong>' + flagName + '</strong> est maintenant <strong>' + state + '</strong>.</div></div></div>';
                setTimeout(function() { cwGoTo(3); setTimeout(function() { loadFeatureFlags(); }, 500); }, 1200);
            } catch (err) {
                resultEl.innerHTML = '<div class="alert alert-danger"><div class="alert-icon">❌</div><div class="alert-content"><div class="alert-title">Erreur</div><div class="alert-text">' + err.message + '</div></div></div>';
            }
        }

        function _groupsKey() { return 'ffm_manual_groups_' + (projectId || 'default'); }

        function _readLocalGroups() { return _parseGroups(localStorage.getItem(_groupsKey())); }

        // Charge les groupes : variable projet (partagée) si accessible, sinon
        // localStorage (personnel). Fixe _groupsShared en conséquence.

        async function loadManualGroups() {
            _groupsLoaded = true;
            try {
                const r = await fetchGitLab('/projects/' + projectId + '/variables/' + FF_GROUPS_VAR);
                if (r.status === 200) {
                    const v = await r.json();
                    _groupsShared = true;
                    _manualGroups = _parseGroups(v && v.value);
                    return;
                }
                if (r.status === 404) { _groupsShared = true; _manualGroups = []; return; } // Maintainer, variable pas encore créée
                _groupsShared = false;   // 401/403 → pas Maintainer
            } catch (e) {
                _groupsShared = false;
            }
            _manualGroups = _readLocalGroups();   // repli personnel
        }

        // Sauvegarde : partagé → variable projet (débouncé, un seul appel après
        // une rafale de clics) ; personnel → localStorage immédiat.

        function saveManualGroups() {
            if (_groupsShared) {
                if (_groupsSaveTimer) clearTimeout(_groupsSaveTimer);
                _setGroupsStatus('… enregistrement');
                _groupsSaveTimer = setTimeout(_pushGroupsToProjectVar, 600);
            } else {
                try { localStorage.setItem(_groupsKey(), JSON.stringify(_manualGroups)); }
                catch (e) { console.warn('Sauvegarde locale des groupes impossible:', e); }
            }
        }

        async function _pushGroupsToProjectVar() {
            const value = JSON.stringify(_manualGroups);
            const H = { 'Content-Type': 'application/json' };
            try {
                let r = await fetchGitLab('/projects/' + projectId + '/variables/' + FF_GROUPS_VAR,
                    { method: 'PUT', headers: H, body: JSON.stringify({ value: value }) });
                if (r.status === 404) {   // pas encore créée → création
                    r = await fetchGitLab('/projects/' + projectId + '/variables',
                        { method: 'POST', headers: H,
                          body: JSON.stringify({ key: FF_GROUPS_VAR, value: value, masked: false, protected: false }) });
                }
                if (!r.ok) throw new Error('HTTP ' + r.status);
                _setGroupsStatus('✅ enregistré (partagé)');
            } catch (e) {
                console.warn('Écriture de la variable projet impossible:', e);
                _setGroupsStatus('⚠️ échec de l’enregistrement');
            }
        }

        async function doToggleFlag(flagName, activate, pillEl) {
            pillEl.classList.add('busy');

            try {
                const response = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/feature_flags/${encodeURIComponent(flagName)}`, {
                    method: 'PUT',
                    headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ active: activate })
                });

                if (response.ok) {
                    // Mise à jour visuelle immédiate
                    pillEl.dataset.active = activate;
                    pillEl.classList.remove('busy');
                    logAudit('UPDATE', flagName,
                        { active: !activate }, { active: activate },
                        `Toggle ${activate ? 'ON' : 'OFF'} via interface PO`
                    );
                    setTimeout(() => loadFeatureFlags(), 1000);
                } else {
                    throw new Error((await response.json()).message || `Erreur ${response.status}`);
                }
            } catch (err) {
                pillEl.classList.remove('busy');
                // Afficher erreur sous le flag group
                const errDiv = document.createElement('div');
                errDiv.style.cssText = 'background:rgba(248,113,113,0.15);border:1px solid rgba(248,113,113,0.4);border-radius:10px;padding:10px 14px;font-size:12px;color:#fca5a5;margin:8px 0;';
                errDiv.textContent = '❌ Erreur : ' + err.message;
                pillEl.closest('.flag-item')?.after(errDiv);
                setTimeout(() => errDiv.remove(), 5000);
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // MASTER RENDER
        // ══════════════════════════════════════════════════════════════════
