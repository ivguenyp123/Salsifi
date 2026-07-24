/* Livraison — cockpit MR (module réel, câblé GitLab).
 * Tranche 1 : liste MR réelle + filtre par auteur + détail (diff, approbations,
 * pipeline) + actions réelles (approuver / merger / fermer / commenter).
 * Réutilise le socle plateforme : Salsifi.loadAuth / gitlabFetch / gitlabPaginate /
 * escapeHtml (mêmes appels que mr-reviewer, éprouvés). Aucune donnée fictive.
 *
 * Tranche 2 : Préparer (choisir branche + bump IMAGE_TAG + sync overlays + créer MR).
 * TODO tranche 3 : suivi du train de pipeline + logs après merge.
 */
(function () {
  'use strict';
  const HUB_URL = 'hub.html';
  let GITLAB_URL = null, TOKEN = null, PROJECT_ID = null, PROJECT_PATH = '', USERNAME = '', DEFAULT_BRANCH = 'main';
  let mrList = [], selected = null, authorFilter = '', busy = false;
  // Tranche 2 — préparation : bump IMAGE_TAG + sync overlays + création de MR.
  let branches = [], prepBranch = '', prepBumpType = 'minor', prepCurTag = '';
  const IMAGE_TAG_RX = /^(\s*IMAGE_TAG:\s*)(["']?)([^"'\n]+)(["']?)(\s*)$/m;
  const OVERLAY_PATHS = ['Manifests/overlays/development/kustomization.yaml', 'Manifests/overlays/uat/kustomization.yaml'];

  const $ = (id) => document.getElementById(id);
  const esc = (v) => (window.Salsifi && window.Salsifi.escapeHtml) ? window.Salsifi.escapeHtml(v) : String(v == null ? '' : v);
  const glFetch = (ep, init) => window.Salsifi.gitlabFetch(GITLAB_URL, TOKEN, ep, init);
  const glAll = (ep) => window.Salsifi.gitlabPaginate(GITLAB_URL, TOKEN, ep, { throwOnError: true });
  const initials = (n) => (n || '?').split(/[\s_.@-]/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?';
  const timeAgo = (iso) => {
    if (!iso) return '';
    const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return s + ' s'; if (s < 3600) return Math.round(s / 60) + ' min';
    if (s < 86400) return Math.round(s / 3600) + ' h'; return Math.round(s / 86400) + ' j';
  };

  let toastT;
  function toast(msg) { const el = $('toast'); if (!el) return; el.innerHTML = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3600); }

  async function init() {
    const auth = window.Salsifi.loadAuth({ redirect: false });
    if (!auth) { location.href = 'login.html'; return; }
    TOKEN = auth.token; GITLAB_URL = auth.gitlabUrl; USERNAME = auth.username || '';
    PROJECT_ID = new URLSearchParams(location.search).get('repo') || localStorage.getItem('hub_selected_repo_id');
    if (!PROJECT_ID) { location.href = HUB_URL; return; }
    document.querySelectorAll('[data-hub]').forEach(a => { a.href = HUB_URL; });
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

  function populateAuthors() {
    const sel = $('who'); if (!sel) return;
    const authors = [...new Set(mrList.map(m => (m.author && m.author.username) || '?'))].sort();
    const cur = sel.value;
    sel.innerHTML = '<option value="">Tous</option>' + authors.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
    if (authors.includes(cur)) sel.value = cur;
    authorFilter = sel.value;
  }

  function renderList() {
    const c = $('list'); if (!c) return;
    const rows = mrList.filter(m => !authorFilter || (m.author && m.author.username) === authorFilter);
    const cnt = $('mrcount'); if (cnt) cnt.textContent = rows.length + ' MR ouvertes';
    if (!rows.length) { c.innerHTML = '<div class="d-empty">Aucune MR ouverte' + (authorFilter ? ' pour ce créateur.' : '.') + '</div>'; return; }
    c.innerHTML = rows.map(m => {
      const av = initials((m.author && (m.author.name || m.author.username)) || '');
      const pipe = m.head_pipeline && m.head_pipeline.status;
      const pipeCls = pipe === 'success' ? 'pipe-ok' : (pipe === 'running' || pipe === 'pending') ? 'pipe-run' : '';
      const pipeDot = pipeCls ? `<span class="dot2 ${pipeCls}" title="pipeline ${esc(pipe)}"></span>` : '';
      return `<div class="mri ${selected === m.iid ? 'sel' : ''}" data-iid="${m.iid}">
        <div class="ava" style="background:#7c5cfc">${esc(av)}</div>
        <div class="ti"><div class="tt">!${m.iid} · ${esc(m.title)}</div>
          <div class="ts">${esc((m.author && m.author.username) || '?')} · ${esc(m.source_branch)} → ${esc(m.target_branch)} · il y a ${timeAgo(m.created_at)}</div></div>
        ${pipeDot}</div>`;
    }).join('');
    c.querySelectorAll('.mri').forEach(el => el.addEventListener('click', () => selectMR(parseInt(el.dataset.iid, 10))));
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

  function renderDetail(m, changes, approvals, notes) {
    const mine = (m.author && m.author.username) === USERNAME;
    const need = approvals ? (approvals.approvals_required || 0) : 0;
    const got = approvals ? (approvals.approved_by ? approvals.approved_by.length : (need - (approvals.approvals_left || 0))) : 0;
    const okAppr = need > 0 ? got >= need : true;
    const iApproved = approvals && approvals.approved_by && approvals.approved_by.some(a => a.user && a.user.username === USERNAME);
    const pipe = m.head_pipeline && m.head_pipeline.status;
    const files = (changes && changes.changes) || [];
    const dots = need > 0 ? Array.from({ length: need }, (_, i) => `<span class="d ${i < got ? 'on' : ''}"></span>`).join('') : '<span class="d on"></span>';
    const notesList = (notes || []).filter(n => !n.system && n.body);

    const d = $('detail');
    d.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:10px">
        <span style="font-family:var(--fm);font-weight:800;color:var(--accent)">!${m.iid}</span>
        <div><div class="d-title">${esc(m.title)}</div>
          <div class="d-meta">${esc(m.source_branch)} → ${esc(m.target_branch)} · par ${esc((m.author && m.author.username) || '?')} · il y a ${timeAgo(m.created_at)}</div></div>
        <a class="pill g" href="${esc(GITLAB_URL + '/' + PROJECT_PATH + '/-/merge_requests/' + m.iid)}" target="_blank" rel="noopener" style="margin-left:auto;text-decoration:none">GitLab ↗</a></div>
      <div>
        ${pipe ? `<span class="pill ${pipe === 'success' ? 'ok' : 'run'}">${pipe === 'success' ? '✅ pipeline OK' : '⏳ ' + esc(pipe)}</span>` : ''}
        <span class="pill g">${files.length} fichier${files.length > 1 ? 's' : ''}</span>
        <span class="pill g">${mine ? '🙋 la tienne' : '👤 ' + esc((m.author && m.author.username) || '?')}</span>
        <span class="pill ${m.merge_status === 'can_be_merged' ? 'ok' : 'g'}">${m.merge_status === 'can_be_merged' ? 'mergeable' : esc(m.merge_status || '')}</span>
      </div>

      <div class="box"><div class="bh">Fichiers (${files.length})</div>
        ${files.length ? files.map((f, i) => diffRow(f, i)).join('') : '<span style="color:var(--tm);font-size:12px">Diff indisponible.</span>'}</div>

      <div class="box"><div class="bh">Validation</div>
        <div class="appr"><div style="display:flex;gap:5px">${dots}</div>
          <div class="txt">${need > 0 ? (okAppr ? `<b style="color:var(--ok)">Validée ${got}/${need}</b>` : `En attente <b style="color:var(--warn)">${got}/${need}</b>`) : '<span style="color:var(--tm)">Pas de règle d\'approbation</span>'}</div></div></div>

      <div class="box"><div class="bh">💬 Discussion</div>
        <div id="disc">${notesList.length ? notesList.map(noteRow).join('') : '<span style="color:var(--tm);font-size:12px">Aucun commentaire.</span>'}</div>
        <div class="cbox"><textarea id="cin" placeholder="Commenter la MR…"></textarea><button class="btn ghost" id="btnComment">Commenter</button></div></div>

      <div class="roles">
        <div class="role"><div class="rl">👍 relecteur</div><div class="btns">
          <button class="btn ghost" id="btnApprove" ${(mine || iApproved) ? 'disabled' : ''}>${iApproved ? '✅ approuvée par toi' : 'Approuver'}</button></div>
          ${mine ? '<div style="font-size:11px;color:var(--tm);margin-top:7px">Tu es le créateur — un autre approuve.</div>' : ''}</div>
        <div class="role"><div class="rl">🚀 créateur</div><div class="btns">
          <button class="btn ship" id="btnMerge" ${(m.merge_status === 'can_be_merged' && okAppr) ? '' : 'disabled'}>Merger &amp; livrer</button>
          <button class="btn del" id="btnClose">Fermer la MR</button></div>
          ${(m.merge_status !== 'can_be_merged' || !okAppr) ? '<div style="font-size:11px;color:var(--tm);margin-top:7px">Merge possible quand : validée + mergeable (pipeline/conflits OK).</div>' : ''}</div>
      </div>`;

    // câblage des actions réelles
    const cb = $('btnComment'); if (cb) cb.addEventListener('click', () => doComment(m.iid));
    const ba = $('btnApprove'); if (ba && !ba.disabled) ba.addEventListener('click', () => doApprove(m.iid));
    const bm = $('btnMerge'); if (bm && !bm.disabled) bm.addEventListener('click', () => doMerge(m.iid));
    const bc = $('btnClose'); if (bc) bc.addEventListener('click', () => doClose(m.iid));
    // dépliage des diffs
    d.querySelectorAll('[data-diff]').forEach(h => h.addEventListener('click', () => {
      const el = $('diff-' + h.dataset.diff); if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }));
  }

  function diffRow(f, i) {
    const path = f.new_path || f.old_path || '';
    const tag = /(^|\/)\.gitlab-ci\.ya?ml$/.test(path) ? '🏷️' : /kustomization\.ya?ml$/.test(path) ? '🏷️' : (f.new_file ? '🟢' : f.deleted_file ? '🔴' : '📄');
    const diff = (f.diff || '').split('\n').map(l => {
      const e = esc(l);
      if (l.startsWith('+') && !l.startsWith('+++')) return `<span style="color:var(--ok)">${e}</span>`;
      if (l.startsWith('-') && !l.startsWith('---')) return `<span style="color:var(--err)">${e}</span>`;
      if (l.startsWith('@@')) return `<span style="color:var(--info)">${e}</span>`;
      return e;
    }).join('\n');
    return `<div class="f" style="cursor:pointer" data-diff="${i}"><span>${tag}</span><span style="flex:1">${esc(path)}</span><span style="color:var(--tm);font-size:11px">voir diff ▾</span></div>
      <pre id="diff-${i}" style="display:none;white-space:pre-wrap;font-family:var(--fm);font-size:11px;line-height:1.6;background:#0a0716;border-radius:8px;padding:10px 12px;margin:4px 0 8px;overflow:auto;max-height:280px">${diff || '(diff vide)'}</pre>`;
  }
  function noteRow(n) {
    const who = (n.author && (n.author.username || n.author.name)) || '?';
    const av = initials((n.author && n.author.name) || who);
    return `<div class="cmt"><div class="ca" style="background:#7c5cfc">${esc(av)}</div>
      <div><div><span class="cn">${esc(who)}</span><span class="cw">il y a ${timeAgo(n.created_at)}</span></div>
      <div class="ct">${esc(n.body)}</div></div></div>`;
  }

  // ── Actions réelles (mêmes endpoints que mr-reviewer) ──
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
      toast('🚀 MR mergée — la pipeline part.'); selected = null; await loadMRs(); const d = $('detail'); if (d) d.innerHTML = '<div class="d-empty">✅ Mergée. La livraison est en cours côté pipeline.</div>';
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
  async function readFile(path, ref) {
    const r = await glFetch(`/projects/${PROJECT_ID}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`);
    if (!r.ok) return null;
    const d = await r.json().catch(() => null); if (!d || d.content == null) return null;
    try { return decodeURIComponent(escape(atob(d.content))); } catch (e) { try { return atob(d.content); } catch (_) { return null; } }
  }
  function bumpVer(v, type) {
    const m = (v || '').match(/^(\d+)\.(\d+)\.(\d+)/); if (!m) return '';
    let a = +m[1], b = +m[2], c = +m[3];
    if (type === 'major') { a++; b = 0; c = 0; } else if (type === 'minor') { b++; c = 0; } else c++;
    return a + '.' + b + '.' + c;
  }
  function prepTarget() { return bumpVer(prepCurTag, prepBumpType); }
  function renderPrepTarget() { const el = $('prepTgt'); if (el) el.textContent = prepTarget() || '—'; }

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
      // Overlays : best-effort, on n'inclut que ceux qui existent et changent.
      let overlaysTouched = 0;
      for (const path of OVERLAY_PATHS) {
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
      toast(`🔀 MR !${created.iid} « release ${target} » ouverte → ${esc(DEFAULT_BRANCH)}${overlaysTouched ? ' · overlays sync' : ''}.`);
      prepCurTag = target; renderPrepTarget();
      await loadMRs();
      if (created.iid) selectMR(created.iid);
    });
  }

  // exposé pour le filtre + refresh + préparation
  window.livraisonFilter = () => { authorFilter = ($('who') || {}).value || ''; renderList(); };
  window.livraisonRefresh = () => loadMRs();
  window.livraisonPrepBranch = prepOnBranch;
  window.livraisonPrepBump = prepSetBump;
  window.livraisonPrepGo = prepGo;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
