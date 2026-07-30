/* autoretro · state.js — état & config partagés (chargé en 1er). */

        // ══════════════════════════════════════════════════════════════════
        //  CONFIGURATION
        // ══════════════════════════════════════════════════════════════════


        let GITLAB_URL = null, token = null, projectId = null, selectedDays = 21, retroData = null;

        const HUB_URL = 'hub.html'; // mockup V2 = hub

        let alerts = [], generatedUS = [], doraMetrics = {};

        // Concurrence pour les fetches d'environnements. 8 simultanés cohérent
        // avec l'écosystème (daily-report, conflict-radar, bus-factor).

        const ENV_CONCURRENCY = 8;

        // ══════════════════════════════════════════════════════════════════
        //  HELPERS — fetchGitLab (retry 429), runWithConcurrency, escapeHtml.
        //  Alignés sur l'écosystème.
        // ══════════════════════════════════════════════════════════════════

