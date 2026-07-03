        // ══════════════════════════════════════════════════════════════════
        //  CONFIGURATION
        // ══════════════════════════════════════════════════════════════════

        let GITLAB_URL = null;
        let projectId = null;
        let token = null;

        const SUSPECT_PATTERNS = {
            'binaries': { icon: '📦', name: 'Binaires Java', extensions: ['.jar', '.war', '.ear', '.class'], recommendation: 'Utiliser Nexus/Artifactory' },
            'dotnet': { icon: '🔷', name: 'Binaires .NET', extensions: ['.dll', '.exe', '.pdb'], recommendation: 'Utiliser NuGet' },
            'archives': { icon: '🗜️', name: 'Archives', extensions: ['.zip', '.tar', '.gz', '.rar', '.7z'], recommendation: 'Stockage externe' },
            'media': { icon: '🎬', name: 'Médias', extensions: ['.mp4', '.avi', '.mp3', '.wav', '.psd'], recommendation: 'Utiliser Git LFS' },
            'logs': { icon: '📜', name: 'Logs', extensions: ['.log'], recommendation: 'Ajouter au .gitignore' },
            'data': { icon: '🗄️', name: 'Données', extensions: ['.sql', '.dump', '.bak', '.csv'], recommendation: 'Ne pas versionner' },
            'deps_node': { icon: '📗', name: 'node_modules', folders: ['node_modules'], recommendation: 'npm ci' },
            'deps_python': { icon: '🐍', name: 'Python env', folders: ['venv', '.venv', '__pycache__'], recommendation: '.gitignore' },
            'build': { icon: '🔨', name: 'Build', folders: ['target', 'build', 'dist', 'out', 'bin', 'obj'], recommendation: '.gitignore' },
            'ide': { icon: '💻', name: 'IDE', folders: ['.idea', '.vscode', '.vs'], recommendation: '.gitignore' },
            'secrets': { icon: '🔐', name: 'Secrets!', extensions: ['.pem', '.key', '.p12', '.keystore'], recommendation: '⚠️ SUPPRIMER!' }
        };

        // Concurrence pour les fetches de taille par fichier. 8 simultanés = bon
        // compromis sur GitLab self-hosted standard LCL. Aligné sur l'écosystème.
        const FILE_SIZE_CONCURRENCY = 8;
        // Cap sur le nb de fetches de taille pour ne pas exploser sur des repos
        // monstrueux. Sur 200+ fichiers suspects, on prend les 200 premiers
        // (déjà très représentatifs).
        const MAX_SIZE_FETCHES = 200;

        let allFiles = [];
        let analysis = { totalSize: 0, totalFiles: 0, patterns: {}, distribution: {}, suspects: [] };
        let generatedGitignore = '';
        let allSelected = false;

        // ══════════════════════════════════════════════════════════════════
        //  HELPERS — fetchGitLab (retry 429), runWithConcurrency, escapeHtml.
        //  Alignés sur l'écosystème (insights, gaming, feature-flag-manager,
        //  mr-reviewer, auto-rebase, conflict-radar, bus-factor, branch-cleaner).
        // ══════════════════════════════════════════════════════════════════

        async function fetchGitLab(endpoint, init = {}) {
            const url = `${GITLAB_URL}/api/v4${endpoint}`;
            const headers = { 'PRIVATE-TOKEN': token, ...(init.headers || {}) };
            let r = await fetch(url, { ...init, headers });
            if (r.status === 429) {
                const retryAfter = parseInt(r.headers.get('Retry-After')) || 2;
                console.warn(`[fetchGitLab] 429 sur ${endpoint}, retry dans ${retryAfter}s`);
                await new Promise(res => setTimeout(res, retryAfter * 1000));
                r = await fetch(url, { ...init, headers });
            }
            return r;
        }

        async function runWithConcurrency(tasks, limit) {
            const results = [];
            const executing = new Set();
            for (const task of tasks) {
                const p = Promise.resolve().then(task);
                results.push(p);
                executing.add(p);
                const clean = () => executing.delete(p);
                p.then(clean, clean);
                if (executing.size >= limit) await Promise.race(executing);
            }
            return Promise.allSettled(results);
        }

        function escapeHtml(text) {
            if (text === null || text === undefined) return '';
            const div = document.createElement('div');
            div.textContent = String(text);
            return div.innerHTML;
        }

        // Encodage UTF-8 → base64 moderne (remplacement du legacy
        // `btoa(unescape(encodeURIComponent(...)))` qui utilise `unescape`,
        // déprécié).
        function utf8ToBase64(str) {
            const bytes = new TextEncoder().encode(str);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
        }

        // ══════════════════════════════════════════════════════════════════
        //  INITIALISATION
        // ══════════════════════════════════════════════════════════════════

        // ── AUTH + REPO — modèle plateforme (aligné DevOps Hub) ──
        const STORAGE_KEY = 'devops_hub_workspaces';
        const HUB_URL = 'hub-mockup-v2_1.html'; // mockup V2 = hub ; seul endroit à changer

        function loadAuth() {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            try {
                const data = JSON.parse(raw);
                if (!data.gitlabUrl || !data.token) return null;
                return data;
            } catch { return null; }
        }

        async function init() {
            const auth = loadAuth();
            if (!auth) { window.location.href = 'login.html'; return; }

            const repoId = new URLSearchParams(location.search).get('repo');
            if (!repoId) { window.location.href = HUB_URL; return; }

            token = auth.token;
            GITLAB_URL = auth.gitlabUrl;
            projectId = repoId;

            // Lien retour (init léger, sans fetch réseau : le nom réel est résolu dans analyze)
            document.querySelectorAll('[data-hub-link]').forEach(a => { a.href = HUB_URL; });
            document.getElementById('projectName').textContent = `Repo #${repoId}`;

            attachEventDelegation();
            await analyze();
        }

        // Event delegation centralisée pour les data-action (anciennement
        // onclick inline partout — fragile sur paths/noms de fichier avec
        // apostrophes, mauvais pour CSP).
        const ACTION_HANDLERS = {
            'analyze':                     () => analyze(),
            'toggle-select-all':           () => toggleSelectAll(),
            'show-delete-commands':        () => showDeleteCommands(),
            'show-history-commands':       () => showHistoryCleanupCommands(),
            'copy-gitignore':              () => copyGitignore(),
            'create-gitignore':            () => createGitignore(),
            'copy-commands':               () => copyCommands(),
            'close-modal':                 () => closeModal(),
            'copy-modal':                  () => copyModalContent(),
            // Spécial : ne fermer le modal que si on clique sur l'overlay
            // lui-même (pas sur son contenu). closest() peut matcher l'overlay
            // depuis n'importe quel enfant, donc on vérifie e.target === el.
            'modal-overlay-click':         (e, el) => { if (e.target === el) closeModal(); }
        };

        function attachEventDelegation() {
            document.body.addEventListener('click', (e) => {
                const el = e.target.closest('[data-action]');
                if (!el) return;
                const handler = ACTION_HANDLERS[el.dataset.action];
                if (handler) handler(e, el);
            });
            // Escape ferme le modal
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeModal();
            });
        }

        async function analyze() {
            allFiles = [];
            analysis = {
                totalSize: 0,
                historySize: 0,
                storageSize: 0,
                totalFiles: 0,
                patterns: {},
                suspects: [],
                suspectsSizeTotal: 0,
                distribution: { code: 0, config: 0, docs: 0, media: 0, binary: 0, other: 0 },
                hasLFS: false,
                hasGitignore: false,
                defaultBranch: 'main'
            };

            showLoading();

            try {
                // 1. Stats du projet (taille repo + storage)
                const projectRes = await fetchGitLab(`/projects/${projectId}?statistics=true`);
                if (!projectRes.ok) throw new Error(`API project → HTTP ${projectRes.status}`);
                const project = await projectRes.json();

                if (project.statistics) {
                    analysis.totalSize = project.statistics.repository_size || 0;
                    analysis.storageSize = project.statistics.storage_size || 0;
                    // L'historique = storage - repo (approximatif — c'est ce que
                    // GitLab expose, pas mesurable plus finement côté API).
                    analysis.historySize = Math.max(0, analysis.storageSize - analysis.totalSize);
                }

                analysis.defaultBranch = project.default_branch || 'main';

                // Mode mono-repo : on n'avait que l'id → on affiche le vrai nom ici.
                const nameEl = document.getElementById('projectName');
                if (nameEl && project.name) nameEl.textContent = project.name;

                // 2. LFS activé ? (chercher .gitattributes avec filter=lfs)
                try {
                    const r = await fetchGitLab(`/projects/${projectId}/repository/files/.gitattributes/raw?ref=${encodeURIComponent(analysis.defaultBranch)}`);
                    if (r.ok) {
                        const content = await r.text();
                        analysis.hasLFS = content.includes('filter=lfs');
                    }
                } catch { /* pas de .gitattributes */ }

                // 3. .gitignore existe ? (et son contenu pour merge éventuel)
                try {
                    const r = await fetchGitLab(`/projects/${projectId}/repository/files/.gitignore/raw?ref=${encodeURIComponent(analysis.defaultBranch)}`);
                    analysis.hasGitignore = r.ok;
                    if (r.ok) {
                        analysis.existingGitignore = await r.text();
                    }
                } catch { /* pas de .gitignore */ }

                // 4. Lister tous les fichiers (paginé, cap 20 pages)
                await fetchAllFiles();

                // 5. Classifier les fichiers (suspects, distribution)
                analyzeFiles();

                // 6. ⭐ Récupérer les VRAIES tailles des fichiers suspects.
                // Avant : le compteur "Économie potentielle" était basé uniquement
                // sur le NOMBRE de fichiers suspects → 100 fichiers .log de 1Ko
                // affichaient "~50%+ d'économie" alors qu'ils pèsent 100Ko.
                // Maintenant : 1 fetch /repository/files/:path par fichier suspect
                // (cap MAX_SIZE_FETCHES, concurrence FILE_SIZE_CONCURRENCY).
                await fetchSuspectSizes();

                renderAll();
            } catch (error) {
                console.error('Erreur:', error);
                showError(error.message);
            }
        }

        async function fetchAllFiles() {
            // Boucle paginée propre (avant : récursion qui faisait perdre la lisibilité).
            allFiles = [];
            for (let page = 1; page <= 20; page++) {
                const r = await fetchGitLab(`/projects/${projectId}/repository/tree?recursive=true&per_page=100&page=${page}`);
                if (!r.ok) break;
                const batch = await r.json();
                if (!Array.isArray(batch) || batch.length === 0) break;
                batch.forEach(f => allFiles.push({ name: f.name, path: f.path, type: f.type }));
                if (batch.length < 100) break;
            }
        }

        // Récupère la taille réelle de chaque fichier suspect via
        // /repository/files/:path. La réponse JSON contient `size` (bytes).
        // Parallélisé avec concurrence limitée pour ne pas saturer GitLab.
        //
        // Met à jour :
        //   - file.size (sur chaque suspect)
        //   - analysis.suspectsSizeTotal (somme)
        //   - analysis.patterns[key].sizeBytes (par catégorie)
        async function fetchSuspectSizes() {
            const targets = analysis.suspects.slice(0, MAX_SIZE_FETCHES);
            if (targets.length === 0) return;

            updateLoadingText(`Récupération de la taille de ${targets.length} fichier(s) suspect(s)...`);

            const tasks = targets.map(file => async () => {
                try {
                    const encoded = encodeURIComponent(file.path);
                    const r = await fetchGitLab(`/projects/${projectId}/repository/files/${encoded}?ref=${encodeURIComponent(analysis.defaultBranch)}`);
                    if (!r.ok) return null;
                    const data = await r.json();
                    file.size = data.size || 0;
                    return { path: file.path, size: file.size };
                } catch {
                    return null;
                }
            });

            await runWithConcurrency(tasks, FILE_SIZE_CONCURRENCY);

            // Agrégation par pattern + total
            analysis.suspectsSizeTotal = 0;
            for (const file of analysis.suspects) {
                analysis.suspectsSizeTotal += file.size || 0;
            }
            for (const [key, pattern] of Object.entries(analysis.patterns)) {
                pattern.sizeBytes = (pattern.files || []).reduce((s, f) => s + (f.size || 0), 0);
            }
        }

        function updateLoadingText(text) {
            const el = document.querySelector('#bigFilesList .loading-state > div:last-child');
            if (el) el.textContent = text;
        }

        function analyzeFiles() {
            const codeExts = ['.js', '.ts', '.py', '.java', '.cs', '.go', '.rb', '.php', '.c', '.cpp', '.vue', '.jsx', '.tsx'];
            const configExts = ['.json', '.yml', '.yaml', '.xml', '.toml', '.ini', '.properties'];
            const docExts = ['.md', '.txt', '.rst', '.pdf'];

            for (const file of allFiles) {
                if (file.type !== 'blob') continue;
                analysis.totalFiles++;

                const ext = getExt(file.name);
                const pathLower = file.path.toLowerCase();

                if (codeExts.includes(ext)) analysis.distribution.code++;
                else if (configExts.includes(ext)) analysis.distribution.config++;
                else if (docExts.includes(ext)) analysis.distribution.docs++;
                else if (['.png', '.jpg', '.gif', '.svg', '.mp4'].includes(ext)) analysis.distribution.media++;
                else if (['.jar', '.dll', '.exe', '.zip'].includes(ext)) analysis.distribution.binary++;
                else analysis.distribution.other++;

                for (const [key, pattern] of Object.entries(SUSPECT_PATTERNS)) {
                    let isSuspect = false;
                    if (pattern.extensions?.includes(ext)) isSuspect = true;
                    if (pattern.folders?.some(f => pathLower.includes(f.toLowerCase()))) isSuspect = true;

                    if (isSuspect) {
                        if (!analysis.patterns[key]) analysis.patterns[key] = { ...pattern, files: [] };
                        analysis.patterns[key].files.push(file);
                        analysis.suspects.push(file);
                    }
                }
            }

            for (const file of allFiles) {
                if (file.type !== 'tree') continue;
                for (const [key, pattern] of Object.entries(SUSPECT_PATTERNS)) {
                    if (pattern.folders?.some(f => file.name.toLowerCase() === f.toLowerCase())) {
                        if (!analysis.patterns[key]) analysis.patterns[key] = { ...pattern, files: [] };
                        analysis.patterns[key].hasFolder = true;
                        analysis.patterns[key].folderPath = file.path;
                    }
                }
            }
        }

        function getExt(name) {
            const i = name.lastIndexOf('.');
            return i > 0 ? name.substring(i).toLowerCase() : '';
        }

        function showLoading() {
            document.getElementById('bigFilesList').innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><div>Analyse...</div></div>';
            document.getElementById('patternsList').innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';
        }

        function showError(msg) {
            document.getElementById('bigFilesList').innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><div>${msg}</div></div>`;
        }

        function formatSize(bytes) {
            if (!bytes) return '0 B';
            const k = 1024, sizes = ['B', 'Ko', 'Mo', 'Go'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }

        function renderAll() {
            // Stats de base
            document.getElementById('totalSize').textContent = formatSize(analysis.totalSize);
            document.getElementById('totalSizeDetail').textContent = 'Fichiers actuels';
            
            // Historique Git
            document.getElementById('historySize').textContent = formatSize(analysis.historySize);
            document.getElementById('historySizeDetail').textContent = analysis.historySize > analysis.totalSize ? '⚠️ Lourd' : 'OK';
            
            document.getElementById('totalFiles').textContent = analysis.totalFiles.toLocaleString();
            document.getElementById('suspectFiles').textContent = analysis.suspects.length;
            
            // LFS Status
            const lfsCard = document.getElementById('lfsCard');
            const lfsStatus = document.getElementById('lfsStatus');
            if (analysis.hasLFS) {
                lfsStatus.textContent = '✅ Actif';
                lfsCard.classList.add('success');
                lfsCard.classList.remove('warning');
            } else {
                lfsStatus.textContent = '❌ Non';
                lfsCard.classList.add('warning');
                lfsCard.classList.remove('success');
            }
            
            // Économie potentielle — basée sur les VRAIES tailles agrégées des
            // fichiers suspects (avant : basée sur le NOMBRE de fichiers, donc
            // 100 fichiers .log de 1Ko affichaient "~50%+" alors qu'ils pèsent
            // 100Ko sur un repo de 500Mo).
            const suspectSize = analysis.suspectsSizeTotal || 0;
            const repoSize = analysis.totalSize || 0;
            let savings;
            if (repoSize > 0 && suspectSize > 0) {
                const pct = Math.min(100, Math.round((suspectSize / repoSize) * 100));
                // On affiche aussi la taille absolue économisée — plus parlant
                // que juste un pourcentage (un user lit "12 Mo" plus vite que "3%").
                savings = `${formatSize(suspectSize)} (${pct}%)`;
            } else if (suspectSize > 0) {
                savings = formatSize(suspectSize);
            } else {
                savings = '0 B';
            }
            document.getElementById('potentialSavings').textContent = savings;

            // History ratio
            const ratio = analysis.totalSize > 0 ? (analysis.historySize / analysis.totalSize) : 0;
            const ratioEl = document.getElementById('historyRatio');
            const diagEl = document.getElementById('historyDiag');
            
            ratioEl.textContent = ratio.toFixed(1) + 'x';
            if (ratio > 3) {
                ratioEl.className = 'history-stat-value bad';
                diagEl.textContent = '🔴 Historique très lourd, nettoyage recommandé';
                diagEl.className = 'history-stat-value bad';
            } else if (ratio > 1.5) {
                ratioEl.className = 'history-stat-value warning';
                diagEl.textContent = '🟡 Historique un peu lourd';
                diagEl.className = 'history-stat-value warning';
            } else {
                ratioEl.className = 'history-stat-value good';
                diagEl.textContent = '🟢 Historique sain';
                diagEl.className = 'history-stat-value good';
            }

            renderFiles();
            renderPatterns();
            renderChart();
            renderRecos();
            renderGitignore();
            
            // Afficher le bouton d'actions si fichiers suspects
            if (analysis.suspects.length > 0) {
                document.getElementById('suspectActions').style.display = 'flex';
            }
        }

        function renderFiles() {
            const container = document.getElementById('bigFilesList');

            // Trier les suspects par taille décroissante avant slice(0, 25) —
            // les plus gros remontent en haut, c'est ce que l'utilisateur veut
            // voir d'abord pour le nettoyage. Les fichiers sans taille (au-delà
            // de MAX_SIZE_FETCHES) restent en queue.
            const sorted = analysis.suspects.slice().sort((a, b) => (b.size || 0) - (a.size || 0));
            const files = sorted.slice(0, 25);

            if (!files.length) {
                container.innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div><div>Aucun fichier suspect !</div></div>';
                document.getElementById('selectAllSuspects').style.display = 'none';
                return;
            }

            container.innerHTML = files.map((f, idx) => {
                const ext = getExt(f.name);
                const emoji = getEmoji(ext);
                const iconClass = getIconClass(ext);
                const tag = getTag(ext);
                const sizeLabel = f.size ? formatSize(f.size) : '—';

                // escapeHtml partout sur le contenu textuel + escapeAttr-like sur data-path.
                // Avant : ${f.name}, ${f.path} injectés direct — si un repo a un fichier
                // avec `<` ou `&` dans le nom, ça casse le rendu.
                return `<div class="file-item">
                    <input type="checkbox" class="suspect-checkbox" data-path="${escapeHtml(f.path)}" id="suspect-${idx}">
                    <div class="file-icon ${iconClass}">${emoji}</div>
                    <div class="file-info">
                        <div class="file-name">${escapeHtml(f.name)}</div>
                        <div class="file-path">${escapeHtml(f.path)}</div>
                    </div>
                    <span class="file-size">${sizeLabel}</span>
                    ${tag ? `<span class="file-tag ${tag.cls}">${tag.txt}</span>` : ''}
                </div>`;
            }).join('');
        }

        function getEmoji(ext) {
            const map = { '.jar': '☕', '.war': '☕', '.dll': '🔷', '.exe': '🔷', '.mp4': '🎬', '.mp3': '🎵', '.png': '🖼️', '.jpg': '🖼️', '.sql': '🗄️', '.zip': '🗜️', '.log': '📜', '.pem': '🔐', '.key': '🔐' };
            return map[ext] || '📄';
        }

        function getIconClass(ext) {
            if (['.jar', '.war', '.dll', '.exe'].includes(ext)) return 'binary';
            if (['.mp4', '.mp3', '.png', '.jpg'].includes(ext)) return 'media';
            if (['.sql', '.csv', '.dump'].includes(ext)) return 'data';
            if (['.zip', '.tar', '.gz'].includes(ext)) return 'deps';
            return 'code';
        }

        function getTag(ext) {
            if (['.jar', '.war', '.dll', '.exe', '.zip'].includes(ext)) return { txt: '🗑️ Binaire', cls: 'danger' };
            if (['.pem', '.key', '.p12'].includes(ext)) return { txt: '⚠️ Secret!', cls: 'danger' };
            if (['.log', '.sql'].includes(ext)) return { txt: '⚠️ Data', cls: 'warning' };
            return null;
        }

        function renderPatterns() {
            const container = document.getElementById('patternsList');
            const patterns = Object.entries(analysis.patterns).filter(([_, p]) => p.files?.length || p.hasFolder);

            if (!patterns.length) {
                container.innerHTML = '<div class="empty-state"><div class="empty-icon">✨</div><div>Repo propre !</div></div>';
                return;
            }

            // Tri par taille décroissante : les catégories qui pèsent le plus
            // remontent (plus utile que l'ordre arbitraire de Object.entries).
            patterns.sort(([_, a], [__, b]) => (b.sizeBytes || 0) - (a.sizeBytes || 0));

            container.innerHTML = patterns.map(([_, p]) => {
                const count = p.files?.length || (p.hasFolder ? 1 : 0);
                const sizeLabel = p.sizeBytes ? `<div class="pattern-size">${formatSize(p.sizeBytes)}</div>` : '';
                return `<div class="pattern-item">
                    <div class="pattern-left">
                        <div class="pattern-icon">${p.icon}</div>
                        <div class="pattern-info"><h4>${escapeHtml(p.name)}</h4><p>${escapeHtml(p.recommendation)}</p></div>
                    </div>
                    <div class="pattern-stats">
                        <div class="pattern-count">${count}</div>
                        ${sizeLabel}
                    </div>
                </div>`;
            }).join('');
        }

        function renderChart() {
            const container = document.getElementById('chartContainer');
            const dist = analysis.distribution;
            const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1;

            const colors = { code: '#34d399', config: '#60a5fa', docs: '#a78bfa', media: '#f472b6', binary: '#f87171', other: '#9ca3af' };
            const labels = { code: 'Code', config: 'Config', docs: 'Docs', media: 'Médias', binary: 'Binaires', other: 'Autres' };

            let gradientParts = [], angle = 0;
            for (const [key, count] of Object.entries(dist)) {
                const pct = (count / total) * 100;
                const end = angle + (pct * 3.6);
                gradientParts.push(`${colors[key]} ${angle}deg ${end}deg`);
                angle = end;
            }

            const legend = Object.entries(dist).filter(([_, c]) => c > 0).map(([key, count]) => {
                const pct = ((count / total) * 100).toFixed(1);
                return `<div class="legend-item"><div class="legend-color" style="background:${colors[key]}"></div><span class="legend-label">${labels[key]}</span><span class="legend-value">${count} (${pct}%)</span></div>`;
            }).join('');

            container.innerHTML = `<div class="pie-chart" style="background:conic-gradient(${gradientParts.join(',')})"></div><div class="chart-legend">${legend}</div>`;
        }

        function renderRecos() {
            const container = document.getElementById('recommendationsList');
            const recos = [];
            const p = analysis.patterns;

            // Impact basé sur les VRAIES tailles agrégées par catégorie (avant :
            // ranges hardcodés "~200-500 Mo" etc. qui n'avaient aucun rapport
            // avec la réalité du projet).
            const impactOf = (key, fallback = 'Impact variable') => {
                const bytes = p[key]?.sizeBytes;
                return bytes ? formatSize(bytes) : fallback;
            };

            if (p.secrets)   recos.push({ icon: '🚨', title: 'Secrets détectés !',      desc: 'Supprimez immédiatement et révoquez les clés/certificats compromis.', impact: 'Sécurité critique', prio: 'high' });
            if (p.deps_node) recos.push({ icon: '📦', title: 'Supprimer node_modules',   desc: 'Utilisez npm ci pour reconstruire les dépendances depuis package-lock.json.', impact: impactOf('deps_node'), prio: 'high' });
            if (p.binaries)  recos.push({ icon: '☕', title: 'Externaliser les JARs',    desc: 'Utilisez Nexus ou Artifactory pour héberger les binaires Java.', impact: impactOf('binaries'), prio: 'medium' });
            if (p.build)     recos.push({ icon: '🔨', title: 'Ignorer les dossiers build', desc: 'Ajoutez target/, build/, dist/ au .gitignore.', impact: impactOf('build'), prio: 'medium' });
            if (p.logs)      recos.push({ icon: '📜', title: 'Supprimer les logs',       desc: 'Les fichiers .log ne doivent pas être versionnés.', impact: impactOf('logs'), prio: 'low' });
            if (p.media)     recos.push({ icon: '🎬', title: 'Utiliser Git LFS',         desc: 'Pour les gros fichiers média.', impact: impactOf('media', 'Performance'), prio: 'medium' });

            if (!recos.length) recos.push({ icon: '✨', title: 'Repo en bonne santé !', desc: 'Aucun problème majeur détecté.', impact: 'Tout va bien', prio: 'low' });

            // escapeHtml sur les champs textuels (avant : injection directe — fragile
            // si on injecte un jour du contenu dynamique dans recos.push).
            container.innerHTML = recos.map(r => `<div class="reco-card ${r.prio}">
                <div class="reco-header"><span class="reco-icon">${r.icon}</span><span class="reco-title">${escapeHtml(r.title)}</span></div>
                <div class="reco-desc">${escapeHtml(r.desc)}</div>
                <div class="reco-impact">💡 <strong>${escapeHtml(r.impact)}</strong></div>
            </div>`).join('');
        }

        function renderGitignore() {
            const p = analysis.patterns;
            let gi = `# .gitignore généré par Repo Diet - LCL DevOps Hub

# IDE
.idea/
.vscode/
*.iml
.DS_Store

# Build
target/
build/
dist/
out/
bin/
obj/
*.class
*.pyc
__pycache__/

# Dependencies
node_modules/
vendor/
venv/
.venv/

# Logs
*.log
logs/
tmp/

# Secrets
*.pem
*.key
*.p12
.env
.env.local
credentials.json
secrets.yml
`;
            if (p.binaries) gi += '\n# Java\n*.jar\n*.war\n*.ear\n';
            if (p.dotnet) gi += '\n# .NET\n*.dll\n*.exe\n*.pdb\n';
            if (p.archives) gi += '\n# Archives\n*.zip\n*.tar\n*.gz\n';

            generatedGitignore = gi;
            document.getElementById('gitignoreContent').textContent = gi;
            
            // Afficher le statut du .gitignore existant
            const statusEl = document.getElementById('gitignoreStatus');
            if (analysis.hasGitignore) {
                statusEl.innerHTML = '✅ Un .gitignore existe déjà dans le repo';
                statusEl.className = 'gitignore-status';
            } else {
                statusEl.innerHTML = '⚠️ Aucun .gitignore dans le repo - pensez à en créer un !';
                statusEl.className = 'gitignore-status warning';
            }
        }

        function copyGitignore() {
            navigator.clipboard.writeText(generatedGitignore).then(() => {
                const statusEl = document.getElementById('gitignoreStatus');
                statusEl.innerHTML = '✅ Copié dans le presse-papier !';
                statusEl.className = 'gitignore-status success';
                setTimeout(() => {
                    if (analysis.hasGitignore) {
                        statusEl.innerHTML = '✅ Un .gitignore existe déjà dans le repo';
                        statusEl.className = 'gitignore-status';
                    } else {
                        statusEl.innerHTML = '⚠️ Aucun .gitignore dans le repo';
                        statusEl.className = 'gitignore-status warning';
                    }
                }, 2000);
            });
        }

        async function createGitignore() {
            const statusEl = document.getElementById('gitignoreStatus');

            if (analysis.hasGitignore) {
                if (!confirm('Un .gitignore existe déjà. Voulez-vous le remplacer ?')) {
                    return;
                }
            }

            statusEl.innerHTML = '⏳ Création en cours...';
            statusEl.className = 'gitignore-status';

            try {
                // Encodage UTF-8 → base64 moderne (avant : btoa(unescape(encodeURIComponent(...)))
                // qui utilise `unescape`, déprécié).
                const content = utf8ToBase64(generatedGitignore);
                const method = analysis.hasGitignore ? 'PUT' : 'POST';

                const r = await fetchGitLab(`/projects/${projectId}/repository/files/.gitignore`, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        branch: analysis.defaultBranch,
                        content,
                        encoding: 'base64',
                        commit_message: '🧹 Add/update .gitignore via Repo Diet'
                    })
                });

                if (r.ok) {
                    statusEl.innerHTML = '✅ .gitignore créé avec succès !';
                    statusEl.className = 'gitignore-status success';
                    analysis.hasGitignore = true;
                } else {
                    let msg = `HTTP ${r.status}`;
                    try {
                        const body = await r.json();
                        msg = body.message || body.error || msg;
                    } catch { /* body non-JSON */ }
                    throw new Error(msg);
                }
            } catch (error) {
                statusEl.innerHTML = `❌ Erreur : ${escapeHtml(error.message)}`;
                statusEl.className = 'gitignore-status error';
            }
        }

        // Toggle select all suspects
        function toggleSelectAll() {
            allSelected = !allSelected;
            const checkboxes = document.querySelectorAll('.suspect-checkbox');
            checkboxes.forEach(cb => cb.checked = allSelected);
            document.getElementById('selectAllSuspects').textContent = allSelected ? '☐ Tout désélectionner' : '☑️ Tout sélectionner';
        }

        // Génère les commandes Git pour supprimer les fichiers suspects sélectionnés.
        //
        // ⚠️ CHANGEMENT DE COMPORTEMENT IMPORTANT (ADR-4) :
        // Avant : la sortie générait `git rm --cached` + `git commit` + `git push origin main`.
        // Si l'utilisateur copiait-collait sans relire, il poussait directement sur main.
        // Sur LCL où main est protégée, le push échoue (heureusement), mais ce n'est pas
        // une excuse pour générer des commandes dangereuses.
        //
        // Maintenant : on force un workflow Branche + MR :
        //   1. git checkout -b cleanup/repo-diet-<timestamp>
        //   2. git rm --cached <files>
        //   3. git commit
        //   4. git push origin <branch>  ← sur la nouvelle branche, pas sur main
        //   5. (manuel) Créer une MR dans GitLab UI
        //
        // C'est plus de friction mais c'est ce qu'on doit faire.
        function showDeleteCommands() {
            const checkboxes = document.querySelectorAll('.suspect-checkbox:checked');
            const paths = Array.from(checkboxes).map(cb => cb.dataset.path);

            if (paths.length === 0) {
                alert('Sélectionnez au moins un fichier à supprimer');
                return;
            }

            // Nom de branche unique avec timestamp pour éviter les collisions
            // si l'utilisateur fait plusieurs sessions de nettoyage le même jour.
            const branchName = `cleanup/repo-diet-${Date.now()}`;
            const defaultBranch = analysis.defaultBranch || 'main';

            let commands = `# ═══════════════════════════════════════════════════════════
# 🧹 Repo Diet — Suppression de ${paths.length} fichier(s) suspect(s)
# ═══════════════════════════════════════════════════════════
#
# ⚠️ Workflow SÉCURISÉ : on crée une branche dédiée et on
# pousse uniquement sur celle-ci. Aucun push direct sur "${defaultBranch}".
# À l'étape finale, ouvrez une MR dans GitLab pour review.
#
# Faites un backup local avant si vous avez du travail en cours :
#   git stash

# 1. Se positionner sur ${defaultBranch} à jour
git checkout ${defaultBranch}
git pull origin ${defaultBranch}

# 2. Créer la branche de nettoyage
git checkout -b ${branchName}

# 3. Supprimer les fichiers du tracking Git (garde-les localement)
`;
            paths.forEach(p => {
                // Quote chaque path pour gérer les espaces / caractères spéciaux
                commands += `git rm --cached "${p}"\n`;
            });

            commands += `
# 4. Commit
git commit -m "🧹 Remove ${paths.length} suspect file(s) via Repo Diet"

# 5. Push de la BRANCHE (pas de "${defaultBranch}")
git push origin ${branchName}

# 6. Ouvrir une MR dans GitLab UI :
#    ${branchName} → ${defaultBranch}
#    URL probable (selon ton instance) :
#    <GITLAB_URL>/<group>/<project>/-/merge_requests/new?merge_request[source_branch]=${branchName}

# ═══════════════════════════════════════════════════════════
# ⚠️ OPTIONNEL : Nettoyer aussi l'HISTORIQUE Git
# ═══════════════════════════════════════════════════════════
#
# Les commandes ci-dessus suppriment les fichiers du HEAD mais
# ILS RESTENT dans l'historique → le repo reste lourd à cloner.
# Pour nettoyer l'historique (réécriture, force-push, à coordonner
# avec toute l'équipe) :

# Avec git filter-repo (recommandé) :
`;
            paths.forEach(p => {
                commands += `# git filter-repo --path "${p}" --invert-paths\n`;
            });

            commands += `
# Ou avec BFG Repo-Cleaner :
# java -jar bfg.jar --delete-files "{${paths.map(p => p.split('/').pop()).join(',')}}"
#
# ⚠️ Le filter-repo réécrit l'historique → toute l'équipe doit re-cloner.
# Voir le panneau "🧹 Nettoyage de l'historique" pour le détail.
`;

            showModal('🗑️ Commandes de suppression (avec MR)', commands);
        }

        // Commandes nettoyage historique
        function showHistoryCleanupCommands() {
            const commands = `# ═══════════════════════════════════════════════════════════
# 🧹 Nettoyage de l'historique Git
# ═══════════════════════════════════════════════════════════

# ⚠️ ATTENTION: Ces commandes réécrivent l'historique !
# Faites un backup complet avant de continuer.
# Tous les collaborateurs devront re-cloner le repo après.

# ───────────────────────────────────────────────────────────
# Option 1: git filter-repo (recommandé, rapide)
# ───────────────────────────────────────────────────────────

# Installer git-filter-repo
pip install git-filter-repo

# Analyser les gros fichiers dans l'historique
git filter-repo --analyze

# Voir le rapport (dans .git/filter-repo/analysis/)
cat .git/filter-repo/analysis/path-all-sizes.txt | head -20

# Supprimer un fichier/dossier de tout l'historique
git filter-repo --path node_modules --invert-paths
git filter-repo --path "*.jar" --invert-paths

# ───────────────────────────────────────────────────────────
# Option 2: BFG Repo-Cleaner (simple pour gros fichiers)
# ───────────────────────────────────────────────────────────

# Télécharger BFG
# https://rtyley.github.io/bfg-repo-cleaner/

# Supprimer tous les fichiers > 100Mo de l'historique
java -jar bfg.jar --strip-blobs-bigger-than 100M

# Supprimer des fichiers spécifiques
java -jar bfg.jar --delete-files "*.jar"
java -jar bfg.jar --delete-folders node_modules

# Nettoyer après BFG
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# ───────────────────────────────────────────────────────────
# Après nettoyage: Force push
# ───────────────────────────────────────────────────────────

git push origin --force --all
git push origin --force --tags

# Informer l'équipe de re-cloner le repo !
`;
            
            showModal('🧹 Nettoyage historique Git', commands);
        }

        // Modal
        function showModal(title, content) {
            document.getElementById('modalTitle').textContent = title;
            // <pre> avec contenu échappé (escapeHtml défini en tête).
            document.getElementById('modalBody').innerHTML = `<pre>${escapeHtml(content)}</pre>`;
            document.getElementById('modalOverlay').classList.add('show');
            window.modalContent = content;
        }

        function closeModal() {
            const overlay = document.getElementById('modalOverlay');
            if (overlay) overlay.classList.remove('show');
        }

        function copyModalContent() {
            if (!window.modalContent) return;
            navigator.clipboard.writeText(window.modalContent).then(() => {
                const btn = document.querySelector('.modal-footer [data-action="copy-modal"]');
                if (!btn) return;
                const orig = btn.textContent;
                btn.textContent = '✅ Copié !';
                setTimeout(() => btn.textContent = orig || '📋 Copier', 2000);
            });
        }

        // Copier le contenu du panneau "Commandes Git" (visible quand l'utilisateur
        // a cliqué "Générer commandes suppression" puis fermé le modal et veut
        // re-copier depuis le panneau principal).
        function copyCommands() {
            const el = document.getElementById('commandsContent');
            if (!el) return;
            const text = el.textContent || '';
            navigator.clipboard.writeText(text);
        }

        // ══════════════════════════════════════════════════════════════════
        //  DÉMARRAGE
        // ══════════════════════════════════════════════════════════════════

        // Wrapper DOMContentLoaded explicite (avant : init() en fin de fichier,
        // OK en pratique mais fragile si le script est déplacé).
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
