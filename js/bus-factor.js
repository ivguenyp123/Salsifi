        // ══════════════════════════════════════════════════════════════════
        //  CONFIGURATION
        // ══════════════════════════════════════════════════════════════════

        let GITLAB_URL = null;
        let projectId = null;
        let token = null;

        // Données calculées
        let contributors = {};      // { email: { name, commits, files: Set, directories: Set } }
        let directories = {};       // { path: { contributors: { email: count }, totalCommits } }
        let busFactorByDir = {};    // { path: { factor, contributors: [...], totalCommits } }

        // Concurrence pour les fetches commit-diff. Aligné sur conflict-radar.
        // 8 est un compromis : assez parallèle pour finir en ~8-10s sur 200 commits,
        // assez prudent pour ne pas saturer GitLab.
        const COMMIT_DIFF_CONCURRENCY = 8;

        // Taille de l'échantillon de commits analysés. 200 commits suffisent à dresser
        // une cartographie réaliste du "qui touche quoi" sur les semaines récentes —
        // ce qui est la définition utile du Bus Factor (qui sait quoi AUJOURD'HUI,
        // pas qui a écrit quoi en 2018).
        const COMMIT_SAMPLE_SIZE = 200;

        // ══════════════════════════════════════════════════════════════════
        //  HELPERS — fetchGitLab (retry 429), runWithConcurrency, escapeHtml.
        //  Alignés sur l'écosystème (insights, gaming, feature-flag-manager,
        //  mr-reviewer, auto-rebase, conflict-radar).
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

        function runWithConcurrency(tasks, limit) { return window.Salsifi.runWithConcurrency(tasks, limit); }

        // escapeHtml unifié et défini en tête de fichier (avant : défini au milieu,
        // utilisé inégalement — renderBranchesGrid OK, mais renderRiskZones et
        // renderRecommendations injectaient sans échapper).
        function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }

        // ══════════════════════════════════════════════════════════════════
        //  INITIALISATION
        // ══════════════════════════════════════════════════════════════════

        async function init() {
            // Nouveau format hub : localStorage 'devops_hub_workspaces' (JSON) + 'hub_selected_repo_id'
            const authRaw = localStorage.getItem('devops_hub_workspaces');
            if (authRaw) {
                try {
                    const auth = JSON.parse(authRaw);
                    token = auth.token;
                    GITLAB_URL = auth.gitlabUrl;
                } catch { /* fallback ci-dessous */ }
            }
            // Fallback ancien format (sessionStorage)
            if (!token) token = sessionStorage.getItem('gitlab_token');
            if (!GITLAB_URL) GITLAB_URL = sessionStorage.getItem('gitlab_base_url');

            // Project ID : nouveau format puis ancien
            const selectedRepoId = localStorage.getItem('hub_selected_repo_id');
            projectId = selectedRepoId || sessionStorage.getItem('gitlab_project_id');

            if (!token || !GITLAB_URL || !projectId) {
                window.location.href = 'login.html';
                return;
            }

            // Nom du projet : ancien format sinon depuis le cache repos du hub
            let projectName = sessionStorage.getItem('gitlab_project');
            if (!projectName && authRaw) {
                try {
                    const auth = JSON.parse(authRaw);
                    const cacheKey = 'hub_cache_repos_' + (auth.username || '');
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

        async function loadBusFactorData() {
            const loading = document.getElementById('loadingState');
            const content = document.getElementById('mainContent');
            const loadingText = loading.querySelector('.loading-text');

            try {
                // 1. Récupérer les commits (max 1000, par pages de 100).
                // La boucle reste séquentielle parce que chaque page dépend du résultat
                // de la précédente (savoir s'il faut continuer). Le retry 429 dans
                // fetchGitLab absorbe les saturations.
                if (loadingText) loadingText.textContent = 'Récupération des commits...';
                let allCommits = [];
                const maxPages = 10;
                for (let page = 1; page <= maxPages; page++) {
                    const r = await fetchGitLab(`/projects/${projectId}/repository/commits?per_page=100&page=${page}`);
                    if (!r.ok) {
                        if (page === 1) throw new Error(`API commits → HTTP ${r.status}`);
                        break;
                    }
                    const commits = await r.json();
                    if (!Array.isArray(commits) || commits.length === 0) break;
                    allCommits = allCommits.concat(commits);
                    if (commits.length < 100) break;
                }

                if (allCommits.length === 0) {
                    loading.innerHTML = `
                        <div class="empty-icon">📭</div>
                        <div class="empty-title">Aucun commit trouvé</div>
                        <div class="empty-subtitle">Le projet semble vide.</div>
                    `;
                    return;
                }

                // 2. Analyser les commits par auteur et par fichier (en parallèle).
                if (loadingText) loadingText.textContent = `Analyse de ${Math.min(allCommits.length, COMMIT_SAMPLE_SIZE)} commits...`;
                await analyzeCommits(allCommits);

                // 3. Calculer le bus factor par répertoire
                calculateBusFactors();

                // 4. Render
                if (loadingText) loadingText.textContent = 'Rendu...';
                renderGlobalScore();
                renderRiskZones();
                renderBranchesGrid();      // vue annexe "activité par contributeur sur branches"
                renderRecommendations();

                loading.style.display = 'none';
                content.style.display = 'block';

            } catch (error) {
                console.error('Erreur Bus Factor:', error);
                loading.innerHTML = `
                    <div class="empty-icon">❌</div>
                    <div class="empty-title">Erreur de chargement</div>
                    <div class="empty-subtitle">${escapeHtml(error.message)}</div>
                `;
            }
        }

        async function analyzeCommits(commits) {
            contributors = {};
            directories = {};

            // Échantillon : les COMMIT_SAMPLE_SIZE plus récents commits.
            // Choix volontaire — on mesure le bus factor d'AUJOURD'HUI (qui sait
            // quoi maintenant), pas le bus factor historique (qui a écrit quoi
            // depuis l'origine). Sur un projet à 5 ans d'historique avec un
            // turnover d'équipe, l'historique complet serait plus trompeur que
            // les semaines récentes.
            const sampleSize = Math.min(commits.length, COMMIT_SAMPLE_SIZE);
            const sampledCommits = commits.slice(0, sampleSize);

            // Pré-comptabiliser les commits par auteur AVANT les fetches diff
            // (le compteur "commits" ne dépend pas du diff).
            for (const commit of sampledCommits) {
                const email = commit.author_email;
                const name = commit.author_name;
                if (!contributors[email]) {
                    contributors[email] = {
                        name, email,
                        commits: 0,
                        files: new Set(),
                        directories: new Set()
                    };
                }
                contributors[email].commits++;
            }

            // Fetcher les diffs en parallèle limité à COMMIT_DIFF_CONCURRENCY.
            // Avant : `for ... await` séquentiel = 200 × ~300ms = 60s. Bottleneck.
            // Maintenant : ~8-10s sur 200 commits.
            let diffErrors = 0;
            const tasks = sampledCommits.map(commit => async () => {
                try {
                    const r = await fetchGitLab(`/projects/${projectId}/repository/commits/${commit.id}/diff`);
                    if (!r.ok) { diffErrors++; return null; }
                    const diffs = await r.json();
                    return { commit, diffs };
                } catch (e) {
                    diffErrors++;
                    return null;
                }
            });

            const results = await runWithConcurrency(tasks, COMMIT_DIFF_CONCURRENCY);

            // Phase d'agrégation : nourrir contributors[].files/directories et directories{}.
            // Avant : on faisait ça inline dans la boucle séquentielle, mais comme
            // l'agrégation est rapide on la sépare proprement de la phase IO.
            for (const r of results) {
                if (r.status !== 'fulfilled' || !r.value) continue;
                const { commit, diffs } = r.value;
                const email = commit.author_email;

                for (const diff of diffs) {
                    const filePath = diff.new_path || diff.old_path;
                    if (!filePath) continue;

                    contributors[email].files.add(filePath);

                    // Groupement par répertoire : 2 niveaux (ex: src/components,
                    // frontend/lib). Choix arbitraire — adapté aux projets
                    // typiques. Sur un repo très plat ou très profond, ce niveau
                    // peut être inadéquat (cf. doc §4).
                    const parts = filePath.split('/');
                    const dir = parts.length > 1 ? parts.slice(0, 2).join('/') : parts[0];

                    contributors[email].directories.add(dir);

                    if (!directories[dir]) {
                        directories[dir] = { contributors: {}, totalCommits: 0 };
                    }
                    if (!directories[dir].contributors[email]) {
                        directories[dir].contributors[email] = 0;
                    }
                    directories[dir].contributors[email]++;
                    directories[dir].totalCommits++;
                }
            }

            if (diffErrors > 0) {
                console.warn(`[analyzeCommits] ${diffErrors}/${sampledCommits.length} diffs en erreur — bus factor possiblement biaisé`);
            }
        }

        function calculateBusFactors() {
            busFactorByDir = {};

            for (const [dir, data] of Object.entries(directories)) {
                const total = data.totalCommits;
                const contribs = Object.entries(data.contributors)
                    .map(([email, count]) => ({
                        email,
                        name: contributors[email]?.name || email,
                        count,
                        percent: Math.round((count / total) * 100)
                    }))
                    .sort((a, b) => b.count - a.count);

                // Calculer le bus factor
                // = nombre de personnes qui couvrent 80% du code
                let cumulative = 0;
                let factor = 0;
                for (const contrib of contribs) {
                    cumulative += contrib.percent;
                    factor++;
                    if (cumulative >= 80) break;
                }

                busFactorByDir[dir] = {
                    factor: factor,
                    contributors: contribs,
                    totalCommits: total
                };
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  RENDU
        // ══════════════════════════════════════════════════════════════════

        // Médiane pondérée d'un tableau de { value, weight }. Renvoie la valeur dont
        // le poids cumulé atteint 50% du poids total. Algorithme classique :
        //   1. Trier par value
        //   2. Cumuler les poids jusqu'à atteindre la moitié du total
        // Plus représentative que la moyenne sur des distributions asymétriques
        // (un module critique noyé dans 9 modules sains tire le score vers le bas
        // si on pondère par le nombre de commits — c'est exactement ce qu'on veut
        // pour le Bus Factor).
        function weightedMedian(items) {
            if (!items.length) return 0;
            const sorted = items.slice().sort((a, b) => a.value - b.value);
            const totalWeight = sorted.reduce((s, x) => s + x.weight, 0);
            if (totalWeight === 0) return sorted[0].value;
            const halfWeight = totalWeight / 2;
            let cumul = 0;
            for (const x of sorted) {
                cumul += x.weight;
                if (cumul >= halfWeight) return x.value;
            }
            return sorted[sorted.length - 1].value;
        }

        function renderGlobalScore() {
            const zones = Object.values(busFactorByDir);
            const critical = zones.filter(z => z.factor === 1).length;
            const warning = zones.filter(z => z.factor === 2).length;
            const good = zones.filter(z => z.factor >= 3).length;

            document.getElementById('statCritical').textContent = critical;
            document.getElementById('statWarning').textContent = warning;
            document.getElementById('statGood').textContent = good;

            // Score global = médiane pondérée par totalCommits.
            //
            // Avant : moyenne arithmétique → un projet avec 1 module critique (factor=1)
            // et 9 modules sains (factor=5) donnait 4.6/5, labelisé "RISQUE FAIBLE".
            // Pourtant le module critique pouvait être le coeur du projet.
            //
            // Maintenant : médiane pondérée par le nb de commits du module.
            //   - Un module avec 1000 commits compte plus qu'un module avec 10 commits.
            //   - Si la moitié de l'activité (en commits) tombe sur des modules
            //     critiques, le score reflète "1" — la vraie alerte.
            //   - Si les modules critiques sont minoritaires en activité, le score
            //     reste élevé sans pour autant masquer les zones risquées listées
            //     en-dessous.
            const items = zones.map(z => ({ value: z.factor, weight: z.totalCommits || 1 }));
            const median = weightedMedian(items);
            const score = Math.min(5, median).toFixed(1);

            document.getElementById('globalScore').textContent = score;

            const scoreIcon = document.getElementById('scoreIcon');
            const scoreLabel = document.getElementById('scoreLabel');

            if (score < 2) {
                scoreIcon.className = 'score-icon critical';
                scoreLabel.className = 'score-label critical';
                scoreLabel.textContent = '🔴 RISQUE CRITIQUE';
            } else if (score < 3) {
                scoreIcon.className = 'score-icon warning';
                scoreLabel.className = 'score-label warning';
                scoreLabel.textContent = '🟡 RISQUE MOYEN';
            } else {
                scoreIcon.className = 'score-icon good';
                scoreLabel.className = 'score-label good';
                scoreLabel.textContent = '🟢 RISQUE FAIBLE';
            }
        }

        function renderRiskZones() {
            const container = document.getElementById('riskZones');
            const empty = document.getElementById('zonesEmpty');
            const badge = document.getElementById('zonesBadge');

            // Trier par bus factor (plus risqué en premier).
            // Filtre `totalCommits >= 5` pour ignorer les zones avec peu d'activité
            // (un fichier touché 1 fois par 1 personne donnerait factor=1 sans
            // que ce soit un vrai problème de connaissance).
            const sorted = Object.entries(busFactorByDir)
                .map(([path, data]) => ({ path, ...data }))
                .filter(z => z.totalCommits >= 5)
                .sort((a, b) => a.factor - b.factor);

            const criticalCount = sorted.filter(z => z.factor <= 2).length;
            badge.textContent = criticalCount;

            if (sorted.length === 0) {
                container.style.display = 'none';
                empty.style.display = 'block';
                return;
            }

            container.style.display = 'flex';
            empty.style.display = 'none';

            // Afficher les 10 premières zones, avec escapeHtml sur name et path
            // (avant : injection directe — fragile si un nom contient des `<>`).
            container.innerHTML = sorted.slice(0, 10).map(zone => {
                let riskClass = 'good';
                if (zone.factor === 1) riskClass = 'critical';
                else if (zone.factor === 2) riskClass = 'warning';

                const contributorsHtml = zone.contributors.slice(0, 3).map(c => {
                    const isDominant = c.percent >= 70;
                    const safeName = escapeHtml(c.name);
                    const initial = escapeHtml((c.name || '?').charAt(0).toUpperCase());
                    return `
                        <div class="contributor-bar">
                            <div class="contributor-avatar">${initial}</div>
                            <div class="contributor-name">${safeName}</div>
                            <div class="contributor-progress">
                                <div class="contributor-progress-fill ${isDominant ? 'dominant' : 'normal'}"
                                     style="width: ${c.percent}%"></div>
                            </div>
                            <div class="contributor-percent">${c.percent}%</div>
                        </div>
                    `;
                }).join('');

                return `
                    <div class="risk-zone ${riskClass}">
                        <div class="zone-path">
                            <span class="zone-path-icon">📁</span>
                            ${escapeHtml(zone.path)}/
                        </div>
                        <div class="zone-contributors">
                            ${contributorsHtml}
                        </div>
                        <div class="zone-factor">
                            <div class="factor-value ${riskClass}">${zone.factor}</div>
                            <div class="factor-label">Bus Factor</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Vue annexe au Bus Factor : pour chaque contributeur, liste ses branches
        // d'activité. Pas directement utilisée dans le calcul du bus factor — c'est
        // un panel "qui touche quoi côté branches" complémentaire.
        async function renderBranchesGrid() {
            const container = document.getElementById('branchesGrid');
            container.innerHTML = '<p style="opacity: 0.6;">Chargement des branches...</p>';

            try {
                // Charger les branches (page unique 50 — suffisant pour cette vue)
                const branchesR = await fetchGitLab(`/projects/${projectId}/repository/branches?per_page=50`);
                if (!branchesR.ok) throw new Error(`HTTP ${branchesR.status}`);
                const branches = await branchesR.json();

                if (branches.length === 0) {
                    container.innerHTML = '<p style="opacity: 0.6;">Aucune branche trouvée</p>';
                    return;
                }

                // Récupérer la branche par défaut
                let defaultBranch = 'main';
                try {
                    const projR = await fetchGitLab(`/projects/${projectId}`);
                    if (projR.ok) {
                        const projectInfo = await projR.json();
                        defaultBranch = projectInfo.default_branch || 'main';
                    }
                } catch { /* fallback 'main' */ }

                // Limiter à 12 branches pour l'affichage. Fetcher leurs commits via
                // runWithConcurrency (8 en parallèle) — alignement avec analyzeCommits.
                const targetBranches = branches.slice(0, 12);
                const branchTasks = targetBranches.map(branch => async () => {
                    try {
                        const r = await fetchGitLab(`/projects/${projectId}/repository/commits?ref_name=${encodeURIComponent(branch.name)}&per_page=50`);
                        const commits = r.ok ? await r.json() : [];

                        // Grouper par auteur
                        const authorCommits = {};
                        commits.forEach(c => {
                            const author = c.author_name || c.committer_name || 'Unknown';
                            if (!authorCommits[author]) {
                                authorCommits[author] = { name: author, count: 0, lastDate: c.created_at };
                            }
                            authorCommits[author].count++;
                        });

                        const sortedAuthors = Object.values(authorCommits)
                            .sort((a, b) => b.count - a.count)
                            .slice(0, 4);

                        const lastActivity = branch.commit?.created_at || branch.commit?.committed_date;
                        const daysSinceActivity = lastActivity
                            ? Math.floor((Date.now() - new Date(lastActivity)) / (1000 * 60 * 60 * 24))
                            : 999;

                        return {
                            name: branch.name,
                            isDefault: branch.name === defaultBranch,
                            isStale: daysSinceActivity > 30,
                            lastActivity,
                            daysSinceActivity,
                            commitCount: commits.length,
                            contributors: sortedAuthors
                        };
                    } catch {
                        return {
                            name: branch.name,
                            isDefault: branch.name === defaultBranch,
                            isStale: true,
                            contributors: []
                        };
                    }
                });

                const branchResults = await runWithConcurrency(branchTasks, COMMIT_DIFF_CONCURRENCY);
                const branchData = branchResults
                    .filter(r => r.status === 'fulfilled' && r.value)
                    .map(r => r.value);

                // Pivot : personne → [branches]
                const personMap = {};
                branchData.forEach(branch => {
                    branch.contributors.forEach(c => {
                        if (!personMap[c.name]) {
                            personMap[c.name] = { name: c.name, totalCommits: 0, branches: [] };
                        }
                        personMap[c.name].totalCommits += c.count;
                        personMap[c.name].branches.push({
                            name: branch.name,
                            isDefault: branch.isDefault,
                            isStale: branch.isStale,
                            commits: c.count,
                            lastActivity: branch.lastActivity
                        });
                    });
                });

                const persons = Object.values(personMap).sort((a, b) => b.totalCommits - a.totalCommits);

                container.innerHTML = persons.map(person => {
                    const maxCommits = Math.max(...person.branches.map(b => b.commits), 1);

                    // Trier branches : default d'abord, puis par commits décroissant
                    person.branches.sort((a, b) => {
                        if (a.isDefault) return -1;
                        if (b.isDefault) return 1;
                        return b.commits - a.commits;
                    });

                    const branchesHtml = person.branches.map(b => `
                        <div class="branch-contributor">
                            <div class="branch-contributor-avatar" style="border-radius: 6px; font-size: 0.7em;">🌿</div>
                            <div class="branch-contributor-info">
                                <div class="branch-contributor-name">${escapeHtml(b.name)}${b.isDefault ? ' <span style="font-size:0.75em;opacity:0.6;">(défaut)</span>' : ''}${b.isStale ? ' <span style="font-size:0.75em;opacity:0.5;">💤</span>' : ''}</div>
                                <div class="branch-contributor-commits">${b.commits} commits</div>
                            </div>
                            <div class="branch-contributor-bar">
                                <div class="branch-contributor-bar-fill" style="width: ${(b.commits / maxCommits) * 100}%"></div>
                            </div>
                        </div>
                    `).join('');

                    return `
                        <div class="branch-card">
                            <div class="branch-header">
                                <div>
                                    <div class="branch-name">
                                        <span class="icon">👤</span>
                                        ${escapeHtml(person.name)}
                                    </div>
                                    <div class="branch-meta">${person.totalCommits} commits sur ${person.branches.length} branche${person.branches.length > 1 ? 's' : ''}</div>
                                </div>
                            </div>
                            <div class="branch-contributors">
                                ${branchesHtml}
                            </div>
                        </div>
                    `;
                }).join('');

            } catch (e) {
                console.error('Erreur branches:', e);
                container.innerHTML = `<p style="opacity: 0.6;">Erreur: ${escapeHtml(e.message)}</p>`;
            }
        }

        // formatTimeAgo retirée : déclarée mais jamais appelée (dead code). Si
        // un futur besoin se présente (afficher la date du dernier commit par
        // branche dans la grille), la fonction est facile à recoder à partir
        // de `lastActivity` qui est déjà calculé dans branchData.

        function renderRecommendations() {
            const section = document.getElementById('recoSection');
            const container = document.getElementById('recommendations');

            const recos = [];

            // Zones critiques avec une seule personne en maîtrise
            for (const [dir, data] of Object.entries(busFactorByDir)) {
                if (data.factor === 1 && data.totalCommits >= 10) {
                    const topContrib = data.contributors[0];
                    recos.push({
                        type: 'critical',
                        icon: '🚨',
                        title: `Transférer les connaissances sur ${dir}/`,
                        description: `${topContrib.name} détient ${topContrib.percent}% du code de ce module. Planifiez des sessions de pair programming pour réduire ce risque.`
                    });
                }
            }

            // Devs avec trop de zones exclusives
            const exclusiveCounts = {};
            for (const [dir, data] of Object.entries(busFactorByDir)) {
                if (data.factor === 1 && data.contributors.length > 0) {
                    const email = data.contributors[0].email;
                    const name = data.contributors[0].name;
                    if (!exclusiveCounts[email]) {
                        exclusiveCounts[email] = { name, count: 0, dirs: [] };
                    }
                    exclusiveCounts[email].count++;
                    exclusiveCounts[email].dirs.push(dir);
                }
            }

            for (const [email, data] of Object.entries(exclusiveCounts)) {
                if (data.count >= 2) {
                    recos.push({
                        type: 'warning',
                        icon: '👥',
                        title: `${data.name} est seul sur ${data.count} modules`,
                        description: `Modules concernés : ${data.dirs.join(', ')}. Si cette personne quitte l'équipe, ces zones seront orphelines.`
                    });
                }
            }

            if (recos.length === 0) {
                section.style.display = 'none';
                container.innerHTML = '';
                return;
            }

            section.style.display = 'block';

            // escapeHtml sur title et description (avant : injection directe — fragile
            // si un nom contient des `<>` ou un dossier des caractères spéciaux).
            container.innerHTML = recos.slice(0, 5).map(reco => `
                <div class="recommendation ${reco.type}">
                    <div class="reco-icon">${reco.icon}</div>
                    <div class="reco-content">
                        <div class="reco-title">${escapeHtml(reco.title)}</div>
                        <div class="reco-description">${escapeHtml(reco.description)}</div>
                    </div>
                </div>
            `).join('');
        }

        // ══════════════════════════════════════════════════════════════════
        //  ACTIONS
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
