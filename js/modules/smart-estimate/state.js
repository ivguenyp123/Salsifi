/* smart-estimate · state.js — état & config partagés (chargé en 1er). */

        // ══════════════════════════════════════════════════════════════════
        // CONFIGURATION — auth modèle plateforme + repo via ?repo=
        // ══════════════════════════════════════════════════════════════════

        let GITLAB_URL = null;

        let GITLAB_TOKEN = null;

        let projectId = null;

        let projectName = null;


        const STORAGE_KEY = 'devops_hub_workspaces';

        const HUB_URL = 'hub.html';

