// [hub] Extrait de hub.js — core/utils.js (portée globale, script classique)
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
