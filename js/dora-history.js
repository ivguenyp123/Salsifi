/*
 * Salsifi — DORA : compagnon temporel du module Insights
 * ------------------------------------------------------
 * MÊME système que le compagnon du gaming (snapshot → journal → régime → voix),
 * appliqué aux 4 métriques DORA. On RÉUTILISE le moteur pur de gaming-history.js
 * (baselines glissantes, records/régressions de métriques) et on n'ajoute ici que
 * ce qui est propre à DORA : les TRANSITIONS DE NIVEAU (Low↔Medium↔High↔Elite),
 * qui sont l'événement phare — l'équivalent DORA d'un badge gagné/perdu.
 *
 * Chargé en <script> classique (marche servi ET en file://) et require()-able en
 * node pour des tests hors-ligne. Tout est DÉTERMINISTE. Aucune IA.
 *
 *   Salsifi.doraHistory.buildSnapshot(vals, levels, score, cls, dateStr) → snapshot
 *   Salsifi.doraHistory.record(pid, snapshot)   → history (persiste)
 *   Salsifi.doraHistory.read(pid)               → history
 *   Salsifi.doraHistory.deriveEvents(history)   → événements (PUR)
 *   Salsifi.doraHistory.regime(history)         → écarts à la baseline (PUR)
 *   Salsifi.doraHistory.trajectory(history)     → tendance globale (PUR, hystérésis)
 */
