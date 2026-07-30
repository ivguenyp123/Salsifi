/* bus-factor · data.js — I/O (auth, fetch). */

        async function fetchGitLab(endpoint, init = {}) {
            return window.Salsifi.gitlabFetch(GITLAB_URL, token, endpoint, init);
        }

