// [hub] Extrait de hub.js — core/state.js (portée globale, script classique)
        // ───── Constantes ──────────────────────────────────────────────────
        const CACHE_KEY_PREFIX = 'hub_cache_repos_';
        const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
        const STORAGE_KEY = 'devops_hub_workspaces';
        const SELECTED_REPO_KEY = 'hub_selected_repo_id';
        const SEARCH_THRESHOLD = 5; // afficher la search bar au-delà

        // ───── État global ─────────────────────────────────────────────────
        let auth = null;       // { gitlabUrl, token, username }
        let allRepos = [];     // tous les repos chargés
        let currentRepo = null;
        let currentRepoPage = 0;       // dernière page GitLab chargée (0 = rien)
        let hasMoreRepos = false;      // reste-t-il des pages à charger ?
        let isLoadingMoreRepos = false;
