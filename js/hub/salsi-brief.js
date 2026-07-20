/*
 * Salsi — diagnostic à la demande (hub)
 * -------------------------------------
 * On entre sur le hub NORMALEMENT (aucune popup à l'arrivée). Le bouton
 * « 🌱 Salsi » du header ouvre Salsi quand on veut : il ANALYSE ce qu'il peut
 * vraiment voir — les repos que tu suis déjà (compagnons DORA/gaming en
 * localStorage) — et te dit « où ça coince » (reculs, régressions, badges perdus).
 *
 * 100 % déterministe, aucune IA. Honnête à l'échelle : ne prétend jamais avoir
 * scanné 1000 repos ; il regarde tes repos suivis. Réutilise la popup Atelier
 * partagée (css/salsi-atelier.css + Salsifi.mascotSVG).
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
    function frDate(at) {
        var M = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
        var p = String(at).split('-'); if (p.length < 3) return at;
        return parseInt(p[2], 10) + ' ' + (M[parseInt(p[1], 10) - 1] || '');
    }

    var METRIC_FR = { df: 'fréquence de déploiement', lt: 'lead time', cfr: 'taux d\'échec', mttr: 'temps de restauration' };

    // ── Analyse : « où ça coince » dans les repos suivis (données mesurées) ──
    // Un problème = un recul réel : palier DORA retombé, niveau global en baisse,
    // métrique qui se dégrade, badge perdu. Rien d'inventé.
    function collectProblems() {
        var GH = Salsifi.gamingHistory, DH = Salsifi.doraHistory;
        var repos = knownRepos((getAuth() || {}).username);
        var tracked = {};   // pid → true (repos réellement suivis)
        var probs = [];
        var keys = []; try { for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)); } catch (e) { }
        keys.forEach(function (k) {
            var m;
            if (DH && (m = k.match(/^salsifi_dora_history_(.+)$/))) {
                var pid = m[1]; tracked[pid] = true;
                var hist = DH.read(pid); if (!hist || hist.length < 2) return;
                var name = repoName(repos, pid) || ('repo #' + pid);
                DH.deriveEvents(hist).forEach(function (e) {
                    if (e.type === 'level-down') probs.push({ sev: 2, at: e.at, pid: pid, page: 'insights.html', text: `<b>${esc(name)}</b> : ${esc(METRIC_FR[e.metric] || e.metric)} retombé <b>${esc(e.from)}→${esc(e.to)}</b>` });
                    else if (e.type === 'score-down') probs.push({ sev: 2, at: e.at, pid: pid, page: 'insights.html', text: `<b>${esc(name)}</b> : niveau DORA global <b>en baisse</b>` });
                    else if (e.type === 'regression') probs.push({ sev: 1, at: e.at, pid: pid, page: 'insights.html', text: `<b>${esc(name)}</b> : ${esc(METRIC_FR[e.metric] || 'une métrique')} se dégrade` });
                });
            } else if (GH && (m = k.match(/^salsifi_gaming_history_(.+)$/))) {
                if (/^dora_/.test(m[1])) return;
                var pid2 = m[1]; tracked[pid2] = true;
                var h2 = GH.read(pid2); if (!h2 || h2.length < 2) return;
                var name2 = repoName(repos, pid2) || ('repo #' + pid2);
                GH.deriveEvents(h2, {}).forEach(function (e) {
                    if (e.kind === 'badge' && e.type === 'lost') probs.push({ sev: 1, at: e.at, pid: pid2, page: 'gaming.html', text: `<b>${esc(name2)}</b> : un badge perdu` });
                });
            }
        });
        // dédup (même repo|texte), tri gravité puis date récente
        var seen = {}, out = [];
        probs.forEach(function (p) { var k2 = p.pid + '|' + p.text; if (seen[k2]) return; seen[k2] = 1; out.push(p); });
        out.sort(function (a, b) { return (b.sev - a.sev) || (a.at < b.at ? 1 : -1); });
        return { problems: out, trackedCount: Object.keys(tracked).length };
    }

    function close() { var ov = document.getElementById('salsiBrief'); if (ov) ov.style.display = 'none'; }
    function openRepo(pid, page) { if (pid) { try { localStorage.setItem('hub_selected_repo_id', pid); } catch (e) { } } window.location.href = page || 'insights.html'; }
    function pickRepo() { close(); try { if (typeof toggleRepoPicker === 'function' && !document.getElementById('repoPickerBtn').disabled) toggleRepoPicker(); } catch (e) { } }

    function show() {
        var auth = getAuth(); if (!auth) return;
        var data = collectProblems();
        var probs = data.problems;
        var mood = probs.length ? 'worried' : (data.trackedCount ? 'proud' : 'happy');
        var mascot = Salsifi.mascotSVG ? Salsifi.mascotSVG(mood) : '🌱';

        var title, sub, body;
        if (probs.length) {
            title = 'Voilà où ça coince';
            sub = data.trackedCount + ' repo' + (data.trackedCount > 1 ? 's' : '') + ' suivi' + (data.trackedCount > 1 ? 's' : '') + ' · ' + probs.length + ' point' + (probs.length > 1 ? 's' : '') + ' à voir';
            body = '<div class="salsi-sec-h">🔻 À regarder</div><ol class="salsi-steps salsi-plan">' +
                probs.slice(0, 8).map(function (p) {
                    return `<li><a href="#" onclick="salsiBriefOpenRepo('${esc(p.pid)}','${esc(p.page)}');return false;">${p.text}</a> <span class="salsi-mode">· ${esc(frDate(p.at))}</span></li>`;
                }).join('') + '</ol>';
        } else if (data.trackedCount) {
            title = 'Rien d\'alarmant 👍';
            sub = 'J\'ai regardé les ' + data.trackedCount + ' repo' + (data.trackedCount > 1 ? 's' : '') + ' que tu suis';
            body = '<div class="salsi-measure">✅ Aucun recul dans ce que je suis : pas de palier DORA retombé, pas de badge perdu. Tiens le cap.</div>';
        } else {
            title = 'Je n\'ai pas encore de quoi analyser';
            sub = 'aucune mesure enregistrée pour l\'instant';
            body = '<div class="salsi-why">Ouvre un repo et lance un module (<b>DORA Insights</b>, <b>Gouvernance</b>, <b>Achievements</b>). Dès que j\'aurai des mesures, je te dirai précisément <b>où ça coince</b> — d\'un passage à l\'autre.</div>';
        }

        var actions = '<button class="salsi-btn primary" onclick="salsiBriefPickRepo()">🔎 Choisir un repo</button>' +
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
            '<div class="salsi-bubble2">J\'ai regardé les repos que tu suis — voici ce qui a reculé. Clique un point pour aller le traiter.</div>' +
            body +
            '<div class="salsi-actions">' + actions + '</div>' +
            '</div>';
        ov.style.display = 'flex';
        ov.onclick = close;
    }

    // Pastille d'ouverture dans le header (le SEUL point d'entrée — pas d'auto-popup).
    function injectChip() {
        try {
            var host = document.querySelector('.header-actions'); if (!host || document.getElementById('salsiBriefChip')) return;
            var b = document.createElement('button');
            b.id = 'salsiBriefChip'; b.className = 'header-btn'; b.title = 'Salsi : où ça coince ?';
            b.textContent = '🌱 Salsi'; b.onclick = function () { show(); };
            host.insertBefore(b, host.firstChild);
        } catch (e) { }
    }

    window.salsiBriefShow = show;
    window.salsiBriefClose = close;
    window.salsiBriefOpenRepo = openRepo;
    window.salsiBriefPickRepo = pickRepo;

    // On n'ouvre RIEN à l'arrivée : on pose juste la pastille.
    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(function () { if (getAuth()) injectChip(); }, 500);
    });
})();
