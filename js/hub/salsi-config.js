/*
 * Salsi — configuration IA (un seul endroit à changer).
 * ------------------------------------------------------------------
 * Laisse vide  → IA OFF : Salsi reste 100 % déterministe.
 * Renseigne l'URL → l'IA s'active en dernier recours (fallback-only).
 *
 * Édite ce fichier À LA MAIN, ou laisse ta CI l'écrire au déploiement
 * (ex. depuis des variables GitLab). localStorage 'salsi_ai_url' /
 * 'salsi_ai_secret' surchargent ces valeurs si présents.
 */
(function (g) {
    'use strict';
    var S = g.Salsifi || (g.Salsifi = {});
    S.AI_URL = '';       // ex : 'https://ton-serveur.lcl/salsi/ask'
    S.AI_SECRET = '';    // ex : 'xxx'  (si SALSI_SECRET défini côté back)
})(typeof window !== 'undefined' ? window : this);
