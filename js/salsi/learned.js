/*
 * Salsi — entrées APPRISES (boucle IA → MR → validation humaine)
 * ------------------------------------------------------------------
 * Ces entrées ont été REDIGÉES par l'IA (à partir des questions récurrentes
 * tombées en fallback) puis VALIDÉES par un humain via une Merge Request.
 * Elles s'ajoutent à la base formation → répondues en déterministe (0 IA).
 *
 * ⚠️ Ne pas éditer à la main la zone entre les marqueurs : `promote.js`
 * (dossier salsi-ai/) y insère les nouvelles entrées. Relis-les en MR.
 *
 * Format d'une entrée : { mod:'auto', t:'Titre', kw:[...], all?:[...], a:'html léger' }
 */
(function (g) {
    'use strict';
    var S = g.Salsifi || (g.Salsifi = {});

    var LEARNED = [
        /* __PROMOTE_INSERT__ (ne pas retirer ce marqueur) */
    ];

    if (LEARNED.length) {
        S.formation = S.formation || { modules: {}, entries: [] };
        S.formation.modules = S.formation.modules || {};
        if (!S.formation.modules.auto) S.formation.modules.auto = { num: '—', title: 'Appris & validé', niveau: '' };
        S.formation.entries = (S.formation.entries || []).concat(LEARNED);
    }
})(typeof window !== 'undefined' ? window : this);
