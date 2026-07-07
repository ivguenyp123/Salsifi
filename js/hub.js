        // ============ DATA DES 4 DIRECTIONS ============
        const DIRECTIONS = {
            measure: {
                eyebrow: 'CHEMIN 1 / 4',
                title: 'Mesurer & Progresser',
                tagline: 'Où on en est. Où on va.',
                cssClass: 'dir-measure',
                modulesTitle: 'Tes outils de pilotage',
                deeperTitle: '💡 Pour aller plus loin',
                // Ornement : courbe ascendante + axes (métaphore tableau de bord)
                ornament: `<svg viewBox="0 0 600 600" fill="none">
                    <path d="M50 500 L550 500" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
                    <path d="M50 500 L50 80" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
                    <path d="M50 480 Q150 470 200 420 T320 320 T440 180 T550 100" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                    <circle cx="200" cy="420" r="8" fill="currentColor"/>
                    <circle cx="320" cy="320" r="8" fill="currentColor"/>
                    <circle cx="440" cy="180" r="8" fill="currentColor"/>
                    <circle cx="550" cy="100" r="10" fill="currentColor"/>
                    <line x1="50" y1="200" x2="550" y2="200" stroke="currentColor" stroke-width="0.5" stroke-dasharray="4 6" opacity="0.3"/>
                    <line x1="50" y1="350" x2="550" y2="350" stroke="currentColor" stroke-width="0.5" stroke-dasharray="4 6" opacity="0.3"/>
                </svg>`,
                stats: [
                    { label: 'DORA', key: 'dora' },
                    { label: 'Maturité globale', key: 'maturity' },
                    { label: 'XP gagné (mois)', key: 'xp' },
                    { label: 'Bus factor', key: 'busFactor' }
                ],
                modules: [
                    { icon: '📊', name: 'DORA Insights', desc: 'Tes 4 chiffres clés du delivery : DF, LTC, CFR, MTTR.' },
                    { icon: '📋', name: 'DevOps Assessment', desc: 'Score de maturité sur 8 axes, radar et historique.' },
                    { icon: '🏆', name: 'Achievements', desc: '13 badges, niveau Rookie → DevOps God, motivation par jeu.' },
                    { icon: '🚌', name: 'Bus Factor', desc: 'Identifier les zones de code maîtrisées par une seule personne.' },
                    { icon: '📅', name: 'Daily Report', desc: 'Synthèse quotidienne pour standups et conseils personnalisés.' },
                    { icon: '📄', name: 'Générateur de rapport', desc: 'Composer un rapport HTML téléchargeable à partir de blocs, sur données réelles.' }
                ]
            },
            deliver: {
                eyebrow: 'CHEMIN 2 / 4',
                title: 'Livrer & Déployer',
                tagline: 'Du code en prod, sans friction.',
                cssClass: 'dir-deliver',
                modulesTitle: 'Tes outils de delivery',
                deeperTitle: '🚀 Aller plus vite',
                // Ornement : flèches diagonales en cascade (métaphore mouvement / pipeline)
                ornament: `<svg viewBox="0 0 600 600" fill="none">
                    <g stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">
                        <path d="M80 480 L380 180" opacity="0.25"/>
                        <path d="M340 220 L380 180 L340 140" opacity="0.25"/>
                        <path d="M120 500 L420 200" opacity="0.5"/>
                        <path d="M380 240 L420 200 L380 160" opacity="0.5"/>
                        <path d="M160 520 L460 220" stroke-width="4" opacity="1"/>
                        <path d="M420 260 L460 220 L420 180" stroke-width="4" opacity="1"/>
                    </g>
                    <circle cx="100" cy="500" r="6" fill="currentColor" opacity="0.3"/>
                    <circle cx="140" cy="510" r="6" fill="currentColor" opacity="0.6"/>
                    <circle cx="180" cy="520" r="8" fill="currentColor"/>
                </svg>`,
                stats: [
                    { label: 'Deploys (30j)', key: 'deploys30' },
                    { label: 'Feature flags', key: 'featureFlags' },
                    { label: 'MRs en attente', key: 'mrsOpen' },
                    { label: 'Pipeline status', key: 'pipelineStatus' }
                ],
                modules: [
                    { icon: '⚙️', name: 'Pipeline Generator', desc: 'Génère ton .gitlab-ci.yml en wizard. Pousse, lance, suis les logs.' },
                    { icon: '🚩', name: 'Feature Flag Manager', desc: 'Cycle de vie complet : création, audit, decommission, RBAC.' },
                    { icon: '📝', name: 'Release Notes', desc: 'Génère les notes de version automatiquement par tag Git.' }
                ]
            },
            inspect: {
                eyebrow: 'CHEMIN 3 / 4',
                title: 'Inspecter & Sécuriser',
                tagline: 'Garder ses repos sains.',
                cssClass: 'dir-inspect',
                modulesTitle: 'Tes outils d\'inspection',
                deeperTitle: '🔬 Creuser davantage',
                // Ornement : cibles concentriques (métaphore vigilance / scan)
                ornament: `<svg viewBox="0 0 600 600" fill="none">
                    <g stroke="currentColor" fill="none">
                        <circle cx="300" cy="300" r="240" stroke-width="1.5" opacity="0.3"/>
                        <circle cx="300" cy="300" r="180" stroke-width="1.5" opacity="0.4"/>
                        <circle cx="300" cy="300" r="120" stroke-width="2" opacity="0.6"/>
                        <circle cx="300" cy="300" r="60" stroke-width="2.5" opacity="0.85"/>
                    </g>
                    <circle cx="300" cy="300" r="14" fill="currentColor"/>
                    <line x1="300" y1="40" x2="300" y2="100" stroke="currentColor" stroke-width="2" opacity="0.5"/>
                    <line x1="300" y1="500" x2="300" y2="560" stroke="currentColor" stroke-width="2" opacity="0.5"/>
                    <line x1="40" y1="300" x2="100" y2="300" stroke="currentColor" stroke-width="2" opacity="0.5"/>
                    <line x1="500" y1="300" x2="560" y2="300" stroke="currentColor" stroke-width="2" opacity="0.5"/>
                </svg>`,
                stats: [
                    { label: 'Note sécurité', key: 'securityScore' },
                    { label: 'Poids du repo', key: 'repoSize' },
                    { label: 'Branches obsolètes', key: 'staleBranches' },
                    { label: 'MRs zombies', key: 'zombieMRs' }
                ],
                modules: [
                    { icon: '🔬', name: 'Repo Analyzer', desc: 'État global du repo : branches, commits, contributeurs, langages.' },
                    { icon: '🛡️', name: 'Security Scanner', desc: 'Conformité CIS GitLab : branch protection, approvals, lock files, secrets. Note A→F.' },
                    { icon: '🥗', name: 'Repo Diet', desc: 'Détecte fichiers binaires, archives, logs. Génère un .gitignore.' },
                    { icon: '🌳', name: 'Branch Monitor', desc: 'Détecte et nettoie les branches obsolètes : âge, statut mergé, branches protégées.' },
                    { icon: '🔑', name: 'Secrets Scanner', desc: 'Scanne les secrets exposés dans TOUS tes repos accessibles. Fichier, ligne, type, ref CIS — preview censurée.' }
                ]
            },
            collab: {
                eyebrow: 'CHEMIN 4 / 4',
                title: 'Collaborer & Améliorer',
                tagline: 'Travailler ensemble, mieux.',
                cssClass: 'dir-collab',
                modulesTitle: 'Tes outils de collaboration',
                deeperTitle: '🤝 Continuer ensemble',
                // Ornement : cercles imbriqués (métaphore relations / communauté)
                ornament: `<svg viewBox="0 0 600 600" fill="none">
                    <g stroke="currentColor" stroke-width="2" fill="none">
                        <circle cx="220" cy="240" r="120" opacity="0.5"/>
                        <circle cx="380" cy="240" r="120" opacity="0.5"/>
                        <circle cx="300" cy="380" r="120" opacity="0.5"/>
                    </g>
                    <g fill="currentColor">
                        <circle cx="220" cy="240" r="14" opacity="0.85"/>
                        <circle cx="380" cy="240" r="14" opacity="0.85"/>
                        <circle cx="300" cy="380" r="14" opacity="0.85"/>
                        <circle cx="300" cy="240" r="8" opacity="0.5"/>
                        <circle cx="260" cy="310" r="8" opacity="0.5"/>
                        <circle cx="340" cy="310" r="8" opacity="0.5"/>
                    </g>
                </svg>`,
                stats: [
                    { label: 'MRs mergées (sem.)', key: 'mrsMergedWeek' },
                    { label: 'Reviewers actifs', key: 'reviewersActive' },
                    { label: 'Contributeurs actifs', key: 'contributorsActive' },
                    { label: 'Lead time MR', key: 'leadTimeMR' }
                ],
                modules: [
                    { icon: '🤖', name: 'MR Reviewer AI', desc: 'Analyse IA des MRs : qualité, risques, couverture, suggestions.' },
                    { icon: '🔄', name: 'Auto Retro', desc: 'Génère une rétro à partir des données GitLab. User stories Jira incluses.' },
                    { icon: '🎯', name: 'Smart Estimate', desc: 'Estime la charge d\'une feature à partir de l\'historique des MRs.' }
                ]
            }
        };

        // ============ NAVIGATION DRILLDOWN ============
        let currentDrilldown = null;
        let drilldownAbortToken = 0;

        function openDrilldown(key) {
            const dir = DIRECTIONS[key];
            if (!dir) return;

            const overlay = document.getElementById('drilldown');
            // reset classes
            overlay.className = 'drilldown ' + dir.cssClass;
            currentDrilldown = key;

            document.getElementById('dd-eyebrow').textContent = dir.eyebrow;
            document.getElementById('dd-title').textContent = dir.title;
            document.getElementById('dd-tagline').textContent = dir.tagline;
            document.getElementById('dd-modules-title').textContent = dir.modulesTitle || 'Tes outils';
            document.getElementById('dd-deeper-title').textContent = dir.deeperTitle || '💡 Pour aller plus loin';

            // Ornement SVG signature
            document.getElementById('dd-ornament').innerHTML = dir.ornament || '';

            // Stats — placeholders/skeleton d'abord, valeurs réelles ensuite
            renderDrilldownStatsSkeleton(dir.stats);

            // Modules — statiques
            document.getElementById('dd-modules').innerHTML = dir.modules.map(moduleCardHtml).join('');

            // "Pour aller plus loin" — ateliers réels (référentiel) + conseils génériques
            renderDeeperSection(key);

            // Scroll en haut quand on ouvre
            overlay.scrollTop = 0;
            requestAnimationFrame(() => overlay.classList.add('active'));
            document.body.style.overflow = 'hidden';

            // Humeur du chemin : teinte du chemin + intensité selon son état réel
            try {
                if (typeof currentRepo !== 'undefined' && currentRepo) {
                    const syn = readSynCache(currentRepo.id);
                    const history = readSynHistory(currentRepo.id);
                    setPathMood(key, syn, history);
                }
            } catch {}

            // Stats live (asynchrone)
            loadDrilldownStats(key, dir.stats);
        }

        function renderDrilldownStatsSkeleton(stats) {
            document.getElementById('dd-stats').innerHTML = stats.map(s => `
                <div data-stat-key="${s.key}">
                    <div class="dd-stat-label">${s.label}</div>
                    <div class="dd-stat-value"><span class="dd-stat-skeleton"></span></div>
                    <div class="dd-stat-meta">&nbsp;</div>
                </div>
            `).join('');
        }

        // ───── Mapping module → URL réelle ─────────────────────────────────
        // Modules câblés sur des pages réelles. Les autres : toast "À venir".
        const MODULE_URLS = {
            'DORA Insights': 'insights.html',
            'DevOps Assessment': 'maturity.html',
            'Achievements': 'gaming.html',
            'Bus Factor': 'bus-factor.html',
            'Daily Report': 'daily-report.html',
            'Générateur de rapport': 'report-builder.html',
            'Feature Flag Manager': 'feature-flag-manager.html',
            'Release Notes': 'release-notes.html',
            'Pipeline Generator': 'pipeline-generator.html',
            'Repo Analyzer': 'repo-analyzer.html',
            'Security Scanner': 'gouvernance-repo.html',
            'Repo Diet': 'repo-diet.html',
            'Branch Monitor': 'branch-cleaner.html',
            'MR Reviewer AI': 'mr-reviewer.html',
            'Auto Retro': 'autoretro.html',
            'Smart Estimate': 'smart-estimate.html',
            'Secrets Scanner': 'secrets-scanner.html'
            // Les autres seront ajoutés au fur et à mesure du portage
        };
        // Modules migrés au modèle plateforme : ils lisent le repo via ?repo=<id>
        // (auth en localStorage). Les autres pages suivront au portage.
        const MODULE_REPO_AWARE = new Set(['Pipeline Generator', 'Repo Analyzer', 'Security Scanner', 'Repo Diet', 'Branch Monitor', 'MR Reviewer AI', 'Auto Retro', 'Smart Estimate', 'Générateur de rapport']);

        // Modules RÉSERVÉS : grisés + non cliquables (pas de self-service par les équipes).
        // Le Secrets Scanner balaie TOUS les repos accessibles → lancé par la plateforme, pas en libre accès.
        const MODULE_DISABLED = {
            'Secrets Scanner': "Réservé à la plateforme — pas en libre accès pour les équipes."
        };

        // Markup d'une carte module (partagé drawer + grille expert), gère l'état réservé.
        function moduleCardHtml(m) {
            const esc = window.escapeHtml || (s => s);
            const reason = MODULE_DISABLED[m.name];
            return `
                <div class="dd-module${reason ? ' is-disabled' : ''}" data-module-name="${esc(m.name)}"${reason ? ` title="${esc(reason)}"` : ''}>
                    <div class="dd-module-icon">${m.icon}</div>
                    <div class="dd-module-name">${m.name}${reason ? ' <span class="dd-module-lock">🔒 réservé</span>' : ''}</div>
                    <div class="dd-module-desc">${m.desc}</div>
                </div>`;
        }

        document.getElementById('dd-modules').addEventListener('click', e => {
            const card = e.target.closest('.dd-module[data-module-name]');
            if (!card) return;
            const name = card.dataset.moduleName;
            if (MODULE_DISABLED[name]) {
                showHubToast(`🔒 <strong>${escapeHtml(name)}</strong> — ${escapeHtml(MODULE_DISABLED[name])}`, 'info');
                return;
            }
            let url = MODULE_URLS[name];
            if (url) {
                if (MODULE_REPO_AWARE.has(name) && currentRepo) {
                    url += '?repo=' + encodeURIComponent(currentRepo.id);
                }
                window.location.href = url;
            } else {
                showHubToast(`📦 Module <strong>${escapeHtml(name)}</strong> à venir`, 'info');
            }
        });

        async function loadDrilldownStats(key, statsConfig) {
            const myToken = ++drilldownAbortToken;
            if (!currentRepo) return;

            try {
                // Cache HIT instantané
                const cached = readDrilldownCache(currentRepo.id, key);
                if (cached) {
                    if (myToken !== drilldownAbortToken || currentDrilldown !== key) return;
                    applyDrilldownStats(statsConfig, cached);
                }

                // Compute frais
                const values = await computeDrilldownStats(key, currentRepo);
                if (myToken !== drilldownAbortToken || currentDrilldown !== key) return;
                writeDrilldownCache(currentRepo.id, key, values);
                applyDrilldownStats(statsConfig, values);
            } catch (e) {
                console.error('Drilldown stats failed:', e);
                if (myToken !== drilldownAbortToken || currentDrilldown !== key) return;
                applyDrilldownStats(statsConfig, {}); // tous en erreur
            }
        }

        function applyDrilldownStats(statsConfig, values) {
            statsConfig.forEach(cfg => {
                const v = values[cfg.key];
                const cell = document.querySelector(`#dd-stats > div[data-stat-key="${cfg.key}"]`);
                if (!cell) return;
                const valEl = cell.querySelector('.dd-stat-value');
                const metaEl = cell.querySelector('.dd-stat-meta');
                if (!v || v.value == null) {
                    valEl.innerHTML = '—';
                    metaEl.innerHTML = '<span class="warn">⚠️ Pas de données</span>';
                } else {
                    valEl.innerHTML = v.value;
                    metaEl.innerHTML = v.meta || '&nbsp;';
                    animateCountEl(valEl);   // chiffres qui grimpent à l'entrée du chemin
                }
                cell.setAttribute('data-loaded', 'true');
            });
        }

        function closeDrilldown() {
            const overlay = document.getElementById('drilldown');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
            // Restaure l'humeur globale de l'accueil
            restoreHomeMood();
        }

        // ESC pour fermer
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') { closeDrilldown(); closeExpertMode(); }
        });

        // ───── MODE EXPERT : grille de tous les modules des 4 chemins ──────
        // Réutilise EXACTEMENT la même navigation que les chemins :
        // MODULE_URLS + MODULE_REPO_AWARE + currentRepo (?repo=<id>).
        function openExpertMode() {
            const overlay = document.getElementById('expertModal');
            const grid = document.getElementById('expert-modules');
            if (!overlay || !grid) return;

            // Aplatit les modules des 4 chemins dans l'ordre measure → deliver → inspect → collab
            const cards = [];
            Object.keys(DIRECTIONS).forEach(key => {
                const dir = DIRECTIONS[key];
                (dir.modules || []).forEach(m => {
                    cards.push(moduleCardHtml(m));
                });
            });
            grid.innerHTML = cards.join('');

            overlay.scrollTop = 0;
            requestAnimationFrame(() => overlay.classList.add('active'));
            document.body.style.overflow = 'hidden';
        }

        function closeExpertMode() {
            const overlay = document.getElementById('expertModal');
            if (!overlay) return;
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }

        // Clic sur un module de la grille expert : même logique que #dd-modules
        document.getElementById('expert-modules')?.addEventListener('click', e => {
            const card = e.target.closest('.dd-module[data-module-name]');
            if (!card) return;
            const name = card.dataset.moduleName;
            if (MODULE_DISABLED[name]) {
                showHubToast(`🔒 <strong>${escapeHtml(name)}</strong> — ${escapeHtml(MODULE_DISABLED[name])}`, 'info');
                return;
            }
            let url = MODULE_URLS[name];
            if (url) {
                if (MODULE_REPO_AWARE.has(name) && currentRepo) {
                    url += '?repo=' + encodeURIComponent(currentRepo.id);
                }
                window.location.href = url;
            } else {
                showHubToast(`📦 Module <strong>${escapeHtml(name)}</strong> à venir`, 'info');
            }
        });

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  AUTH + REPO PICKER + DONNÉES GITLAB                             ║
        // ╚══════════════════════════════════════════════════════════════════╝

        // ───── Constantes ──────────────────────────────────────────────────
        const CACHE_KEY_PREFIX = 'hub_cache_repos_';
        const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
        const STORAGE_KEY = 'devops_hub_workspaces';
        const SELECTED_REPO_KEY = 'hub_selected_repo_id';
        const SEARCH_THRESHOLD = 5; // afficher la search bar au-delà

        // ───── État global ─────────────────────────────────────────────────
        let auth = null;       // { gitlabUrl, token, username }
        let allRepos = [];     // tous les repos chargés
        let currentRepo = null;
        let currentRepoPage = 0;       // dernière page GitLab chargée (0 = rien)
        let hasMoreRepos = false;      // reste-t-il des pages à charger ?
        let isLoadingMoreRepos = false;

        // ───── Helpers HTML escape ─────────────────────────────────────────
        function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }

        // ───── fetch avec retry 429 ────────────────────────────────────────
        async function fetchGitLab(endpoint, init = {}) {
            return window.Salsifi.gitlabFetch(auth.gitlabUrl, auth.token, endpoint, init);
        }

        // ───── Guard d'auth ────────────────────────────────────────────────
        function loadAuth() {
            return window.Salsifi.loadAuth({ redirect: false });
        }

        function redirectToLogin() {
            window.location.href = 'login.html';
        }

        // ───── User pill + greeting ────────────────────────────────────────
        function renderUserInfo() {
            const name = auth.username || 'utilisateur';
            const initials = name
                .split(/[\s_.-]/)
                .filter(Boolean)
                .slice(0, 2)
                .map(p => p[0].toUpperCase())
                .join('') || '?';
            document.getElementById('userAvatar').textContent = initials;
            document.getElementById('userName').textContent = name;

            const firstName = name.split(/[\s_.-]/)[0];
            const capitalized = firstName.charAt(0).toUpperCase() + firstName.slice(1);
            document.getElementById('greetingTitle').innerHTML =
                `Bonjour ${escapeHtml(capitalized)} <span class="wave">👋</span>`;
        }

        // ───── Repos : fetch + cache ───────────────────────────────────────
        function getCacheKey() {
            return CACHE_KEY_PREFIX + auth.username;
        }

        function readCache() {
            try {
                const raw = localStorage.getItem(getCacheKey());
                if (!raw) return null;
                const data = JSON.parse(raw);
                if (Date.now() - data.ts > CACHE_TTL_MS) return null;
                return data.repos;
            } catch { return null; }
        }

        function writeCache(repos) {
            try {
                localStorage.setItem(getCacheKey(), JSON.stringify({
                    ts: Date.now(),
                    repos
                }));
            } catch (e) {
                console.warn('Cache write failed:', e);
            }
        }

        async function fetchReposPage(page) {
            // Une seule page à la fois (pattern aligné sur workspace-setup.html)
            const r = await fetchGitLab(`/projects?membership=true&order_by=last_activity_at&per_page=100&page=${page}`);
            if (!r.ok) {
                if (r.status === 401) {
                    // Token expiré ou invalide
                    localStorage.removeItem(STORAGE_KEY);
                    redirectToLogin();
                    return { repos: [], hasMore: false };
                }
                return { repos: [], hasMore: false };
            }
            const batch = await r.json();
            if (!Array.isArray(batch) || batch.length === 0) {
                return { repos: [], hasMore: false };
            }
            const repos = batch.map(p => ({
                id: p.id,
                name: p.name,
                path: p.path_with_namespace,
                web_url: p.web_url,
                default_branch: p.default_branch,
                last_activity_at: p.last_activity_at,
                description: p.description
            }));
            // Si on a reçu 100 projets, il y en a probablement plus
            return { repos, hasMore: batch.length === 100 };
        }

        // Charge TOUTES les pages de repos en boucle (garde-fou : 50 pages max = 5000 repos)
        async function fetchAllRepos(onProgress) {
            const MAX_PAGES = 50;
            let all = [];
            const seen = new Set();
            let page = 1;
            let more = true;
            while (more && page <= MAX_PAGES) {
                const { repos, hasMore } = await fetchReposPage(page);
                for (const r of repos) {
                    if (!seen.has(r.id)) { seen.add(r.id); all.push(r); }
                }
                more = hasMore;
                if (typeof onProgress === 'function') onProgress(all, more);
                page++;
            }
            return all;
        }

        async function loadRepos() {
            const cached = readCache();
            if (cached && cached.length > 0) {
                // Affichage immédiat depuis le cache, puis on recharge TOUT en arrière-plan
                allRepos = cached;
                hasMoreRepos = false;
                renderRepoList();
                applySelectedRepo();
                fetchAllRepos().then(all => {
                    if (all.length > 0) {
                        allRepos = all;
                        hasMoreRepos = false;
                        writeCache(allRepos);
                        const searchInput = document.getElementById('repoSearchInput');
                        renderRepoList(searchInput ? searchInput.value : '');
                    }
                }).catch(e => console.warn('Background full refresh failed:', e));
                return;
            }

            // Pas de cache : on charge TOUTES les pages, avec rendu progressif
            try {
                const all = await fetchAllRepos((partial) => {
                    // Affichage progressif au fil des pages chargées
                    allRepos = partial;
                    hasMoreRepos = false;
                    renderRepoList();
                    if (!currentRepo) applySelectedRepo();
                });
                allRepos = all;
                hasMoreRepos = false;
                writeCache(allRepos);
                renderRepoList();
                applySelectedRepo();
            } catch (e) {
                console.error('Repos load failed:', e);
                document.getElementById('repoList').innerHTML =
                    `<div class="repo-empty">⚠️ Impossible de charger les projets.<br><small>Vérifie ta connexion et ton token.</small></div>`;
            }
        }

        async function loadMoreRepos() {
            if (isLoadingMoreRepos || !hasMoreRepos) return;
            isLoadingMoreRepos = true;

            const btn = document.getElementById('repoLoadMoreBtn');
            if (btn) {
                btn.disabled = true;
                btn.textContent = '⏳ Chargement…';
            }

            try {
                const nextPage = currentRepoPage + 1;
                const { repos: fresh, hasMore } = await fetchReposPage(nextPage);
                if (fresh.length > 0) {
                    // Éviter les doublons (au cas où)
                    const existing = new Set(allRepos.map(r => r.id));
                    const toAdd = fresh.filter(r => !existing.has(r.id));
                    allRepos = [...allRepos, ...toAdd];
                    currentRepoPage = nextPage;
                    hasMoreRepos = hasMore;
                    writeCache(allRepos);
                } else {
                    hasMoreRepos = false;
                }
                // Préserver le filtre de recherche en cours s'il y en a un
                const searchInput = document.getElementById('repoSearchInput');
                renderRepoList(searchInput ? searchInput.value : '');
            } catch (e) {
                console.warn('Load more repos failed:', e);
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '⚠️ Erreur — réessayer';
                }
            } finally {
                isLoadingMoreRepos = false;
            }
        }

        // ───── Sélection d'un repo ─────────────────────────────────────────
        function applySelectedRepo() {
            if (allRepos.length === 0) return;
            const savedId = localStorage.getItem(SELECTED_REPO_KEY);
            const found = savedId ? allRepos.find(r => String(r.id) === savedId) : null;
            currentRepo = found || allRepos[0];
            renderRepoButton();
            // À ce point on aurait : onRepoChange() pour rafraîchir stats/synthesis
            onRepoChange();
        }

        function selectRepo(repoId) {
            const repo = allRepos.find(r => r.id === repoId);
            if (!repo) return;
            currentRepo = repo;
            localStorage.setItem(SELECTED_REPO_KEY, String(repoId));
            renderRepoButton();
            renderRepoList(); // re-render pour mettre à jour l'active state
            closeRepoPicker();
            onRepoChange();
        }

        function renderRepoButton() {
            const btn = document.getElementById('repoPickerBtn');
            const label = document.getElementById('repoPickerLabel');
            btn.disabled = false;
            if (currentRepo) {
                label.textContent = currentRepo.name;
                btn.title = currentRepo.path;
            } else {
                label.textContent = 'Aucun projet';
            }
        }

        function renderRepoList(filter = '') {
            const list = document.getElementById('repoList');
            const searchWrap = document.getElementById('repoSearchWrap');

            // Toggle search bar si > seuil
            searchWrap.style.display = allRepos.length > SEARCH_THRESHOLD ? '' : 'none';

            const q = filter.trim().toLowerCase();
            const filtered = q
                ? allRepos.filter(r =>
                    r.name.toLowerCase().includes(q) ||
                    (r.path || '').toLowerCase().includes(q))
                : allRepos;

            if (filtered.length === 0) {
                list.innerHTML = `<div class="repo-empty">${q ? 'Aucun résultat' : 'Aucun projet accessible'}</div>`;
                return;
            }

            list.innerHTML = filtered.map(r => {
                const active = currentRepo && r.id === currentRepo.id;
                return `<div class="repo-item ${active ? 'active' : ''}" data-repo-id="${r.id}">
                    <span class="repo-item-icon">📦</span>
                    <div class="repo-item-body">
                        <div class="repo-item-name">${escapeHtml(r.name)}</div>
                        <div class="repo-item-path">${escapeHtml(r.path || '')}</div>
                    </div>
                    <span class="repo-item-check" aria-label="sélectionné">✓</span>
                </div>`;
            }).join('');

            // Bouton "Charger plus" : seulement si pas de filtre actif et qu'il reste des pages
            if (hasMoreRepos && !q) {
                list.insertAdjacentHTML('beforeend',
                    `<button type="button" class="repo-load-more" id="repoLoadMoreBtn">📦 Charger plus de repositories</button>`
                );
            }
        }

        // ───── Dropdown UI ─────────────────────────────────────────────────
        function openRepoPicker() {
            const picker = document.getElementById('repoPicker');
            picker.classList.add('open');
            const input = document.getElementById('repoSearchInput');
            if (input.offsetParent) {
                setTimeout(() => input.focus(), 50);
            }
        }
        function closeRepoPicker() {
            document.getElementById('repoPicker').classList.remove('open');
            document.getElementById('repoSearchInput').value = '';
            renderRepoList('');
        }
        function toggleRepoPicker() {
            const isOpen = document.getElementById('repoPicker').classList.contains('open');
            if (isOpen) closeRepoPicker();
            else openRepoPicker();
        }

        // ───── Event listeners ─────────────────────────────────────────────
        function wireRepoPicker() {
            document.getElementById('repoPickerBtn').addEventListener('click', e => {
                e.stopPropagation();
                if (!document.getElementById('repoPickerBtn').disabled) toggleRepoPicker();
            });

            document.getElementById('repoList').addEventListener('click', e => {
                // Bouton "Charger plus" — déclenche le chargement de la page suivante
                if (e.target.closest('#repoLoadMoreBtn')) {
                    e.stopPropagation();
                    loadMoreRepos();
                    return;
                }
                const item = e.target.closest('.repo-item');
                if (!item) return;
                selectRepo(parseInt(item.dataset.repoId, 10));
            });

            document.getElementById('repoSearchInput').addEventListener('input', e => {
                renderRepoList(e.target.value);
            });

            // Click outside ferme
            document.addEventListener('click', e => {
                if (!e.target.closest('.repo-picker')) closeRepoPicker();
            });

            // Escape ferme aussi (en plus de fermer le drilldown)
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape') closeRepoPicker();
            });
        }

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  SYNTHESIS BAR — calculs des 4 cartes                            ║
        // ╚══════════════════════════════════════════════════════════════════╝

        const SYN_CACHE_PREFIX = 'hub_syn_';
        const SYN_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
        const FETCH_CONCURRENCY = 8;

        // Helper : limiter la concurrence sur N promises
        async function runWithConcurrency(tasks, max) {
            const results = [];
            const executing = [];
            for (const task of tasks) {
                const p = Promise.resolve().then(task);
                results.push(p);
                if (max <= tasks.length) {
                    const e = p.then(() => executing.splice(executing.indexOf(e), 1));
                    executing.push(e);
                    if (executing.length >= max) await Promise.race(executing);
                }
            }
            return Promise.allSettled(results);
        }

        // Helper : fetch JSON safe (null si erreur)
        async function gl(endpoint) {
            try {
                const r = await fetchGitLab(endpoint);
                if (!r.ok) return null;
                return await r.json();
            } catch { return null; }
        }

        // ───── Cache par repo ──────────────────────────────────────────────
        function readSynCache(repoId) {
            try {
                const raw = localStorage.getItem(SYN_CACHE_PREFIX + repoId);
                if (!raw) return null;
                const data = JSON.parse(raw);
                if (Date.now() - data.ts > SYN_CACHE_TTL_MS) return null;
                return data.syn;
            } catch { return null; }
        }
        function writeSynCache(repoId, syn) {
            try {
                localStorage.setItem(SYN_CACHE_PREFIX + repoId,
                    JSON.stringify({ ts: Date.now(), syn }));
            } catch (e) { console.warn('Syn cache write failed:', e); }
        }

        // ───── Rendu des cartes ────────────────────────────────────────────
        function setSkeleton() {
            ['Dora', 'Deploy', 'Matu', 'Bus'].forEach(k => {
                const card = document.getElementById(`syn${k}Card`);
                card.removeAttribute('data-loaded');
                document.getElementById(`syn${k}Value`).innerHTML = '<span class="syn-skeleton"></span>';
                document.getElementById(`syn${k}Meta`).innerHTML = '&nbsp;';
            });
        }
        function setCard(key, valueHtml, metaHtml) {
            document.getElementById(`syn${key}Value`).innerHTML = valueHtml;
            document.getElementById(`syn${key}Meta`).innerHTML = metaHtml;
            document.getElementById(`syn${key}Card`).setAttribute('data-loaded', 'true');
        }
        function setCardError(key, label = '⚠️ Erreur') {
            setCard(key, '—', `<span class="warn">${label}</span>`);
        }

        // ───── Helpers de format ───────────────────────────────────────────
        const trendArrow = (delta) => {
            if (delta == null || !isFinite(delta)) return '<span class="neutral">·</span>';
            if (delta > 1) return '<span class="up">▲</span>';
            if (delta < -1) return '<span class="down">▼</span>';
            return '<span class="neutral">·</span>';
        };
        const fmtDelta = (delta) => {
            if (delta == null || !isFinite(delta)) return '';
            const sign = delta > 0 ? '+' : '';
            return `${sign}${delta.toFixed(0)}%`;
        };

        // ───── Calcul DORA (carte 1) ───────────────────────────────────────
        // Seuils 2024 DORA Accelerate (simplifiés)
        function doraLevel(metricKey, value) {
            if (value == null || !isFinite(value)) return null;
            const T = {
                df:  { elite: 7,    high: 1,      med: 0.25 },   // deploys/SEMAINE : >=7, >=1, >=0.25 (aligné insights.js)
                lt:  { elite: 1,    high: 24,     med: 168 },    // heures : <=1h, <=1j, <=1sem (aligné insights.js)
                cfr: { elite: 5,    high: 10,     med: 15 },     // % : <=5, <=10, <=15
                mttr:{ elite: 1,    high: 24,     med: 168 }     // heures : <1h, <1j, <1sem
            };
            const t = T[metricKey];
            if (!t) return null;
            if (metricKey === 'df') {
                if (value >= t.elite) return 'Elite';
                if (value >= t.high) return 'High';
                if (value >= t.med)  return 'Medium';
                return 'Low';
            }
            // pour lt, cfr, mttr : plus c'est petit, mieux c'est
            if (value <= t.elite) return 'Elite';
            if (value <= t.high)  return 'High';
            if (value <= t.med)   return 'Medium';
            return 'Low';
        }
        const LEVEL_RANK = { 'Elite': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
        const WORST_LEVEL = (levels) => {
            const valid = levels.filter(l => l);
            if (valid.length === 0) return null;
            return valid.reduce((worst, l) =>
                LEVEL_RANK[l] < LEVEL_RANK[worst] ? l : worst, valid[0]);
        };

        // Aligné sur insights.js (computeDORA "maison") : même dédup SHA, mêmes médianes,
        // même CFR multi-fenêtres pondérées, même MTTR scan-forward. Source unique de vérité
        // pour la carte synthèse DORA ET le lead time du drilldown (qui lit syn.dora.lt).
        async function computeDORA(repo, pipelines, mrs) {
            const now = Date.now();
            const d30 = new Date(now);
            d30.setDate(d30.getDate() - 30);

            // Branches "production" pour CFR et MTTR : main/master + default_branch
            const defaultBranch = repo.default_branch || null;
            const prodBranches = new Set(['main', 'master']);
            if (defaultBranch) prodBranches.add(defaultBranch);

            const pipelines30 = (pipelines || []).filter(p => new Date(p.created_at) >= d30);

            // ── Deployment Frequency (déploiements/SEMAINE) ──
            // Tous les success toutes branches, dédupés par SHA (1 commit = 1 déploiement).
            const successByCommit = {};
            pipelines30.forEach(p => {
                if (p.status !== 'success' || !p.sha) return;
                const existing = successByCommit[p.sha];
                if (!existing || new Date(p.created_at) > new Date(existing.created_at)) {
                    successByCommit[p.sha] = p;
                }
            });
            const successPipelines = Object.values(successByCommit);
            pipelines30.forEach(p => { if (p.status === 'success' && !p.sha) successPipelines.push(p); });
            const df = parseFloat(((successPipelines.length / 30) * 7).toFixed(2));

            // ── Lead Time for Changes (first_commit_at → merged_at, médiane, heures) ──
            const mergedMRs = (mrs || []).filter(mr =>
                mr.state === 'merged' && mr.merged_at && new Date(mr.merged_at) >= d30);
            let lt = null;
            if (mergedMRs.length > 0) {
                const leadTimes = mergedMRs
                    .filter(mr => mr.first_commit_at || mr.created_at)
                    .map(mr => (new Date(mr.merged_at) - new Date(mr.first_commit_at || mr.created_at)) / 3600000)
                    .filter(v => v > 0 && v < 8760); // exclut > 1 an (erreurs de données)
                if (leadTimes.length > 0) {
                    leadTimes.sort((a, b) => a - b);
                    const mid = Math.floor(leadTimes.length / 2);
                    lt = leadTimes.length % 2 === 0
                        ? parseFloat(((leadTimes[mid - 1] + leadTimes[mid]) / 2).toFixed(1))
                        : parseFloat(leadTimes[mid].toFixed(1));
                }
            }

            // ── Change Failure Rate (multi-fenêtres pondérées, branches prod, min 5) ──
            const prodPipelines30cfr = pipelines30.filter(p => prodBranches.has(p.ref));
            const totalP = prodPipelines30cfr.length;
            const cfrInsufficient = totalP > 0 && totalP < 5;
            let cfr = null, cfr30 = null, cfr10 = null, cfr5 = null;
            if (totalP >= 5) {
                // CFR 30j (J0-9=2x, J10-19=1.5x, J20-29=1x)
                let w30f = 0, w30t = 0;
                prodPipelines30cfr.forEach(p => {
                    const age = (now - new Date(p.created_at).getTime()) / 86400000;
                    const w = age <= 10 ? 2 : age <= 20 ? 1.5 : 1;
                    w30t += w; if (p.status === 'failed') w30f += w;
                });
                cfr30 = parseFloat(((w30f / w30t) * 100).toFixed(1));

                // CFR 10j (J0-4=2x, J5-9=1.5x)
                const p10 = prodPipelines30cfr.filter(p => (now - new Date(p.created_at).getTime()) / 86400000 <= 10);
                if (p10.length >= 3) {
                    let w10f = 0, w10t = 0;
                    p10.forEach(p => {
                        const age = (now - new Date(p.created_at).getTime()) / 86400000;
                        const w = age <= 5 ? 2 : 1.5;
                        w10t += w; if (p.status === 'failed') w10f += w;
                    });
                    cfr10 = parseFloat(((w10f / w10t) * 100).toFixed(1));
                }

                // CFR 5j (J0-2=2x, J3-4=1.5x)
                const p5 = prodPipelines30cfr.filter(p => (now - new Date(p.created_at).getTime()) / 86400000 <= 5);
                if (p5.length >= 2) {
                    let w5f = 0, w5t = 0;
                    p5.forEach(p => {
                        const age = (now - new Date(p.created_at).getTime()) / 86400000;
                        const w = age <= 2 ? 2 : 1.5;
                        w5t += w; if (p.status === 'failed') w5f += w;
                    });
                    cfr5 = parseFloat(((w5f / w5t) * 100).toFixed(1));
                }

                // Score final pondéré : 5j=50%, 10j=30%, 30j=20%
                let totalWeight = 0.2, weightedCfr = cfr30 * 0.2;
                if (cfr10 !== null) { weightedCfr += cfr10 * 0.3; totalWeight += 0.3; }
                if (cfr5  !== null) { weightedCfr += cfr5  * 0.5; totalWeight += 0.5; }
                cfr = parseFloat((weightedCfr / totalWeight).toFixed(1));
            }

            // ── Time to Restore Service (failed → prochain success même ref, médiane, cap 7j, min 5) ──
            const MTTR_CAP_HOURS = 24 * 7;
            const prodPipelines30 = pipelines30
                .filter(p => prodBranches.has(p.ref))
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            let mttr = null;
            const mttrInsufficient = prodPipelines30.length > 0 && prodPipelines30.length < 5;
            if (prodPipelines30.length >= 5) {
                const restoreTimes = [];
                for (let i = 0; i < prodPipelines30.length - 1; i++) {
                    const p = prodPipelines30[i];
                    if (p.status !== 'failed') continue;
                    const next = prodPipelines30.slice(i + 1).find(n => n.ref === p.ref && n.status === 'success');
                    if (next) {
                        const hours = (new Date(next.created_at) - new Date(p.created_at)) / 3600000;
                        if (hours > 0 && hours <= MTTR_CAP_HOURS) restoreTimes.push(hours);
                    }
                }
                if (restoreTimes.length > 0) {
                    restoreTimes.sort((a, b) => a - b);
                    const mid = Math.floor(restoreTimes.length / 2);
                    mttr = restoreTimes.length % 2 === 0
                        ? parseFloat(((restoreTimes[mid - 1] + restoreTimes[mid]) / 2).toFixed(1))
                        : parseFloat(restoreTimes[mid].toFixed(1));
                }
            }

            const levels = {
                df:   doraLevel('df', df),
                lt:   doraLevel('lt', lt),
                cfr:  doraLevel('cfr', cfr),
                mttr: doraLevel('mttr', mttr)
            };
            const globalLevel = WORST_LEVEL([levels.df, levels.lt, levels.cfr, levels.mttr]) || 'Low';
            const eliteCount = Object.values(levels).filter(l => l === 'Elite').length;
            const validCount = Object.values(levels).filter(l => l).length;

            return { df, lt, cfr, mttr, levels, globalLevel, eliteCount, validCount, cfrInsufficient, mttrInsufficient };
        }

        // ───── Calcul Deploys/jour + trend (carte 2) ───────────────────────
        async function computeDeploys(repo, pipelines) {
            const branch = repo.default_branch || 'main';
            const now = Date.now();
            const since30 = now - 30 * 86400000;
            const since60 = now - 60 * 86400000;

            const onMain = (pipelines || []).filter(p =>
                p.ref === branch && p.status === 'success');

            const current = onMain.filter(p => new Date(p.created_at).getTime() >= since30);
            const previous = onMain.filter(p => {
                const t = new Date(p.created_at).getTime();
                return t >= since60 && t < since30;
            });

            const currentPerDay = current.length / 30;
            const previousPerDay = previous.length / 30;
            const delta = previousPerDay > 0
                ? ((currentPerDay - previousPerDay) / previousPerDay) * 100
                : null;

            return { currentPerDay, previousPerDay, delta };
        }

        // ───── Calcul Maturité (carte 3 — data only synthèse) ──────────────
        async function computeMaturity(repo, pipelines, mrs, branches, ciFile, protectedBranches, projectDetails, tagsCount, approvals) {
            // 7 axes data ramenés à un score 0-100 chacun, puis converti en /8 (sécurité comprise)
            const branch = repo.default_branch || 'main';
            // Scoring CONTINU : interpole linéairement entre les paliers au lieu de
            // claquer 30/60/100. Mêmes ancres (excellent→100, ok→60, plancher→30) donc
            // les seuils de badges/achievements qui lisent score8 restent valides ;
            // on remplit juste le continuum pour discriminer deux repos proches.
            const lerp = (x, x0, x1, y0, y1) => y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
            const score = (v, thresholds) => {
                // thresholds = [excellent, ok] — "plus grand = mieux"
                if (v == null) return null;
                const [exc, ok] = thresholds;
                if (v >= exc) return 100;                       // au-delà d'excellent → plafonne à 100
                if (v >= ok)  return lerp(v, ok, exc, 60, 100); // entre ok et excellent → 60..100
                if (v >= 0)   return lerp(v, 0, ok, 30, 60);    // entre 0 et ok → 30..60
                return 30;
            };
            const scoreInv = (v, thresholds) => {
                // thresholds = [excellent, ok] — "plus petit = mieux"
                if (v == null) return null;
                const [exc, ok] = thresholds;
                if (v <= exc) return 100;                        // sous excellent → 100
                if (v <= ok)  return lerp(v, exc, ok, 100, 60);  // entre excellent et ok → 100..60
                // au-delà de ok : on descend de 60 vers 30, plancher atteint à 3× le seuil ok
                const floorAt = ok * 3;
                if (v < floorAt) return lerp(v, ok, floorAt, 60, 30);
                return 30;
            };
            const avg = arr => {
                const v = arr.filter(x => x != null);
                return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length;
            };

            const since30 = Date.now() - 30 * 86400000;
            const mainPipes = (pipelines || []).filter(p =>
                p.ref === branch && new Date(p.created_at).getTime() >= since30);
            const successCount = mainPipes.filter(p => p.status === 'success').length;
            const successRate = mainPipes.length > 0
                ? (successCount / mainPipes.length) * 100 : null;

            // Axe Delivery (D)
            const dfPerDay = successCount / 30;
            const axeDelivery = avg([
                score(dfPerDay, [1, 0.14]),                     // D01 deploys/jour
                score(successRate, [90, 70]),                    // D02 pipeline ok
                score(tagsCount, [5, 1])                         // D04 releases tagées
            ]);

            // Axe Qualité (Q) — basé sur MRs récentes (mergées sur 30j)
            const recentMerged = (mrs || []).filter(mr =>
                mr.state === 'merged' && mr.merged_at &&
                new Date(mr.merged_at).getTime() >= since30);
            const reviewTimes = recentMerged.map(mr =>
                (new Date(mr.merged_at) - new Date(mr.created_at)) / 86400000);
            const avgReview = reviewTimes.length > 0
                ? reviewTimes.reduce((a, b) => a + b, 0) / reviewTimes.length : null;
            const axeQuality = avg([
                scoreInv(avgReview, [2, 7])                      // Q01 review time
            ]);

            // Axe Stabilité (S)
            const failed = mainPipes.filter(p => p.status === 'failed').length;
            const failRate = mainPipes.length > 0 ? (failed / mainPipes.length) * 100 : null;
            const axeStability = avg([
                scoreInv(failRate, [5, 15])                      // S01 fail rate
            ]);

            // Axe Hygiène (H)
            const allBranches = branches || [];
            const staleBranches = allBranches.filter(b => {
                if (b.name === branch) return false;
                if (!b.commit || !b.commit.committed_date) return false;
                return (Date.now() - new Date(b.commit.committed_date)) / 86400000 > 30;
            }).length;
            const mergedBranches = allBranches.filter(b => b.merged === true && b.name !== branch).length;
            const axeHygiene = avg([
                scoreInv(staleBranches, [5, 20]),                // H01 stale branches
                ciFile ? 100 : 30                                 // H04/P05 CI file
            ]);

            // Axe Résilience (R) — capacité à se remettre d'un échec.
            // Signal honnête depuis les pipelines : après un 'failed', le pipeline
            // suivant (chronologique) repasse-t-il en 'success' ? Un repo résilient
            // ne reste pas cassé longtemps. On regarde la séquence sur main.
            let axeResilience = null;
            if (mainPipes.length >= 4) {
                // tri chronologique ascendant
                const seq = [...mainPipes]
                    .filter(p => p.created_at)
                    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                let failures = 0, recovered = 0;
                for (let i = 0; i < seq.length - 1; i++) {
                    if (seq[i].status === 'failed') {
                        failures++;
                        // cherche le prochain pipeline conclusif
                        for (let j = i + 1; j < seq.length; j++) {
                            if (seq[j].status === 'success') { recovered++; break; }
                            if (seq[j].status === 'failed') break; // reste cassé
                        }
                    }
                }
                if (failures > 0) {
                    const recoveryRate = (recovered / failures) * 100;  // % d'échecs suivis d'une reprise
                    axeResilience = avg([
                        score(recoveryRate, [90, 50])                 // R01 taux de récupération
                    ]);
                } else {
                    // aucun échec sur la période → résilience non éprouvée mais saine
                    axeResilience = avg([score(100, [90, 50])]);
                }
            }

            // Axe Pratiques (P)
            const axePractices = avg([
                ciFile ? 100 : 30                                 // P05
            ]);

            // Axe Culture (C) — pratiques de collaboration, mesurées via les MRs mergées.
            // Deux signaux honnêtes côté GitLab :
            //  1. Ratio de MRs reviewées (≥1 approbation OU discussions) avant merge
            //     → une culture saine ne merge pas à l'aveugle.
            //  2. Diversité des auteurs de MR (anti-silo, lié au bus factor).
            let axeCulture = null;
            if (recentMerged.length >= 3) {
                // 1. Review ratio : approbations ou commentaires (selon ce que l'API expose)
                const reviewed = recentMerged.filter(mr =>
                    (mr.upvotes && mr.upvotes > 0) ||
                    (mr.user_notes_count && mr.user_notes_count > 0)
                ).length;
                const reviewRatio = (reviewed / recentMerged.length) * 100;

                // 2. Diversité des auteurs de MR
                const authors = new Set(
                    recentMerged.map(mr => mr.author && mr.author.id).filter(Boolean)
                );
                const authorCount = authors.size;

                axeCulture = avg([
                    score(reviewRatio, [80, 40]),                    // C01 MRs reviewées
                    score(authorCount, [4, 1])                       // C02 diversité auteurs
                ]);
            }

            // Axe Sécurité (X) — booléens stricts (absent = non crédité)
            const pb = protectedBranches || [];
            const defProtected = pb.find(p => p.name === branch);
            const sec1 = defProtected ? 100 : 30;
            const sec2 = defProtected && defProtected.allow_force_push === false ? 100 : 30;
            // Réglages d'approbation : priorité à l'endpoint dédié /approvals (ap),
            // fallback sur /projects/:id (pd) au cas où, strict sinon (non vérifiable = 30).
            const ap = approvals || {};
            const pd = projectDetails || {};
            const pick = (k) => (ap[k] !== undefined ? ap[k] : pd[k]); // /approvals prioritaire
            const sec3 = pick('merge_requests_author_approval') === false ? 100 : 30;
            const sec4 = pick('merge_requests_disable_committers_approval') === true ? 100 : 30;
            const sec5 = pick('reset_approvals_on_push') === true ? 100 : 30;
            const axeSecurity = avg([sec1, sec2, sec3, sec4, sec5]);

            // Récap par axe (8 axes)
            const axes = {
                'Delivery':    axeDelivery,
                'Qualité':     axeQuality,
                'Stabilité':   axeStability,
                'Hygiène':     axeHygiene,
                'Résilience':  axeResilience,
                'Pratiques':   axePractices,
                'Culture':     axeCulture,
                'Sécurité':    axeSecurity
            };

            // Score global : moyenne des axes non-null, ramenée sur 8
            const validAxes = Object.entries(axes).filter(([_, v]) => v != null);
            if (validAxes.length === 0) {
                return { score8: null, axes, weakest: null, staleBranches, mergedBranches };
            }
            const meanScore = validAxes.reduce((s, [_, v]) => s + v, 0) / validAxes.length;
            const score8 = (meanScore / 100) * 8;

            // Axe le plus faible
            const sorted = [...validAxes].sort((a, b) => a[1] - b[1]);
            const weakest = sorted[0][0];

            return { score8, axes, weakest, staleBranches, mergedBranches };
        }

        // ───── Calcul Bus Factor (carte 4) ─────────────────────────────────
        // Bus factor = nb de personnes nécessaires pour couvrir 80% des commits récents
        function busFactorFromCommits(commits) {
            if (!commits || commits.length === 0) return null;
            const byAuthor = {};
            commits.forEach(c => {
                const a = c.author_email || c.author_name || 'unknown';
                byAuthor[a] = (byAuthor[a] || 0) + 1;
            });
            const sorted = Object.values(byAuthor).sort((a, b) => b - a);
            const total = commits.length;
            const threshold = total * 0.8;
            let acc = 0, count = 0;
            for (const n of sorted) {
                acc += n;
                count++;
                if (acc >= threshold) {
                    // Bus factor "fin" : on retire la fraction qui dépasse
                    const overshoot = (acc - threshold) / n;
                    return Math.max(1, count - overshoot);
                }
            }
            return count;
        }

        async function computeBusFactor(repo) {
            const branch = repo.default_branch || 'main';
            // 200 derniers commits actuels + 200 précédents pour la tendance
            const [recent, older] = await Promise.all([
                gl(`/projects/${repo.id}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=100&page=1`),
                gl(`/projects/${repo.id}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=100&page=2`)
            ]);
            const allRecent = [...(recent || []), ...(older || [])];
            if (allRecent.length === 0) return { bf: null, delta: null };

            const half = Math.floor(allRecent.length / 2);
            const bfRecent = busFactorFromCommits(allRecent.slice(0, Math.max(half, 50)));
            const bfPrev = allRecent.length > 100
                ? busFactorFromCommits(allRecent.slice(half))
                : null;

            const delta = (bfPrev != null && bfPrev > 0)
                ? ((bfRecent - bfPrev) / bfPrev) * 100
                : null;

            return { bf: bfRecent, delta };
        }

        // ───── Orchestration : load tout en parallèle ──────────────────────
        async function computeSynthesis(repo) {
            const branch = repo.default_branch || 'main';
            const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
            const since60 = new Date(Date.now() - 60 * 86400000).toISOString();

            // Fetches en parallèle
            const [pipelines, mrs, branches, ciFile, protectedBranches, projectDetails, tagsCount, busFactor, approvals] = await Promise.all([
                gl(`/projects/${repo.id}/pipelines?per_page=100&updated_after=${since60}`),
                gl(`/projects/${repo.id}/merge_requests?state=merged&per_page=100&updated_after=${since30}`),
                gl(`/projects/${repo.id}/repository/branches?per_page=100`),
                fetchGitLab(`/projects/${repo.id}/repository/files/.gitlab-ci.yml?ref=${encodeURIComponent(branch)}`)
                    .then(r => r.ok).catch(() => false),
                gl(`/projects/${repo.id}/protected_branches`),
                gl(`/projects/${repo.id}`),
                gl(`/projects/${repo.id}/repository/tags?per_page=20`).then(t => Array.isArray(t) ? t.length : 0).catch(() => 0),
                computeBusFactor(repo),
                // Réglages d'approbation MR : endpoint dédié (souvent absents de /projects/:id).
                // gl() renvoie null si 403/404 → traité strictement (non crédité) côté maturité.
                gl(`/projects/${repo.id}/approvals`)
            ]);

            // Calculs en parallèle (lightweight)
            const dora = await computeDORA(repo, pipelines, mrs);
            const deploys = await computeDeploys(repo, pipelines);
            const maturity = await computeMaturity(repo, pipelines, mrs, branches, ciFile, protectedBranches, projectDetails, tagsCount, approvals);

            return { dora, deploys, maturity, busFactor, tags: tagsCount };
        }

        // ───── Rendu final ─────────────────────────────────────────────────
        function renderSynthesis(syn) {
            // Carte 1 : DORA
            if (syn.dora && syn.dora.globalLevel) {
                setCard('Dora',
                    syn.dora.globalLevel,
                    `<span class="up">▲</span> ${syn.dora.eliteCount}/${syn.dora.validCount} en Elite`);
            } else {
                setCardError('Dora', 'Pas assez de données');
            }

            // Carte 2 : Deploys
            if (syn.deploys && syn.deploys.currentPerDay != null) {
                const v = syn.deploys.currentPerDay;
                const valFmt = v >= 10 ? v.toFixed(0) : v.toFixed(1);
                const delta = syn.deploys.delta;
                let meta = '';
                if (delta == null) {
                    meta = '<span class="neutral">·</span> Pas de comparaison';
                } else {
                    meta = `${trendArrow(delta)} ${fmtDelta(delta)} vs 30j précédents`;
                }
                setCard('Deploy', valFmt, meta);
            } else {
                setCardError('Deploy', 'Pas de pipelines');
            }

            // Carte 3 : Maturité
            if (syn.maturity && syn.maturity.score8 != null) {
                const s = syn.maturity.score8;
                setCard('Matu',
                    `${s.toFixed(1)}<span class="syn-value-suffix">/8</span>`,
                    syn.maturity.weakest
                        ? `${syn.maturity.weakest} = axe faible`
                        : '');
            } else {
                setCardError('Matu', 'Données insuffisantes');
            }

            // Carte 4 : Bus Factor
            if (syn.busFactor && syn.busFactor.bf != null) {
                const bf = syn.busFactor.bf;
                const bfFmt = bf.toFixed(1);
                let metaText, metaCls;
                if (bf < 1.5) {
                    metaText = 'Risque concentration';
                    metaCls = 'down';
                } else if (bf < 2.5) {
                    metaText = 'À surveiller';
                    metaCls = 'warn';
                } else {
                    metaText = 'Bonne distribution';
                    metaCls = 'up';
                }
                setCard('Bus', bfFmt,
                    `<span class="${metaCls}">${metaCls === 'up' ? '▲' : metaCls === 'down' ? '▼' : '·'}</span> ${metaText}`);
            } else {
                setCardError('Bus', 'Pas de commits');
            }

            // Animation d'arrivée : les valeurs numériques grimpent depuis 0.
            // Non-intrusif : relit ce que les cartes viennent de poser, n'anime
            // que le numérique (DORA = "Elite" texte → laissé tel quel).
            animateSynValues();

            // État de tendance par carte (signaux discrets, signifiants).
            applyCardTrends(syn);
        }

        // ───── État de tendance par carte ──────────────────────────────────
        // good = au top / en hausse · warn = dégradé / en baisse · neutral = stable
        function setCardTrend(key, state) {
            const card = document.getElementById(`syn${key}Card`);
            if (!card) return;
            card.classList.remove('syn-good', 'syn-warn');
            if (state === 'good') card.classList.add('syn-good');
            else if (state === 'warn') card.classList.add('syn-warn');
        }
        function applyCardTrends(syn) {
            // DORA : proportion Elite. Tout Elite → good ; un niveau bas → warn.
            if (syn.dora && syn.dora.globalLevel) {
                if (syn.dora.globalLevel === 'Elite') setCardTrend('Dora', 'good');
                else if (syn.dora.globalLevel === 'Low') setCardTrend('Dora', 'warn');
                else setCardTrend('Dora', 'neutral');
            } else setCardTrend('Dora', 'neutral');

            // Deploys : delta vs 30j précédents.
            if (syn.deploys && syn.deploys.delta != null) {
                if (syn.deploys.delta > 10) setCardTrend('Deploy', 'good');
                else if (syn.deploys.delta < -10) setCardTrend('Deploy', 'warn');
                else setCardTrend('Deploy', 'neutral');
            } else setCardTrend('Deploy', 'neutral');

            // Maturité : score8 comparé à l'historique 7j si dispo, sinon niveau absolu.
            if (syn.maturity && syn.maturity.score8 != null) {
                const s = syn.maturity.score8;
                let state = 'neutral';
                try {
                    const hist = (typeof currentRepo !== 'undefined' && currentRepo)
                        ? readSynHistory(currentRepo.id) : null;
                    const prev = hist ? findEntryNearDaysAgo(hist, 7) : null;
                    const sPrev = prev && prev.syn.maturity ? prev.syn.maturity.score8 : null;
                    if (sPrev != null && s - sPrev >= 0.3) state = 'good';
                    else if (sPrev != null && s - sPrev <= -0.3) state = 'warn';
                    else if (s >= 6.5) state = 'good';      // fort dans l'absolu
                    else if (s < 4) state = 'warn';         // faible dans l'absolu
                } catch {
                    if (s >= 6.5) state = 'good'; else if (s < 4) state = 'warn';
                }
                setCardTrend('Matu', state);
            } else setCardTrend('Matu', 'neutral');

            // Bus factor : delta + niveau absolu (concentration = risque).
            if (syn.busFactor && syn.busFactor.bf != null) {
                const bf = syn.busFactor.bf;
                if (bf < 1.5) setCardTrend('Bus', 'warn');        // concentration critique
                else if (bf >= 2.5) setCardTrend('Bus', 'good');  // bien réparti
                else setCardTrend('Bus', 'neutral');
            } else setCardTrend('Bus', 'neutral');
        }

        // ───── Animation des compteurs à l'arrivée ─────────────────────────
        // Helper réutilisable : anime un élément DOM dont le contenu commence
        // par un nombre (gère décimales + suffixe HTML type "/8").
        function animateCountEl(el, dur = 750) {
            if (!el) return;
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            const html = el.innerHTML;
            const m = html.match(/^(\d+(?:[.,]\d+)?)(.*)$/s);
            if (!m) return;                       // pas numérique → on saute
            const target = parseFloat(m[1].replace(',', '.'));
            const suffix = m[2] || '';
            const dec = ((m[1].split(/[.,]/)[1]) || '').length;
            const t0 = performance.now();
            function step(t) {
                const k = Math.min((t - t0) / dur, 1);
                const eased = 1 - Math.pow(1 - k, 3);
                el.innerHTML = (target * eased).toFixed(dec) + suffix;
                if (k < 1) requestAnimationFrame(step);
                else el.innerHTML = target.toFixed(dec) + suffix;
            }
            requestAnimationFrame(step);
        }

        let _synAnimDone = false;
        function animateSynValues() {
            ['Deploy', 'Matu', 'Bus'].forEach(key => {
                animateCountEl(document.getElementById(`syn${key}Value`));
            });
        }

        // ───── Hook : appelé à chaque changement de repo ───────────────────
        let synthesisAbortToken = 0; // pour ignorer les résultats obsolètes
        async function onRepoChange() {
            if (!currentRepo) return;
            const myToken = ++synthesisAbortToken;

            // Affiche cache si dispo (instant)
            const cached = readSynCache(currentRepo.id);
            const cachedHistory = readSynHistory(currentRepo.id);
            if (cached) {
                renderSynthesis(cached);
                renderSuggestions(pickSuggestions(cached, cachedHistory));
            } else {
                setSkeleton();
                setSuggestionsSkeleton();
            }

            // Calcule fresh en background
            try {
                const syn = await computeSynthesis(currentRepo);
                if (myToken !== synthesisAbortToken) return; // user a changé de repo entre-temps
                writeSynCache(currentRepo.id, syn);
                pushSynHistory(currentRepo.id, syn);
                renderSynthesis(syn);
                renderSuggestions(pickSuggestions(syn, readSynHistory(currentRepo.id)));
            } catch (e) {
                console.error('Synthesis compute failed:', e);
                if (myToken !== synthesisAbortToken) return;
                ['Dora', 'Deploy', 'Matu', 'Bus'].forEach(k => setCardError(k));
                renderSuggestions([]);
            }
        }

        function setSuggestionsSkeleton() {
            const container = document.getElementById('suggestionsContainer');
            container.innerHTML = `
                <div class="sugg-card sugg-skeleton"><div class="sugg-skel-tag"></div><div class="sugg-skel-text"></div><div class="sugg-skel-text"></div><div class="sugg-skel-cta"></div></div>
                <div class="sugg-card sugg-skeleton"><div class="sugg-skel-tag"></div><div class="sugg-skel-text"></div><div class="sugg-skel-text"></div><div class="sugg-skel-cta"></div></div>
                <div class="sugg-card sugg-skeleton"><div class="sugg-skel-tag"></div><div class="sugg-skel-text"></div><div class="sugg-skel-text"></div><div class="sugg-skel-cta"></div></div>
            `;
        }

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  SUGGESTIONS DU JOUR — moteur de règles + historique             ║
        // ╚══════════════════════════════════════════════════════════════════╝

        const SYN_HISTORY_PREFIX = 'hub_syn_hist_';
        const SYN_HISTORY_MAX = 30;

        // ───── Historique des évaluations ──────────────────────────────────
        function readSynHistory(repoId) {
            try {
                const raw = localStorage.getItem(SYN_HISTORY_PREFIX + repoId);
                return raw ? JSON.parse(raw) : [];
            } catch { return []; }
        }
        function pushSynHistory(repoId, syn) {
            try {
                const hist = readSynHistory(repoId);
                hist.push({ ts: Date.now(), syn });
                const trimmed = hist.slice(-SYN_HISTORY_MAX);
                localStorage.setItem(SYN_HISTORY_PREFIX + repoId, JSON.stringify(trimmed));
            } catch (e) { console.warn('History write failed:', e); }
        }
        function findEntryNearDaysAgo(history, daysAgo) {
            if (!history || history.length === 0) return null;
            const target = Date.now() - daysAgo * 86400000;
            let closest = null;
            let closestDiff = Infinity;
            for (const e of history) {
                const diff = Math.abs(e.ts - target);
                if (diff < closestDiff) {
                    closestDiff = diff;
                    closest = e;
                }
            }
            return closestDiff < 3 * 86400000 ? closest : null;
        }

        // ───── Moteur de règles ────────────────────────────────────────────
        const SUGGESTION_RULES = [
            // ════════ MESURER ════════
            {
                id: 'dora_degraded',
                evaluate(syn, history) {
                    if (!syn.dora || !syn.dora.globalLevel) return null;
                    const prev = findEntryNearDaysAgo(history, 7);
                    if (!prev || !prev.syn.dora) return null;
                    const prevRank = LEVEL_RANK[prev.syn.dora.globalLevel];
                    const curRank = LEVEL_RANK[syn.dora.globalLevel];
                    if (prevRank > curRank) {
                        return {
                            tag: 'measure', tagLabel: 'Mesurer', direction: 'measure',
                            text: `Ton DORA est passé de <strong>${prev.syn.dora.globalLevel}</strong> à <strong>${syn.dora.globalLevel}</strong> cette semaine. Voir où ça coince.`,
                            cta: 'Voir mes métriques',
                            severity: 9
                        };
                    }
                    return null;
                }
            },
            {
                id: 'cfr_drift',
                evaluate(syn, history) {
                    if (!syn.dora || syn.dora.cfr == null) return null;
                    const prev = findEntryNearDaysAgo(history, 7);
                    if (!prev || !prev.syn.dora || prev.syn.dora.cfr == null) return null;
                    const delta = syn.dora.cfr - prev.syn.dora.cfr;
                    if (delta > 3) {
                        return {
                            tag: 'measure', tagLabel: 'Mesurer', direction: 'measure',
                            text: `Ton CFR a légèrement bougé (<strong>+${delta.toFixed(1)}%</strong>). Identifier la cause des échecs récents.`,
                            cta: 'Voir les pipelines',
                            severity: 6
                        };
                    }
                    return null;
                }
            },

            // ════════ SÉCURITÉ (via INSPECTER) ════════
            {
                id: 'maturity_security_low',
                evaluate(syn) {
                    if (!syn.maturity || !syn.maturity.axes) return null;
                    const sec = syn.maturity.axes['Sécurité'];
                    if (sec == null || sec >= 60) return null;
                    const score = syn.maturity.score8 != null ? syn.maturity.score8.toFixed(1) : '?';
                    return {
                        tag: 'inspect', tagLabel: 'Sécurité', direction: 'inspect',
                        text: `Ta squad est à <strong>${score}/8</strong> sur l'axe Sécurité. ${sec < 40 ? '5' : '3'} défis disponibles cette semaine pour progresser.`,
                        cta: 'Voir les défis',
                        severity: sec < 40 ? 10 : 7
                    };
                }
            },

            // ════════ BUS FACTOR ════════
            {
                id: 'bus_factor_critical',
                evaluate(syn) {
                    if (!syn.busFactor || syn.busFactor.bf == null) return null;
                    if (syn.busFactor.bf >= 1.5) return null;
                    return {
                        tag: 'collab', tagLabel: 'Bus Factor', direction: 'collab',
                        text: `Un seul contributeur principal couvre l'essentiel du code. <strong>Risque de concentration critique</strong>. Pair programming recommandée.`,
                        cta: 'Identifier les zones à risque',
                        severity: 10
                    };
                }
            },
            {
                id: 'bus_factor_watch',
                evaluate(syn) {
                    if (!syn.busFactor || syn.busFactor.bf == null) return null;
                    if (syn.busFactor.bf < 1.5 || syn.busFactor.bf >= 2.5) return null;
                    return {
                        tag: 'collab', tagLabel: 'Bus Factor', direction: 'collab',
                        text: `Bus factor à <strong>${syn.busFactor.bf.toFixed(1)}</strong>. Quelques modules sont à risque de concentration. À surveiller.`,
                        cta: 'Identifier les zones à risque',
                        severity: 5
                    };
                }
            },

            // ════════ LIVRER ════════
            {
                id: 'no_deploys',
                evaluate(syn) {
                    if (!syn.deploys || syn.deploys.currentPerDay == null) return null;
                    if (syn.deploys.currentPerDay >= 0.1) return null;
                    return {
                        tag: 'deliver', tagLabel: 'Livrer', direction: 'deliver',
                        text: `Peu de déploiements sur les 30 derniers jours (<strong>${(syn.deploys.currentPerDay * 30).toFixed(0)}</strong> au total). Le pipeline est-il bien actif ?`,
                        cta: 'Voir le pipeline',
                        severity: 7
                    };
                }
            },
            {
                id: 'deploys_dropping',
                evaluate(syn) {
                    if (!syn.deploys || syn.deploys.delta == null) return null;
                    if (syn.deploys.delta >= -20) return null;
                    return {
                        tag: 'deliver', tagLabel: 'Livrer', direction: 'deliver',
                        text: `Ta vélocité a chuté de <strong>${Math.abs(syn.deploys.delta).toFixed(0)}%</strong> vs les 30j précédents. Quelque chose freine.`,
                        cta: 'Analyser le pipeline',
                        severity: 8
                    };
                }
            },
            {
                id: 'deploys_accelerating',
                evaluate(syn) {
                    if (!syn.deploys || syn.deploys.delta == null) return null;
                    if (syn.deploys.delta < 30) return null;
                    return {
                        tag: 'deliver', tagLabel: 'Livrer', direction: 'deliver',
                        text: `Ta vélocité a augmenté de <strong>+${syn.deploys.delta.toFixed(0)}%</strong>. Bonne dynamique — pense à tagger les releases.`,
                        cta: 'Voir les releases',
                        severity: 4
                    };
                }
            },

            // ════════ STABILITÉ / INSPECTER ════════
            {
                id: 'fail_rate_high',
                evaluate(syn) {
                    if (!syn.dora || syn.dora.cfr == null) return null;
                    if (syn.dora.cfr < 15) return null;
                    return {
                        tag: 'inspect', tagLabel: 'Stabilité', direction: 'inspect',
                        text: `Taux d'échec pipeline à <strong>${syn.dora.cfr.toFixed(1)}%</strong>. C'est élevé. Identifier les causes récurrentes.`,
                        cta: 'Audit du pipeline',
                        severity: 8
                    };
                }
            },
            {
                id: 'mttr_high',
                evaluate(syn) {
                    if (!syn.dora || syn.dora.mttr == null) return null;
                    if (syn.dora.mttr < 24) return null;
                    const hours = syn.dora.mttr;
                    const fmt = hours > 48 ? `${(hours / 24).toFixed(1)}j` : `${hours.toFixed(0)}h`;
                    return {
                        tag: 'inspect', tagLabel: 'Stabilité', direction: 'inspect',
                        text: `MTTR à <strong>${fmt}</strong>. Quand un pipeline casse, il met du temps à revenir au vert.`,
                        cta: 'Voir les pipelines',
                        severity: 6
                    };
                }
            },

            // ════════ COLLABORER ════════
            {
                id: 'lead_time_high',
                evaluate(syn) {
                    if (!syn.dora || syn.dora.lt == null) return null;
                    if (syn.dora.lt < 168) return null;
                    const days = (syn.dora.lt / 24).toFixed(1);
                    return {
                        tag: 'collab', tagLabel: 'Collaborer', direction: 'collab',
                        text: `Tes MRs traînent en moyenne <strong>${days}j</strong> avant merge. La review est-elle un goulot ?`,
                        cta: 'Analyser les MRs',
                        severity: 7
                    };
                }
            },

            // ════════ INSPECTER & SÉCURISER ════════
            {
                // Note sécu qui RÉGRESSE depuis 7j (tendance — la plus prioritaire)
                id: 'security_score_dropping',
                evaluate(syn, history) {
                    if (!syn.maturity || !syn.maturity.axes) return null;
                    const cur = syn.maturity.axes['Sécurité'];
                    if (cur == null) return null;
                    const prev = findEntryNearDaysAgo(history, 7);
                    if (!prev || !prev.syn.maturity || !prev.syn.maturity.axes) return null;
                    const old = prev.syn.maturity.axes['Sécurité'];
                    if (old == null) return null;
                    const delta = old - cur;
                    if (delta < 8) return null; // baisse significative seulement
                    return {
                        tag: 'inspect', tagLabel: 'Sécurité', direction: 'inspect',
                        text: `Ta conformité sécurité a chuté de <strong>${Math.round(old)}</strong> à <strong>${Math.round(cur)}</strong> cette semaine. Quelque chose s'est dégradé.`,
                        cta: 'Lancer le scan CIS',
                        severity: 10
                    };
                }
            },
            {
                // Branches obsolètes qui s'accumulent
                id: 'stale_branches_piling',
                evaluate(syn) {
                    if (!syn.maturity || syn.maturity.staleBranches == null) return null;
                    const stale = syn.maturity.staleBranches;
                    if (stale < 10) return null;
                    const merged = syn.maturity.mergedBranches || 0;
                    return {
                        tag: 'inspect', tagLabel: 'Inspecter', direction: 'inspect',
                        text: `<strong>${stale}</strong> branches obsolètes s'accumulent${merged > 0 ? ` (dont ${merged} déjà mergées)` : ''}. Un nettoyage s'impose.`,
                        cta: 'Nettoyer les branches',
                        severity: stale >= 20 ? 6 : 4
                    };
                }
            },
            {
                // Branches obsolètes en forte hausse depuis 7j (tendance)
                id: 'stale_branches_growing',
                evaluate(syn, history) {
                    if (!syn.maturity || syn.maturity.staleBranches == null) return null;
                    const cur = syn.maturity.staleBranches;
                    const prev = findEntryNearDaysAgo(history, 7);
                    if (!prev || !prev.syn.maturity || prev.syn.maturity.staleBranches == null) return null;
                    const delta = cur - prev.syn.maturity.staleBranches;
                    if (delta < 5) return null;
                    return {
                        tag: 'inspect', tagLabel: 'Inspecter', direction: 'inspect',
                        text: `<strong>+${delta}</strong> branches obsolètes cette semaine. Le rythme de nettoyage ne suit pas.`,
                        cta: 'Voir les branches',
                        severity: 5
                    };
                }
            },

            // ════════ LIVRER & DÉPLOYER ════════
            {
                // Pas de fichier CI détecté (axe maturité ou absence de déploiements structurés)
                id: 'no_ci_pipeline',
                evaluate(syn) {
                    if (!syn.maturity || !syn.maturity.axes) return null;
                    // L'axe Hygiène inclut la présence du .gitlab-ci.yml ; proxy raisonnable
                    const hyg = syn.maturity.axes['Hygiène'];
                    if (hyg == null || hyg >= 60) return null;
                    return {
                        tag: 'deliver', tagLabel: 'Livrer', direction: 'deliver',
                        text: `Ton pipeline CI/CD semble incomplet. Un pipeline standardisé fiabilise tes déploiements.`,
                        cta: 'Générer le pipeline',
                        severity: 5
                    };
                }
            },

            // ════════ COLLABORER & AMÉLIORER ════════
            {
                // L'axe le plus faible touche la collaboration → pousser une rétro
                id: 'weakest_is_collab',
                evaluate(syn) {
                    if (!syn.maturity || !syn.maturity.weakest) return null;
                    const w = syn.maturity.weakest;
                    // Axes liés aux pratiques d'équipe / collaboration
                    if (!['Pratiques', 'Culture'].includes(w)) return null;
                    return {
                        tag: 'collab', tagLabel: 'Collaborer', direction: 'collab',
                        text: `Ton axe le plus faible est <strong>${w}</strong>. Une rétro basée sur tes données GitLab peut révéler les points de friction.`,
                        cta: 'Lancer une rétro',
                        severity: 4
                    };
                }
            },
            {
                // Culture basse : MRs mergées sans review (merge à l'aveugle)
                id: 'culture_low_review',
                evaluate(syn) {
                    if (!syn.maturity || !syn.maturity.axes) return null;
                    const c = syn.maturity.axes['Culture'];
                    if (c == null || c >= 55) return null;
                    return {
                        tag: 'collab', tagLabel: 'Collaborer', direction: 'collab',
                        text: `Beaucoup de MRs sont mergées sans review visible. Une review assistée renforce la qualité et le partage de connaissance.`,
                        cta: 'Ouvrir MR Reviewer',
                        severity: 6
                    };
                }
            },
            {
                // Résilience faible : les pipelines restent cassés longtemps
                id: 'resilience_low',
                evaluate(syn) {
                    if (!syn.maturity || !syn.maturity.axes) return null;
                    const r = syn.maturity.axes['Résilience'];
                    if (r == null || r >= 55) return null;
                    return {
                        tag: 'inspect', tagLabel: 'Résilience', direction: 'inspect',
                        text: `Tes pipelines mettent du temps à se rétablir après un échec. Analyser les causes récurrentes des échecs.`,
                        cta: 'Voir les pipelines',
                        severity: 7
                    };
                }
            },

            // ════════ FALLBACKS (cas tout va bien) ════════
            {
                id: 'all_elite',
                evaluate(syn) {
                    if (!syn.dora || syn.dora.eliteCount !== 4) return null;
                    return {
                        tag: 'measure', tagLabel: 'Mesurer', direction: 'measure',
                        text: `Tes 4 indicateurs DORA sont en <strong>Elite</strong>. Tu fais partie du top mondial. Comparer avec d'autres squads ?`,
                        cta: 'Voir le benchmark',
                        severity: 2
                    };
                }
            },
            {
                id: 'maturity_strong',
                evaluate(syn) {
                    if (!syn.maturity || syn.maturity.score8 == null) return null;
                    if (syn.maturity.score8 < 6) return null;
                    return {
                        tag: 'measure', tagLabel: 'Mesurer', direction: 'measure',
                        text: `Maturité à <strong>${syn.maturity.score8.toFixed(1)}/8</strong>. Très bon niveau. Voir l'évolution sur 3 mois ?`,
                        cta: 'Voir la progression',
                        severity: 2
                    };
                }
            },
            {
                id: 'good_distribution',
                evaluate(syn) {
                    if (!syn.busFactor || syn.busFactor.bf == null) return null;
                    if (syn.busFactor.bf < 3) return null;
                    return {
                        tag: 'collab', tagLabel: 'Bus Factor', direction: 'collab',
                        text: `Bus factor à <strong>${syn.busFactor.bf.toFixed(1)}</strong>. La connaissance est bien répartie. Continuer comme ça.`,
                        cta: 'Voir la distribution',
                        severity: 2
                    };
                }
            },
            {
                id: 'all_good',
                evaluate(syn) {
                    if (!syn.dora || !syn.dora.globalLevel) return null;
                    if (LEVEL_RANK[syn.dora.globalLevel] < 3) return null;
                    return {
                        tag: 'measure', tagLabel: 'Mesurer', direction: 'measure',
                        text: `Aucune alerte sur ce repo. Bon moment pour préparer la prochaine release ou un atelier rétro.`,
                        cta: 'Voir mes métriques',
                        severity: 1
                    };
                }
            }
        ];

        // ───── Sélection top 3 avec diversité forcée ───────────────────────
        // ───── Humeur ambiante de l'accueil ────────────────────────────────
        // Mappe la sévérité max des suggestions sur l'ambiance du fond.
        // Valeurs d'alpha calibrées dans la démo (validées).
        function setHubMood(maxSeverity) {
            const root = document.documentElement;
            let m1, m2, m3, m4;
            if (maxSeverity >= 8) {
                // Tendu : une alerte grave (sécu qui chute, déploiements en chute, bus factor critique…)
                m1 = 'rgba(251,146,60,.46)'; m2 = 'rgba(248,113,113,.36)';
                m3 = 'rgba(251,191,36,.22)'; m4 = 'rgba(251,146,60,.20)';
            } else if (maxSeverity >= 1) {
                // Neutre : des choses à regarder, rien d'alarmant
                m1 = 'rgba(124,92,255,.42)'; m2 = 'rgba(45,212,191,.28)';
                m3 = 'rgba(251,146,60,.14)'; m4 = 'rgba(244,114,182,.22)';
            } else {
                // Serein : que du positif (Elite, maturité forte…)
                m1 = 'rgba(52,211,153,.50)'; m2 = 'rgba(45,212,191,.40)';
                m3 = 'rgba(124,92,255,.18)'; m4 = 'rgba(52,211,153,.18)';
            }
            root.style.setProperty('--mood-1', m1);
            root.style.setProperty('--mood-2', m2);
            root.style.setProperty('--mood-3', m3);
            root.style.setProperty('--mood-4', m4);
        }

        // ───── Humeur ambiante d'un chemin ──────────────────────────────────
        // Combine la TEINTE du chemin (identité couleur) avec l'INTENSITÉ selon
        // la sévérité max des règles DE CE chemin. Un chemin au calme = teinte
        // douce ; un chemin en alerte = même teinte mais plus saturée/chaude.
        const PATH_RGB = {
            measure: '124,92,255',
            deliver: '45,212,191',
            inspect: '251,146,60',
            collab:  '244,114,182'
        };
        function pathMaxSeverity(tag, syn, history) {
            if (!syn) return 0;
            let max = 0;
            for (const rule of SUGGESTION_RULES) {
                const s = rule.evaluate(syn, history);
                if (s && s.tag === tag && s.severity > max) max = s.severity;
            }
            return max;
        }
        function setPathMood(tag, syn, history) {
            const root = document.documentElement;
            const rgb = PATH_RGB[tag];
            if (!rgb) return;
            const sev = pathMaxSeverity(tag, syn, history);
            // L'intensité de la teinte du chemin monte avec la sévérité.
            // calm: teinte douce ; alerte: teinte forte + nappe chaude d'alerte.
            let aMain, alert;
            if (sev >= 8)      { aMain = .40; alert = 'rgba(248,113,113,.22)'; }   // alerte forte
            else if (sev >= 1) { aMain = .30; alert = `rgba(${rgb},.14)`; }        // à surveiller
            else               { aMain = .22; alert = `rgba(${rgb},.10)`; }        // calme

            root.style.setProperty('--mood-1', `rgba(${rgb},${aMain})`);
            root.style.setProperty('--mood-2', `rgba(${rgb},${(aMain*0.7).toFixed(2)})`);
            root.style.setProperty('--mood-3', alert);
            root.style.setProperty('--mood-4', `rgba(${rgb},${(aMain*0.5).toFixed(2)})`);
        }

        // Restaure l'humeur globale de l'accueil (sévérité max toutes règles confondues)
        function restoreHomeMood() {
            try {
                if (typeof currentRepo !== 'undefined' && currentRepo) {
                    const syn = readSynCache(currentRepo.id);
                    const history = readSynHistory(currentRepo.id);
                    if (syn) {
                        const all = SUGGESTION_RULES.map(r => r.evaluate(syn, history)).filter(Boolean);
                        const max = all.length ? Math.max(...all.map(s => s.severity)) : 0;
                        setHubMood(max);
                        return;
                    }
                }
            } catch {}
            setHubMood(1); // défaut neutre
        }

        function pickSuggestions(syn, history) {
            const all = SUGGESTION_RULES
                .map(rule => rule.evaluate(syn, history))
                .filter(s => s != null)
                .sort((a, b) => b.severity - a.severity);

            // Humeur de l'accueil pilotée par la sévérité max réelle des alertes.
            // (les règles positives ont une sévérité basse → serein ; une alerte
            //  grave → tendu). Reflet visuel direct de l'état des repos.
            const maxSeverity = all.length ? all[0].severity : 0;
            setHubMood(maxSeverity);

            // Diversité : max 2 du même tag
            const picked = [];
            const tagCount = {};
            for (const s of all) {
                tagCount[s.tag] = tagCount[s.tag] || 0;
                if (tagCount[s.tag] >= 2) continue;
                picked.push(s);
                tagCount[s.tag]++;
                if (picked.length === 3) break;
            }

            // Fallback générique si moins de 3
            if (picked.length < 3) {
                const generic = [
                    { tag: 'measure', tagLabel: 'Mesurer', direction: 'measure', text: 'Lance une évaluation de maturité DevOps pour cartographier les 8 axes de ta squad.', cta: 'Faire l\'évaluation', severity: 0 },
                    { tag: 'deliver', tagLabel: 'Livrer', direction: 'deliver', text: 'Génère ton pipeline GitLab CI en quelques clics, prêt pour la production.', cta: 'Pipeline Generator', severity: 0 },
                    { tag: 'collab', tagLabel: 'Collaborer', direction: 'collab', text: 'Lance une rétro automatique pour ton dernier sprint, basée sur tes données GitLab.', cta: 'Démarrer la rétro', severity: 0 }
                ];
                for (const g of generic) {
                    if (picked.length >= 3) break;
                    if ((tagCount[g.tag] || 0) >= 2) continue;
                    if (picked.some(p => p.tag === g.tag && p.text === g.text)) continue;
                    picked.push(g);
                    tagCount[g.tag] = (tagCount[g.tag] || 0) + 1;
                }
            }

            return picked.slice(0, 3);
        }

        // ───── Rendu ───────────────────────────────────────────────────────
        function renderSuggestions(suggestions) {
            const container = document.getElementById('suggestionsContainer');
            if (!suggestions || suggestions.length === 0) {
                container.innerHTML = '<div class="sugg-card" style="grid-column: 1/-1;"><div class="sugg-text">Aucune suggestion disponible.</div></div>';
                return;
            }
            container.innerHTML = suggestions.map(s => `
                <div class="sugg-card" data-loaded="true" data-direction="${escapeHtml(s.direction)}">
                    <span class="sugg-tag ${escapeHtml(s.tag)}">${escapeHtml(s.tagLabel)}</span>
                    <div class="sugg-text">${s.text}</div>
                    <div class="sugg-cta">${escapeHtml(s.cta)} <span class="arrow">→</span></div>
                </div>
            `).join('');
        }

        // Click delegation sur le container
        document.getElementById('suggestionsContainer').addEventListener('click', e => {
            const card = e.target.closest('.sugg-card[data-direction]');
            if (!card) return;
            const dir = card.dataset.direction;
            if (dir) openDrilldown(dir);
        });

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  POUR ALLER PLUS LOIN — pool d'entrées par chemin + sélection    ║
        // ╚══════════════════════════════════════════════════════════════════╝
        //
        // Chaque entrée :
        //   { id, text, workshop?, context? }
        //   - workshop : id de l'atelier vers lequel pointer (mapping vers les 205 actions)
        //   - context : fonction (syn) → boolean. Si true, entrée marquée "Pour toi" + remontée
        //
        // Affichage : max 5 entrées par défaut (contextuelles en haut), le reste via "Voir plus"

        const DEEPER_POOL = {
            measure: [
                { id: 'sec_challenges',
                  text: 'Tu es faible sur l\'axe Sécurité ? Voir 3 défis hebdomadaires',
                  workshop: 'X01-N1-challenges-securite',
                  context: (s) => s && s.maturity && s.maturity.axes && s.maturity.axes['Sécurité'] != null && s.maturity.axes['Sécurité'] < 60 },
                { id: 'pair_plan',
                  text: 'Mettre en place un plan de pair programming pour ton équipe',
                  workshop: 'R02-N1-pair-programming',
                  context: (s) => s && s.busFactor && s.busFactor.bf != null && s.busFactor.bf < 2 },
                { id: 'okr_devops',
                  text: 'Définir tes OKR DevOps pour le trimestre' },
                { id: 'cross_squad',
                  text: 'Comparer ta progression avec d\'autres squads similaires' },
                { id: 'medium_to_elite',
                  text: 'REX : passer de Medium à Elite en 6 mois' },
                { id: 'drift_alerts',
                  text: 'Configurer les alertes de drift sur tes métriques' },
                { id: 'radar_reading',
                  text: 'Comment lire ton radar de maturité (8 axes)' },
                { id: 'history_3m',
                  text: 'Voir l\'historique de ta progression sur 3 mois' }
            ],
            deliver: [
                { id: 'pipeline_audit',
                  text: 'Audit anatomie de ton pipeline (durées par stage)',
                  workshop: 'D05-N1-anatomie-pipeline',
                  context: (s) => s && s.dora && s.dora.lt != null && s.dora.lt > 168 }, // proxy : si lead time > 7j
                { id: 'first_release',
                  text: 'Ta première release tagée (semver de zéro)',
                  workshop: 'D04-N1-premiere-release',
                  context: (s) => s && s.tags != null && s.tags < 1 },
                { id: 'flags_cleanup',
                  text: 'Cleanup des feature flags abandonnés (procédure complète)',
                  workshop: 'P02-N1-cleanup-flags' },
                { id: 'canary_rollout',
                  text: 'Activer le rollout progressif (canary) sur tes feature flags',
                  workshop: 'P01-N3-canary' },
                { id: 'pipeline_templates',
                  text: 'Templates de pipelines pour stacks Java / Node / Python / Go',
                  workshop: 'D02-N1-templates-stacks' },
                { id: 'blue_green',
                  text: 'Stratégie blue-green vs canary : quand utiliser quoi ?',
                  workshop: 'D03-N3-blue-green-vs-canary' },
                { id: 'semver',
                  text: 'Bonnes pratiques de versioning sémantique',
                  workshop: 'D04-N2-semver' },
                { id: 'conventional_commits',
                  text: 'Conventional Commits : standardiser tes messages',
                  workshop: 'D04-N2-conventional-commits' }
            ],
            inspect: [
                { id: 'security_grade',
                  text: 'Comprendre ta note sécurité : les 13 checks détaillés',
                  workshop: 'X01-N1-grade-securite',
                  context: (s) => s && s.maturity && s.maturity.axes && s.maturity.axes['Sécurité'] != null && s.maturity.axes['Sécurité'] < 70 },
                { id: 'branch_retention',
                  text: 'Politique de rétention des branches conseillée',
                  workshop: 'H01-N2-politique-branches' },
                { id: 'mr_review_relaunch',
                  text: 'Relancer une review sur tes MRs anciennes',
                  workshop: 'H05-N1-relance-review' },
                { id: 'secrets_cleanup',
                  text: 'Détecter et nettoyer les secrets commités (rewriting history)',
                  workshop: 'X-N2-secrets-cleanup' },
                { id: 'repo_diet',
                  text: 'Réduire le poids d\'un repo de 30% en 1 commit',
                  workshop: 'H-N3-repo-diet' },
                { id: 'branch_mr_workflow',
                  text: 'Workflow Branche + MR : jamais de push direct sur main',
                  workshop: 'D03-N1-workflow-branche-mr' },
                { id: 'dep_audit',
                  text: 'Audit régulier des dépendances : process et outils' },
                { id: 'cis_benchmark',
                  text: 'Le CIS Benchmark GitLab expliqué (122 contrôles)' }
            ],
            collab: [
                { id: 'three_amigos',
                  text: 'Three Amigos : template de cadrage de story',
                  workshop: 'C03-N2-three-amigos',
                  context: (s) => s && s.dora && s.dora.lt != null && s.dora.lt > 168 },
                { id: 'pair_plan_collab',
                  text: 'Plan de pair programming hebdo pour ton équipe',
                  workshop: 'R02-N1-pair-programming',
                  context: (s) => s && s.busFactor && s.busFactor.bf != null && s.busFactor.bf < 2 },
                { id: 'round_robin_review',
                  text: 'Mettre en place le round-robin pour les reviewers',
                  workshop: 'Q03-N2-round-robin',
                  context: (s) => s && s.dora && s.dora.lt != null && s.dora.lt > 72 },
                { id: 'auto_retro',
                  text: 'Comment passer de la rétro classique à la rétro auto-générée',
                  workshop: 'C07-N2-auto-retro' },
                { id: 'mob_programming',
                  text: 'Mob programming hebdo : organisation et bénéfices',
                  workshop: 'C04-N2-mob-programming' },
                { id: 'review_checklist',
                  text: 'Checklist de code review : ce qu\'il faut systématiquement regarder',
                  workshop: 'Q01-N2-review-checklist' },
                { id: 'remote_pair',
                  text: 'Pair programming en remote : outils et bonnes pratiques' },
                { id: 'smart_estimate_eval',
                  text: 'Mesurer l\'efficacité réelle d\'un système d\'estimation IA sur 6 mois' }
            ]
        };

        const DEEPER_VISIBLE_MAX = 5;

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  ATELIERS RECOMMANDÉS — pilotés par les axes faibles + référentiel║
        // ╚══════════════════════════════════════════════════════════════════╝
        // Les 8 axes de la synthèse (par nom) correspondent au préfixe des
        // codes du référentiel : Culture→C, Delivery→D, etc. Le score de l'axe
        // donne le niveau. On surface les vrais ateliers (avec lien Confluence)
        // des axes les plus faibles de la squad.
        const WS_AXIS_PREFIX = {
            'Culture': 'C', 'Delivery': 'D', 'Hygiène': 'H', 'Pratiques': 'P',
            'Qualité': 'Q', 'Résilience': 'R', 'Stabilité': 'S', 'Sécurité': 'X'
        };
        // Chaque chemin ne recommande que les ateliers de SES axes (sinon les 4
        // chemins affichent les mêmes). Les 8 axes répartis 2 par chemin.
        const WS_PATH_AXES = {
            measure: ['Stabilité', 'Résilience'],
            deliver: ['Delivery', 'Pratiques'],
            inspect: ['Hygiène', 'Sécurité'],
            collab:  ['Culture', 'Qualité']
        };
        const WS_RECO_MAX = 6;

        function wsLevelFromScore(score) {
            return score < 33 ? 1 : score < 66 ? 2 : 3;
        }

        function recommendedWorkshops(syn, pathKey) {
            const W = window.Salsifi && window.Salsifi.workshops;
            if (!W || !syn || !syn.maturity || !syn.maturity.axes) return [];
            const allowed = (pathKey && WS_PATH_AXES[pathKey]) ? new Set(WS_PATH_AXES[pathKey]) : null;
            const axes = Object.entries(syn.maturity.axes)
                .filter(([name, v]) => v != null && (!allowed || allowed.has(name)))
                .sort((a, b) => a[1] - b[1]);   // du plus faible au plus fort
            const recos = [];
            for (const [name, score] of axes) {
                if (score >= 66) break;          // on ne recommande que les axes non "Formalisé"
                const prefix = WS_AXIS_PREFIX[name];
                if (!prefix) continue;
                const level = String(wsLevelFromScore(score));
                Object.keys(W.byAxis).filter(c => c[0] === prefix).forEach(code => {
                    (W.byAxis[code][level] || []).forEach(num => {
                        const a = W.actions[num];
                        if (a) recos.push({ ...a, axeName: name });
                    });
                });
                if (recos.length >= WS_RECO_MAX * 2) break;
            }
            // liens d'abord (pages écrites), puis cap
            recos.sort((a, b) => (b.lien ? 1 : 0) - (a.lien ? 1 : 0));
            return recos.slice(0, WS_RECO_MAX);
        }

        // ───── État courant du deeper pour gérer "Voir plus" ───────────────
        let currentDeeperEntries = [];   // toutes les entrées triées
        let currentDeeperExpanded = false;

        // « Pour aller plus loin » = ateliers réels du référentiel (cliquables,
        // pilotés par les axes faibles) + conseils génériques du chemin (non
        // cliquables, pas encore d'atelier dédié). Plus de toast « à venir ».
        function renderDeeperSection(key) {
            const syn = currentRepo ? readSynCache(currentRepo.id) : null;

            const ateliers = recommendedWorkshops(syn, key).map(w => ({
                kind: 'atelier',
                text: w.action || w.titre || '',
                axeName: w.axeName,
                lien: w.lien || null
            }));

            const conseils = (DEEPER_POOL[key] || [])
                .filter(e => !e.workshop)   // on garde les pistes génériques (sans atelier)
                .map(e => ({ kind: 'conseil', text: e.text }));

            currentDeeperEntries = [...ateliers, ...conseils];
            currentDeeperExpanded = false;

            paintDeeperList();

            const moreWrap = document.getElementById('dd-deeper-more');
            const moreBtn = document.getElementById('dd-deeper-more-btn');
            if (currentDeeperEntries.length > DEEPER_VISIBLE_MAX) {
                moreWrap.style.display = '';
                moreBtn.textContent = `Voir plus de pistes (${currentDeeperEntries.length - DEEPER_VISIBLE_MAX})`;
            } else {
                moreWrap.style.display = 'none';
            }
        }

        function paintDeeperList() {
            const list = document.getElementById('dd-deeper');
            const esc = window.escapeHtml || (s => s);
            const visible = currentDeeperExpanded
                ? currentDeeperEntries
                : currentDeeperEntries.slice(0, DEEPER_VISIBLE_MAX);

            list.innerHTML = visible.map(e => {
                if (e.kind === 'atelier') {
                    const badge = `<span class="dd-deeper-badge">${esc(e.axeName)}</span>`;
                    if (e.lien) {
                        return `<li class="dd-atelier">`
                            + `<a href="${esc(e.lien)}" target="_blank" rel="noopener" class="dd-deeper-text" style="text-decoration:none;color:inherit;">${esc(e.text)}</a>`
                            + `${badge}<span class="arrow">↗</span></li>`;
                    }
                    return `<li class="dd-atelier is-soon">`
                        + `<span class="dd-deeper-text" style="opacity:0.55;">${esc(e.text)}</span>`
                        + `${badge}<span class="dd-deeper-badge" style="opacity:0.6;">bientôt</span></li>`;
                }
                // Conseil générique : non cliquable
                return `<li class="dd-conseil" style="cursor:default;"><span class="dd-deeper-text">${esc(e.text)}</span></li>`;
            }).join('');
        }

        // Toggle "Voir plus" / "Voir moins"
        document.getElementById('dd-deeper-more-btn').addEventListener('click', () => {
            currentDeeperExpanded = !currentDeeperExpanded;
            paintDeeperList();
            const moreBtn = document.getElementById('dd-deeper-more-btn');
            moreBtn.textContent = currentDeeperExpanded
                ? 'Voir moins'
                : `Voir plus de pistes (${currentDeeperEntries.length - DEEPER_VISIBLE_MAX})`;
        });

        // ───── Toast simple ────────────────────────────────────────────────
        function showHubToast(html, type = 'info', duration = 3500) {
            let host = document.getElementById('hubToastHost');
            if (!host) {
                host = document.createElement('div');
                host.id = 'hubToastHost';
                host.style.cssText = `
                    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
                    z-index: 10000; display: flex; flex-direction: column; gap: 8px;
                    pointer-events: none;
                `;
                document.body.appendChild(host);
            }
            const t = document.createElement('div');
            t.style.cssText = `
                background: rgba(26, 18, 48, 0.95);
                border: 1px solid var(--border-strong);
                color: var(--text-primary);
                padding: 12px 22px;
                border-radius: 999px;
                font-family: var(--font-body);
                font-size: 14px;
                backdrop-filter: blur(20px);
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
                pointer-events: auto;
                opacity: 0;
                transform: translateY(20px);
                transition: opacity 0.25s, transform 0.25s;
            `;
            t.innerHTML = html;
            host.appendChild(t);
            requestAnimationFrame(() => {
                t.style.opacity = '1';
                t.style.transform = 'translateY(0)';
            });
            setTimeout(() => {
                t.style.opacity = '0';
                t.style.transform = 'translateY(20px)';
                setTimeout(() => t.remove(), 300);
            }, duration);
        }

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  DRILLDOWN STATS — calculs par chemin                            ║
        // ╚══════════════════════════════════════════════════════════════════╝

        const DD_CACHE_PREFIX = 'hub_dd_';
        const DD_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

        function readDrilldownCache(repoId, key) {
            try {
                const raw = localStorage.getItem(`${DD_CACHE_PREFIX}${repoId}_${key}`);
                if (!raw) return null;
                const data = JSON.parse(raw);
                if (Date.now() - data.ts > DD_CACHE_TTL_MS) return null;
                return data.values;
            } catch { return null; }
        }
        function writeDrilldownCache(repoId, key, values) {
            try {
                localStorage.setItem(`${DD_CACHE_PREFIX}${repoId}_${key}`,
                    JSON.stringify({ ts: Date.now(), values }));
            } catch (e) { console.warn('DD cache write failed:', e); }
        }

        // ───── BADGES ──────────────────────────────────────────────────────
        const HUB_BADGES = [
            { id: 'fast_pipeline',   icon: '⚡', name: 'Fast Pipeline',        xp: 100, condition: (s) => s.dora && (s.dora.levels.df === 'Elite' || s.dora.levels.df === 'High') },
            { id: 'stable_build',    icon: '✅', name: 'Stable Build',         xp: 150, condition: (s) => s.dora && s.dora.cfr != null && s.dora.cfr <= 10 },
            { id: 'frequent_deploy', icon: '📦', name: 'Frequent Deploy',      xp: 100, condition: (s) => s.deploys && s.deploys.currentPerDay >= 0.7 }, // ~5/sem
            { id: 'dora_elite',      icon: '🚀', name: 'DORA Elite',           xp: 250, condition: (s) => s.dora && s.dora.eliteCount === 4 },
            { id: 'branch_guardian', icon: '🛡️', name: 'Branch Guardian',     xp: 100, condition: (s) => s.maturity && s.maturity.axes && s.maturity.axes['Sécurité'] >= 60 },
            { id: 'fast_review',     icon: '👀', name: 'Fast Review',          xp: 100, condition: (s) => s.dora && s.dora.lt != null && s.dora.lt < 48 }, // < 2j
            { id: 'high_maturity',   icon: '🎯', name: 'High Maturity',        xp: 200, condition: (s) => s.maturity && s.maturity.score8 != null && s.maturity.score8 >= 6 },
            { id: 'good_distribution', icon: '🤝', name: 'Good Distribution', xp: 150, condition: (s) => s.busFactor && s.busFactor.bf != null && s.busFactor.bf >= 3 },
            { id: 'versioning',      icon: '🏷️', name: 'Semantic Versioning', xp: 75,  condition: (s) => s.tags && s.tags >= 5 },
            { id: 'mttr_low',        icon: '⏱️', name: 'Quick Recovery',     xp: 100, condition: (s) => s.dora && s.dora.mttr != null && s.dora.mttr < 24 }
        ];

        function evaluateBadges(syn) {
            return HUB_BADGES.filter(b => {
                try { return b.condition(syn); } catch { return false; }
            });
        }

        function xpFromBadges(badges) {
            return badges.reduce((sum, b) => sum + b.xp, 0);
        }

        // ───── Helpers de format ───────────────────────────────────────────
        function fmtMB(bytes) {
            if (bytes == null) return null;
            const mb = bytes / (1024 * 1024);
            if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
            if (mb < 1000) return `${mb.toFixed(0)} MB`;
            return `${(mb / 1024).toFixed(1)} GB`;
        }
        function fmtHours(h) {
            if (h == null) return null;
            if (h < 1) return `${(h * 60).toFixed(0)} min`;
            if (h < 24) return `${h.toFixed(1)} h`;
            return `${(h / 24).toFixed(1)} j`;
        }
        function gradeFromScore(score) {
            // 0-100 → A+ … F
            if (score == null) return null;
            if (score >= 95) return 'A+';
            if (score >= 85) return 'A';
            if (score >= 75) return 'B+';
            if (score >= 65) return 'B';
            if (score >= 55) return 'C+';
            if (score >= 45) return 'C';
            if (score >= 35) return 'D';
            return 'F';
        }

        // ───── Compute par chemin ──────────────────────────────────────────
        async function computeDrilldownStats(key, repo) {
            // On part de la synthesis bar déjà calculée si dispo
            const syn = readSynCache(repo.id);

            switch (key) {
                case 'measure':  return computeStats_measure(repo, syn);
                case 'deliver':  return computeStats_deliver(repo, syn);
                case 'inspect':  return computeStats_inspect(repo, syn);
                case 'collab':   return computeStats_collab(repo, syn);
                default: return {};
            }
        }

        // ───── MESURER ─────────────────────────────────────────────────────
        async function computeStats_measure(repo, syn) {
            if (!syn) syn = await computeSynthesis(repo);
            const history = readSynHistory(repo.id);
            const badges = evaluateBadges(syn);
            const xp = xpFromBadges(badges);

            // DORA
            let doraStat = null;
            if (syn.dora && syn.dora.globalLevel) {
                const eliteCount = syn.dora.eliteCount;
                const validCount = syn.dora.validCount;
                const meta = syn.dora.globalLevel === 'Elite'
                    ? `${eliteCount}/${validCount} — top 1% mondial`
                    : `${eliteCount}/${validCount} en Elite`;
                doraStat = { value: syn.dora.globalLevel, meta };
            }

            // Maturité globale + tendance trimestre
            let matuStat = null;
            if (syn.maturity && syn.maturity.score8 != null) {
                const cur = syn.maturity.score8;
                const valHtml = `${cur.toFixed(1)}<span class="suffix">/8</span>`;
                const prev = findEntryNearDaysAgo(history, 90);
                let meta;
                if (prev && prev.syn.maturity && prev.syn.maturity.score8 != null) {
                    const delta = cur - prev.syn.maturity.score8;
                    const arrow = delta > 0.1 ? '<span class="up">▲</span>' : delta < -0.1 ? '<span class="down">▼</span>' : '<span class="neutral">·</span>';
                    const sign = delta > 0 ? '+' : '';
                    meta = `${arrow} ${sign}${delta.toFixed(1)} vs trimestre dernier`;
                } else {
                    meta = `<span class="neutral">·</span> Historique en construction`;
                }
                matuStat = { value: valHtml, meta };
            }

            // XP / badges
            const xpStat = {
                value: String(xp),
                meta: `${badges.length} badge${badges.length > 1 ? 's' : ''} débloqué${badges.length > 1 ? 's' : ''}`
            };

            // Bus factor
            let bfStat = null;
            if (syn.busFactor && syn.busFactor.bf != null) {
                const bf = syn.busFactor.bf;
                let meta;
                if (bf < 1.5) meta = '<span class="down">▼</span> Risque concentration';
                else if (bf < 2.5) meta = '<span class="warn">·</span> À surveiller';
                else meta = '<span class="up">▲</span> Bonne distribution';
                bfStat = { value: bf.toFixed(1), meta };
            }

            return { dora: doraStat, maturity: matuStat, xp: xpStat, busFactor: bfStat };
        }

        // ───── LIVRER ──────────────────────────────────────────────────────
        async function computeStats_deliver(repo, syn) {
            if (!syn) syn = await computeSynthesis(repo);
            const branch = repo.default_branch || 'main';
            const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

            // Feature flags : endpoint dédié GitLab (peut renvoyer 404 si non activé)
            const [mrsOpen, featureFlags, latestPipeline] = await Promise.all([
                gl(`/projects/${repo.id}/merge_requests?state=opened&per_page=100&order_by=created_at`),
                gl(`/projects/${repo.id}/feature_flags`),
                gl(`/projects/${repo.id}/pipelines?ref=${encodeURIComponent(branch)}&per_page=1`)
            ]);

            // Deploys (30j) — depuis syn
            let deploysStat = null;
            if (syn.deploys && syn.deploys.currentPerDay != null) {
                const total = Math.round(syn.deploys.currentPerDay * 30);
                const perDay = syn.deploys.currentPerDay;
                deploysStat = {
                    value: String(total),
                    meta: `~${perDay >= 10 ? perDay.toFixed(0) : perDay.toFixed(1)}/jour en moyenne`
                };
            }

            // Feature flags
            let ffStat = null;
            if (Array.isArray(featureFlags)) {
                const active = featureFlags.filter(f => f.active === true || f.active === undefined).length;
                const oldFlags = featureFlags.filter(f => {
                    if (!f.created_at) return false;
                    const age = (Date.now() - new Date(f.created_at)) / 86400000;
                    return age > 60;
                }).length;
                ffStat = {
                    value: String(active),
                    meta: oldFlags > 0
                        ? `<span class="warn">▲</span> ${oldFlags} flag${oldFlags > 1 ? 's' : ''} > 60 jours`
                        : '<span class="up">✓</span> Tous récents'
                };
            } else {
                // Feature flags pas activés sur GitLab CE/instance
                ffStat = { value: '—', meta: '<span class="neutral">·</span> Non disponible' };
            }

            // MRs en attente
            let mrStat = null;
            if (Array.isArray(mrsOpen)) {
                const count = mrsOpen.length;
                if (count === 0) {
                    mrStat = { value: '0', meta: '<span class="up">✓</span> Aucune MR en attente' };
                } else {
                    const oldest = mrsOpen.reduce((max, m) =>
                        new Date(m.created_at) < new Date(max.created_at) ? m : max, mrsOpen[0]);
                    const ageMs = Date.now() - new Date(oldest.created_at);
                    const ageH = ageMs / 3600000;
                    const ageFmt = ageH < 1 ? `${Math.round(ageH * 60)} min`
                        : ageH < 24 ? `${Math.round(ageH)}h`
                        : `${Math.round(ageH / 24)}j`;
                    mrStat = {
                        value: String(count),
                        meta: `Plus vieille : ${ageFmt}`
                    };
                }
            }

            // Pipeline status
            let pipeStat = null;
            if (Array.isArray(latestPipeline) && latestPipeline.length > 0) {
                const last = latestPipeline[0];
                const status = last.status;
                let valHtml, meta;
                if (status === 'success') {
                    valHtml = '<span class="up">✓ Vert</span>';
                    meta = `Dernier pipeline sur <strong>${branch}</strong>`;
                } else if (status === 'failed') {
                    valHtml = '<span class="down">✗ Rouge</span>';
                    meta = `<span class="down">▼</span> Pipeline en échec`;
                } else if (status === 'running' || status === 'pending') {
                    valHtml = '<span class="warn">⏳ En cours</span>';
                    meta = `Pipeline en exécution`;
                } else {
                    valHtml = status;
                    meta = `Statut : ${status}`;
                }
                pipeStat = { value: valHtml, meta };
            }

            return { deploys30: deploysStat, featureFlags: ffStat, mrsOpen: mrStat, pipelineStatus: pipeStat };
        }

        // ───── INSPECTER ───────────────────────────────────────────────────
        async function computeStats_inspect(repo, syn) {
            if (!syn) syn = await computeSynthesis(repo);

            // Pour la taille du repo et les MRs ouvertes
            const [projectFull, mrsOpen] = await Promise.all([
                gl(`/projects/${repo.id}?statistics=true`),
                gl(`/projects/${repo.id}/merge_requests?state=opened&per_page=100`)
            ]);

            // Note sécurité — depuis l'axe Sécurité de syn.maturity
            let secStat = null;
            if (syn.maturity && syn.maturity.axes && syn.maturity.axes['Sécurité'] != null) {
                const secScore = syn.maturity.axes['Sécurité'];
                const grade = gradeFromScore(secScore);
                const isGood = secScore >= 70;
                secStat = {
                    value: grade,
                    meta: isGood
                        ? '<span class="up">✓</span> Bonne hygiène sécurité'
                        : `<span class="warn">⚠</span> ${secScore < 50 ? 'À renforcer' : 'Marges de progrès'}`
                };
            }

            // Poids du repo
            let sizeStat = null;
            if (projectFull && projectFull.statistics) {
                const bytes = projectFull.statistics.repository_size || 0;
                const lfs = projectFull.statistics.lfs_objects_size || 0;
                const total = bytes + lfs;
                const mb = total / (1024 * 1024);
                const meta = mb > 500
                    ? `<span class="warn">▲</span> Diet conseillé`
                    : mb > 100
                    ? `<span class="neutral">·</span> Acceptable`
                    : `<span class="up">✓</span> Léger`;
                sizeStat = { value: fmtMB(total), meta };
            }

            // Branches obsolètes — réutilise le calcul de syn.maturity (source unique,
            // évite un 2e fetch de /repository/branches et toute divergence de seuil).
            let stStat = null;
            if (syn.maturity && syn.maturity.staleBranches != null) {
                const stale = syn.maturity.staleBranches;
                const merged = syn.maturity.mergedBranches || 0;
                stStat = {
                    value: String(stale),
                    meta: stale === 0
                        ? '<span class="up">✓</span> Repo propre'
                        : merged > 0
                        ? `${merged} déjà mergée${merged > 1 ? 's' : ''} à nettoyer`
                        : 'Cleanup recommandé'
                };
            }

            // MRs zombies — ouvertes ET inactives depuis > 7j (updated_at, pas created_at :
            // une vieille MR activement mise à jour n'est pas un zombie).
            let zombieStat = null;
            if (Array.isArray(mrsOpen)) {
                const zombies = mrsOpen.filter(mr => {
                    const ref = mr.updated_at || mr.created_at;
                    const age = (Date.now() - new Date(ref)) / 86400000;
                    return age > 7;
                }).length;
                zombieStat = {
                    value: String(zombies),
                    meta: zombies === 0
                        ? '<span class="up">✓</span> Aucune MR en sommeil'
                        : `Sur ${mrsOpen.length} MR${mrsOpen.length > 1 ? 's' : ''} ouverte${mrsOpen.length > 1 ? 's' : ''}`
                };
            }

            return { securityScore: secStat, repoSize: sizeStat, staleBranches: stStat, zombieMRs: zombieStat };
        }

        // ───── COLLABORER ──────────────────────────────────────────────────
        async function computeStats_collab(repo, syn) {
            if (!syn) syn = await computeSynthesis(repo);
            const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
            const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

            // Fetches dédiés
            const [mrsMerged7, contributors] = await Promise.all([
                gl(`/projects/${repo.id}/merge_requests?state=merged&per_page=100&updated_after=${since7}`),
                gl(`/projects/${repo.id}/repository/contributors`)
            ]);

            // MRs mergées cette semaine
            let mrWeekStat = null;
            if (Array.isArray(mrsMerged7)) {
                const count = mrsMerged7.length;
                let meta;
                if (count === 0) {
                    meta = '<span class="neutral">·</span> Aucune mergée cette semaine';
                } else {
                    // Lead time moyen depuis syn.dora
                    const lt = syn.dora && syn.dora.lt;
                    meta = lt != null
                        ? `Lead time moyen : ${fmtHours(lt)}`
                        : `Sur les 7 derniers jours`;
                }
                mrWeekStat = { value: String(count), meta };
            }

            // Reviewers actifs (uniques sur les MRs mergées 30j)
            let reviewersStat = null;
            const mrs30 = await gl(`/projects/${repo.id}/merge_requests?state=merged&per_page=100&updated_after=${since30}`);
            if (Array.isArray(mrs30)) {
                const reviewersSet = new Set();
                mrs30.forEach(mr => {
                    if (mr.reviewers && Array.isArray(mr.reviewers)) {
                        mr.reviewers.forEach(r => reviewersSet.add(r.id));
                    }
                    if (mr.assignees && Array.isArray(mr.assignees)) {
                        mr.assignees.forEach(a => reviewersSet.add(a.id));
                    }
                });
                const count = reviewersSet.size;
                reviewersStat = {
                    value: String(count),
                    meta: count === 0 ? '<span class="neutral">·</span> Pas de reviewers détectés' :
                          count >= 3 ? '<span class="up">✓</span> Bonne diversité' :
                          '<span class="warn">·</span> Diversité limitée'
                };
            }

            // Contributeurs actifs (commits sur 30j)
            let contribStat = null;
            if (Array.isArray(contributors)) {
                // GitLab renvoie les contributeurs all-time, on filtre approximativement par commits récents
                const sorted = contributors.sort((a, b) => b.commits - a.commits);
                const totalActive = sorted.filter(c => c.commits >= 3).length;
                const total = sorted.length;
                contribStat = {
                    value: total > 0 ? `${totalActive}/${total}` : '—',
                    meta: total === 0 ? '<span class="warn">·</span> Aucun commit récent' :
                          totalActive === total ? '<span class="up">✓</span> Tous actifs' :
                          `${total - totalActive} peu actifs`
                };
            }

            // Lead time MR (déjà calculé dans syn.dora)
            let leadStat = null;
            if (syn.dora && syn.dora.lt != null) {
                const lt = syn.dora.lt;
                let meta;
                if (lt < 24) meta = '<span class="up">▲</span> Très rapide';
                else if (lt < 72) meta = '<span class="up">·</span> Sous 3 jours';
                else if (lt < 168) meta = '<span class="warn">·</span> Sous 7 jours';
                else meta = '<span class="down">▼</span> Au-delà d\'une semaine';
                leadStat = { value: fmtHours(lt), meta };
            }

            return { mrsMergedWeek: mrWeekStat, reviewersActive: reviewersStat, contributorsActive: contribStat, leadTimeMR: leadStat };
        }

        // ═══════════════════════════════════════════════════════════════
        // AJOUT WORKSPACE — strictement additif, fonctions préfixées ws*
        // Lit localStorage.devops_hub_workspaces en lecture seule pour le
        // dropdown / la vue. N'écrit QU'À l'import explicite, sans toucher
        // à .token, .gitlabUrl, .username — only à .workspaces.
        // ═══════════════════════════════════════════════════════════════

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

        function wsOpenModule(kind) {
            if (!_wsState.currentId) return;
            const data = _wsState.data || _wsReadStorage();
            const ws = data && data.workspaces.find(w => w.id === _wsState.currentId);
            if (!ws) return;
            // Pattern existant : on passe le workspace courant via sessionStorage
            sessionStorage.setItem('current_workspace', JSON.stringify(ws));
            if (kind === 'dora')        window.location.href = 'dora-workspace.html';
            else if (kind === 'gouvernance') window.location.href = 'gouvernance-repo.html';
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
            else if (kind === 'gouvernance') window.location.href = 'gouvernance-repo.html';
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

        // ───── Bootstrap ───────────────────────────────────────────────────
        (function init() {
            auth = loadAuth();
            if (!auth) {
                redirectToLogin();
                return;
            }
            renderUserInfo();
            wireRepoPicker();
            loadRepos();
        })();
