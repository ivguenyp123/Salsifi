/*
 * Salsifi — Gaming : historique & journal d'événements (compagnon temporel)
 * ------------------------------------------------------------------------
 * Chargé en <script> classique (marche servi ET en file://), et conçu pour
 * être aussi require() en node (tests hors-ligne) via le pattern global.
 *
 *   Salsifi.gamingHistory.buildSnapshot(unlocked, stats, dateStr) → snapshot
 *   Salsifi.gamingHistory.record(projectId, snapshot)            → history (persiste)
 *   Salsifi.gamingHistory.read(projectId)                        → history
 *   Salsifi.gamingHistory.deriveEvents(history[, opts])          → événements (PUR)
 *
 * Tout est DÉTERMINISTE. Aucune IA. Le stockage (localStorage) est isolé
 * derrière read/write pour pouvoir brancher le snapshot-service plus tard
 * sans toucher au moteur de journal.
 */
(function (global) {
    'use strict';

    var Salsifi = global.Salsifi || (global.Salsifi = {});
    var GH = Salsifi.gamingHistory || (Salsifi.gamingHistory = {});

    // Métriques suivies dans le temps + sens de progression.
    //   'up'   = plus haut est mieux (taux de succès, déploiements…)
    //   'down' = plus bas est mieux (durée pipeline, MTTR, branches mortes…)
    GH.METRIC_DIR = {
        successRate: 'up', weeklyDeploys: 'up', reviewedMRRate: 'up',
        activeContributors: 'up', distinctReviewers: 'up',
        avgPipelineTime: 'down', mttr: 'down', staleBranches: 'down',
        zombieMRs: 'down', mergedBranchesNotDeleted: 'down',
        maxFailedStreak: 'down', avgMRCycleTime: 'down', topContributorShare: 'down'
    };

    // ── Snapshot du jour (date sans heure : 1 point par jour) ──────────────
    GH.buildSnapshot = function (unlocked, stats, dateStr) {
        var metrics = {};
        Object.keys(GH.METRIC_DIR).forEach(function (k) {
            var v = stats ? stats[k] : null;
            if (typeof v === 'number' && isFinite(v)) metrics[k] = v;
        });
        return { at: dateStr, unlocked: (unlocked || []).slice().sort(), metrics: metrics };
    };

    // ── Stockage (isolé — remplaçable par le snapshot-service) ─────────────
    function key(pid) { return 'salsifi_gaming_history_' + pid; }
    GH.read = function (pid) {
        try { var raw = global.localStorage && global.localStorage.getItem(key(pid)); return raw ? JSON.parse(raw) : []; }
        catch (e) { return []; }
    };
    GH.write = function (pid, hist) {
        try { global.localStorage && global.localStorage.setItem(key(pid), JSON.stringify(hist)); } catch (e) { /* quota / indispo */ }
    };
    // Ajoute (ou remplace) le snapshot du jour, garde l'historique trié par date.
    GH.record = function (pid, snap) {
        var hist = GH.read(pid).filter(function (s) { return s.at !== snap.at; });
        hist.push(snap);
        hist.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
        GH.write(pid, hist);
        return hist;
    };

    // ── LE CŒUR : dérive le journal en diffant les snapshots consécutifs ───
    // Fonction PURE (pas de stockage) → testable hors-ligne.
    // Événements : unlocked / lost / recovered / recurrence (badges),
    //              record / regression (métriques).
    GH.deriveEvents = function (history, opts) {
        opts = opts || {};
        var minDrop = opts.minDropPct != null ? opts.minDropPct : 0.10; // 10 % de régression relative
        var aliasOf = opts.aliasOf || {};   // badge secondaire → badge canonique
        var events = [];
        var sorted = (history || []).slice().sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
        var lostCount = {};   // nb de pertes par badge (récurrence)
        var best = {};        // meilleure valeur observée par métrique

        for (var i = 0; i < sorted.length; i++) {
            var cur = sorted[i];
            var prev = i > 0 ? sorted[i - 1] : null;

            // ── Badges ──
            // aliasOf : badges MÉCANIQUEMENT couplés (même seuil) → on n'émet
            // qu'UN événement pour le groupe, sinon le journal dirait « 2 perdus »
            // pour un seul événement réel. L'id émis est le badge canonique.
            if (prev) {
                var pu = {}; prev.unlocked.forEach(function (id) { pu[id] = true; });
                var cu = {}; cur.unlocked.forEach(function (id) { cu[id] = true; });
                var seen = {};   // dédup par (type|canon|jour)
                // gagnés (ou re-gagnés après une perte)
                cur.unlocked.forEach(function (id) {
                    if (pu[id]) return;
                    var canon = aliasOf[id] || id;
                    var type = lostCount[canon] ? 'recovered' : 'unlocked';
                    var key = type + '|' + canon; if (seen[key]) return; seen[key] = true;
                    events.push({ at: cur.at, type: type, kind: 'badge', id: canon });
                });
                // perdus
                prev.unlocked.forEach(function (id) {
                    if (cu[id]) return;
                    var canon = aliasOf[id] || id;
                    var key = 'lost|' + canon; if (seen[key]) return; seen[key] = true;
                    lostCount[canon] = (lostCount[canon] || 0) + 1;
                    events.push({ at: cur.at, type: 'lost', kind: 'badge', id: canon, times: lostCount[canon] });
                    if (lostCount[canon] >= 2) events.push({ at: cur.at, type: 'recurrence', kind: 'badge', id: canon, times: lostCount[canon] });
                });
            }

            // ── Métriques ──
            var metrics = cur.metrics || {};
            Object.keys(metrics).forEach(function (k) {
                var dir = GH.METRIC_DIR[k]; if (!dir) return;
                var v = metrics[k];
                var better = dir === 'up' ? (v > best[k]) : (v < best[k]);
                if (!(k in best)) { best[k] = v; }
                else if (better) { events.push({ at: cur.at, type: 'record', kind: 'metric', metric: k, value: v, prev: best[k] }); best[k] = v; }
                if (prev && prev.metrics && (k in prev.metrics)) {
                    var pv = prev.metrics[k];
                    var worse = dir === 'up' ? (v < pv) : (v > pv);
                    if (worse && pv !== 0 && Math.abs(v - pv) / Math.abs(pv) >= minDrop) {
                        events.push({ at: cur.at, type: 'regression', kind: 'metric', metric: k, value: v, prev: pv });
                    }
                }
            });
        }
        return events;
    };

    // ── PHASES DE MATURATION (machine à états + hystérésis) ────────────────
    GH.PHASES = [
        { id: 'discovery', label: 'Découverte', emoji: '🌱' },
        { id: 'structuring', label: 'Structuration', emoji: '🧱' },
        { id: 'reliability', label: 'Fiabilisation', emoji: '🛡️' },
        { id: 'optimizing', label: 'Optimisation', emoji: '⚙️' },
        { id: 'excellence', label: 'Excellence', emoji: '🏆' }
    ];
    // Seuils de PROMOTION (fraction de badges) pour atteindre la phase i+1.
    GH.PHASE_UP = [0.15, 0.40, 0.65, 0.85];

    // Rejoue l'historique et maintient la phase avec hystérésis : on monte vite,
    // on ne redescend qu'après une régression SOUTENUE (pas sur un mauvais jour).
    GH.computePhase = function (history, total, opts) {
        opts = opts || {};
        var margin = opts.margin != null ? opts.margin : 0.07;
        var need = opts.demoteDays != null ? opts.demoteDays : 2;
        var sorted = (history || []).slice().sort(function (a, b) { return a.at < b.at ? -1 : 1; });
        var phase = 0, since = sorted.length ? sorted[0].at : null, below = 0, progress = 0;
        for (var i = 0; i < sorted.length; i++) {
            progress = total ? sorted[i].unlocked.length / total : 0;
            while (phase < 4 && progress >= GH.PHASE_UP[phase]) { phase++; since = sorted[i].at; below = 0; }
            if (phase > 0 && progress < GH.PHASE_UP[phase - 1] - margin) {
                below++;
                if (below >= need) { phase--; since = sorted[i].at; below = 0; }
            } else { below = 0; }
        }
        var meta = GH.PHASES[phase];
        return { index: phase, id: meta.id, label: meta.label, emoji: meta.emoji, since: since, progress: progress, demotionPending: below };
    };

    // ── RÉGIME : baseline glissante propre à l'équipe (pas de seuil global) ─
    function median(arr) {
        if (!arr.length) return null;
        var s = arr.slice().sort(function (a, b) { return a - b; });
        var m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    GH.metricBaselines = function (history, opts) {
        opts = opts || {};
        var window = opts.window || 14;
        var tol = opts.tol != null ? opts.tol : 0.10;
        var sorted = (history || []).slice().sort(function (a, b) { return a.at < b.at ? -1 : 1; });
        if (!sorted.length) return {};
        var cur = sorted[sorted.length - 1];
        var past = sorted.slice(Math.max(0, sorted.length - 1 - window), sorted.length - 1);
        var out = {};
        Object.keys(cur.metrics || {}).forEach(function (k) {
            var dir = GH.METRIC_DIR[k]; if (!dir) return;
            var vals = past.map(function (s) { return s.metrics ? s.metrics[k] : null; }).filter(function (v) { return typeof v === 'number'; });
            if (vals.length < 3) return;
            var base = median(vals), v = cur.metrics[k];
            var delta = base ? (v - base) / Math.abs(base) : 0;
            var status = 'normal';
            if (Math.abs(delta) >= tol) { status = (dir === 'up' ? delta > 0 : delta < 0) ? 'above' : 'below'; }
            out[k] = { baseline: base, current: v, delta: delta, status: status };
        });
        return out;
    };

    // ── VOIX : registre des conseils (non-répétition, escalade si ignoré) ──
    function adviceKey(pid) { return 'salsifi_gaming_advice_' + pid; }
    GH.adviceRead = function (pid) {
        try { var r = global.localStorage && global.localStorage.getItem(adviceKey(pid)); return r ? JSON.parse(r) : {}; }
        catch (e) { return {}; }
    };
    GH.adviceRecord = function (pid, id, dateStr) {
        var log = GH.adviceRead(pid);
        var e = log[id] || { count: 0, firstAt: dateStr, lastAt: dateStr };
        e.count += 1; e.lastAt = dateStr; if (!e.firstAt) e.firstAt = dateStr;
        log[id] = e;
        try { global.localStorage && global.localStorage.setItem(adviceKey(pid), JSON.stringify(log)); } catch (x) { /* indispo */ }
        return log;
    };
    // Choisit le prochain conseil : priorité aux inédits, sinon le moins
    // récemment donné ; signale une escalade si déjà répété (= conseil ignoré).
    GH.pickAdvice = function (candidates, log, opts) {
        opts = opts || {}; log = log || {};
        var esc = opts.escalateAfter || 3;
        if (!candidates || !candidates.length) return null;
        var fresh = candidates.filter(function (id) { return !log[id]; });
        var pool = (fresh.length ? fresh : candidates).slice().sort(function (a, b) {
            var la = log[a] ? log[a].lastAt : ''; var lb = log[b] ? log[b].lastAt : '';
            return la < lb ? -1 : la > lb ? 1 : 0;
        });
        var id = pool[0];
        var count = log[id] ? log[id].count : 0;
        return { id: id, count: count, escalate: count >= esc };
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = GH;

})(typeof window !== 'undefined' ? window : this);
