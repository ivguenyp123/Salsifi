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
  const HUB_URL = 'hub-mockup-v2_1.html';

  let aborted = false;
  let running = false;
  let results = [];   // { repo, res }
  let mode = 'surface';

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
  window.showInfo = showInfo;
  window.closeInfo = closeInfo;
})();