(function (global) {
    'use strict';

    var Salsifi = global.Salsifi || (global.Salsifi = {});
    var DH = Salsifi.doraHistory || (Salsifi.doraHistory = {});
    // Moteur partagé (baselines + records/régressions de métriques). Requis.
    var GH = Salsifi.gamingHistory ||
        (typeof require !== 'undefined' ? require('./gaming-history.js') : null);

    // Ordre des niveaux DORA (N/A hors échelle → non comparé).
    DH.LEVEL_ORDER = { Low: 0, Medium: 1, High: 2, Elite: 3 };
    // Les métriques DORA suivies (clés internes ↔ clés METRIC_DIR du moteur partagé).
    DH.METRICS = ['df', 'lt', 'cfr', 'mttrDora'];

    // ── Snapshot du jour ───────────────────────────────────────────────────
    // vals   : { df, lt, cfr, mttr } (valeurs numériques, null si indispo)
    // levels : { df, lt, cfr, mttr } objets { level:'Elite'|… , cls }
    // score  : nombre /100 (ou null) ; cls : 'elite'|'high'|'medium'|'low'
    DH.buildSnapshot = function (vals, levels, score, cls, dateStr) {
        vals = vals || {}; levels = levels || {};
        var metrics = {};
        function put(k, v) { if (typeof v === 'number' && isFinite(v)) metrics[k] = v; }
        put('df', vals.df); put('lt', vals.lt); put('cfr', vals.cfr); put('mttrDora', vals.mttr);
        if (typeof score === 'number' && isFinite(score)) metrics.doraScore = score;
        var lvl = {};
        ['df', 'lt', 'cfr', 'mttr'].forEach(function (k) {
            var L = levels[k]; if (L && L.level && L.level !== 'N/A') lvl[k] = L.level;
        });
        // unlocked:[] → le moteur partagé ne produit aucun événement "badge".
        return { at: dateStr, unlocked: [], metrics: metrics, levels: lvl, cls: cls || null };
    };

    // ── Stockage (clé propre à DORA, jamais mélangée au gaming) ─────────────
    function key(pid) { return 'salsifi_dora_history_' + pid; }
    DH.read = function (pid) {
        try { var raw = global.localStorage && global.localStorage.getItem(key(pid)); return raw ? JSON.parse(raw) : []; }
        catch (e) { return []; }
    };
    DH.write = function (pid, hist) {
        try { global.localStorage && global.localStorage.setItem(key(pid), JSON.stringify(hist)); } catch (e) { /* quota */ }
    };
    DH.record = function (pid, snap) {
        var hist = DH.read(pid).filter(function (s) { return s.at !== snap.at; });
        hist.push(snap);
        hist.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
        DH.write(pid, hist);
        return hist;
    };

    // ── JOURNAL : transitions de niveau (propre DORA) + records/régressions ─
    // Fonction PURE. Événements :
    //   level-up / level-down (métrique franchit un palier DORA)
    //   score-up / score-down (le niveau global change)
    //   record / regression   (délégués au moteur partagé, sur df/lt/cfr/mttr)
    var METRIC_LABEL = { df: 'Fréquence de déploiement', lt: 'Lead Time', cfr: 'Change Failure Rate', mttr: 'Temps de restauration' };
    DH.metricLabel = function (k) { return METRIC_LABEL[k] || k; };

    DH.deriveEvents = function (history) {
        var events = [];
        var sorted = (history || []).slice().sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });

        for (var i = 1; i < sorted.length; i++) {
            var prev = sorted[i - 1], cur = sorted[i];
            // Transitions de niveau par métrique.
            var pl = prev.levels || {}, cl = cur.levels || {};
            ['df', 'lt', 'cfr', 'mttr'].forEach(function (k) {
                var a = DH.LEVEL_ORDER[pl[k]], b = DH.LEVEL_ORDER[cl[k]];
                if (a == null || b == null || a === b) return;
                events.push({ at: cur.at, type: b > a ? 'level-up' : 'level-down', kind: 'dora', metric: k, from: pl[k], to: cl[k] });
            });
            // Transition du niveau global (score).
            var order = { low: 0, medium: 1, high: 2, elite: 3 };
            var pc = order[prev.cls], cc = order[cur.cls];
            if (pc != null && cc != null && pc !== cc) {
                events.push({ at: cur.at, type: cc > pc ? 'score-up' : 'score-down', kind: 'score', from: prev.cls, to: cur.cls });
            }
        }

        // Records / régressions de métriques → moteur partagé (df/lt/cfr/mttrDora).
        // On écarte doraScore (couvert par score-up/down) et on renomme mttrDora→mttr.
        if (GH && GH.deriveEvents) {
            var seenLevel = {};  // (metric|at) ayant déjà une transition → on masque le record redondant
            events.forEach(function (e) { if (e.kind === 'dora') seenLevel[e.metric + '|' + e.at] = true; });
            GH.deriveEvents(sorted).forEach(function (e) {
                if (e.kind !== 'metric' || e.metric === 'doraScore') return;
                var m = e.metric === 'mttrDora' ? 'mttr' : e.metric;
                if (e.type === 'record' && seenLevel[m + '|' + e.at]) return; // évite « record » + « level-up » le même jour
                events.push({ at: e.at, type: e.type, kind: 'metric', metric: m, value: e.value, prev: e.prev });
            });
        }

        events.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
        return events;
    };

    // ── RÉGIME : écart à la baseline glissante propre à l'équipe ────────────
    DH.regime = function (history, opts) {
        if (!GH || !GH.metricBaselines) return {};
        var base = GH.metricBaselines(history, opts);
        // Renommer mttrDora→mttr et écarter doraScore de l'affichage régime.
        var out = {};
        Object.keys(base).forEach(function (k) {
            if (k === 'doraScore') return;
            out[k === 'mttrDora' ? 'mttr' : k] = base[k];
        });
        return out;
    };

    // ── TRAJECTOIRE : tendance globale, robuste au mauvais jour ─────────────
    // Compare le score courant à la MÉDIANE d'une fenêtre passée (pas au seul
    // point précédent) → pas de bascule sur un unique jour atypique.
    function median(arr) {
        if (!arr.length) return null;
        var s = arr.slice().sort(function (a, b) { return a - b; });
        var m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    DH.trajectory = function (history, opts) {
        opts = opts || {};
        var window = opts.window || 7;
        var tol = opts.tol != null ? opts.tol : 4;   // points /100
        var sorted = (history || []).slice().sort(function (a, b) { return a.at < b.at ? -1 : 1; });
        var scored = sorted.filter(function (s) { return s.metrics && typeof s.metrics.doraScore === 'number'; });
        if (!scored.length) return { dir: 'flat', score: null, cls: null, base: null, delta: 0, points: 0 };
        var cur = scored[scored.length - 1];
        var past = scored.slice(Math.max(0, scored.length - 1 - window), scored.length - 1);
        var vals = past.map(function (s) { return s.metrics.doraScore; });
        var base = vals.length ? median(vals) : null;
        var score = cur.metrics.doraScore, delta = base == null ? 0 : score - base;
        var dir = base == null ? 'flat' : (delta >= tol ? 'up' : delta <= -tol ? 'down' : 'flat');
        return { dir: dir, score: score, cls: cur.cls, base: base, delta: delta, points: scored.length };
    };

    // ── VOIX : registre de conseils propre à DORA (non-répétition, escalade) ─
    function adviceKey(pid) { return 'salsifi_dora_advice_' + pid; }
    DH.adviceRead = function (pid) {
        try { var r = global.localStorage && global.localStorage.getItem(adviceKey(pid)); return r ? JSON.parse(r) : {}; }
        catch (e) { return {}; }
    };
    DH.adviceRecord = function (pid, id, dateStr) {
        var log = DH.adviceRead(pid);
        var e = log[id] || { count: 0, firstAt: dateStr, lastAt: dateStr };
        e.count += 1; e.lastAt = dateStr; if (!e.firstAt) e.firstAt = dateStr;
        log[id] = e;
        try { global.localStorage && global.localStorage.setItem(adviceKey(pid), JSON.stringify(log)); } catch (x) { /* indispo */ }
        return log;
    };
    DH.pickAdvice = function (candidates, log, opts) {
        if (GH && GH.pickAdvice) return GH.pickAdvice(candidates, log, opts);
        return candidates && candidates.length ? { id: candidates[0], count: 0, escalate: false } : null;
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = DH;

})(typeof window !== 'undefined' ? window : this);
