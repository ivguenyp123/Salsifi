# Audit qualité — état du repo à la reprise

> Photographie de la qualité du code au moment de la passation à l'équipe.
> Réalisé le 2026-08-05. Périmètre : 30 pages HTML, 158 fichiers JS, 78 CSS
> (hors `maquettes/` et `node_modules/`).
>
> **Verdict : repo sain et prod-ready.** Aucun défaut bloquant. Cette note
> distingue ce qui est déjà propre, la correction déjà appliquée, et les
> quelques décisions qui reviennent à l'équipe (produit, pas technique).

## Contexte d'architecture

Application **100 % front**, sans backend : chaque page parle directement à
l'API GitLab depuis le navigateur (le token est stocké en `localStorage`).
C'est le compromis assumé du « livrer avant le back ». Voir
`docs/ARCHITECTURE.md` et `docs/ARCHITECTURE-backend.md` pour la cible serveur.

Le JS suit une convention **par module** : `js/modules/<page>/` découpé en
5 couches `state / data / compute / render / index.js`. Le CSS suit la même
logique : `css/modules/<page>/NN-section.css`, chargés par plusieurs `<link>`
dans l'ordre de cascade. Les 21 modules respectent ce pattern (tous ont un
`index.js`).

> ⚠️ **Règle à connaître pour le hub.** `hub.html` charge *plusieurs* modules
> Salsi dans le même scope global (`js/salsi/qa/*` et `js/salsi/livraison/*`).
> Ces fichiers n'étant plus encapsulés dans une IIFE, **deux fichiers du hub
> ne doivent jamais déclarer le même nom au niveau module** sous peine de
> collision silencieuse. Exemple déjà traité : `norm` existait dans qa (strippe
> toute la ponctuation) et livraison (conserve `/._-` pour les branches) →
> renommé `lvNorm` côté livraison. Toute nouvelle globale ajoutée au hub doit
> être vérifiée contre les globales existantes.

## Ce qui est déjà propre (rien à faire)

| Dimension | Résultat |
|---|---|
| Liens locaux (`src`/`href` js/css/img) sur les 30 pages | **0 cassé** |
| Assets manquants | aucun |
| Fichiers JS orphelins (jamais chargés) | **0** sur 158 |
| Hygiène HTML (`charset`, `viewport`, `<title>`, `lang`) | présents sur les 30 pages |
| IDs HTML dupliqués dans une même page | aucun |
| `debugger` laissés | 0 |
| TODO/FIXME/HACK oubliés | 0 réel* |
| Uniformité du pattern `modules/` | 21/21 modules avec `index.js` |
| Références doc → code | aucune stale (aucun renvoi vers un fichier déplacé) |

\* Les marqueurs « TODO » détectés sont soit du **contenu de templates CI**
générés pour l'utilisateur (`js/gaming-recipes.js`,
`js/modules/project-scaffolder/data.js`), soit la **feature** de
`daily-report` qui scanne justement les TODO dans les commits. Aucune dette
réelle dans le code applicatif.

## Correction déjà appliquée

- **Traces de debug retirées** (commit `1266efa`) : 5 `console.log('[ws] …')`
  de débogage dans `js/hub/workspaces/` (`workspace-modal.js`,
  `workspace-actions.js`). Aucune logique impactée.

Les autres `console.log` sont conservés volontairement : fallback fonctionnel
(`js/salsi/livraison/router.js`, quand `salsiQaSay` est absent) et logs de
statut `✅` (scaffolder, feature-flag-manager).

## Décisions qui reviennent à l'équipe

Ces points ne sont **pas** des bugs. Ils demandent un arbitrage produit ;
rien n'a été supprimé ni modifié.

### 1. Fichiers morts / quasi-doublons

| Fichier | Constat | Piste |
|---|---|---|
| `css/gouvernance-repool.css` | orphelin, chargé par aucune page | suppression probable |
| `secrets-scannerols.html` | quasi-doublon de `secrets-scanner.html` (11 lignes de diff), lié par 0 page | cruft quasi-certain |
| `gouvernance-repool.html` | lié par 0 page, mais **variante réelle** (169 lignes de diff) | à trancher : variante ou mort ? |
| `secret-scanner-test.html` + `js/modules/secret-scanner-test/` (~2500 l.) | harnais de test livré comme page prod | sortir de l'arbo prod ? |
| `delivery-cockpit-mockup.html`, `livraison-mockup.html`, `valider-livrer-mockup.html` | maquettes dans l'arbo prod | déplacer sous `maquettes/` ? |

> Vérifier la nav réelle avant toute suppression : le hub construit ses cartes
> en JS, donc « lié par 0 page HTML » n'équivaut pas à « mort ». Tracer les
> `href` générés côté JavaScript.

### 2. Dette UX — `alert()`

**34 appels `alert()`** dans ~12 modules (bloquants, style navigateur brut).
Non corrigé ici car remplacer un `alert()` par un toast **change le
comportement** (hors périmètre « correction sûre »). Chantier de
modernisation UX quand l'équipe s'en emparera.

### 3. Couches `render.js` volumineuses

Conséquence du pattern 5-couches : tout le rendu DOM d'un module vit dans son
`render.js`, ce qui donne quelques gros fichiers :

| Fichier | Lignes |
|---|---|
| `js/modules/feature-flag-manager/render.js` | 2206 |
| `js/modules/secrets-scanner/render.js` | 1992 |
| `js/modules/daily-report/render.js` | 1620 |
| `js/modules/project-scaffolder/render.js` | 1470 |

Ce n'est pas un défaut (le pattern est respecté), mais c'est le prochain
niveau de découpe si l'équipe veut aller plus loin (ex. sous-découper le rendu
par section d'écran).

### 4. Dernier monolithe flat

- `js/mr-reviewer.js` (1270 l.) — seul gros fichier hors du pattern `modules/`.
  Signalé comme **en cours de retrait** au moment de la passation.

## Historique du découpage (contexte)

Les commits récents ont découpé les derniers monolithes avant cet audit :

- `js/livraison.js` (567) → `js/modules/livraison/` (5 couches)
- `js/salsi/qa.js` (1442) → `js/salsi/qa/` (5 tranches)
- `js/salsi/livraison.js` (641) → `js/salsi/livraison/` (5 tranches)
- 6 feuilles CSS plates → `css/modules/<page>/` (chunks)

Chaque découpe a été vérifiée par identité octet (ou multiset des lignes),
`node --check` par fichier, contrôle d'absence de collision de scope sur le
hub, et smoke-test navigateur.
