/* releasenotes · state.js — état & config partagés (chargé en 1er). */

        // ══════════════════════════════════════════════════════════════════
        //  CONFIG
        // ══════════════════════════════════════════════════════════════════


        let gitlabBaseUrl = '';

        let projectId = '';

        let projectName = '';

        let token = '';

        let defaultBranch = 'main';

        let defaultBranchDetected = false;  // True une fois getDefaultBranch() OK


        let allTags = [];

        let existingReleases = [];

        let selectedTag = null;

        let currentMarkdown = '';

        let currentTab = 'markdown';  // 'edit' | 'markdown' | 'rendered' — pour viewExistingRelease

        // Concurrence pour les push de masse — generateAllMissing.
        // 8 sur les writes API : raisonnable, GitLab encaisse sans problème.
        // Aligné sur l'écosystème (autoretro, daily-report, etc.).

        const PUSH_CONCURRENCY = 8;

        // ══════════════════════════════════════════════════════════════════
        //  HELPERS — fetchGitLab (retry 429), runWithConcurrency, escapeAttr
        //  Alignés sur l'écosystème.
        // ══════════════════════════════════════════════════════════════════

