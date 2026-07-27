/*
 * Salsi — capacités de LIVRAISON (actions réelles, câblées GitLab).
 * ------------------------------------------------------------------
 * Donne à Salsi tout ce que fait le module Livraison, en conversation :
 *   • lister les MR (filtre par auteur)          • détail d'une MR
 *   • approuver / merger & livrer / fermer        • commenter
 *   • préparer une livraison (bump IMAGE_TAG + overlays + MR)
 *   • suivre le train de la pipeline (résumé)
 *
 * Mêmes endpoints que js/livraison.js (éprouvés). Les actions destructrices
 * (merge, fermeture) demandent une CONFIRMATION par bouton dans le chat.
 * Le routeur renvoie {html,intent} ou null (→ Salsi continue son routage).
 *
 * Exposé : Salsifi.livraisonRoute(n,q)  ·  window.salsiLiv(action,arg)
 * S'appuie sur window.salsiQaSay(html) fourni par qa.js pour parler.
 */
(function () {
  'use strict';
  var S = window.Salsifi || (window.Salsifi = {});
  function esc(v) { return S.escapeHtml ? S.escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s\/._-]/g, ' ').replace(/\s+/g, ' ').trim(); }

  var IMAGE_TAG_RX = /^(\s*IMAGE_TAG:\s*)(["']?)([^"'\n]+)(["']?)(\s*)$/m;
  var KUSTO_RX = /(^|\/)kustomization\.ya?ml$/i;

  // ── Contexte repo (auth + repo sélectionné dans le hub) ──
  function ctx() {
    var auth = S.loadAuth ? S.loadAuth({ redirect: false }) : null;
    if (!auth) return { err: 'Reconnecte-toi pour que je puisse agir sur GitLab. 🌱' };
    var pid = S.getRepoId ? S.getRepoId() : null;
    if (!pid) return { err: 'Choisis d\'abord un repo dans le hub (en haut à gauche), puis redis-moi ce que tu veux livrer. 🌱' };
    return { auth: auth, pid: pid, url: auth.gitlabUrl, token: auth.token, me: auth.username || '' };
  }
  function glFetch(c, ep, init) { return S.gitlabFetch(c.url, c.token, ep, init); }
  function glJson(c, ep) { return S.gitlabJson(c.url, c.token, ep); }
  function glAll(c, ep) { return S.gitlabPaginate(c.url, c.token, ep, { throwOnError: false }); }

  function initials(nm) { return (nm || '?').split(/[\s_.@-]/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join('') || '?'; }
  function pipeIcon(s) { return s === 'success' ? '✅' : s === 'failed' ? '❌' : (s === 'running' || s === 'pending') ? '⏳' : s === 'canceled' ? '⏹️' : (s ? '•' : ''); }
  async function readFile(c, path, ref) {
    var r = await glFetch(c, '/projects/' + c.pid + '/repository/files/' + encodeURIComponent(path) + '?ref=' + encodeURIComponent(ref));
    if (!r.ok) return null;
    var d = await r.json().catch(function () { return null; }); if (!d || d.content == null) return null;
    try { return decodeURIComponent(escape(atob(d.content))); } catch (e) { try { return atob(d.content); } catch (_) { return null; } }
  }
  function bumpVer(v, type) {
    var m = (v || '').match(/^(\d+)\.(\d+)\.(\d+)/); if (!m) return '';
    var a = +m[1], b = +m[2], p = +m[3];
    if (type === 'major') { a++; b = 0; p = 0; } else if (type === 'minor') { b++; p = 0; } else p++;
    return a + '.' + b + '.' + p;
  }

  // ── Parsing ──
  function parseIid(n) { var m = n.match(/\b(\d{1,6})\b/); return m ? parseInt(m[1], 10) : null; }
  function parseBump(n) {
    if (/\bmaj(or|eur)?\b|\bmajeure?\b/.test(n)) return 'major';
    if (/\bmin(or|eur)?\b|\bmineure?\b/.test(n)) return 'minor';
    if (/\bpat(ch)?\b|\bcorrectif\b|\bfix\b/.test(n)) return 'patch';
    return 'patch';
  }
  function parseBranch(q) {
    // Depuis la question ORIGINALE (les noms de branche ont des / et des majuscules).
    var m = q.match(/(?:\bsur\b|\bbranche\b|\bdepuis\b|\bde la branche\b)\s+([^\s,;]+)/i);
    if (m && !/^(la|le|les|ma|mon|mes|une|un)$/i.test(m[1])) return m[1];
    var slash = q.match(/([A-Za-z0-9][\w.-]*\/[\w.\/-]+)/); // token type feature/xxx
    if (slash) return slash[1];
    return null;
  }

  // ── Rendu ──
  function mrLine(m) {
    var pipe = m.head_pipeline && m.head_pipeline.status;
    return '🔀 <b>!' + m.iid + '</b> · ' + esc(m.title) + '<br><span class="sqa-hint">'
      + esc((m.author && m.author.username) || '?') + ' · ' + esc(m.source_branch) + ' → ' + esc(m.target_branch)
      + (pipe ? ' · pipeline ' + pipeIcon(pipe) : '') + '</span>';
  }
  function actionsBar(m, appr) {
    var mine = (m.author && m.author.username) === (ctx().me || '');
    var okAppr = appr && appr.approvals_required ? (appr.approvals_left === 0 || (appr.approved_by && appr.approved_by.length >= appr.approvals_required)) : true;
    var canMerge = m.merge_status === 'can_be_merged' && okAppr;
    var b = [];
    if (!mine) b.push('<button class="sqa-liv-btn" onclick="salsiLiv(\'approve\',' + m.iid + ')">👍 Approuver</button>');
    b.push('<button class="sqa-liv-btn ' + (canMerge ? 'go' : 'off') + '"' + (canMerge ? '' : ' disabled') + ' onclick="salsiLiv(\'mergeAsk\',' + m.iid + ')">🚀 Merger &amp; livrer</button>');
    b.push('<button class="sqa-liv-btn danger" onclick="salsiLiv(\'closeAsk\',' + m.iid + ')">✕ Fermer</button>');
    if (m.head_pipeline && m.head_pipeline.id) b.push('<button class="sqa-liv-btn" onclick="salsiLiv(\'train\',' + m.iid + ')">🚂 Le train</button>');
    return '<div class="sqa-liv-actions">' + b.join('') + '</div>';
  }

  // ── Handlers (renvoient {html,intent}) ──
  async function listMRs(n, q) {
    var c = ctx(); if (c.err) return { html: c.err, intent: 'liv_list' };
    var arr = await glAll(c, '/projects/' + c.pid + '/merge_requests?state=opened') || [];
    // filtre par auteur : "MR de dupont"
    var mAuth = q.match(/\bde\s+([A-Za-z0-9._-]{2,})/i);
    var who = mAuth ? norm(mAuth[1]) : '';
    if (who && !/^(la|le|les|mon|ma|mes|repo|projet)$/.test(who)) {
      arr = arr.filter(function (m) { return norm((m.author && m.author.username) || '').indexOf(who) >= 0; });
    }
    if (!arr.length) return { html: '🔀 Aucune MR ouverte' + (who ? ' pour <b>' + esc(who) + '</b>' : '') + '.', intent: 'liv_list' };
    var rows = arr.slice(0, 8).map(function (m) {
      return '<div class="sqa-liv-row" onclick="salsiLiv(\'detail\',' + m.iid + ')">' + mrLine(m) + '</div>';
    }).join('');
    return { html: '🔀 <b>' + arr.length + '</b> MR ouverte(s)' + (who ? ' de <b>' + esc(who) + '</b>' : '') + (arr.length > 8 ? ' (8 affichées)' : '') + ' — clique pour ouvrir :' + rows, intent: 'liv_list' };
  }

  async function mrDetail(iid) {
    var c = ctx(); if (c.err) return { html: c.err, intent: 'liv_detail' };
    var m = await glJson(c, '/projects/' + c.pid + '/merge_requests/' + iid);
    if (!m || !m.iid) return { html: '🔀 Je ne trouve pas la MR <b>!' + esc(iid) + '</b> (ouverte ?).', intent: 'liv_detail' };
    var res = await Promise.all([
      glJson(c, '/projects/' + c.pid + '/merge_requests/' + iid + '/changes'),
      glJson(c, '/projects/' + c.pid + '/merge_requests/' + iid + '/approvals')
    ]);
    var changes = res[0], appr = res[1];
    var files = (changes && changes.changes) || [];
    var pipe = m.head_pipeline && m.head_pipeline.status;
    var need = (appr && appr.approvals_required) || 0;
    var got = appr ? (appr.approved_by ? appr.approved_by.length : Math.max(0, need - (appr.approvals_left || 0))) : 0;
    var html = '🔀 <b>!' + m.iid + '</b> — ' + esc(m.title) + '<br><span class="sqa-hint">'
      + esc(m.source_branch) + ' → ' + esc(m.target_branch) + ' · par ' + esc((m.author && m.author.username) || '?') + '</span><br>'
      + (pipe ? 'pipeline ' + pipeIcon(pipe) + ' ' + esc(pipe) + ' · ' : '')
      + files.length + ' fichier(s) · ' + (need ? 'validation <b>' + got + '/' + need + '</b>' : 'pas de règle d\'appro')
      + ' · ' + (m.merge_status === 'can_be_merged' ? '🟢 mergeable' : esc(m.merge_status || ''))
      + actionsBar(m, appr);
    return { html: html, intent: 'liv_detail' };
  }

  async function doApprove(iid) {
    var c = ctx(); if (c.err) return { html: c.err };
    var r = await glFetch(c, '/projects/' + c.pid + '/merge_requests/' + iid + '/approve', { method: 'POST' });
    if (!r.ok) { var b = await r.json().catch(function () { return {}; }); return { html: '⚠️ Approbation refusée sur <b>!' + esc(iid) + '</b> : ' + esc(b.message || r.status) + '.' }; }
    return { html: '👍 MR <b>!' + esc(iid) + '</b> approuvée. Le créateur peut la merger dès qu\'elle est mergeable.' };
  }
  function mergeAsk(iid) {
    return { html: '🚀 Merger <b>!' + esc(iid) + '</b> déclenche la <b>livraison</b> (merge sur la branche par défaut). On confirme ?<div class="sqa-liv-actions"><button class="sqa-liv-btn go" onclick="salsiLiv(\'merge\',' + iid + ')">✅ Confirmer &amp; livrer</button><button class="sqa-liv-btn" onclick="salsiLiv(\'cancel\',' + iid + ')">Annuler</button></div>' };
  }
  async function doMerge(iid) {
    var c = ctx(); if (c.err) return { html: c.err };
    var r = await glFetch(c, '/projects/' + c.pid + '/merge_requests/' + iid + '/merge', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (!r.ok) { var b = await r.json().catch(function () { return {}; }); return { html: '⚠️ Merge refusé sur <b>!' + esc(iid) + '</b> : ' + esc(b.message || r.status) + '.' }; }
    var merged = await r.json().catch(function () { return {}; });
    var sha = merged.merge_commit_sha || merged.squash_commit_sha || null;
    var head = '🚀 <b>!' + esc(iid) + '</b> mergée — la livraison part ! ';
    var pl = await findDeliveryPipeline(c, sha);
    if (pl) return { html: head + '<br>' + trainText(c, pl) + refreshBar(pl.id) + openBtn(c) };
    return { html: head + '<br><span class="sqa-hint">Pipeline de livraison pas encore visible.</span>' + refreshBarSha(sha) + openBtn(c) };
  }
  function closeAsk(iid) {
    return { html: '✕ Fermer <b>!' + esc(iid) + '</b> sans la livrer. On confirme ?<div class="sqa-liv-actions"><button class="sqa-liv-btn danger" onclick="salsiLiv(\'close\',' + iid + ')">✕ Confirmer la fermeture</button><button class="sqa-liv-btn" onclick="salsiLiv(\'cancel\',' + iid + ')">Annuler</button></div>' };
  }
  async function doClose(iid) {
    var c = ctx(); if (c.err) return { html: c.err };
    var r = await glFetch(c, '/projects/' + c.pid + '/merge_requests/' + iid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state_event: 'close' }) });
    if (!r.ok) { var b = await r.json().catch(function () { return {}; }); return { html: '⚠️ Fermeture refusée sur <b>!' + esc(iid) + '</b> : ' + esc(b.message || r.status) + '.' }; }
    return { html: '🚫 MR <b>!' + esc(iid) + '</b> fermée.' };
  }
  async function doComment(iid, body) {
    var c = ctx(); if (c.err) return { html: c.err };
    if (!body) return { html: 'Dis-moi le commentaire : « commente la <b>' + esc(iid) + '</b> : ton message ».' };
    var r = await glFetch(c, '/projects/' + c.pid + '/merge_requests/' + iid + '/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: body }) });
    if (!r.ok) { var b = await r.json().catch(function () { return {}; }); return { html: '⚠️ Commentaire refusé sur <b>!' + esc(iid) + '</b> : ' + esc(b.message || r.status) + '.' }; }
    return { html: '💬 Commentaire posté sur <b>!' + esc(iid) + '</b>.' };
  }

  async function findOverlays(c, ref) {
    var tree = await S.gitlabPaginate(c.url, c.token, '/projects/' + c.pid + '/repository/tree?recursive=true&ref=' + encodeURIComponent(ref), { throwOnError: false });
    return (tree || []).filter(function (t) { return t && t.type === 'blob' && KUSTO_RX.test(t.path); }).map(function (t) { return t.path; });
  }
  async function doPrepare(branch, bump) {
    var c = ctx(); if (c.err) return { html: c.err };
    var proj = await glJson(c, '/projects/' + c.pid); var def = (proj && proj.default_branch) || 'main';
    if (branch === def) return { html: '🌿 <b>' + esc(branch) + '</b> est la branche par défaut — on livre <i>depuis une autre branche</i> vers <b>' + esc(def) + '</b>.' };
    var ci = await readFile(c, '.gitlab-ci.yml', branch);
    if (ci == null) return { html: '⚠️ Pas de <code>.gitlab-ci.yml</code> sur <b>' + esc(branch) + '</b> (ou branche introuvable).' };
    var mtag = ci.match(IMAGE_TAG_RX);
    if (!mtag) return { html: '⚠️ Pas d\'<code>IMAGE_TAG</code> dans le <code>.gitlab-ci.yml</code> de <b>' + esc(branch) + '</b>.' };
    var cur = mtag[3].trim(), target = bumpVer(cur, bump);
    if (!target) return { html: '⚠️ Version courante <code>' + esc(cur) + '</code> non SemVer — bump impossible.' };
    var actions = [];
    var newCi = ci.replace(IMAGE_TAG_RX, function (m, p, q1, v, q2, s) { return p + q1 + target + q2 + s; });
    if (newCi !== ci) actions.push({ action: 'update', file_path: '.gitlab-ci.yml', content: newCi });
    var overlays = 0;
    var files = await findOverlays(c, branch);
    for (var i = 0; i < files.length; i++) {
      var oc = await readFile(c, files[i], branch); if (oc == null) continue;
      var nc = oc.replace(/^(\s*newTag:\s*).*$/gm, '$1"' + target + '"').replace(/^(\s*-\s+APP_VERSION=).*$/gm, '$1' + target);
      if (nc !== oc) { actions.push({ action: 'update', file_path: files[i], content: nc }); overlays++; }
    }
    if (!actions.length) return { html: '⚠️ Rien à modifier — <code>IMAGE_TAG</code> est peut-être déjà à <b>' + esc(target) + '</b>.' };
    var cr = await glFetch(c, '/projects/' + c.pid + '/repository/commits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch: branch, commit_message: '[Livraison] Bump IMAGE_TAG → ' + target, actions: actions }) });
    if (!cr.ok) { var eb = await cr.json().catch(function () { return {}; }); return { html: '⚠️ Commit refusé sur <b>' + esc(branch) + '</b> : ' + esc(eb.message || cr.status) + '.' }; }
    var mr = await glFetch(c, '/projects/' + c.pid + '/merge_requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_branch: branch, target_branch: def, title: 'release ' + target }) });
    if (!mr.ok) { var mb = await mr.json().catch(function () { return {}; }); var msg = mb.message || mb.error || cr.status; return { html: '✏️ Bump <b>' + esc(cur) + ' → ' + esc(target) + '</b> commité sur <b>' + esc(branch) + '</b> (' + overlays + ' overlay), mais MR non créée : ' + esc(Array.isArray(msg) ? msg.join(', ') : msg) + '.' }; }
    var created = await mr.json();
    return { html: '✅ Livraison préparée : <code>IMAGE_TAG ' + esc(cur) + ' → ' + esc(target) + '</code> + <b>' + overlays + '</b> overlay(s), MR <b>!' + esc(created.iid) + ' « release ' + esc(target) + ' »</b> ouverte → <b>' + esc(def) + '</b>.' + '<div class="sqa-liv-actions"><button class="sqa-liv-btn" onclick="salsiLiv(\'detail\',' + created.iid + ')">Ouvrir la MR</button></div>' };
  }

  // ── Train (résumé texte, pas de polling permanent dans le chat) ──
  async function findDeliveryPipeline(c, sha) {
    for (var i = 0; i < 6; i++) {
      if (sha) { var a = await glJson(c, '/projects/' + c.pid + '/pipelines?sha=' + encodeURIComponent(sha) + '&per_page=1'); if (Array.isArray(a) && a.length) return a[0]; }
      await new Promise(function (r) { setTimeout(r, 2000); });
    }
    return null;
  }
  function trainText(c, pipeline) {
    return pipeline._jobsText || ('Pipeline <b>#' + esc(pipeline.id) + '</b> — ' + pipeIcon(pipeline.status) + ' ' + esc(pipeline.status || '') + '.');
  }
  async function trainSummary(pipelineId) {
    var c = ctx(); if (c.err) return { html: c.err, intent: 'liv_train' };
    var res = await Promise.all([
      glJson(c, '/projects/' + c.pid + '/pipelines/' + pipelineId),
      glJson(c, '/projects/' + c.pid + '/pipelines/' + pipelineId + '/jobs?per_page=100')
    ]);
    var pipeline = res[0]; var jobs = res[1];
    if (!pipeline || !pipeline.id) return { html: '🚂 Pipeline <b>#' + esc(pipelineId) + '</b> introuvable.', intent: 'liv_train' };
    jobs = Array.isArray(jobs) ? jobs.slice().sort(function (a, b) { return (a.id || 0) - (b.id || 0); }) : [];
    var order = [], byStage = {};
    jobs.forEach(function (j) { var s = j.stage || '—'; if (!byStage[s]) { byStage[s] = []; order.push(s); } byStage[s].push(j); });
    var line = order.map(function (s) {
      var js = byStage[s], st = js.some(function (j) { return j.status === 'failed'; }) ? 'failed' : js.some(function (j) { return j.status === 'running'; }) ? 'running' : js.every(function (j) { return ['success', 'skipped', 'manual'].indexOf(j.status) >= 0; }) ? 'success' : 'pending';
      return pipeIcon(st) + ' ' + esc(s);
    }).join(' · ');
    var failed = jobs.filter(function (j) { return j.status === 'failed'; }).map(function (j) { return esc(j.name); });
    var html = '🚂 Pipeline <b>#' + esc(pipeline.id) + '</b> — ' + pipeIcon(pipeline.status) + ' <b>' + esc(pipeline.status || '') + '</b><br>' + line
      + (failed.length ? '<br><span class="sqa-hint">❌ échec : ' + failed.join(', ') + '</span>' : '')
      + refreshBar(pipeline.id) + openBtn(c);
    return { html: html, intent: 'liv_train' };
  }
  async function trainForMr(iid) {
    var c = ctx(); if (c.err) return { html: c.err, intent: 'liv_train' };
    var m = await glJson(c, '/projects/' + c.pid + '/merge_requests/' + iid);
    if (!m || !(m.head_pipeline && m.head_pipeline.id)) return { html: '🚂 Pas de pipeline rattachée à <b>!' + esc(iid) + '</b> pour l\'instant.', intent: 'liv_train' };
    return trainSummary(m.head_pipeline.id);
  }
  function refreshBar(pid) { return '<div class="sqa-liv-actions"><button class="sqa-liv-btn" onclick="salsiLiv(\'trainPipe\',' + pid + ')">↻ Actualiser</button></div>'; }
  function refreshBarSha(sha) { return sha ? '<div class="sqa-liv-actions"><button class="sqa-liv-btn" onclick="salsiLiv(\'trainSha\',\'' + esc(sha) + '\')">↻ Chercher la pipeline</button></div>' : ''; }
  function openBtn(c) { return '<div class="sqa-hint">Train live complet → <a href="pipeline-generator.html?repo=' + esc(c.pid) + '" target="_blank" rel="noopener">module Livraison ↗</a></div>'; }

  // ══════════════════════════════════════════════════════════════════
  //  ROUTEUR — appelé par qa.js. Renvoie {html,intent} ou null.
  // ══════════════════════════════════════════════════════════════════
  S.livraisonRoute = async function livraisonRoute(n, q) {
    // Commenter : "commente la 44 : texte"
    if (/\bcommente(r)?\b|\bcommentaire\b/.test(n) && /\d/.test(n)) {
      var iidC = parseIid(n); var mBody = q.split(/[:：]/).slice(1).join(':').trim();
      if (iidC) return await doComment(iidC, mBody);
    }
    // Approuver : "approuve la 44", "valide la mr 44"
    if (/\bapprouv(e|er)\b|\bvalide[rz]?\b.*\bmr\b|\bvalider la mr\b/.test(n) && /\d/.test(n)) {
      var iidA = parseIid(n); if (iidA) return await doApprove(iidA);
    }
    // Fermer : "ferme la 44"
    if (/\bferm(e|er)\b|\bclot(ure|urer)?\b|\bcloture[rz]?\b|\babandonne\b/.test(n) && /\d/.test(n) && /\bmr\b|\d/.test(n)) {
      var iidF = parseIid(n); if (iidF) return closeAsk(iidF);
    }
    // Train / statut : "le train de la 44", "où en est la pipeline 44", "statut livraison"
    if (/\btrain\b|\bou en est\b|\bstatut\b|\bstatus\b|\bavancement\b/.test(n) && /\d/.test(n)) {
      var iidT = parseIid(n); if (iidT) return await trainForMr(iidT);
    }
    // Merger / livrer une MR précise (numéro présent) : "merge la 44", "livre la 44"
    if (/\bmerge[rz]?\b|\bfusionne[rz]?\b|\blivre[rz]?\b|\bmets? en prod\b|\bdeploie\b/.test(n) && /\d/.test(n) && !parseBranch(q)) {
      var iidM = parseIid(n); if (iidM) return mergeAsk(iidM);
    }
    // Préparer une livraison : verbe de prépa/livraison + branche (ou bump) — pas "livrer plus souvent"
    var prepVerb = /\bprepare[rz]?\b|\bpreparer\b|\bbump\b|\bincremente[rz]?\b/.test(n) || (/\blivre[rz]?\b|\bdeploie[rz]?\b|\bmettre en prod\b/.test(n));
    var brc = parseBranch(q);
    if (prepVerb && !/\bsouvent\b|\bfrequence\b|\bplus vite\b|\bregulier/.test(n) && (brc || /\b(patch|minor|mineur|major|majeur|correctif)\b/.test(n))) {
      if (!brc) return { html: 'Sur quelle <b>branche</b> je prépare la livraison ? Ex. « prépare une livraison <b>patch</b> sur <b>feature/xxx</b> ». 🌿', intent: 'liv_prepare' };
      var r = await doPrepare(brc, parseBump(n)); r.intent = 'liv_prepare'; return r;
    }
    // Détail d'une MR : "la mr 44", "montre la 44", "détail 44"
    if (/\bmr\b|\bmerge request\b/.test(n) && /\d/.test(n) && /\b(montre|affiche|detail|ouvre|voir|regarde|la mr|mr numero)\b/.test(n)) {
      var iidD = parseIid(n); if (iidD) return await mrDetail(iidD);
    }
    // Lister les MR : "les MR", "MR à valider", "montre les MR", "mes MR" — mais pas "combien"
    if (/\bmr\b|\bmerge request\b/.test(n) && !/\bcombien\b|\bnombre\b/.test(n)
      && /\b(les mr|mr ouvertes|mr a valider|mr a relire|mr a merger|liste|montre|affiche|mes mr|mr du repo|a livrer|a valider)\b/.test(n)) {
      return await listMRs(n, q);
    }
    return null;
  };

  // ══════════════════════════════════════════════════════════════════
  //  Boutons du chat → window.salsiLiv(action, arg)
  // ══════════════════════════════════════════════════════════════════
  window.salsiLiv = async function (action, arg) {
    var say = window.salsiQaSay || function (h) { console.log('[salsi]', h); return null; };
    if (action === 'cancel') { say('👍 Ok, on ne touche à rien.'); return; }
    var pend = say('⏳ …');
    function done(r) { if (pend) pend.innerHTML = (r && r.html) || '😅 Rien à afficher.'; else say((r && r.html) || ''); }
    try {
      if (action === 'detail') return done(await mrDetail(arg));
      if (action === 'approve') return done(await doApprove(arg));
      if (action === 'mergeAsk') return done(mergeAsk(arg));
      if (action === 'merge') return done(await doMerge(arg));
      if (action === 'closeAsk') return done(closeAsk(arg));
      if (action === 'close') return done(await doClose(arg));
      if (action === 'train') return done(await trainForMr(arg));
      if (action === 'trainPipe') return done(await trainSummary(arg));
      if (action === 'trainSha') { var c = ctx(); if (c.err) return done({ html: c.err }); var pl = await findDeliveryPipeline(c, arg); return done(pl ? await trainSummary(pl.id) : { html: '🚂 Pipeline pas encore visible — réessaie dans un instant.' }); }
      done({ html: 'Action inconnue.' });
    } catch (e) { done({ html: '😅 Échec de l\'action — réessaie.' }); }
  };
})();
