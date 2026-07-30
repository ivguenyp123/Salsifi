/* branch-cleaner · state.js — état & config partagés (chargé en 1er). */

        // ══════════════════════════════════════════════════════════════════
        //  VARIABLES
        // ══════════════════════════════════════════════════════════════════


        let GITLAB_URL = null;

        let projectId = null;

        let token = null;

        let projectName = '';


        let allBranches = [];

        let filteredBranches = [];

        let selectedBranches = new Set();

        let mergedBranches = new Set();

        let protectedBranches = new Set();

        // Pagination

        const ITEMS_PER_PAGE = 50;

        let currentPage = 1;

        // ══════════════════════════════════════════════════════════════════
        //  HELPERS — fetch GitLab avec retry 429, pagination, escapeHtml.
        //  Alignés sur l'écosystème (insights, gaming, feature-flag-manager,
        //  mr-reviewer, auto-rebase, conflict-radar, bus-factor).
        // ══════════════════════════════════════════════════════════════════

