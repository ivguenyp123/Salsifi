# Salsifi — plan de restructuration (maintenabilité)

## État des lieux (chiffré)

| | |
|---|---|
| Pages HTML | 31 |
| Fichiers JS | 69 |
| Fichiers CSS | 33 |
| **Poids mort** (fichiers `*old*`, `*(1)*`, `*(2)*`) | **~11 000 lignes**, référencées par **0 page vivante** |

**Ce qui va déjà bien ✅**
- Un **socle partagé** existe : `js/common/` (auth, gitlab, utils, workshops).
- Le **hub est déjà modularisé** : `js/hub/{config,core,metrics,ui,…}` → **c'est le modèle à généraliser**.
- `css/theme.css` définit un **système de tokens** (128 variables `--bg-*`, `--text-*`, couleurs par pôle…).
- La brique Salsi (qa/formation/learned/ai…) est déjà découpée en petits fichiers.

**Les 5 problèmes**
1. **Poids mort** (~11k lignes de vieux/doublons, noms avec espaces `« (1) »`).
2. **Monolithes JS par module** : 1 fichier IIFE géant chacun — feature-flag-manager **3830**, secret-scanner-test **3001**, maturity **2673**, gouvernance-repo **2454**, secrets-scanner **2110**, daily-report **1926**, gaming **1884**…
3. **Composants CSS dupliqués** : `.card` redéclaré dans **11** fichiers, `.btn` dans **13**, `.badge` dans **7**. Chaque module réinvente carte/bouton/badge au lieu de réutiliser.
4. **`<head>` répété** sur les 31 pages (fonts, theme) ; `common/auth.js` chargé de façon incohérente (20/31).
5. **Conventions floues** : nommage, ordre de chargement des scripts variable d'une page à l'autre.

## Contrainte-cadre (à garder)

Le site est **statique, sans build, marche en `file://` ET servi**. On **reste sans build** :
la restructuration = **dossiers + `<script>`/`<link>`**, exactement comme le hub le fait déjà.
(Un build type esbuild/vite permettrait les vrais `import`, mais casserait `file://` et
ajouterait de l'outillage — non retenu.)

## Cible — arborescence

```
/                      pages HTML (URLs d'entrée) — restent à la racine
css/
  core/
    tokens.css         ← les 128 variables (ex-theme.css) = source unique
    base.css           ← reset, typographie, body
    components.css     ← .card .btn .badge .stat .pill .bar .chip .modal … (dédupliqués)
  modules/
    <module>.css       ← UNIQUEMENT le spécifique au module
js/
  common/              ← socle : auth, gitlab, utils, workshops (+ ui.js : toast/modal/dom/escape)
  salsi/               ← toute la brique Salsi regroupée (aujourd'hui éparpillée js/ + js/hub/)
    qa.js formation.js learned.js brief.js ai.js config.js atelier.js
    dora-history.js gaming-history.js gaming-recipes.js
  modules/
    <module>/          ← un dossier par module (comme js/hub/)
      data.js          ← appels GitLab
      compute.js       ← calculs / scoring
      render.js        ← DOM
      index.js         ← entrée + câblage
  hub/                 ← déjà modularisé — reste la référence
salsi-ai/              ← back IA (déjà isolé) — inchangé
```

## Découpage CSS — 3 couches

Chaque page charge dans l'ordre : **tokens → base → components → `modules/<module>.css`**.
- Extraire les composants répétés (`.card`, `.btn`, `.badge`, `.stat`, `.pill`, `.bar`,
  `.chip`, `.modal`, barres de progression…) dans `core/components.css`.
- Les CSS de module ne gardent que le **layout et les widgets uniques**.
- Gain attendu : **-30 à -50 %** sur les CSS de module, une seule source pour le look.

## Découpage JS

- **`js/common/`** garde le transport/auth/utils ; on y ajoute `ui.js` (toast, modal,
  `escapeHtml`, helpers DOM) au lieu de le redéclarer dans chaque module.
- **`js/salsi/`** : on regroupe la brique Salsi (elle est bien découpée mais dispersée).
- **`js/modules/<name>/`** : on casse les monolithes en `data / compute / render / index`,
  comme le hub. On commence par les plus gros, **un à la fois**, testé à chaque étape.

## HTML — `<head>` partagé (sans build)

Un `js/common/head.js` qui **injecte** en une passe : préconnexions fonts, `theme.css`,
et les 3 CSS `core/`. Chaque page n'a plus qu'**une balise** `<script src="js/common/head.js">`
au lieu du bloc répété. (Ou, a minima : un `<head>` **identique** documenté.)

## Conventions

- **kebab-case**, pas d'espaces, pas de suffixe `old` (git garde l'historique).
- **Ordre de chargement standard** documenté (common → salsi → module).
- **Un module = un dossier**.

