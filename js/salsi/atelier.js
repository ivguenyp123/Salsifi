/*
 * Salsifi — Atelier Salsi (popup partagée)
 * ----------------------------------------
 * LE MÊME coach que dans le module Achievements : mascotte, bulle, analyse
 * « chez toi / objectif », le pourquoi, le plan, les actions. Extrait ici pour
 * être RÉUTILISÉ à l'identique par d'autres modules (DORA Insights…), afin que
 * l'UX/UI reste exactement la même partout.
 *
 *   Salsifi.mascotSVG(mood)           → le SVG de Salsi (proud/happy/meh/worried)
 *   Salsifi.openSalsiAtelier(cfg)     → ouvre la popup (voir cfg plus bas)
 *   Salsifi.closeSalsiAtelier()       → ferme
 *
 * Chargé en <script> classique (marche servi ET en file://). Aucune dépendance.
 */
(function (global) {
    'use strict';
    var Salsifi = global.Salsifi || (global.Salsifi = {});
    function esc(s) { return Salsifi.escapeHtml ? Salsifi.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }

    // ── Mascotte ────────────────────────────────────────────────────────────
    // Salsifi.mascotSVG(mood) est désormais fourni par js/salsi/characters.js
    // (registre des persos + perso choisi). Chargé AVANT ce fichier sur les
    // pages qui ouvrent l'atelier. Repli minimal si characters.js est absent.
    if (!Salsifi.mascotSVG) {
        Salsifi.mascotSVG = function () {
            return '<svg viewBox="0 0 100 100" class="mascot-svg" aria-hidden="true">' +
                '<rect x="22" y="30" width="56" height="58" rx="26" fill="#7c5cff"/>' +
                '<circle cx="37" cy="55" r="3.4" fill="#241844"/><circle cx="64" cy="55" r="3.4" fill="#241844"/>' +
                '<path d="M39 68 q11 13 22 0" fill="none" stroke="#241844" stroke-width="3.4" stroke-linecap="round"/></svg>';
        };
    }

    // ── Popup générique ────────────────────────────────────────────────────
    // cfg = {
    //   title, subtitle, modeTag, mood,          // en-tête
    //   bubble,                                   // phrase d'intro (html léger autorisé)
    //   analysis: [{label, value}],               // puces « chez toi / objectif »
    //   progress: {cls:'up'|'down'|'flat', html}, // bandeau d'évolution (optionnel)
    //   why,                                      // l'enjeu (html léger)
    //   planTitle, steps: [html,...],             // le plan (ol.salsi-steps)
    //   extras: [{kind:'measure'|'trap'|'note', html}],
    //   actions: [{label, kind:'primary'|'ghost'|'', href, onclick}]
    // }
    // Les valeurs textuelles sont échappées ; `html`/`steps`/`bubble`/`why` sont
    // considérés « html léger » (fournis par l'appelant, déjà échappés côté data).
    Salsifi.openSalsiAtelier = function (cfg) {
        cfg = cfg || {};
        var ov = document.getElementById('salsiModal');
        if (!ov) { ov = document.createElement('div'); ov.id = 'salsiModal'; ov.className = 'salsi-overlay'; document.body.appendChild(ov); }

        var analysis = '';
        if (cfg.analysis && cfg.analysis.length) {
            analysis = '<div class="salsi-analysis">' + cfg.analysis.map(function (a) {
                return '<span class="salsi-an">' + esc(a.label) + ' <b>' + esc(a.value) + '</b></span>';
            }).join('') + '</div>';
        }
        var progress = cfg.progress ? '<div class="salsi-prog ' + esc(cfg.progress.cls || 'flat') + '">' + (cfg.progress.html || '') + '</div>' : '';
        var diag = '';
        if (cfg.diagnostic && cfg.diagnostic.items && cfg.diagnostic.items.length) {
            diag = (cfg.diagnostic.title ? '<div class="salsi-sec-h">' + esc(cfg.diagnostic.title) + '</div>' : '') +
                '<ul class="salsi-diag">' + cfg.diagnostic.items.map(function (it) {
                    var mod = (it.module && it.module.href) ? ' <a class="salsi-chip mod" href="' + it.module.href + '">🧰 ' + esc(it.module.name) + '</a>' : '';
                    return '<li class="tone-' + esc(it.tone || 'info') + '"><span class="salsi-diag-ic">' + esc(it.icon || '•') + '</span><span class="salsi-diag-tx">' + esc(it.text) + mod + '</span></li>';
                }).join('') + '</ul>';
        }
        var why = cfg.why ? '<div class="salsi-why">' + cfg.why + '</div>' : '';
        var plan = '';
        if (cfg.steps && cfg.steps.length) {
            // Un step déjà sous forme <li…> est inséré tel quel (permet une classe
            // par ligne, ex. le « mouvement du moment ») ; sinon on l'enveloppe.
            var lis = cfg.steps.map(function (s) {
                return /^\s*<li[\s>]/i.test(s) ? s : '<li>' + s + '</li>';
            }).join('');
            plan = (cfg.planTitle ? '<div class="salsi-sec-h">' + esc(cfg.planTitle) + '</div>' : '') +
                '<ol class="salsi-steps salsi-plan">' + lis + '</ol>';
        }
        var extras = (cfg.extras || []).map(function (e) {
            var cls = e.kind === 'measure' ? 'salsi-measure' : 'salsi-note';
            return '<div class="' + cls + '">' + (e.html || '') + '</div>';
        }).join('');

        // a.onclick / a.href sont fournis par le développeur (jamais des données
        // utilisateur) → insérés bruts, comme dans l'atelier du module gaming.
        var actions = (cfg.actions || []).map(function (a) {
            var cls = 'salsi-btn' + (a.kind ? ' ' + a.kind : '');
            if (a.href) return '<a class="' + cls + '" href="' + a.href + '"' + (a.target ? ' target="' + a.target + '" rel="noopener"' : '') + '>' + esc(a.label) + '</a>';
            return '<button class="' + cls + '"' + (a.onclick ? ' onclick="' + a.onclick + '"' : '') + '>' + esc(a.label) + '</button>';
        }).join('') + '<button class="salsi-btn ghost" onclick="Salsifi.closeSalsiAtelier()">Fermer</button>';

        var modeTag = cfg.modeTag ? ' · <span class="salsi-mode">' + esc(cfg.modeTag) + '</span>' : '';
        ov.innerHTML = '<div class="salsi-modal" onclick="event.stopPropagation()">' +
            '<div class="salsi-modal-head">' +
                '<div class="salsi-modal-mascot mood-' + esc(cfg.mood || 'proud') + '">' + Salsifi.mascotSVG(cfg.mood || 'proud') + '</div>' +
                '<div><div class="salsi-modal-title">' + esc(cfg.title || '') + '</div>' +
                '<div class="salsi-modal-badge">' + esc(cfg.subtitle || '') + modeTag + '</div></div>' +
                '<button class="salsi-x" onclick="Salsifi.closeSalsiAtelier()">✕</button>' +
            '</div>' +
            (cfg.bubble ? '<div class="salsi-bubble2">' + cfg.bubble + '</div>' : '') +
            analysis + progress + diag + why + plan + extras +
            '<div class="salsi-result" id="salsiResult"></div>' +
            '<div class="salsi-actions">' + actions + '</div>' +
        '</div>';
        ov.style.display = 'flex';
        ov.onclick = Salsifi.closeSalsiAtelier;
    };
    Salsifi.closeSalsiAtelier = function () { var ov = document.getElementById('salsiModal'); if (ov) ov.style.display = 'none'; };

})(typeof window !== 'undefined' ? window : this);
