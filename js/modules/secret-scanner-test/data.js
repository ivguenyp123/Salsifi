/* secret-scanner-test · data.js — I/O réseau (GitLab, OSV) (chargé en 2e). */

'use strict';

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

  // ── Moteur de détection (repris tel quel de gouvernance-repo.js) ──
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

  // Markdown du rapport, par repo. Aligné sur exportMarkdown : mêmes colonnes,
  // colonne Commit seulement en historique, aperçus censurés, refs CIS.
  async function brFetchText(ep) {
    const r = await rawFetch(`${GITLAB_URL}/api/v4${ep}`);
    if (!r || !r.ok) return null;
    try { return await r.text(); } catch { return null; }
  }

  // ── IOC depuis le formulaire ──
  async function brCommitsTouching(repoId, path, from, to) {
    const qs = ['all=true', 'per_page=100', `path=${encodeURIComponent(path)}`];
    if (from) qs.push(`since=${encodeURIComponent(from)}`);
    if (to) qs.push(`until=${encodeURIComponent(to)}`);
    const data = await fetchGL(`/projects/${repoId}/repository/commits?${qs.join('&')}`);
    return Array.isArray(data) ? data : [];
  }

  async function brPresence(repo, ioc) {
    const tree = await getFileTree(repo.id).catch(() => []);
    const locks = (tree || []).filter(p => {
      const leaf = p.split('/').pop().toLowerCase();
      return (BR_LOCKFILES[ioc.eco] || []).includes(leaf);
    });
    const manifests = (tree || []).filter(p => (BR_MANIFESTS[ioc.eco] || []).includes(p.split('/').pop().toLowerCase()));
    const exposures = [];

    for (const lock of locks) {
      if (aborted) break;
      let commits = await brCommitsTouching(repo.id, lock, ioc.from, ioc.to);
      // Si aucun commit du lockfile dans la fenêtre, on teste quand même l'état
      // courant (le composant a pu être introduit avant la fenêtre et rester).
      let sample = commits.slice(0, BR_COMMITS_CAP);
      let checkedHead = false;
      if (!sample.length) { sample = [{ id: repo.defaultBranch || 'HEAD', created_at: null }]; checkedHead = true; }

      let firstHit = null, lastHit = null, hitCommits = [], resolvedInfo = null;
      for (const c of sample) {
        if (aborted) break;
        const ref = checkedHead ? (repo.defaultBranch || 'HEAD') : c.id;
        const content = await getFileContent(repo.id, lock, ref);
        if (!content) continue;
        const entries = brParseLock(lock, content);
        const hit = brFindComponent(entries, ioc.name, ioc.version);
        if (hit) {
          resolvedInfo = resolvedInfo || hit;
          hitCommits.push(c.id);
          const at = c.created_at ? Date.parse(c.created_at) : null;
          if (at != null) { if (firstHit == null || at < firstHit) firstHit = at; if (lastHit == null || at > lastHit) lastHit = at; }
        }
      }
      if (hitCommits.length) {
        exposures.push({
          repo, file: lock, confidenceSource: 'lockfile',
          version: resolvedInfo.version, integrity: resolvedInfo.integrity,
          scope: resolvedInfo.dev ? 'dev' : 'prod', direct: !!resolvedInfo.direct,
          installScript: !!resolvedInfo.installScript,
          introducedAt: firstHit, removedAt: (commits.length && !checkedHead) ? null : firstHit,
          commits: hitCommits, resolved: true, pipelines: 0, sbomConfirmed: false, execs: []
        });
      }
    }

    // Présence "seule" via manifeste (package.json) si aucun lockfile ne matche.
    if (!exposures.length && manifests.length) {
      for (const man of manifests) {
        const content = await getFileContent(repo.id, man, repo.defaultBranch || 'HEAD');
        if (!content) continue;
        try {
          const j = JSON.parse(content);
          const all = Object.assign({}, j.dependencies, j.devDependencies);
          if (all[ioc.name]) {
            exposures.push({ repo, file: man, confidenceSource: 'manifest', version: all[ioc.name], integrity: null, scope: (j.devDependencies && j.devDependencies[ioc.name]) ? 'dev' : 'prod', direct: true, introducedAt: null, removedAt: null, commits: [], resolved: false, pipelines: 0, sbomConfirmed: false, execs: [] });
            break;
          }
        } catch { /* manifeste illisible */ }
      }
    }
    return exposures;
  }

  // ── Exécution : les commits exposés ont-ils déclenché des pipelines / SBOM ? ──
  //  Capture aussi les RUNNERS des jobs exposés (input de la tranche privilèges).
  async function brExecution(exp, ioc) {
    if (!exp.commits.length) return;
    exp.runners = exp.runners || [];
    const seenPipe = new Set(), seenRunner = new Set();
    for (const sha of exp.commits.slice(0, 6)) {
      if (aborted) break;
      if (sha === 'HEAD' || sha === exp.repo.defaultBranch) continue;
      const pipes = await fetchGL(`/projects/${exp.repo.id}/pipelines?sha=${encodeURIComponent(sha)}&per_page=20`);
      if (!Array.isArray(pipes)) continue;
      for (const p of pipes) {
        if (seenPipe.has(p.id)) continue; seenPipe.add(p.id);
        exp.pipelines++;
        const at = p.created_at ? Date.parse(p.created_at) : (exp.introducedAt || null);
        exp.execs.push({ at: at, level: 'executed', pipeline: p.id, status: p.status });
        const jobs = await fetchGL(`/projects/${exp.repo.id}/pipelines/${p.id}/jobs?per_page=100`);
        if (!Array.isArray(jobs)) continue;
        for (const job of jobs) {
          // Runner du job exposé (métadonnées API ; privileged/socket = infra, hors API).
          if (job.runner && !seenRunner.has(job.runner.id)) {
            seenRunner.add(job.runner.id);
            exp.runners.push({ id: job.runner.id, description: job.runner.description || ('runner ' + job.runner.id), is_shared: !!job.runner.is_shared, runner_type: job.runner.runner_type || '', tags: job.runner.tag_list || [] });
          }
          // SBOM : artefact CycloneDX → preuve « Confirmé ».
          if (!exp.sbomConfirmed) {
            const arts = job.artifacts || [];
            const sbomArt = arts.find(a => a.file_type === 'cyclonedx' || (a.filename && BR_SBOM_RE.test(a.filename)));
            if (sbomArt) {
              const txt = await brFetchText(`/projects/${exp.repo.id}/jobs/${job.id}/artifacts/${encodeURIComponent(sbomArt.filename)}`);
              if (txt) { try { if (brSbomHasComponent(JSON.parse(txt), ioc.name, ioc.version)) { exp.sbomConfirmed = true; exp.execs[exp.execs.length - 1].level = 'confirmed'; } } catch {} }
            }
          }
        }
      }
    }
  }

  // ── PRIVILÈGES (tranche 2) — qu'est-ce que les jobs exposés pouvaient atteindre ? ──
  //  Métadonnées SEULEMENT (jamais les valeurs de variables). État ACTUEL, pas au
  //  moment du job → confidence: current_state_only + privilege_snapshot_at.
  const _privCache = new Map();   // repo.id → privilèges projet (mutualisé entre expositions)
  async function brProjectPrivileges(repo) {
    if (_privCache.has(repo.id)) return _privCache.get(repo.id);
    const out = { secrets: [], secretsForbidden: false, jobToken: null, registry: false, snapshotAt: new Date().toISOString(), confidence: 'current_state_only' };
    // Variables CI/CD du projet : l'API renvoie la valeur → on la JETTE, on ne
    // garde que les métadonnées de protection.
    const vr = await fetchGLStatus(`/projects/${repo.id}/variables?per_page=100`);
    if (vr.status === 403) out.secretsForbidden = true;
    else if (Array.isArray(vr.data)) out.secrets = vr.data.map(v => ({ key: v.key, type: v.variable_type || 'env_var', protected: !!v.protected, masked: !!v.masked, scope: v.environment_scope || '*' }));
    // Portée du CI_JOB_TOKEN (peut ouvrir l'accès à d'autres projets).
    const jt = await fetchGLStatus(`/projects/${repo.id}/job_token_scope`);
    if (jt.status >= 200 && jt.status < 300 && jt.data) out.jobToken = { inbound: !!jt.data.inbound_enabled, outbound: !!jt.data.outbound_enabled };
    // Registry conteneur présent → un job peut y pousser via CI_REGISTRY_* (write).
    const reg = await fetchGLStatus(`/projects/${repo.id}/registry/repositories?per_page=1`);
    out.registry = Array.isArray(reg.data) && reg.data.length > 0;
    _privCache.set(repo.id, out);
    return out;
  }
  async function brPrivileges(exp) {
    const p = await brProjectPrivileges(exp.repo);
    const hasSecrets = !p.secretsForbidden && p.secrets.length > 0;
    const writeCapable = !!(p.registry || (p.jobToken && p.jobToken.outbound));
    const sharedRunner = (exp.runners || []).some(r => r.is_shared || r.runner_type === 'instance_type');
    exp.priv = Object.assign({}, p, { hasSecrets, writeCapable, sharedRunner, runners: exp.runners || [] });
  }

  // ── PROPAGATION (tranche 3) — qu'est-ce que les jobs exposés ont fabriqué ? ──
  //  Packages publiés, images registry, déploiements (jusqu'où en prod), et
  //  pipelines consommateurs (récursif borné, profondeur 2, marqueur de troncature).
  //  Les caches sont opaques côté API → non calculés (heuristique à brancher sur la config).
  const _propCache = new Map();   // repo.id → sorties projet (packages/images/deployments/env)
  async function brProjectOutputs(repo) {
    if (_propCache.has(repo.id)) return _propCache.get(repo.id);
    const out = { packages: [], images: [], deployments: [], environments: [] };
    const pk = await fetchGL(`/projects/${repo.id}/packages?per_page=100`); if (Array.isArray(pk)) out.packages = pk;
    const im = await fetchGL(`/projects/${repo.id}/registry/repositories?per_page=100`); if (Array.isArray(im)) out.images = im;
    const dep = await fetchGL(`/projects/${repo.id}/deployments?per_page=100&order_by=created_at&sort=desc`); if (Array.isArray(dep)) out.deployments = dep;
    const env = await fetchGL(`/projects/${repo.id}/environments?per_page=100`); if (Array.isArray(env)) out.environments = env;
    _propCache.set(repo.id, out);
    return out;
  }
  // Pipelines consommateurs via les bridges (child + multi-projets), profondeur bornée.
  async function brDownstream(exp) {
    const consumers = new Set(); let truncated = false;
    const MAX_DEPTH = 2, MAX_SEED = 4; let budget = 30;
    const queue = (exp.execs || []).filter(x => x.pipeline).slice(0, MAX_SEED).map(x => ({ pid: x.pipeline, projId: exp.repo.id, depth: 0 }));
    while (queue.length && budget-- > 0 && !aborted) {
      const { pid, projId, depth } = queue.shift();
      const bridges = await fetchGL(`/projects/${projId}/pipelines/${pid}/bridges?per_page=50`);
      if (!Array.isArray(bridges)) continue;
      for (const b of bridges) {
        const dp = b.downstream_pipeline; if (!dp) continue;
        if (dp.project_id && dp.project_id !== exp.repo.id) consumers.add(dp.project_id);
        if (depth + 1 < MAX_DEPTH) queue.push({ pid: dp.id, projId: dp.project_id, depth: depth + 1 });
        else truncated = true;
      }
    }
    return { consumers: [...consumers], truncated };
  }
  async function brPropagation(exp) {
    const sinceMs = exp.introducedAt || (exp.execs[0] && exp.execs[0].at) || 0;
    const o = await brProjectOutputs(exp.repo);
    const after = iso => { const t = Date.parse(iso); return isFinite(t) ? t >= sinceMs : true; };
    const packages = (o.packages || []).filter(p => after(p.created_at));
    const deployments = (o.deployments || []).filter(d => after(d.created_at));
    const isProd = name => /prod/i.test(name || '');
    const prodEnvs = (o.environments || []).filter(e => e.tier === 'production' || isProd(e.name));
    const prodActive = prodEnvs.some(e => e.state === 'available' && e.last_deployment && after(e.last_deployment.created_at));
    const prodDeployed = prodActive || deployments.some(d => isProd(d.environment && d.environment.name));
    const ds = await brDownstream(exp);
    exp.prop = { packages, images: o.images || [], deployments, published: packages.length > 0, prodDeployed, prodActive, downstream: ds.consumers, truncated: ds.truncated };
  }

  // ── COMPORTEMENT SUSPECT (statique) — empreintes, PAS de la télémétrie runtime ──
  //  On lit ce que GitLab expose (install scripts, .gitlab-ci.yml, Dockerfile) et on
  //  cherche les FINGERPRINTS de download-and-exec, reverse-shell, base64|sh, etc.
  //  Le vrai runtime (processus/réseau/K8s) demande un agent (Falco/eBPF) — hors périmètre.
  const _behCache = new Map();   // repo.id → empreintes des fichiers de config du repo
  async function brRepoBehavior(repo) {
    if (_behCache.has(repo.id)) return _behCache.get(repo.id);
    const tree = await getFileTree(repo.id).catch(() => []);
    const ref = repo.defaultBranch || 'HEAD';
    const findings = [];
    // 1) package.json : scripts de cycle de vie (le vecteur des postinstall malveillants)
    const HOOKS = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly'];
    for (const f of (tree || []).filter(p => p.split('/').pop() === 'package.json').slice(0, 3)) {
      const c = await getFileContent(repo.id, f, ref); if (!c) continue;
      try { const j = JSON.parse(c); const s = j.scripts || {}; HOOKS.forEach(h => { if (typeof s[h] === 'string') brScanText(s[h], `${f} (${h})`).forEach(x => findings.push(x)); }); } catch { /* json invalide */ }
    }
    // 2) .gitlab-ci.yml (+ variantes)
    for (const f of (tree || []).filter(p => /^\.gitlab-ci(\..+)?\.ya?ml$/i.test(p.split('/').pop())).slice(0, 3)) {
      const c = await getFileContent(repo.id, f, ref); brScanText(c, f).forEach(x => findings.push(x));
    }
    // 3) Dockerfile(s)
    for (const f of (tree || []).filter(p => { const n = p.split('/').pop(); return n === 'Dockerfile' || /\.dockerfile$/i.test(n) || /^Dockerfile\./i.test(n); }).slice(0, 3)) {
      const c = await getFileContent(repo.id, f, ref); brScanText(c, f).forEach(x => findings.push(x));
    }
    const res = { findings };
    _behCache.set(repo.id, res);
    return res;
  }
  async function brBehavior(exp) {
    const r = await brRepoBehavior(exp.repo);
    const red = r.findings.filter(f => f.sev === 'red').length;
    exp.behavior = { installScript: !!exp.installScript, findings: r.findings, red: red, suspicious: !!exp.installScript || r.findings.length > 0 };
  }

  // ── Orchestration ──
  async function osvPost(pathAbs, body) {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(OSV_BASE + pathAbs, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (r.status === 429 || r.status >= 500) { await sleep(1000 * (i + 1)); continue; }
        if (!r.ok) return null;
        return await r.json();
      } catch { await sleep(1000 * (i + 1)); }
    }
    return null;
  }
  async function osvGet(pathAbs) {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(OSV_BASE + pathAbs);
        if (r.status === 429 || r.status >= 500) { await sleep(1000 * (i + 1)); continue; }
        if (!r.ok) return null;
        return await r.json();
      } catch { await sleep(1000 * (i + 1)); }
    }
    return null;
  }

  // ── PUR : gravité d'un avis OSV (packages malveillants prioritaires) ──
  async function discInventory(eco, limit, onProg) {
    const repos = await listAccessibleRepos(n => onProg(`Énumération… ${fmt(n)} repos`), limit);
    const inv = new Map();   // "name@version" → { name, version, dev, repos:Map(id→repo) }
    let done = 0, idx = 0; const CONC = 4;
    async function worker() {
      while (idx < repos.length && !aborted) {
        const repo = repos[idx++];
        onProg(`Inventaire : ${repo.path} (${fmt(done)}/${fmt(repos.length)})`);
        const tree = await getFileTree(repo.id).catch(() => []);
        const locks = (tree || []).filter(p => (BR_LOCKFILES[eco] || []).includes(p.split('/').pop().toLowerCase()));
        for (const lock of locks) {
          if (aborted) break;
          const content = await getFileContent(repo.id, lock, repo.defaultBranch || 'HEAD');
          if (!content) continue;
          const entries = brParseLock(lock, content) || [];
          for (const e of entries) {
            if (!e.name || !e.version) continue;
            const key = e.name + '@' + e.version;
            let rec = inv.get(key);
            if (!rec) { rec = { name: e.name, version: e.version, dev: e.dev, repos: new Map() }; inv.set(key, rec); }
            rec.repos.set(repo.id, repo);
          }
        }
        done++;
      }
    }
    await Promise.all(Array.from({ length: CONC }, () => worker()));
    return { inv, reposCount: repos.length };
  }

  // ── Croisement OSV en lots ──
  async function discQueryOSV(components, eco, onProg) {
    const flaggedIds = new Map();   // "name@version" → [ids]
    const ecosystem = OSV_ECO[eco] || 'npm';
    const CH = 500;   // OSV querybatch : 1000 max, on reste prudent
    for (let i = 0; i < components.length && !aborted; i += CH) {
      const chunk = components.slice(i, i + CH);
      onProg(`Croisement OSV.dev… ${fmt(Math.min(i + CH, components.length))}/${fmt(components.length)}`);
      const body = { queries: chunk.map(c => ({ package: { name: c.name, ecosystem }, version: c.version })) };
      const res = await osvPost('/v1/querybatch', body);
      const arr = (res && res.results) || [];
      chunk.forEach((c, j) => {
        const vulns = arr[j] && arr[j].vulns;
        if (vulns && vulns.length) flaggedIds.set(c.name + '@' + c.version, vulns.map(v => v.id));
      });
    }
    return flaggedIds;
  }