## Plan par phases (incrémental, faible risque)

| Phase | Contenu | Risque | État |
|---|---|---|---|
| **0** | **Supprimer le poids mort** (~11k lignes, 0 référence) + renommer les fichiers à espaces | Nul | ✅ **Fait** (v1.10.0) |
| **1** | CSS `core/` (tokens + base) + migrer les 27 pages, dédup reset/spin | Faible | ✅ **Fait** (v1.11.0) |
| **2** | Regrouper la brique Salsi dans `js/salsi/` (déplacements + mise à jour des `<script>`) | Faible | ✅ **Fait** (v1.12.0) |
| **3** | Casser les monolithes en `js/modules/<name>/…`, un par un (FF 3830 → maturity → gouvernance…) | Moyen (un module à la fois, testé) | 🔶 **En cours** — `feature-flag-manager` ✅, `maturity` ✅, `gouvernance-repo` ✅ (v1.15.0) |
| **4** | `<head>` partagé + doc conventions | Faible | à venir |

Chaque phase est **vérifiable** (suites headless Salsi + ouverture des pages). On avance
module par module : jamais un big-bang.

### Phase 3 — `gouvernance-repo` (2454 l.) — cas « module enveloppé dans une IIFE »

Ici tout le fichier était dans **une IIFE** `(function(){ 'use strict'; … })()` : les
fonctions/état vivaient dans la **closure**, invisibles entre `<script>` séparés. Deux
approches sans build : (a) **déballer l'IIFE** vers la portée globale, ou (b) réécrire en
objet-namespace (lourd). J'ai retenu **(a)**, après avoir vérifié que c'était sûr :

- **Aucun `return` top-level** dans l'IIFE (sinon « return outside function » au déballage).
- **Zéro dépendance `common/`** (le module a son propre `GITLAB_URL`/`token`) et les pages
  ne chargent que `theme.js` + XLSX/Chart (CDN) → **aucune collision** de noms (vérifié par
  AST : les 51 déclarations + 83 fonctions ne heurtent aucun global de la page).

