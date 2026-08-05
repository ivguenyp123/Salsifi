/* hub-back — flèche retour « consciente du chemin ».
 *
 * Quand une page module est ouverte depuis un chemin du hub, l'URL porte
 * ?from=<clé> (measure | deliver | inspect | collab). Ce script fait alors
 * pointer la flèche retour vers hub.html?chemin=<clé> pour rouvrir CE chemin
 * plutôt que le hub racine. Sans ?from, le lien reste hub.html (accueil).
 *
 * Chargé par les pages dont le retour n'est pas déjà réécrit en JS (les autres
 * modules le font dans leur propre index.js). IIFE : aucune variable globale.
 */
(function () {
    'use strict';
    function apply() {
        var from = new URLSearchParams(location.search).get('from');
        if (!from) return;
        var links = document.querySelectorAll('a.back-btn, a[data-hub-link], a[data-hub]');
        for (var i = 0; i < links.length; i++) {
            var href = links[i].getAttribute('href') || '';
            if (/(^|\/)hub\.html($|[?#])/.test(href)) {
                links[i].href = 'hub.html?chemin=' + encodeURIComponent(from);
            }
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
    else apply();
})();
