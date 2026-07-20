/*
 * Salsi — analyse cross-modules d'un repo, à la demande (hub)
 * ----------------------------------------------------------
 * On entre sur le hub NORMALEMENT (aucune popup). Le bouton « 🌱 Salsi » du header
 * ouvre Salsi quand on veut : il fait une VRAIE analyse d'UN repo (le sélectionné
 * dans le hub) en tirant une priorité de chaque module —
 *   🔒 Sécurité (CIS light)  🚌 Bus factor  🩺 Repo Analyzer  📆 Activité (Daily)
 *   🚩 Feature Flags  📊 DORA (cache)  🎮 Achievements (cache)
 * — et affiche les 5 PRIORITÉS, **sécurité en tête**.
 *
 * Check léger LIVE (à la demande, UN repo → quelques appels, mini-loader). Honnête :
 * 403 → « non vérifiable », jamais compté à charge. Réutilise la popup Atelier partagée.
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
    var DAY = 86400000;

    function trackedPids() {
        var set = {};
        var keys = []; try { for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)); } catch (e) { }
        keys.forEach(function (k) {
            var m = k.match(/^salsifi_dora_history_(.+)$/); if (m) set[m[1]] = (set[m[1]] || 0) + 2;
            m = k.match(/^salsifi_gaming_history_(.+)$/); if (m && !/^dora_/.test(m[1])) set[m[1]] = (set[m[1]] || 0) + 1;
        });
        return set;
    }
    // Repo à analyser : sélectionné dans le hub, sinon le mieux suivi.
    function targetRepo() {
        var sel = lsGet('hub_selected_repo_id'); if (sel) return sel;
        var tracked = trackedPids(), best = null, bs = -1;
        Object.keys(tracked).forEach(function (p) { if (tracked[p] > bs) { bs = tracked[p]; best = p; } });
        return best;
    }

    // ── Signaux en cache (DORA + Achievements) — instantané ──
    function cachedItems(pid, add) {
        var GH = Salsifi.gamingHistory, DH = Salsifi.doraHistory;
        var hist = DH ? DH.read(pid) : [];
        if (hist && hist.length) {
            var last = hist[hist.length - 1], levels = last.levels || {};
            ['cfr', 'mttr', 'lt', 'df'].forEach(function (k) {
                var lv = levels[k]; if (!lv || lv === 'Elite') return;
                add('dora:' + k, 10 + LVL_RANK[lv], 'insights.html', `${DORA_EMOJI[k]} <b>${esc(METRIC_FR[k])}</b> en ${esc(lv)} — ${lv === 'Low' ? 'à traiter' : 'à pousser'}`);
            });
            if (hist.length >= 2) {
                var at = last.at;
                DH.deriveEvents(hist).forEach(function (e) {
                    if (e.at !== at) return;
                    if (e.type === 'level-down') add('dora:' + e.metric, 30, 'insights.html', `🔻 ${DORA_EMOJI[e.metric] || ''} <b>${esc(METRIC_FR[e.metric] || e.metric)}</b> retombé <b>${esc(e.from)}→${esc(e.to)}</b>`);
                    else if (e.type === 'score-down') add('dora:score', 28, 'insights.html', `🔻 <b>niveau DORA global</b> en baisse`);
                    else if (e.type === 'regression') add('dora:' + e.metric, 20, 'insights.html', `⚠️ ${DORA_EMOJI[e.metric] || ''} <b>${esc(METRIC_FR[e.metric] || 'une métrique')}</b> se dégrade`);
                });
            }
        }
        var g = GH ? GH.read(pid) : [];
        if (g && g.length) {
            var lg = g[g.length - 1];
            if (g.length >= 2) { var lat = lg.at; GH.deriveEvents(g, {}).forEach(function (e) { if (e.at === lat && e.kind === 'badge' && e.type === 'lost') add('game:lost', 22, 'gaming.html', `🏅 <b>un badge perdu</b> — à reprendre`); }); }
            var u = (lg.unlocked || []).length; if (u < 47) add('game:count', 5, 'gaming.html', `🎮 <b>${u}/47 badges</b> — d'autres à décrocher`);
        }
    }

    // ── Analyse LIVE cross-modules (un repo) ──
    async function analyzeLive(auth, pid, add) {
        var base = auth.gitlabUrl, tok = auth.token;
        function J(ep) { return Salsifi.gitlabJson(base, tok, ep); }
        async function F(ep) { try { var r = await Salsifi.gitlabFetch(base, tok, ep); return { status: r.status, data: r.ok ? await r.json() : null }; } catch (e) { return { status: 0, data: null }; } }
        var since = new Date(Date.now() - 7 * DAY).toISOString();

        var res = await Promise.all([
            J(`/projects/${pid}`),
            F(`/projects/${pid}/protected_branches?per_page=100`),
            F(`/projects/${pid}/approvals`),
            J(`/projects/${pid}/repository/tree?per_page=100`),
            J(`/projects/${pid}/repository/contributors`),
            Salsifi.gitlabPaginate(base, tok, `/projects/${pid}/repository/branches`, { maxPages: 3 }).catch(function () { return []; }),
            J(`/projects/${pid}/pipelines?updated_after=${encodeURIComponent(since)}&per_page=50`),
            F(`/projects/${pid}/feature_flags?per_page=50`)
        ]);
        var proj = res[0], prot = res[1], appr = res[2], tree = res[3], contrib = res[4], branches = res[5], pipes = res[6], flags = res[7];
        var name = (proj && proj.name) || null;
        var defBranch = (proj && proj.default_branch) || 'main';

        // 🔒 Sécurité (en tête)
        if (proj && proj.visibility === 'public') add('sec:visib', 55, 'gouvernance-repo.html', `🔒 <b>repo public</b> — visibilité à revoir`);
        if (prot.status === 403 || appr.status === 403) add('sec:unverif', 15, 'gouvernance-repo.html', `🔒 <b>sécurité non vérifiable</b> — droits insuffisants (info)`);
        if (Array.isArray(prot.data)) { if (!prot.data.some(function (b) { return b.name === defBranch; })) add('sec:branch', 60, 'gouvernance-repo.html', `🔒 <b>branche par défaut non protégée</b> (${esc(defBranch)})`); }
        if (appr.status >= 200 && appr.status < 300 && appr.data && (appr.data.approvals_before_merge || 0) < 1) add('sec:appr', 52, 'gouvernance-repo.html', `🔒 <b>aucune approbation requise</b> avant merge`);
        if (Array.isArray(tree)) {
            var has = function (n) { return tree.some(function (f) { return (f.name || '').toUpperCase() === n; }); };
            if (!has('SECURITY.MD') && !has('CODEOWNERS')) add('sec:docs', 42, 'gouvernance-repo.html', `🔒 pas de <b>SECURITY.md</b> ni <b>CODEOWNERS</b>`);
        }

        // 🚌 Bus factor
        if (Array.isArray(contrib) && contrib.length) {
            var total = contrib.reduce(function (s, c) { return s + (c.commits || 0); }, 0);
            var top = contrib.reduce(function (m, c) { return Math.max(m, c.commits || 0); }, 0);
            var share = total ? top / total : 0;
            if (contrib.length === 1) add('bus', 50, 'bus-factor.html', `🚌 <b>bus factor critique</b> : 1 seul contributeur`);
            else if (share >= 0.7) add('bus', 38, 'bus-factor.html', `🚌 savoir concentré : <b>${Math.round(share * 100)}%</b> des commits sur 1 personne`);
        }

        // 🩺 Repo Analyzer (santé)
        if (proj && proj.last_activity_at) { var d = (Date.now() - Date.parse(proj.last_activity_at)) / DAY; if (d > 90) add('health:inactive', 30, 'repo-analyzer.html', `🩺 repo <b>inactif depuis ${Math.round(d)} j</b>`); }
        if (Array.isArray(branches) && branches.length) {
            var stale = branches.filter(function (b) { if (['main', 'master', 'develop', 'dev'].indexOf(b.name) >= 0) return false; return b.commit && b.commit.committed_date && (Date.now() - Date.parse(b.commit.committed_date)) / DAY > 60; }).length;
            if (stale >= 8) add('health:branches', 26, 'branch-cleaner.html', `🌿 <b>${stale} branches mortes</b> (60 j+) à nettoyer`);
        }

        // 📆 Activité (Daily Report)
        if (Array.isArray(pipes)) { var failed = pipes.filter(function (p) { return p.status === 'failed'; }).length; if (failed > 0) add('daily:failed', 34, 'daily-report.html', `📆 <b>${failed} pipeline(s) en échec</b> cette semaine`); }

        // 🚩 Feature Flags (si utilisés)
        if (flags.status >= 200 && Array.isArray(flags.data) && flags.data.length) {
            var inactive = flags.data.filter(function (f) { return f.active === false; }).length;
            add('flags', 18, 'feature-flag-manager.html', `🚩 <b>${flags.data.length} feature flag(s)</b>${inactive ? `, ${inactive} inactif(s)` : ''} — à revoir`);
        }
        return name;
    }

    function close() { var ov = document.getElementById('salsiBrief'); if (ov) ov.style.display = 'none'; }
    function openRepo(pid, page) { if (pid) { try { localStorage.setItem('hub_selected_repo_id', pid); } catch (e) { } } window.location.href = page || 'insights.html'; }
    function pickRepo() { close(); try { if (typeof toggleRepoPicker === 'function' && !document.getElementById('repoPickerBtn').disabled) toggleRepoPicker(); } catch (e) { } }

    function shell(mood, title, sub, body, actions) {
        var mascot = Salsifi.mascotSVG ? Salsifi.mascotSVG(mood) : '🌱';
        var ov = document.getElementById('salsiBrief');
        if (!ov) { ov = document.createElement('div'); ov.id = 'salsiBrief'; ov.className = 'salsi-overlay'; document.body.appendChild(ov); }
        ov.innerHTML = '<div class="salsi-modal" onclick="event.stopPropagation()">' +
            '<div class="salsi-modal-head"><div class="salsi-modal-mascot mood-' + mood + '">' + mascot + '</div>' +
            '<div><div class="salsi-modal-title">' + esc(title) + '</div><div class="salsi-modal-badge">' + esc(sub) + '</div></div>' +
            '<button class="salsi-x" onclick="salsiBriefClose()">✕</button></div>' + body +
            (actions ? '<div class="salsi-actions">' + actions + '</div>' : '') + '</div>';
        ov.style.display = 'flex'; ov.onclick = close;
    }

    async function show() {
        var auth = getAuth(); if (!auth) return;
        var repos = knownRepos(auth.username);
        var pid = targetRepo();
        if (!pid) { shell('happy', 'Choisis un repo', 'et je te fais son bilan', '<div class="salsi-why">Sélectionne un repo dans le hub, puis rouvre-moi : j\'analyse ses modules (sécurité, bus factor, activité, DORA…) et te sors les <b>5 priorités</b>, sécurité en tête.</div>', '<button class="salsi-btn primary" onclick="salsiBriefPickRepo()">🔎 Choisir un repo</button><button class="salsi-btn ghost" onclick="salsiBriefClose()">Fermer</button>'); return; }

        var name0 = repoName(repos, pid) || ('repo #' + pid);
        shell('meh', 'Analyse en cours…', name0, '<div class="salsi-why">⏳ Je regarde les modules de <b>' + esc(name0) + '</b> — sécurité, bus factor, activité, DORA… un instant.</div>', '');

        var map = {};
        function add(key, score, page, text) { var e = map[key]; if (!e || score > e.score) map[key] = { key: key, score: score, page: page, text: text }; }
        cachedItems(pid, add);
        var name = name0;
        try { var n = await analyzeLive(auth, pid, add); if (n) name = n; } catch (e) { /* live indispo → on garde le cache */ }

        var items = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 5);
        var mood = items.some(function (i) { return i.score >= 50; }) ? 'worried' : (items.length ? 'proud' : 'happy');

        var title, sub, body;
        if (items.length) {
            title = 'Bilan — ' + name;
            sub = 'les ' + items.length + ' priorité' + (items.length > 1 ? 's' : '') + ' · sécurité en tête';
            body = '<div class="salsi-sec-h">🎯 À traiter en priorité</div><ol class="salsi-steps salsi-plan">' +
                items.map(function (it) { return `<li><a href="#" onclick="salsiBriefOpenRepo('${esc(pid)}','${esc(it.page)}');return false;">${it.text}</a></li>`; }).join('') + '</ol>';
        } else {
            title = 'Bilan — ' + name;
            sub = 'rien de prioritaire';
            body = '<div class="salsi-measure">✅ Branche protégée, approbations en place, activité saine, DORA au vert : ce repo est propre. Beau boulot.</div>';
        }
        var actions = '<button class="salsi-btn primary" onclick="salsiBriefPickRepo()">🔎 Autre repo</button>' +
            `<button class="salsi-btn" onclick="salsiBriefOpenRepo('${esc(pid)}','gouvernance-repo.html')">🔒 Sécurité</button>` +
            '<button class="salsi-btn ghost" onclick="salsiBriefClose()">Fermer</button>';
        shell(mood, title, sub, body, actions);
    }

    function injectChip() {
        try {
            var host = document.querySelector('.header-actions'); if (!host || document.getElementById('salsiBriefChip')) return;
            var b = document.createElement('button');
            b.id = 'salsiBriefChip'; b.className = 'header-btn'; b.title = 'Salsi : le bilan cross-modules d\'un repo (sécurité en tête)';
            b.textContent = '🌱 Salsi'; b.onclick = function () { show(); };
            host.insertBefore(b, host.firstChild);
        } catch (e) { }
    }

    window.salsiBriefShow = show;
    window.salsiBriefClose = close;
    window.salsiBriefOpenRepo = openRepo;
    window.salsiBriefPickRepo = pickRepo;

    document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { if (getAuth()) injectChip(); }, 500); });
})();
