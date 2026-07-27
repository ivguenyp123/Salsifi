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

  // Mémoire de contexte : la dernière MR dont on a parlé, pour comprendre
  // « approuve-la », « merge ça », « ferme-la », « où en est ? » sans répéter le n°.
  var lastMr = null;
  function setLast(i) { if (i) lastMr = parseInt(i, 10); }
  // …et la dernière branche créée/préparée, pour « prépare une livraison » sans re-nommer.
  var lastBranch = null;
  // Échappe une chaîne pour une string JS entre quotes simples dans un onclick.
  function jsq(s) { return String(s).replace(/[\\']/g, '\\$&'); }

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
  function ago(iso) { if (!iso) return ''; var s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000)); if (s < 3600) return Math.round(s / 60) + ' min'; if (s < 86400) return Math.round(s / 3600) + ' h'; return Math.round(s / 86400) + ' j'; }
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
    if (/\bmaj(or|eur)?\b|\bmajeure?\b|\bgrosse? version\b|\bbreaking\b/.test(n)) return 'major';
    // « moyenne » = le chiffre du milieu (Y) = minor, par défaut (à confirmer avec l'équipe).
    if (/\bmin(or|eur)?\b|\bmineure?\b|\bmoyen(ne)?\b|\bintermediaire\b/.test(n)) return 'minor';
    if (/\bpat(ch)?\b|\bcorrectif\b|\bfix\b|\bpetite? version\b/.test(n)) return 'patch';
    return 'patch';
  }
  // Parse « crée une branche <nom> depuis <base> » → {name, base} (depuis q, casse + / préservés).
  function parseNewBranch(q) {
    var base = null;
    var mb = q.match(/(?:depuis|a partir de|à partir de|sur (?:la )?base de|basee? sur|from|en partant de)\s+([A-Za-z0-9][\w.\/-]*)/i);
    if (mb) base = mb[1];
    var qn = q.replace(/(?:depuis|a partir de|à partir de|sur (?:la )?base de|basee? sur|from|en partant de)\s+[A-Za-z0-9][\w.\/-]*/ig, ' ');
    var name = null;
    var slash = qn.match(/([A-Za-z0-9][\w.-]*\/[\w.\/-]+)/); if (slash) name = slash[1];
    if (!name) {
      var af = qn.match(/branche\s+(?:(?:appelee?|nommee?|:)\s+)?["']?([A-Za-z0-9][\w.\/-]{1,})["']?/i);
      if (af && !/^(depuis|de|du|la|le|les|une|un|sur|pour|et|ma|mon|mes)$/i.test(af[1])) name = af[1];
    }
    return { name: name, base: base };
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

  async function whoApproves(iid) {
    var c = ctx(); if (c.err) return { html: c.err, intent: 'liv_who' };
    var res = await Promise.all([
      glJson(c, '/projects/' + c.pid + '/merge_requests/' + iid),
      glJson(c, '/projects/' + c.pid + '/merge_requests/' + iid + '/approvals')
    ]);
    var m = res[0], appr = res[1];
    if (!m || !m.iid) return { html: '🔀 Je ne trouve pas la MR <b>!' + esc(iid) + '</b>.', intent: 'liv_who' };
    var need = (appr && appr.approvals_required) || 0;
    var by = (appr && appr.approved_by || []).map(function (a) { return esc((a.user && a.user.username) || '?'); });
    var got = by.length || (need - ((appr && appr.approvals_left) || 0));
    if (!need) return { html: '🔀 <b>!' + m.iid + '</b> — pas de règle d\'approbation : elle peut être mergée telle quelle (selon la protection de branche).', intent: 'liv_who' };
    var left = Math.max(0, need - got);
    var html = '🔀 <b>!' + m.iid + '</b> — validation <b>' + got + '/' + need + '</b>. '
      + (by.length ? 'Ont approuvé : ' + by.join(', ') + '. ' : 'Personne n\'a encore approuvé. ')
      + (left ? '👉 il manque <b>' + left + '</b> approbation(s).' : '✅ quota atteint.')
      + actionsBar(m, appr);
    return { html: html, intent: 'liv_who' };
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
  // Pas de niveau précisé → on lit la version courante et on propose les 3 cibles en boutons.
  async function prepPreview(branch) {
    var c = ctx(); if (c.err) return { html: c.err, intent: 'liv_prepare' };
    var proj = await glJson(c, '/projects/' + c.pid); var def = (proj && proj.default_branch) || 'main';
    if (branch === def) return { html: '🌿 <b>' + esc(branch) + '</b> est la branche par défaut — on prépare depuis une <i>autre</i> branche vers <b>' + esc(def) + '</b>.', intent: 'liv_prepare' };
    var ci = await readFile(c, '.gitlab-ci.yml', branch);
    if (ci == null) return { html: '⚠️ Pas de <code>.gitlab-ci.yml</code> sur <b>' + esc(branch) + '</b> (ou branche introuvable).', intent: 'liv_prepare' };
    var mt = ci.match(IMAGE_TAG_RX);
    if (!mt) return { html: '⚠️ Pas d\'<code>IMAGE_TAG</code> dans le <code>.gitlab-ci.yml</code> de <b>' + esc(branch) + '</b>.', intent: 'liv_prepare' };
    var cur = mt[3].trim(), maj = bumpVer(cur, 'major'), min = bumpVer(cur, 'minor'), pat = bumpVer(cur, 'patch');
    if (!pat) return { html: '⚠️ Version courante <code>' + esc(cur) + '</code> non SemVer — bump impossible.', intent: 'liv_prepare' };
    lastBranch = branch;
    var head = '📦 Livraison de <b>' + esc(branch) + '</b> — version actuelle <code>' + esc(cur) + '</code>. <b>Quel niveau ?</b>';
    if (!/^[A-Za-z0-9._\/-]+$/.test(branch)) return { html: head + '<br><span class="sqa-hint">Tape « prépare une livraison <b>patch</b> sur ' + esc(branch) +' » (ou minor / major).</span>', intent: 'liv_prepare' };
    var b = jsq(branch);
    var btns = '<div class="sqa-liv-actions">'
      + '<button class="sqa-liv-btn" onclick="salsiLiv(\'prep\',\'' + b + '\',\'major\')">majeur → ' + esc(maj) + '</button>'
      + '<button class="sqa-liv-btn" onclick="salsiLiv(\'prep\',\'' + b + '\',\'minor\')">mineur → ' + esc(min) + '</button>'
      + '<button class="sqa-liv-btn go" onclick="salsiLiv(\'prep\',\'' + b + '\',\'patch\')">patch → ' + esc(pat) + '</button>'
      + '</div>';
    return { html: head + btns, intent: 'liv_prepare' };
  }
  async function doPrepare(branch, bump) {
    var c = ctx(); if (c.err) return { html: c.err };
    lastBranch = branch;
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
    setLast(created.iid);
    return { html: '✅ Livraison préparée : <code>IMAGE_TAG ' + esc(cur) + ' → ' + esc(target) + '</code> + <b>' + overlays + '</b> overlay(s), MR <b>!' + esc(created.iid) + ' « release ' + esc(target) + ' »</b> ouverte → <b>' + esc(def) + '</b>.' + '<div class="sqa-liv-actions"><button class="sqa-liv-btn" onclick="salsiLiv(\'detail\',' + created.iid + ')">Ouvrir la MR</button></div>' };
  }

  // ── Brancher : lister / créer une branche (base selon le flow) ──
  async function branchExists(c, name) { var b = await glJson(c, '/projects/' + c.pid + '/repository/branches/' + encodeURIComponent(name)); return !!(b && b.name); }
  async function listBranches() {
    var c = ctx(); if (c.err) return { html: c.err, intent: 'liv_branches' };
    var proj = await glJson(c, '/projects/' + c.pid); var def = (proj && proj.default_branch) || 'main';
    var arr = await S.gitlabPaginate(c.url, c.token, '/projects/' + c.pid + '/repository/branches', { maxPages: 3, throwOnError: false }) || [];
    if (!arr.length) return { html: '🌿 Aucune branche visible (droits du token ?).', intent: 'liv_branches' };
    arr.sort(function (a, b) { if (a.name === def) return -1; if (b.name === def) return 1; var da = (a.commit && a.commit.committed_date) || '', db = (b.commit && b.commit.committed_date) || ''; return db.localeCompare(da); });
    var rows = arr.slice(0, 15).map(function (b) {
      var age = ago(b.commit && b.commit.committed_date); var tags = [];
      if (b.name === def) tags.push('défaut'); if (b.protected) tags.push('🔒 protégée');
      var meta = tags.concat(age ? ['maj ' + age] : []).join(' · ');
      return '🌿 <code>' + esc(b.name) + '</code>' + (meta ? ' <span class="sqa-hint">' + meta + '</span>' : '');
    }).join('<br>');
    return { html: '🌿 <b>' + arr.length + '</b> branche(s)' + (arr.length > 15 ? ' (15 récentes)' : '') + ' sur ce repo :<br>' + rows, intent: 'liv_branches' };
  }
  async function doCreateBranch(name, base, mentionedFlow) {
    var c = ctx(); if (c.err) return { html: c.err, intent: 'liv_branch' };
    if (!name) return { html: '🌿 Quel nom pour la branche ? Ex. « crée une branche <b>feature/iban</b> depuis <b>main</b> ». (nom libre — feature/…, fix/…, release/…)', intent: 'liv_branch' };
    var proj = await glJson(c, '/projects/' + c.pid); var def = (proj && proj.default_branch) || 'main';
    var autoBase = false;
    if (!base) { base = def; autoBase = true; }
    // Flow gitflow : « depuis develop » / « en gitflow » → develop (ou development).
    if (/^develop/i.test(base) && !(await branchExists(c, base))) {
      var alt = base.toLowerCase() === 'develop' ? 'development' : 'develop';
      if (await branchExists(c, alt)) base = alt;
    }
    if (!(await branchExists(c, base))) return { html: '⚠️ La branche de base <b>' + esc(base) + '</b> n\'existe pas ici. Dis-moi depuis quelle branche partir (« depuis <b>' + esc(def) + '</b> »).', intent: 'liv_branch' };
    var r = await glFetch(c, '/projects/' + c.pid + '/repository/branches?branch=' + encodeURIComponent(name) + '&ref=' + encodeURIComponent(base), { method: 'POST' });
    if (!r.ok) { var b = await r.json().catch(function () { return {}; }); return { html: '⚠️ Création refusée pour <b>' + esc(name) + '</b> : ' + esc(b.message || r.status) + '.', intent: 'liv_branch' }; }
    lastBranch = name;   // « prépare une livraison » enchaînera sur cette branche
    // Astuce flow si une develop existe et qu'on a pris la branche par défaut sans le dire.
    var hint = '';
    if (autoBase && base === def && def !== 'develop' && (await branchExists(c, 'develop'))) hint = '<br><span class="sqa-hint">💡 Ton repo a une branche <b>develop</b> — en gitflow, dis « depuis develop ».</span>';
    return { html: '🌿 Branche <b>' + esc(name) + '</b> créée depuis <b>' + esc(base) + '</b>. Code dedans, puis reviens : « prépare une livraison <b>patch</b> sur <b>' + esc(name) + '</b> ».' + hint, intent: 'liv_branch' };
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
    var failedJobs = jobs.filter(function (j) { return j.status === 'failed'; });
    var html = '🚂 Pipeline <b>#' + esc(pipeline.id) + '</b> — ' + pipeIcon(pipeline.status) + ' <b>' + esc(pipeline.status || '') + '</b><br>' + line;
    if (failedJobs.length) {
      // Quel job a planté + POURQUOI : extrait du log d'erreur du 1er job en échec.
      var tail = await jobTail(c, failedJobs[0].id, 3);
      var excerpt = tail.join(' · '); if (excerpt.length > 240) excerpt = '…' + excerpt.slice(-240);
      html += '<br><span class="sqa-hint">❌ échec : <b>' + failedJobs.map(function (j) { return esc(j.name); }).join(', ') + '</b>'
        + (excerpt ? '<br>↳ ' + esc(excerpt) : '') + '</span>';
      html += '<div class="sqa-liv-actions">' + failedJobs.slice(0, 3).map(function (j) {
        return '<button class="sqa-liv-btn danger" onclick="salsiLiv(\'joblog\',' + j.id + ')">📄 logs ' + esc(j.name) + '</button>';
      }).join('') + '</div>';
    }
    html += refreshBar(pipeline.id) + openBtn(c);
    return { html: html, intent: 'liv_train' };
  }
  // Fin du trace d'un job : lignes d'erreur les plus parlantes (ANSI nettoyé).
  async function jobTail(c, jobId, maxLines) {
    try {
      var r = await glFetch(c, '/projects/' + c.pid + '/jobs/' + jobId + '/trace');
      if (!r.ok) return [];
      var raw = await r.text();
      var clean = raw.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
      var lines = clean.split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).filter(function (l) { return l.trim(); });
      if (!lines.length) return [];
      // On centre la fenêtre sur la dernière ligne qui « sent » l'erreur.
      var errIdx = -1;
      for (var i = lines.length - 1; i >= 0; i--) { if (/error|fatal|failed|failure|exception|cannot|not found|no such|denied|refused|panic|\bERR!?\b|exit code [1-9]/i.test(lines[i])) { errIdx = i; break; } }
      var end = errIdx >= 0 ? Math.min(lines.length, errIdx + 2) : lines.length;
      return lines.slice(Math.max(0, end - (maxLines || 3)), end);
    } catch (e) { return []; }
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
  // Mots d'un AUTRE module : on ne détourne pas « où en est mon DORA », « montre-la sécu »…
  var OTHER = /\bdora\b|\bscore\b|\bbadge|\bbus factor|\bsecu|\bsecurite|\brepo\b|\bmaturite|\bflag|\bfeature flag|\bdaily|\bpriorite|\bbilan\b/;

  S.livraisonRoute = async function livraisonRoute(n, q) {
    var explicitIid = parseIid(n);
    var iid = explicitIid || lastMr;           // ← mémoire de contexte
    var branch = parseBranch(q);
    var hasRef = /\bmr\b|\bmerge request\b|\bla\b|\ble\b|\bca\b|\bcelle|\bcette|\-la\b/.test(n) || explicitIid || lastMr;

    // ── CRÉER UNE BRANCHE : « crée une branche feature/x depuis main » (base selon le flow)
    if (/\bbranche\b/.test(n) && /\b(cree[rz]?|creer|nouvelle branche|fais( moi)? (une )?branche|branche moi|demarre[rz]? une branche|ajoute[rz]? une branche|part(ir|s)? sur une branche|je veux (creer )?une branche|il me faut une branche|besoin d une branche|peux tu (creer|faire) une branche|ouvre une branche)\b/.test(n) && !OTHER.test(n)) {
      var pb = parseNewBranch(q);
      var base = pb.base;
      if (!base && /gitflow|git flow|\bdevelop/.test(n)) base = 'develop';
      if (!base && /\btrunk\b/.test(n)) base = null; // → branche par défaut dans le handler
      return await doCreateBranch(pb.name, base);
    }
    // ── LISTER LES BRANCHES : « j'ai quoi comme branche », « quelles branches », « mes branches »
    if (/\bbranches?\b/.test(n) && !OTHER.test(n)
      && !/\bmorte|stale|obsolete|vieille|dead|inactive|nettoy|supprim|purge|protege|pousse|merge(e|es)? non/.test(n)
      && /\b(j ai quoi comme branche|quoi comme branches?|quelle?s? branches?|mes branches|liste (des |les )?branches|montre (moi )?(les )?branches|branches (du repo|dispo|dispos|existantes|ouvertes)|toutes les branches|il y a quoi comme branche)\b/.test(n)) {
      return await listBranches();
    }

    // ── COMMENTER : « commente la 44 : … », « réponds : … », « commente-la : … »
    if (/\bcommente(r)?\b|\bcommentaire\b|\breponds?\b|\bajoute un (mot|commentaire)\b/.test(n)) {
      var body = q.split(/[:：]/).slice(1).join(':').trim();
      if (iid && body) { setLast(iid); return await doComment(iid, body); }
      if (iid) return { html: 'Quel commentaire pour <b>!' + iid + '</b> ? Dis « commente : ton message ». 💬', intent: 'liv_comment' };
      return { html: 'Sur quelle MR ? « commente la <b>44</b> : ton message ». 💬', intent: 'liv_comment' };
    }

    // ── QUI DOIT VALIDER : « qui doit valider la 44 ? », « qui peut approuver ? », « il manque quoi ? »
    if (/(qui).*(valid|approu|doit merger|peut merger)|combien d approbation|il manque.*(validation|approbation)|c est valide|est ce (que c est )?valide|est ce approuve/.test(n) && !OTHER.test(n)) {
      if (iid) { setLast(iid); return await whoApproves(iid); }
      return { html: 'De quelle MR parle-t-on ? « qui doit valider la <b>44</b> ? » 🌱', intent: 'liv_who' };
    }

    // ── APPROUVER : « approuve la 44 », « valide-la », « je valide », « ok pour la 44 », « feu vert »
    if ((/\bapprouv(e|er|ee)?\b|\bje valide\b|\bok pour\b|\bfeu vert\b|\bvalide[rz]?[- ]?(la|le|ca|cette mr)\b|\bvalide[rz]? (la )?mr\b/.test(n))
      && !/\bqui\b/.test(n) && !OTHER.test(n)) {
      if (iid) { setLast(iid); return await doApprove(iid); }
      return { html: 'Quelle MR j\'approuve ? « approuve la <b>44</b> » — ou clique 👍 sur une MR. 🌱', intent: 'liv_approve' };
    }

    // ── FERMER : « ferme la 44 », « ferme-la », « abandonne / jette / annule la MR »
    if ((/\bferm(e|er|ee)?\b|\bclot(ure|urer|ee)?\b|\bcloture[rz]?\b|\babandonne[rz]?\b|\bjette\b|\bannule[rz]? (la )?mr\b|\bsupprime[rz]? (la )?mr\b/.test(n))
      && !OTHER.test(n) && hasRef) {
      if (iid) { setLast(iid); return closeAsk(iid); }
      return { html: 'Quelle MR je ferme ? « ferme la <b>44</b> ». 🌱', intent: 'liv_close' };
    }

    // ── TRAIN / statut : « le train », « où en est ? », « ça avance ? », « la pipeline de la 44 »
    var trainWord = /\btrain\b/.test(n) || /\bla pipeline\b.*(mr|livraison|\d)|\bpipeline de (la|ma)\b/.test(n);
    var statusWord = /\bou (en est|ca en est|c en est)\b|\bca avance\b|\bavancement\b|\bstatut\b|\bstatus\b|\bou ca en est\b/.test(n);
    if ((trainWord || (statusWord && (explicitIid || lastMr))) && !OTHER.test(n)) {
      if (iid) { setLast(iid); return await trainForMr(iid); }
      if (trainWord) return { html: 'Le train de quelle livraison ? « le train de la <b>44</b> ». 🚂', intent: 'liv_train' };
    }

    // ── PRÉPARER : « prépare une livraison [patch] [sur feature/x] », « livre feature/x en minor »,
    //    « sors une release » — mais pas « livrer plus souvent » (DORA).
    // Verbe FORT (prépare/bump/release…) : engage même sans branche ni niveau (on demande).
    // Verbe FAIBLE (livre/déploie/envoie…) : seulement si branche ou niveau présent (sinon = merge).
    var strongPrep = /\bprepare[rz]?\b|\bpreparer\b|\bpreparation\b|\bbump\b|\bincremente[rz]?\b|\bnouvelle (version|release)\b|\bsors?( moi)? (une )?(version|release)\b|\bfais( moi)? (une )?(livraison|release|version)\b|\bcree[rz]?( moi)? (une )?(release|version)\b/.test(n);
    var softPrep = /\blivre[rz]?\b|\bdeploie[rz]?\b|\bmets? en prod\b|\benvoie[rz]?\b|\bbalance[rz]?\b|\bmettre en prod\b/.test(n);
    var hasBump = /\b(patch|minor|mineur|major|majeur|majeure|correctif|moyen|moyenne|intermediaire|grosse version|petite version|breaking)\b/.test(n);
    if (!explicitIid && !/\bsouvent\b|\bfrequence\b|\bplus vite\b|\bregulier/.test(n)
      && (strongPrep || (softPrep && (branch || hasBump)))) {
      var brc = branch || lastBranch;
      if (!brc) return { html: 'Pour quelle <b>branche</b> je prépare la livraison ? Ex. « prépare une livraison sur <b>feature/xxx</b> » — tu choisiras <b>majeur / mineur / patch</b> juste après. 🌿', intent: 'liv_prepare' };
      if (hasBump) { var rp = await doPrepare(brc, parseBump(n)); rp.intent = 'liv_prepare'; return rp; }
      return await prepPreview(brc);   // pas de niveau → propose majeur / mineur / patch en boutons
    }

    // ── MERGER / LIVRER une MR : « merge la 44 », « merge-la », « livre la 44 », « envoie-la en prod »
    if ((/\bmerge[rz]?[- ]?(la|le|ca)?\b|\bfusionne[rz]?\b|\blivre[rz]? (la|le|ca|cette mr|ma mr)\b|\bmets? (la|ca)? ?en prod\b|\bdeploie[rz]?[- ]?(la|le|ca)?\b|\benvoie[rz]?[- ]?(la|le|ca)?( en prod)?\b|\bbalance[rz]?[- ]?(la|le|ca)?( en prod)?\b|\bgo pour\b/.test(n))
      && !branch && !OTHER.test(n) && hasRef) {
      if (iid) { setLast(iid); return mergeAsk(iid); }
      return { html: 'Quelle MR je merge ? « merge la <b>44</b> » — ou clique 🚀 sur une MR. 🌱', intent: 'liv_merge' };
    }

    // ── DÉTAIL d'une MR : « la mr 44 », « montre la 44 », « ouvre-la », « détaille la 44 »
    if (explicitIid && /\b(montre|affiche|detail|detaille|ouvre|voir|regarde|c est quoi|dis moi|la mr|mr numero|mr|merge request)\b/.test(n) && !/\bles mr\b|\btoutes\b|\bliste\b/.test(n) && !OTHER.test(n)) {
      setLast(explicitIid); return await mrDetail(explicitIid);
    }
    if (/\b(montre|affiche|ouvre|detaille?|voir|regarde)[- ]?(la|le|moi)\b/.test(n) && lastMr && !/\bles mr\b|\btoutes\b|\bliste\b/.test(n) && !OTHER.test(n)) {
      return await mrDetail(lastMr);
    }

    // ── LISTER : « les MR », « MR à valider », « quoi à merger ? », « mes livraisons en cours »
    var listAsk =
      /\b(les mr|mr ouvertes|mr a valider|mr a relire|mr a merger|mes mr|mr du repo|livraisons?( en cours| a valider| ouvertes?)|quoi a (valider|merger|relire|livrer)|qu y a t il a (valider|merger|livrer)|(a|à) (valider|merger|relire))\b/.test(n)
      || ((/\bmr\b|\bmerge request\b/.test(n)) && /\b(liste|montre|affiche|en attente|en cours|a livrer|a valider)\b/.test(n));
    if (listAsk && !/\bcombien\b|\bnombre\b/.test(n) && !OTHER.test(n)) {
      return await listMRs(n, q);
    }
    return null;
  };

  // ══════════════════════════════════════════════════════════════════
  //  Boutons du chat → window.salsiLiv(action, arg)
  // ══════════════════════════════════════════════════════════════════
  window.salsiLiv = async function (action, arg, arg2) {
    var say = window.salsiQaSay || function (h) { console.log('[salsi]', h); return null; };
    // arg = iid d'une MR pour ces actions → devient le contexte courant.
    // (PAS pour trainPipe/joblog/trainSha/prep : l'arg y est un id pipeline/job ou une branche.)
    if (typeof arg === 'number' && /^(detail|approve|mergeAsk|merge|closeAsk|close|train)$/.test(action)) setLast(arg);
    if (action === 'cancel') { say('👍 Ok, on ne touche à rien.'); return; }
    var pend = say('⏳ …');
    function done(r) { if (pend) pend.innerHTML = (r && r.html) || '😅 Rien à afficher.'; else say((r && r.html) || ''); }
    try {
      if (action === 'prep') return done(await doPrepare(arg, arg2 || 'patch'));
      if (action === 'detail') return done(await mrDetail(arg));
      if (action === 'approve') return done(await doApprove(arg));
      if (action === 'mergeAsk') return done(mergeAsk(arg));
      if (action === 'merge') return done(await doMerge(arg));
      if (action === 'closeAsk') return done(closeAsk(arg));
      if (action === 'close') return done(await doClose(arg));
      if (action === 'train') return done(await trainForMr(arg));
      if (action === 'trainPipe') return done(await trainSummary(arg));
      if (action === 'trainSha') { var c = ctx(); if (c.err) return done({ html: c.err }); var pl = await findDeliveryPipeline(c, arg); return done(pl ? await trainSummary(pl.id) : { html: '🚂 Pipeline pas encore visible — réessaie dans un instant.' }); }
      if (action === 'joblog') {
        var cj = ctx(); if (cj.err) return done({ html: cj.err });
        var t = await jobTail(cj, arg, 25);
        return done({ html: t.length ? '<b>📄 Fin du log</b><div style="font-family:ui-monospace,monospace;font-size:11px;white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,.35);border-radius:8px;padding:8px 10px;margin-top:5px;max-height:230px;overflow:auto">' + esc(t.join('\n')) + '</div>' : 'Logs indisponibles pour ce job (pas encore démarré ?).' });
      }
      done({ html: 'Action inconnue.' });
    } catch (e) { done({ html: '😅 Échec de l\'action — réessaie.' }); }
  };
})();
