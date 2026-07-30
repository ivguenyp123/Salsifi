/* insights · state.js — état & config partagés (chargé en 1er). */

// ════════════════════════════════════════════════════════════
//  CONFIG & STATE
// ════════════════════════════════════════════════════════════

let GITLAB_URL = null;

let token = null;

let projectId = null;

let _charts = {};

let _doraState = {};

let _doraRepo = null;   // données repo réelles (pipelines/MR/branches/contrib) pour le diagnostic du coach

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════
