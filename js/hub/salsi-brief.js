/*
 * Salsi — résumé d'analyse à la demande (hub)
 * -------------------------------------------
 * On entre sur le hub NORMALEMENT (aucune popup à l'arrivée). Le bouton
 * « 🌱 Salsi » du header ouvre Salsi quand on veut : il fait le RÉSUMÉ des
 * modules pour UN repo (celui sélectionné dans le hub, sinon le mieux suivi) et
 * affiche les 5 PRIORITÉS — axe analyse, pas seulement les reculs.
 *
 * 100 % déterministe, aucune IA. Honnête à l'échelle : lit ce qui est déjà
 * mesuré (compagnons DORA/gaming en localStorage) pour ce repo ; ne prétend
 * jamais avoir scanné 1000 repos. Réutilise la popup Atelier partagée.
 */
(function () {
    'use strict';
    var Salsifi = window.Salsifi || (window.Salsifi = {});
    function esc(s) { return Salsifi.escapeHtml ? Salsifi.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

    function getAuth() {
        try { if (typeof loadAuth === 'function') { var a = loadAuth({ redirect: false }); if (a) return a; } } catch (e) { }
        try { var raw = lsGet('devops_hub_workspaces'); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }
    function knownRepos(username) {
        try { var raw = lsGet('hub_cache_repos_' + (username || '')); if (raw) { var c = JSON.parse(raw); if (c && Array.isArray(c.repos) && c.repos.length) return c.repos; } } catch (e) { }
        try { if (typeof allRepos !== 'undefined' && Array.isArray(allRepos) && allRepos.length) return allRepos; } catch (e) { }
        return null;
    }
    function repoName(repos, pid) { if (!repos) return null; for (var i = 0; i < repos.length; i++) { if (String(repos[i].id) === String(pid)) return repos[i].name; } return null; }

    var DORA_EMOJI = { df: '🚀', lt: '⚡', cfr: '🔧', mttr: '⏱️' };
    var METRIC_FR = { df: 'fréquence de déploiement', lt: 'lead time', cfr: 'taux d\'échec', mttr: 'temps de restauration' };
    var LVL_RANK = { Low: 3, Medium: 2, High: 1, Elite: 0 };

    // Repos que Salsi peut réellement analyser (= ceux qui ont des mesures).
    function trackedPids() {
        var GH = Salsifi.gamingHistory, DH = Salsifi.doraHistory, set = {};
        var keys = []; try { for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)); } catch (e) { }
        keys.forEach(function (k) {
            var m = k.match(/^salsifi_dora_history_(.+)$/); if (m) { set[m[1]] = (set[m[1]] || 0) + 2; }
            m = k.match(/^salsifi_gaming_history_(.+)$/); if (m && !/^dora_/.test(m[1])) { set[m[1]] = (set[m[1]] || 0) + 1; }
        });
        return set;
    }
    // Repo cible : celui sélectionné dans le hub s'il est suivi, sinon le mieux suivi.
    function targetRepo() {
        var tracked = trackedPids();
        var sel = lsGet('hub_selected_repo_id');
        if (sel && tracked[sel]) return sel;
        var best = null, bestScore = -1;
        Object.keys(tracked).forEach(function (pid) { if (tracked[pid] > bestScore) { bestScore = tracked[pid]; best = pid; } });
        return best || sel || null;
    }

    // ── Résumé des modules d'UN repo → items priorisés (score décroissant) ──
    function analyzeRepo(pid) {
        var GH = Salsifi.gamingHistory, DH = Salsifi.doraHistory, items = [];
        // Un item par « sujet » (key) ; si plusieurs signaux pointent le même sujet
        // (ex. lead time faible ET en recul), on garde la formulation la plus forte.
        function add(key, score, page, text) { var e = items[key]; if (!e || score > e.score) items[key] = { key: key, score: score, page: page, text: text }; }
        items = {};
        // DORA (compagnon) — un item par métrique + un pour le niveau global
        var hist = DH ? DH.read(pid) : [];
        if (hist && hist.length) {
            var last = hist[hist.length - 1], levels = last.levels || {};
            ['cfr', 'mttr', 'lt', 'df'].forEach(function (k) {
                var lv = levels[k]; if (!lv || lv === 'Elite') return;
                add('dora:' + k, 10 + LVL_RANK[lv], 'insights.html', `${DORA_EMOJI[k]} <b>${esc(METRIC_FR[k])}</b> en ${esc(lv)} — ${lv === 'Low' ? 'à traiter en priorité' : 'à pousser vers le niveau supérieur'}`);
            });
            if (hist.length >= 2) {
                var lastAt = last.at;
                DH.deriveEvents(hist).forEach(function (e) {
                    if (e.at !== lastAt) return;
                    if (e.type === 'level-down') add('dora:' + e.metric, 30, 'insights.html', `🔻 ${DORA_EMOJI[e.metric] || ''} <b>${esc(METRIC_FR[e.metric] || e.metric)}</b> vient de retomber <b>${esc(e.from)}→${esc(e.to)}</b>`);
                    else if (e.type === 'score-down') add('dora:score', 28, 'insights.html', `🔻 <b>niveau DORA global</b> en baisse`);
                    else if (e.type === 'regression') add('dora:' + e.metric, 20, 'insights.html', `⚠️ ${DORA_EMOJI[e.metric] || ''} <b>${esc(METRIC_FR[e.metric] || 'une métrique')}</b> se dégrade`);
                });
            }
        }
        // Achievements (compagnon)
        var g = GH ? GH.read(pid) : [];
        if (g && g.length) {
            var lg = g[g.length - 1];
            if (g.length >= 2) {
                var lat = lg.at;
                GH.deriveEvents(g, {}).forEach(function (e) { if (e.at === lat && e.kind === 'badge' && e.type === 'lost') add('game:lost', 22, 'gaming.html', `🏅 <b>un badge perdu</b> — à reprendre`); });
            }
            var unlocked = (lg.unlocked || []).length;
            if (unlocked < 47) add('game:count', 5, 'gaming.html', `🎮 <b>${unlocked}/47 badges</b> — d'autres sont à portée`);
        }
        return Object.keys(items).map(function (k) { return items[k]; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 5);
    }

    function close() { var ov = document.getElementById('salsiBrief'); if (ov) ov.style.display = 'none'; }
    function openRepo(pid, page) { if (pid) { try { localStorage.setItem('hub_selected_repo_id', pid); } catch (e) { } } window.location.href = page || 'insights.html'; }
    function pickRepo() { close(); try { if (typeof toggleRepoPicker === 'function' && !document.getElementById('repoPickerBtn').disabled) toggleRepoPicker(); } catch (e) { } }

    function show() {
        var auth = getAuth(); if (!auth) return;
        var repos = knownRepos(auth.username);
        var pid = targetRepo();
        var name = pid ? (repoName(repos, pid) || ('repo #' + pid)) : null;
        var items = pid ? analyzeRepo(pid) : [];
        var mood = items.some(function (i) { return i.score >= 25; }) ? 'worried' : (items.length ? 'proud' : 'happy');
        var mascot = Salsifi.mascotSVG ? Salsifi.mascotSVG(mood) : '🌱';

        var title, sub, body;
        if (pid && items.length) {
            title = 'Résumé — ' + name;
            sub = 'les ' + items.length + ' priorité' + (items.length > 1 ? 's' : '') + ' du moment';
            body = '<div class="salsi-sec-h">🎯 À traiter en priorité</div><ol class="salsi-steps salsi-plan">' +
                items.map(function (it, i) { return `<li><a href="#" onclick="salsiBriefOpenRepo('${esc(pid)}','${esc(it.page)}');return false;">${it.text}</a></li>`; }).join('') + '</ol>';
        } else if (pid) {
            title = 'Résumé — ' + name;
            sub = 'rien de prioritaire';
            body = '<div class="salsi-measure">✅ D\'après mes mesures, ce repo est au propre : pas de métrique DORA faible, pas de badge perdu. Beau boulot.</div>';
        } else {
            title = 'Choisis un repo';
            sub = 'et je te fais le résumé de ses modules';
            body = '<div class="salsi-why">Sélectionne un repo dans le hub, puis rouvre-moi : je te sors les <b>5 priorités</b> à partir de ce que j\'ai mesuré (DORA, Achievements…). Je n\'analyse que les repos que tu suis — pas les 1000.</div>';
        }

        var actions = '<button class="salsi-btn primary" onclick="salsiBriefPickRepo()">🔎 Choisir un repo</button>' +
            (pid ? `<button class="salsi-btn" onclick="salsiBriefOpenRepo('${esc(pid)}','insights.html')">📊 Ouvrir DORA</button>` : '') +
            '<button class="salsi-btn ghost" onclick="salsiBriefClose()">Fermer</button>';

        var ov = document.getElementById('salsiBrief');
        if (!ov) { ov = document.createElement('div'); ov.id = 'salsiBrief'; ov.className = 'salsi-overlay'; document.body.appendChild(ov); }
        ov.innerHTML = '<div class="salsi-modal" onclick="event.stopPropagation()">' +
            '<div class="salsi-modal-head">' +
            '<div class="salsi-modal-mascot mood-' + mood + '">' + mascot + '</div>' +
            '<div><div class="salsi-modal-title">' + esc(title) + '</div>' +
            '<div class="salsi-modal-badge">' + esc(sub) + '</div></div>' +
            '<button class="salsi-x" onclick="salsiBriefClose()">✕</button>' +
            '</div>' +
            '<div class="salsi-bubble2">J\'ai résumé les modules de ce repo — voici où mettre ton énergie. Clique une priorité pour y aller.</div>' +
            body +
            '<div class="salsi-actions">' + actions + '</div>' +
            '</div>';
        ov.style.display = 'flex';
        ov.onclick = close;
    }

    function injectChip() {
        try {
            var host = document.querySelector('.header-actions'); if (!host || document.getElementById('salsiBriefChip')) return;
            var b = document.createElement('button');
            b.id = 'salsiBriefChip'; b.className = 'header-btn'; b.title = 'Salsi : le résumé & les priorités d\'un repo';
            b.textContent = '🌱 Salsi'; b.onclick = function () { show(); };
            host.insertBefore(b, host.firstChild);
        } catch (e) { }
    }

    window.salsiBriefShow = show;
    window.salsiBriefClose = close;
    window.salsiBriefOpenRepo = openRepo;
    window.salsiBriefPickRepo = pickRepo;

    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(function () { if (getAuth()) injectChip(); }, 500);
    });
})();
