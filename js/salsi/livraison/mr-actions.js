/* salsi/livraison · mr-actions.js — détail MR & actions (approuver / merger / fermer / commenter) (chargé 2e). */

'use strict';

  async function mrDetail(iid) {
    var c = ctx(); if (c.err) return { html: c.err, intent: 'liv_detail' };
    var m = await glJson(c, '/projects/' + c.pid + '/merge_requests/' + iid);
    if (!m || !m.iid) return { html: '🔀 Je ne trouve pas la MR <b>!' + lvEsc(iid) + '</b> (ouverte ?).', intent: 'liv_detail' };
    var res = await Promise.all([
      glJson(c, '/projects/' + c.pid + '/merge_requests/' + iid + '/changes'),
      glJson(c, '/projects/' + c.pid + '/merge_requests/' + iid + '/approvals')
    ]);
    var changes = res[0], appr = res[1];
    var files = (changes && changes.changes) || [];
    var pipe = m.head_pipeline && m.head_pipeline.status;
    var need = (appr && appr.approvals_required) || 0;
    var got = appr ? (appr.approved_by ? appr.approved_by.length : Math.max(0, need - (appr.approvals_left || 0))) : 0;
    var html = '🔀 <b>!' + m.iid + '</b> — ' + lvEsc(m.title) + '<br><span class="sqa-hint">'
      + lvEsc(m.source_branch) + ' → ' + lvEsc(m.target_branch) + ' · par ' + lvEsc((m.author && m.author.username) || '?') + '</span><br>'
      + (pipe ? 'pipeline ' + pipeIcon(pipe) + ' ' + lvEsc(pipe) + ' · ' : '')
      + files.length + ' fichier(s) · ' + (need ? 'validation <b>' + got + '/' + need + '</b>' : 'pas de règle d\'appro')
      + ' · ' + (m.merge_status === 'can_be_merged' ? '🟢 mergeable' : lvEsc(m.merge_status || ''))
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
    if (!m || !m.iid) return { html: '🔀 Je ne trouve pas la MR <b>!' + lvEsc(iid) + '</b>.', intent: 'liv_who' };
    var need = (appr && appr.approvals_required) || 0;
    var by = (appr && appr.approved_by || []).map(function (a) { return lvEsc((a.user && a.user.username) || '?'); });
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
    if (!r.ok) { var b = await r.json().catch(function () { return {}; }); return { html: '⚠️ Approbation refusée sur <b>!' + lvEsc(iid) + '</b> : ' + lvEsc(b.message || r.status) + '.' }; }
    return { html: '👍 MR <b>!' + lvEsc(iid) + '</b> approuvée. Le créateur peut la merger dès qu\'elle est mergeable.' };
  }
  function mergeAsk(iid) {
    return { html: '🚀 Merger <b>!' + lvEsc(iid) + '</b> déclenche la <b>livraison</b> (merge sur la branche par défaut). On confirme ?<div class="sqa-liv-actions"><button class="sqa-liv-btn go" onclick="salsiLiv(\'merge\',' + iid + ')">✅ Confirmer &amp; livrer</button><button class="sqa-liv-btn" onclick="salsiLiv(\'cancel\',' + iid + ')">Annuler</button></div>' };
  }
  async function doMerge(iid) {
    var c = ctx(); if (c.err) return { html: c.err };
    var r = await glFetch(c, '/projects/' + c.pid + '/merge_requests/' + iid + '/merge', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (!r.ok) { var b = await r.json().catch(function () { return {}; }); return { html: '⚠️ Merge refusé sur <b>!' + lvEsc(iid) + '</b> : ' + lvEsc(b.message || r.status) + '.' }; }
    var merged = await r.json().catch(function () { return {}; });
    var sha = merged.merge_commit_sha || merged.squash_commit_sha || null;
    var head = '🚀 <b>!' + lvEsc(iid) + '</b> mergée — la livraison part ! ';
    var pl = await findDeliveryPipeline(c, sha);
    if (pl) return { html: head + '<br>' + trainText(c, pl) + refreshBar(pl.id) + openBtn(c) };
    return { html: head + '<br><span class="sqa-hint">Pipeline de livraison pas encore visible.</span>' + refreshBarSha(sha) + openBtn(c) };
  }
  function closeAsk(iid) {
    return { html: '✕ Fermer <b>!' + lvEsc(iid) + '</b> sans la livrer. On confirme ?<div class="sqa-liv-actions"><button class="sqa-liv-btn danger" onclick="salsiLiv(\'close\',' + iid + ')">✕ Confirmer la fermeture</button><button class="sqa-liv-btn" onclick="salsiLiv(\'cancel\',' + iid + ')">Annuler</button></div>' };
  }
  async function doClose(iid) {
    var c = ctx(); if (c.err) return { html: c.err };
    var r = await glFetch(c, '/projects/' + c.pid + '/merge_requests/' + iid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state_event: 'close' }) });
    if (!r.ok) { var b = await r.json().catch(function () { return {}; }); return { html: '⚠️ Fermeture refusée sur <b>!' + lvEsc(iid) + '</b> : ' + lvEsc(b.message || r.status) + '.' }; }
    return { html: '🚫 MR <b>!' + lvEsc(iid) + '</b> fermée.' };
  }
  async function doComment(iid, body) {
    var c = ctx(); if (c.err) return { html: c.err };
    if (!body) return { html: 'Dis-moi le commentaire : « commente la <b>' + lvEsc(iid) + '</b> : ton message ».' };
    var r = await glFetch(c, '/projects/' + c.pid + '/merge_requests/' + iid + '/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: body }) });
    if (!r.ok) { var b = await r.json().catch(function () { return {}; }); return { html: '⚠️ Commentaire refusé sur <b>!' + lvEsc(iid) + '</b> : ' + lvEsc(b.message || r.status) + '.' }; }
    return { html: '💬 Commentaire posté sur <b>!' + lvEsc(iid) + '</b>.' };
  }

  async function findOverlays(c, ref) {
    var tree = await S.gitlabPaginate(c.url, c.token, '/projects/' + c.pid + '/repository/tree?recursive=true&ref=' + encodeURIComponent(ref), { throwOnError: false });
    return (tree || []).filter(function (t) { return t && t.type === 'blob' && KUSTO_RX.test(t.path); }).map(function (t) { return t.path; });
  }
  // Demande l'environnement (dev / uat / prod) — le niveau connu (bump) est reporté sur les boutons.
  function askEnv(branch, bump) {
    lastBranch = branch;
    if (!/^[A-Za-z0-9._\/-]+$/.test(branch)) return { html: '📦 Livraison de <b>' + lvEsc(branch) + '</b> — <b>quel environnement ?</b><br><span class="sqa-hint">Tape « prépare une livraison ' + (bump || 'patch') + ' <b>en prod</b> sur ' + lvEsc(branch) + ' » (ou en dev / en uat).</span>', intent: 'liv_prepare' };
    var b = jsq(branch), bp = bump || '';
    var btns = '<div class="sqa-liv-actions">'
      + '<button class="sqa-liv-btn" onclick="salsiLiv(\'prepEnv\',\'' + b + '\',\'' + bp + '\',\'dev\')">🔧 dev</button>'
      + '<button class="sqa-liv-btn" onclick="salsiLiv(\'prepEnv\',\'' + b + '\',\'' + bp + '\',\'uat\')">🧪 uat</button>'
      + '<button class="sqa-liv-btn go" onclick="salsiLiv(\'prepEnv\',\'' + b + '\',\'' + bp + '\',\'prod\')">🚀 prod</button>'
      + '</div>';
    return { html: '📦 Livraison de <b>' + lvEsc(branch) + '</b>' + (bump ? ' (' + lvEsc(bump) + ')' : '') + ' — <b>vers quel environnement ?</b>' + btns, intent: 'liv_prepare' };
  }
  // Pas de niveau précisé → on lit la version courante et on propose les 3 cibles en boutons (env reporté).
  async function prepPreview(branch, env) {
    var c = ctx(); if (c.err) return { html: c.err, intent: 'liv_prepare' };
    var proj = await glJson(c, '/projects/' + c.pid); var def = (proj && proj.default_branch) || 'main';
    if (branch === def) return { html: '🌿 <b>' + lvEsc(branch) + '</b> est la branche par défaut — on prépare depuis une <i>autre</i> branche vers <b>' + lvEsc(def) + '</b>.', intent: 'liv_prepare' };
    var ci = await readFile(c, '.gitlab-ci.yml', branch);
    if (ci == null) return { html: '⚠️ Pas de <code>.gitlab-ci.yml</code> sur <b>' + lvEsc(branch) + '</b> (ou branche introuvable).', intent: 'liv_prepare' };
    var mt = ci.match(IMAGE_TAG_RX);
    if (!mt) return { html: '⚠️ Pas d\'<code>IMAGE_TAG</code> dans le <code>.gitlab-ci.yml</code> de <b>' + lvEsc(branch) + '</b>.', intent: 'liv_prepare' };
    var cur = mt[3].trim(), maj = bumpVer(cur, 'major'), min = bumpVer(cur, 'minor'), pat = bumpVer(cur, 'patch');
    if (!pat) return { html: '⚠️ Version courante <code>' + lvEsc(cur) + '</code> non SemVer — bump impossible.', intent: 'liv_prepare' };
    lastBranch = branch;
    var envTxt = env ? ' → ' + ENV_LABEL[env] : '';
    var head = '📦 Livraison de <b>' + lvEsc(branch) + '</b>' + envTxt + ' — version actuelle <code>' + lvEsc(cur) + '</code>. <b>Quel niveau ?</b>';
    if (!/^[A-Za-z0-9._\/-]+$/.test(branch)) return { html: head + '<br><span class="sqa-hint">Tape « prépare une livraison <b>patch</b> sur ' + lvEsc(branch) + ' » (ou minor / major).</span>', intent: 'liv_prepare' };
    var b = jsq(branch), e = env || '';
    var btns = '<div class="sqa-liv-actions">'
      + '<button class="sqa-liv-btn" onclick="salsiLiv(\'prep\',\'' + b + '\',\'major\',\'' + e + '\')">majeur → ' + lvEsc(maj) + '</button>'
      + '<button class="sqa-liv-btn" onclick="salsiLiv(\'prep\',\'' + b + '\',\'minor\',\'' + e + '\')">mineur → ' + lvEsc(min) + '</button>'
      + '<button class="sqa-liv-btn go" onclick="salsiLiv(\'prep\',\'' + b + '\',\'patch\',\'' + e + '\')">patch → ' + lvEsc(pat) + '</button>'
      + '</div>';
    return { html: head + btns, intent: 'liv_prepare' };
  }
