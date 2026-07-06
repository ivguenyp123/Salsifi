        // ══════════════════════════════════════════════════════════════════
        // CONFIG — auth modèle plateforme (localStorage devops_hub_workspaces)
        //          repo via ?repo=<id>. Remplies dans l'init (réseau-free).
        // ══════════════════════════════════════════════════════════════════
        let GITLAB_URL = null;
        let GITLAB_TOKEN = null;
        let PROJECT_ID = null;
        let PROJECT_NAME = null;
        let PROJECT_PATH = null; // path_with_namespace, résolu au 1er fetch (liens MR)

        const STORAGE_KEY = 'devops_hub_workspaces';
        const HUB_URL = 'hub.html';

        function loadAuth() {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            try {
                const data = JSON.parse(raw);
                if (!data.gitlabUrl || !data.token) return null;
                return data;
            } catch { return null; }
        }

        // URL du backend MR Reviewer - Configurable via localStorage ou variable globale
        const DEFAULT_API_URL = 'https://mr-reviewer-api.lcl.internal';

        function getApiBaseUrl() {
            return localStorage.getItem('mr_reviewer_api_url') || window.MR_REVIEWER_API_URL || DEFAULT_API_URL;
        }

        let mrList = [];
        let selectedMR = null;
        let currentAnalysis = null;
        let mrChanges = [];
        let apiOnline = false; // Reflète le dernier check /health du backend IA.

        // ══════════════════════════════════════════════════════════════════
        // HELPERS — fetch GitLab avec retry 429, pagination, timeout via AbortController.
        // Alignés sur les autres modules (insights, gaming, feature-flag-manager).
        // ══════════════════════════════════════════════════════════════════
        async function fetchGitLab(endpoint, init = {}) {
            return window.Salsifi.gitlabFetch(GITLAB_URL, GITLAB_TOKEN, endpoint, init);
        }

        async function fetchAllGitLab(endpoint) {
            return window.Salsifi.gitlabPaginate(GITLAB_URL, GITLAB_TOKEN, endpoint, { throwOnError: true });
        }

        // fetch avec timeout réel via AbortController (l'option `timeout: 5000`
        // n'est PAS supportée par fetch() standard et était silencieusement ignorée).
        async function fetchWithTimeout(url, init = {}, timeoutMs = 5000) {
            const ctrl = new AbortController();
            const tId = setTimeout(() => ctrl.abort(), timeoutMs);
            try {
                return await fetch(url, { ...init, signal: ctrl.signal });
            } finally {
                clearTimeout(tId);
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // INIT
        // ══════════════════════════════════════════════════════════════════
        document.addEventListener('DOMContentLoaded', () => {
            const auth = loadAuth();
            if (!auth) { window.location.href = 'login.html'; return; }

            const repoId = new URLSearchParams(location.search).get('repo');
            if (!repoId) { window.location.href = HUB_URL; return; }

            GITLAB_URL = auth.gitlabUrl;
            GITLAB_TOKEN = auth.token;
            PROJECT_ID = repoId;
            PROJECT_NAME = `Repo #${repoId}`;

            // Lien retour vers le hub
            document.querySelectorAll('[data-hub-link]').forEach(a => { a.href = HUB_URL; });
            document.getElementById('projectName').textContent = PROJECT_NAME;

            // Charger l'URL API depuis localStorage si disponible
            const savedApiUrl = localStorage.getItem('mr_reviewer_api_url');
            if (savedApiUrl) {
                window.MR_REVIEWER_API_URL = savedApiUrl;
            }

            attachEventDelegation();

            checkApiHealth();
            loadMRs();
        });

        // Map data-action → handler. Le handler reçoit (event, element).
        // Pour les actions paramétrées, on lit `data-iid`, `data-fid`, etc.
        const ACTION_HANDLERS = {
            // Statique HTML
            'show-api-config': () => showApiConfigModal(),
            'load-mrs': () => loadMRs(),
            'show-approve': () => showApproveModal(),
            'show-merge': () => showMergeModal(),
            'show-comment': () => showCommentModal(),
            'show-changes': () => showChangesModal(),
            'show-close': () => showCloseModal(),
            'export-analysis': () => exportAnalysis(),
            'start-analysis': () => startAnalysis(),
            'modal-overlay-click': (e, el) => { if (e.target === el) closeModal(); },

            // Modales
            'close-modal': () => closeModal(),
            'save-api-config': () => saveApiConfig(),
            'exec-approve': () => execApprove(),
            'exec-merge': () => execMerge(),
            'exec-comment': () => execComment(),
            'exec-changes': () => execChanges(),
            'exec-close': () => execClose(),

            // Tabs preview/analysis (cf. data-tab sur les boutons)
            // Géré directement sur `.analysis-tab` ci-dessous.

            // MR card
            'select-mr': (e, el) => selectMR(parseInt(el.dataset.iid, 10)),

            // Preview & file viewers
            'toggle-diff': (e, el) => toggleDiff(parseInt(el.dataset.index, 10)),
            'show-file-diff': (e, el) => showFileDiff(parseInt(el.dataset.index, 10)),

            // Analyse IA
            'toggle-section': (e, el) => toggleSection(el),
            'add-finding': (e, el) => { e.stopPropagation(); addFinding(el.dataset.type); },
            'edit-finding': (e, el) => editFinding(parseInt(el.dataset.fid, 10)),
            'delete-finding': (e, el) => deleteFinding(parseInt(el.dataset.fid, 10)),
            'save-finding': (e, el) => saveFinding(parseInt(el.dataset.fid, 10)),
            'cancel-edit': (e, el) => cancelEdit(parseInt(el.dataset.fid, 10))
        };

        function attachEventDelegation() {
            document.body.addEventListener('click', (e) => {
                const el = e.target.closest('[data-action]');
                if (!el) return;
                const handler = ACTION_HANDLERS[el.dataset.action];
                if (handler) handler(e, el);
            });
            // Tabs preview/analysis : un click sur n'importe quelle .analysis-tab
            // déclenche showTab(data-tab). Délégation séparée car plus simple à lire.
            document.body.addEventListener('click', (e) => {
                const tab = e.target.closest('.analysis-tab');
                if (tab && tab.dataset.tab) showTab(tab.dataset.tab);
            });
        }

        async function checkApiHealth() {
            const statusEl = document.getElementById('apiStatus');
            const textEl = statusEl.querySelector('.api-status-text');

            try {
                // `fetch(..., { timeout: 5000 })` n'est PAS standard et était ignoré ;
                // on utilise AbortController pour avoir un vrai timeout.
                const response = await fetchWithTimeout(`${getApiBaseUrl()}/health`, { method: 'GET' }, 5000);

                if (response.ok) {
                    const data = await response.json();
                    statusEl.classList.remove('offline');
                    statusEl.classList.add('online');
                    textEl.textContent = `API ${data.version || 'OK'}`;
                    apiOnline = true;
                } else {
                    throw new Error('API not responding');
                }
            } catch (e) {
                statusEl.classList.remove('online');
                statusEl.classList.add('offline');
                textEl.textContent = 'API Offline';
                console.warn('API Health check failed:', e);
                apiOnline = false;
            }
            // Propage l'état au bouton "Analyser avec IA" et à la tab "Analyse IA".
            // Tant que le backend IA est OFF, ces éléments sont désactivés explicitement
            // — pour que les utilisateurs du bac à sable ne galèrent pas en cliquant
            // sur un bouton qui plante. À réactiver dès que /health répond OK.
            applyApiAvailabilityToUI();
        }

        // Met à jour l'état désactivé / tooltip du bouton "Analyser" et de la tab
        // IA selon `apiOnline`. Appelée après chaque checkApiHealth + après chaque
        // selectMR (parce que le selectMR fait `disabled = false` aveugle).
        function applyApiAvailabilityToUI() {
            const analyzeBtn = document.getElementById('analyzeBtn');
            const iaTab = document.querySelector('.analysis-tab[data-tab="analysis"]');

            // Bouton "Analyser avec IA" :
            //   - sans MR sélectionnée → reste disabled (état par défaut).
            //   - avec MR sélectionnée → ON si apiOnline, OFF + tooltip sinon.
            if (analyzeBtn) {
                if (!selectedMR) {
                    analyzeBtn.disabled = true;
                    analyzeBtn.title = '';
                } else if (apiOnline) {
                    analyzeBtn.disabled = false;
                    analyzeBtn.title = '';
                } else {
                    analyzeBtn.disabled = true;
                    analyzeBtn.title = 'Backend MR Reviewer hors-ligne — cliquez sur le badge "API Offline" pour configurer l\'URL';
                }
            }
            // Tab "Analyse IA" : désactivée visuellement quand l'API est OFF.
            if (iaTab) {
                if (apiOnline) {
                    iaTab.classList.remove('disabled');
                    iaTab.title = '';
                } else {
                    iaTab.classList.add('disabled');
                    iaTab.title = 'Backend MR Reviewer hors-ligne';
                }
            }
        }

        function showApiConfigModal() {
            const currentUrl = localStorage.getItem('mr_reviewer_api_url') || getApiBaseUrl();
            showModal(`
                <div class="modal-header">
                    <div class="modal-icon" style="background: linear-gradient(135deg, #667eea, #764ba2);">⚙️</div>
                    <div>
                        <div class="modal-title">Configuration API</div>
                        <div class="modal-subtitle">Backend MR Reviewer AI</div>
                    </div>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">URL de l'API</label>
                        <input type="text" id="apiUrlInput" class="modal-textarea" style="min-height: auto; padding: 12px;" 
                               value="${esc(currentUrl)}" placeholder="https://mr-reviewer-api.example.com">
                    </div>
                    <div style="font-size: 12px; opacity: 0.7;">
                        <p>L'API doit exposer les endpoints :</p>
                        <ul style="margin-left: 20px; margin-top: 5px;">
                            <li>GET /health</li>
                            <li>POST /api/analyze-from-gitlab</li>
                        </ul>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="modal-btn cancel" data-action="close-modal">Annuler</button>
                    <button class="modal-btn primary" data-action="save-api-config">💾 Sauvegarder</button>
                </div>
            `);
        }

        function saveApiConfig() {
            const url = document.getElementById('apiUrlInput')?.value?.trim();
            if (url) {
                localStorage.setItem('mr_reviewer_api_url', url);
                window.MR_REVIEWER_API_URL = url;
                closeModal();
                checkApiHealth();
                showSuccess('Configuration sauvegardée');
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // GITLAB API - LOAD MRs
        // ══════════════════════════════════════════════════════════════════
        async function loadMRs() {
            document.getElementById('refreshBtn').classList.add('spinning');
            try {
                // Mode mono-repo : résoudre le vrai nom + path (pour les liens MR)
                if (!PROJECT_PATH) {
                    try {
                        const pr = await fetchGitLab(`/projects/${PROJECT_ID}`);
                        if (pr.ok) {
                            const p = await pr.json();
                            PROJECT_PATH = p.path_with_namespace || '';
                            if (p.name) {
                                PROJECT_NAME = p.name;
                                document.getElementById('projectName').textContent = p.name;
                            }
                        }
                    } catch { /* non bloquant */ }
                }
                // Pagination complète (avant : un seul fetch ?per_page=100 sans page=
                // → > 100 MRs ouvertes étaient perdues silencieusement).
                mrList = await fetchAllGitLab(`/projects/${PROJECT_ID}/merge_requests?state=opened`);
                renderMRList();
                document.getElementById('mrCount').textContent = `${mrList.length} ouvertes`;
            } catch (e) {
                document.getElementById('mrList').innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">⚠️</div>
                        <div class="empty-state-title">Erreur</div>
                        <div class="empty-state-text">${esc(e.message)}</div>
                    </div>
                `;
            }
            document.getElementById('refreshBtn').classList.remove('spinning');
        }

        function renderMRList() {
            const c = document.getElementById('mrList');
            if (!mrList.length) {
                c.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">✅</div>
                        <div class="empty-state-title">Aucune MR ouverte</div>
                    </div>
                `;
                return;
            }
            c.innerHTML = mrList.map(mr => `
                <div class="mr-card" data-iid="${mr.iid}" data-action="select-mr" data-iid="${mr.iid}">
                    <div class="mr-card-header">
                        <span class="mr-id">!${mr.iid}</span>
                        <span class="mr-status open">🟢 Ouverte</span>
                    </div>
                    <div class="mr-title">${esc(mr.title)}</div>
                    <div class="mr-meta">
                        <span>👤 ${esc(mr.author?.name || mr.author?.username || '?')}</span>
                        <span>📅 ${fmtDate(mr.created_at)}</span>
                    </div>
                </div>
            `).join('');
        }

        // ══════════════════════════════════════════════════════════════════
        // SELECT MR
        // ══════════════════════════════════════════════════════════════════
        async function selectMR(iid) {
            selectedMR = mrList.find(m => m.iid === iid);
            if (!selectedMR) return;

            // Update UI
            document.querySelectorAll('.mr-card').forEach(c => c.classList.remove('selected'));
            document.querySelector(`.mr-card[data-iid="${iid}"]`)?.classList.add('selected');
            document.getElementById('analysisTitle').textContent = `MR !${selectedMR.iid} - ${selectedMR.title}`;
            // L'activation du bouton "Analyser" dépend aussi de l'état de l'API.
            // applyApiAvailabilityToUI() gère la combinatoire (MR sélectionnée + API online).
            applyApiAvailabilityToUI();

            // Show tabs
            document.getElementById('analysisTabs').style.display = 'flex';

            // Reset analysis but keep preview
            currentAnalysis = null;
            document.getElementById('analysisResults').style.display = 'none';

            // Enable basic actions
            setActions(true);

            // Load MR details
            await loadMRDetails();

            // Show preview tab by default
            showTab('preview');
        }

        function showTab(tab) {
            // Bloque la tab "Analyse IA" si l'API est offline — l'utilisateur n'a
            // rien à y voir tant que le backend ne répond pas.
            if (tab === 'analysis' && !apiOnline) {
                // Pas de basculement : on reste sur preview avec un message clair.
                showTab('preview');
                return;
            }

            document.querySelectorAll('.analysis-tab').forEach(t => t.classList.remove('active'));

            if (tab === 'preview') {
                // Sélection par data-tab (plus robuste que :first-child si l'ordre change).
                document.querySelector('.analysis-tab[data-tab="preview"]')?.classList.add('active');
                document.getElementById('emptyState').style.display = 'none';
                document.getElementById('previewPanel').style.display = 'block';
                document.getElementById('analysisResults').style.display = 'none';
                renderPreview();
            } else {
                document.querySelector('.analysis-tab[data-tab="analysis"]')?.classList.add('active');
                document.getElementById('emptyState').style.display = 'none';
                document.getElementById('previewPanel').style.display = 'none';
                if (currentAnalysis) {
                    document.getElementById('analysisResults').style.display = 'block';
                } else {
                    document.getElementById('emptyState').style.display = 'flex';
                    document.getElementById('emptyState').innerHTML = `
                        <div class="empty-state-icon">🤖</div>
                        <div class="empty-state-title">Analyse IA non lancée</div>
                        <div class="empty-state-text">Cliquez sur "Analyser avec IA" pour obtenir une analyse détaillée</div>
                    `;
                }
            }
        }

        function renderPreview() {
            if (!selectedMR || !mrChanges) return;

            // Calculate stats
            let totalAdditions = 0;
            let totalDeletions = 0;
            mrChanges.forEach(f => {
                totalAdditions += (f.diff?.match(/^\+[^+]/gm) || []).length;
                totalDeletions += (f.diff?.match(/^-[^-]/gm) || []).length;
            });

            let html = `<div class="preview-container">`;
            
            // Header with stats
            html += `
                <div class="preview-header">
                    <div class="preview-stats">
                        <div class="preview-stat files">
                            <span>📁</span>
                            <span class="preview-stat-value">${mrChanges.length}</span>
                            <span>fichiers</span>
                        </div>
                        <div class="preview-stat additions">
                            <span>+${totalAdditions}</span>
                            <span>ajouts</span>
                        </div>
                        <div class="preview-stat deletions">
                            <span>-${totalDeletions}</span>
                            <span>suppressions</span>
                        </div>
                    </div>
                    <a href="${GITLAB_URL}/${PROJECT_PATH}/-/merge_requests/${selectedMR.iid}" target="_blank" 
                       style="color: #60a5fa; text-decoration: none; font-size: 13px;">
                        🔗 Voir sur GitLab
                    </a>
                </div>
            `;

            // Description
            if (selectedMR.description) {
                // Description injectée via textContent + `white-space: pre-wrap` côté CSS
                // pour respecter les sauts de ligne. Avant : esc().replace(/\n/g, '<br>')
                // ré-injectait du HTML après échappement — pattern fragile.
                html += `
                    <div class="preview-description">
                        <strong>📝 Description:</strong><br><br>
                        <span class="preview-description-body" style="white-space: pre-wrap;"></span>
                    </div>
                `;
            }

            // Files with expandable diff
            if (mrChanges.length > 0) {
                html += `<div class="preview-files">`;
                mrChanges.forEach((f, i) => {
                    const additions = (f.diff?.match(/^\+[^+]/gm) || []).length;
                    const deletions = (f.diff?.match(/^-[^-]/gm) || []).length;
                    const icon = getFileIcon(f.new_path || f.old_path);
                    const diffHtml = formatDiff(f.diff || '');
                    
                    html += `
                        <div class="preview-file">
                            <div class="preview-file-header" data-action="toggle-diff" data-index="${i}">
                                <div class="preview-file-name">
                                    <span class="preview-file-icon">${icon}</span>
                                    <span class="preview-file-path">${esc(f.new_path || f.old_path)}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 15px;">
                                    <div class="preview-file-changes">
                                        <span class="preview-file-add">+${additions}</span>
                                        <span class="preview-file-del">-${deletions}</span>
                                    </div>
                                    <span class="preview-file-toggle" id="toggle-${i}">▶ Voir diff</span>
                                </div>
                            </div>
                            <div class="preview-diff" id="diff-${i}">
                                <pre>${diffHtml}</pre>
                            </div>
                        </div>
                    `;
                });
                html += `</div>`;
            }

            // Hint
            html += `
                <div class="preview-hint">
                    <span>💡</span>
                    <span>Cliquez sur "Analyser avec IA" pour une review automatique (sécurité, qualité, performance)</span>
                </div>
            `;

            html += `</div>`;
            const panel = document.getElementById('previewPanel');
            panel.innerHTML = html;
            // Description : textContent pour éviter tout risque d'injection HTML
            // depuis selectedMR.description (qui vient de l'API GitLab).
            if (selectedMR.description) {
                const body = panel.querySelector('.preview-description-body');
                if (body) body.textContent = selectedMR.description;
            }
        }

        function formatDiff(diff) {
            if (!diff) return '<span class="diff-line meta">Pas de diff disponible</span>';
            
            return diff.split('\n').map(line => {
                const escaped = esc(line);
                if (line.startsWith('+') && !line.startsWith('+++')) {
                    return `<span class="diff-line addition">${escaped}</span>`;
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                    return `<span class="diff-line deletion">${escaped}</span>`;
                } else if (line.startsWith('@@') || line.startsWith('diff ') || line.startsWith('index ')) {
                    return `<span class="diff-line meta">${escaped}</span>`;
                }
                return `<span class="diff-line">${escaped}</span>`;
            }).join('\n');
        }

        function toggleDiff(index) {
            const diffEl = document.getElementById(`diff-${index}`);
            const toggleEl = document.getElementById(`toggle-${index}`);
            if (diffEl.classList.contains('open')) {
                diffEl.classList.remove('open');
                toggleEl.textContent = '▶ Voir diff';
            } else {
                diffEl.classList.add('open');
                toggleEl.textContent = '▼ Masquer';
            }
        }

        async function loadMRDetails() {
            // Render MR info
            renderMRInfo();

            // Labels & Assignees sections cachées (cf. HTML) — fonctionnalité non
            // implémentée, modals "Fonctionnalité à venir" retirées.

            // Load changes (files)
            await loadMRChanges();
        }

        function renderMRInfo() {
            document.getElementById('mrInfoContainer').innerHTML = `
                <div class="mr-info-item">
                    <span class="mr-info-label">Source</span>
                    <span class="mr-info-value">${esc(selectedMR.source_branch)}</span>
                </div>
                <div class="mr-info-item">
                    <span class="mr-info-label">Target</span>
                    <span class="mr-info-value">${esc(selectedMR.target_branch)}</span>
                </div>
                <div class="mr-info-item">
                    <span class="mr-info-label">Auteur</span>
                    <span class="mr-info-value">${esc(selectedMR.author?.name || '?')}</span>
                </div>
                <div class="mr-info-item">
                    <span class="mr-info-label">Créée</span>
                    <span class="mr-info-value">${fmtDate(selectedMR.created_at)}</span>
                </div>
            `;
        }

        // renderLabels / renderAssignees / showLabelsModal / showAssigneesModal
        // retirés : les sections HTML correspondantes sont cachées (modals affichaient
        // "Fonctionnalité à venir"). À réintroduire quand l'API GitLab pour
        // PUT /merge_requests/:iid avec labels/assignees sera câblée.

        async function loadMRChanges() {
            try {
                const r = await fetchGitLab(`/projects/${PROJECT_ID}/merge_requests/${selectedMR.iid}/changes`);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const data = await r.json();
                mrChanges = data.changes || [];
                renderFiles();
            } catch (e) {
                console.warn('Erreur loadMRChanges:', e);
                mrChanges = [];
                renderFiles();
            }
        }

        function renderFiles() {
            if (!mrChanges.length) {
                document.getElementById('filesContainer').innerHTML = `
                    <div class="empty-state" style="padding: 20px;">
                        <div class="empty-state-text">Aucun fichier</div>
                    </div>
                `;
                return;
            }

            document.getElementById('filesContainer').innerHTML = mrChanges.map((f, i) => {
                const additions = (f.diff?.match(/^\+[^+]/gm) || []).length;
                const deletions = (f.diff?.match(/^-[^-]/gm) || []).length;
                const icon = getFileIcon(f.new_path || f.old_path);
                return `
                    <div class="file-item" data-action="show-file-diff" data-index="${i}">
                        <span class="file-icon">${icon}</span>
                        <span class="file-name">${esc(f.new_path || f.old_path)}</span>
                        <div class="file-changes">
                            <span class="file-additions">+${additions}</span>
                            <span class="file-deletions">-${deletions}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function getFileIcon(path) {
            if (!path) return '📄';
            if (path.endsWith('.js') || path.endsWith('.ts')) return '🟨';
            if (path.endsWith('.java')) return '☕';
            if (path.endsWith('.py')) return '🐍';
            if (path.endsWith('.yml') || path.endsWith('.yaml')) return '⚙️';
            if (path.endsWith('.json')) return '📋';
            if (path.endsWith('.md')) return '📝';
            if (path.endsWith('.html')) return '🌐';
            if (path.endsWith('.css') || path.endsWith('.scss')) return '🎨';
            return '📄';
        }

        // ══════════════════════════════════════════════════════════════════
        // ANALYSIS - APPEL BACKEND API
        // ══════════════════════════════════════════════════════════════════
        async function startAnalysis() {
            if (!selectedMR) return;
            const btn = document.getElementById('analyzeBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="loading-dots"><span></span><span></span><span></span></span> Analyse IA...';

            try {
                // Appel au backend pour analyser la MR
                const response = await fetch(`${getApiBaseUrl()}/api/analyze-from-gitlab`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        gitlab_url: GITLAB_URL,
                        project_id: PROJECT_ID,
                        mr_iid: selectedMR.iid,
                        gitlab_token: GITLAB_TOKEN
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API Error ${response.status}: ${errorText}`);
                }

                currentAnalysis = await response.json();
                
                // Ajouter des IDs si manquants
                if (currentAnalysis.critical_issues) {
                    currentAnalysis.critical_issues = currentAnalysis.critical_issues.map((i, idx) => ({
                        ...i,
                        id: i.id || idx + 1
                    }));
                }
                if (currentAnalysis.warnings) {
                    currentAnalysis.warnings = currentAnalysis.warnings.map((w, idx) => ({
                        ...w,
                        id: w.id || idx + 100
                    }));
                }
                if (currentAnalysis.positives) {
                    currentAnalysis.positives = currentAnalysis.positives.map((p, idx) => ({
                        ...p,
                        id: p.id || idx + 200
                    }));
                }

                renderAnalysis();
                document.getElementById('exportBtn').disabled = false;
                
                // Switch to analysis tab
                showTab('analysis');

            } catch (e) {
                console.error('Analysis error:', e);
                showError(`Erreur d'analyse: ${e.message}`);
            }

            btn.disabled = false;
            btn.innerHTML = '<span>🔄</span><span>Ré-analyser</span>';
        }

        function renderAnalysis() {
            const a = currentAnalysis;
            document.getElementById('emptyState').style.display = 'none';
            document.getElementById('analysisResults').style.display = 'block';

            const cls = a.decision === 'REJECT' ? 'reject' : a.decision === 'CHANGES_REQUESTED' ? 'changes' : 'approve';
            const ico = a.decision === 'REJECT' ? '❌' : a.decision === 'CHANGES_REQUESTED' ? '📝' : '✅';
            const tit = a.decision === 'REJECT' ? 'Rejet recommandé' : a.decision === 'CHANGES_REQUESTED' ? 'Changements suggérés' : 'Prêt à merger';

            let h = `
                <div class="decision-banner ${cls}">
                    <div class="decision-icon">${ico}</div>
                    <div class="decision-text">
                        <div class="decision-title">${tit}</div>
                        <div class="decision-subtitle">${esc(a.summary || '')}</div>
                    </div>
                </div>

                <div class="score-section">
                    ${scoreCard('Global', a.scores?.global)}
                    ${scoreCard('🔒 Sécurité', a.scores?.security)}
                    ${scoreCard('📐 Qualité', a.scores?.quality)}
                    ${scoreCard('⚡ Perf', a.scores?.performance)}
                </div>
            `;

            if (a.critical_issues?.length) {
                h += `
                    <div class="findings-section">
                        <div class="findings-header" data-action="toggle-section">
                            <div class="findings-title">
                                🚨 Issues critiques
                                <span class="findings-count">${a.critical_issues.length}</span>
                            </div>
                            <div class="findings-actions">
                                <button class="findings-btn" data-action="add-finding" data-type="critical">+ Ajouter</button>
                            </div>
                        </div>
                        <div class="findings-list">
                            ${a.critical_issues.map(renderFinding).join('')}
                        </div>
                    </div>
                `;
            }

            if (a.warnings?.length) {
                h += `
                    <div class="findings-section">
                        <div class="findings-header" data-action="toggle-section">
                            <div class="findings-title">
                                ⚠️ Avertissements
                                <span class="findings-count">${a.warnings.length}</span>
                            </div>
                            <div class="findings-actions">
                                <button class="findings-btn" data-action="add-finding" data-type="warning">+ Ajouter</button>
                            </div>
                        </div>
                        <div class="findings-list">
                            ${a.warnings.map(renderFinding).join('')}
                        </div>
                    </div>
                `;
            }

            if (a.positives?.length) {
                h += `
                    <div class="findings-section">
                        <div class="findings-header" data-action="toggle-section">
                            <div class="findings-title">
                                ✅ Points positifs
                                <span class="findings-count">${a.positives.length}</span>
                            </div>
                            <div class="findings-actions">
                                <button class="findings-btn" data-action="add-finding" data-type="positive">+ Ajouter</button>
                            </div>
                        </div>
                        <div class="findings-list">
                            ${a.positives.map(p => renderFinding({ ...p, severity: 'positive', title: p.message || '' })).join('')}
                        </div>
                    </div>
                `;
            }

            document.getElementById('analysisResults').innerHTML = h;
        }

        function scoreCard(label, score) {
            const v = score || 0;
            const c = v >= 80 ? 'good' : v >= 60 ? 'warning' : 'bad';
            return `
                <div class="score-card">
                    <div class="score-value ${c}">${v}</div>
                    <div class="score-label">${label}</div>
                </div>
            `;
        }

        function renderFinding(f) {
            // Type dérivé : positive (override explicite) > critical (titre ❌ ou
            // severity) > warning (défaut).
            let type;
            if (f.severity === 'positive') type = 'positive';
            else if (f.title?.includes('❌') || f.severity === 'critical') type = 'critical';
            else type = 'warning';
            const icon = type === 'critical' ? '🔴' : type === 'positive' ? '✓' : '🟡';
            return `
                <div class="finding-item ${type}" data-id="${f.id}">
                    <div class="finding-header">
                        <div class="finding-title">${icon} ${esc(f.title)}</div>
                        <div class="finding-location">${esc(f.location)}</div>
                    </div>
                    ${f.description ? `<div class="finding-description">${esc(f.description)}</div>` : ''}
                    <div class="finding-edit">
                        <textarea class="finding-textarea">${esc(f.description || f.title || '')}</textarea>
                        <div class="finding-edit-actions">
                            <button class="edit-save-btn" data-action="save-finding" data-fid="${f.id}">💾 Sauvegarder</button>
                            <button class="edit-cancel-btn" data-action="cancel-edit" data-fid="${f.id}">Annuler</button>
                        </div>
                    </div>
                    <div class="finding-actions">
                        <button class="finding-action-btn" data-action="edit-finding" data-fid="${f.id}">✏️ Éditer</button>
                        <button class="finding-action-btn delete" data-action="delete-finding" data-fid="${f.id}">🗑️ Supprimer</button>
                    </div>
                </div>
            `;
        }

        // ══════════════════════════════════════════════════════════════════
        // EDIT FINDINGS
        // ══════════════════════════════════════════════════════════════════
        function editFinding(id) {
            const item = document.querySelector(`.finding-item[data-id="${id}"]`);
            if (item) {
                item.classList.add('editing');
            }
        }

        function cancelEdit(id) {
            const item = document.querySelector(`.finding-item[data-id="${id}"]`);
            if (item) {
                item.classList.remove('editing');
            }
        }

        function saveFinding(id) {
            const item = document.querySelector(`.finding-item[data-id="${id}"]`);
            if (!item) return;

            const textarea = item.querySelector('.finding-textarea');
            const descDiv = item.querySelector('.finding-description');

            if (textarea && descDiv) {
                descDiv.textContent = textarea.value;
                // Update in currentAnalysis
                updateFindingInAnalysis(id, textarea.value);
            }

            item.classList.remove('editing');
        }

        function updateFindingInAnalysis(id, newDescription) {
            if (!currentAnalysis) return;

            const allFindings = [
                ...(currentAnalysis.critical_issues || []),
                ...(currentAnalysis.warnings || []),
                ...(currentAnalysis.positives || [])
            ];

            const finding = allFindings.find(f => f.id === id);
            if (finding) {
                finding.description = newDescription;
                if (finding.message) finding.message = newDescription;
            }
        }

        function deleteFinding(id) {
            if (!confirm('Supprimer ce point ?')) return;

            // Remove from DOM
            const item = document.querySelector(`.finding-item[data-id="${id}"]`);
            if (item) {
                item.remove();
            }

            // Remove from currentAnalysis
            if (currentAnalysis) {
                currentAnalysis.critical_issues = (currentAnalysis.critical_issues || []).filter(f => f.id !== id);
                currentAnalysis.warnings = (currentAnalysis.warnings || []).filter(f => f.id !== id);
                currentAnalysis.positives = (currentAnalysis.positives || []).filter(f => f.id !== id);
            }

            // Update counts
            updateFindingCounts();
        }

        function addFinding(type) {
            const newId = Date.now();
            const newFinding = {
                id: newId,
                title: 'Nouveau point',
                description: 'Description...',
                location: 'fichier.js',
                message: 'Nouveau point'
            };

            if (type === 'critical') {
                currentAnalysis.critical_issues = currentAnalysis.critical_issues || [];
                currentAnalysis.critical_issues.push(newFinding);
            } else if (type === 'warning') {
                currentAnalysis.warnings = currentAnalysis.warnings || [];
                currentAnalysis.warnings.push(newFinding);
            } else {
                currentAnalysis.positives = currentAnalysis.positives || [];
                currentAnalysis.positives.push(newFinding);
            }

            renderAnalysis();
            editFinding(newId);
        }

        function updateFindingCounts() {
            document.querySelectorAll('.findings-section').forEach(section => {
                const count = section.querySelectorAll('.finding-item').length;
                const countEl = section.querySelector('.findings-count');
                if (countEl) countEl.textContent = count;
            });
        }

        function toggleSection(header) {
            const list = header.nextElementSibling;
            if (list) {
                list.style.display = list.style.display === 'none' ? 'block' : 'none';
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // ACTIONS
        // ══════════════════════════════════════════════════════════════════
        function setActions(enabled) {
            document.getElementById('btnApprove').disabled = !enabled;
            document.getElementById('btnMerge').disabled = !enabled;
            document.getElementById('btnComment').disabled = !enabled;
            document.getElementById('btnChanges').disabled = !enabled;
            document.getElementById('btnClose').disabled = !enabled;
        }

        function showApproveModal() {
            showModal(`
                <div class="modal-header">
                    <div class="modal-icon approve">✅</div>
                    <div>
                        <div class="modal-title">Approuver la MR</div>
                        <div class="modal-subtitle">!${selectedMR.iid} - ${esc(selectedMR.title)}</div>
                    </div>
                </div>
                <div class="modal-body">
                    <textarea class="modal-textarea" id="approveComment" placeholder="Commentaire (optionnel)">LGTM ! Analyse IA validée.</textarea>
                </div>
                <div class="modal-actions">
                    <button class="modal-btn cancel" data-action="close-modal">Annuler</button>
                    <button class="modal-btn confirm-approve" data-action="exec-approve">✅ Approuver</button>
                </div>
            `);
        }

        async function execApprove() {
            showProcessing('Approbation...');
            try {
                const r = await fetchGitLab(`/projects/${PROJECT_ID}/merge_requests/${selectedMR.iid}/approve`, {
                    method: 'POST'
                });
                if (!r.ok) {
                    // Avant : on lançait showSuccess même sur 403/500 → l'utilisateur
                    // croyait que c'était passé. Maintenant, on parse le message
                    // d'erreur GitLab et on remonte une vraie erreur.
                    const errorBody = await r.json().catch(() => ({}));
                    throw new Error(errorBody.message || errorBody.error || `HTTP ${r.status}`);
                }

                const comment = document.getElementById('approveComment')?.value;
                if (comment) {
                    const cr = await postComment(comment);
                    if (!cr.ok) console.warn('Commentaire non posté:', cr.status);
                }

                showSuccess('MR Approuvée !');
            } catch (e) {
                showError(`Erreur: ${e.message}`);
            }
        }

        function showMergeModal() {
            showModal(`
                <div class="modal-header">
                    <div class="modal-icon merge">🔀</div>
                    <div>
                        <div class="modal-title">Merger la MR</div>
                        <div class="modal-subtitle">${esc(selectedMR.source_branch)} → ${esc(selectedMR.target_branch)}</div>
                    </div>
                </div>
                <div class="modal-body">
                    <textarea class="modal-textarea" id="mergeMessage" placeholder="Message de merge (optionnel)"></textarea>
                    <label class="modal-checkbox">
                        <input type="checkbox" id="deleteSourceBranch" checked>
                        Supprimer la branche source après merge
                    </label>
                    <label class="modal-checkbox">
                        <input type="checkbox" id="squashCommits">
                        Squash commits
                    </label>
                </div>
                <div class="modal-actions">
                    <button class="modal-btn cancel" data-action="close-modal">Annuler</button>
                    <button class="modal-btn confirm-merge" data-action="exec-merge">🔀 Merger</button>
                </div>
            `);
        }

        async function execMerge() {
            showProcessing('Merge en cours...');
            try {
                const r = await fetchGitLab(`/projects/${PROJECT_ID}/merge_requests/${selectedMR.iid}/merge`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        merge_commit_message: document.getElementById('mergeMessage')?.value || undefined,
                        should_remove_source_branch: document.getElementById('deleteSourceBranch')?.checked,
                        squash: document.getElementById('squashCommits')?.checked
                    })
                });
                if (!r.ok) {
                    const errorBody = await r.json().catch(() => ({}));
                    throw new Error(errorBody.message || errorBody.error || `HTTP ${r.status}`);
                }
                showSuccess('MR Mergée !');
                loadMRs();
            } catch (e) {
                showError(`Erreur: ${e.message}`);
            }
        }

        function showCommentModal() {
            const defaultComment = currentAnalysis ? generateAnalysisComment() : '';
            showModal(`
                <div class="modal-header">
                    <div class="modal-icon comment">💬</div>
                    <div>
                        <div class="modal-title">Ajouter un commentaire</div>
                        <div class="modal-subtitle">!${selectedMR.iid}</div>
                    </div>
                </div>
                <div class="modal-body">
                    <textarea class="modal-textarea" id="commentText" placeholder="Votre commentaire...">${esc(defaultComment)}</textarea>
                </div>
                <div class="modal-actions">
                    <button class="modal-btn cancel" data-action="close-modal">Annuler</button>
                    <button class="modal-btn primary" data-action="exec-comment">💬 Publier</button>
                </div>
            `);
        }

        async function execComment() {
            const comment = document.getElementById('commentText')?.value;
            if (!comment) return;

            showProcessing('Envoi...');
            try {
                const r = await postComment(comment);
                if (!r.ok) {
                    const errorBody = await r.json().catch(() => ({}));
                    throw new Error(errorBody.message || `HTTP ${r.status}`);
                }
                showSuccess('Commentaire publié !');
            } catch (e) {
                showError(`Erreur: ${e.message}`);
            }
        }

        function showChangesModal() {
            const defaultComment = currentAnalysis ? generateAnalysisComment() : '## 📝 Changements demandés\n\n';
            showModal(`
                <div class="modal-header">
                    <div class="modal-icon changes">📝</div>
                    <div>
                        <div class="modal-title">Demander des changements</div>
                        <div class="modal-subtitle">!${selectedMR.iid}</div>
                    </div>
                </div>
                <div class="modal-body">
                    <textarea class="modal-textarea" id="changesText" style="min-height: 200px;">${esc(defaultComment)}</textarea>
                </div>
                <div class="modal-actions">
                    <button class="modal-btn cancel" data-action="close-modal">Annuler</button>
                    <button class="modal-btn confirm-changes" data-action="exec-changes">📝 Envoyer</button>
                </div>
            `);
        }

        async function execChanges() {
            const comment = document.getElementById('changesText')?.value;
            if (!comment) return;

            showProcessing('Envoi...');
            try {
                const r = await postComment(comment);
                if (!r.ok) {
                    const errorBody = await r.json().catch(() => ({}));
                    throw new Error(errorBody.message || `HTTP ${r.status}`);
                }
                showSuccess('Demande envoyée !');
            } catch (e) {
                showError(`Erreur: ${e.message}`);
            }
        }

        function showCloseModal() {
            showModal(`
                <div class="modal-header">
                    <div class="modal-icon close">🚫</div>
                    <div>
                        <div class="modal-title">Fermer la MR</div>
                        <div class="modal-subtitle">!${selectedMR.iid} - ${esc(selectedMR.title)}</div>
                    </div>
                </div>
                <div class="modal-body">
                    <textarea class="modal-textarea" id="closeReason" placeholder="Raison de la fermeture..."></textarea>
                </div>
                <div class="modal-actions">
                    <button class="modal-btn cancel" data-action="close-modal">Annuler</button>
                    <button class="modal-btn confirm-close" data-action="exec-close">🚫 Fermer</button>
                </div>
            `);
        }

        async function execClose() {
            showProcessing('Fermeture...');
            try {
                const reason = document.getElementById('closeReason')?.value;
                if (reason) {
                    const cr = await postComment(`## ❌ MR Fermée\n\n${reason}`);
                    if (!cr.ok) console.warn('Commentaire fermeture non posté:', cr.status);
                }

                const r = await fetchGitLab(`/projects/${PROJECT_ID}/merge_requests/${selectedMR.iid}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ state_event: 'close' })
                });
                if (!r.ok) {
                    const errorBody = await r.json().catch(() => ({}));
                    throw new Error(errorBody.message || `HTTP ${r.status}`);
                }

                showSuccess('MR Fermée');
                loadMRs();
            } catch (e) {
                showError(`Erreur: ${e.message}`);
            }
        }

        async function postComment(body) {
            return fetchGitLab(`/projects/${PROJECT_ID}/merge_requests/${selectedMR.iid}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body })
            });
        }

        function generateAnalysisComment() {
            if (!currentAnalysis) return '';

            let comment = `## 🤖 Analyse MR Reviewer AI\n\n`;
            comment += `**Décision**: ${currentAnalysis.decision === 'REJECT' ? '❌ Rejet' : currentAnalysis.decision === 'CHANGES_REQUESTED' ? '📝 Changements requis' : '✅ Approuvé'}\n\n`;

            if (currentAnalysis.critical_issues?.length) {
                comment += `### 🚨 Issues critiques\n`;
                currentAnalysis.critical_issues.forEach(i => {
                    comment += `- **${i.title}** (${i.location}): ${i.description}\n`;
                });
                comment += '\n';
            }

            if (currentAnalysis.warnings?.length) {
                comment += `### ⚠️ Avertissements\n`;
                currentAnalysis.warnings.forEach(w => {
                    comment += `- **${w.title}** (${w.location}): ${w.description}\n`;
                });
                comment += '\n';
            }

            if (currentAnalysis.positives?.length) {
                comment += `### ✅ Points positifs\n`;
                currentAnalysis.positives.forEach(p => {
                    comment += `- ${p.message} (${p.location})\n`;
                });
            }

            return comment;
        }


        // ══════════════════════════════════════════════════════════════════
        // EXPORT
        // ══════════════════════════════════════════════════════════════════
        function exportAnalysis() {
            if (!currentAnalysis || !selectedMR) return;

            const markdown = generateAnalysisComment();
            const blob = new Blob([markdown], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mr-${selectedMR.iid}-analysis.md`;
            a.click();
            URL.revokeObjectURL(url);
        }

        function showFileDiff(index) {
            const file = mrChanges[index];
            if (!file) return;

            showModal(`
                <div class="modal-header">
                    <div class="modal-icon" style="background: linear-gradient(135deg, #667eea, #764ba2);">📄</div>
                    <div>
                        <div class="modal-title">${esc(file.new_path || file.old_path)}</div>
                    </div>
                </div>
                <div class="modal-body">
                    <pre style="background: #1a1a2e; padding: 15px; border-radius: 10px; overflow-x: auto; font-size: 12px; max-height: 400px; overflow-y: auto;">${esc(file.diff || 'Pas de diff disponible')}</pre>
                </div>
                <div class="modal-actions">
                    <button class="modal-btn cancel" data-action="close-modal">Fermer</button>
                </div>
            `);
        }

        // ══════════════════════════════════════════════════════════════════
        // MODAL
        // ══════════════════════════════════════════════════════════════════
        function showModal(html) {
            document.getElementById('modalContent').innerHTML = html;
            document.getElementById('modal').classList.add('active');
        }

        function closeModal() {
            document.getElementById('modal').classList.remove('active');
        }

        function showProcessing(text) {
            showModal(`
                <div class="processing">
                    <div class="processing-spinner"></div>
                    <p>${text}</p>
                </div>
            `);
        }

        function showSuccess(text) {
            showModal(`
                <div style="text-align: center; padding: 20px;">
                    <div style="font-size: 60px; margin-bottom: 20px;">🎉</div>
                    <div style="font-size: 24px; font-weight: 700; margin-bottom: 25px;">${text}</div>
                    <button class="modal-btn primary" data-action="close-modal" style="width: 100%;">Fermer</button>
                </div>
            `);
        }

        function showError(text) {
            showModal(`
                <div style="text-align: center; padding: 20px;">
                    <div style="font-size: 60px; margin-bottom: 20px;">⚠️</div>
                    <div style="font-size: 24px; font-weight: 700; margin-bottom: 10px;">Erreur</div>
                    <div style="color: #f87171; margin-bottom: 25px;">${esc(text)}</div>
                    <button class="modal-btn cancel" data-action="close-modal" style="width: 100%;">Fermer</button>
                </div>
            `);
        }

        // ══════════════════════════════════════════════════════════════════
        // UTILS
        // ══════════════════════════════════════════════════════════════════
        function esc(t) {
            if (!t) return '';
            const d = document.createElement('div');
            d.textContent = t;
            return d.innerHTML;
        }

        function fmtDate(d) {
            if (!d) return '';
            const dt = new Date(d);
            const now = new Date();
            const diff = Math.floor((now - dt) / (1000 * 60 * 60 * 24));
            if (diff === 0) return "Aujourd'hui";
            if (diff === 1) return 'Hier';
            if (diff < 7) return `Il y a ${diff}j`;
            if (diff < 30) return `Il y a ${Math.floor(diff / 7)} sem.`;
            return dt.toLocaleDateString('fr-FR');
        }
