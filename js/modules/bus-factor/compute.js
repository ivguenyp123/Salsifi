/* bus-factor · compute.js — logique pure (calculs, helpers). */

        function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }

        // ══════════════════════════════════════════════════════════════════
        //  INITIALISATION
        // ══════════════════════════════════════════════════════════════════


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
