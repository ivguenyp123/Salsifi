/* project-scaffolder · state.js — état & config partagés (chargé en 1er). */

        // ============================================
        // AUTH + REPO — modèle plateforme (aligné DevOps Hub)
        // Token : localStorage 'devops_hub_workspaces' = { gitlabUrl, token, username }
        // Repo  : passé en query param ?repo=<id> par la modal "Démarrer" du Hub
        // ============================================

        const STORAGE_KEY = 'devops_hub_workspaces';

        // ⚠️ Nom de page du NOUVEAU hub (le seul endroit à changer pour les liens retour).
        // Le mockup V2 est désormais le hub. Si tu le renommes (ex. hub.html en prod), change ici.

        const HUB_URL = 'hub.html';

