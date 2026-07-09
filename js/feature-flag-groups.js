/*
 * Salsifi — groupes manuels de feature flags (PARTAGÉS)
 * ------------------------------------------------------------------
 * Même principe que js/common/workshops.js : un fichier JS déployé,
 * chargé par <script src="js/feature-flag-groups.js"> AVANT le script
 * de page. Fonctionne en local (file://) comme servi, sans fetch/JSON.
 *
 * C'est la SOURCE PARTAGÉE des groupes : tout le monde qui charge la
 * page voit les mêmes groupes après déploiement.
 *
 * Édition : dans le Feature Flag Manager → « 🗂️ Gérer les groupes ».
 * Les modifications sont d'abord locales (ce navigateur) ; pour les
 * publier à l'équipe, cliquer « 📤 Générer le fichier », remplacer ce
 * fichier par le contenu téléchargé, puis committer / déployer.
 *
 *   Salsifi.featureFlagGroups[<projectId>] = [ { id, name, flags:[nom, …] }, … ]
 *   (un flag peut appartenir à plusieurs groupes)
 */
(function (global) {
    'use strict';
    var Salsifi = global.Salsifi || (global.Salsifi = {});

    Salsifi.featureFlagGroups = {
        // Exemple (à remplacer par vos vrais groupes via « Générer le fichier ») :
        // "1234": [
        //     { "id": "g_checkout", "name": "Checkout", "flags": ["new-checkout-flow", "promo-banner"] },
        //     { "id": "g_paiement", "name": "Paiement", "flags": ["sepa-instant"] }
        // ]
    };
})(typeof window !== 'undefined' ? window : this);
