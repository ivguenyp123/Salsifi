# Salsifi — DevOps Hub · Notes de version

## v1.5.0 — 2026-07-20 · Salsi, résumé d'analyse à la demande (hub)

On entre sur le hub **normalement** (aucune popup à l'arrivée). Le bouton **🌱 Salsi**
du header ouvre Salsi **quand on veut** : il fait le **résumé des modules d'un repo**
et affiche ses **5 priorités**. 100 % déterministe, aucune IA.

- **À la demande, pas d'auto-popup** : le repo se choisit *après*, dans le hub. Salsi
  cible le **repo sélectionné** (sinon le mieux suivi) et n'en présume aucun de force.
- **Axe analyse, pas seulement les reculs** : le résumé mêle l'état ET les mouvements —
  métriques DORA faibles (Low/Medium/High) **à pousser**, paliers **retombés**, niveau
  global en baisse, **badges perdus / à décrocher**. Un item par sujet (une métrique
  faible *et* en recul → une seule ligne, la plus forte).
- **Top 5 priorisé** : classé par gravité (recul récent > état faible), chaque point
  **cliquable** vers le bon module.
- **Honnête à l'échelle** : même avec 1000 repos accessibles, Salsi n'analyse que les
  **repos que tu suis** (ceux qui ont des mesures : compagnons DORA/gaming en
  localStorage) ; il ne prétend jamais avoir scanné tout le parc.
- **États clairs** : rien de suivi → « choisis un repo, je te fais le résumé » ; repo
  au propre → « rien de prioritaire, beau boulot ».
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
