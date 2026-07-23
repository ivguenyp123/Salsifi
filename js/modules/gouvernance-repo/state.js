/* gouvernance-repo · state.js — état & config (déballé de l'IIFE, chargé en 1er).
 * Portée globale du script classique (module déballé de son IIFE). */

'use strict';


  let GITLAB_URL = '', token = '', username = '';

  const HUB_URL = 'hub.html';


  // Domaines internes de confiance (Artifactory / registries LCL-CAGIP). Un
  // registry HTTPS sur ces domaines n'est PAS un « registry tiers » : c'est
  // notre miroir contrôlé, pas un acteur externe. Le HTTP reste flaggé (MITM).
  // NB : « interne » protège la disponibilité/le contrôle, PAS la provenance —
  // un repo *-remote proxifie le registre public (dependency-confusion possible).
  const INTERNAL_REGISTRY_RX = /(^|\.)cagip\.group\.gca$/i;


  // Mode mono-repo : ?repo=<id> passé par le hub. Si présent, tous les scans
  // (surface/historique/supply/CIS) ne portent QUE sur ce repo.
  let monoRepoId = null;


  // Mode workspace : ?scope=workspace + sessionStorage.current_workspace →
  // même moteur, mais restreint aux repos CHOISIS du workspace (ni 1, ni tous).
  let workspaceMode = false;

  let workspaceRepos = [];

  let workspaceName = '';


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

  // Création auto de MR en fin de scan. La popup d'entrée peut la couper
  // (scan-only) ; en scan manuel, elle reste à true (comportement historique).
  let autoMR = true;

  // Pendant le flux guidé : on n'affiche QU'un loader propre. Les UI par-scan
  // (énumération, progression, résultats intermédiaires) sont masquées ; la vue
  // consolidée n'apparaît qu'à la toute fin.
  let orchestrating = false;


  // ── Fetch résilient : retry backoff sur 429 / 5xx / erreur réseau, 401 → login ──
  const sleep = ms => new Promise(r => setTimeout(r, ms));


  // ── Moteur de détection (repris tel quel de gouvernance-repo.js) ──
  const SECRET_PATTERNS = [
    { name: 'AWS Access Key',            re: /\bAKIA[0-9A-Z]{16}\b/g },
    { name: 'GitLab PAT',                re: /\bglpat-[a-zA-Z0-9_\-]{20}\b/g },
    { name: 'GitHub PAT (classic)',      re: /\bghp_[a-zA-Z0-9]{36}\b/g },
    { name: 'GitHub PAT (fine-grained)', re: /\bgithub_pat_[a-zA-Z0-9_]{82}\b/g },
    { name: 'Slack Token',               re: /\bxox[baprs]-[0-9a-zA-Z\-]{10,}\b/g },
    { name: 'Stripe Secret Key',         re: /\bsk_live_[0-9a-zA-Z]{24}\b/g },
    { name: 'Stripe Restricted Key',     re: /\brk_live_[0-9a-zA-Z]{24}\b/g },
    { name: 'Google API Key',            re: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
    { name: 'GCP OAuth Client Secret',   re: /\bGOCSPX-[a-zA-Z0-9_\-]{28}\b/g },
    { name: 'GCP Service Account ID',    re: /"private_key_id"\s*:\s*"[a-f0-9]{40}"/g },
    { name: 'GitLab Runner/Deploy/CI Token', re: /\bgl(?:rt|dt|ft|ptt|cbt|soat|agent|imt)-[0-9a-zA-Z_\-]{20,}\b/g },
    { name: 'GitHub Token (oauth/server/refresh)', re: /\bgh[opsu]_[a-zA-Z0-9]{36}\b/g },
    { name: 'npm Token',                 re: /\bnpm_[a-zA-Z0-9]{36}\b/g },
    { name: 'PyPI Token',                re: /\bpypi-AgEIcHlwaS[a-zA-Z0-9_\-]{50,}\b/g },
    { name: 'OpenAI Key',                re: /\bsk-(?:proj|svcacct|admin)-[a-zA-Z0-9_\-]{20,}\b|\bsk-[a-zA-Z0-9]{48}\b/g },
    { name: 'Anthropic Key',             re: /\bsk-ant-[a-zA-Z0-9_\-]{20,}\b/g },
    { name: 'HuggingFace Token',         re: /\bhf_[a-zA-Z0-9]{34,}\b/g },
    { name: 'HashiCorp Vault Token',     re: /\bhvs\.[a-zA-Z0-9_\-]{20,}\b/g },
    { name: 'DigitalOcean Token',        re: /\bdo[oprt]_v1_[a-f0-9]{64}\b/g },
    { name: 'SendGrid API Key',          re: /\bSG\.[a-zA-Z0-9_\-]{22}\.[a-zA-Z0-9_\-]{43}\b/g },
    { name: 'Private Key (PEM)',         re: /-----BEGIN (?:RSA |OPENSSH |DSA |EC )?PRIVATE KEY-----/g },
    { name: 'JWT Token',                 re: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g },
    { name: 'Basic Auth in URL',         re: /https?:\/\/[a-zA-Z0-9._\-]+:[^@\s\/]{6,}@/g },
    { name: 'DB Connection String',      re: /\b(?:mongodb|postgres|postgresql|mysql|redis|amqp|amqps)(?:\+srv)?:\/\/[^:\/\s]+:[^@\s\/]+@/gi },
  ];

  const PLACEHOLDER_RE = /^(?:your[-_]?|x{3,}|<[^>]+>|\$\{[^}]+\}|\{\{[^}]+\}\}|placeholder|change[-_]?me|redacted|todo|fake|dummy|example|sample|test[-_]?only)/i;


  // ══════════════════════════════════════════════════════════════════════
  // MOTEUR HISTORIQUE — commits (toutes branches) → diffs → lignes ajoutées
  // 1 appel/commit. Un secret n'apparaît que dans le diff où il a été AJOUTÉ
  // (déduplication naturelle : on trouve l'introduction du secret).
  // ══════════════════════════════════════════════════════════════════════
  const COMMITS_PER_REPO_CAP = 8000; // garde-fou par repo (gros monorepo)


  // ── Persistance incrémentale (reprise après coupure) ──
  const HIST_KEY = 'secrets_hist_v1';

  let _histSaveWarned = false;

  const _lineOf = (raw, needle) => { const i = raw.indexOf(needle); return i < 0 ? null : raw.slice(0, i).split('\n').length; };

  const _trunc = s => { s = String(s).trim(); return s.length > 90 ? s.slice(0, 90) + '…' : s; };

  const _pipe = /\b(curl|wget)\b[^\n|]*\|\s*(sh|bash)\b/;


  // Enchaîne les vérifications choisies EN SÉRIE, puis enregistre le rapport.
  // On attend (await) chaque scan jusqu'au bout, puis sa création de MR — les
  // deux sont sérialisés explicitement, donc pas de course sur `results` ni de
  // blocage. autoMR=false coupe l'auto-MR de finishScan : on la pilote ici.
  const CHECK_LABEL = { surface: 'Secrets (surface)', history: 'Secrets (historique)', supply: 'Supply-chain', cis: 'Conformité CIS' };


  let currentTypeFilter = null;

  let liveCount = 0;

  const RENDER_CAP = 400; // au-delà : on garde tout en mémoire/Excel, mais on n'inonde pas le DOM


  // ══════════════════════════════════════════════════════════════════════
  // GRAPHIQUES (Chart.js, CDN) — Top repos · par type (cliquable) · couverture
  // ══════════════════════════════════════════════════════════════════════
  let _charts = [];

  const CHART_PALETTE = ['#7c5cff', '#2dd4bf', '#fb923c', '#f472b6', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#c084fc', '#fb7185', '#22d3ee', '#a3e635', '#f59e0b', '#e879f9', '#4ade80'];


  // ── Exports (preview censurée uniquement) ──
  const affected = () => results.filter(r => r.res.findings.length > 0);

  let toastTimer = null;


  // Carte CIS live : score + checks pliables (réutilise les classes repo-card).
  const cisStateIcon = s => s === 'ok' ? '✅' : s === 'ko' ? '🔴' : s === 'unverif' ? '🔒' : '⚪';


  let cisFilter = 'all';


  // Pourquoi c'est dangereux — par type de secret/finding. Concret, pas générique.
  // Clé = sous-chaîne cherchée dans finding.type (insensible à la casse).
  const RISK = [
    ['AWS Access Key', 'Accès direct à l\'infra AWS (S3, EC2, IAM…). Une clé valide = prise de contrôle du compte cloud et factures potentiellement énormes.'],
    ['Anthropic', 'Clé API facturée à l\'usage. Exposée = consommation frauduleuse à tes frais et quota épuisé.'],
    ['OpenAI', 'Clé API facturée à l\'usage. Exposée = consommation frauduleuse à tes frais et quota épuisé.'],
    ['HuggingFace', 'Accès aux modèles et repos privés, et écriture possible selon le scope du token.'],
    ['GitLab PAT', 'Jeton personnel : accès à tous tes projets GitLab avec tes droits. Lecture/écriture de code, CI, variables protégées.'],
    ['GitLab Runner', 'Token CI/CD : permet d\'enregistrer un runner ou de récupérer des secrets de pipeline. Pivot vers la chaîne de build.'],
    ['GitHub PAT', 'Jeton personnel GitHub : accès aux repos avec tes droits, push de code, lecture de secrets d\'actions.'],
    ['GitHub Token', 'Jeton OAuth/serveur GitHub : accès programmatique aux repos et à l\'API avec les droits associés.'],
    ['Stripe Secret', 'Clé secrète de paiement : création de charges, remboursements, accès aux données clients. Risque financier direct.'],
    ['Stripe Restricted', 'Clé Stripe restreinte : périmètre limité mais toujours sensible (selon les permissions accordées).'],
    ['Private Key (PEM)', 'Clé privée cryptographique : déchiffrement de trafic, usurpation d\'identité TLS/SSH, signature frauduleuse.'],
    ['JWT', 'Jeton de session/identité : peut permettre l\'usurpation d\'un utilisateur ou d\'un service tant qu\'il est valide.'],
    ['DB Connection', 'Chaîne de connexion base de données : accès direct aux données (lecture/écriture/suppression) si le réseau le permet.'],
    ['GCP OAuth', 'Secret client OAuth Google Cloud : usurpation de l\'application et accès aux ressources GCP autorisées.'],
    ['Google API Key', 'Clé API Google : consommation de quotas facturés et accès aux services activés sur le projet.'],
    ['Slack', 'Jeton Slack : lecture de messages, envoi au nom du bot/utilisateur, accès aux canaux privés selon le scope.'],
    ['npm Token', 'Jeton npm : publication de paquets en ton nom. Risque d\'empoisonnement de la chaîne d\'approvisionnement.'],
    ['PyPI', 'Jeton PyPI : publication de paquets Python en ton nom. Risque d\'empoisonnement de la supply-chain.'],
    ['SendGrid', 'Clé d\'envoi d\'e-mails : spam/phishing depuis ton domaine, atteinte à la réputation d\'expéditeur.'],
    ['DigitalOcean', 'Jeton DigitalOcean : contrôle des droplets, bases et réseaux du compte.'],
    ['Vault', 'Jeton HashiCorp Vault : accès aux secrets stockés selon les policies associées au token.'],
    // Supply-chain
    ['Script preinstall', 'Hook exécuté automatiquement à l\'install : code arbitraire lancé sur tout poste/CI qui installe les deps.'],
    ['Script install', 'Hook exécuté automatiquement à l\'install : code arbitraire lancé sur tout poste/CI qui installe les deps.'],
    ['Script postinstall', 'Hook exécuté automatiquement à l\'install : code arbitraire lancé sur tout poste/CI qui installe les deps.'],
    ['Dépendance non figée', 'Version non épinglée : une mise à jour malveillante en amont entre silencieusement dans le build (supply-chain).'],
    ['Dépendance Python non figée', 'Version non épinglée : une release amont compromise entre dans le build sans contrôle.'],
    ['Version Maven dynamique', 'Version dynamique (LATEST/RELEASE/range) : build non reproductible, exposé à une dépendance amont compromise.'],
    ['Version Gradle dynamique', 'Version dynamique (+) : build non reproductible, exposé à une dépendance amont compromise.'],
    ['Registry HTTP', 'Registre en HTTP non chiffré : paquets interceptables/modifiables en transit (man-in-the-middle).'],
    ['Registry npm tiers', 'Registre tiers : la confiance repose sur un acteur externe non contrôlé.'],
    ['Image CI non pinnée', 'Image :latest ou sans tag : le contenu peut changer à tout moment, build non reproductible.'],
    ['Image Docker non pinnée', 'Image sans digest : le contenu derrière le tag peut être remplacé, build non reproductible.'],
    ['Exécution distante (pipe shell)', 'curl … | bash : exécute un script distant non vérifié. Si la source est compromise, exécution directe sur le runner.'],
    ['ADD distant', 'ADD d\'une URL : contenu distant non vérifié intégré à l\'image.'],
    ['include CI distant', 'Inclusion d\'une config CI distante : un changement amont modifie ton pipeline sans relecture.'],
  ];


  // ── MR CIS : tout repo ayant au moins un écart CIS. Commite les fichiers corrigeables
  //    (SECURITY.md, CODEOWNERS) + documente les réglages Settings. ──
  const MR_CIS_BRANCH = 'security-scan/cis';

  const escMd = t => String(t == null ? '' : t).replace(/\|/g, '\\|');
