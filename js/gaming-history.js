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
        var events = [];
        var sorted = (history || []).slice().sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
        var lostCount = {};   // nb de pertes par badge (récurrence)
        var best = {};        // meilleure valeur observée par métrique

        for (var i = 0; i < sorted.length; i++) {
            var cur = sorted[i];
            var prev = i > 0 ? sorted[i - 1] : null;

            // ── Badges ──
            if (prev) {
                var pu = {}; prev.unlocked.forEach(function (id) { pu[id] = true; });
                var cu = {}; cur.unlocked.forEach(function (id) { cu[id] = true; });
                // gagnés (ou re-gagnés après une perte)
                cur.unlocked.forEach(function (id) {
                    if (!pu[id]) {
                        if (lostCount[id]) events.push({ at: cur.at, type: 'recovered', kind: 'badge', id: id });
                        else events.push({ at: cur.at, type: 'unlocked', kind: 'badge', id: id });
                    }
                });
                // perdus
                prev.unlocked.forEach(function (id) {
                    if (!cu[id]) {
                        lostCount[id] = (lostCount[id] || 0) + 1;
                        events.push({ at: cur.at, type: 'lost', kind: 'badge', id: id, times: lostCount[id] });
                        if (lostCount[id] >= 2) events.push({ at: cur.at, type: 'recurrence', kind: 'badge', id: id, times: lostCount[id] });
                    }
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

    if (typeof module !== 'undefined' && module.exports) module.exports = GH;

})(typeof window !== 'undefined' ? window : this);
