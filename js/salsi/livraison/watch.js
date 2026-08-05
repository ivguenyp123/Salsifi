/* salsi/livraison · watch.js — suivi du train, poller & notifications de disponibilité (chargé 4e). */

'use strict';

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
    if (!m || !(m.head_pipeline && m.head_pipeline.id)) return { html: '🚂 Pas de pipeline rattachée à <b>!' + lvEsc(iid) + '</b> pour l\'instant.', intent: 'liv_train' };
    return trainSummary(m.head_pipeline.id);
  }
  function refreshBar(pid) { return '<div class="sqa-liv-actions"><button class="sqa-liv-btn" onclick="salsiLiv(\'trainPipe\',' + pid + ')">↻ Actualiser</button></div>'; }
  function refreshBarSha(sha) { return sha ? '<div class="sqa-liv-actions"><button class="sqa-liv-btn" onclick="salsiLiv(\'trainSha\',\'' + lvEsc(sha) + '\')">↻ Chercher la pipeline</button></div>' : ''; }
  function openBtn(c) { return '<div class="sqa-hint">Train live complet → <a href="pipeline-generator.html?repo=' + lvEsc(c.pid) + '" target="_blank" rel="noopener">module Livraison ↗</a></div>'; }

  // ══════════════════════════════════════════════════════════════════
  //  SURVEILLANCE PROACTIVE — prévenir quand une MR devient livrable.
  //  Salsi poll l'état d'appro en tâche de fond (tant que le hub est ouvert),
  //  persiste en localStorage (survit à un reload), et propose de livrer.
  // ══════════════════════════════════════════════════════════════════
  var WATCH_KEY = 'salsi_liv_watch', POLL_MS = 45000, WATCH_TTL = 24 * 3600 * 1000, poller = null;
  function loadWatch() { try { return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'); } catch (e) { return []; } }
  function saveWatch(a) { try { localStorage.setItem(WATCH_KEY, JSON.stringify(a)); } catch (e) { } }
  function isReady(mr, appr) {
    var need = (appr && appr.approvals_required) || 0;
    if (need > 0) return (appr.approvals_left === 0) || (appr.approved_by && appr.approved_by.length >= need); // approuvée
    return mr.merge_status === 'can_be_merged'; // pas de règle d'appro → prête quand mergeable
  }
  function startWatch(iid, title) {
    var c = ctx(); if (c.err || !iid) return false;
    var a = loadWatch().filter(function (w) { return !(String(w.pid) === String(c.pid) && w.iid === iid); });
    a.push({ pid: String(c.pid), iid: iid, title: title || ('!' + iid), at: Date.now(), notified: false });
    saveWatch(a); ensurePoller(); return true;
  }
  function stopWatchAll() { saveWatch([]); if (poller) { clearInterval(poller); poller = null; } }
  function ensurePoller() { if (poller) return; poller = setInterval(pollWatch, POLL_MS); setTimeout(pollWatch, 4000); }
  async function pollWatch() {
    var auth = S.loadAuth ? S.loadAuth({ redirect: false }) : null;
    var list = loadWatch();
    if (!auth || !list.length) { if (poller) { clearInterval(poller); poller = null; } return; }
    var now = Date.now(), keep = [];
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      if (now - w.at > WATCH_TTL) continue; // expiré → on lâche
      try {
        var mr = await S.gitlabJson(auth.gitlabUrl, auth.token, '/projects/' + w.pid + '/merge_requests/' + w.iid);
        if (!mr || !mr.iid) { keep.push(w); continue; }
        if (mr.state !== 'opened') continue; // mergée / fermée → plus rien à surveiller
        var appr = await S.gitlabJson(auth.gitlabUrl, auth.token, '/projects/' + w.pid + '/merge_requests/' + w.iid + '/approvals');
        if (!w.notified && isReady(mr, appr)) { notifyReady(w, mr, appr); continue; } // notifié une fois → on retire
        keep.push(w);
      } catch (e) { keep.push(w); }
    }
    saveWatch(keep);
    if (!keep.length && poller) { clearInterval(poller); poller = null; }
  }
  function notifyReady(w, mr, appr) {
    var need = (appr && appr.approvals_required) || 0;
    var lbl = need > 0 ? '<b>approuvée</b> ✅' : '<b>prête à merger</b> ✅';
    var pj = jsq(String(w.pid));
    var html = '🎉 Ta MR <b>!' + w.iid + '</b> « ' + lvEsc(mr.title || w.title) + ' » est ' + lbl + ' — on <b>livre</b> ?'
      + '<div class="sqa-liv-actions">'
      + '<button class="sqa-liv-btn go" onclick="salsiLiv(\'mergeCtx\',' + w.iid + ',\'' + pj + '\')">🚀 Livrer maintenant</button>'
      + '<button class="sqa-liv-btn" onclick="salsiLiv(\'detail\',' + w.iid + ')">Voir</button>'
      + '<button class="sqa-liv-btn" onclick="salsiLiv(\'later\',' + w.iid + ')">Plus tard</button>'
      + '</div>';
    if (window.salsiQaSay) window.salsiQaSay(html);
  }

  // ══════════════════════════════════════════════════════════════════
  //  ROUTEUR — appelé par qa.js. Renvoie {html,intent} ou null.
  // ══════════════════════════════════════════════════════════════════
  // Mots d'un AUTRE module : on ne détourne pas « où en est mon DORA », « montre-la sécu »…
