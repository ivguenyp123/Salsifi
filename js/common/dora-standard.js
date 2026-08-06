/*
 * Salsifi — DORA : la référence unique.
 * -------------------------------------
 * Seuils, niveaux et primitives de calcul, en UN SEUL endroit. Ils vivaient jusqu'ici
 * dans six fichiers, avec deux barèmes incompatibles : un même dépôt pouvait ressortir
 * Elite sur un écran et High sur un autre. La question qu'on pose en premier en comité.
 *
 * Les seuils sont ceux de DORA / Accelerate, pas des variantes maison. C'est la décision
 * structurante : on est comparable à l'extérieur, ou on ne l'est pas.
 *
 * Chargé en <script> classique (marche servi ET en file://) et require()-able en node
 * pour des tests hors-ligne. Tout est DÉTERMINISTE. Aucune IA.
 *
 *   Salsifi.dora.THRESHOLDS          les seuils, par métrique
 *   Salsifi.dora.level(key, value)   → 'Elite' | 'High' | 'Medium' | 'Low' | null
 *   Salsifi.dora.worstLevel(levels)  → le maillon faible (agrégation conservatrice)
 *   Salsifi.dora.median(values)      → médiane (DORA raisonne en médiane, pas en moyenne)
 *   Salsifi.dora.prodBranches(repo)  → branches considérées comme la production
 *   Salsifi.dora.MIN_SAMPLE          → en-deçà, on affiche « échantillon insuffisant »
 */
(function (global) {
    'use strict';

    var Salsifi = global.Salsifi || (global.Salsifi = {});
    var D = Salsifi.dora || (Salsifi.dora = {});

    /*
     * Seuils DORA / Accelerate.
     *   df   déploiements par SEMAINE — plus c'est haut, mieux c'est
     *   lt   délai de livraison en HEURES  ┐
     *   cfr  taux d'échec en POURCENT      ├ plus c'est bas, mieux c'est
     *   mttr rétablissement en HEURES      ┘
     */
    D.THRESHOLDS = {
        df:   { elite: 7,  high: 1,  med: 0.25, higherIsBetter: true },
        lt:   { elite: 1,  high: 24, med: 168 },
        cfr:  { elite: 5,  high: 10, med: 15 },
        mttr: { elite: 1,  high: 24, med: 168 }
    };

    /*
     * En-deçà de 5 mesures, un taux n'a pas de sens : 1 échec sur 3 déploiements ne fait
     * pas un taux d'échec de 33 %, il fait du bruit. Mieux vaut ne rien afficher qu'un
     * chiffre qu'on ne pourra pas défendre.
     */
    D.MIN_SAMPLE = 5;

    D.LEVEL_RANK = { Elite: 4, High: 3, Medium: 2, Low: 1 };

    /** Niveau DORA d'une métrique. `null` quand la valeur est absente ou non finie. */
    D.level = function (metricKey, value) {
        if (value === null || value === undefined || !isFinite(value)) return null;
        var t = D.THRESHOLDS[metricKey];
        if (!t) return null;

        if (t.higherIsBetter) {
            if (value >= t.elite) return 'Elite';
            if (value >= t.high) return 'High';
            if (value >= t.med) return 'Medium';
            return 'Low';
        }
        if (value <= t.elite) return 'Elite';
        if (value <= t.high) return 'High';
        if (value <= t.med) return 'Medium';
        return 'Low';
    };

    /*
     * Agrégation par le maillon faible, et non par la moyenne : une équipe qui déploie
     * vingt fois par jour mais met une semaine à se rétablir n'est pas « Elite en
     * moyenne ». Les niveaux absents sont ignorés, ils ne pénalisent pas.
     */
    D.worstLevel = function (levels) {
        var valid = (levels || []).filter(function (l) { return !!l; });
        if (valid.length === 0) return null;
        return valid.reduce(function (worst, l) {
            return D.LEVEL_RANK[l] < D.LEVEL_RANK[worst] ? l : worst;
        }, valid[0]);
    };

    /** Médiane. DORA raisonne en médiane : une seule livraison oubliée fausse une moyenne. */
    D.median = function (values) {
        var v = (values || []).filter(function (x) { return isFinite(x); }).sort(function (a, b) { return a - b; });
        if (v.length === 0) return null;
        var mid = Math.floor(v.length / 2);
        return v.length % 2 === 0 ? (v[mid - 1] + v[mid]) / 2 : v[mid];
    };

    /*
     * Ce qui compte comme « la production ».
     * Une branche de feature n'est JAMAIS un déploiement : un CI vert dessus ne doit pas
     * gonfler la fréquence. C'est le défaut qui poussait des dépôts vers Elite à tort.
     */
    D.prodBranches = function (repo) {
        var set = { main: true, master: true };
        if (repo && repo.default_branch) set[repo.default_branch] = true;
        return set;
    };

    D.isProdRef = function (ref, prodSet) { return !!(ref && prodSet[ref]); };

    /** Arrondi d'affichage, pour éviter les 3.7000000000000002 dans les cartes. */
    D.round = function (value, decimals) {
        if (value === null || value === undefined || !isFinite(value)) return null;
        return parseFloat(value.toFixed(decimals === undefined ? 1 : decimals));
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
