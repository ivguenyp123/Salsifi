# Salsifi — DevOps Hub · Notes de version

## v1.17.0 — 2026-07-24 · Pipeline Generator — nouveau format toolchain + stratégies de branchement

Le générateur produit désormais le **nouveau format de toolchain appelante** (bloc
`workflow:` + matrice de `rules:` par job), piloté par une **stratégie de branchement**.

- **Sélecteur de stratégie** : `Trunk-based` · `Feature branching` · `GitFlow`. Le
  `include` + `variables` restent identiques ; ce qui change = le `workflow:` + les
  `rules:` par job (`initialize`, `build_app`, `build_docker`, `deploy_development`,
  `deploy_uat`, `promote_staging`, `promote`, `deploy_production`).
- **Trunk** reproduit **fidèlement** le fichier de référence (mêmes jobs, mêmes contextes,
  garde anti-doublon branch+MR).
- Choisir une stratégie **pré-coche** ses défauts (`DEPLOY_TO_*`, promotes) et affiche sa
  **matrice** contexte→jobs.
- Matrices (défauts, ajustables — c'est piloté par données) :
  - **Feature branching** : la MR→main valide jusqu'en **UAT** avant merge.
  - **GitFlow** : `develop`→DEV, `release/*`→UAT, `main`→PROD, `hotfix/*`→prod fast-path,
    promotion multi-étages (`promote_staging` en pré-prod, `promote` en stable/prod).
- Les 3 stratégies génèrent du **YAML valide** (vérifié).

## v1.16.2 — 2026-07-23 · Hub — correctif : les repos de la mauvaise instance GitLab

**Bug corrigé.** En se connectant à l'instance **community** (`scm.saas…`), les repos
**premium** (`scm-premium.saas…`) apparaissaient — et inversement.

- **Cause** : le cache des repos du hub était indexé sur `hub_cache_repos_<identifiant>`,
  **sans l'instance GitLab**. Comme le même identifiant existe sur les deux instances, le
  cache de l'une (TTL 1h) s'affichait sur l'autre avant le fetch live.
- **Fix** : la clé de cache inclut désormais l'**hôte GitLab** :
  `hub_cache_repos_<host>|<identifiant>`. Chaque instance a son cache isolé → on ne voit
  que les repos de l'instance sur laquelle on est connecté.

## v1.16.1 — 2026-07-23 · Gouvernance Repo — correctif : le flux guidé ne s'arrête plus après Secrets

**Régression corrigée.** En lançant plusieurs vérifications d'un coup (Secrets + Historique
+ Supply-chain + CIS), seul **Secrets** s'exécutait quand le token n'a pas le droit de créer
des MR.

- **Cause** : `createReportMRs` / `createCISMRs` arrêtaient leur boucle après 3 refus de MR
  (403) en positionnant le flag **global** `aborted = true`. Or l'orchestrateur du flux
  guidé (`runSelectedChecks`) lit ce même flag (`if (aborted) break`) → il coupait **tout
  le scan** après la première vérification.
