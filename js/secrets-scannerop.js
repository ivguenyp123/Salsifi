/* ═══════════════════════════════════════════════════════════════════════
   SECRETS SCANNER — service de la route « Inspecter & Sécuriser » (DevOps Hub)
   Au chargement : énumère tous les repos accessibles (membership=true, comme
   fetchReposPage du hub) puis scanne les secrets avec le moteur de
   Gouvernance Repo (mêmes patterns, preview censurée, refs CIS) et affiche.
   Non repo-aware : scanne TOUT ce que le token voit, pas un repo sélectionné.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

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

  // Instrumentation (mode historique surtout)
  let apiCalls = 0, throttles = 0, commitsProcessed = 0, runStart = 0;

  // ── Init : auth lue du hub, puis démarrage auto (le clic sur le service = le déclencheur) ──
  document.addEventListener('DOMContentLoaded', () => {
    const raw = localStorage.getItem('devops_hub_workspaces');
    if (!raw) { window.location.href = 'login.html'; return; }
    let g;
    try { g = JSON.parse(raw); } catch { window.location.href = 'login.html'; return; }
    GITLAB_URL = g.gitlabUrl; token = g.token; username = g.username || '';
    if (!token || !GITLAB_URL) { window.location.href = 'login.html'; return; }

    document.querySelectorAll('[data-hub-link]').forEach(a => { a.href = HUB_URL; });
    const pill = document.getElementById('userPill');
    if (pill) pill.textContent = username ? `👤 ${username}` : '🔓 connecté';

    run();
  });

  // ── Fetch résilient : retry backoff sur 429 / 5xx / erreur réseau, 401 → login ──
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function rawFetch(url, attempts = 4) {
    for (let i = 0; i < attempts; i++) {
      try {
        apiCalls++;
        const r = await fetch(url, { headers: { 'PRIVATE-TOKEN': token } });
        if (r.status === 401) { localStorage.removeItem('devops_hub_workspaces'); window.location.href = 'login.html'; return null; }
        if (r.status === 429 || r.status >= 500) {
          if (r.status === 429) throttles++;
          const ra = parseInt(r.headers.get('Retry-After')) || Math.min(30, Math.pow(2, i + 1));
          await sleep(ra * 1000);
          continue;
        }
        return r;
      } catch {
        await sleep(Math.min(15, Math.pow(2, i + 1)) * 1000);
      }
    }
    return null;
  }
  async function fetchGL(ep) {
    const r = await rawFetch(`${GITLAB_URL}/api/v4${ep}`);
    if (!r || !r.ok) return null;
    try { return await r.json(); } catch { return null; }
  }
  function nextLink(h) {
    if (!h) return null;
    for (const part of h.split(',')) { const m = part.match(/<([^>]+)>\s*;\s*rel="next"/); if (m) return m[1]; }
    return null;
  }

  // ── Énumération de tous les repos accessibles — pagination KEYSET (fiable au-delà de qq milliers) ──
  // Filtre serveur : archivés exclus. Filtre client : repos vides (default_branch null) ignorés.
  async function listAccessibleRepos(onProgress, limit) {
    const out = [];
    let next = `${GITLAB_URL}/api/v4/projects?membership=true&simple=true&archived=false&per_page=100&pagination=keyset&order_by=id&sort=asc`;
    let guard = 0;
    while (next && !aborted) {
      const r = await rawFetch(next);
      if (!r || !r.ok) break;
      let batch; try { batch = await r.json(); } catch { break; }
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const p of batch) {
        if (!p.default_branch) continue; // repo vide / non initialisé
        out.push({ id: p.id, name: p.name, path: p.path_with_namespace || p.name, url: p.web_url || '', defaultBranch: p.default_branch });
        if (limit && out.length >= limit) { if (onProgress) onProgress(out.length); return out; }
      }
      if (onProgress) onProgress(out.length);
      next = nextLink(r.headers.get('Link'));
      if (++guard > 5000) break; // garde-fou dur
    }
    return out;
  }

  // ── Arbre + contenu (identiques gouvernance-repo) ──
  async function getFileTree(projectId) {
    const files = [];
    let page = 1;
    while (true) {
      const batch = await fetchGL(`/projects/${projectId}/repository/tree?recursive=true&per_page=100&page=${page}`);
      if (!batch || !Array.isArray(batch) || batch.length === 0) break;
      files.push(...batch.map(f => f.path));
      if (batch.length < 100) break;
      page++;
    }
    return files;
  }
  async function getFileContent(projectId, path) {
    try {
      const data = await fetchGL(`/projects/${projectId}/repository/files/${encodeURIComponent(path)}?ref=HEAD`);
      return data?.content ? atob(data.content) : null;
    } catch { return null; }
  }

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

  function isSuspectFile(path) {
    const name = path.split('/').pop().toLowerCase();
    const lowerPath = path.toLowerCase();
    if (/\.(example|template|sample|dist|md|png|jpe?g|gif|ico|svg|woff2?|ttf|eot|webp|mp[34]|mov|avi|zip|tar|gz|rar|7z|pdf|jar|war|class)$/i.test(name)) return false;
    if (/(?:^|\/)(?:node_modules|vendor|dist|build|target|coverage|\.git|out|\.next|\.nuxt|\.cache|__pycache__|\.venv|venv)(?:\/|$)/.test(lowerPath)) return false;
    const risky = [
      /^\.env(\..+)?$/,
      /^(config|application|appsettings|settings|secrets?|credentials?)(\..+)?\.(json|ya?ml|toml|properties|ini|xml|env)$/,
      /^application(-.+)?\.(properties|ya?ml)$/,
      /^appsettings(\..+)?\.json$/,
      /^(local_settings|secret_settings)\.py$/,
      /^service[-_]account.*\.json$/,
      /^(credentials|firebase|gcp|aws)(\..+)?\.json$/,
      /\.(pem|key|p12|pfx|jks|asc)$/,
      /^id_(rsa|dsa|ecdsa|ed25519)$/,
      /^\.(npmrc|pypirc|dockercfg|htpasswd|netrc)$/,
      /^config\.json$/,
      /^terraform\.tfvars(\..+)?$/,
      /\.tfstate(\.backup)?$/,
      /^web\.config$/,
      /^\.gitlab-ci(\..+)?\.ya?ml$/,
      /^docker-compose(\..+)?\.ya?ml$/,
    ];
    return risky.some(re => re.test(name));
  }

  async function scanSecrets(repo, onProgress) {
    const result = { findings: [], scanned: 0, candidates: 0, done: false };
    let tree;
    try { tree = await getFileTree(repo.id); } catch { return result; }
    const suspects = tree.filter(isSuspectFile);
    result.candidates = suspects.length;

    const BATCH = 5;
    for (let i = 0; i < suspects.length; i += BATCH) {
      if (aborted) break;
      const batch = suspects.slice(i, i + BATCH);
      await Promise.all(batch.map(async (filePath) => {
        let content;
        try { content = await getFileContent(repo.id, filePath); } catch { return; }
        if (!content || content.length > 200000) return;
        result.scanned++;
        const leafName = filePath.split('/').pop();
        const cisRef = /^\.gitlab-ci/i.test(leafName) ? '2.3.8'
                     : /\.tfvars|\.tfstate/i.test(leafName) ? '5.1.3' : '1.5.1';
        const lines = content.split('\n');
        for (const pat of SECRET_PATTERNS) {
          const re = new RegExp(pat.re.source, pat.re.flags);
          lines.forEach((line, idx) => {
            if (line.length > 500) return;
            let m;
            while ((m = re.exec(line)) !== null) {
              const matched = m[0];
              if (PLACEHOLDER_RE.test(matched)) continue;
              const preview = matched.length > 10
                ? matched.substring(0, Math.min(8, matched.length - 4)) + '***' : '***';
              result.findings.push({ file: filePath, line: idx + 1, type: pat.name, preview, cis: cisRef });
            }
          });
        }
      }));
      if (onProgress) onProgress(Math.min(i + BATCH, suspects.length), suspects.length);
    }
    result.done = true;
    return result;
  }

  // ══════════════════════════════════════════════════════════════════════
  // MOTEUR HISTORIQUE — commits (toutes branches) → diffs → lignes ajoutées
  // 1 appel/commit. Un secret n'apparaît que dans le diff où il a été AJOUTÉ
  // (déduplication naturelle : on trouve l'introduction du secret).
  // ══════════════════════════════════════════════════════════════════════
  const COMMITS_PER_REPO_CAP = 8000; // garde-fou par repo (gros monorepo)

  // ── Persistance incrémentale (reprise après coupure) ──
  const HIST_KEY = 'secrets_hist_v1';
  function loadHistState() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY)) || {}; } catch { return {}; }
  }
  let _histSaveWarned = false;
  function saveHistState(state) {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(state)); }
    catch (e) {
      if (!_histSaveWarned) { _histSaveWarned = true; showToast('Stockage local saturé — reprise partielle possible.', 'info'); }
    }
  }
  function resetHistory() {
    try { localStorage.removeItem(HIST_KEY); } catch {}
    showToast('Historique réinitialisé — le prochain scan repart de zéro.', 'success');
  }

  async function listCommits(repoId, sinceISO) {
    const shas = [];
    let page = 1;
    const sinceParam = sinceISO ? `&since=${encodeURIComponent(sinceISO)}` : '';
    while (!aborted) {
      const batch = await fetchGL(`/projects/${repoId}/repository/commits?all=true&per_page=100${sinceParam}&page=${page}`);
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const c of batch) shas.push(c.id);
      if (shas.length >= COMMITS_PER_REPO_CAP) break;
      if (batch.length < 100) break;
      page++;
    }
    return shas;
  }

  async function scanHistory(repo, onTick, prev) {
    const result = { findings: [], scanned: 0, done: false, capped: false, since: new Date().toISOString() };
    const sinceISO = prev && prev.since ? prev.since : null;
    let shas;
    try { shas = await listCommits(repo.id, sinceISO); } catch { return result; }
    if (shas.length >= COMMITS_PER_REPO_CAP) result.capped = true;

    // seen amorcé avec les findings déjà connus → on ne ré-ajoute pas
    const prevFindings = (prev && prev.findings) ? prev.findings : [];
    const seen = new Set(prevFindings.map(f => f.file + '|' + f.type + '|' + f.preview));
    const fresh = [];
    const CONC = 4;
    let idx = 0;

    async function worker() {
      while (idx < shas.length && !aborted) {
        const sha = shas[idx++];
        try {
          const diffs = await fetchGL(`/projects/${repo.id}/repository/commits/${sha}/diff?per_page=100`);
          commitsProcessed++;
          result.scanned++;
          if (onTick) onTick();
          if (!Array.isArray(diffs)) continue;
          for (const d of diffs) {
            const file = d.new_path || d.old_path || '';
            if (!isSuspectFile(file)) continue;
            const diffText = d.diff || '';
            if (diffText.length > 400000) continue;
            for (const line of diffText.split('\n')) {
              if (line[0] !== '+' || line.startsWith('+++')) continue; // seulement les ajouts
              if (line.length > 500) continue;
              const body = line.slice(1);
              for (const pat of SECRET_PATTERNS) {
                const re = new RegExp(pat.re.source, pat.re.flags);
                let m;
                while ((m = re.exec(body)) !== null) {
                  const matched = m[0];
                  if (PLACEHOLDER_RE.test(matched)) continue;
                  const preview = matched.length > 10 ? matched.substring(0, Math.min(8, matched.length - 4)) + '***' : '***';
                  const key = file + '|' + pat.name + '|' + preview;
                  if (seen.has(key)) continue;
                  seen.add(key);
                  const leaf = file.split('/').pop();
                  const cisRef = /^\.gitlab-ci/i.test(leaf) ? '2.3.8' : /\.tfvars|\.tfstate/i.test(leaf) ? '5.1.3' : '1.5.1';
                  fresh.push({ file, commit: sha.substring(0, 8), type: pat.name, preview, cis: cisRef });
                }
              }
            }
          }
        } catch { /* commit ignoré, on continue */ }
      }
    }
    await Promise.all(Array.from({ length: CONC }, () => worker()));
    // findings cumulés (déjà connus + nouveaux) pour un rapport complet même en incrémental
    result.findings = prevFindings.concat(fresh);
    result.done = true;
    return result;
  }

  // ══════════════════════════════════════════════════════════════════════
  // MOTEUR SUPPLY-CHAIN (surface) — manifestes & CI, par fichier
  // findings: { kind:'supply', severity:'red'|'orange', tag, type, file, line, preview }
  // ══════════════════════════════════════════════════════════════════════
  function supplyEco(path) {
    const lower = path.toLowerCase();
    if (/(?:^|\/)(?:node_modules|vendor|dist|build|target|\.git|__pycache__|venv|\.venv|coverage)(?:\/|$)/.test(lower)) return null;
    const name = path.split('/').pop();
    if (name === 'package.json') return 'npm';
    if (name === '.npmrc') return 'npmrc';
    if (/^\.gitlab-ci(\..+)?\.ya?ml$/i.test(name)) return 'ci';
    if (name === 'pom.xml') return 'maven';
    if (name === 'build.gradle' || name === 'build.gradle.kts') return 'gradle';
    if (/^requirements.*\.txt$/i.test(name)) return 'pip';
    if (name === 'Dockerfile' || /\.dockerfile$/i.test(name) || /^Dockerfile\./i.test(name)) return 'docker';
    return null;
  }
  const _lineOf = (raw, needle) => { const i = raw.indexOf(needle); return i < 0 ? null : raw.slice(0, i).split('\n').length; };
  const _trunc = s => { s = String(s).trim(); return s.length > 90 ? s.slice(0, 90) + '…' : s; };
  const _pipe = /\b(curl|wget)\b[^\n|]*\|\s*(sh|bash)\b/;

  function checkSupply(eco, content, file, out) {
    const push = (severity, tag, type, line, preview) => out.push({ kind: 'supply', severity, tag, type, file, line, preview: _trunc(preview) });
    if (eco === 'npm') {
      let pkg; try { pkg = JSON.parse(content); } catch { return; }
      for (const h of ['preinstall', 'install', 'postinstall']) {
        if (pkg.scripts && pkg.scripts[h]) push('red', 'npm', `Script ${h}`, _lineOf(content, `"${h}"`), pkg.scripts[h]);
      }
      const exact = /^\d+\.\d+\.\d+([-+].+)?$/;
      for (const dk of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        const deps = pkg[dk]; if (!deps || typeof deps !== 'object') continue;
        for (const [n, v] of Object.entries(deps)) {
          const val = String(v).trim();
          if (exact.test(val)) continue;
          const sev = (val === 'latest' || val === '*' || /^(git\+|https?:\/\/|github:|file:)/i.test(val)) ? 'red' : 'orange';
          push(sev, 'npm', 'Dépendance non figée', _lineOf(content, `"${n}"`), `${n}: ${val}`);
        }
      }
    } else if (eco === 'npmrc') {
      content.split('\n').forEach((ln, i) => {
        const m = ln.match(/registry\s*=\s*(\S+)/i); if (!m) return;
        const url = m[1];
        if (/^http:\/\//i.test(url)) push('red', 'npm', 'Registry HTTP (non chiffré)', i + 1, ln);
        else if (/^https?:/i.test(url) && !/registry\.npmjs\.org/i.test(url)) push('orange', 'npm', 'Registry npm tiers', i + 1, ln);
      });
    } else if (eco === 'ci') {
      content.split('\n').forEach((ln, i) => {
        const im = ln.match(/^\s*image:\s*["']?([^\s"'{]+)/);
        if (im) { const img = im[1]; if (/:latest$/i.test(img) || !/:/.test(img)) push('orange', 'ci', 'Image CI non pinnée', i + 1, img); }
        if (_pipe.test(ln)) push('red', 'ci', 'Exécution distante (pipe shell)', i + 1, ln);
        if (/(remote:|include:).*https?:\/\//.test(ln)) push('orange', 'ci', 'include CI distant', i + 1, ln);
      });
    } else if (eco === 'maven') {
      content.split('\n').forEach((ln, i) => {
        const m = ln.match(/<version>\s*([^<]+?)\s*<\/version>/i);
        if (m) { const v = m[1]; if (!v.includes('${') && (/[\[\]\(\)]/.test(v) || /\b(LATEST|RELEASE)\b/.test(v))) push('orange', 'maven', 'Version Maven dynamique', i + 1, v); }
      });
    } else if (eco === 'gradle') {
      content.split('\n').forEach((ln, i) => {
        if (/['"][\w.\-]+:[\w.\-]+:[^'"]*(\+|latest\.)[^'"]*['"]/i.test(ln)) push('orange', 'gradle', 'Version Gradle dynamique', i + 1, ln);
      });
    } else if (eco === 'pip') {
      content.split('\n').forEach((ln, i) => {
        const t = ln.trim();
        if (!t || t.startsWith('#') || t.startsWith('-') || /^https?:/i.test(t) || t.startsWith('git+')) return;
        if (/^[A-Za-z0-9._\-\[\]]+/.test(t) && !/[=<>~!]=/.test(t)) push('orange', 'pip', 'Dépendance Python non figée', i + 1, t);
      });
    } else if (eco === 'docker') {
      content.split('\n').forEach((ln, i) => {
        const f = ln.match(/^\s*FROM\s+(\S+)/i);
        if (f) { const img = f[1]; if (!/@sha256:/.test(img) && (/:latest$/i.test(img) || !/:/.test(img))) push('orange', 'docker', 'Image Docker non pinnée', i + 1, img); }
        if (/^\s*ADD\s+https?:\/\//i.test(ln)) push('orange', 'docker', 'ADD distant (Dockerfile)', i + 1, ln);
        if (_pipe.test(ln)) push('red', 'docker', 'Exécution distante (pipe shell)', i + 1, ln);
      });
    }
  }

  async function scanSupplyChain(repo, onProgress) {
    const result = { findings: [], scanned: 0, candidates: 0, done: false };
    let tree; try { tree = await getFileTree(repo.id); } catch { return result; }
    const targets = tree.map(p => ({ p, eco: supplyEco(p) })).filter(x => x.eco);
    result.candidates = targets.length;
    const BATCH = 5;
    for (let i = 0; i < targets.length; i += BATCH) {
      if (aborted) break;
      const batch = targets.slice(i, i + BATCH);
      await Promise.all(batch.map(async ({ p, eco }) => {
        let content; try { content = await getFileContent(repo.id, p); } catch { return; }
        if (!content || content.length > 500000) return;
        result.scanned++;
        try { checkSupply(eco, content, p, result.findings); } catch { /* fichier malformé, on continue */ }
      }));
      if (onProgress) onProgress(Math.min(i + BATCH, targets.length), targets.length);
    }
    result.done = true;
    return result;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ORCHESTRATION : énumère → scanne → affiche (automatique)
  // ══════════════════════════════════════════════════════════════════════
  async function run() {
    if (running) return;
    running = true; aborted = false; results = []; liveCount = 0;

    show('resultsSection', false);
    show('scanSection', false);
    document.getElementById('findingsGrid').innerHTML = '';
    show('enumSection', true);
    const enumCount = document.getElementById('enumCount');

    let done = 0, total = 0, totalFindings = 0, reposAffected = 0;
    try {
      // 1) Énumération
      const repos = await listAccessibleRepos(n => { enumCount.textContent = `${fmt(n)} repos accessibles…`; });
      show('enumSection', false);

      if (aborted) { showToast('Interrompu.', 'info'); return; }
      if (!repos.length) {
        document.getElementById('findingsGrid').innerHTML =
          `<div class="state-box"><div class="icon">⚠️</div><h3>Aucun repo accessible</h3><p>Le token ne voit aucun projet, ou l'API a renvoyé une erreur.</p></div>`;
        show('resultsSection', true);
        return;
      }

      // 2) Scan (concurrence limitée, abortable, rendu live)
      show('scanSection', true);
      total = repos.length;
      let idx = 0;
      const CONC = 3;

      const setProg = (label) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressText').textContent = `${fmt(done)} / ${fmt(total)} repos`;
        document.getElementById('progressSub').textContent = label || '';
        document.getElementById('liveStat').textContent = `🔑 ${fmt(totalFindings)} secret(s) · ${fmt(reposAffected)} repo(s)`;
      };
      setProg('Démarrage…');

      async function worker() {
        while (idx < repos.length && !aborted) {
          const repo = repos[idx++];
          try {
            setProg(repo.path);
            const res = await scanSecrets(repo, (d, t) => setProg(`${repo.path} (${d}/${t} fichiers)`));
            done++;
            results.push({ repo, res });
            if (res.findings.length) { reposAffected++; totalFindings += res.findings.length; appendFindingCard(repo, res); }
          } catch (e) {
            console.warn('Repo ignoré (erreur):', repo.path, e);
            done++; // on n'abandonne jamais tout le run pour un repo
          }
          setProg(repo.path);
        }
      }
      await Promise.all(Array.from({ length: CONC }, () => worker()));

      show('scanSection', false);
      finishScan(done, total, totalFindings, reposAffected);
    } catch (e) {
      console.error('Scan interrompu par une erreur:', e);
      show('enumSection', false);
      show('scanSection', false);
      finishScan(done, total, totalFindings, reposAffected); // résultats partiels
      showToast('Erreur pendant le scan — résultats partiels affichés.', 'error');
    } finally {
      running = false;
    }
  }

  function stopScan() { aborted = true; showToast('Scan interrompu — résultats partiels affichés.', 'info'); }
  function rescan() { if (!running) run(); }

  // ── Instrumentation (mode historique) ──
  function fmtDur(s) {
    s = Math.round(s); if (s < 60) return s + 's';
    const m = Math.floor(s / 60), r = s % 60; if (m < 60) return `${m}m${r ? r + 's' : ''}`;
    const h = Math.floor(m / 60); return `${h}h${m % 60}m`;
  }
  function updateHistInstr(reposDone, reposTotal, secrets, reposAffected) {
    const el = document.getElementById('histStats'); if (!el) return;
    const elapsed = (Date.now() - runStart) / 1000;
    const rate = elapsed > 0 ? commitsProcessed / elapsed : 0;
    // ETA : extrapolation grossière sur les repos restants au débit commits courant
    let eta = '—';
    if (reposDone > 0 && rate > 0) {
      const avgCommits = commitsProcessed / reposDone;
      const remaining = (reposTotal - reposDone) * avgCommits;
      eta = '≈ ' + fmtDur(remaining / rate);
    }
    el.innerHTML = [
      ['Repos', `${fmt(reposDone)} / ${fmt(reposTotal)}`],
      ['Commits scannés', fmt(commitsProcessed)],
      ['Débit', `${rate.toFixed(1)} commits/s`],
      ['Appels API', fmt(apiCalls)],
      ['429 (throttle)', fmt(throttles)],
      ['Écoulé', fmtDur(elapsed)],
      ['ETA (estim.)', eta],
      ['Secrets', `${fmt(secrets)} dans ${fmt(reposAffected)} repo(s)`],
    ].map(([k, v]) => `<div class="instr-cell"><div class="instr-k">${k}</div><div class="instr-v">${v}</div></div>`).join('');
  }

  async function runHistory(maxRepos) {
    if (running) return;
    running = true; aborted = false; results = []; liveCount = 0;
    apiCalls = 0; throttles = 0; commitsProcessed = 0; runStart = Date.now();

    show('resultsSection', false);
    show('scanSection', false);
    document.getElementById('findingsGrid').innerHTML = '';
    show('enumSection', true);
    const enumCount = document.getElementById('enumCount');

    let done = 0, total = 0, totalFindings = 0, reposAffected = 0;
    try {
      const repos = await listAccessibleRepos(n => { enumCount.textContent = `${fmt(n)} repos (limite ${fmt(maxRepos)})…`; }, maxRepos);
      show('enumSection', false);
      if (aborted) { showToast('Interrompu.', 'info'); return; }
      if (!repos.length) {
        document.getElementById('findingsGrid').innerHTML =
          `<div class="state-box"><div class="icon">⚠️</div><h3>Aucun repo accessible</h3></div>`;
        show('resultsSection', true); return;
      }

      show('scanSection', true);
      show('histStats', true);
      total = repos.length;
      let idx = 0;
      let sinceSave = 0;
      const histState = loadHistState();
      const CONC = 2; // repos en parallèle (chaque repo parallélise déjà ses commits)

      const tick = (label) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressText').textContent = `${fmt(done)} / ${fmt(total)} repos · historique`;
        document.getElementById('progressSub').textContent = label || '';
        document.getElementById('liveStat').textContent = `🔑 ${fmt(totalFindings)} secret(s)`;
        updateHistInstr(done, total, totalFindings, reposAffected);
      };
      tick('Démarrage…');

      async function worker() {
        while (idx < repos.length && !aborted) {
          const repo = repos[idx++];
          try {
            tick(repo.path);
            const prev = histState[repo.id];
            const res = await scanHistory(repo, () => tick(repo.path), prev);
            done++;
            results.push({ repo, res });
            // curseur + findings cumulés persistés (findings stockés seulement si présents)
            histState[repo.id] = res.findings.length
              ? { since: res.since, findings: res.findings }
              : { since: res.since };
            if (++sinceSave >= 10) { sinceSave = 0; saveHistState(histState); }
            if (res.findings.length) { reposAffected++; totalFindings += res.findings.length; appendFindingCard(repo, res); }
          } catch (e) {
            console.warn('Repo ignoré (erreur):', repo.path, e); done++;
          }
          tick(repo.path);
        }
      }
      await Promise.all(Array.from({ length: CONC }, () => worker()));
      saveHistState(histState); // flush final (reprise complète au prochain run)

      show('scanSection', false);
      const extra = `· ${fmt(commitsProcessed)} commits · ${fmt(apiCalls)} appels API · ${fmt(throttles)} throttles · ${fmtDur((Date.now() - runStart) / 1000)}`;
      finishScan(done, total, totalFindings, reposAffected, extra);
    } catch (e) {
      console.error('Scan historique interrompu:', e);
      show('enumSection', false); show('scanSection', false);
      finishScan(done, total, totalFindings, reposAffected, '· run interrompu');
      showToast('Erreur pendant le scan — résultats partiels affichés.', 'error');
    } finally {
      running = false;
    }
  }

  async function runSupply() {
    if (running) return;
    running = true; aborted = false; results = []; liveCount = 0;

    show('resultsSection', false);
    show('scanSection', false);
    show('histStats', false);
    document.getElementById('findingsGrid').innerHTML = '';
    show('enumSection', true);
    const enumCount = document.getElementById('enumCount');

    let done = 0, total = 0, totalFindings = 0, reposAffected = 0;
    try {
      const repos = await listAccessibleRepos(n => { enumCount.textContent = `${fmt(n)} repos accessibles…`; });
      show('enumSection', false);
      if (aborted) { showToast('Interrompu.', 'info'); return; }
      if (!repos.length) {
        document.getElementById('findingsGrid').innerHTML =
          `<div class="state-box"><div class="icon">⚠️</div><h3>Aucun repo accessible</h3></div>`;
        show('resultsSection', true); return;
      }

      show('scanSection', true);
      total = repos.length;
      let idx = 0;
      const CONC = 3;
      const setProg = (label) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressText').textContent = `${fmt(done)} / ${fmt(total)} repos · supply-chain`;
        document.getElementById('progressSub').textContent = label || '';
        document.getElementById('liveStat').textContent = `📦 ${fmt(totalFindings)} alerte(s) · ${fmt(reposAffected)} repo(s)`;
      };
      setProg('Démarrage…');

      async function worker() {
        while (idx < repos.length && !aborted) {
          const repo = repos[idx++];
          try {
            setProg(repo.path);
            const res = await scanSupplyChain(repo, (d, t) => setProg(`${repo.path} (${d}/${t} fichiers)`));
            done++;
            results.push({ repo, res });
            if (res.findings.length) { reposAffected++; totalFindings += res.findings.length; appendFindingCard(repo, res); }
          } catch (e) {
            console.warn('Repo ignoré (erreur):', repo.path, e); done++;
          }
          setProg(repo.path);
        }
      }
      await Promise.all(Array.from({ length: CONC }, () => worker()));

      show('scanSection', false);
      finishScan(done, total, totalFindings, reposAffected);
    } catch (e) {
      console.error('Scan supply-chain interrompu:', e);
      show('enumSection', false); show('scanSection', false);
      finishScan(done, total, totalFindings, reposAffected);
      showToast('Erreur pendant le scan — résultats partiels affichés.', 'error');
    } finally {
      running = false;
    }
  }

  function setMode(m) {
    mode = m;
    document.getElementById('btnSurface').classList.toggle('active', m === 'surface');
    document.getElementById('btnHistory').classList.toggle('active', m === 'history');
    const bs = document.getElementById('btnSupply'); if (bs) bs.classList.toggle('active', m === 'supply');
    show('histControls', m === 'history');
    show('supplyControls', m === 'supply');
  }

  function startScan() {
    if (running) { showToast('Un scan est déjà en cours.', 'info'); return; }
    if (mode === 'history') {
      const v = parseInt(document.getElementById('histCount').value, 10);
      runHistory(Number.isFinite(v) && v > 0 ? v : null); // vide / 0 → tous les repos
    } else if (mode === 'supply') {
      runSupply();
    } else {
      run();
    }
  }

  let currentTypeFilter = null;
  let liveCount = 0;
  const RENDER_CAP = 400; // au-delà : on garde tout en mémoire/Excel, mais on n'inonde pas le DOM

  function cardHTML(repo, findings, scanned) {
    const id = 'r' + repo.id;
    const branch = repo.defaultBranch && repo.defaultBranch !== 'HEAD' ? repo.defaultBranch : 'HEAD';
    const isSupply = findings.some(f => f.kind === 'supply');
    const isHist = findings.some(f => f.commit);
    const rows = findings.map(f => {
      const encFile = f.file.split('/').map(encodeURIComponent).join('/');
      const ref = f.commit ? f.commit : branch;
      const link = repo.url ? `${repo.url}/-/blob/${encodeURIComponent(ref)}/${encFile}${f.line ? '#L' + f.line : ''}` : '';
      const loc = f.line ? `<span class="f-line">:${f.line}</span>` : '';
      const commitChip = f.commit ? `<span class="commit-tag">@${escH(f.commit)}</span>` : '';
      const fileInner = `${escH(f.file)}${loc}`;
      const fileCell = link
        ? `<a href="${link}" target="_blank" rel="noopener" class="f-file">${fileInner}</a>`
        : `<span class="f-file">${fileInner}</span>`;
      const icon = f.severity === 'orange' ? '🟠' : (f.kind === 'supply' ? '🔴' : '🔑');
      const valClass = f.severity === 'orange' ? 'val-warn' : 'val-ko';
      const chip = f.tag ? f.tag : ('CIS ' + f.cis);
      return `<div class="diag-row"><span class="icon">${icon}</span><span class="label">${fileCell}${commitChip}</span><span class="${valClass}">${escH(f.type)}</span><span class="cis-tag">${escH(chip)}</span><code class="f-prev">${escH(f.preview)}</code></div>`;
    }).join('');
    const headIcon = isSupply ? '📦' : '🔑';
    const noun = isSupply ? 'alerte(s)' : 'secret(s)';
    const secTitle = isSupply ? '📦 Alertes supply-chain' : '🔑 Secrets détectés';
    const note = isSupply
      ? `⚠️ <strong>À corriger :</strong> épingler les versions (exactes ou par digest), retirer/auditer les hooks d'install non vérifiés, pinner les images CI/Docker (tag ou <code>@sha256</code>), bannir <code>curl|bash</code>.`
      : `⚠️ <strong>Action immédiate :</strong> (1) roter chaque secret côté service, (2) retirer du fichier, (3) purger l'historique Git (<code>git filter-repo</code>).`;
    return `<div class="repo-card critical">
      <div class="repo-header" onclick="toggleCard('${id}')">
        <div class="repo-icon">${headIcon}</div>
        <div class="repo-meta"><div class="repo-name">${escH(repo.name)}</div><div class="repo-path">${escH(repo.path)}</div></div>
        <div class="repo-checks"><span class="check-pill check-ko">${findings.length} ${noun}</span><span class="check-pill">${scanned} ${isHist ? 'commits' : 'fichier(s)'}</span></div>
        <span class="chevron">▾</span>
      </div>
      <div class="diagnostic" id="${id}">
        <div class="diag-section">
          <div class="diag-section-header red"><span>${secTitle}</span><span style="font-size:11px;opacity:0.7;">${findings.length} occurrence(s)</span></div>
          <div class="diag-body">${rows}
            <div class="diag-note">${note}</div>
          </div>
        </div>
      </div></div>`;
  }

  // Rendu live pendant le scan (ajout au fil de l'eau, plafonné)
  function appendFindingCard(repo, res) {
    if (liveCount >= RENDER_CAP) return;
    document.getElementById('findingsGrid').insertAdjacentHTML('beforeend', cardHTML(repo, res.findings, res.scanned));
    liveCount++;
  }

  // Rendu filtré (depuis les pastilles de catégorie). type=null → tout. Plafonné pour rester fluide.
  function renderFindings(type) {
    const grid = document.getElementById('findingsGrid');
    let html = '', shown = 0, matched = 0;
    for (const { repo, res } of affected()) {
      const fs = type ? res.findings.filter(f => f.type === type) : res.findings;
      if (!fs.length) continue;
      matched++;
      if (shown < RENDER_CAP) { html += cardHTML(repo, fs, res.scanned); shown++; }
    }
    if (matched > RENDER_CAP) {
      html += `<div class="state-box" style="padding:22px;"><p>Affichage limité à ${fmt(RENDER_CAP)} repos sur ${fmt(matched)}. Utilise <strong>📊 Export Excel</strong> pour la liste complète, ou filtre par catégorie.</p></div>`;
    }
    grid.innerHTML = matched ? html
      : `<div class="state-box"><div class="icon">🔎</div><h3>Aucun repo pour ce filtre</h3></div>`;
  }

  function filterByType(t) {
    t = t || null;
    currentTypeFilter = (t === currentTypeFilter) ? null : t;
    document.querySelectorAll('#summaryBar .type-pill').forEach(p => {
      p.classList.toggle('active', (p.dataset.type || '') === (currentTypeFilter || ''));
    });
    renderFindings(currentTypeFilter);
    document.getElementById('findingsGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function finishScan(done, total, totalFindings, reposAffected, extraSub) {
    const isSupply = mode === 'supply';
    // Accumulation pour le rapport : on ajoute les findings du scan courant
    // dans la Map de la famille (secrets/supply), dédoublonnés par clé stricte.
    const target = isSupply ? reportSupply : reportSecrets;
    if (isSupply) scannedSupply = true; else scannedSecrets = true;
    for (const { repo, res } of results) {
      const ns = repo.path.split('/').slice(0, -1).join('/') || '—';
      const branch = repo.defaultBranch && repo.defaultBranch !== 'HEAD' ? repo.defaultBranch : 'HEAD';
      for (const f of res.findings) {
        // Clé stricte : un seul champ qui diffère = finding distinct (rien n'est caché à tort).
        const key = [repo.path, f.file, f.line || '', f.type, f.preview].join('|');
        if (target.has(key)) continue; // vrai doublon (ex. vu en Surface ET Historique) : on garde 1 fois
        const ref = f.commit ? f.commit : branch;
        const link = repo.url ? `${repo.url}/-/blob/${encodeURIComponent(ref)}/${f.file.split('/').map(encodeURIComponent).join('/')}${f.line ? '#L' + f.line : ''}` : '';
        target.set(key, { Repo: repo.path, Namespace: ns, Fichier: f.file, Ligne: f.line || '', Type: f.type, 'Catégorie': f.tag || ('CIS ' + f.cis), 'Aperçu': f.preview, Lien: link });
      }
    }
    const noun = isSupply ? 'alertes' : 'secrets';
    const title = isSupply ? 'Scan supply-chain' : (mode === 'history' ? 'Scan secrets (historique)' : 'Scan secrets');
    const byType = {};
    for (const { res } of results) for (const f of res.findings) byType[f.type] = (byType[f.type] || 0) + 1;
    const types = Object.keys(byType).sort((a, b) => byType[b] - byType[a]);
    const bar = document.getElementById('summaryBar');
    const partial = aborted ? ' (partiel)' : '';
    const circleColor = totalFindings === 0 ? 'var(--ok)' : 'var(--err)';
    bar.style.display = 'grid';
    bar.innerHTML = `
      <div class="score-circle" style="background:radial-gradient(circle at 30% 30%, ${circleColor}, rgba(0,0,0,0.2));"><div class="num">${fmt(totalFindings)}</div><div class="denom">${noun}</div></div>
      <div class="score-info">
        <div class="score-title">${title}${partial}</div>
        <div class="score-sub">${fmt(done)} / ${fmt(total)} repos scannés · ${fmt(reposAffected)} repo(s) touché(s) ${extraSub || ''}</div>
        <div class="type-pills">${types.length
          ? `<span class="type-pill all active" data-type="" onclick="filterByType('')">Tous <b>${fmt(totalFindings)}</b></span>` + types.map(t => `<span class="type-pill" data-type="${escH(t)}" onclick="filterByType('${String(t).replace(/'/g, "\\'")}')">${escH(t)} <b>${byType[t]}</b></span>`).join('')
          : `<span class="type-pill green">Aucune alerte ✅</span>`}</div>
      </div>`;
    currentTypeFilter = null;
    document.getElementById('exportRow').style.display = totalFindings ? 'flex' : 'none';
    if (!totalFindings) document.getElementById('findingsGrid').innerHTML =
      `<div class="state-box"><div class="icon">✅</div><h3>Aucune ${isSupply ? 'alerte' : 'fuite'} détectée</h3><p>${fmt(done)} repos scannés, ${fmt(results.reduce((s, r) => s + r.res.scanned, 0))} fichiers inspectés.</p></div>`;
    else renderFindings(null);
    show('resultsSection', true);
    renderCharts(byType, totalFindings, reposAffected, done);
    showToast(totalFindings === 0 ? `✅ Rien sur ${fmt(done)} repo(s)` : `⚠️ ${fmt(totalFindings)} ${noun} dans ${fmt(reposAffected)} repo(s)`, totalFindings === 0 ? 'success' : 'error');
  }

  // ══════════════════════════════════════════════════════════════════════
  // GRAPHIQUES (Chart.js, CDN) — Top repos · par type (cliquable) · couverture
  // ══════════════════════════════════════════════════════════════════════
  let _charts = [];
  const CHART_PALETTE = ['#7c5cff', '#2dd4bf', '#fb923c', '#f472b6', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#c084fc', '#fb7185', '#22d3ee', '#a3e635', '#f59e0b', '#e879f9', '#4ade80'];

  function renderCharts(byType, totalFindings, reposAffected, reposScanned) {
    const panel = document.getElementById('chartsPanel');
    if (typeof Chart === 'undefined' || !totalFindings) { if (panel) panel.style.display = 'none'; return; }
    panel.style.display = 'grid';
    _charts.forEach(c => { try { c.destroy(); } catch {} });
    _charts = [];

    Chart.defaults.color = '#b8aed8';
    Chart.defaults.font.family = "'Manrope',sans-serif";
    Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';

    const shortPath = p => { const parts = String(p).split('/'); return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p; };

    // 1) Top 15 repos (barres horizontales)
    const top = affected().map(r => ({ path: r.repo.path, n: r.res.findings.length }))
      .sort((a, b) => b.n - a.n).slice(0, 15);
    _charts.push(new Chart(document.getElementById('chartTopRepos'), {
      type: 'bar',
      data: { labels: top.map(t => shortPath(t.path)), datasets: [{ data: top.map(t => t.n), backgroundColor: 'rgba(248,113,113,0.7)', borderColor: '#f87171', borderWidth: 1, borderRadius: 6 }] },
      options: {
        indexAxis: 'y', maintainAspectRatio: false, responsive: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => top[items[0].dataIndex].path } } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { ticks: { font: { size: 11 } } } }
      }
    }));

    // 2) Répartition par type (donut cliquable → filtre)
    const types = Object.keys(byType).sort((a, b) => byType[b] - byType[a]);
    const typesChart = new Chart(document.getElementById('chartTypes'), {
      type: 'doughnut',
      data: { labels: types, datasets: [{ data: types.map(t => byType[t]), backgroundColor: types.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]), borderColor: 'rgba(15,10,31,0.6)', borderWidth: 2 }] },
      options: {
        maintainAspectRatio: false, responsive: true, cutout: '60%',
        plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } },
        onClick: (e, els) => { if (els.length) filterByType(types[els[0].index]); }
      }
    });
    _charts.push(typesChart);

    // 3) Couverture : touchés vs propres, total au centre
    const clean = Math.max(0, reposScanned - reposAffected);
    _charts.push(new Chart(document.getElementById('chartCoverage'), {
      type: 'doughnut',
      data: { labels: ['Repos touchés', 'Repos propres'], datasets: [{ data: [reposAffected, clean], backgroundColor: ['#f87171', '#34d399'], borderColor: 'rgba(15,10,31,0.6)', borderWidth: 2 }] },
      options: { maintainAspectRatio: false, responsive: true, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } },
      plugins: [{
        id: 'centerTotal',
        afterDraw(chart) {
          const { ctx, chartArea: { left, right, top, bottom } } = chart;
          const x = (left + right) / 2, y = (top + bottom) / 2;
          ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#f5f1ff'; ctx.font = "800 26px 'Bricolage Grotesque',sans-serif";
          ctx.fillText(fmt(totalFindings), x, y - 8);
          ctx.fillStyle = '#b8aed8'; ctx.font = "600 11px 'Manrope',sans-serif";
          ctx.fillText('secrets', x, y + 14);
          ctx.restore();
        }
      }]
    }));
  }

  // ── Exports (preview censurée uniquement) ──
  const affected = () => results.filter(r => r.res.findings.length > 0);
  function exportJson() {
    const payload = {
      generatedAt: new Date().toISOString(), gitlabUrl: GITLAB_URL,
      reposScanned: results.length, reposAffected: affected().length,
      totalFindings: results.reduce((s, r) => s + r.res.findings.length, 0),
      repos: affected().map(({ repo, res }) => ({ id: repo.id, name: repo.name, path: repo.path, url: repo.url, scanned: res.scanned, findings: res.findings }))
    };
    download('scan-secrets.json', JSON.stringify(payload, null, 2), 'application/json');
  }
  function exportExcel() {
    if (typeof XLSX === 'undefined') { showToast('Librairie Excel non chargée (vérifie ta connexion).', 'error'); return; }
    const rows = [];
    for (const { repo, res } of affected()) {
      const ns = repo.path.split('/').slice(0, -1).join('/') || '—';
      const branch = repo.defaultBranch && repo.defaultBranch !== 'HEAD' ? repo.defaultBranch : 'HEAD';
      for (const f of res.findings) {
        const ref = f.commit ? f.commit : branch;
        const link = repo.url ? `${repo.url}/-/blob/${encodeURIComponent(ref)}/${f.file.split('/').map(encodeURIComponent).join('/')}${f.line ? '#L' + f.line : ''}` : '';
        rows.push({ Repo: repo.path, Namespace: ns, Fichier: f.file, Ligne: f.line || '', Commit: f.commit || '', Type: f.type, 'Catégorie': f.tag || ('CIS ' + f.cis), 'Aperçu': f.preview, Lien: link });
      }
    }
    if (!rows.length) { showToast('Rien à exporter ✅', 'success'); return; }

    const header = ['Repo', 'Namespace', 'Fichier', 'Ligne', 'Commit', 'Type', 'Catégorie', 'Aperçu', 'Lien'];
    const ws = XLSX.utils.json_to_sheet(rows, { header });
    ws['!cols'] = [{ wch: 42 }, { wch: 28 }, { wch: 46 }, { wch: 7 }, { wch: 11 }, { wch: 24 }, { wch: 14 }, { wch: 22 }, { wch: 60 }];
    ws['!autofilter'] = { ref: ws['!ref'] };
    // Liens GitLab cliquables (colonne I = 9e)
    rows.forEach((r, i) => { if (r.Lien) { const cell = ws['I' + (i + 2)]; if (cell) cell.l = { Target: r.Lien, Tooltip: 'Ouvrir dans GitLab' }; } });

    const fileBase = mode === 'supply' ? 'scan-supply-chain' : 'scan-secrets';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, mode === 'supply' ? 'Supply-chain' : 'Secrets');
    XLSX.writeFile(wb, fileBase + '.xlsx');
  }

  function exportMarkdown() {
    const aff = affected();
    const total = results.reduce((s, r) => s + r.res.findings.length, 0);
    const isSupply = mode === 'supply';
    const title = isSupply ? 'Scan supply-chain' : 'Scan secrets';
    const noteLine = isSupply ? '' : '> Valeurs censurées (préfixe + `***`). Aucune valeur complète exportée.\n\n';
    let md = `# ${title} — DevOps Hub\n\n- Date : ${new Date().toLocaleString('fr-FR')}\n- GitLab : ${GITLAB_URL}\n- Repos scannés : ${results.length}\n- Repos touchés : ${aff.length}\n- ${isSupply ? 'Alertes' : 'Secrets'} : ${total}\n\n${noteLine}`;
    if (!aff.length) md += `✅ Rien détecté.\n`;
    for (const { repo, res } of aff) {
      md += `## ${repo.path}\n\n${repo.url}\n\n| Fichier | Ligne | Commit | Type | Catégorie | Aperçu |\n|---|---|---|---|---|---|\n`;
      for (const f of res.findings) md += `| \`${f.file}\` | ${f.line || ''} | ${f.commit || ''} | ${f.type} | ${f.tag || ('CIS ' + f.cis)} | \`${f.preview}\` |\n`;
      md += `\n`;
    }
    download(isSupply ? 'scan-supply-chain.md' : 'scan-secrets.md', md, 'text/markdown');
  }

  // ── Rapport HTML (format identique à l'exemple validé) ──────────────
  // 1b : génère le rapport du mode courant ; si les deux familles de scans
  // ont été faites, génère le rapport global (sections Secrets + Supply-chain).
  function severityForType(t) {
    // Rouge = exécution de code / secret ; orange = version non figée.
    const red = ['Basic Auth in URL', 'GitLab PAT', 'GitHub PAT (classic)', 'GitHub PAT (fine-grained)',
      'AWS Access Key', 'Slack Token', 'Stripe Secret Key', 'Stripe Restricted Key', 'Google API Key',
      'SendGrid API Key', 'Private Key (PEM)', 'JWT Token', 'DB Connection String',
      'Script preinstall', 'Script install', 'Script postinstall',
      'Exécution distante (pipe shell)', 'Registry HTTP (non chiffré)'];
    return red.includes(t) ? 'red' : 'orange';
  }

  function exportReport() {
    // Lit les accumulateurs (cumul Surface+Historique côté secrets, dédoublonnés).
    const secRows = Array.from(reportSecrets.values());
    const supRows = Array.from(reportSupply.values());

    if (!scannedSecrets && !scannedSupply) { showToast('Lance un scan avant de générer un rapport.', 'error'); return; }

    const sev = {};
    [...secRows, ...supRows].forEach(r => { sev[r.Type] = severityForType(r.Type); });

    const html = renderReportHTML({ secRows, supRows, hasSec: scannedSecrets, hasSup: scannedSupply, sev });
    const isGlobal = scannedSecrets && scannedSupply;
    const name = isGlobal ? 'rapport-securite-global.html' : (scannedSupply ? 'rapport-supply-chain.html' : 'rapport-secrets.html');
    download(name, html, 'text/html');
    showToast('📑 Rapport généré ✅', 'success');
  }

  function renderReportHTML(d) {
    const esc = (s) => { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    const nbRepos = (rows) => new Set(rows.map(r => r.Repo)).size;
    const countBy = (rows, key) => { const m = {}; rows.forEach(r => { const k = r[key]; m[k] = (m[k] || 0) + 1; }); return m; };
    const sevOf = (t) => d.sev[t] || severityForType(t);

    // Agrégats secrets
    const secByType = countBy(d.secRows, 'Type');
    // Agrégats supply
    const supByType = countBy(d.supRows, 'Type');
    const supEco = countBy(d.supRows, 'Catégorie');
    const supRed = d.supRows.filter(r => sevOf(r.Type) === 'red').length;
    const supOrange = d.supRows.length - supRed;
    const nsCount = {}; d.supRows.forEach(r => { nsCount[r.Namespace] = (nsCount[r.Namespace] || 0) + 1; });
    const topNs = Object.entries(nsCount).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Barres répartition
    const bars = (byType) => {
      const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
      if (!entries.length) return '<div class="empty">Aucune donnée</div>';
      const mx = entries[0][1];
      return entries.map(([t, v]) => {
        const s = sevOf(t);
        return `<div class="bar-row"><div class="bar-label">${esc(t)}</div><div class="bar-track"><div class="bar-fill ${s}" style="width:${Math.round(v / mx * 100)}%"></div></div><div class="bar-val">${v}</div></div>`;
      }).join('');
    };

    // Donut écosystèmes
    const ecoColors = { ci: '#fb923c', npm: '#7c5cff', docker: '#2dd4bf', maven: '#f472b6', gradle: '#60a5fa', pip: '#fbbf24' };
    const ecoEntries = Object.entries(supEco).sort((a, b) => b[1] - a[1]);
    const ecoTot = ecoEntries.reduce((s, e) => s + e[1], 0) || 1;
    let acc = 0; const segs = []; const legend = [];
    ecoEntries.forEach(([k, v]) => {
      const c = ecoColors[k] || '#888'; const a0 = acc / ecoTot * 360; acc += v; const a1 = acc / ecoTot * 360;
      segs.push(`${c} ${a0.toFixed(1)}deg ${a1.toFixed(1)}deg`);
      legend.push(`<div class="lg"><span class="dot" style="background:${c}"></span>${esc(k)} <b>${v}</b></div>`);
    });
    const donutStyle = segs.length ? `background:conic-gradient(${segs.join(',')});` : 'background:var(--ov-08);';

    // Top namespaces
    const nsBars = topNs.length ? topNs.map(([k, v]) => {
      const mx = topNs[0][1];
      return `<div class="bar-row"><div class="bar-label ns">${esc(k)}</div><div class="bar-track"><div class="bar-fill orange" style="width:${Math.round(v / mx * 100)}%"></div></div><div class="bar-val">${v}</div></div>`;
    }).join('') : '<div class="empty">Aucune donnée</div>';

    const dataJson = JSON.stringify({ sec: d.secRows, sup: d.supRows, sev: d.sev });
    const dateStr = new Date().toLocaleString('fr-FR');

    // Sections conditionnelles
    const secSection = d.hasSec ? `
  <div class="section">
    <div class="section-h">🔑 Secrets exposés <span class="pill">${d.secRows.length} trouvés · ${nbRepos(d.secRows)} repos</span></div>
    <div class="grid2">
      <div class="card"><div class="card-t">Répartition par type</div>${bars(secByType)}</div>
      <div class="card"><div class="card-t">Pourquoi c'est critique</div>
        <p style="color:var(--ts);font-size:13px;line-height:1.7">Chaque secret exposé est une <b style="color:var(--tp)">clé d'entrée directe</b>. Un secret commité reste dans l'historique Git même après suppression : il doit être considéré comme <b style="color:#fca5a5">compromis</b>.</p>
        <p style="color:var(--ts);font-size:13px;line-height:1.7;margin-top:12px">Action : <b style="color:var(--tp)">(1)</b> révoquer côté service, <b style="color:var(--tp)">(2)</b> remplacer par une variable protégée, <b style="color:var(--tp)">(3)</b> purger l'historique.</p>
      </div>
    </div>
  </div>
  <div class="section">
    <div class="tbl-controls"><input id="secSearch" placeholder="🔍 Filtrer les secrets (repo, fichier, type…)"></div>
    <div class="tbl-wrap"><table id="secTable"><thead><tr><th>Risque</th><th>Repo</th><th>Fichier</th><th>Type</th><th>Aperçu</th><th>CIS</th></tr></thead><tbody></tbody></table></div>
  </div>` : '';

    const supSection = d.hasSup ? `
  <div class="section">
    <div class="section-h">📦 Supply-chain <span class="pill">${d.supRows.length} alertes · ${nbRepos(d.supRows)} repos</span></div>
    <div class="kpis" style="grid-template-columns:repeat(2,1fr);margin-bottom:18px">
      <div class="kpi red"><div class="n">${supRed}</div><div class="l">🔴 Exécution de code</div></div>
      <div class="kpi orange"><div class="n">${supOrange}</div><div class="l">🟠 Version non figée</div></div>
    </div>
    <div class="grid2">
      <div class="card"><div class="card-t">Répartition par type d'alerte</div>${bars(supByType)}</div>
      <div class="card"><div class="card-t">Par écosystème</div>
        <div class="donut-wrap">
          <div class="donut" style="${donutStyle}"><div class="donut-c"><div class="n">${d.supRows.length}</div><div class="l">alertes</div></div></div>
          <div class="legend">${legend.join('')}</div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:18px"><div class="card-t">Top 10 des namespaces les plus touchés</div>${nsBars}</div>
  </div>
  <div class="section">
    <div class="tbl-controls">
      <input id="supSearch" placeholder="🔍 Filtrer (repo, fichier, type…)">
      <select id="supSev"><option value="">Tous les risques</option><option value="red">🔴 Exécution</option><option value="orange">🟠 Version non figée</option></select>
      <select id="supEco"><option value="">Tous écosystèmes</option><option value="ci">CI</option><option value="npm">npm</option><option value="docker">docker</option><option value="maven">maven</option></select>
    </div>
    <div class="tbl-wrap"><table id="supTable"><thead><tr><th>Risque</th><th>Repo</th><th>Fichier</th><th>Type</th><th>Éco</th><th>Aperçu</th></tr></thead><tbody></tbody></table></div>
  </div>` : '';

    const kpis = `
  <div class="kpis">
    <div class="kpi red"><div class="n">${d.secRows.length}</div><div class="l">🔑 Secrets exposés</div></div>
    <div class="kpi violet"><div class="n">${nbRepos(d.secRows)}</div><div class="l">Repos touchés (secrets)</div></div>
    <div class="kpi orange"><div class="n">${d.supRows.length}</div><div class="l">📦 Alertes supply-chain</div></div>
    <div class="kpi cyan"><div class="n">${nbRepos(d.supRows)}</div><div class="l">Repos touchés (supply)</div></div>
  </div>`;

    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rapport Sécurité — DevOps Hub</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;700;800&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:var(--bg-deep);--bg2:var(--bg-mid);--card:var(--card-6);--bd:var(--ov-08);--bd2:var(--ov-18);
--tp:#f5f1ff;--ts:#b8aed8;--tm:#7a6fa3;--measure:#7c5cff;--inspect:#fb923c;--deliver:#2dd4bf;--collab:#f472b6;
--red:#f87171;--orange:#fb923c;--ok:#34d399;--fd:'Bricolage Grotesque',sans-serif;--fb:'Manrope',sans-serif;--fm:'JetBrains Mono',monospace}
body{font-family:var(--fb);background:var(--bg);color:var(--tp);min-height:100vh;padding:28px;
background-image:radial-gradient(ellipse 700px 500px at 12% 5%,rgba(251,146,60,.13),transparent 60%),radial-gradient(ellipse 600px 400px at 88% 15%,rgba(124,92,255,.11),transparent 60%)}
.wrap{max-width:1240px;margin:0 auto}
.head{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;margin-bottom:8px}
.head h1{font-family:var(--fd);font-size:32px;font-weight:800;letter-spacing:-.02em;display:flex;align-items:center;gap:12px}
.head .sub{color:var(--ts);font-size:14px;margin-top:4px}
.head .meta{color:var(--tm);font-size:13px;font-family:var(--fm);text-align:right}
.divider{height:1px;background:linear-gradient(90deg,var(--inspect),transparent);margin:18px 0 28px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:30px}
.kpi{background:var(--card);backdrop-filter:blur(20px);border:1px solid var(--bd);border-radius:18px;padding:22px}
.kpi .n{font-family:var(--fd);font-size:42px;font-weight:800;line-height:1;letter-spacing:-.03em}
.kpi .l{color:var(--tm);font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-top:8px}
.kpi.red .n{color:var(--red)}.kpi.orange .n{color:var(--orange)}.kpi.violet .n{color:var(--measure)}.kpi.cyan .n{color:var(--deliver)}
.section{margin-bottom:34px}
.section-h{font-family:var(--fd);font-size:20px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:10px}
.section-h .pill{font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;background:rgba(251,146,60,.18);color:#fdba74;border:1px solid rgba(251,146,60,.3)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.card{background:var(--card);backdrop-filter:blur(20px);border:1px solid var(--bd);border-radius:18px;padding:22px}
.card-t{font-size:14px;font-weight:600;color:var(--ts);margin-bottom:18px;text-transform:uppercase;letter-spacing:.04em}
.bar-row{display:grid;grid-template-columns:1fr 130px 36px;align-items:center;gap:12px;margin-bottom:11px}
.bar-label{font-size:13px;color:var(--tp);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-label.ns{font-family:var(--fm);font-size:11px;color:var(--ts)}
.bar-track{height:8px;background:var(--ov-06);border-radius:99px;overflow:hidden}
.bar-fill{height:100%;border-radius:99px}
.bar-fill.red{background:linear-gradient(90deg,#f87171,#ef4444)}
.bar-fill.orange{background:linear-gradient(90deg,#fb923c,#f59e0b)}
.bar-val{font-family:var(--fd);font-weight:700;font-size:15px;text-align:right}
.donut-wrap{display:flex;align-items:center;gap:28px;flex-wrap:wrap}
.donut{width:140px;height:140px;border-radius:50%;flex-shrink:0;position:relative}
.donut::after{content:'';position:absolute;inset:26px;border-radius:50%;background:var(--bg2)}
.donut-c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2}
.donut-c .n{font-family:var(--fd);font-size:26px;font-weight:800}.donut-c .l{font-size:10px;color:var(--tm);text-transform:uppercase}
.legend{display:flex;flex-direction:column;gap:8px}
.lg{font-size:13px;color:var(--ts);display:flex;align-items:center;gap:8px}.lg b{color:var(--tp);font-family:var(--fm)}
.dot{width:11px;height:11px;border-radius:3px;display:inline-block}
.tbl-controls{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.tbl-controls input,.tbl-controls select{padding:9px 13px;border-radius:10px;background:var(--ov-06);border:1px solid var(--bd2);color:var(--tp);font-family:var(--fb);font-size:13px}
.tbl-controls input{flex:1;min-width:200px}
.tbl-controls input::placeholder{color:var(--tm)}
.tbl-wrap{background:var(--card);border:1px solid var(--bd);border-radius:16px;overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:13px 14px;color:var(--tm);font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--bd2);background:rgba(0,0,0,.15)}
td{padding:11px 14px;border-bottom:1px solid var(--bd);color:var(--ts);vertical-align:top}
tr:hover td{background:rgba(124,92,255,.05)}
.t-repo{color:var(--tp);font-weight:500;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.t-file{font-family:var(--fm);font-size:11px;color:var(--ts)}
.t-prev{font-family:var(--fm);font-size:11px;background:rgba(0,0,0,.3);padding:2px 7px;border-radius:5px;color:#fcd34d;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block}
.sev-tag{font-size:11px;font-weight:600;padding:2px 9px;border-radius:6px;white-space:nowrap}
.sev-tag.red{background:rgba(248,113,113,.2);color:#fca5a5}
.sev-tag.orange{background:rgba(251,146,60,.2);color:#fdba74}
.t-link{color:var(--inspect);text-decoration:none}.t-link:hover{text-decoration:underline}
.foot{text-align:center;color:var(--tm);font-size:12px;margin-top:30px;padding-top:20px;border-top:1px solid var(--bd)}
.empty{color:var(--tm);font-style:italic;padding:20px;text-align:center}
@media(max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.grid2{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
  <div class="head">
    <div><h1>🛡️ Rapport Sécurité</h1><div class="sub">Secrets exposés &amp; risques supply-chain — scan de tous les repos accessibles</div></div>
    <div class="meta">DevOps Hub · Inspecter &amp; Sécuriser<br>Généré le ${dateStr}</div>
  </div>
  <div class="divider"></div>
${kpis}
${secSection}
${supSection}
  <div class="foot">Rapport généré par DevOps Hub · Secrets Scanner · Valeurs sensibles censurées (aucune valeur complète exposée)</div>
</div>
<script>
const D = ${dataJson};
function tag(s){return '<span class="sev-tag '+s+'">'+(s==='red'?'🔴':'🟠')+'</span>'}
function link(r,txt,cls){return r.Lien?'<a class="'+cls+' t-link" href="'+r.Lien+'" target="_blank" rel="noopener">'+txt+'</a>':'<span class="'+cls+'">'+txt+'</span>'}
function renderSec(f){
  var tb=document.querySelector('#secTable tbody'); if(!tb)return; f=(f||'').toLowerCase();
  tb.innerHTML=D.sec.filter(function(r){return !f||(r.Repo+r.Fichier+r.Type+r['Aperçu']).toLowerCase().indexOf(f)>=0;}).map(function(r){
    var s=D.sev[r.Type]||'red';
    return '<tr><td>'+tag(s)+'</td><td class="t-repo" title="'+r.Repo+'">'+r.Repo+'</td><td>'+link(r,r.Fichier+':'+r.Ligne,'t-file')+'</td><td>'+r.Type+'</td><td><span class="t-prev">'+r['Aperçu']+'</span></td><td style="font-family:var(--fm);font-size:11px;color:var(--tm)">'+r['Catégorie']+'</td></tr>';
  }).join('')||'<tr><td colspan="6" class="empty">Aucun résultat</td></tr>';
}
function renderSup(){
  var si=document.getElementById('supSearch'); if(!si)return;
  var f=si.value.toLowerCase(), sv=document.getElementById('supSev').value, ec=document.getElementById('supEco').value;
  var tb=document.querySelector('#supTable tbody');
  tb.innerHTML=D.sup.filter(function(r){
    var s=D.sev[r.Type]||'orange';
    if(sv&&s!==sv)return false; if(ec&&r['Catégorie']!==ec)return false;
    if(f&&(r.Repo+r.Fichier+r.Type+r['Aperçu']).toLowerCase().indexOf(f)<0)return false; return true;
  }).map(function(r){var s=D.sev[r.Type]||'orange';
    return '<tr><td>'+tag(s)+'</td><td class="t-repo" title="'+r.Repo+'">'+r.Repo+'</td><td>'+link(r,r.Fichier+':'+r.Ligne,'t-file')+'</td><td>'+r.Type+'</td><td style="font-family:var(--fm);font-size:11px;color:var(--ts)">'+r['Catégorie']+'</td><td><span class="t-prev">'+r['Aperçu']+'</span></td></tr>';
  }).join('')||'<tr><td colspan="6" class="empty">Aucun résultat</td></tr>';
}
var _ss=document.getElementById('secSearch'); if(_ss){_ss.addEventListener('input',function(e){renderSec(e.target.value);}); renderSec('');}
['supSearch','supSev','supEco'].forEach(function(id){var el=document.getElementById(id); if(el)el.addEventListener('input',renderSup);});
if(document.getElementById('supTable')) renderSup();
</script>
</body></html>`;
  }

  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ── Helpers ──
  function show(id, on) { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; }
  function toggleCard(id) { const c = document.getElementById(id)?.closest('.repo-card'); if (c) c.classList.toggle('expanded'); }
  function fmt(n) { return new Intl.NumberFormat('fr-FR').format(n); }
  function escH(t) { if (t == null) return ''; const d = document.createElement('div'); d.textContent = String(t); return d.innerHTML; }
  let toastTimer = null;
  function showToast(msg, type = 'info', duration = 4500) {
    const t = document.getElementById('fixToast'); if (!t) return;
    t.textContent = msg; t.className = `fix-toast show ${type}`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), duration);
  }
  function showInfo() { show('infoModal', true); }
  function closeInfo() { show('infoModal', false); }

  window.stopScan = stopScan;
  window.rescan = rescan;
  window.setMode = setMode;
  window.startScan = startScan;
  window.resetHistory = resetHistory;
  window.filterByType = filterByType;
  window.toggleCard = toggleCard;
  window.exportExcel = exportExcel;
  window.exportJson = exportJson;
  window.exportMarkdown = exportMarkdown;
  window.exportReport = exportReport;
  window.showInfo = showInfo;
  window.closeInfo = closeInfo;
})();
