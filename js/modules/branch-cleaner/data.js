/* branch-cleaner · data.js — I/O (auth, fetch). */

        async function fetchGitLab(endpoint, init = {}) {
            return window.Salsifi.gitlabFetch(GITLAB_URL, token, endpoint, init);
        }

        // Pagination automatique avec garde-fou 50 pages (5000 résultats max).
        // Avant : `while (hasMore)` sans cap → boucle infinie possible si
        // l'API renvoyait une réponse bizarre.

        async function fetchAllGitLab(endpoint) {
            return window.Salsifi.gitlabPaginate(GITLAB_URL, token, endpoint, { throwOnError: true });
        }


        function loadAuth() {
            return window.Salsifi.loadAuth({ redirect: false });
        }