- **Fix** : la boucle de création des MR utilise désormais un flag **local** (`stopMr`) ;
  le flag global `aborted` (arrêt du scan par l'utilisateur) n'est plus touché. Les 4
  vérifications s'enchaînent, même quand aucune MR ne peut être créée.
- Vérifié end-to-end : 4 repos, secret détecté, MR **refusées (403)** → **Secrets +
  Historique + Supply-chain + CIS** tournent tous, `aborted` reste `false`.

## v1.16.0 — 2026-07-23 · Gouvernance Repo / Secrets Scanner — liens « aller à la ligne » dans le rapport

Chaque finding (rapport à l'écran, HTML, Excel, Markdown téléchargé **et** MR) est
désormais un **lien cliquable vers le repo, à la ligne exacte du problème** — dans tous
les modes (repo simple `?repo=`, workspace, tous les repos).

- **Cause du bug** : l'URL du lien dépendait de `repo.url` (le `web_url` GitLab), **absent
  du listing `simple=true`** sur certains GitLab (dont LCL) → lien vide → fichier affiché
  en texte brut dans le rapport.
- **Fix** : un helper unique `findingUrl(repo, f)` reconstruit toujours la base depuis
  `GITLAB_URL + repo.path` quand `web_url` manque → un lien est **toujours** produit.
  Tous les générateurs (cartes en page, tableau du rapport, Excel, les 2 Markdown)
  passent par ce helper → cohérence garantie.
- Fichier **et** numéro de ligne cliquables : `…/-/blob/<ref>/<fichier>#L<ligne>`.
  Finding **historique** ancré sur son **commit**. Check CIS sans fichier → pas de faux lien.
- **Colonne REPO du tableau du rapport rendue cliquable** : cliquer le chemin du repo
  (`lcl/easypro/…`) emmène directement à la ligne concernée, comme les résultats en page.
- **Même correctif dans le module frère `secrets-scanner`.**

## v1.15.0 — 2026-07-23 · Restructuration — Phase 3 : découpage de `gouvernance-repo`

3ᵉ monolithe cassé (**2454 lignes**) → 5 fichiers sous `js/modules/gouvernance-repo/`.
Cas nouveau : le fichier était **enveloppé dans une IIFE** (état/fonctions dans la
closure). Déballé vers la portée globale — sûr ici (pas de `return` top-level, zéro
dépendance `common/`, aucune collision de noms vérifiée par AST). `'use strict'` remis en
tête de chaque fichier.

- **`state.js`** (51 déclarations, 1er) · **`data.js`** (I/O GitLab + persistance, 18) ·
  **`compute.js`** (analyse secrets/supply/CIS, parsing, rapports-strings, 23) ·
  **`render.js`** (cards, charts, modals, filtres, 32) · **`index.js`** (orchestrateurs +
  `DOMContentLoaded` + **17 expositions `window.*`**, dernier).
- **Prouvé équivalent** : invariant AST (83 fonctions + 51 déclarations), `node --check`
  sur les 5, **DOM byte-identique** monolithe vs split, **17 fonctions d'API exposées**,
  interactions cross-fichiers OK, 0 erreur. Chargé par 2 pages, les deux recâblées ;
  monolithe supprimé.

## v1.14.0 — 2026-07-23 · Restructuration — Phase 3 : découpage de `maturity`

2ᵉ monolithe cassé (**2673 lignes**) → 5 fichiers sous `js/modules/maturity/`. Cas plus
délicat que FF : du **code top-level à exécution immédiate** (construction des données du
questionnaire, garde d'auth, câblage DOM, init date) mêlé aux déclarations, **plus** un
gros template literal HTML. Parsé à l'**AST TypeScript** pour des frontières exactes.

- **`state.js`** (données JSON + config + état, 1er) · **`data.js`** (I/O GitLab, auth,
  export/import) · **`compute.js`** (scoring, sélection questions) · **`render.js`**
  (écrans, quiz, rapport, modals) · **`index.js`** (bootstrap : les 8 statements
  immédiats dans l'ordre, chargé en dernier).
- **Prouvé équivalent** : invariant AST (32 fonctions + 22 déclarations + 8 statements
  préservés), `node --check` sur les 5, et **DOM byte-identique** monolithe vs split —
  à l'intro **et** en flow (démarrage du quiz, 10 questions de Culture, date initialisée),
  0 erreur. Monolithe supprimé.

## v1.13.0 — 2026-07-23 · Restructuration — Phase 3 (pilote) : découpage de `feature-flag-manager`

Premier monolithe cassé — le plus gros (**3830 lignes**). Découpé en **5 fichiers** sous
`js/modules/feature-flag-manager/`, sur le modèle du hub. **Zéro changement de
comportement** (prouvé).

- **`state.js`** (état & config, chargé en 1er) · **`data.js`** (I/O GitLab) ·
  **`compute.js`** (logique pure : scoring, statuts, familles) · **`render.js`** (rendu
  DOM) · **`index.js`** (`init` + câblage, chargé en dernier).
- **Méthode sans build** : les `let`/`const` top-level d'un script classique sont
  **partagés** entre `<script>` séparés → découpage par simples balises, comme le hub.
  Les fonctions sont déplacées **intactes**, l'état regroupé dans `state.js`.
- **Prouvé équivalent** : (1) invariant — mêmes **148 déclarations** (md5 identique) ;
  (2) `node --check` OK sur les 5 fichiers ; (3) **DOM rendu byte-identique** monolithe
  vs split (KPIs, score santé, âges, 0 erreur) sous auth seedée + API mockée.
- Le HTML charge 5 `<script>` au lieu d'un ; monolithe supprimé.
- **Reste en Phase 3** : maturity (2673), gouvernance-repo (2454), secrets-scanner
  (2110), daily-report (1926), gaming (1884)… — un par un, même méthode, même preuve.

## v1.12.0 — 2026-07-23 · Restructuration — Phase 2 : la brique Salsi dans `js/salsi/`

Toute la partie conversationnelle de Salsi, jusqu'ici **éparpillée** entre `js/` et
`js/hub/`, est désormais **rangée au même endroit**. Déplacements purs (contenu inchangé).

- **7 fichiers → `js/salsi/`**, préfixe `salsi-` retiré (redondant avec le dossier) :
  `ai.js · brief.js · config.js · formation.js · learned.js · qa.js · atelier.js`.
- Références mises à jour : `<script src>` de **hub / insights / project-scaffolder**,
  chemins par défaut de **`salsi-ai/promote.js`** (boucle d'apprentissage), catalogue
  `SALSI_QA.md`.
- **Laissés en place** : `gaming-history.js`, `gaming-recipes.js`, `dora-history.js` —
  données partagées avec `gaming.html`/`insights.html`, pas la brique conversationnelle.
- **Vérifié headless** : 0 lien cassé, globals initialisés (22 entrées formation), et
  5 routes déterministes rendues OK depuis les nouveaux chemins.

## v1.11.0 — 2026-07-23 · Restructuration — Phase 1 : socle CSS `core/`

Mise en place d'une couche CSS partagée, chargée avant le CSS de chaque page. **Zéro
régression visuelle** : on n'a levé que ce qui était **strictement identique** partout.

- **`css/core/tokens.css`** ← ex-`css/theme.css` (les 128 variables de thème), déplacé
  et re-câblé sur les **27 pages**.
- **`css/core/base.css`** (nouveau) : reset universel `*{}`, lissage `html{}`, et
  `@keyframes spin` — retirés de **23 CSS de module** (reset ×20, smoothing ×18,
  spin ×19). Une seule source désormais.
- Ordre standard sur chaque page : **`core/tokens.css` → `core/base.css` →
  `<module>.css`**.
- **Vérifié headless** (Playwright, 6 pages) : `box-sizing` OK, tokens résolus, fond
  correct, aucun 404.
- **Reporté (à raison) en Phase 3** : la dédup `.btn`/`.stat`/`.card` — variantes trop
  divergentes selon le module (ex. `.btn-primary` rouge destructif dans `branch-cleaner`).
  Se fera module par module, testée, lors du découpage des monolithes.

## v1.10.0 — 2026-07-23 · Restructuration — Phase 0 : nettoyage du poids mort

Début de la restructuration pour la maintenabilité (voir `RESTRUCTURE.md`). Cette
première phase est **zéro risque** : elle ne supprime que du code **mort**.

- **16 fichiers obsolètes supprimés** (`*old*`, doublons `« (1) »`/`« (2) »`) —
  **15 847 lignes** référencées par **0 page vivante** : `hubold`, `feature-flag-
  managerold`, `secrets-scannerold` (+ variante), `pipeline-generator (1)/(2)`,
  `repo-analyzer (1)`, `hub-mockup-v2_1old`… (CSS + JS + HTML).
- **Convention respectée** : plus aucun fichier avec espaces ni suffixe `old` dans le
  repo (git garde l'historique). Scan des références HTML → **aucun lien cassé**.
- Prochaines phases (dans `RESTRUCTURE.md`) : **1** CSS `core/` (tokens/base/
  components), **2** regrouper Salsi dans `js/salsi/`, **3** casser les monolithes en
  `js/modules/<name>/{data,compute,render,index}`, **4** `<head>` partagé.

## v1.9.0 — 2026-07-22 · Salsi × IA, en dernier recours (Vertex · Gemini 2.5 Pro)

L'IA vient **par-dessus** le déterministe, **jamais avant**. Elle n'est appelée que
lorsque Salsi ne sait pas (`unknown`), et reste **OFF par défaut** tant qu'aucun back
n'est configuré. Objectif : l'utiliser **de moins en moins**.

- **Fallback-only** : sur une question inconnue, Salsi envoie au back la question + un
  **contexte de grounding** (18 modules + glossaire + entrées formation + tes résultats
  en cache). La réponse est **badgée « ⚡ IA (hors déterministe) »** et **loggée `ai:true`**
  dans `salsifi_qa_log` → tu vois ce que l'IA traite, tu l'ajoutes au déterministe.
- **Client** (`js/hub/salsi-ai.js` + `salsi-config.js`) : aucun secret côté navigateur ;
  URL/secret via `salsi-config.js` (ou localStorage). La pastille affiche « · IA en
  secours » quand c'est branché, « · 0 IA » sinon.
- **Back de prod** (dossier `salsi-ai/`) : relais Node → Vertex `gemini-2.5-pro`
  (europe-west9). Contrat `POST /salsi/ask {question, contexte} → {answer, horsPerimetre}`.
- **Blindé LCL** : prompt système durci (périmètre strict + anti-injection + anti-
  hallucination), **safety filters Vertex** natifs, gestion des réponses bloquées,
  **rate-limiting** par IP, **contrôle d'origine** + CORS strict + secret partagé,
  timeout Vertex, payload plafonné, **journal d'audit** (hash de la question, texte OFF
  par défaut). `README` + `.env.example` + `Dockerfile` fournis.

## v1.8.0 — 2026-07-22 · Salsi apprend tes docs de formation

Salsi peut désormais **répondre depuis tes docs de formation**, en 100 % déterministe.
Chaque doc devient des entrées (mots-clés → réponse fidèle) dans
`js/hub/salsi-formation.js` — **ajouter un doc = ajouter ses entrées**.

- **Module 07 « Feature Flags & Progressive Delivery »** ingéré : 22 concepts —
  déploiement ≠ activation, bénéfice DORA, les 4 types de flags, ciblage, rollout %
  + hash stable, canary vs blue/green, montée en charge, kill switch, dette de flags,
  OpenFeature, stockage, GitOps, audit…
- **Match par co-occurrence** (`all`) en plus des mots-clés : « comment les flags
  m'aident à augmenter mes DORA » retombe sur la bonne fiche même avec des mots
  intercalés. Sans casser l'existant : « combien de FF » reste la donnée live,
  « c'est quoi un feature flag » reste la définition courte.

## v1.7.0 — 2026-07-22 · Salsi vit dans le Scaffolder

Le scaffolder (concierge IA guidée par questions) a désormais l'**identité Salsi**.

- La **mascotte Salsi** remplace l'avatar générique, l'intro le présente par son nom,
  l'en-tête devient « Scaffold · Salsi ».
- **Mascotte expressive** : *proud* ✨ (reco, flow verrouillé, génération réussie),
  *worried* (écran bloqué, choix de flow risqué), *meh* (réflexion), *happy* (guidage).
  Aucune logique du flux modifiée — que l'habillage.

## v1.6.0 — 2026-07-21 · Salsi Q&R : demande-lui tout sur la plateforme

Une **icône flottante** ouvre un chat où Salsi répond **sur la plateforme**, en
**100 % déterministe** (routeur d'intentions, zéro IA) : définitions, tes chiffres,
ce qui ne va pas, comment progresser. Chaque question est **journalisée** (heure,
repo, intention) — socle du fallback IA.

- **Couverture profonde de 6 modules** (définition + tes chiffres + ta note + comment
  améliorer) : **DORA** (4 mesures, niveaux/seuils, calcul du score, coach), **Achievements**
  (47 badges, 6 familles, 5 phases, « quel badge gagner facilement »), **Bus Factor**
  (niveaux, score /5, leviers), **Daily Report** (contenu, conseils du jour, digest),
  **Feature Flags** (nombre, noms, environnements, actifs/inactifs, détail d'un flag),
  **Repo Analyzer** (santé /100, red flags, quick-wins priorisés).
- **Rapports téléchargeables à la demande** : rapport **DORA** (miroir de l'export
  Insights), et rapports d'activité **jour** (nouveau) / **semaine** / **mois**
  (santé, best-practices, jour-par-jour, top échecs, MR qui traînent).
- **Aide & prise en main** : « que fait la plateforme » (les 18 modules), « comment je
  m'en sers » (mode d'emploi d'un module, y compris en suivi), « c'est quoi <module> »
  pour les 18, « mes priorités du jour » (ouvre le bilan Salsi).
- **Small-talk** (salut, ça va, merci, qui es-tu) sans jamais voler une vraie question,
  et **compréhension du jargon** (`FF` = feature flag, `MR`, `CI`…).
- Répond sur le **repo sélectionné**, `403` → « non vérifiable », hors périmètre →
  refus honnête. Nouveaux `js/hub/salsi-qa.js`, `SALSI_QA.md` (catalogue).

## v1.5.0 — 2026-07-20 · Salsi, bilan cross-modules à la demande (hub)

On entre sur le hub **normalement** (aucune popup à l'arrivée). Le bouton **🌱 Salsi**
du header ouvre Salsi **quand on veut** : il fait une **vraie analyse d'UN repo** en
tirant une priorité de **chaque module**, et affiche les **5 priorités — sécurité en tête**.

- **Cross-modules** : 🔒 Sécurité (branche protégée, approbations, SECURITY.md/CODEOWNERS,
  visibilité), 🚌 Bus factor (concentration des commits), 🩺 Repo Analyzer (inactivité,
  branches mortes), 📆 Activité/Daily (pipelines en échec récents), 🚩 Feature Flags,
  📊 DORA (cache) et 🎮 Achievements (cache).
- **Sécurité en tête** : le scoring place les manques de sécu au-dessus de tout — une
  branche non protégée passe avant un CFR faible.
- **Check léger LIVE** sur le **repo sélectionné** (un seul repo → quelques appels via
  `Salsifi.gitlabFetch/gitlabPaginate`, mini-loader « Analyse en cours… »). Un item par
  sujet, top 5 classé par gravité, chaque point **cliquable** vers le bon module.
- **Honnête** : 403 → « 🔒 non vérifiable », jamais compté à charge. Ne scanne qu'**un**
  repo à la fois (pas les 1000). Si le live échoue, on garde au moins le cache DORA/gaming.
- **États clairs** : aucun repo → « choisis un repo » ; repo au propre → « rien de
  prioritaire, beau boulot ».
- Réutilise la **popup Atelier partagée** ; tout en `try/catch`, ne bloque jamais le hub.
  Nouveau `js/hub/salsi-brief.js`, pastille dans `.header-actions` (aucune modif du cœur du hub).

## v1.4.0-test — 2026-07-20 · Blast Radius (banc d'essai)

Nouveau module **« Secret Scanner Test »** (`secret-scanner-test.html`) — une
**copie** du Secret Scanner, isolée : le vrai module n'est pas touché. On y
expérimente le **Blast Radius** d'un IOC sans risque, et chaque scan se lance
seul (pas de loader global).

- **Découverte (OSV.dev)** — pour le cas « je ne connais pas l'IOC » : la plateforme
  **inventorie les composants résolus** de tous les repos (lockfiles) et les **croise
  avec OSV.dev** (vulnérabilités + **packages malveillants** `MAL-`). Composants
  signalés classés par gravité (☣️ malveillant en tête), liens vers les avis, nb de
  repos concernés, et un bouton **🎯 Tracer** qui lance le Blast Radius sur le
  composant choisi. Seuls des **noms de packages publics** sont envoyés à OSV —
  jamais de code ni de secret.
- **Entrée manuelle = un IOC** (conservée) : composant npm + version + fenêtre, pour
  les alertes CERT/presse où le composant est déjà connu.
- **Tranche 1, 100 % lecture seule** :
  - **Présence historique** — où le composant était : lockfiles (`package-lock.json`
    v1/v2/v3, `yarn.lock`), **version résolue**, intégrité, direct/transitif,
    prod/dev, date d'introduction, commits & branches. Fallback lecture-au-SHA.
  - **Exécution** — a-t-il tourné : commits → pipelines/jobs, **SBOM CycloneDX si
    présent** (artefact `cyclonedx`/`*.cdx.json`, **tier-agnostique** — pas l'API
    Dependency List Ultimate). 4 niveaux de preuve, dégradation propre.
  - **Score P0→P3**. **Tranche 2 (Privilèges)** : pour chaque exposition qui a
    tourné, la plateforme calcule ce que le job **pouvait atteindre** — **secrets**
    (métadonnées seulement : nom, `protected`/`masked`/`environment_scope` — **jamais
    la valeur**, jetée à la lecture), **droits d'écriture** (registry conteneur /
    `job_token_scope` sortant), **runner partagé/persistant**. Un job **exécuté +
    au moins un de ces accès → P0** (compromission critique). Caveat temporel
    assumé : privilèges = **état actuel** des variables (`confidence:
    current_state_only`), 403 → « non vérifiable » (jamais compté à charge).
    Le plan d'action liste les **secrets à tourner** (par clé).
  - **Tranche 3 (Propagation)** : ce que les jobs exposés ont **fabriqué** —
    **packages publiés**, **images** registry, **déploiements** (jusqu'où, et
    **toujours actif en prod ?**), et **pipelines consommateurs** via les bridges
    (récursif borné, profondeur 2, **marqueur de troncature**). Autre voie vers le
    **P0** : exécuté **et** (package publié **ou** déployé en prod). Les **caches**
    restent non calculés (opaques côté API) — annoncé. Le chiffre phare : **artefact
    toujours actif en prod**. La chaîne est complète : « entrée ici → a tourné là →
    pouvait atteindre ceci → a produit cela → voilà ce qui reste à nettoyer ».
  - **Comportement suspect (statique)** : détecte les **empreintes** des comportements
    d'attaque dans ce que GitLab expose — le **script d'installation** du composant
    (`hasInstallScript` du lockfile, vecteur n°1 des compromissions npm), et les motifs
    dans les **scripts `postinstall`/CI/Dockerfile** : `curl|bash`, `base64 -d | sh`,
    `eval`/IEX distant, reverse-shell (`/dev/tcp`, `nc -e`), fetch vers **IP brute**,
    PowerShell encodé, `ADD` depuis URL. Colonne dédiée + décompte. **Honnête sur la
    frontière** : ce sont des empreintes **statiques** (l'intention), **pas** de la
    télémétrie runtime — les vrais signaux runtime (processus enfants, connexions
    réseau, exec K8s, accès FS) demandent un agent (Falco/eBPF/audit logs), hors
    périmètre d'un outil client-side sur l'API GitLab.
  - **Présentation timeline** : axe temporel, une barre d'exposition par repo
    colorée par priorité, points d'exécution (violet = pipeline, vert = SBOM).
  - **Rapport d'incident HTML + plan d'action exportable** (« à corriger / à
    examiner / étapes suivantes »).
- Rien n'est modifié : la plateforme **qualifie et route**, l'humain décide.

## v1.3.0 — 2026-07-20 · Compagnon temporel DORA

Le **compagnon temporel** — snapshot → journal → régime → trajectoire → voix,
100 % déterministe, aucune IA — quitte le seul module gaming pour s'appliquer aux
**métriques DORA** (`insights.html`). Même moteur, même philosophie : on ne
compare pas à un seuil abstrait mais à **ta** normale, et on raconte ce qui a bougé.

- **Nouveau bandeau en tête d'Insights** : au lieu d'un simple instantané, le
  module se souvient. Un point est enregistré à chaque analyse (localStorage,
  clé dédiée `salsifi_dora_history_<repo>`), et le compagnon en dérive :
  - **Trajectoire** globale (📈 / 📉 / ➡️) avec hystérésis — on compare le score à
    la **médiane d'une fenêtre passée**, donc pas de bascule sur un seul mauvais jour.
  - **Journal « ce qui a bougé »** : l'événement phare DORA, c'est la **transition
    de palier** (Lead Time Medium→High, CFR retombé en Low, niveau global qui monte…),
    plus les records et régressions de chaque métrique, datés.
  - **Régime** : écart de chaque métrique à la **baseline glissante propre à l'équipe**
    (« ton CFR est meilleur que ta normale de −58 % »).
- **Coach Salsi (nouveau, remplace la « voix »)** : au lieu d'un conseil que tu
  subis, le coach te demande **« sur quelle des 4 mesures veux-tu progresser ? »**
  et construit un **vrai plan profond**, orienté objectif et **évolutif** — présenté
  dans **la même popup « Atelier Salsi » que les achievements** (même mascotte, même
  UX/UI) :
  - Un **point d'entrée sobre** : les 4 métriques avec ton niveau actuel ; Salsi
    **suggère la plus faible** pour amorcer. Un clic ouvre l'atelier.
  - Un **plan par mesure dans l'atelier** : analyse « chez toi / objectif », un
    **diagnostic « chez toi, concrètement »** branché sur les vraies données du
    repo (pipelines en échec, MR sans review, grosses MR, branches mortes, bus
    factor, croisements inter-DORA — chacun avec le module Salsifi qui aide),
    l'enjeu, **les leviers priorisés** (5 par métrique, effort/impact + module), le
    **mouvement du moment**, la **mesure qui prouve la progression**, et les **pièges**.
  - **La section « Actions / Quick Wins » de la page a été supprimée** : sa
    substance est repliée, plus travaillée, dans le coach — un seul endroit pour agir.
  - **Il évolue** : on retient le cap et la valeur **au moment du choix**, puis on
    compare (« depuis ton cap, ton CFR est passé de 18 % à 6 % — ça marche »), et
    on **fait tourner les leviers** (escalade si la mesure ne bouge pas).
- **Atelier Salsi mutualisé** : la popup est extraite dans `js/salsi-atelier.js` +
  `css/salsi-atelier.css` (mascotte + `openSalsiAtelier`), pour une **UX identique**
  entre gaming et DORA — une seule source de vérité.
- **Moteur mutualisé** : `js/dora-history.js` réutilise les fonctions pures de
  `js/gaming-history.js` (baselines, records/régressions) et n'ajoute que la
  logique propre à DORA (paliers Low↔Elite) + l'état du coach. Testé hors-ligne
  via `require()`.
- **Jour 1** : première mesure → état posé + coach déjà disponible, **sans** la
  phrase « je mémorise » (elle cassait l'illusion du suivi).

## v1.2.0 — 2026-07-20 · Sécurité & Gouvernance

Gros travail sur le pôle **« Inspecter & Sécuriser »** : un nouveau module de
gouvernance des accès, et une refonte du scanner sécurité vers un flux
« produit ». Tout reste statique (`<script src>`, marche servi **et** en
`file://`), zéro token stocké côté service.

### 🔑 Accès & Rôles (nouveau module de workspace)

Auditer les droits GitLab des repos d'une tribu — `access-workspace.html`.
Rien n'est stocké : tout est recalculé à l'ouverture depuis le token de session.

- **Rapport de gouvernance** (vue par défaut) : KPIs (qui peut administrer,
  Owners distincts, comptes techniques en Owner, comptes bloqués, % hérités,
  % sans expiration), signaux de dette d'accès classés par gravité, et une
  **lecture « chemin d'attaque »** + une phrase prête pour le RSSI. Périmètre
  réglable (tout le workspace ou un repo précis) et **rapport HTML téléchargeable**.
- **Par repo / Par personne** : rôle **actuel** (plus de « rôle max » trompeur),
  distinction accès **direct vs hérité**, filtres par rôle, et **nom cliquable**
  qui ouvre la page Membres du repo dans GitLab.
- **Maintainers & Owners** : cartes des administrateurs et leur périmètre.
- **Historique (30 j)** : mouvements d'accès via **Audit Events** (Premium) avec
  repli **arrivées/départs** (API Events) sur les repos CE, et un indicateur de
  couverture explicite.
- **Conformité** : liste blanche des Maintainers autorisés (variable projet
  GitLab partagée `SALSIFI_ROLE_ALLOWLIST`, repli localStorage) + **rétrogradation
  semi-automatique** en 1 clic des Maintainers hors liste. Jamais silencieux ;
  Owners et accès hérités exclus de l'auto-fix, signalés à traiter à la main.
- Câblé au hub : carte **🔑 Accès & Rôles** dans la vue workspace.

### 🛡️ Scanner sécurité — flux unifié « une intention → la plateforme gère »

Les trois portes d'entrée (repo seul, tous les repos, **workspace**) partagent
désormais le même parcours — `gouvernance-repo.html`.

- **Mode workspace** (`?scope=workspace`) : les 4 scans (Surface, Historique,
  Supply-chain, CIS) ne portent que sur les **repos choisis** de la tribu ; garde-fou
  qui interdit de retomber sur « tous les repos » si le workspace est introuvable.
- **Popup d'intention** : on coche les contrôles voulus (un / plusieurs / tous),
  la plateforme **enchaîne tout** — analyse → MR → rapport. La **barre de modes
  manuelle a été retirée**.
- **Loader unique** pendant le run (spinner + phase en cours + étapes ✓/⏳/○) :
  fini les grilles par-scan qui clignotent.
- **Résultats consolidés** à la fin : une seule vue **par repo**, classée du plus
  risqué au moins risqué (secrets + supply + CIS réunis, liens `fichier:ligne`).

### 🐛 Correctifs & précisions sécurité

- **Rapport HTML illisible** (fond blanc / texte clair) : la passe theming avait
  laissé des tokens (`--bg-deep`, `--card-6`, `--ov-*`) indéfinis dans le fichier
  autonome → valeurs concrètes réintégrées, rapport **self-contained** de nouveau.
- **CIS absent du rapport** : l'export ne lisait que secrets + supply → les
  résultats de l'audit CIS sont accumulés et une **section Conformité CIS** +
  une **priorisation « repos les plus à risque »** ont été ajoutées.
- **Registry Artifactory interne** (`*.cagip.group.gca`) n'est plus classé
  « registry npm tiers » : liste blanche de domaines internes (le HTTP reste
  signalé, les vrais registries publics aussi ; regex ancrée anti-spoofing).
- **Enchaînement des scans** : sérialisation par `await` (scan puis sa MR) — un
  bug de v1 ne lançait qu'un seul scan quand le premier trouvait des findings.
- **Modale « Ajouter / Modifier les repos »** (hub) : ne s'ouvrait plus en vue
  workspace (une règle `display:none !important` masquait aussi les overlays) →
  overlays exclus de la règle.

---

## v1.1.0 — 2026-07-07 · Platform Concierge & Générateur de rapport

Deux nouveaux services, sans casser l'existant (tout reste en `<script src>`
statique, marche servi **et** en local `file://`).

### 🤖 Platform Concierge (nouveau service)

Assistant de livraison **conversationnel et gouverné** — futur remplaçant du
`pipeline-generator`, qui reste **intact** tant que ce service n'est pas validé.
Architecture à **2 couches** :

- **✨ Couche IA (« comprendre »)** : traduit une phrase (« livre en dev »,
  « release en prod », « bump 2.0.5 », « coupe sonar ») en intention structurée.
  Passe par un **proxy backend** (auth → token, Vault → creds **Vertex**) ;
  contrat documenté. **Fallback regex déterministe** si le proxy est absent
  (mode local) — l'IA n'est sollicitée que si le repo l'exige (chaos/hétérogénéité).
- **⚙️ Noyau déterministe (« exécuter »)**, 100 % client-side via l'API GitLab :
  détecte le contexte (flow/pilotage/chaos), lit les **3 sources de vérité**,
  vérifie les invariants (**cohérence**, **anti-fantôme**, **auto-bump**), résout
  la branche, et prépare **branche + commit atomique + MR**. **Ne merge jamais** ;
  ne touche jamais la toolchain centrale. Chaque geste produit une **attestation**
  « qui a fait quoi » (couche IA vs noyau).

Phase 1 livrée : livre dev/uat, release prod (prod-lock), bump, toggle test.
Conventions LCL isolées dans un objet `CONV` (chemins des 3 sources, cible par
flow), à ajuster à la convention réelle. `platform-concierge.html`.

### 📄 Générateur de rapport (module « Mesurer & Progresser »)

Composeur de rapport : on **glisse-dépose** les blocs voulus, on **ordonne**, on
clique, et le module produit un **rapport HTML autonome téléchargeable** construit
sur les **vraies données GitLab au moment du clic** (aperçu avant export).

- **13 blocs**, tous pré-sélectionnés par défaut + bouton « Tout / Rien » :
  identité, **DORA (4 métriques + niveaux)**, livraison, MR, issues, commits,
  contributeurs & bus factor, branches, tags/releases, **config CI/CD**,
  **gouvernance & conformité**, **feature flags**, **hygiène du dépôt**.
- Rapport **self-contained** (CSS inline, polices système, imprimable, zéro
  dépendance externe). Un bloc qui échoue s'affiche « indisponible » sans casser
  le rapport. Arbre récursif mutualisé et rafraîchi à chaque génération.
- Ajouté au hub dans le chemin **Mesurer & Progresser** (repo-aware).
  `report-builder.html`.

### 🐛 Correctifs du générateur de rapport

- **Drag & drop** bloqué au-delà de ~2 blocs (le re-render pendant le drag natif
  avortait les glissers) → re-render différé + nettoyage de fin de drag robuste.
- **Export périmé** : changer la sélection après une génération laissait l'aperçu
  et le téléchargement sur l'ancien rapport → toute modif **invalide** le rapport
  (jeton de génération) ; l'export correspond désormais **toujours** à l'écran.

---

## v1.0.1 — 2026-07-06 · Correctifs

Grande passe de revue (5 relectures croisées de tous les modules, chaque
signalement vérifié dans le code avant correction). **17 défauts de correction**
corrigés, validés en syntaxe **et** au navigateur (14 pages, zéro erreur JS
introduite). Aucune régression : les correctifs sont locaux et ciblés.

### 🐛 Calcul & métriques

| Module | Défaut | Effet | Correctif |
|---|---|---|---|
| **hub** | `syn.tags` jamais renseigné | Badge « Semantic Versioning » indébloquable, XP sous-compté (−75) | `tags` ajouté à la synthèse |
| **maturité** | Pilier data **Sécurité toujours à 0** (questions `dataOnly` X01-X05 exclues du calcul) | Carte Sécurité « non conforme » et score global amputé (~12 pts) malgré des métriques GitLab bien lues | `dataScoreForCat` inclut les questions data |
| **feature flags** | `% rollout` forcé à 100 dès qu'un flag est actif | Un rollout progressif à 25 % affiché à 100 %, classification faussée | `active` = interrupteur, pas pourcentage |
| **feature flags** | Sparkline de santé lue via `b.s` (→ NaN) | Courbe jamais tracée | Lecture de `b.score` |
| **gaming** | Taux review/MR calculés sur un échantillon de 30 mais divisés par le total | Badges de review indébloquables dès >30 MRs | Division par la taille réelle de l'échantillon |
| **insights · gaming · dora** | MTTR : pannes consécutives d'un même incident comptées plusieurs fois | Médiane MTTR biaisée vers le bas, nb d'incidents gonflé | Seule la 1ʳᵉ panne d'une série démarre le chrono |
| **daily-report** | Issues sans borne haute + « du jour » basé sur `updated_at` | Compteurs gonflés sur une date passée | Filtre sur `merged_at` / `closed_at` + borne haute |

### 🔎 Scanners & analyse

- **secrets-scanner & gouvernance-repo** : `getFileContent` utilisait `?ref=HEAD`
  (404 silencieux) → **aucun contenu lu**, 0 secret / 0 alerte supply / Maven CIS
  figées en permanence. On passe désormais la branche par défaut du repo.
- **CIS (gouvernance & secrets)** : les erreurs non-403 (404 GitLab CE, réseau)
  étaient prises pour un vrai résultat → **faux « non conforme » et faux
  « conforme »**. Elles deviennent « non vérifiable ».
- **repo-analyzer** : une réponse non-tableau (endpoint 403) faisait **planter
  toute l'analyse** ; chaque fetch de liste est coercé en tableau.
- **repo-diet** : détection des dossiers par **sous-chaîne** (`bin` matchait
  `combine.js`, `out` matchait `about.md`…) → faux positifs massifs. Match par
  segment de chemin + un fichier n'est plus compté qu'une fois.

### 🔒 Écritures GitLab & sécurité

- **branch-cleaner** : la **branche par défaut** est exclue de la suppression
  même si sa protection a été retirée (`branch.default`).
- **pipeline-generator** : les variables **sensibles étaient poussées non
  masquées** (tokens/mots de passe visibles dans les logs de jobs) → masquées ;
  `exportSecretsTemplate` plantait (`currentSecrets` inexistant) → corrigé.
- **feature flags** : annuler la confirmation prod depuis le wizard cleanup
  laissait le handler patché en place → **risque de toggle sur le mauvais flag**.
  Le handler d'origine est restauré et l'action en attente purgée.
- **mr-reviewer** : attribut `data-iid` dupliqué (coquille).

### 🔜 Identifié, non corrigé (volontairement)

- **repo-analyzer** : détection CODEOWNERS / templates MR sur un arbre non
  récursif (faux positifs) — le passage en récursif change la sémantique des
  autres détections racine, reporté.
- **insights CFR** : carte / quick-wins / score affichent 3 valeurs — c'est le
  « plancher de tendance » **voulu**, à clarifier côté UX plutôt qu'à corriger.
- Décalage de fuseau du graphe d'évolution, paginations partielles, code mort
  (hub) : mineurs / cosmétiques.

---

## v1.0.0 — 2026-07-06

Première version consolidée de la plateforme. Un ensemble de pages HTML/CSS/JS
statiques (aucun build, fonctionne servi **et** en local `file://`) est devenu
une plateforme cohérente : couche commune factorisée, moteur d'atelier connecté,
scaffolder conversationnel, fiabilité renforcée.

> Compatibilité : tout reste en `<script src>` classique et CSS statique — **pas
> de bundler, pas de module ES** — pour continuer à marcher à la fois servi (dev/
> prod GitLab) et ouvert en local (`file://`).

---

## ✨ Points forts

- **Couche commune `js/common/` + `css/theme.css`** : le code partagé vit à un
  seul endroit (utilitaires, transport GitLab, pagination, auth, design tokens).
- **Moteur d'atelier connecté** : le plan de maturité et le hub pointent vers les
  vraies pages Confluence des 205 ateliers.
- **Scaffolder « Concierge »** : un assistant conversationnel qui déduit le flow
  Git de la squad et prépare la Merge Request, à la place du formulaire.
- **Fiabilité** : plus aucune pagination GitLab non bornée (risque de boucle).
- **Gouvernance d'accès** : le Secrets Scanner n'est plus lançable en self-service.

---

## 🏗️ Couche commune (factorisation)

Le code dupliqué dans chaque page a été regroupé, sans changement de comportement
(chaque étape validée au navigateur).

| Fichier | Contenu |
|---|---|
| `js/common/utils.js` | `escapeHtml`, `escapeAttr`, `runWithConcurrency` |
| `js/common/gitlab.js` | `gitlabFetch` (retry HTTP 429), `gitlabJson`, `gitlabPaginate` |
| `js/common/auth.js` | `loadAuth`, `getRepoId` |
| `js/common/workshops.js` | référentiel des 205 ateliers ↔ liens Confluence |
| `css/theme.css` | design tokens partagés (couleurs, fonds, texte, catégories) |

- **Utilitaires JS** : `escapeHtml`/`escapeAttr` (×14, sécurité XSS) et
  `runWithConcurrency` factorisés. (~330 lignes de doublons supprimées avec le CSS.)
- **Transport GitLab** : un seul `gitlabFetch` (URL `/api/v4`, header
  `PRIVATE-TOKEN`, retry sur rate-limit 429). Chaque page garde son contrat
  d'origine (Response brute ou JSON-ou-null).
- **Design tokens** : 224 déclarations de couleurs dupliquées retirées de 18
  fichiers CSS. Rebrand = 1 ligne au lieu de 25. Zéro régression visuelle
  (valeurs calculées + diff pixel vérifiés).
- **Authentification** : lecture de l'auth GitLab et résolution du repo courant
  centralisées. **14 modules** lisent désormais l'auth via un seul fichier —
  changer le format de stockage = 1 fichier à toucher au lieu de 14.

---

## 🎓 Moteur d'atelier (maturité ↔ hub ↔ Confluence)

- **Référentiel** `workshops.js` : relie le plan de maturité (axe + niveau +
  action), le numéro d'action (#1–205) et la page Confluence. 166 actions liées,
  39 encore « à écrire » (surtout Résilience & Stabilité).
- **Maturité** : en fin d'évaluation, chaque action du plan d'accompagnement
  affiche un bouton **« 📄 Voir l'atelier »** vers sa page Confluence.
- **Hub** : le bloc « Pour aller plus loin » est désormais **piloté par les axes
  faibles** de la squad et sourcé sur le référentiel — vrais ateliers cliquables
  + conseils génériques non-cliquables. Fini les toasts « atelier à venir » : les
  22 cartes périmées (slugs désynchronisés) ont été retirées.

---

## 🛎️ Scaffolder → Concierge conversationnel

Le « Démarrer un projet » (`project-scaffolder.html`) passe d'un wizard à
formulaire à un **assistant conversationnel** :

- 5 questions concrètes (feature flags, cadence, taille d'équipe, CI…) → le noyau
  déterministe **déduit le flow Git** (Trunk / Gitflow / Feature branching) avec
  raisonnement visible et contestation possible.
- La conversation collecte ensuite la stack et Docker, montre le périmètre
  d'exécution, puis lance le **moteur réel** (écriture des fichiers, branches,
  protections, ouverture de la Merge Request — le merge reste le geste humain).
- Look adapté aux design tokens de la plateforme, bouton retour au hub, mode
  expert (mémoire du contexte).

---

## 🔒 Gouvernance & accès

- **Secrets Scanner réservé** : l'outil qui balaie *tous* les repos accessibles
  n'est plus lançable par les équipes depuis le hub (carte grisée, badge
  « réservé », clic bloqué avec explication). Le Security Scanner (conformité
  CIS) reste, lui, accessible.

---

## 🛡️ Fiabilité

- **Pagination GitLab bornée partout** : `gitlabPaginate` (cap 50 pages,
  `per_page` auto, arrêt sur page vide/partielle) remplace 8 paginations locales,
  dont deux `while(true)` sans garde-fou (hub, dora-workspace). Les paginations
  inline restantes (gouvernance-repo, secrets-scanner) ont reçu un cap défensif.
  → Plus aucune boucle de pagination non bornée dans le code vivant.

---

## 🧭 Divers

- **Renommage** `hub-mockup-v2_1.html` → **`hub.html`** (41 références mises à
  jour : liens retour, constantes, redirections).
- Structure du dépôt normalisée : pages HTML à la racine, `css/` et `js/` (dont
  `js/common/`).

---

## 🔜 Suite possible

- Rédiger les **39 pages Confluence** d'ateliers manquantes (axes Résilience &
  Stabilité surtout).
- Migrer les derniers modules « tout inline » (`pipeline-generator`,
  `repo-analyzer`, `gouvernance-repo`, `secrets-scanner`) vers la couche commune
  (auth, `gitlabJson`).
- Verrou côté page pour le Secrets Scanner (l'URL directe reste atteignable).
- Filtrage par chemin des ateliers recommandés du hub (aujourd'hui globaux).
