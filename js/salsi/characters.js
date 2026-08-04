/*
 * Salsifi — Persos IA (mascottes partagées)
 * ------------------------------------------
 * Une famille de mascottes « chibi » dans le style du Salsifi Bébé :
 * même corps arrondi (rect x22 y30 w56 h58 rx26), mêmes joues roses, et
 * SURTOUT le même système d'humeurs (proud / happy / meh / worried) réutilisé
 * à l'identique — donc tous les persos réagissent partout où mascotSVG() est
 * appelé, sans toucher aux appelants.
 *
 *   Salsifi.CHARACTERS                → liste ordonnée [{id, name, emoji, build}]
 *   Salsifi.characterSVG(id, mood)    → SVG d'un perso pour une humeur
 *   Salsifi.getCharacter()            → id du perso choisi (défaut 'salsifi')
 *   Salsifi.setCharacter(id)          → mémorise le choix (localStorage) + event
 *   Salsifi.mascotSVG(mood)           → SVG du perso CHOISI (compat historique)
 *
 * Chargé en <script> classique (marche servi ET en file://). Aucune dépendance.
 */
(function (global) {
    'use strict';
    var Salsifi = global.Salsifi || (global.Salsifi = {});
    var INK = '#241844';
    var STORE_KEY = 'salsifi_character';

    // Compteur pour rendre les id de dégradés uniques (plusieurs SVG par page).
    var _uid = 0;

    // ── Visage partagé : yeux + bouche selon l'humeur ───────────────────────
    // eyeInk : couleur des yeux (surchargée p.ex. en blanc sur le masque panda).
    function face(mood, eyeInk) {
        var ink = eyeInk || INK;
        var eyeHappy =
            '<path d="M31 55 q5 -7 10 0" fill="none" stroke="' + ink + '" stroke-width="3.4" stroke-linecap="round"/>' +
            '<path d="M59 55 q5 -7 10 0" fill="none" stroke="' + ink + '" stroke-width="3.4" stroke-linecap="round"/>';
        var eyeDot =
            '<circle cx="37" cy="55" r="3.4" fill="' + ink + '"/><circle cx="64" cy="55" r="3.4" fill="' + ink + '"/>';
        var eyeWorried =
            '<circle cx="37" cy="56" r="3.4" fill="' + ink + '"/><circle cx="64" cy="56" r="3.4" fill="' + ink + '"/>' +
            '<path d="M31 49 l9 3" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round"/>' +
            '<path d="M70 49 l-9 3" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round"/>';
        var mouthSmile = '<path d="M39 68 q11 13 22 0" fill="none" stroke="' + INK + '" stroke-width="3.4" stroke-linecap="round"/>';
        var mouthTiny = '<path d="M43 70 q7 5 14 0" fill="none" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>';
        var mouthFlat = '<line x1="42" y1="71" x2="58" y2="71" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>';
        var mouthFrown = '<path d="M42 73 q8 -7 16 0" fill="none" stroke="' + INK + '" stroke-width="3.2" stroke-linecap="round"/>';
        var eyes = eyeDot, mouth = mouthTiny, extra = '';
        if (mood === 'proud') { eyes = eyeHappy; mouth = mouthSmile; extra = '<text x="76" y="34" font-size="15">✨</text>'; }
        else if (mood === 'happy') { eyes = eyeHappy; mouth = mouthSmile; }
        else if (mood === 'meh') { eyes = eyeDot; mouth = mouthFlat; }
        else if (mood === 'worried') { eyes = eyeWorried; mouth = mouthFrown; }
        return eyes + mouth + extra;
    }

    var cheeks =
        '<circle cx="33" cy="63" r="4.5" fill="rgba(244,114,182,0.55)"/>' +
        '<circle cx="67" cy="63" r="4.5" fill="rgba(244,114,182,0.55)"/>';
    var belly = '<ellipse cx="50" cy="66" rx="19" ry="15" fill="rgba(255,255,255,0.12)"/>';

    function grad(id, c0, c1) {
        return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="' + c0 + '"/><stop offset="1" stop-color="' + c1 + '"/></linearGradient>';
    }
    function body(id) { return '<rect x="22" y="30" width="56" height="58" rx="26" fill="url(#' + id + ')"/>'; }
    function wrap(inner, defs) {
        return '<svg viewBox="0 0 100 100" class="mascot-svg" aria-hidden="true">' + inner +
            '<defs>' + defs + '</defs></svg>';
    }

    // ── Les persos ──────────────────────────────────────────────────────────
    // Chacun : [features derrière] + corps + [ventre] + [taches/masque] +
    // joues + visage(humeur) + [features devant] + dégradés.
    var BUILDERS = {

        // 🌱 Le Salsifi Bébé d'origine — germe de salsifis + corps violet.
        salsifi: function (mood, u) {
            var g = 'mgrad-' + u;
            return wrap(
                '<path d="M50 30 C50 18 50 12 50 8" stroke="#57b877" stroke-width="4" fill="none" stroke-linecap="round"/>' +
                '<path d="M50 18 C39 12 31 15 29 23 C40 25 47 22 50 18Z" fill="#57b877"/>' +
                '<path d="M50 13 C61 6 70 9 72 18 C61 20 53 17 50 13Z" fill="#6ed08a"/>' +
                body(g) + belly + cheeks + face(mood),
                grad(g, '#9575ff', '#6f4ce0'));
        },

        // 🦒 Girafe — ossicones + taches, corps miel.
        girafe: function (mood, u) {
            var g = 'ggrad-' + u;
            var spot = 'fill="rgba(150,92,30,0.34)"';
            return wrap(
                // ossicones
                '<line x1="40" y1="31" x2="37" y2="15" stroke="#c98a2e" stroke-width="4" stroke-linecap="round"/>' +
                '<circle cx="36" cy="13" r="4.3" fill="#7a4f1e"/>' +
                '<line x1="60" y1="31" x2="63" y2="15" stroke="#c98a2e" stroke-width="4" stroke-linecap="round"/>' +
                '<circle cx="64" cy="13" r="4.3" fill="#7a4f1e"/>' +
                body(g) + belly +
                // taches (hors visage)
                '<circle cx="30" cy="45" r="4.2" ' + spot + '/>' +
                '<circle cx="71" cy="46" r="3.6" ' + spot + '/>' +
                '<circle cx="29" cy="74" r="4" ' + spot + '/>' +
                '<circle cx="72" cy="73" r="4.4" ' + spot + '/>' +
                '<circle cx="50" cy="83" r="4.2" ' + spot + '/>' +
                cheeks + face(mood),
                grad(g, '#f7c96b', '#e2a033'));
        },

        // 🐘 Petit éléphant — grandes oreilles + petite trompe + défenses.
        elephant: function (mood, u) {
            var g = 'egrad-' + u;
            return wrap(
                // oreilles (derrière le corps)
                '<ellipse cx="20" cy="54" rx="14" ry="19" fill="#aab7cc"/>' +
                '<ellipse cx="80" cy="54" rx="14" ry="19" fill="#aab7cc"/>' +
                '<ellipse cx="22" cy="55" rx="8" ry="12" fill="rgba(244,114,182,0.28)"/>' +
                '<ellipse cx="78" cy="55" rx="8" ry="12" fill="rgba(244,114,182,0.28)"/>' +
                body(g) + belly + cheeks + face(mood) +
                // défenses + trompe (devant, sous la bouche → n'écrase pas l'humeur)
                '<path d="M45 75 l-3 6" stroke="#fdfbf6" stroke-width="3" stroke-linecap="round"/>' +
                '<path d="M55 75 l3 6" stroke="#fdfbf6" stroke-width="3" stroke-linecap="round"/>' +
                '<path d="M50 74 q0 10 -6 13 q-5 3 -3 -4" fill="none" stroke="url(#' + g + ')" stroke-width="7" stroke-linecap="round"/>',
                grad(g, '#c1ccdd', '#94a5c0'));
        },

        // 🦦 Loutre — petites oreilles rondes + museau crème + moustaches.
        loutre: function (mood, u) {
            var g = 'lgrad-' + u;
            return wrap(
                '<circle cx="31" cy="31" r="6.5" fill="#8a6038"/>' +
                '<circle cx="69" cy="31" r="6.5" fill="#8a6038"/>' +
                body(g) +
                '<ellipse cx="50" cy="69" rx="14" ry="10" fill="#efdcc2"/>' +
                cheeks + face(mood) +
                // truffe + moustaches
                '<ellipse cx="50" cy="64" rx="4" ry="3" fill="' + INK + '"/>' +
                '<path d="M36 66 h-9" stroke="rgba(36,24,68,0.5)" stroke-width="1.6" stroke-linecap="round"/>' +
                '<path d="M36 70 h-8" stroke="rgba(36,24,68,0.5)" stroke-width="1.6" stroke-linecap="round"/>' +
                '<path d="M64 66 h9" stroke="rgba(36,24,68,0.5)" stroke-width="1.6" stroke-linecap="round"/>' +
                '<path d="M64 70 h8" stroke="rgba(36,24,68,0.5)" stroke-width="1.6" stroke-linecap="round"/>',
                grad(g, '#bd9066', '#8a6038'));
        },

        // 🦊 Panda roux — oreilles pointues crème + masque blanc + rayures.
        panda_roux: function (mood, u) {
            var g = 'prgrad-' + u;
            return wrap(
                // oreilles pointues
                '<path d="M23 33 L28 13 L41 30 Z" fill="#c2622a"/>' +
                '<path d="M77 33 L72 13 L59 30 Z" fill="#c2622a"/>' +
                '<path d="M27 30 L29 19 L36 29 Z" fill="#f3e4d0"/>' +
                '<path d="M73 30 L71 19 L64 29 Z" fill="#f3e4d0"/>' +
                body(g) +
                // masque blanc autour des yeux + museau
                '<path d="M28 52 Q37 44 45 51 Q40 60 33 60 Q28 58 28 52Z" fill="#f5e7d5"/>' +
                '<path d="M72 52 Q63 44 55 51 Q60 60 67 60 Q72 58 72 52Z" fill="#f5e7d5"/>' +
                '<ellipse cx="50" cy="70" rx="12" ry="9" fill="#f5e7d5"/>' +
                cheeks + face(mood) +
                // rayures sous les yeux (larme rousse) + truffe
                '<path d="M37 59 l-2 7" stroke="rgba(150,60,20,0.45)" stroke-width="2.4" stroke-linecap="round"/>' +
                '<path d="M64 59 l2 7" stroke="rgba(150,60,20,0.45)" stroke-width="2.4" stroke-linecap="round"/>' +
                '<ellipse cx="50" cy="64" rx="3.4" ry="2.6" fill="' + INK + '"/>',
                grad(g, '#dc8b4f', '#b05a27'));
        },

        // 🐼 Panda ours — oreilles noires + taches noires autour des yeux.
        panda_ours: function (mood, u) {
            var g = 'pograd-' + u;
            return wrap(
                '<circle cx="30" cy="28" r="8" fill="#2b2b33"/>' +
                '<circle cx="70" cy="28" r="8" fill="#2b2b33"/>' +
                body(g) + belly +
                // taches noires autour des yeux (les yeux sont dessinés en clair)
                '<ellipse cx="37" cy="55" rx="8" ry="10.5" fill="#2b2b33" transform="rotate(-18 37 55)"/>' +
                '<ellipse cx="64" cy="55" rx="8" ry="10.5" fill="#2b2b33" transform="rotate(18 64 55)"/>' +
                cheeks + face(mood, '#ffffff') +
                '<ellipse cx="50" cy="64" rx="3.6" ry="2.8" fill="#2b2b33"/>',
                grad(g, '#f6f3ee', '#dcd6cb'));
        },

        // 🐶 Chien — oreilles tombantes + museau clair + truffe (langue si happy).
        chien: function (mood, u) {
            var g = 'cgrad-' + u;
            var tongue = (mood === 'happy' || mood === 'proud')
                ? '<path d="M47 72 q3 7 6 0 Z" fill="#f27a8a"/>' : '';
            return wrap(
                '<ellipse cx="21" cy="50" rx="8.5" ry="19" fill="#a86a2e"/>' +
                '<ellipse cx="79" cy="50" rx="8.5" ry="19" fill="#a86a2e"/>' +
                body(g) +
                '<ellipse cx="50" cy="69" rx="12" ry="9" fill="#f5dfb4"/>' +
                cheeks + face(mood) + tongue +
                '<ellipse cx="50" cy="63" rx="4.2" ry="3.2" fill="' + INK + '"/>',
                grad(g, '#e9be7b', '#c8924a'));
        },

        // 🐱 Chat — oreilles pointues roses + moustaches + petit nez.
        chat: function (mood, u) {
            var g = 'chgrad-' + u;
            return wrap(
                '<path d="M25 33 L29 12 L44 29 Z" fill="url(#' + g + ')"/>' +
                '<path d="M75 33 L71 12 L56 29 Z" fill="url(#' + g + ')"/>' +
                '<path d="M29 29 L31 18 L38 28 Z" fill="rgba(244,114,182,0.55)"/>' +
                '<path d="M71 29 L69 18 L62 28 Z" fill="rgba(244,114,182,0.55)"/>' +
                body(g) + belly + cheeks + face(mood) +
                '<path d="M47 62 h6 l-3 3 Z" fill="#f472b6"/>' +
                '<path d="M35 65 h-10" stroke="rgba(36,24,68,0.5)" stroke-width="1.5" stroke-linecap="round"/>' +
                '<path d="M35 69 h-9" stroke="rgba(36,24,68,0.5)" stroke-width="1.5" stroke-linecap="round"/>' +
                '<path d="M65 65 h10" stroke="rgba(36,24,68,0.5)" stroke-width="1.5" stroke-linecap="round"/>' +
                '<path d="M65 69 h9" stroke="rgba(36,24,68,0.5)" stroke-width="1.5" stroke-linecap="round"/>',
                grad(g, '#b4b0c6', '#847f9c'));
        }
    };

    Salsifi.CHARACTERS = [
        { id: 'salsifi', name: 'Salsifi Bébé', emoji: '🌱' },
        { id: 'girafe', name: 'Girafe', emoji: '🦒' },
        { id: 'elephant', name: 'Petit éléphant', emoji: '🐘' },
        { id: 'loutre', name: 'Loutre', emoji: '🦦' },
        { id: 'panda_roux', name: 'Panda roux', emoji: '🦊' },
        { id: 'panda_ours', name: 'Panda ours', emoji: '🐼' },
        { id: 'chien', name: 'Chien', emoji: '🐶' },
        { id: 'chat', name: 'Chat', emoji: '🐱' }
    ];

    Salsifi.characterSVG = function (id, mood) {
        var b = BUILDERS[id] || BUILDERS.salsifi;
        // On marque le SVG avec son humeur : permet le rafraîchissement en direct
        // (remplacement en place) quand l'utilisateur change de perso.
        return b(mood, ++_uid).replace('class="mascot-svg"', 'class="mascot-svg" data-mood="' + (mood || '') + '"');
    };

    Salsifi.getCharacter = function () {
        try { var v = localStorage.getItem(STORE_KEY); if (v && BUILDERS[v]) return v; } catch (e) {}
        return 'salsifi';
    };

    Salsifi.setCharacter = function (id) {
        if (!BUILDERS[id]) return;
        try { localStorage.setItem(STORE_KEY, id); } catch (e) {}
        try { global.dispatchEvent(new CustomEvent('salsifi:characterchange', { detail: { id: id } })); } catch (e) {}
    };

    // Compat : mascotSVG() rend désormais le perso choisi (défaut = Salsifi Bébé).
    Salsifi.mascotSVG = function (mood) {
        return Salsifi.characterSVG(Salsifi.getCharacter(), mood);
    };

    // ── Rafraîchissement en direct ──────────────────────────────────────────
    // Au changement de perso, on remplace en place tous les mascots déjà
    // affichés (peu importe le module qui les a rendus), en conservant leur
    // humeur via data-mood. Zéro modification chez les appelants.
    Salsifi.refreshMascots = function () {
        var cur = Salsifi.getCharacter();
        var nodes = document.querySelectorAll('svg.mascot-svg[data-mood]');
        for (var i = 0; i < nodes.length; i++) {
            // On saute les aperçus statiques (ex. les vignettes du sélecteur,
            // qui doivent chacune garder LEUR perso, pas celui choisi).
            if (nodes[i].closest && nodes[i].closest('[data-mascot-static]')) continue;
            var m = nodes[i].getAttribute('data-mood') || undefined;
            nodes[i].outerHTML = Salsifi.characterSVG(cur, m);
        }
    };
    if (global.addEventListener) {
        global.addEventListener('salsifi:characterchange', Salsifi.refreshMascots);
    }

})(typeof window !== 'undefined' ? window : this);
