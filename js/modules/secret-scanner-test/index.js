/* secret-scanner-test · index.js — entrée, orchestration & câblage (chargé en dernier). */

'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const raw = localStorage.getItem('devops_hub_workspaces');
    if (!raw) { window.location.href = 'login.html'; return; }
    let g;
    try { g = JSON.parse(raw); } catch { window.location.href = 'login.html'; return; }
    GITLAB_URL = g.gitlabUrl; token = g.token; username = g.username || '';
    if (!token || !GITLAB_URL) { window.location.href = 'login.html'; return; }

    document.querySelectorAll('[data-hub-link]').forEach(a => { var _f = new URLSearchParams(location.search).get('from'); a.href = _f ? HUB_URL + '?chemin=' + encodeURIComponent(_f) : HUB_URL; });
    const pill = document.getElementById('userPill');
    if (pill) pill.textContent = username ? `👤 ${username}` : '🔓 connecté';

    // Pas de scan auto au chargement : on choisit un mode puis on lance.
    // (évite de polluer l'état MR avant un test CIS).
    show('enumSection', false);
    const grid = document.getElementById('findingsGrid');
    if (grid) {
      show('resultsSection', true);
      const bar = document.getElementById('summaryBar'); if (bar) bar.style.display = 'none';
      const exp = document.getElementById('exportRow'); if (exp) exp.style.display = 'none';
      grid.innerHTML = `<div class="state-box"><div class="icon">🧪</div><h3>Banc d'essai — choisis un mode</h3><p>🎯 <b>Blast Radius</b> (nouveau) · 🌊 Surface · 🕳️ Historique · 📦 Supply-chain · 🛡️ CIS — chacun se lance seul, pas de loader global. Le vrai Secret Scanner n'est pas touché.</p></div>`;
    }
    setMode('discover');   // on s'ouvre sur la Découverte : « ai-je un problème ? » sans connaître l'IOC
  });

  // ── Fetch résilient : retry backoff sur 429 / 5xx / erreur réseau, 401 → login ──
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
        try { content = await getFileContent(repo.id, filePath, repo.defaultBranch); } catch { return; }
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
        let content; try { content = await getFileContent(repo.id, p, repo.defaultBranch); } catch { return; }
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
    resetMrPanel();

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
  async function runHistory(maxRepos) {
    if (running) return;
    running = true; aborted = false; results = []; liveCount = 0;
    resetMrPanel();
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
    resetMrPanel();

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
    const bc = document.getElementById('btnCIS'); if (bc) bc.classList.toggle('active', m === 'cis');
    const bb = document.getElementById('btnBlast'); if (bb) bb.classList.toggle('active', m === 'blast');
    const bd = document.getElementById('btnDiscover'); if (bd) bd.classList.toggle('active', m === 'discover');
    show('surfaceControls', m === 'surface');
    show('histControls', m === 'history');
    show('supplyControls', m === 'supply');
    show('cisControls', m === 'cis');
    show('blastControls', m === 'blast');
    show('discoverControls', m === 'discover');
    // Découverte & Blast Radius ont leurs propres zones ; on masque le flux classique.
    show('brSection', m === 'blast');
    show('discSection', m === 'discover');
    if (m === 'blast' || m === 'discover') show('resultsSection', false);
  }

  function startScan() {
    if (running) { showToast('Un scan est déjà en cours.', 'info'); return; }
    if (mode === 'history') {
      const v = parseInt(document.getElementById('histCount').value, 10);
      runHistory(Number.isFinite(v) && v > 0 ? v : null); // vide / 0 → tous les repos
    } else if (mode === 'supply') {
      runSupply();
    } else if (mode === 'cis') {
      runCIS();
    } else if (mode === 'blast') {
      runBlastRadius();
    } else if (mode === 'discover') {
      runDiscover();
    } else {
      run();
    }
  }

  async function scanCIS(repo) {
    const checks = [];
    const add = (id, cis, label, state, detail, fixable = false) => checks.push({ id, cis, label, state, detail, fixable });

    const proj = await fetchGLStatus(`/projects/${repo.id}`);
    const project = proj.data;
    const defaultBranch = (project && project.default_branch) || repo.defaultBranch || 'main';
    const webUrl = (project && project.web_url) || repo.url;
    const visibility = (project && project.visibility) || 'private';

    const treeArr = await getFileTree(repo.id).catch(() => []);
    const tree = Array.isArray(treeArr) ? treeArr : [];
    const has = name => tree.some(f => f === name || f.endsWith('/' + name));
    const find = name => tree.find(f => f === name || f.endsWith('/' + name));

    // 1.1.1 Branch protection (config)
    const br = await fetchGLStatus(`/projects/${repo.id}/protected_branches`);
    if (br.status === 403) add('branch', '1.1.1', 'Branche par défaut protégée', 'unverif', 'Droits insuffisants pour vérifier');
    else if (Array.isArray(br.data)) {
      const p = br.data.find(b => b.name === defaultBranch);
      if (!p) add('branch', '1.1.1', 'Branche par défaut protégée', 'ko', `\`${defaultBranch}\` non protégée`);
      else if (p.allow_force_push) add('branch', '1.1.1', 'Branche par défaut protégée', 'ko', 'Force push autorisé');
      else add('branch', '1.1.1', 'Branche par défaut protégée', 'ok', 'Protégée, force push interdit');
    } else add('branch', '1.1.1', 'Branche par défaut protégée', 'unverif', 'Vérification impossible');

    // 1.1.3/4/5 Approval settings (config)
    const ap = await fetchGLStatus(`/projects/${repo.id}/approvals`);
    if (ap.status === 403) add('approvals', '1.1.4', 'Paramètres d\'approbation', 'unverif', 'Droits insuffisants pour vérifier');
    // Uniquement une vraie réponse 2xx : sur 404 (édition GitLab sans cet endpoint),
    // `ap.data` est l'objet d'erreur {message} — le parser produisait un faux « 0 approbateur ».
    else if (ap.status >= 200 && ap.status < 300 && ap.data) {
      const a = ap.data;
      const req = a.approvals_before_merge ?? 0;
      const flags = [
        a.merge_requests_author_approval === false,
        (a.merge_requests_disable_committers_approval ?? false),
        (a.disable_overriding_approvers_per_merge_request ?? false),
        (a.reset_approvals_on_push ?? false),
      ];
      const okFlags = flags.filter(Boolean).length;
      if (req >= 2 && okFlags === 4) add('approvals', '1.1.4', 'Paramètres d\'approbation', 'ok', `${req} approbateurs requis, 4/4 règles`);
      else add('approvals', '1.1.4', 'Paramètres d\'approbation', 'ko', `${req} approbateur(s) requis, ${okFlags}/4 règles durcies`);
    } else add('approvals', '1.1.4', 'Paramètres d\'approbation', 'na', 'Indisponible (édition GitLab ?)');

    // 1.1.13 Historique linéaire (config)
    if (project && project.merge_method) {
      const ok = ['ff', 'rebase_merge'].includes(project.merge_method);
      add('linear', '1.1.13', 'Historique linéaire', ok ? 'ok' : 'ko', `merge_method = ${project.merge_method}`);
    }

    // 1.1.6 CODEOWNERS (fichier — corrigeable par MR)
    const coPaths = ['CODEOWNERS', '.gitlab/CODEOWNERS', 'docs/CODEOWNERS'];
    const coFound = coPaths.some(p => tree.includes(p));
    add('codeowners', '1.1.6', 'CODEOWNERS présent', coFound ? 'ok' : 'ko', coFound ? 'Présent' : 'Absent', true);

    // 1.2.1 SECURITY.md (fichier — corrigeable par MR)
    const secFound = has('SECURITY.md');
    add('securitymd', '1.2.1', 'SECURITY.md présent', secFound ? 'ok' : 'ko', secFound ? 'Présent' : 'Absent', true);

    // 1.2.7 Repo inactif à archiver (config)
    if (project) {
      if (project.archived) add('inactive', '1.2.7', 'Archivage si inactif', 'ok', 'Archivé');
      else if (project.last_activity_at) {
        const days = Math.floor((Date.now() - new Date(project.last_activity_at)) / 86400000);
        add('inactive', '1.2.7', 'Archivage si inactif', days < 180 ? 'ok' : 'ko', `${days} j d'inactivité`);
      }
    }

    // 1.3.7 Min. 2 maintainers (config)
    const mem = await fetchGLStatus(`/projects/${repo.id}/members/all?per_page=100`);
    if (mem.status === 403) add('maintainers', '1.3.7', 'Au moins 2 mainteneurs', 'unverif', 'Droits insuffisants pour vérifier');
    else if (Array.isArray(mem.data)) {
      const n = mem.data.filter(m => m.access_level >= 40).length;
      add('maintainers', '1.3.7', 'Au moins 2 mainteneurs', n >= 2 ? 'ok' : 'ko', `${n} mainteneur(s)/owner(s)`);
    } else add('maintainers', '1.3.7', 'Au moins 2 mainteneurs', 'unverif', 'Liste indisponible');

    // 1.4.4 Webhooks sécurisés (config)
    const hk = await fetchGLStatus(`/projects/${repo.id}/hooks`);
    if (hk.status === 403) add('webhooks', '1.4.4', 'Webhooks sécurisés (HTTPS + token)', 'unverif', 'Droits insuffisants pour vérifier');
    else if (Array.isArray(hk.data)) {
      if (!hk.data.length) add('webhooks', '1.4.4', 'Webhooks sécurisés (HTTPS + token)', 'ok', 'Aucun webhook');
      else {
        const bad = hk.data.filter(h => !String(h.url).startsWith('https://') || !h.token).length;
        add('webhooks', '1.4.4', 'Webhooks sécurisés (HTTPS + token)', bad ? 'ko' : 'ok', bad ? `${bad}/${hk.data.length} non sécurisé(s)` : `${hk.data.length} sécurisé(s)`);
      }
    } else add('webhooks', '1.4.4', 'Webhooks sécurisés (HTTPS + token)', 'unverif', 'Vérification impossible');

    // Lock files (fichiers — info, non corrigés par MR car nécessitent un vrai résolveur)
    const lockMap = [];
    if (has('package.json')) {
      const present = has('package-lock.json') || has('yarn.lock') || has('pnpm-lock.yaml');
      lockMap.push({ eco: 'npm', present });
    }
    for (const [man, lock, eco] of [
      ['Pipfile', 'Pipfile.lock', 'Pipenv'], ['pyproject.toml', 'poetry.lock', 'Poetry'],
      ['Gemfile', 'Gemfile.lock', 'Ruby'], ['composer.json', 'composer.lock', 'PHP'],
      ['Cargo.toml', 'Cargo.lock', 'Rust'], ['go.mod', 'go.sum', 'Go'],
    ]) { if (has(man)) lockMap.push({ eco, present: has(lock) }); }
    if (lockMap.length) {
      const missing = lockMap.filter(l => !l.present);
      add('lockfiles', '2.4.x', 'Lock files présents', missing.length ? 'ko' : 'ok',
        missing.length ? `Manquant(s) : ${missing.map(l => l.eco).join(', ')}` : `${lockMap.length} verrou(s) présent(s)`);
    }

    // Maven versions fixées (fichier)
    if (has('pom.xml')) {
      const pomPath = find('pom.xml');
      let content = null; try { content = pomPath ? await getFileContent(repo.id, pomPath, defaultBranch) : null; } catch {}
      const ranges = content ? parseMavenRanges(content) : [];
      add('maven', '2.4.x', 'Versions Maven fixées', ranges.length ? 'ko' : 'ok',
        ranges.length ? `${ranges.length} version(s) non figée(s)` : 'Toutes figées');
    }

    // ── Score : moyenne pondérée des checks vérifiables (ok=1, ko=0).
    //    'na' et 'unverif' sont EXCLUS du dénominateur (on ne note pas ce qu'on
    //    ne peut pas voir). Pondération : config sécurité > fichiers.
    const W = { branch: 25, approvals: 25, linear: 5, codeowners: 5, securitymd: 5, inactive: 5, maintainers: 10, webhooks: 10, lockfiles: 5, maven: 5 };
    let num = 0, den = 0;
    for (const c of checks) {
      if (c.state === 'ok' || c.state === 'ko') { const w = W[c.id] || 5; den += w; if (c.state === 'ok') num += w; }
    }
    const score = den === 0 ? 100 : Math.round((num / den) * 100);
    const unverifiable = checks.filter(c => c.state === 'unverif').length;
    // Verdict BINAIRE : sécurité = pas de demi-mesure. Un seul écart → non conforme.
    // Le score reste calculé comme aide à la priorisation, pas comme verdict.
    const gaps = checks.filter(c => c.state === 'ko').length;
    const status = gaps === 0 ? 'conform' : 'nonconform';

    return {
      id: repo.id, name: repo.name, path: repo.path, url: webUrl, defaultBranch, visibility,
      checks, score, status, unverifiable,
      // pour homogénéité avec le reste (affected(), exports) : findings = checks KO
      findings: checks.filter(c => c.state === 'ko').map(c => ({
        kind: 'cis', type: c.label, cis: c.cis, tag: 'CIS ' + c.cis, file: '—', line: '', preview: c.detail, severity: 'orange',
      })),
      scanned: checks.length,
    };
  }

  function runCIS() {
    runGeneric({
      label: 'CIS',
      liveNoun: n => `🛡️ score moyen ${n}`,
      scanOne: (repo) => scanCIS(repo),
      finish: finishScanCIS,
    });
  }

  // Boucle générique d'énumération + workers concurrents (calquée sur runSupply).
  // Utilisée par le mode CIS. scanOne(repo) → res ; finish(...) → rendu final.
  async function runGeneric({ label, scanOne, finish }) {
    if (running) return;
    running = true; aborted = false; results = []; liveCount = 0;
    resetMrPanel();
    apiCalls = 0; throttles = 0; runStart = Date.now();

    show('resultsSection', false);
    show('scanSection', false);
    show('histStats', false);
    document.getElementById('findingsGrid').innerHTML = '';
    show('enumSection', true);
    const enumCount = document.getElementById('enumCount');

    let done = 0, total = 0;
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
      const setProg = (lbl) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        const avg = results.length ? Math.round(results.reduce((s, r) => s + (r.res.score ?? 0), 0) / results.length) : 0;
        const nc = results.filter(r => r.res.status === 'nonconform').length;
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressText').textContent = `${fmt(done)} / ${fmt(total)} repos · ${label}`;
        document.getElementById('progressSub').textContent = lbl || '';
        document.getElementById('liveStat').textContent = `🛡️ moy. ${avg}/100 · ${fmt(nc)} non conforme(s)`;
      };
      setProg('Démarrage…');

      async function worker() {
        while (idx < repos.length && !aborted) {
          const repo = repos[idx++];
          try {
            setProg(repo.path);
            const res = await scanOne(repo);
            done++;
            results.push({ repo, res });
            appendCISCard(repo, res);
          } catch (e) {
            console.warn('Repo ignoré (erreur):', repo.path, e); done++;
          }
          setProg(repo.path);
        }
      }
      await Promise.all(Array.from({ length: CONC }, () => worker()));

      show('scanSection', false);
      const extra = `· ${fmt(apiCalls)} appels API · ${fmt(throttles)} throttles · ${fmtDur((Date.now() - runStart) / 1000)}`;
      finish(done, total, extra);
    } catch (e) {
      console.error(`Scan ${label} interrompu:`, e);
      show('enumSection', false); show('scanSection', false);
      finish(done, total, '· run interrompu');
      showToast('Erreur pendant le scan — résultats partiels affichés.', 'error');
    } finally {
      running = false;
    }
  }

  // Carte CIS live : score + checks pliables (réutilise les classes repo-card).
  async function createReportMR(repo, res) {
    const enc = encodeURIComponent;
    const targetBranch = (repo.defaultBranch && repo.defaultBranch !== 'HEAD') ? repo.defaultBranch : 'main';
    const isSupply = res.findings.some(f => f.kind === 'supply');

    // 1) DÉCISION pilotée par l'état de la MR, pas par la branche.
    //    a) Une MR OUVERTE sur cette source existe déjà → on ne refait rien.
    //    Le filtre serveur ?source_branch= n'est pas fiable selon la version
    //    GitLab → on REFILTRE côté client sur la bonne branche.
    const openMrs = await fetchGL(`/projects/${repo.id}/merge_requests?state=opened&source_branch=${enc(MR_BRANCH)}`);
    const mine = Array.isArray(openMrs) ? openMrs.filter(m => m.source_branch === MR_BRANCH) : [];
    if (mine.length) {
      return { repo, status: 'exists', url: mine[0].web_url };
    }
    //    b) Pas de MR ouverte (jamais créée, fermée, ou mergée). Si la branche
    //       traîne (MR fermée sans suppression de branche), on l'écrase pour
    //       repartir propre — sinon GitLab refuserait une nouvelle MR identique.
    const stale = await fetchGL(`/projects/${repo.id}/repository/branches/${enc(MR_BRANCH)}`);
    if (stale && stale.name === MR_BRANCH) {
      const del = await glDelete(`/projects/${repo.id}/repository/branches/${enc(MR_BRANCH)}`);
      if (del.status === 403) return { repo, status: 'forbidden' };
      if (!del.ok) return { repo, status: 'error', detail: `branch-del ${del.status}` };
    }

    // 2) BRANCHE — depuis default_branch. 403 = token read-only → stop net.
    const br = await glWrite(`/projects/${repo.id}/repository/branches?branch=${enc(MR_BRANCH)}&ref=${enc(targetBranch)}`, {});
    if (br.status === 403) return { repo, status: 'forbidden' };
    if (!br.ok && br.status !== 400) return { repo, status: 'error', detail: `branch ${br.status}` };

    // 3) COMMIT — pose le fichier. create, puis update en repli (relance partielle).
    const md = buildReportMarkdown(repo, res);
    const commitPayload = (action) => ({
      branch: MR_BRANCH,
      commit_message: `chore(security): rapport de scan ${isSupply ? 'supply-chain' : 'secrets'} (DevOps Hub)`,
      actions: [{ action, file_path: MR_FILE, content: md }],
    });
    let cm = await glWrite(`/projects/${repo.id}/repository/commits`, commitPayload('create'));
    if (!cm.ok && cm.status === 400) cm = await glWrite(`/projects/${repo.id}/repository/commits`, commitPayload('update'));
    if (cm.status === 403) return { repo, status: 'forbidden' };
    if (!cm.ok) return { repo, status: 'error', detail: `commit ${cm.status}` };

    // 4) MR — branche → default. 409 = déjà ouverte (course) → traité comme exists.
    const mr = await glWrite(`/projects/${repo.id}/merge_requests`, {
      source_branch: MR_BRANCH,
      target_branch: targetBranch,
      title: `🔑 Scan sécurité : ${res.findings.length} ${isSupply ? 'alerte(s) supply-chain' : 'secret(s)'} à traiter`,
      description: buildMRDescription(repo, res),
      remove_source_branch: true,
    });
    if (mr.status === 403) return { repo, status: 'forbidden' };
    if (mr.status === 409) return { repo, status: 'exists', url: repo.url ? `${repo.url}/-/merge_requests` : '' };
    if (!mr.ok) return { repo, status: 'error', detail: `mr ${mr.status}` };

    return { repo, status: 'created', url: mr.body?.web_url || '' };
  }

  // Orchestrateur : lance les MR sur tous les repos touchés, concurrence limitée,
  // abortable, panneau de résultats live. Appelé en fin de run.
  async function createReportMRs() {
    const aff = affected();
    if (!aff.length || mrCreating) return;
    mrCreating = true;
    try {

    const panel = ensureMrPanel();
    const counts = { created: 0, exists: 0, forbidden: 0, error: 0 };
    let done = 0; const totalRepos = aff.length;
    let forbiddenSeen = false;

    const renderMr = (label) => {
      panel.innerHTML = `
        <div class="mr-head">
          <div class="mr-title">🔀 Création des MR de rapport</div>
          <div class="mr-prog">${fmt(done)} / ${fmt(totalRepos)} repos</div>
        </div>
        <div class="mr-stats">
          <span class="mr-pill ok">✅ ${fmt(counts.created)} créées</span>
          <span class="mr-pill">⏭️ ${fmt(counts.exists)} déjà là</span>
          ${counts.forbidden ? `<span class="mr-pill ko">🔒 ${fmt(counts.forbidden)} refus (token)</span>` : ''}
          ${counts.error ? `<span class="mr-pill ko">❌ ${fmt(counts.error)} échecs</span>` : ''}
        </div>
        ${label ? `<div class="mr-sub">${escH(label)}</div>` : ''}
        <div class="mr-list" id="mrList"></div>`;
    };
    renderMr('Démarrage…');

    const listEl = () => document.getElementById('mrList');
    const addRow = (r) => {
      const el = listEl(); if (!el) return;
      const icon = r.status === 'created' ? '✅' : r.status === 'exists' ? '⏭️' : r.status === 'forbidden' ? '🔒' : '❌';
      const txt = r.status === 'created' ? 'MR créée' : r.status === 'exists' ? 'MR déjà ouverte' : r.status === 'forbidden' ? 'refusé (token sans droit d\'écriture)' : `échec (${escH(r.detail || '')})`;
      const link = r.url ? `<a href="${r.url}" target="_blank" rel="noopener" class="mr-link">ouvrir ↗</a>` : '';
      el.insertAdjacentHTML('beforeend', `<div class="mr-row"><span class="mr-ic">${icon}</span><span class="mr-repo" title="${escH(r.repo.path)}">${escH(r.repo.path)}</span><span class="mr-stat">${txt}</span>${link}</div>`);
    };

    let idx = 0;
    async function worker() {
      while (idx < aff.length && !aborted) {
        const { repo, res } = aff[idx++];
        renderMr(repo.path);
        let r;
        try { r = await createReportMR(repo, res); }
        catch (e) { r = { repo, status: 'error', detail: 'exception' }; }
        counts[r.status] = (counts[r.status] || 0) + 1;
        done++;
        if (r.status === 'forbidden') forbiddenSeen = true;
        addRow(r);
        renderMr(repo.path);
        // Token read-only : inutile d'insister sur des centaines de repos.
        if (forbiddenSeen && counts.forbidden >= 3) { aborted = true; }
      }
    }
    await Promise.all(Array.from({ length: MR_CONC }, () => worker()));

    renderMr('');
    if (forbiddenSeen) {
      showToast('🔒 Token sans droit d\'écriture — aucune MR créée. Utilise un PAT avec scope « api ».', 'error', 7000);
    } else {
      showToast(`🔀 ${fmt(counts.created)} MR créée(s)${counts.exists ? `, ${fmt(counts.exists)} déjà présente(s)` : ''}${counts.error ? `, ${fmt(counts.error)} échec(s)` : ''}.`, counts.created ? 'success' : 'info', 6000);
    }
    } finally { mrCreating = false; }
  }

  // ── MR CIS : tout repo ayant au moins un écart CIS. Commite les fichiers corrigeables
  //    (SECURITY.md, CODEOWNERS) + documente les réglages Settings. ──
  async function createCISMR(repo, res) {
    const enc = encodeURIComponent;
    const targetBranch = (res.defaultBranch && res.defaultBranch !== 'HEAD') ? res.defaultBranch : 'main';

    // Idempotence pilotée par l'état de la MR (mêmes règles que les secrets).
    // ATTENTION : le filtre serveur ?source_branch= est ignoré par certaines
    // versions GitLab → on REFILTRE côté client, sinon une MR d'un autre type
    // (secrets/supply) ferait croire à tort qu'une MR CIS existe déjà.
    const openMrs = await fetchGL(`/projects/${repo.id}/merge_requests?state=opened&source_branch=${enc(MR_CIS_BRANCH)}`);
    const mineCIS = Array.isArray(openMrs) ? openMrs.filter(m => m.source_branch === MR_CIS_BRANCH) : [];
    if (mineCIS.length) return { repo, status: 'exists', url: mineCIS[0].web_url };
    const stale = await fetchGL(`/projects/${repo.id}/repository/branches/${enc(MR_CIS_BRANCH)}`);
    if (stale && stale.name === MR_CIS_BRANCH) {
      const del = await glDelete(`/projects/${repo.id}/repository/branches/${enc(MR_CIS_BRANCH)}`);
      if (del.status === 403) return { repo, status: 'forbidden' };
      if (!del.ok) return { repo, status: 'error', detail: `branch-del ${del.status}` };
    }

    // Fichiers corrigeables réellement absents → actions de commit.
    const fileActions = [];
    const koIds = new Set(res.checks.filter(c => c.state === 'ko').map(c => c.id));
    if (koIds.has('securitymd')) fileActions.push({ action: 'create', file_path: 'SECURITY.md', content: defaultSecurityMd(repo), why: 'SECURITY.md absent (CIS 1.2.1)' });
    if (koIds.has('codeowners')) fileActions.push({ action: 'create', file_path: 'CODEOWNERS', content: defaultCodeowners(repo), why: 'CODEOWNERS absent (CIS 1.1.6)' });

    // Branche.
    const br = await glWrite(`/projects/${repo.id}/repository/branches?branch=${enc(MR_CIS_BRANCH)}&ref=${enc(targetBranch)}`, {});
    if (br.status === 403) return { repo, status: 'forbidden' };
    if (!br.ok && br.status !== 400) return { repo, status: 'error', detail: `branch ${br.status}: ${br.body?.message || ''}` };

    // Commit : soit les fichiers corrigeables, soit un rapport seul si aucun fichier à poser.
    const actions = fileActions.length
      ? fileActions.map(fa => ({ action: fa.action, file_path: fa.file_path, content: fa.content }))
      : [{ action: 'create', file_path: 'SECURITY-CIS.md', content: buildCISDescription(repo, res, []) }];
    let cm = await glWrite(`/projects/${repo.id}/repository/commits`, {
      branch: MR_CIS_BRANCH,
      commit_message: `chore(security): conformité CIS GitLab (score ${res.score}/100) — DevOps Hub`,
      actions,
    });
    // Repli create→update si un fichier existait déjà.
    if (!cm.ok && cm.status === 400) {
      cm = await glWrite(`/projects/${repo.id}/repository/commits`, {
        branch: MR_CIS_BRANCH,
        commit_message: `chore(security): conformité CIS GitLab (score ${res.score}/100) — DevOps Hub`,
        actions: actions.map(a => ({ ...a, action: 'update' })),
      });
    }
    if (cm.status === 403) return { repo, status: 'forbidden' };
    if (!cm.ok) return { repo, status: 'error', detail: `commit ${cm.status}: ${cm.body?.message || ''}` };

    const mr = await glWrite(`/projects/${repo.id}/merge_requests`, {
      source_branch: MR_CIS_BRANCH,
      target_branch: targetBranch,
      title: `🛡️ Conformité CIS : ${res.score}/100 — ${res.checks.filter(c => c.state === 'ko').length} écart(s)`,
      description: buildCISDescription(repo, res, fileActions),
      remove_source_branch: true,
    });
    if (mr.status === 403) return { repo, status: 'forbidden' };
    if (mr.status === 409 || (!mr.ok && mr.status === 400)) {
      // 409/400 : GitLab refuse la création. Ça NE veut pas forcément dire
      // qu'une MR CIS existe. On revérifie réellement l'état ouvert ; si une
      // MR CIS est bien là → exists, sinon on remonte l'erreur exacte.
      const recheck = await fetchGL(`/projects/${repo.id}/merge_requests?state=opened&source_branch=${enc(MR_CIS_BRANCH)}`);
      const open = Array.isArray(recheck) ? recheck.filter(m => m.source_branch === MR_CIS_BRANCH) : [];
      if (open.length) return { repo, status: 'exists', url: open[0].web_url };
      return { repo, status: 'error', detail: `mr ${mr.status}: ${mr.body?.message || JSON.stringify(mr.body || {})}` };
    }
    if (!mr.ok) return { repo, status: 'error', detail: `mr ${mr.status}: ${mr.body?.message || JSON.stringify(mr.body || {})}` };
    return { repo, status: 'created', url: mr.body?.web_url || '' };
  }

  // Orchestrateur MR CIS : tout repo ayant au moins un écart CIS (check ko).
  async function createCISMRs() {
    const crit = results.filter(r => r.res.checks.some(c => c.state === 'ko'));
    if (!crit.length || mrCreating) return;
    mrCreating = true;
    try {
    const panel = ensureMrPanel();
    const counts = { created: 0, exists: 0, forbidden: 0, error: 0 };
    let done = 0; const totalRepos = crit.length; let forbiddenSeen = false;

    const renderMr = (label) => {
      panel.innerHTML = `
        <div class="mr-head"><div class="mr-title">🛡️ Création des MR de conformité CIS</div><div class="mr-prog">${fmt(done)} / ${fmt(totalRepos)} repos avec écart</div></div>
        <div class="mr-stats">
          <span class="mr-pill ok">✅ ${fmt(counts.created)} créées</span>
          <span class="mr-pill">⏭️ ${fmt(counts.exists)} déjà là</span>
          ${counts.forbidden ? `<span class="mr-pill ko">🔒 ${fmt(counts.forbidden)} refus (token)</span>` : ''}
          ${counts.error ? `<span class="mr-pill ko">❌ ${fmt(counts.error)} échecs</span>` : ''}
        </div>
        ${label ? `<div class="mr-sub">${escH(label)}</div>` : ''}
        <div class="mr-list" id="mrList"></div>`;
    };
    renderMr('Démarrage…');
    const addRow = (r) => {
      const el = document.getElementById('mrList'); if (!el) return;
      const icon = r.status === 'created' ? '✅' : r.status === 'exists' ? '⏭️' : r.status === 'forbidden' ? '🔒' : '❌';
      const txt = r.status === 'created' ? 'MR créée' : r.status === 'exists' ? 'MR déjà ouverte' : r.status === 'forbidden' ? 'refusé (token sans droit d\'écriture)' : `échec (${escH(r.detail || '')})`;
      const link = r.url ? `<a href="${r.url}" target="_blank" rel="noopener" class="mr-link">ouvrir ↗</a>` : '';
      el.insertAdjacentHTML('beforeend', `<div class="mr-row"><span class="mr-ic">${icon}</span><span class="mr-repo" title="${escH(r.repo.path)}">${escH(r.repo.path)}</span><span class="mr-stat">${txt}</span>${link}</div>`);
    };

    let idx = 0;
    async function worker() {
      while (idx < crit.length && !aborted) {
        const { repo, res } = crit[idx++];
        renderMr(repo.path);
        let r; try { r = await createCISMR(repo, res); } catch { r = { repo, status: 'error', detail: 'exception' }; }
        counts[r.status] = (counts[r.status] || 0) + 1; done++;
        if (r.status === 'forbidden') forbiddenSeen = true;
        if ((r.status === 'created' || r.status === 'exists') && r.url) {
          res.mrUrl = r.url; // persiste l'URL sur le résultat (survit aux re-render/filtre)
          attachMRLinkToCard(repo.id, r.url, r.status === 'created' ? 'MR de conformité créée' : 'MR de conformité déjà ouverte');
        }
        addRow(r); renderMr(repo.path);
        if (forbiddenSeen && counts.forbidden >= 3) aborted = true;
      }
    }
    await Promise.all(Array.from({ length: MR_CONC }, () => worker()));
    renderMr('');
    if (forbiddenSeen) showToast('🔒 Token sans droit d\'écriture — aucune MR créée. PAT scope « api » requis.', 'error', 7000);
    else showToast(`🛡️ ${fmt(counts.created)} MR CIS créée(s)${counts.exists ? `, ${fmt(counts.exists)} déjà présente(s)` : ''}${counts.error ? `, ${fmt(counts.error)} échec(s)` : ''}.`, counts.created ? 'success' : 'info', 6000);
    } finally { mrCreating = false; }
  }

  // Remet à zéro l'état de création de MR au début de chaque scan : panneau
  // masqué/vidé et verrou libéré. Sans ça, un panneau d'un scan précédent
  // (ex. secrets) persiste et bloque l'affichage du suivant (ex. CIS).
  let _brState = { exposures: [], ioc: null };
  async function runBlastRadius() {
    if (running) { showToast('Un scan est déjà en cours.', 'info'); return; }
    const ioc = brParseIOC();
    if (!ioc.name || !ioc.version) { showToast('Renseigne au moins le composant et la version.', 'error'); return; }
    running = true; aborted = false; apiCalls = 0; throttles = 0; runStart = Date.now();
    _privCache.clear(); _propCache.clear(); _behCache.clear();   // pas de données inter-run périmées
    _brState = { exposures: [], ioc };
    const host = document.getElementById('brSection');
    show('brSection', true);

    const setStatus = (msg) => {
      const el = document.getElementById('brStatus'); if (el) el.textContent = msg;
    };
    host.innerHTML = brShellHTML(ioc);

    try {
      const repos = await listAccessibleRepos(n => setStatus(`Énumération… ${fmt(n)} repos`), ioc.limit);
      if (aborted) { setStatus('Interrompu.'); return; }
      const exposures = [];
      let done = 0;
      const CONC = 3; let idx = 0;
      async function worker() {
        while (idx < repos.length && !aborted) {
          const repo = repos[idx++];
          setStatus(`Présence : ${repo.path} (${fmt(done)}/${fmt(repos.length)})`);
          let exps = [];
          try { exps = await brPresence(repo, ioc); } catch { exps = []; }
          for (const e of exps) {
            setStatus(`Exécution : ${repo.path}`);
            try { await brExecution(e, ioc); } catch {}
            if (e.pipelines > 0) {
              setStatus(`Privilèges : ${repo.path}`); try { await brPrivileges(e); } catch {}
              setStatus(`Propagation : ${repo.path}`); try { await brPropagation(e); } catch {}
            }
            setStatus(`Comportement : ${repo.path}`); try { await brBehavior(e); } catch {}
            exposures.push(e);
            _brState.exposures = exposures;
            brRender(host, ioc, exposures, false);
          }
          done++;
        }
      }
      await Promise.all(Array.from({ length: CONC }, () => worker()));
      _brState.exposures = exposures;
      brRender(host, ioc, exposures, true);
      setStatus(aborted ? 'Interrompu — résultats partiels.' : `Terminé — ${fmt(exposures.length)} exposition(s).`);
    } catch (e) {
      console.error('Blast radius:', e);
      setStatus('Erreur — résultats partiels affichés.');
      brRender(host, ioc, _brState.exposures, true);
    } finally { running = false; }
  }

  // ── Rendu ──
  function brStop() { aborted = true; showToast('Blast radius interrompu — résultats partiels.', 'info'); }

  // ── Exports ──
  function brExportPlan() { download(`plan-action-${_brState.ioc.name}-${_brState.ioc.version}.md`, brBuildPlan(), 'text/markdown'); }
  function brExportReport() {
    const { exposures, ioc } = _brState;
    const rows = exposures.map(e => { const s = brScore(e); return `<tr><td>${escH(e.repo.path)}</td><td>${escH(e.file)}</td><td>${escH(e.version || '—')}</td><td>${e.pipelines}</td><td>${escH(BR_LEVEL_META[brEvidenceLevel(e)].label)}</td><td class="pri ${s.tone}">${s.p}</td></tr>`; }).join('');
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Rapport d'incident — ${escH(ioc.name)}@${escH(ioc.version)}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f0a1f;color:#eee;padding:32px;max-width:1000px;margin:auto}h1{color:#fca5a5}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:8px 10px;border-bottom:1px solid #333;text-align:left;font-size:13px}code{color:#c9b6ff}.pri{font-weight:700}.p1{color:#f87171}.p2{color:#fbbf24}.p3{color:#9aa}</style></head><body>
<h1>🚨 ${escH(ioc.name)}@${escH(ioc.version)}</h1><p>IOC : <code>${escH(ioc.purl)}</code>${ioc.from ? ` · Fenêtre ${escH(ioc.from)} → ${escH(ioc.to || 'maintenant')}` : ''}</p>
<p>${exposures.length} exposition(s) — « elle est entrée ici, elle a tourné là ». Privilèges &amp; propagation (→ P0) : tranches suivantes.</p>
<table><thead><tr><th>Repo</th><th>Fichier</th><th>Version</th><th>Pipelines</th><th>Preuve</th><th>Priorité</th></tr></thead><tbody>${rows}</tbody></table>
<p style="opacity:.6;margin-top:24px;font-size:12px">Généré en lecture seule par le banc d'essai Secret Scanner. Aucune action exécutée.</p></body></html>`;
    download(`rapport-incident-${ioc.name}-${ioc.version}.html`, html, 'text/html');
  }

  // ══════════════════════════════════════════════════════════════════════
  //  DÉCOUVERTE (OSV.dev) — « ai-je un problème ? » sans connaître l'IOC.
  //  Inventaire des composants résolus → croisement OSV → composants signalés
  //  → un clic lance le Blast Radius sur le composant choisi.
  //  Seuls des NOMS DE PACKAGES PUBLICS quittent le navigateur (jamais de code/secret).
  // ══════════════════════════════════════════════════════════════════════
  let _discState = { flagged: [], eco: 'npm' };
  async function runDiscover() {
    if (running) { showToast('Un scan est déjà en cours.', 'info'); return; }
    const eco = (document.getElementById('discEco') || {}).value || 'npm';
    const limRaw = parseInt((document.getElementById('discLimit') || {}).value, 10);
    const limit = Number.isFinite(limRaw) && limRaw > 0 ? limRaw : null;
    running = true; aborted = false; apiCalls = 0; throttles = 0; runStart = Date.now();
    const host = document.getElementById('discSection');
    show('discSection', true);
    host.innerHTML = discShellHTML();
    const setStatus = (m) => { const el = document.getElementById('discStatus'); if (el) el.textContent = m; };

    try {
      const { inv, reposCount } = await discInventory(eco, limit, setStatus);
      if (aborted) { setStatus('Interrompu.'); return; }
      const comps = [...inv.values()];
      setStatus(`${fmt(comps.length)} composants résolus — croisement OSV.dev…`);
      const flaggedIds = await discQueryOSV(comps, eco, setStatus);

      // Détails (gravité, résumé, malveillance) pour l'avis principal de chaque signalé.
      const flagged = [];
      let n = 0;
      for (const [key, ids] of flaggedIds) {
        if (aborted) break;
        const rec = inv.get(key);
        setStatus(`Détails OSV… ${fmt(++n)}/${fmt(flaggedIds.size)}`);
        const detail = await osvGet('/v1/vulns/' + encodeURIComponent(ids[0]));
        const malicious = ids.some(id => String(id).startsWith('MAL-'));
        const sev = osvSeverity(malicious ? 'MAL-' : ids[0], detail);
        flagged.push({ name: rec.name, version: rec.version, dev: rec.dev, repos: rec.repos, ids, malicious, sev, summary: (detail && detail.summary) || (detail && detail.details ? String(detail.details).slice(0, 140) : '') });
      }
      flagged.sort((a, b) => (b.sev.rank - a.sev.rank) || (b.repos.size - a.repos.size));
      _discState = { flagged, eco };
      discRender(host, comps.length, reposCount, flagged, true);
      setStatus(aborted ? 'Interrompu — résultats partiels.' : `Terminé — ${fmt(flagged.length)} composant(s) signalé(s) sur ${fmt(comps.length)}.`);
    } catch (e) {
      console.error('Découverte:', e);
      setStatus('Erreur (OSV injoignable ?) — voir la console.');
    } finally { running = false; }
  }

  function discStop() { aborted = true; showToast('Découverte interrompue — résultats partiels.', 'info'); }

  function brFromDiscovery(name, version) {
    const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setV('brName', name); setV('brVersion', version); setV('brFrom', ''); setV('brTo', ''); setV('brLimit', '');
    setMode('blast');
    runBlastRadius();
    const el = document.getElementById('brSection'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Exposé pour tests headless (mock fetch) — le vrai flux reste piloté par l'UI.
  window.__br = { brVersionMatch, brParseNpmLock, brParseYarnLock, brParseLock, brFindComponent, brSbomHasComponent, brEvidenceLevel, brScore, brP0Reasons, brLayout, brParseIOC, runBlastRadius, osvSeverity, runDiscover, brBuildPlan, brScanText };

  window.rescan = rescan;
  window.setMode = setMode;
  window.startScan = startScan;
  window.brStop = brStop;
  window.brExportPlan = brExportPlan;
  window.brExportReport = brExportReport;
  window.discStop = discStop;
  window.brFromDiscovery = brFromDiscovery;
  window.resetHistory = resetHistory;
  window.filterByType = filterByType;
  window.filterCIS = filterCIS;
  window.toggleCard = toggleCard;
  window.exportExcel = exportExcel;
  window.exportJson = exportJson;
  window.exportMarkdown = exportMarkdown;
  window.exportReport = exportReport;
  window.showInfo = showInfo;
  window.closeInfo = closeInfo;
