/* livraison · data.js — I/O GitLab (MR, branches, pipelines, logs) (chargé en 2e). */

'use strict';

  const glFetch = (ep, init) => window.Salsifi.gitlabFetch(GITLAB_URL, TOKEN, ep, init);
  const glAll = (ep) => window.Salsifi.gitlabPaginate(GITLAB_URL, TOKEN, ep, { throwOnError: true });
  async function aiPostComment(iid, a) {
    const lines = [];
    lines.push('## 🤖 Analyse IA' + (a.decision ? ' — ' + a.decision : ''));
    if (a.summary) lines.push('', a.summary);
    const block = (title, arr) => { if (arr && arr.length) { lines.push('', '### ' + title); arr.forEach(f => lines.push('- **' + (f.title || '') + '**' + (f.location ? ' _(' + f.location + ')_' : '') + (f.description ? ' — ' + f.description : ''))); } };
    block('🔴 Critiques', a.critical_issues); block("🟡 Points d'attention", a.warnings); block('✓ Points positifs', a.positives);
    const r = await glFetch(`/projects/${PROJECT_ID}/merge_requests/${iid}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: lines.join('\n') }) });
    if (!r.ok) { const b = await r.json().catch(() => ({})); return toast('⚠️ Commentaire refusé : ' + esc(b.message || r.status)); }
    toast('💬 Analyse postée sur la MR.'); closeAiModal(); await selectMR(iid);
  }
  async function readFile(path, ref) {
    const r = await glFetch(`/projects/${PROJECT_ID}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`);
    if (!r.ok) return null;
    const d = await r.json().catch(() => null); if (!d || d.content == null) return null;
    try { return decodeURIComponent(escape(atob(d.content))); } catch (e) { try { return atob(d.content); } catch (_) { return null; } }
  }
  async function findOverlays(ref) {
    try {
      const tree = await window.Salsifi.gitlabPaginate(GITLAB_URL, TOKEN,
        `/projects/${PROJECT_ID}/repository/tree?recursive=true&ref=${encodeURIComponent(ref)}`, { throwOnError: false });
      return (tree || []).filter(t => t && t.type === 'blob' && KUSTO_RX.test(t.path)).map(t => t.path);
    } catch (e) { return []; }
  }

  async function loadBranches() {
    const sel = $('prepBranch'); if (!sel) return;
    const dbl = $('prepDefBr'); if (dbl) dbl.textContent = DEFAULT_BRANCH;
    try {
      branches = await glAll(`/projects/${PROJECT_ID}/repository/branches`);
      const opts = branches.filter(b => b.name !== DEFAULT_BRANCH)
        .map(b => `<option value="${esc(b.name)}">${esc(b.name)}</option>`).join('');
      sel.innerHTML = '<option value="">— choisir une branche —</option>' + opts;
    } catch (e) { sel.innerHTML = '<option value="">erreur de chargement</option>'; }
  }

  async function pollPipeline() {
    if (!pipeId) return;
    try {
      const [pRes, jRes] = await Promise.all([
        glFetch(`/projects/${PROJECT_ID}/pipelines/${pipeId}`),
        glFetch(`/projects/${PROJECT_ID}/pipelines/${pipeId}/jobs?per_page=100`),
      ]);
      if (!pRes.ok || !jRes.ok) return;
      const pipeline = await pRes.json();
      let jobs = await jRes.json();
      // Ordre déterministe : id croissant = ordre de création = ordre des stages
      // (indépendant de l'ordre renvoyé par l'API, qui varie).
      jobs = Array.isArray(jobs) ? jobs.slice().sort((a, b) => (a.id || 0) - (b.id || 0)) : [];
      renderTrain(pipeline, jobs);
      // auto-sélection du job en cours si l'utilisateur n'a rien choisi manuellement
      const running = jobs.find(j => j.status === 'running');
      if (running && curJobId == null) selectJob(running.id, running.name);
      if (['success', 'failed', 'canceled', 'skipped'].includes(pipeline.status)) {
        clearInterval(pipeTimer); pipeTimer = null;
        toast(pipeline.status === 'success' ? '✅ Pipeline terminée — livraison OK.' : '❌ Pipeline ' + esc(pipeline.status) + '.');
      }
    } catch (e) { /* transitoire, on retente au prochain tick */ }
  }

  async function fetchLogs() {
    if (!curJobId) return;
    const el = $('trainLogs'); if (!el) return;
    try {
      const r = await glFetch(`/projects/${PROJECT_ID}/jobs/${curJobId}/trace`);
      if (!r.ok) { el.innerHTML = '<span style="color:var(--tm)">Logs indisponibles (job pas encore démarré ?).</span>'; return; }
      const raw = await r.text();
      const clean = raw.replace(/\x1b\[[0-9;]*m/g, '');
      el.innerHTML = clean.split('\n').map(line => {
        let c = '';
        if (/(?:✅|\bsuccess|SUCCESS)/.test(line)) c = 'ok';
        else if (/(?:❌|\berror|ERROR|fatal|FAIL)/.test(line)) c = 'err';
        else if (/(?:⚠️|warning|WARNING)/.test(line)) c = 'warn';
        else if (/(?:ℹ️|INFO|section_)/.test(line)) c = 'info';
        return `<div class="l"><span class="${c}">${esc(line)}</span></div>`;
      }).join('');
      if (autoScroll) el.scrollTop = el.scrollHeight;
    } catch (e) { /* transitoire */ }
  }

  // Après un merge : suit UNIQUEMENT la pipeline du commit de merge (par sha).
  // On ne prend jamais « la dernière pipeline de la branche » : au moment du
  // merge, la nouvelle pipeline n'existe pas encore, et ce fallback verrouillait
  // sur une ancienne pipeline sans rapport. On patiente qu'elle apparaisse.
