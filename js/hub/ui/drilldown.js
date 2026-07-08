// [hub] Extrait de hub.js — ui/drilldown.js (portée globale, script classique)
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
