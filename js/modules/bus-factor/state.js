/* bus-factor · state.js — état & config partagés (chargé en 1er). */

        // ══════════════════════════════════════════════════════════════════
        //  CONFIGURATION
        // ══════════════════════════════════════════════════════════════════


        let GITLAB_URL = null;

        let projectId = null;

        let token = null;

        // Données calculées

        let contributors = {};      // { email: { name, commits, files: Set, directories: Set } }

        let directories = {};       // { path: { contributors: { email: count }, totalCommits } }

        let busFactorByDir = {};    // { path: { factor, contributors: [...], totalCommits } }

        // Concurrence pour les fetches commit-diff. Aligné sur conflict-radar.
        // 8 est un compromis : assez parallèle pour finir en ~8-10s sur 200 commits,
        // assez prudent pour ne pas saturer GitLab.

        const COMMIT_DIFF_CONCURRENCY = 8;

        // Taille de l'échantillon de commits analysés. 200 commits suffisent à dresser
        // une cartographie réaliste du "qui touche quoi" sur les semaines récentes —
        // ce qui est la définition utile du Bus Factor (qui sait quoi AUJOURD'HUI,
        // pas qui a écrit quoi en 2018).

        const COMMIT_SAMPLE_SIZE = 200;

        // ══════════════════════════════════════════════════════════════════
        //  HELPERS — fetchGitLab (retry 429), runWithConcurrency, escapeHtml.
        //  Alignés sur l'écosystème (insights, gaming, feature-flag-manager,
        //  mr-reviewer, auto-rebase, conflict-radar).
        // ══════════════════════════════════════════════════════════════════

