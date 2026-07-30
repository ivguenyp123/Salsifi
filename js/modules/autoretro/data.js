/* autoretro · data.js — I/O (auth, fetch). */

        async function fetchGitLab(endpoint) {
            try {
                const r = await window.Salsifi.gitlabFetch(GITLAB_URL, token, endpoint);
                return r.ok ? r.json() : null;
            } catch { return null; }
        }

