# Architecture front — conventions de découpage (JS & CSS)

> But : que **n'importe qui dans l'équipe** puisse retrouver, modifier et étendre un
> module sans lire 2000 lignes. Plateforme statique (HTML/CSS/JS, pas de build) :
> chaque page charge des `<script>`/`<link>` en **portée globale**, dans l'**ordre**.

## 1. JavaScript — `js/modules/<module>/`

Un module = **5 fichiers**, chargés **dans cet ordre** (l'ordre compte : `state` en 1er,
`index` en dernier) :

| Fichier | Rôle | Contient |
|---|---|---|
| `state.js` | état & config **partagés** | constantes, variables globales (`let`/`const`) |
| `data.js` | I/O | auth, `fetch*` GitLab, wrappers réseau |
| `compute.js` | logique **pure** | calculs, scoring, helpers sans DOM |
| `render.js` | rendu **DOM** | tous les `render*`, charts, tables |
| `index.js` | entrée & câblage | `init`, orchestration, `DOMContentLoaded` — **chargé en dernier** |

Dans le HTML :
```html
<script src="js/common/utils.js"></script>   <!-- socle partagé -->
<script src="js/common/gitlab.js"></script>
<script src="js/common/auth.js"></script>
<script src="js/modules/<module>/state.js"></script>
<script src="js/modules/<module>/data.js"></script>
<script src="js/modules/<module>/compute.js"></script>
<script src="js/modules/<module>/render.js"></script>
<script src="js/modules/<module>/index.js"></script>
```

**Règle d'or** : les fonctions sont des **déclarations** (`function foo()`), donc *hoistées*
et visibles entre fichiers. La **seule** contrainte d'ordre est le code exécuté **au chargement** :
- les globales de `state.js` (initialisées en 1er),
- `index.js` en dernier (il appelle `init()` / pose le `DOMContentLoaded`).
Tout le reste n'est appelé qu'au *runtime*, donc l'ordre inter-fichiers n'a pas d'importance.

## 2. CSS — `css/modules/<module>/`

Le socle partagé vit dans `css/core/` (`tokens.css`, `base.css`). Le CSS d'un module :

- **Gros fichier (> ~400 lignes)** → découpé en **partials numérotés** (le numéro = l'ordre de
  cascade, explicite) : `01-base.css`, `02-layout.css`, `03-sections.css`, `04-widgets.css`,
  `05-responsive.css`. Chargés **dans l'ordre** des numéros.
- **Petit fichier (< ~200 lignes)** → **on ne découpe pas** : un seul `css/<module>.css` reste
  plus lisible qu'un dossier. (Ne pas sur-découper.)

```html
<link rel="stylesheet" href="css/core/tokens.css">
<link rel="stylesheet" href="css/core/base.css">
<link rel="stylesheet" href="css/modules/<module>/01-base.css">
<link rel="stylesheet" href="css/modules/<module>/02-layout.css">
<!-- … dans l'ordre … -->
```

⚠️ **L'ordre est la cascade** : ne pas réordonner sans vérifier le rendu.

## 3. Méthode de découpage d'un monolithe (sans rien casser)

1. **Repérer les frontières** : `grep -nE '^        (async )?function '` (JS) / bannières
   de section (CSS).
2. **Découper par plages de lignes** — **jamais** réécrire l'intérieur d'une fonction. Classer
   chaque unité (fonction / bloc de globales) dans son fichier cible.
3. **Assertion de préservation** : la concaténation des fichiers produits doit être **identique
   à l'octet près** au monolithe (script Python de découpe → `assert reconstruction == original`).
4. **Vérifier** : `node --check` sur chaque `.js`, puis **rendu headless** (Playwright) → la page
   se charge, les sections s'affichent, **0 erreur console**.
5. **Mettre à jour le HTML** (les `<script>`/`<link>` dans l'ordre) et **supprimer le monolithe**
   (`git rm`) — l'historique git reste le filet.

## 4. État de la migration

| Module | JS `js/modules/` | CSS `css/modules/` |
|---|:--:|:--:|
| feature-flag-manager | ✅ | ✅ |
| gouvernance-repo | ✅ | — |
| maturity | ✅ | ✅ |
| daily-report | ✅ | ✅ |
| repo-analyzer | ✅ | (petit — laissé mono) |
| gaming | ✅ | ✅ |
| insights | ✅ | ✅ |
| secrets-scanner | ✅ | (petit — mono) |
| project-scaffolder | ✅ | — |
| autoretro | ✅ | — |
| bus-factor | ✅ | ✅ |
| releasenotes | ✅ | ✅ |
| dora-workspace | ✅ | — |
| access-workspace | ✅ | — |
| repo-diet | ✅ | — |
| report-builder | ✅ | — |
| branch-cleaner | ✅ | — |
| platform-concierge | ✅ | — |
| smart-estimate | ✅ | — |
| hub | (page d'accueil) | ✅ |

**Hors périmètre** (laissés en un seul fichier, à dessein) :
- **Fichiers partagés** (`js/gaming-recipes.js`, `js/gaming-history.js`, `js/dora-history.js`,
  `js/theme.js`) — chargés par plusieurs pages, ils relèvent du socle, pas d'un module de page.
- **Maquettes** (`secret-scanner-test.js`, …) — démonstrateurs autonomes, on ne les découpe pas.
- **`mr-reviewer`** (en cours de retrait), **`pipeline-generator`** (coquille HTML recyclée en
  Livraison), **`livraison`** (petit, modifié récemment).

### Note sur les modules enrobés dans une IIFE

`secrets-scanner`, `report-builder` et `platform-concierge` étaient enrobés dans
`(function () { 'use strict'; … })();`. Une IIFE = **une seule portée** : on ne peut pas la couper
entre plusieurs `<script>`. Ils ont d'abord été **déballés en globales plates** (le motif de la
plateforme), puis vérifiés **sans collision de global** (rendu headless : aucune erreur
« already declared ») avant découpe.

> Convention posée et **appliquée à tous les modules de page**. Tout nouveau module se traite
> avec la **même méthode** (§3) : découpe par plages de lignes → assertion de reconstruction →
> `node --check` → rendu headless (0 erreur) → bascule du HTML → `git rm` du monolithe.
