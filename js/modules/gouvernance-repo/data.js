/* gouvernance-repo · data.js — I/O GitLab + persistance (fetch, arbres, commits, MR).
 * Portée globale du script classique (module déballé de son IIFE). */

'use strict';

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


  // ── Énumération de tous les repos accessibles — pagination KEYSET (fiable au-delà de qq milliers) ──
  // Filtre serveur : archivés exclus. Filtre client : repos vides (default_branch null) ignorés.
  async function listAccessibleRepos(onProgress, limit) {
    // Mode mono-repo : on résout uniquement le repo sélectionné dans le hub.
    if (monoRepoId) {
      const p = await fetchGL(`/projects/${monoRepoId}`);
      if (!p || !p.id) { if (onProgress) onProgress(0); return []; }
      if (onProgress) onProgress(1);
      return [{ id: p.id, name: p.name, path: p.path_with_namespace || p.name, url: p.web_url || '', defaultBranch: p.default_branch || 'main' }];
    }
    // Mode workspace : on résout uniquement les repos choisis du workspace.
    // Chaque repo est ré-interrogé pour obtenir default_branch (absent du storage).
    if (workspaceMode) {
      const out = [];
      for (const r of workspaceRepos) {
        if (aborted) break;
        const p = await fetchGL(`/projects/${r.id}`);
        if (p && p.id && p.default_branch) {  // repos vides / non initialisés ignorés
          out.push({ id: p.id, name: p.name, path: p.path_with_namespace || p.name, url: p.web_url || '', defaultBranch: p.default_branch });
        }
        if (onProgress) onProgress(out.length);
        if (limit && out.length >= limit) return out;
      }
      return out;
    }
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
    while (page <= 50) {   // garde-fou dur : 50 pages × 100 = 5000 fichiers max (jamais de boucle non bornée)
      const batch = await fetchGL(`/projects/${projectId}/repository/tree?recursive=true&per_page=100&page=${page}`);
      if (!batch || !Array.isArray(batch) || batch.length === 0) break;
      files.push(...batch.map(f => f.path));
      if (batch.length < 100) break;
      page++;
    }
    return files;
  }

  async function getFileContent(projectId, path, ref) {
    try {
      // L'API Files exige un ref réel (branche/tag/SHA) : `HEAD` n'est pas résolu
      // de façon fiable et renvoie 404 → contenu toujours vide. On passe la branche
      // par défaut du repo, comme partout ailleurs dans la plateforme.
      const q = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      const data = await fetchGL(`/projects/${projectId}/repository/files/${encodeURIComponent(path)}${q}`);
      return data?.content ? atob(data.content) : null;
    } catch { return null; }
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

  function loadHistState() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY)) || {}; } catch { return {}; }
  }

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
  // MODE CIS — conformité CIS GitLab Benchmark par repo (porté de gouvernance).
  // Produit un score /100 + des checks pass/fail/unverifiable. Le 403 sur un
  // endpoint de config (droits insuffisants) → « non vérifiable », JAMAIS
  // « non conforme » : on ne ment pas sur la posture.
  // ══════════════════════════════════════════════════════════════════════

  // fetchGL renvoie null sur erreur sans distinguer 403/404/vide. Pour le CIS on
  // a besoin de savoir si c'est un refus de droits. Variante qui rend le statut.
  async function fetchGLStatus(ep) {
    const url = `${GITLAB_URL}/api/v4${ep}`;
    for (let i = 0; i < 4; i++) {
      try {
        apiCalls++;
        const r = await fetch(url, { headers: { 'PRIVATE-TOKEN': token } });
        if (r.status === 401) { localStorage.removeItem('devops_hub_workspaces'); window.location.href = 'login.html'; return { status: 401, data: null }; }
        if (r.status === 429 || r.status >= 500) {
          if (r.status === 429) throttles++;
          const ra = parseInt(r.headers.get('Retry-After')) || Math.min(30, Math.pow(2, i + 1));
          await sleep(ra * 1000); continue;
        }
        let data = null; try { data = await r.json(); } catch {}
        return { status: r.status, data };
      } catch { await sleep(Math.min(15, Math.pow(2, i + 1)) * 1000); }
    }
    return { status: 0, data: null };
  }


  // Scan CIS d'UN repo. Renvoie { score, status, checks[], unverifiable }.
  // checks[] : { id, cis, label, state: 'ok'|'ko'|'na'|'unverif', detail, fixable }
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



  // Mécanique GitLab : branche (depuis default_branch) → commit du
  // SECURITY-SCAN.md → MR vers default_branch. Aucun merge. Idempotent.
  // ══════════════════════════════════════════════════════════════════════

  // rawFetch est GET-only ; les écritures veulent POST + Content-Type + body.
  // Même backoff 429/5xx, même 401→login, mêmes compteurs que rawFetch.
  async function glWrite(ep, payload, attempts = 4) {
    const url = `${GITLAB_URL}/api/v4${ep}`;
    for (let i = 0; i < attempts; i++) {
      try {
        apiCalls++;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (r.status === 401) { localStorage.removeItem('devops_hub_workspaces'); window.location.href = 'login.html'; return { ok: false, status: 401 }; }
        if (r.status === 429 || r.status >= 500) {
          if (r.status === 429) throttles++;
          const ra = parseInt(r.headers.get('Retry-After')) || Math.min(30, Math.pow(2, i + 1));
          await sleep(ra * 1000);
          continue;
        }
        let body = null; try { body = await r.json(); } catch {}
        return { ok: r.ok, status: r.status, body };
      } catch {
        await sleep(Math.min(15, Math.pow(2, i + 1)) * 1000);
      }
    }
    return { ok: false, status: 0, body: null };
  }


  // DELETE résilient (suppression de branche résiduelle). Même esprit que glWrite.
  async function glDelete(ep, attempts = 3) {
    const url = `${GITLAB_URL}/api/v4${ep}`;
    for (let i = 0; i < attempts; i++) {
      try {
        apiCalls++;
        const r = await fetch(url, { method: 'DELETE', headers: { 'PRIVATE-TOKEN': token } });
        if (r.status === 429 || r.status >= 500) {
          if (r.status === 429) throttles++;
          const ra = parseInt(r.headers.get('Retry-After')) || Math.min(30, Math.pow(2, i + 1));
          await sleep(ra * 1000);
          continue;
        }
        return { ok: r.ok || r.status === 404, status: r.status }; // 404 = déjà absente, OK
      } catch {
        await sleep(Math.min(15, Math.pow(2, i + 1)) * 1000);
      }
    }
    return { ok: false, status: 0 };
  }



  // status ∈ 'created' | 'exists' | 'forbidden' | 'error'
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
