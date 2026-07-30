/* dora-workspace · state.js — état & config partagés (chargé en 1er). */

// ═══════════════════════════════════════════════════
// DORA WORKSPACE - Calcul des 4 métriques DORA
// ═══════════════════════════════════════════════════


let GITLAB_URL = null, token = null, currentWorkspace = null;

let lastResults = null;   // derniers résultats repo (pour re-render après réorg sans refetch)

// Hub de retour (mockup V2), aligné sur gouvernance-repo.
