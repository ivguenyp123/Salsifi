/* access-workspace · state.js — état & config partagés (chargé en 1er). */

// ═══════════════════════════════════════════════════
// ACCÈS & RÔLES - Vue workspace des droits GitLab
// ───────────────────────────────────────────────────
// Phase 1 (front-only, aucun back) : lit les membres de chaque repo du
// workspace via l'API GitLab, distingue accès DIRECT vs HÉRITÉ (groupe),
// et met en avant les Maintainers/Owners + les points d'attention.
//
// Aucune donnée n'est stockée : tout est recalculé à chaque ouverture à
// partir du token de session (localStorage, pattern hub/gouvernance/DORA).
// ═══════════════════════════════════════════════════


let GITLAB_URL = null, token = null, currentWorkspace = null;

let myUsername = '';    // utilisateur connecté (auteur des modifications de liste blanche)

let lastModel = null;   // dernier modèle calculé (pour export / re-render)

let lastReport = null;  // dernier rapport de gouvernance calculé (pour téléchargement)

let historyLoaded = false;   // chargement paresseux de l'onglet Historique

let lastHistory = null;      // derniers résultats d'historique (pour re-filtrer sans refetch)

// Filtres de tri par rôle (partagés Par repo / Par personne) et par type d'événement (Historique).

let repoFilter = 'all';      // all | admin | owner | maintainer

let peopleFilter = 'all';    // all | admin | owner | maintainer

let historyFilter = 'all';   // all | role | membership

let reportScope = 'all';     // 'all' (workspace) ou id de repo — périmètre du Rapport

// Liste blanche des Maintainers autorisés (portée workspace).
// Stockée en variable projet GitLab partagée (écriture = droit Maintainer),
// avec repli localStorage personnel pour la lecture/écriture non partagée.

const ALLOWLIST_VAR = 'SALSIFI_ROLE_ALLOWLIST';

let allowlist = { usernames: [], shared: false, updatedBy: null, updatedAt: null };


const HUB_URL = 'hub.html';

// GitLab access levels → libellé lisible.

const ROLE_LABELS = {
    5:  'Minimal',
    10: 'Guest',
    20: 'Reporter',
    30: 'Developer',
    40: 'Maintainer',
    50: 'Owner'
};
