/*
 * Salsi — Brief du jour (par-dessus le hub)
 * -----------------------------------------
 * À l'arrivée sur le hub, une popup Salsi (1×/jour, skippable, ré-ouvrable)
 * résume « ce qui a bougé » et donne « le conseil du jour ». 100 % déterministe,
 * cache-first : lit ce qui est DÉJÀ mesuré (compagnons DORA/gaming en localStorage
 * + cache repos du hub). Si le cache est vide, bascule sur un état d'accueil honnête
 * (périmètre depuis les repos que le hub charge de toute façon + starter), sans
 * jamais prétendre avoir analysé ce qu'il n'a pas — et sans dire « je mémorise ».
 *
 * Réutilise la popup Atelier partagée (css/salsi-atelier.css + Salsifi.mascotSVG).
 */
(function () {
    'use strict';
    var Salsifi = window.Salsifi || (window.Salsifi = {});
    function esc(s) { return Salsifi.escapeHtml ? Salsifi.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* quota */ } }
    function today() { return new Date().toISOString().slice(0, 10); }

    var SEEN_KEY = 'salsifi_brief_seen';       // date du dernier affichage auto
    var ADVICE_KEY = 'salsifi_brief_advice';   // registre du conseil (non-répétition)

    function getAuth() {
        try { if (typeof loadAuth === 'function') { var a = loadAuth({ redirect: false }); if (a) return a; } } catch (e) { }
        try { var raw = lsGet('devops_hub_workspaces'); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }
    // Repos connus : cache du hub, sinon la liste que le hub vient de charger.
    function knownRepos(username) {
        try { var raw = lsGet('hub_cache_repos_' + (username || '')); if (raw) { var c = JSON.parse(raw); if (c && Array.isArray(c.repos) && c.repos.length) return c.repos; } } catch (e) { }
        try { if (typeof allRepos !== 'undefined' && Array.isArray(allRepos) && allRepos.length) return allRepos; } catch (e) { }
        return null;
    }
    function repoName(repos, pid) { if (!repos) return null; for (var i = 0; i < repos.length; i++) { if (String(repos[i].id) === String(pid)) return repos[i].name; } return null; }

    // ── « Ce qui a bougé » : agrège les événements récents des compagnons ──
    var METRIC_FR = { df: 'fréquence de déploiement', lt: 'lead time', cfr: 'taux d\'échec', mttr: 'temps de restauration' };
    function eventTone(kind, type) {
        if (type === 'level-up' || type === 'score-up' || type === 'unlocked' || type === 'recovered' || type === 'record') return 'up';
        if (type === 'level-down' || type === 'score-down' || type === 'lost' || type === 'regression') return 'down';
        return 'flat';
    }
    function eventText(kind, e, rname) {
        var who = rname || 'un repo';
        if (kind === 'dora') {
            if (e.type === 'level-up') return `<b>${esc(who)}</b> : ${esc(METRIC_FR[e.metric] || e.metric)} monte <b>${esc(e.from)}→${esc(e.to)}</b>`;
            if (e.type === 'level-down') return `<b>${esc(who)}</b> : ${esc(METRIC_FR[e.metric] || e.metric)} retombe <b>${esc(e.from)}→${esc(e.to)}</b>`;
            if (e.type === 'score-up') return `<b>${esc(who)}</b> : niveau DORA global en hausse`;
            if (e.type === 'score-down') return `<b>${esc(who)}</b> : niveau DORA global en baisse`;
            if (e.type === 'record') return `<b>${esc(who)}</b> : nouveau record sur une métrique DORA`;
            if (e.type === 'regression') return `<b>${esc(who)}</b> : une métrique DORA se dégrade`;
        } else {
            if (e.type === 'unlocked') return `<b>${esc(who)}</b> : un badge débloqué`;
            if (e.type === 'recovered') return `<b>${esc(who)}</b> : un badge repris`;
            if (e.type === 'lost') return `<b>${esc(who)}</b> : un badge perdu`;
        }
        return `<b>${esc(who)}</b> : ${esc(e.type)}`;
    }
    // Événements « récents » = ceux datés du dernier snapshot de chaque historique.
    function collectMovements(repos) {
        var GH = Salsifi.gamingHistory, DH = Salsifi.doraHistory, out = [];
        var keys = []; try { for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)); } catch (e) { }
        keys.forEach(function (k) {
            var m;
            if (DH && (m = k.match(/^salsifi_dora_history_(.+)$/))) {
                var hist = DH.read(m[1]); if (!hist || hist.length < 2) return;
                var last = hist[hist.length - 1].at;
                DH.deriveEvents(hist).filter(function (e) { return e.at === last; }).forEach(function (e) {
                    out.push({ pid: m[1], kind: 'dora', e: e, tone: eventTone('dora', e.type), name: repoName(repos, m[1]) });
                });
            } else if (GH && (m = k.match(/^salsifi_gaming_history_(.+)$/))) {
                if (/^dora_/.test(m[1])) return;
                var h2 = GH.read(m[1]); if (!h2 || h2.length < 2) return;
                var last2 = h2[h2.length - 1].at;
                GH.deriveEvents(h2, {}).filter(function (e) { return e.at === last2 && e.kind === 'badge'; }).forEach(function (e) {
                    out.push({ pid: m[1], kind: 'gaming', e: e, tone: eventTone('gaming', e.type), name: repoName(repos, m[1]) });
                });
            }
        });
        // priorité aux reculs (à voir en premier), puis progrès
        out.sort(function (a, b) { return (a.tone === 'down' ? -1 : 1) - (b.tone === 'down' ? -1 : 1); });
        return out;
    }

    // ── « Le conseil du jour » : cap DORA en cours sinon starter, non répété ──
    function adviceLog() { try { var r = lsGet(ADVICE_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; } }
    function recordAdvice(id) { var log = adviceLog(); var e = log[id] || { count: 0 }; e.count++; e.lastAt = today(); log[id] = e; lsSet(ADVICE_KEY, JSON.stringify(log)); }
    function buildConseil(repos) {
        var cands = [];
        var keys = []; try { for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)); } catch (e) { }
        keys.forEach(function (k) {
            var m = k.match(/^salsifi_dora_coach_(.+)$/); if (!m) return;
            try { var c = JSON.parse(lsGet(k)); if (c && c.focus) cands.push({ id: 'coach:' + m[1] + ':' + c.focus, text: `Continue ton cap sur <b>${esc(METRIC_FR[c.focus] || c.focus)}</b>${repoName(repos, m[1]) ? ' — ' + esc(repoName(repos, m[1])) : ''}.`, pid: m[1], page: 'insights.html' }); } catch (e) { }
        });
        // Starters génériques (déterministes) si pas de cap en cours.
        cands.push({ id: 'starter:dora', text: 'Ouvre <b>DORA Insights</b> sur un repo et fixe un cap avec le Coach Salsi.', page: 'insights.html' });
        cands.push({ id: 'starter:sec', text: 'Lance un <b>scan sécurité</b> (Gouvernance) sur un repo clé.', page: 'gouvernance-repo.html' });
        cands.push({ id: 'starter:badge', text: 'Passe voir tes <b>Achievements</b> — un badge est peut-être à portée.', page: 'gaming.html' });
        var GH = Salsifi.gamingHistory;
        var ids = cands.map(function (c) { return c.id; });
        var pick = (GH && GH.pickAdvice) ? GH.pickAdvice(ids, adviceLog()) : { id: ids[0] };
        var chosen = cands.filter(function (c) { return c.id === (pick && pick.id); })[0] || cands[0];
        return chosen;
    }

    // ── Rendu (réutilise les classes .salsi-* de l'Atelier partagé) ──
    function close() { var ov = document.getElementById('salsiBrief'); if (ov) ov.style.display = 'none'; }
    function openRepo(pid, page) { if (pid) { try { localStorage.setItem('hub_selected_repo_id', pid); } catch (e) { } } window.location.href = page || 'insights.html'; }

    function show() {
        var auth = getAuth(); if (!auth) return;   // pas connecté → le hub gère
        var mascot = Salsifi.mascotSVG ? Salsifi.mascotSVG('happy') : '🌱';
        var repos = knownRepos(auth.username);
        var moves = collectMovements(repos);
        var conseil = buildConseil(repos);
        var hasHistory = moves.length > 0;
        var hour = new Date().getHours();
        var hello = hour < 6 ? 'Bonne nuit' : hour < 18 ? 'Bonjour' : 'Bonsoir';
        var dateFr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

        // Périmètre + reprise (cache-first, tolérant au cache vidé).
        var analysis = [];
        if (repos && repos.length) analysis.push({ label: '📦 Ton périmètre :', value: repos.length + ' repo' + (repos.length > 1 ? 's' : '') });
        var lastPid = lsGet('hub_selected_repo_id'), lastName = repoName(repos, lastPid);
        if (lastName) analysis.push({ label: '↩️ Reprends :', value: lastName });
        var analysisHtml = analysis.length ? '<div class="salsi-analysis">' + analysis.map(function (a) { return '<span class="salsi-an">' + esc(a.label) + ' <b>' + esc(a.value) + '</b></span>'; }).join('') + '</div>' : '';

        // Ce qui a bougé.
        var movedHtml;
        if (hasHistory) {
            movedHtml = '<div class="salsi-sec-h">📓 Ce qui a bougé</div><ol class="salsi-steps salsi-plan">' +
                moves.slice(0, 6).map(function (mv) { return '<li>' + (mv.tone === 'down' ? '🔻 ' : mv.tone === 'up' ? '🔺 ' : '• ') + eventText(mv.kind, mv.e, mv.name) + '</li>'; }).join('') + '</ol>';
        } else if (repos && repos.length) {
            movedHtml = '<div class="salsi-why">Je pars de tes <b>données fraîches</b>. Dès que tu ouvriras un repo (DORA, Achievements…), je pourrai te raconter ce qui bouge d\'une visite à l\'autre.</div>';
        } else {
            movedHtml = '<div class="salsi-why">Content de te voir 🌱 On démarre — choisis un repo dans le hub et lançons un premier module ensemble.</div>';
        }

        var conseilHtml = '<div class="salsi-measure">🎯 <b>Le conseil du jour :</b> ' + conseil.text + '</div>';

        var actions = '';
        var openLabel = conseil.pid ? '🚀 Ouvrir le détail' : '🚀 ' + (conseil.page === 'gaming.html' ? 'Voir mes badges' : conseil.page === 'gouvernance-repo.html' ? 'Aller au scan' : 'Ouvrir DORA');
        actions += '<button class="salsi-btn primary" onclick="salsiBriefOpenRepo(' + (conseil.pid ? "'" + esc(conseil.pid) + "'" : 'null') + ",'" + esc(conseil.page) + "')\">" + openLabel + '</button>';
        actions += '<button class="salsi-btn ghost" onclick="salsiBriefClose()">Aller au hub →</button>';

        var ov = document.getElementById('salsiBrief');
        if (!ov) { ov = document.createElement('div'); ov.id = 'salsiBrief'; ov.className = 'salsi-overlay'; document.body.appendChild(ov); }
        ov.innerHTML = '<div class="salsi-modal" onclick="event.stopPropagation()">' +
            '<div class="salsi-modal-head">' +
            '<div class="salsi-modal-mascot mood-happy">' + mascot + '</div>' +
            '<div><div class="salsi-modal-title">' + esc(hello) + ' ' + esc((auth.username || '').split(/[.@]/)[0]) + ' 🌱</div>' +
            '<div class="salsi-modal-badge">' + esc(dateFr) + ' · brief du jour</div></div>' +
            '<button class="salsi-x" onclick="salsiBriefClose()">✕</button>' +
            '</div>' +
            '<div class="salsi-bubble2">Voici ce que j\'ai retenu — ou file droit au hub, comme tu veux 👇</div>' +
            analysisHtml + movedHtml + conseilHtml +
            '<div class="salsi-actions">' + actions + '</div>' +
            '</div>';
        ov.style.display = 'flex';
        ov.onclick = close;   // clic hors carte = fermer
        lsSet(SEEN_KEY, today());
    }

    // Pastille de ré-ouverture dans le header.
    function injectChip() {
        try {
            var host = document.querySelector('.header-actions'); if (!host || document.getElementById('salsiBriefChip')) return;
            var b = document.createElement('button');
            b.id = 'salsiBriefChip'; b.className = 'header-btn'; b.title = 'Le brief du jour de Salsi';
            b.textContent = '🌱 Salsi'; b.onclick = function () { show(); };
            host.insertBefore(b, host.firstChild);
        } catch (e) { }
    }

    window.salsiBriefShow = show;
    window.salsiBriefClose = close;
    window.salsiBriefOpenRepo = openRepo;

    // Démarrage : après que le hub ait eu le temps de charger ses repos.
    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(function () {
            if (!getAuth()) return;   // login gère
            injectChip();
            if (lsGet(SEEN_KEY) !== today()) { try { show(); } catch (e) { } }
        }, 700);
    });
})();
