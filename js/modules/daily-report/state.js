/* daily-report · state.js — état & config partagés (chargé en 1er).
 * Portée globale du script classique (partagée entre les <script> du module). */

        // ══════════════════════════════════════════════════════════════════
        //  CONFIGURATION
        // ══════════════════════════════════════════════════════════════════

        let GITLAB_URL = null;
        let TOKEN = null;
        let PROJECT_ID = null;
        let currentDate = new Date(); // Par défaut: aujourd'hui

        // Concurrence pour les fetches de détails (commit diffs, pipeline jobs,
        // MR notes, pipelines des 7 derniers jours pour les tendances).
        // Aligné sur conflict-radar / bus-factor / repo-diet.
        const DETAILS_CONCURRENCY = 8;

        // ══════════════════════════════════════════════════════════════════
        //  HELPERS — fetchGitLab (retry 429), runWithConcurrency, escapeHtml.
        //  Alignés sur l'écosystème.
        // ══════════════════════════════════════════════════════════════════

