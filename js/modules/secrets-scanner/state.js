/* secrets-scanner · state.js — état & config partagés (chargé en 1er). */

/* ═══════════════════════════════════════════════════════════════════════
   SECRETS SCANNER — service de la route « Inspecter & Sécuriser » (DevOps Hub)
   Au chargement : énumère tous les repos accessibles (membership=true, comme
   fetchReposPage du hub) puis scanne les secrets avec le moteur de
   Gouvernance Repo (mêmes patterns, preview censurée, refs CIS) et affiche.
   Non repo-aware : scanne TOUT ce que le token voit, pas un repo sélectionné.
   ═══════════════════════════════════════════════════════════════════════ */


let GITLAB_URL = '', token = '', username = '';

const HUB_URL = 'hub.html';


let aborted = false;

let running = false;

let results = [];   // { repo, res }

let mode = 'surface';
// Accumulation des findings pour le rapport, par famille (secrets / supply).
// Les scans ne s'écrasent plus : Surface + Historique se cumulent côté secrets.
// Dédoublonnage strict via une clé repo|fichier|ligne|type|aperçu.
// Map clé -> { repo, ns, file, line, type, cat, preview, link }

let reportSecrets = new Map();

let reportSupply = new Map();

let scannedSecrets = false; // une famille "secrets" (surface ou historique) a tourné

let scannedSupply = false;  // un scan supply-chain a tourné

let scannedCIS = false;     // un scan CIS a tourné

let reportCIS = new Map();

// Instrumentation (mode historique surtout)

let apiCalls = 0, throttles = 0, commitsProcessed = 0, runStart = 0;

// ── État création de MR (auto en fin de scan) ──
// Une MR de rapport par repo touché. Branche fixe → idempotence : un rescan
// ne recrée rien. La MR est une PROPOSITION (jamais mergée) ; le repo décide.

const MR_BRANCH = 'security-scan/report';

const MR_FILE = 'SECURITY-SCAN.md';

const MR_CONC = 3;          // repos traités en parallèle (POST throttle vite)

let mrCreating = false;     // garde anti-relance pendant la création

// ── Init : auth lue du hub, puis démarrage auto (le clic sur le service = le déclencheur) ──

const sleep = ms => new Promise(r => setTimeout(r, ms));
