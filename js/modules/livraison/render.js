/* livraison · render.js — rendu DOM (liste, détail, analyse IA, train) (chargé en 4e). */

'use strict';

  const $ = (id) => document.getElementById(id);
  let toastT;
  function toast(msg) { const el = $('toast'); if (!el) return; el.innerHTML = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3600); }

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
        ${(m.head_pipeline && m.head_pipeline.id) ? `<button class="pill g" id="btnTrain" style="all:unset;cursor:pointer;display:inline-flex" data-pipe="${m.head_pipeline.id}">🚂 voir le train</button>` : ''}
        <button class="pill g" id="btnAI" style="all:unset;cursor:pointer;display:inline-flex">🤖 Analyse IA</button>
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
    const bt = $('btnTrain'); if (bt) bt.addEventListener('click', () => showTrain(parseInt(bt.dataset.pipe, 10), { delivery: false }));
    const bai = $('btnAI'); if (bai) bai.addEventListener('click', () => runAI(m.iid));
    // dépliage des diffs
    d.querySelectorAll('[data-diff]').forEach(h => h.addEventListener('click', () => {
      const el = $('diff-' + h.dataset.diff); if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }));
  }

  // ══════════════════════════════════════════════════════════════════
  // ASSISTANT IA — un bouton sur la MR → analyse par le backend IA LCL.
  // L'URL de l'assistant se colle dans localStorage 'mr_reviewer_api_url'
  // (ou window.MR_REVIEWER_API_URL). Rien n'est stocké tant qu'elle n'est
  // pas fournie ; l'IA reste un assistant (elle propose, l'humain décide).
  // ══════════════════════════════════════════════════════════════════
  function renderAiAnalysis(a, iid) {
    const dec = a.decision === 'REJECT' ? ['❌', 'Rejet recommandé', 'var(--err)']
      : a.decision === 'CHANGES_REQUESTED' ? ['📝', 'Changements suggérés', 'var(--warn)']
      : ['✅', 'Prêt à merger', 'var(--ok)'];
    const sc = a.scores || {};
    const scoreRow = [['Global', sc.global], ['🔒 Sécu', sc.security], ['📐 Qualité', sc.quality], ['⚡ Perf', sc.performance]].map(s => aiScore(s[0], s[1])).join('');
    const sec = (title, arr, color) => (arr && arr.length)
      ? `<div style="margin-top:14px"><div style="font-weight:700;font-size:12px;color:${color};margin-bottom:6px">${title} (${arr.length})</div>${arr.map(aiFinding).join('')}</div>` : '';
    return `
      <div style="display:flex;align-items:center;gap:12px;border:1px solid ${dec[2]};background:rgba(255,255,255,.03);border-radius:12px;padding:12px 14px;margin-bottom:14px">
        <div style="font-size:26px">${dec[0]}</div>
        <div><div style="font-weight:800;color:${dec[2]}">${dec[1]}</div><div style="font-size:12px;color:var(--tm)">${esc(a.summary || '')}</div></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${scoreRow}</div>
      ${sec('🔴 Critiques', a.critical_issues, 'var(--err)')}
      ${sec("🟡 Points d'attention", a.warnings, 'var(--warn)')}
      ${sec('✓ Points positifs', a.positives, 'var(--ok)')}
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="btn ghost" id="aiComment" style="cursor:pointer">💬 Commenter la MR avec l'analyse</button>
      </div>
      <div style="font-size:11px;color:var(--tm);margin-top:12px">Analyse IA — indicative. Tu approuves / merges comme d'habitude.</div>`;
  }
  function aiScore(label, val) {
    const shown = (val == null) ? '—' : val;
    const col = val == null ? 'var(--tm)' : (val >= 80 ? 'var(--ok)' : val >= 50 ? 'var(--warn)' : 'var(--err)');
    return `<div style="flex:1;min-width:70px;text-align:center;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 4px"><div style="font-size:20px;font-weight:800;color:${col}">${shown}</div><div style="font-size:10px;color:var(--tm)">${label}</div></div>`;
  }
  function aiFinding(f) {
    const sev = (f.severity === 'critical' || (f.title || '').includes('❌')) ? '🔴' : f.severity === 'positive' ? '✓' : '🟡';
    return `<div style="border-left:2px solid rgba(255,255,255,.12);padding:6px 10px;margin-bottom:6px;background:rgba(255,255,255,.02);border-radius:6px">
      <div style="font-size:12.5px;font-weight:600">${sev} ${esc(f.title || '')}${f.location ? ` <span style="color:var(--tm);font-weight:400">· ${esc(f.location)}</span>` : ''}</div>
      ${f.description ? `<div style="font-size:11.5px;color:var(--tm);margin-top:2px">${esc(f.description)}</div>` : ''}</div>`;
  }
  function aiConfigForm(msg) {
    return `<div style="font-size:13px;margin-bottom:8px">${esc(msg || '')}</div>
      <div style="font-size:12px;color:var(--tm);margin-bottom:8px">Colle l'URL de l'assistant IA LCL, puis relance l'analyse :</div>
      <div style="display:flex;gap:8px"><input id="aiUrlIn" placeholder="https://mr-reviewer-api.lcl.internal" value="${esc(aiUrl())}" style="flex:1;background:#0a0716;border:1px solid rgba(255,255,255,.14);border-radius:8px;color:#f5f1ff;padding:8px 10px;font-family:var(--fm)"><button class="btn" id="aiUrlSave" style="cursor:pointer">Enregistrer &amp; analyser</button></div>`;
  }
  function wireAiConfig(iid) {
    const s = $('aiUrlSave'); if (!s) return;
    s.addEventListener('click', () => {
      const v = ($('aiUrlIn') || {}).value;
      if (v && v.trim()) { localStorage.setItem('mr_reviewer_api_url', v.trim()); window.MR_REVIEWER_API_URL = v.trim(); runAI(iid); }
      else toast('⚠️ Renseigne une URL.');
    });
  }
  function aiModal(inner) {
    let ov = $('aiOverlay');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'aiOverlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(6,4,14,.72);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto';
      ov.addEventListener('click', e => { if (e.target === ov) closeAiModal(); });
      document.body.appendChild(ov);
    }
    ov.innerHTML = `<div style="width:100%;max-width:620px;background:#17122b;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:20px 22px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><div style="font-size:16px;font-weight:800">🤖 Analyse IA de la MR</div><div style="flex:1"></div><button id="aiClose" style="all:unset;cursor:pointer;font-size:18px;color:var(--tm)">✕</button></div>
      ${inner}</div>`;
    ov.style.display = 'flex';
    const c = $('aiClose'); if (c) c.addEventListener('click', closeAiModal);
  }
  function closeAiModal() { const ov = $('aiOverlay'); if (ov) ov.style.display = 'none'; }

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
  function renderPrepTarget() { const el = $('prepTgt'); if (el) el.textContent = prepTarget() || '—'; }

  // Découverte dynamique des overlays kustomize (les chemins varient d'un repo
  // à l'autre : Manifests/overlays/…, deploy/…, k8s/… etc.). On liste l'arbre du
  // repo et on retient tous les kustomization.ya?ml — le bump ne touchera que
  // ceux qui portent réellement un newTag/APP_VERSION.
  function renderTrain(pipeline, jobs) {
    const st = $('trainStatus');
    if (st) { st.textContent = (PIPE_ICON[pipeline.status] || '') + ' ' + pipeline.status; st.className = 'pill ' + (pipeline.status === 'success' ? 'ok' : pipeline.status === 'failed' ? 'err' : 'run'); }
    // regroupe par stage en conservant l'ordre d'apparition
    const order = [], byStage = {};
    jobs.forEach(j => { const s = j.stage || '—'; if (!byStage[s]) { byStage[s] = []; order.push(s); } byStage[s].push(j); });
    const train = $('train');
    if (train) {
      train.innerHTML = order.map((s, i) => {
        const cls = stageStatus(byStage[s]);
        const ic = cls === 'success' ? '✓' : cls === 'failed' ? '✕' : cls === 'running' ? '🔄' : '•';
        const rail = i ? `<div class="rail ${stageStatus(byStage[order[i - 1]]) === 'success' ? 'done' : ''}"></div>` : '';
        return rail + `<div class="stg ${cls === 'success' ? 'done' : cls === 'running' ? 'run' : cls === 'failed' ? 'fail' : ''}"><div class="ic">${ic}</div><div class="nm">${esc(s)}</div></div>`;
      }).join('');
    }
    const jc = $('trainJobs');
    if (jc) {
      jc.innerHTML = jobs.map(j => `<button class="jobchip ${j.status} ${curJobId === j.id ? 'on' : ''}" data-job="${j.id}" data-jobname="${esc(j.name)}">${PIPE_ICON[j.status] || '•'} ${esc(j.name)}${j.duration ? ` · ${fmtDur(j.duration)}` : ''}</button>`).join('');
      jc.querySelectorAll('.jobchip').forEach(b => b.addEventListener('click', () => selectJob(parseInt(b.dataset.job, 10), b.dataset.jobname)));
    }
  }
