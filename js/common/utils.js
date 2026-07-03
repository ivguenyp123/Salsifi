/*
 * Salsifi — utilitaires communs
 * ------------------------------------------------------------------
 * Chargé AVANT le script de chaque page, via une simple balise :
 *     <script src="js/common/utils.js"></script>
 *
 * Fonctionne aussi bien servi par un serveur (dev/prod) qu'ouvert en
 * local (file://) : pas de module ES, pas de build. Tout est exposé
 * sous le namespace global `window.Salsifi`.
 *
 * N'inclut QUE des fonctions pures, sans dépendance au DOM/CSS ni à
 * l'état d'une page. L'auth (loadAuth) et les appels API (fetchGitLab)
 * ne sont volontairement PAS ici : ils divergent d'une page à l'autre
 * et demandent une normalisation dédiée avant d'être mutualisés.
 */
(function (global) {
    'use strict';

    var Salsifi = global.Salsifi || (global.Salsifi = {});

    /**
     * Échappe une valeur pour une insertion sûre dans du HTML (anti-XSS).
     * Utilise le DOM pour un échappement fidèle du navigateur.
     */
    Salsifi.escapeHtml = function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        var div = document.createElement('div');
        div.textContent = String(value);
        return div.innerHTML;
    };

    /**
     * Échappe une valeur pour une insertion dans un attribut HTML.
     * (guillemets simples et doubles inclus, contrairement à escapeHtml)
     */
    Salsifi.escapeAttr = function escapeAttr(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    /**
     * Exécute une liste de tâches (fonctions renvoyant une Promise) avec
     * une concurrence maximale bornée. Renvoie un Promise.allSettled, donc
     * ne rejette jamais : chaque tâche produit un résultat {status, value|reason}.
     */
    Salsifi.runWithConcurrency = async function runWithConcurrency(tasks, limit) {
        const results = [];
        const executing = new Set();
        for (const task of tasks) {
            const p = Promise.resolve().then(task);
            results.push(p);
            executing.add(p);
            const clean = () => executing.delete(p);
            p.then(clean, clean);
            if (executing.size >= limit) await Promise.race(executing);
        }
        return Promise.allSettled(results);
    };

})(typeof window !== 'undefined' ? window : this);
