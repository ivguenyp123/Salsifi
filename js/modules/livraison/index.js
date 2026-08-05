/* livraison · index.js — orchestration & câblage (chargé en dernier). */

'use strict';

  async function init() {
    const auth = window.Salsifi.loadAuth({ redirect: false });
    if (!auth) { location.href = 'login.html'; return; }
    TOKEN = auth.token; GITLAB_URL = auth.gitlabUrl; USERNAME = auth.username || '';
    PROJECT_ID = new URLSearchParams(location.search).get('repo') || localStorage.getItem('hub_selected_repo_id');
    if (!PROJECT_ID) { location.href = HUB_URL; return; }
    document.querySelectorAll('[data-hub]').forEach(a => { var _f = new URLSearchParams(location.search).get('from'); a.href = _f ? HUB_URL + '?chemin=' + encodeURIComponent(_f) : HUB_URL; });
    try {
      const r = await glFetch(`/projects/${PROJECT_ID}`);
      if (r.ok) { const p = await r.json(); PROJECT_PATH = p.path_with_namespace || ''; DEFAULT_BRANCH = p.default_branch || 'main'; const el = $('svcName'); if (el) el.textContent = p.name || PROJECT_PATH; }
    } catch (e) { /* non bloquant */ }
    await loadMRs();
    loadBranches(); // asynchrone, ne bloque pas l'affichage des MR
  }

  async function loadMRs() {
    const list = $('list');
    if (list) list.innerHTML = '<div class="d-empty">Chargement des MR…</div>';
    try {
      mrList = await glAll(`/projects/${PROJECT_ID}/merge_requests?state=opened&with_labels_details=false`);
      populateAuthors();
      renderList();
    } catch (e) {
      if (list) list.innerHTML = `<div class="d-empty">⚠️ ${esc(e.message || 'Erreur de chargement')}</div>`;
    }
  }

  async function selectMR(iid) {
    selected = iid; renderList();
    const m = mrList.find(x => x.iid === iid); if (!m) return;
    const d = $('detail');
    d.innerHTML = '<div class="d-empty">Chargement de la MR…</div>';
    // Appels réels en parallèle : diff, approbations, discussion.
    const [changes, approvals, notes] = await Promise.all([
      glFetch(`/projects/${PROJECT_ID}/merge_requests/${iid}/changes`).then(r => r.ok ? r.json() : null).catch(() => null),
      glFetch(`/projects/${PROJECT_ID}/merge_requests/${iid}/approvals`).then(r => r.ok ? r.json() : null).catch(() => null),
      glFetch(`/projects/${PROJECT_ID}/merge_requests/${iid}/notes?sort=asc&per_page=100`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]);
    if (selected !== iid) return; // l'utilisateur a cliqué ailleurs entre-temps
    renderDetail(m, changes, approvals, notes);
  }

  async function runAI(iid) {
    const url = aiUrl();
    if (!url) { aiModal(aiConfigForm("L'assistant IA n'est pas encore configuré.")); wireAiConfig(iid); return; }
    aiModal('<div style="text-align:center;padding:28px;color:var(--tm)">⏳ Analyse IA de la MR en cours…</div>');
    try {
      const r = await fetch(url.replace(/\/+$/, '') + '/api/analyze-from-gitlab', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gitlab_url: GITLAB_URL, project_id: PROJECT_ID, mr_iid: iid, gitlab_token: TOKEN })
      });
      if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('API ' + r.status + (t ? ' — ' + t.slice(0, 160) : '')); }
      const a = await r.json();
      aiModal(renderAiAnalysis(a, iid));
      const bc = $('aiComment'); if (bc) bc.addEventListener('click', () => aiPostComment(iid, a));
    } catch (e) {
      aiModal('<div style="border:1px solid var(--err);background:rgba(248,113,113,.08);border-radius:10px;padding:12px 14px;font-size:13px;color:var(--err)">Analyse indisponible : ' + esc(e.message) + '</div>'
        + '<div style="margin-top:12px">' + aiConfigForm("Vérifie l'URL de l'assistant :") + '</div>');
      wireAiConfig(iid);
    }
  }

  async function guard(fn) { if (busy) return; busy = true; try { await fn(); } finally { busy = false; } }

  function doComment(iid) {
    const ta = $('cin'); const body = (ta && ta.value || '').trim(); if (!body) return;
    guard(async () => {
      const r = await glFetch(`/projects/${PROJECT_ID}/merge_requests/${iid}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
      if (!r.ok) { const b = await r.json().catch(() => ({})); return toast('⚠️ Commentaire refusé : ' + esc(b.message || r.status)); }
      toast('💬 Commentaire posté.'); await selectMR(iid);
    });
  }
  function doApprove(iid) {
    guard(async () => {
      const r = await glFetch(`/projects/${PROJECT_ID}/merge_requests/${iid}/approve`, { method: 'POST' });
      if (!r.ok) { const b = await r.json().catch(() => ({})); return toast('⚠️ Approbation refusée : ' + esc(b.message || r.status)); }
      toast('👍 MR approuvée.'); await selectMR(iid);
    });
  }
  function doMerge(iid) {
    if (!confirm('Merger cette MR ? Le merge déclenche la pipeline (livraison).')) return;
    guard(async () => {
      const r = await glFetch(`/projects/${PROJECT_ID}/merge_requests/${iid}/merge`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (!r.ok) { const b = await r.json().catch(() => ({})); return toast('⚠️ Merge refusé : ' + esc(b.message || r.status)); }
      const merged = await r.json().catch(() => ({}));
      toast('🚀 MR mergée — la pipeline part.'); selected = null; await loadMRs();
      const d = $('detail'); if (d) d.innerHTML = '<div class="d-empty">✅ Mergée. La livraison démarre — suis le train ci-dessous.</div>';
      trackDeliveryPipeline(iid, merged.merge_commit_sha || merged.squash_commit_sha || null); // train du commit de merge uniquement
    });
  }
  function doClose(iid) {
    if (!confirm('Fermer cette MR ?')) return;
    guard(async () => {
      const r = await glFetch(`/projects/${PROJECT_ID}/merge_requests/${iid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state_event: 'close' }) });
      if (!r.ok) { const b = await r.json().catch(() => ({})); return toast('⚠️ Fermeture refusée : ' + esc(b.message || r.status)); }
      toast('🚫 MR fermée.'); selected = null; await loadMRs(); const d = $('detail'); if (d) d.innerHTML = '<div class="d-empty">← Clique une MR pour l\'ouvrir</div>';
    });
  }

  // ── Tranche 2 : préparer une livraison (bump + overlays + MR) ──
  async function prepOnBranch() {
    prepBranch = ($('prepBranch') || {}).value || '';
    prepCurTag = '';
    const curEl = $('prepCur'), tgtEl = $('prepTgt');
    if (!prepBranch) { if (curEl) curEl.textContent = '—'; if (tgtEl) tgtEl.textContent = '—'; return; }
    if (curEl) curEl.textContent = '…';
    const ci = await readFile('.gitlab-ci.yml', prepBranch);
    if (ci != null) { const m = ci.match(IMAGE_TAG_RX); if (m) prepCurTag = m[3].trim(); }
    if (curEl) curEl.textContent = prepCurTag || 'IMAGE_TAG introuvable';
    renderPrepTarget();
  }
  function prepSetBump(type) {
    prepBumpType = type;
    ['major', 'minor', 'patch'].forEach(x => { const b = $('pb-' + x); if (b) b.classList.toggle('on', x === type); });
    renderPrepTarget();
  }

  function prepGo() {
    if (!prepBranch) return toast('⚠️ Choisis une branche à livrer.');
    if (!prepCurTag) return toast('⚠️ IMAGE_TAG introuvable dans le .gitlab-ci.yml de cette branche.');
    const target = prepTarget();
    if (!target) return toast('⚠️ Version courante non SemVer (x.y.z) — bump impossible.');
    if (!confirm(`Préparer la livraison ${target} ?\n\n• branche : ${prepBranch} → ${DEFAULT_BRANCH}\n• IMAGE_TAG : ${prepCurTag} → ${target}\n• sync overlays (si présents)\n• création d'une MR\n\nLe merge de la MR déclenchera la livraison.`)) return;
    guard(async () => {
      const actions = [];
      const ci = await readFile('.gitlab-ci.yml', prepBranch);
      if (ci == null) return toast('⚠️ .gitlab-ci.yml introuvable sur ' + esc(prepBranch));
      const newCi = ci.replace(IMAGE_TAG_RX, (m, p, q, v, q2, s) => p + q + target + q2 + s);
      if (newCi !== ci) actions.push({ action: 'update', file_path: '.gitlab-ci.yml', content: newCi });
      // Overlays : découverts dynamiquement puis bumpés (newTag + APP_VERSION).
      // On n'inclut au commit que ceux qui portent vraiment la version (donc pas
      // le kustomization de base, qui n'a pas de newTag).
      let overlaysTouched = 0;
      const overlayFiles = await findOverlays(prepBranch);
      for (const path of overlayFiles) {
        const c = await readFile(path, prepBranch);
        if (c == null) continue;
        const nc = c.replace(/^(\s*newTag:\s*).*$/gm, `$1"${target}"`).replace(/^(\s*-\s+APP_VERSION=).*$/gm, `$1${target}`);
        if (nc !== c) { actions.push({ action: 'update', file_path: path, content: nc }); overlaysTouched++; }
      }
      if (!actions.length) return toast(`⚠️ Rien à modifier — IMAGE_TAG est peut-être déjà à ${esc(target)}.`);
      // Commit atomique sur la branche.
      const cr = await glFetch(`/projects/${PROJECT_ID}/repository/commits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch: prepBranch, commit_message: `[Livraison] Bump IMAGE_TAG → ${target}`, actions }) });
      if (!cr.ok) { const b = await cr.json().catch(() => ({})); return toast('⚠️ Commit refusé : ' + esc(b.message || cr.status)); }
      // Création de la MR vers la branche par défaut.
      const mr = await glFetch(`/projects/${PROJECT_ID}/merge_requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_branch: prepBranch, target_branch: DEFAULT_BRANCH, title: `release ${target}` }) });
      if (!mr.ok) {
        const b = await mr.json().catch(() => ({}));
        const msg = (b.message || b.error || cr.status); const txt = Array.isArray(msg) ? msg.join(', ') : msg;
        // Cas fréquent : une MR existe déjà pour ce couple de branches → on rafraîchit quand même.
        toast('⚠️ MR non créée : ' + esc(txt) + '. Le commit, lui, est passé.'); prepCurTag = target; await loadMRs(); return;
      }
      const created = await mr.json();
      toast(`🔀 MR !${created.iid} « release ${target} » ouverte → ${esc(DEFAULT_BRANCH)} · ${overlaysTouched ? overlaysTouched + ' overlay(s) sync' : 'aucun overlay trouvé'}.`);
      prepCurTag = target; renderPrepTarget();
      await loadMRs();
      if (created.iid) selectMR(created.iid);
    });
  }

  // ── Tranche 3 : le train de la pipeline + logs en direct ──
  function stopTrain() {
    clearInterval(pipeTimer); clearInterval(logTimer); pipeTimer = logTimer = null; pipeId = null; curJobId = null;
    const sec = $('trainSection'); if (sec) sec.style.display = 'none';
  }

  async function showTrain(pipelineId, opts) {
    opts = opts || {};
    if (!pipelineId) return;
    stopTrain();
    pipeId = pipelineId;
    const sec = $('trainSection'); if (sec) sec.style.display = 'block';
    const t = $('trainTitle'); if (t) t.textContent = (opts.delivery ? '🚀 Livraison en cours' : '🔎 Pipeline de la MR') + ' · #' + pipelineId;
    const gl = $('trainGl'); if (gl) gl.href = `${GITLAB_URL}/${PROJECT_PATH}/-/pipelines/${pipelineId}`;
    const logs = $('trainLogs'); if (logs) logs.innerHTML = '<span style="color:var(--tm)">Sélectionne un job pour voir ses logs…</span>';
    const jn = $('trainJobName'); if (jn) jn.textContent = '';
    if (sec && opts.scroll !== false) sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    await pollPipeline();
    pipeTimer = setInterval(pollPipeline, 3000);
  }

  async function selectJob(jobId, jobName) {
    curJobId = jobId;
    const jn = $('trainJobName'); if (jn) jn.textContent = jobName || '';
    document.querySelectorAll('.jobchip').forEach(b => b.classList.toggle('on', parseInt(b.dataset.job, 10) === jobId));
    clearInterval(logTimer); logTimer = null;
    await fetchLogs();
    const active = document.querySelector('.jobchip.on');
    if (active && active.classList.contains('running')) logTimer = setInterval(fetchLogs, 2500);
  }

  async function trackDeliveryPipeline(iid, sha) {
    // Récupère le sha du commit de merge si la réponse du merge ne l'avait pas.
    for (let i = 0; i < 5 && !sha; i++) {
      try {
        const r = await glFetch(`/projects/${PROJECT_ID}/merge_requests/${iid}`);
        if (r.ok) { const m = await r.json(); sha = m.merge_commit_sha || m.squash_commit_sha || null; }
      } catch (e) { /* retry */ }
      if (!sha) await sleep(1500);
    }
    if (!sha) { toast('ℹ️ Merge OK — sha du commit introuvable. Ouvre la pipeline dans GitLab ↗.'); return; }
    // Attend que la pipeline du commit de merge existe (jusqu'à ~50 s), puis la suit.
    for (let i = 0; i < 20; i++) {
      try {
        const r = await glFetch(`/projects/${PROJECT_ID}/pipelines?sha=${encodeURIComponent(sha)}&per_page=1`);
        if (r.ok) { const a = await r.json(); if (Array.isArray(a) && a.length && a[0].id) { showTrain(a[0].id, { delivery: true }); return; } }
      } catch (e) { /* retry */ }
      await sleep(2500);
    }
    toast('ℹ️ Pipeline de livraison pas encore visible — clique « ↻ Rafraîchir » ou ouvre GitLab ↗.');
  }

  // exposé pour le filtre + refresh + préparation + train
  window.livraisonFilter = () => { authorFilter = ($('who') || {}).value || ''; renderList(); };
  window.livraisonRefresh = () => loadMRs();
  window.livraisonPrepBranch = prepOnBranch;
  window.livraisonPrepBump = prepSetBump;
  window.livraisonPrepGo = prepGo;
  window.livraisonStopTrain = stopTrain;
  window.livraisonToggleScroll = () => { autoScroll = !autoScroll; const b = $('trainScroll'); if (b) b.textContent = '📜 auto-scroll : ' + (autoScroll ? 'ON' : 'OFF'); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
