/* gaming · data.js — I/O (auth, fetch). */

        async function fetchGitLab(endpoint) {
            try {
                const r = await window.Salsifi.gitlabFetch(GITLAB_URL, token, endpoint);
                return r.ok ? r.json() : null;
            } catch { return null; }
        }

        // Pagination automatique avec garde-fou 50 pages (5000 résultats max).

        async function fetchAll(endpoint) {
            return window.Salsifi.gitlabPaginate(GITLAB_URL, token, endpoint);
        }

        // POST pour /ci/lint (parse YAML côté serveur).

        async function postGitLab(endpoint, body) {
            try {
                let r = await fetch(`${GITLAB_URL}/api/v4${endpoint}`, {
                    method: 'POST',
                    headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (r.status === 429) {
                    const retryAfter = parseInt(r.headers.get('Retry-After')) || 2;
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    r = await fetch(`${GITLAB_URL}/api/v4${endpoint}`, {
                        method: 'POST',
                        headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                }
                if (!r.ok) return null;
                return r.json();
            } catch { return null; }
        }

        // Échappement HTML pour tout contenu issu de l'API injecté via innerHTML.