Déballage → 5 fichiers, `'use strict'` **remis en tête de chaque fichier** pour garder le
mode strict. `state.js` (51 déclarations, 1er) → `data.js` (18) → `compute.js` (23) →
`render.js` (32) → `index.js` (10 orchestrateurs + `DOMContentLoaded` + **17 expositions
`window.*`** = l'API des onclick, chargé en dernier). L'indentation 2-espaces est conservée
(dé-indenter corromprait les template literals).

Vérifs ✅ : **invariant AST** (83 fonctions + 51 déclarations préservées) ; `node --check`
sur les 5 ; **rendu byte-identique** monolithe vs split, **17 fonctions d'API bien
exposées**, et interactions cross-fichiers OK (`setMode`, `openLaunchModal`…), 0 erreur.
Chargé par **2 pages** (`gouvernance-repo.html` + `gouvernance-repool.html`), les deux recâblées.

### Phase 3 — `maturity` (2673 l.) — cas « script à exécution top-level »

Contrairement à FF (déclarations + un seul bloc init), `maturity.js` mêle **8 statements
à exécution immédiate** aux déclarations (boucles qui construisent `QUESTIONS`/`ADVICE`,
garde `initAuth`, `attachEventDelegation`, init de la date, IIFE de délégation). Le
naïf « découper par colonne » casse en plus sur un **template literal HTML** (contenu à
colonne 0). J'ai donc parsé le fichier avec l'**AST TypeScript** pour des frontières exactes.

Découpe (chargée dans cet ordre) : `state.js` (21 déclarations, 1er) → `data.js` (9) →
`compute.js` (7) → `render.js` (16) → **`index.js` = bootstrap** (les 8 statements
immédiats + `inDateEl`, dans l'ordre d'origine, **chargé en dernier** pour que les
fonctions et l'état soient prêts).

Vérifs ✅ : **invariant AST** (32 fonctions + 22 déclarations + 8 statements, tous
préservés) ; `node --check` sur les 5 ; **rendu byte-identique** monolithe vs split, à
l'écran d'intro **et** en flow (démarrage du quiz, catégorie Culture, 10 questions,
`inDate` correctement initialisée → preuve que le bootstrap immédiat s'exécute), 0 erreur.

### Phase 3 — pilote `feature-flag-manager` (le plus gros monolithe : 3830 l.)

Le monolithe est cassé en **5 fichiers** dans `js/modules/feature-flag-manager/`,
chargés dans cet ordre :

| Fichier | Rôle | ~lignes |
|---|---|---|
| `state.js` | état & config partagés (33 déclarations) — **chargé en 1er** | 119 |
| `data.js` | I/O GitLab + fichier client (19 fonctions) | 434 |
| `compute.js` | logique pure : scoring, statuts, familles, helpers (30) | 980 |
| `render.js` | rendu DOM : dashboard, tables, modals, wizard, rapports (63) | 2206 |
| `index.js` | entrée & câblage : `init()` + `renderAllCharts` + bloc INIT — **chargé en dernier** | 179 |

**Méthode (reproductible pour les prochains monolithes)** :
1. Les `let`/`const` top-level d'un script classique **sont partagés** entre `<script>`
   séparés (vérifié empiriquement) → on peut découper sans build, sans `import`.
2. Tout l'état est regroupé dans `state.js` (chargé en 1er, comme `js/hub/core/state.js`) ;
   les fonctions sont réparties **intactes** (jamais coupées en plein corps).
3. Seul le bloc à exécution immédiate (`init` au `DOMContentLoaded`) va en dernier.

**Vérifications (toutes ✅)** :
- **Invariant** : la concaténation des 5 fichiers contient exactement les **148
  déclarations** d'origine (même md5) — rien perdu, rien ajouté.
- **Syntaxe** : `node --check` OK sur les 5 fichiers (aucune coupure en plein corps).
- **Équivalence de rendu** : DOM rendu **byte-identique** entre monolithe et split
  (mêmes KPIs, score santé, âges des flags, 0 erreur), avec auth seedée + API mockée.

### Phase 2 — ce qui a été fait

- **7 fichiers de la brique conversationnelle Salsi** regroupés dans **`js/salsi/`**,
  préfixe `salsi-` retiré (le dossier le porte déjà) :
  `hub/salsi-{ai,brief,config,formation,learned,qa}.js` + `salsi-atelier.js`
  → `js/salsi/{ai,brief,config,formation,learned,qa,atelier}.js`.
- Références mises à jour : `<script src>` sur **hub / insights / project-scaffolder**,
  chemins par défaut de **`salsi-ai/promote.js`** (`LEARNED_PATH`/`FORMATION_PATH`),
  et le catalogue `SALSI_QA.md`.
- **Volontairement laissés en place** : `js/gaming-history.js`, `gaming-recipes.js`,
  `dora-history.js`. Ce sont des **données/recettes partagées** (chargées aussi par
  `gaming.html` et `insights.html`), pas la brique conversationnelle — les déplacer
  sous `js/salsi/` serait trompeur. Ils iront dans un futur `js/common/` si besoin.
- **Vérifié headless** : les 7 fichiers servis à leurs nouveaux chemins (0 lien cassé),
  globals initialisés (`Salsifi`, `salsiQaAsk`, 22 entrées formation), et **5 routes
  déterministes rendues** correctement (panorama, lead time, feature flag, priorités…).

### Phase 1 — ce qui a été fait (et ce qui a été volontairement reporté)

- **`css/core/tokens.css`** = ex-`css/theme.css` (les 128 variables), déplacé et re-câblé
  sur les **27 pages**.
- **`css/core/base.css`** (nouveau) : reset universel `*{}`, lissage `html{}`, et
  `@keyframes spin` — **strictement identiques** dans tous les modules, donc levés sans
  risque. Retirés de **23 CSS de module** (reset ×20, smoothing ×18, spin ×19).
- Chaque page charge désormais **`core/tokens.css` → `core/base.css` → `<module>.css`**.
- **Vérifié headless** (Playwright, 6 pages représentatives) : `box-sizing:border-box`
  appliqué, tokens résolus, fond correct, **0 CSS 404**, aucune régression.
- **Reporté à la Phase 3 (à raison)** : la dédup de `.btn` / `.stat` / `.card`. Les
  variantes **divergent par module** (couleurs, et surtout **sémantique** — le
  `.btn-primary` de `branch-cleaner` est **rouge destructif** exprès). Les fusionner à
  l'aveugle casserait du visuel. Ça se fera module par module, avec test visuel, quand on
  cassera les monolithes (Phase 3) — pas avant.

## Recommandation

Commencer par la **Phase 0** (gain immédiat, zéro risque : suppression de ~11k lignes
mortes), puis la **Phase 1** (CSS core) qui donne le plus de valeur maintenabilité pour
le moins de risque. Les phases 2-3 se font ensuite au rythme voulu, module par module.
