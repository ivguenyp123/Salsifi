/* salsi/livraison · prepare.js — préparer la livraison (bump, overlays, branches) & résumé du train (chargé 3e). */

'use strict';

  async function doPrepare(branch, bump, env) {
    var c = ctx(); if (c.err) return { html: c.err };
    lastBranch = branch;
    var proj = await glJson(c, '/projects/' + c.pid); var def = (proj && proj.default_branch) || 'main';
    if (branch === def) return { html: '🌿 <b>' + lvEsc(branch) + '</b> est la branche par défaut — on livre <i>depuis une autre branche</i> vers <b>' + lvEsc(def) + '</b>.' };
    var ci = await readFile(c, '.gitlab-ci.yml', branch);
    if (ci == null) return { html: '⚠️ Pas de <code>.gitlab-ci.yml</code> sur <b>' + lvEsc(branch) + '</b> (ou branche introuvable).' };
    var mtag = ci.match(IMAGE_TAG_RX);
    if (!mtag) return { html: '⚠️ Pas d\'<code>IMAGE_TAG</code> dans le <code>.gitlab-ci.yml</code> de <b>' + lvEsc(branch) + '</b>.' };
    var cur = mtag[3].trim(), target = bumpVer(cur, bump);
    if (!target) return { html: '⚠️ Version courante <code>' + lvEsc(cur) + '</code> non SemVer — bump impossible.' };
    var actions = [];
    // .gitlab-ci.yml : bump IMAGE_TAG (+ pose DEPLOY_TO_* selon l'env si présents).
    var newCi = ci.replace(IMAGE_TAG_RX, function (m, p, q1, v, q2, s) { return p + q1 + target + q2 + s; });
    var envFound = 0, envMissing = false;
    if (env) { var dv = setDeployVars(newCi, env); newCi = dv.yaml; envFound = dv.found; envMissing = (dv.found === 0); }
    if (newCi !== ci) actions.push({ action: 'update', file_path: '.gitlab-ci.yml', content: newCi });
    var overlays = 0;
    var files = await findOverlays(c, branch);
    for (var i = 0; i < files.length; i++) {
      var oc = await readFile(c, files[i], branch); if (oc == null) continue;
      var nc = oc.replace(/^(\s*newTag:\s*).*$/gm, '$1"' + target + '"').replace(/^(\s*-\s+APP_VERSION=).*$/gm, '$1' + target);
      if (nc !== oc) { actions.push({ action: 'update', file_path: files[i], content: nc }); overlays++; }
    }
    if (!actions.length) return { html: '⚠️ Rien à modifier — <code>IMAGE_TAG</code> est peut-être déjà à <b>' + lvEsc(target) + '</b>.' };
    var envMsg = env ? ' + ' + env.toUpperCase() : '';
    var cr = await glFetch(c, '/projects/' + c.pid + '/repository/commits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch: branch, commit_message: '[Livraison] Bump IMAGE_TAG → ' + target + envMsg, actions: actions }) });
    if (!cr.ok) { var eb = await cr.json().catch(function () { return {}; }); return { html: '⚠️ Commit refusé sur <b>' + lvEsc(branch) + '</b> : ' + lvEsc(eb.message || cr.status) + '.' }; }
    var mr = await glFetch(c, '/projects/' + c.pid + '/merge_requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_branch: branch, target_branch: def, title: 'release ' + target }) });
    if (!mr.ok) { var mb = await mr.json().catch(function () { return {}; }); var msg = mb.message || mb.error || cr.status; return { html: '✏️ Bump <b>' + lvEsc(cur) + ' → ' + lvEsc(target) + '</b> commité sur <b>' + lvEsc(branch) + '</b> (' + overlays + ' overlay), mais MR non créée : ' + lvEsc(Array.isArray(msg) ? msg.join(', ') : msg) + '.' }; }
    var created = await mr.json();
    setLast(created.iid);
    startWatch(created.iid, 'release ' + target);   // Salsi préviendra quand elle sera approuvée
    var envLine = env ? (envMissing
      ? '<br><span class="sqa-hint">⚠️ Aucune variable <code>DEPLOY_TO_*</code> dans ce <code>.gitlab-ci.yml</code> — l\'environnement <b>' + lvEsc(env) + '</b> n\'a pas pu être posé (piloté autrement ?).</span>'
      : '<br>🎯 Déploiement ciblé : <b>' + ENV_LABEL[env] + '</b> (<code>DEPLOY_TO_' + env.toUpperCase() + '=true</code>, les autres à false).')
      : '';
    return { html: '✅ Livraison préparée : <code>IMAGE_TAG ' + lvEsc(cur) + ' → ' + lvEsc(target) + '</code> + <b>' + overlays + '</b> overlay(s), MR <b>!' + lvEsc(created.iid) + ' « release ' + lvEsc(target) + ' »</b> ouverte → <b>' + lvEsc(def) + '</b>.' + envLine + '<br><span class="sqa-hint">🔔 Je surveille la MR — je te préviens dès qu\'elle est approuvée pour livrer.</span><div class="sqa-liv-actions"><button class="sqa-liv-btn" onclick="salsiLiv(\'detail\',' + created.iid + ')">Ouvrir la MR</button></div>' };
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
      return '🌿 <code>' + lvEsc(b.name) + '</code>' + (meta ? ' <span class="sqa-hint">' + meta + '</span>' : '');
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
    if (!(await branchExists(c, base))) return { html: '⚠️ La branche de base <b>' + lvEsc(base) + '</b> n\'existe pas ici. Dis-moi depuis quelle branche partir (« depuis <b>' + lvEsc(def) + '</b> »).', intent: 'liv_branch' };
    var r = await glFetch(c, '/projects/' + c.pid + '/repository/branches?branch=' + encodeURIComponent(name) + '&ref=' + encodeURIComponent(base), { method: 'POST' });
    if (!r.ok) { var b = await r.json().catch(function () { return {}; }); return { html: '⚠️ Création refusée pour <b>' + lvEsc(name) + '</b> : ' + lvEsc(b.message || r.status) + '.', intent: 'liv_branch' }; }
    lastBranch = name;   // « prépare une livraison » enchaînera sur cette branche
    // Astuce flow si une develop existe et qu'on a pris la branche par défaut sans le dire.
    var hint = '';
    if (autoBase && base === def && def !== 'develop' && (await branchExists(c, 'develop'))) hint = '<br><span class="sqa-hint">💡 Ton repo a une branche <b>develop</b> — en gitflow, dis « depuis develop ».</span>';
    return { html: '🌿 Branche <b>' + lvEsc(name) + '</b> créée depuis <b>' + lvEsc(base) + '</b>. Code dedans, puis reviens : « prépare une livraison <b>patch</b> sur <b>' + lvEsc(name) + '</b> ».' + hint, intent: 'liv_branch' };
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
    return pipeline._jobsText || ('Pipeline <b>#' + lvEsc(pipeline.id) + '</b> — ' + pipeIcon(pipeline.status) + ' ' + lvEsc(pipeline.status || '') + '.');
  }
  async function trainSummary(pipelineId) {
    var c = ctx(); if (c.err) return { html: c.err, intent: 'liv_train' };
    var res = await Promise.all([
      glJson(c, '/projects/' + c.pid + '/pipelines/' + pipelineId),
      glJson(c, '/projects/' + c.pid + '/pipelines/' + pipelineId + '/jobs?per_page=100')
    ]);
    var pipeline = res[0]; var jobs = res[1];
    if (!pipeline || !pipeline.id) return { html: '🚂 Pipeline <b>#' + lvEsc(pipelineId) + '</b> introuvable.', intent: 'liv_train' };
    jobs = Array.isArray(jobs) ? jobs.slice().sort(function (a, b) { return (a.id || 0) - (b.id || 0); }) : [];
    var order = [], byStage = {};
    jobs.forEach(function (j) { var s = j.stage || '—'; if (!byStage[s]) { byStage[s] = []; order.push(s); } byStage[s].push(j); });
    var line = order.map(function (s) {
      var js = byStage[s], st = js.some(function (j) { return j.status === 'failed'; }) ? 'failed' : js.some(function (j) { return j.status === 'running'; }) ? 'running' : js.every(function (j) { return ['success', 'skipped', 'manual'].indexOf(j.status) >= 0; }) ? 'success' : 'pending';
      return pipeIcon(st) + ' ' + lvEsc(s);
    }).join(' · ');
    var failedJobs = jobs.filter(function (j) { return j.status === 'failed'; });
    var html = '🚂 Pipeline <b>#' + lvEsc(pipeline.id) + '</b> — ' + pipeIcon(pipeline.status) + ' <b>' + lvEsc(pipeline.status || '') + '</b><br>' + line;
    if (failedJobs.length) {
      // Quel job a planté + POURQUOI : extrait du log d'erreur du 1er job en échec.
      var tail = await jobTail(c, failedJobs[0].id, 3);
      var excerpt = tail.join(' · '); if (excerpt.length > 240) excerpt = '…' + excerpt.slice(-240);
      html += '<br><span class="sqa-hint">❌ échec : <b>' + failedJobs.map(function (j) { return lvEsc(j.name); }).join(', ') + '</b>'
        + (excerpt ? '<br>↳ ' + lvEsc(excerpt) : '') + '</span>';
      html += '<div class="sqa-liv-actions">' + failedJobs.slice(0, 3).map(function (j) {
        return '<button class="sqa-liv-btn danger" onclick="salsiLiv(\'joblog\',' + j.id + ')">📄 logs ' + lvEsc(j.name) + '</button>';
      }).join('') + '</div>';
    }
    html += refreshBar(pipeline.id) + openBtn(c);
    return { html: html, intent: 'liv_train' };
  }
  // Fin du trace d'un job : lignes d'erreur les plus parlantes (ANSI nettoyé).
