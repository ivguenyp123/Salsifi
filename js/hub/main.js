// [hub] Extrait de hub.js — main.js (portée globale, script classique)
        // ───── Bootstrap ───────────────────────────────────────────────────
        (function init() {
            auth = loadAuth();
            if (!auth) {
                redirectToLogin();
                return;
            }
            renderUserInfo();
            wireRepoPicker();
            loadRepos();
        })();
