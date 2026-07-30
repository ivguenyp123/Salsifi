/* bus-factor · render.js — rendu DOM. */

        function runWithConcurrency(tasks, limit) { return window.Salsifi.runWithConcurrency(tasks, limit); }

        // escapeHtml unifié et défini en tête de fichier (avant : défini au milieu,
        // utilisé inégalement — renderBranchesGrid OK, mais renderRiskZones et
        // renderRecommendations injectaient sans échapper).

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

