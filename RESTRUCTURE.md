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

| Phase | Contenu | Risque |
|---|---|---|
| **0** | **Supprimer le poids mort** (~11k lignes, 0 référence) + renommer les fichiers à espaces | Nul |
| **1** | CSS `core/` (tokens/base/components) + migrer les pages, alléger `modules/*.css` | Faible (visuel à vérifier) |
| **2** | Regrouper la brique Salsi dans `js/salsi/` (déplacements + mise à jour des `<script>`) | Faible |
| **3** | Casser les monolithes en `js/modules/<name>/…`, un par un (FF 3830 → maturity → gouvernance…) | Moyen (un module à la fois, testé) |
| **4** | `<head>` partagé + doc conventions | Faible |

Chaque phase est **vérifiable** (suites headless Salsi + ouverture des pages). On avance
module par module : jamais un big-bang.

## Recommandation

Commencer par la **Phase 0** (gain immédiat, zéro risque : suppression de ~11k lignes
mortes), puis la **Phase 1** (CSS core) qui donne le plus de valeur maintenabilité pour
le moins de risque. Les phases 2-3 se font ensuite au rythme voulu, module par module.
