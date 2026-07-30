/* repo-diet · index.js — entrée & câblage (chargé en dernier). */

        const STORAGE_KEY = 'devops_hub_workspaces';

        const HUB_URL = 'hub.html'; // mockup V2 = hub ; seul endroit à changer


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
