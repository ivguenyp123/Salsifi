/* repo-diet · data.js — I/O (auth, fetch). */

        async function fetchGitLab(endpoint, init = {}) {
            return window.Salsifi.gitlabFetch(GITLAB_URL, token, endpoint, init);
        }


        function loadAuth() {
            return window.Salsifi.loadAuth({ redirect: false });
        }


        async function fetchAllFiles() {
            const items = await window.Salsifi.gitlabPaginate(GITLAB_URL, token,
                `/projects/${projectId}/repository/tree?recursive=true`, { maxPages: 20 });
            allFiles = items.map(f => ({ name: f.name, path: f.path, type: f.type }));
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

