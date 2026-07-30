/* gaming · state.js — état & config partagés (chargé en 1er). */

        // ══════════════════════════════════════════════════════════════════
        //  CONFIGURATION
        // ══════════════════════════════════════════════════════════════════


        let GITLAB_URL = null;

        let projectId = null;

        let token = null;

        // ── Helpers fetch ──────────────────────────────────────────────────
        // Wrapper avec retry simple sur 429.
