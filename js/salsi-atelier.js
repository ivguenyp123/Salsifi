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

    // ── Mascotte (identique au module gaming) ──────────────────────────────
    Salsifi.mascotSVG = function (mood) {
        var ink = '#241844';
        var eyeHappy = '<path d="M31 55 q5 -7 10 0" fill="none" stroke="' + ink + '" stroke-width="3.4" stroke-linecap="round"/><path d="M59 55 q5 -7 10 0" fill="none" stroke="' + ink + '" stroke-width="3.4" stroke-linecap="round"/>';
        var eyeDot = '<circle cx="37" cy="55" r="3.4" fill="' + ink + '"/><circle cx="64" cy="55" r="3.4" fill="' + ink + '"/>';
        var eyeWorried = '<circle cx="37" cy="56" r="3.4" fill="' + ink + '"/><circle cx="64" cy="56" r="3.4" fill="' + ink + '"/><path d="M31 49 l9 3" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round"/><path d="M70 49 l-9 3" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round"/>';
        var mouthSmile = '<path d="M39 68 q11 13 22 0" fill="none" stroke="' + ink + '" stroke-width="3.4" stroke-linecap="round"/>';
        var mouthTiny = '<path d="M43 70 q7 5 14 0" fill="none" stroke="' + ink + '" stroke-width="3" stroke-linecap="round"/>';
        var mouthFlat = '<line x1="42" y1="71" x2="58" y2="71" stroke="' + ink + '" stroke-width="3" stroke-linecap="round"/>';
        var mouthFrown = '<path d="M42 73 q8 -7 16 0" fill="none" stroke="' + ink + '" stroke-width="3.2" stroke-linecap="round"/>';
        var eyes = eyeDot, mouth = mouthTiny, extra = '';
        if (mood === 'proud') { eyes = eyeHappy; mouth = mouthSmile; extra = '<text x="76" y="34" font-size="15">✨</text>'; }
        else if (mood === 'happy') { eyes = eyeHappy; mouth = mouthSmile; }
        else if (mood === 'meh') { eyes = eyeDot; mouth = mouthFlat; }
        else if (mood === 'worried') { eyes = eyeWorried; mouth = mouthFrown; }
        return '<svg viewBox="0 0 100 100" class="mascot-svg" aria-hidden="true">' +
            '<path d="M50 30 C50 18 50 12 50 8" stroke="#57b877" stroke-width="4" fill="none" stroke-linecap="round"/>' +
            '<path d="M50 18 C39 12 31 15 29 23 C40 25 47 22 50 18Z" fill="#57b877"/>' +
            '<path d="M50 13 C61 6 70 9 72 18 C61 20 53 17 50 13Z" fill="#6ed08a"/>' +
            '<rect x="22" y="30" width="56" height="58" rx="26" fill="url(#mgrad)"/>' +
            '<ellipse cx="50" cy="66" rx="19" ry="15" fill="rgba(255,255,255,0.12)"/>' +
            '<circle cx="33" cy="63" r="4.5" fill="rgba(244,114,182,0.55)"/>' +
            '<circle cx="67" cy="63" r="4.5" fill="rgba(244,114,182,0.55)"/>' +
            eyes + mouth + extra +
            '<defs><linearGradient id="mgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9575ff"/><stop offset="1" stop-color="#6f4ce0"/></linearGradient></defs></svg>';
    };

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
            analysis + progress + why + plan + extras +
            '<div class="salsi-result" id="salsiResult"></div>' +
            '<div class="salsi-actions">' + actions + '</div>' +
        '</div>';
        ov.style.display = 'flex';
        ov.onclick = Salsifi.closeSalsiAtelier;
    };
    Salsifi.closeSalsiAtelier = function () { var ov = document.getElementById('salsiModal'); if (ov) ov.style.display = 'none'; };

})(typeof window !== 'undefined' ? window : this);
