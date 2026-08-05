/* salsi/livraison · core.js — helpers, IO GitLab, parsing, ligne & liste des MR (chargé 1er). */

'use strict';

  var S = window.Salsifi || (window.Salsifi = {});
  function lvEsc(v) { return S.escapeHtml ? S.escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v); }
  function lvNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s\/._-]/g, ' ').replace(/\s+/g, ' ').trim(); }

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

  // Environnement de déploiement (piloté par DEPLOY_TO_DEV/UAT/PROD dans le .gitlab-ci.yml).
  var ENV_LABEL = { dev: '🔧 dev', uat: '🧪 uat', prod: '🚀 prod' };
  function parseEnv(n, branch) {
    var t = n; if (branch) { t = t.split(lvNorm(branch)).join(' '); } // retire le nom de branche (évite « feature/dev » → env dev)
    if (/\bprod(uction)?\b/.test(t)) return 'prod';
    if (/\buat\b|\brecette\b/.test(t)) return 'uat';
    if (/\bdev\b|\bdeveloppement\b/.test(t)) return 'dev';
    return null;
  }
  // Pose DEPLOY_TO_* selon l'env choisi (exclusif : la cible = true, les autres = false).
  // Ne touche QUE les variables déjà présentes dans le fichier.
  function setDeployVars(ci, env) {
    var want = { DEV: env === 'dev', UAT: env === 'uat', PROD: env === 'prod' };
    var out = ci, found = 0;
    ['DEV', 'UAT', 'PROD'].forEach(function (E) {
      var rx = new RegExp('^(\\s*DEPLOY_TO_' + E + ':\\s*)(["\']?)(true|false)(["\']?)(\\s*)$', 'mi');
      if (rx.test(out)) { found++; out = out.replace(rx, function (m, p, q1, v, q2, s) { return p + '"' + (want[E] ? 'true' : 'false') + '"' + s; }); }
    });
    return { yaml: out, found: found };
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
    return '🔀 <b>!' + m.iid + '</b> · ' + lvEsc(m.title) + '<br><span class="sqa-hint">'
      + lvEsc((m.author && m.author.username) || '?') + ' · ' + lvEsc(m.source_branch) + ' → ' + lvEsc(m.target_branch)
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
    var who = mAuth ? lvNorm(mAuth[1]) : '';
    if (who && !/^(la|le|les|mon|ma|mes|repo|projet)$/.test(who)) {
      arr = arr.filter(function (m) { return lvNorm((m.author && m.author.username) || '').indexOf(who) >= 0; });
    }
    if (!arr.length) return { html: '🔀 Aucune MR ouverte' + (who ? ' pour <b>' + lvEsc(who) + '</b>' : '') + '.', intent: 'liv_list' };
    var rows = arr.slice(0, 8).map(function (m) {
      return '<div class="sqa-liv-row" onclick="salsiLiv(\'detail\',' + m.iid + ')">' + mrLine(m) + '</div>';
    }).join('');
    return { html: '🔀 <b>' + arr.length + '</b> MR ouverte(s)' + (who ? ' de <b>' + lvEsc(who) + '</b>' : '') + (arr.length > 8 ? ' (8 affichées)' : '') + ' — clique pour ouvrir :' + rows, intent: 'liv_list' };
  }

