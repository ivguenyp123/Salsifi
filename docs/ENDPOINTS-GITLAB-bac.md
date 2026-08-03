# Endpoints GitLab & données récupérées — modules « bac »

> Pour **chaque module bac**, la liste des endpoints GitLab REST **réellement appelés dans le code**
> (`js/modules/<module>/`), les **champs de la réponse effectivement lus** et **à quoi ils servent**.
> Établi à partir du code (`data.js` / `compute.js` / `render.js` / `state.js`), croisé avec la
> section « 4. Référentiel — endpoints GitLab » de chaque EPIC.
>
> Un endpoint listé dans l'EPIC mais absent du code est marqué **(spec, non appelé)**.
>
> **Auth (commune)** : token utilisateur GitLab (jamais stocké côté bac), chargé depuis le hub
> (`window.Salsifi.loadAuth` → `localStorage['devops_hub_workspaces']`) et injecté par
> `window.Salsifi.gitlabFetch` / `gitlabPaginate` (header `Authorization: Bearer` ou `PRIVATE-TOKEN`,
> retry automatique sur HTTP 429).

**Modules couverts :** [Assessment](#-assessment-maturité) · [Analyzer](#-analyzer-santé-du-dépôt) · [DORA](#-dora) · [Daily report](#-daily-report-rapport-quotidien) · [Secrets scanner](#-secrets-scanner-détection-de-secrets) · [Feature flags](#-feature-flag-manager-gestion-des-feature-flags) · [Achievements](#-achievements-gamification)

---

## 🧭 Assessment (maturité)

_Auth : token GitLab + URL chargés depuis le hub (`window.Salsifi.loadAuth` → `localStorage devops_hub_workspaces` / fallback `sessionStorage`), `PROJECT_ID` depuis `hub_selected_repo_id` ; guard strict au chargement (`initAuth` → redirect `login.html` si token/url/projet absents). Aucun `GET /user` ni vérif d'accès explicite dans le module ; token jamais exporté (l'export JSON ne contient que réponses + métadonnées)._

| Endpoint (méthode + chemin + params) | Données lues (champs de la réponse) | Utilisé pour |
|---|---|---|
| `GET /projects/:id` | `default_branch`, `merge_requests_author_approval`, `merge_requests_disable_committers_approval`, `reset_approvals_on_push` | Détection branche par défaut (utilisée partout) + gouvernance/sécurité : `sec_author_approval`, `sec_committer_approval`, `sec_reset_approvals` |
| `GET /projects/:id/pipelines?per_page=100&updated_after=<now-90j ISO>` | `status`, `created_at`, `ref`, `duration`, `id` | Delivery/Stabilité/Résilience : `deploy_freq`, `pipeline_ok`, `deploy_main` (vs `default_branch`), `fail_rate`, `pipeline_duration`, `fail_streak`, `trend`, `recovery_time` ; `id[0]` sert de dernier pipeline pour les jobs |
| `GET /projects/:id/merge_requests?state=merged&per_page=100&order_by=created_at&sort=desc&updated_after=<now-90j ISO>` | `created_at`, `merged_at`, `user_notes_count`, `merged_by.id`, `iid` | Qualité/Résilience : `review_time`, `discussions_mr`, `mr_no_approval`, `reviewer_diversity` (mergers distincts) ; `iid` → fetch changes pour `mr_size` |
| `GET /projects/:id/merge_requests?state=opened&per_page=100` | `created_at` | Hygiène : `zombie_mrs` (MR ouvertes > 7 j) |
| `GET /projects/:id/merge_requests/:iid/changes` (20 MR mergées, concurrence cappée) | `changes` (longueur du tableau) | Qualité : `mr_size` (nb moyen de fichiers/MR) |
| `GET /projects/:id/repository/branches?per_page=100` | `name`, `commit.committed_date`, `commit.created_at` | Hygiène : `stale_branches` (branches ≠ default sans commit > 30 j) |
| `GET /projects/:id/protected_branches` | `name`, `allow_force_push` | Hygiène/Sécurité : `branch_protection`, `sec_branch_protected`, `sec_force_push` (sur la branche par défaut) |
| `GET /projects/:id/approval_rules` | `approvals_required` | Qualité : `approval_rules` (max approbateurs requis) — le code appelle `/approval_rules`, pas `/approvals` de la spec |
| `GET /projects/:id/repository/tree?per_page=100` | `name` | Hygiène : `std_files` (README/.gitignore/CHANGELOG), `lock_files`, `ci_versioned` (.gitlab-ci.yml), présence `pom.xml` (déclenche le fetch Maven) |
| `GET /projects/:id/repository/contributors?per_page=100` | `commits` | Résilience : `bus_factor` (contributeurs actifs), `commit_concentration` (part du top contributeur) |
| `GET /projects/:id/repository/commits?per_page=100&since=<now-90j ISO>` | `created_at` | Résilience : `commit_regularity` (plus long gap entre 2 commits) |
| `GET /projects/:id/variables` | `key`, `masked` | Pratiques : `feature_flags` (clés contenant flag/feature/toggle), `zombie_flags` (flags non masqués) |
| `GET /projects/:id/releases?per_page=20` | `released_at`, `created_at` | Delivery : `releases` (releases sur 90 j) |
| `GET /projects/:id/pipelines/:pipelineId/jobs` (dernier pipeline) | `stage` | Pratiques : `pipeline_stages` (présence stages test / lint-quality / secur-sast-scan) |
| `GET /projects/:id/repository/files/pom.xml/raw?ref=<default_branch>` (RAW, si `pom.xml` présent) | corps texte brut (regex `/SNAPSHOT/gi`) | Pratiques : `maven_versions` (nombre de dépendances SNAPSHOT) |
| `GET /projects/:id/deployments` | — | (spec, non appelé — le module dérive les déploiements des pipelines) |
| `GET /projects/:id/approvals` | — | (spec, non appelé — remplacé par `/approval_rules` + les champs `merge_requests_*_approval` de `GET /projects/:id`) |
| `GET /user` | — | (spec, non appelé — l'auth se fait via le storage du hub) |

> Toutes les fenêtres temporelles sont calculées côté client à partir de `now` (`updated_after`/`since` = now − 90 j) ; les scores 7 j / 4 sem sont filtrés en mémoire. `compute.js` ne fait aucun appel réseau (il agrège les scores déjà remplis par `fetchAllMetrics`).

---

## 🔍 Analyzer (santé du dépôt)

_Auth : token utilisateur GitLab (`auth.token` + `auth.gitlabUrl` via `window.Salsifi.loadAuth`), passé à chaque requête par `window.Salsifi.gitlabFetch` (retry auto sur HTTP 429) ; l'accès est validé en amont par un `GET /projects/:id` (index.js) avant l'analyse._

| Endpoint (méthode + chemin + params) | Données lues (champs de la réponse) | Utilisé pour |
|---|---|---|
| `GET /projects/:id/repository/branches?per_page=100` | `name`, `commit.committed_date` | Détection du flow (develop/dev → gitflow) ; red flags branches mortes (>90j), stale (30-90j), actives (<7j), main non protégée, naming convention |
| `GET /projects/:id/protected_branches` | `name` | Red flag « branche main/master non protégée » (sécurité critique) |
| `GET /projects/:id/repository/contributors?per_page=100` | `commits`, `name` | Bus factor (part du top contributeur) ; seuils quick-wins CONTRIBUTING / CODEOWNERS |
| `GET /projects/:id/repository/commits?per_page=100&since=<J-90 ISO>` | `title`, `committed_date` | Health score (absence de commits = -40) ; Conventional Commits ; work-life balance (commits soir/weekend) |
| `GET /projects/:id/merge_requests?state=all&per_page=100` | `state`, `created_at`, `iid`, `web_url`, `has_conflicts`, `reviewers`, `description`, `labels`, `upvotes` | Score MR + health score (MRs ouvertes ≥10) ; red flags : abandonnées >30j, >7j, conflits, sans reviewer/description/labels, mergées sans approval (`upvotes===0`) |
| `GET /projects/:id` | `web_url`, `name` | URLs d'action des quick-wins ; validation d'accès + affichage du repo |
| `GET /projects/:id/repository/tree?recursive=true&per_page=100&page=N` (paginé, cap 20 pages) | `path`, `name` | Red flags fichiers manquants : `.gitlab-ci.yml`, README, CONTRIBUTING, `.gitignore` (racine), CODEOWNERS et templates MR (chemins `.gitlab/…`) |
| `GET /projects/:id/labels?per_page=100` | `length` uniquement | Red flags « labels non définis » et labellisation des MRs |
| `GET /projects/:id/pipelines?per_page=100` | `status`, `id` | Red flag CI/CD absent (aucun pipeline) et pipelines en échec (`status==='failed'` ≥30%) |
| `GET /projects/:id/jobs?scope[]=failed&per_page=100` | (aucun — stocké dans `analysisData.failedJobs`, non consommé) | Récupéré (au sens du spec) mais pas exploité dans le calcul actuel |
| `GET /projects/:id/deployments?per_page=100` | (aucun — stocké dans `analysisData.deployments`, non consommé) | Récupéré (au sens du spec) mais pas exploité dans le calcul actuel |
| `GET /user` | — | (spec, non appelé — l'identité/accès est validée via `GET /projects/:id`) |

---

## 📈 DORA

_Auth : token utilisateur GitLab passé à `window.Salsifi.gitlabFetch(GITLAB_URL, token, endpoint)` (Bearer + `X-GitLab-URL`) ; `gitlabPaginate` pour les listes. Le module ne fait pas `GET /user` lui-même._

| Endpoint (méthode + chemin + params) | Données lues (champs de la réponse) | Métrique / event DORA |
|---|---|---|
| `GET /projects/:id` | `default_branch` (fallback `repo.defaultBranch`/`main`) | Pré-requis : résout les branches « prod » (`resolveProdBranches`) filtrant pipelines & MTTR |
| `GET /projects/:id/pipelines?per_page=100&created_after=:since&created_before=:until` (paginé) | `ref`, `sha`, `status` (`success`/`failed`), `created_at` | **DF** (success/jours ×7), **CFR** (failed/total ×100, dédup par `sha`), **MTTR** (séries failed→success sur même `ref`, médiane des durées) |
| `GET /projects/:id/merge_requests?state=merged&per_page=100&updated_after=:since` (paginé) | `merged_at`, `first_commit_at` (fallback `created_at`) | **Lead Time** (médiane `merged_at − first_commit_at`) + event « revue » |
| `GET /projects/:id/deployments?environment=production` | — | (spec, non appelé — les déploiements sont déduits des pipelines `success`) |
| `GET /projects/:id/pipelines?ref=:default` (+ `GET /pipelines/:pid`) | — | (spec, non appelé — tous les pipelines récupérés puis `ref` filtré en mémoire) |
| `GET /projects/:id/merge_requests/:iid/commits` | — | (spec, non appelé — le code utilise le champ `first_commit_at` du MR) |
| `GET /projects/:id/issues?labels=incident` | — | (spec, non appelé — aucun appel issues) |
| `GET /projects/:id/repository/commits?path=.gitlab-ci.yml` | — | (spec, non appelé — aucun appel commits) event « conf » |
| `GET /user` | — | (spec, non appelé ici — géré en amont) |

> Le calcul MTTR/CFR repose entièrement sur les pipelines (pas de `/deployments` ni `/pipelines/:pid`), et le Lead Time sur le champ `first_commit_at` du MR (pas de `/:iid/commits`). Le module **pousse** ensuite un snapshot au bac (FastAPI/MongoDB) — hors périmètre GitLab.

---

## 📰 Daily report (rapport quotidien)

_Auth : token utilisateur GitLab chargé via `window.Salsifi.loadAuth` (localStorage `devops_hub_workspaces` → `TOKEN`, `GITLAB_URL`, `PROJECT_ID`) et injecté par `window.Salsifi.gitlabFetch` (retry 429) ; aucun appel `GET /user` ni `GET /projects/:id` dans le module._

| Endpoint (méthode + chemin + params) | Données lues (champs de la réponse) | Utilisé pour |
|---|---|---|
| `GET /projects/:id/pipelines?per_page=100&updated_after=&updated_before=` | `id`, `status`, `duration`, `updated_at`, `web_url`, `ref`, `source`, `coverage` | Stats globales, pipelines en échec, pipelines longs, timeline, tendances |
| `GET /projects/:id/merge_requests?state=merged&per_page=100&updated_after=&updated_before=` | `merged_at` (re-filtré client), `iid`, `title`, `web_url`, `author.name`, `target_branch`, `created_at` | Section MRs mergées, stats, timeline, reverts, reviews |
| `GET /projects/:id/merge_requests?state=opened&per_page=50` | `created_at`, `iid`, `title`, `web_url`, `author.name` | Section MRs ouvertes (âge d'attente), reviews |
| `GET /projects/:id/merge_requests?state=closed&per_page=100&updated_after=&updated_before=` | `iid`, `title`, `web_url`, `author.name` | Section MRs refusées/fermées |
| `GET /projects/:id/deployments?per_page=50&updated_after=&updated_before=` | `status`, `ref`, `environment.name`, `user.name`, `updated_at` | Section Déploiements, stats, timeline |
| `GET /projects/:id/repository/tags?per_page=50` | `name`, `message`, `commit.title`, `commit.created_at` (filtre date client) | Section Releases/Tags, stats, timeline |
| `GET /projects/:id/repository/branches?per_page=100` | `name`, `merged`, `commit` (dates) | Section Branches, branches à risque |
| `GET /projects/:id/issues?state=:state&per_page=50&{created\|updated}_after=&..._before=` | `closed_at` (re-filtré si `closed`), `iid`, `title`, `state`, `author.name`, `labels`, `updated_at` | Section Issues (ouvertes/fermées) |
| `GET /projects/:id/repository/commits?per_page=100&since=&until=` | `id`, `title`, `message`, `author_name`, `created_at` | Stats, timeline, détection fix/revert, gros commits, code quality |
| `GET /projects/:id/issues?labels=bug&updated_after=&updated_before=&per_page=20` | `title`, `iid`, `state`, `author.name`, `updated_at` | Section Bugs (issues labellisées `bug`) |
| `GET /projects/:id/repository/commits/:sha/diff` | longueur du tableau (nb fichiers modifiés) | Bugs / gros commits à risque (>10 fichiers) |
| `GET /projects/:id/pipelines/:pipeline_id/jobs` | `name`, `status`, `duration` | Coverage, Tests, Code quality (jobs sonar/lint/quality) |
| `GET /projects/:id/vulnerability_findings?per_page=10` | `name`, `title`, `severity`, `scanner` | Section Sécurité |
| `GET /projects/:id/merge_requests/:iid/notes?per_page=20` | `created_at`, `system` (filtre), `author`, `body` | Section Reviews (commentaires du jour) |
| `GET /user` · `GET /projects/:id` | — | (spec, non appelé) — auth/identité + vérif d'accès |

> `pipelines`, `deployments`, `merged`, `closed`, `issues` sont bornés côté serveur (`updated_after`/`updated_before`) ; `tags` et `branches` (pas de filtre date API) sont filtrés côté client sur `commit.created_at`.

---

## 🔐 Secrets scanner (détection de secrets)

_Auth : header `PRIVATE-TOKEN: <token utilisateur>` (lu du hub via `localStorage['devops_hub_workspaces']`, jamais via un appel `GET /user`) sur `${GITLAB_URL}/api/v4`._

| Endpoint (méthode + chemin + params) | Données lues (champs de la réponse) | Utilisé pour |
|---|---|---|
| `GET /projects?membership=true&simple=true&archived=false&per_page=100&pagination=keyset&order_by=id&sort=asc` | `id`, `name`, `path_with_namespace`, `web_url`, `default_branch` ; header `Link` (keyset) | Énumérer tous les repos accessibles (repos vides ignorés) — base de tous les scans |
| `GET /projects/:id/repository/tree?recursive=true&per_page=100&page=N` | `path` | Lister les fichiers (surface, supply-chain, CIS) — filtrés par `isSuspectFile`/`supplyEco` |
| `GET /projects/:id/repository/files/:path?ref=<branche>` (métadonnées, pas `/raw`) | `content` (base64, décodé via `atob`) | Récupérer le contenu d'un fichier suspect / manifeste → détection secrets & supply-chain |
| `GET /projects/:id/repository/commits?all=true&per_page=100&since=<ISO>&page=N` | `id` (SHA) | Lister les SHAs (toutes branches, incrémental) — mode Historique |
| `GET /projects/:id/repository/commits/:sha/diff?per_page=100` | `new_path`, `old_path`, `diff` | Scanner les lignes **ajoutées** (`+`) des diffs pour secrets — mode Historique |
| `GET /projects/:id` | `default_branch`, `web_url`, `visibility`, `merge_method`, `archived`, `last_activity_at` | CIS : config projet (historique linéaire, inactivité…) |
| `GET /projects/:id/protected_branches` | `name`, `allow_force_push` | CIS 1.1.1 — branche par défaut protégée / force-push interdit |
| `GET /projects/:id/approvals` | `approvals_before_merge`, `merge_requests_author_approval`, `merge_requests_disable_committers_approval`, `disable_overriding_approvers_per_merge_request`, `reset_approvals_on_push` | CIS 1.1.4 — durcissement des règles d'approbation |
| `GET /projects/:id/members/all?per_page=100` | `access_level` (≥40) | CIS 1.3.7 — au moins 2 mainteneurs/owners |
| `GET /projects/:id/hooks` | `url`, `token` | CIS 1.4.4 — webhooks en HTTPS + token présent |
| `GET /projects/:id/merge_requests?state=opened&source_branch=<branche>` | `source_branch`, `web_url` | Idempotence : détecter une MR de rapport déjà ouverte |
| `GET /projects/:id/repository/branches/:branch` | `name` | Détecter une branche de rapport résiduelle |
| `POST /projects/:id/repository/branches?branch=<MR_BRANCH>&ref=<default>` | `status`, `message` | Créer la branche de rapport (`security-scan/report` / CIS) |
| `DELETE /projects/:id/repository/branches/:branch` | `status` (404 = déjà absente) | Supprimer la branche résiduelle avant recréation |
| `POST /projects/:id/repository/commits` (body : `branch`, `commit_message`, `actions[]`) | `ok`, `status`, `message` | Poser le fichier de rapport (`SECURITY-SCAN.md` / `SECURITY-CIS.md` + fixs CIS) |
| `POST /projects/:id/merge_requests` (body : `source_branch`, `target_branch`, `title`, `description`, `remove_source_branch`) | `web_url`, `message` | Créer la MR **proposition** de rapport (jamais mergée) |
| `GET /user` | — | (spec, non appelé — auth lue du localStorage du hub) |
| `.../files/:path/raw` | — | (spec, non appelé — endpoint métadonnées Files + champ `content` base64 utilisés à la place) |
| OSV.dev (modes Découverte / Blast Radius) | — | (spec, non appelé — aucun appel OSV/externe dans le code) |

---

## 🚩 Feature flag manager (gestion des feature flags)

_Auth : token utilisateur GitLab passé en header `PRIVATE-TOKEN` (directement ou via `window.Salsifi.gitlabFetch/gitlabPaginate`), aucun token stocké ; le contrôle RBAC `/user` est désactivé (commenté dans le code)._

| Endpoint (méthode + chemin + params) | Données lues / envoyées (champs) | Utilisé pour |
|---|---|---|
| `GET /projects/:id/feature_flags?per_page=100` (repagine si 100 résultats) | Lit : `name`, `created_at`, `updated_at`, `active`, `strategies[].name`, `strategies[].parameters.percentage`, `strategies[].scopes[].environment_scope` | Lister/inventorier les flags puis les analyser (statut, rollout %, dette, familles) |
| `POST /projects/:id/feature_flags` | Envoie : `name`, `description`, `version:'new_version_flag'`, `active:false`, `strategies:[{name:'default', parameters:{}, scopes:[{environment_scope}]}]` ; lit `message`/`error` | Créer un flag (wizard, OFF par défaut ; scopes dev/staging/production ou `*`) |
| `PUT /projects/:id/feature_flags/:name` | Envoie : `{ active: <bool> }` ; lit `message` sur erreur | Basculer ON/OFF — sert aussi de « cleanup » (OFF), pas de DELETE |
| `GET /projects/:id/audit_events?per_page=100&page=N` (max 5 pages) | Lit : `created_at`, `details.target_type` (filtre `Operations::FeatureFlag`), `details.target_details`, `details.custom_message`, `details.change` | Historique/journal, timeline suppressions, estimation « depuis quand en prod / à 100% » |
| `GET /projects/:id/repository/files/:path?ref=main` | Lit : `content` (base64, décodé via `atob`) | Détecter le fichier client FF et en extraire les flags existants |
| `POST /projects/:id/repository/branches` | Envoie : `{ branch, ref:'main' }` | Créer la branche pour la MR du fichier client |
| `POST` (nouveau) / `PUT` (existant) `/projects/:id/repository/files/:path` | Envoie : `{ branch, content, commit_message }` ; lit `message` sur erreur | Créer/mettre à jour le fichier client Unleash/typé |
| `POST /projects/:id/merge_requests` | Envoie : `source_branch`, `target_branch:'main'`, `title`, `description`, `remove_source_branch:true` ; lit `web_url`, `iid` | Ouvrir la MR d'ajout du flag au fichier client |
| `GET /projects/:id/variables/SALSIFI_FF_GROUPS` | Lit : `value` (JSON des groupes) ; distingue 200/404/403 | Charger les groupes manuels partagés (rôle Maintainer) |
| `PUT /projects/:id/variables/SALSIFI_FF_GROUPS` | Envoie : `{ value }` | Sauvegarder (débouncé) les groupes manuels partagés |
| `POST /projects/:id/variables` | Envoie : `{ key:'SALSIFI_FF_GROUPS', value, masked:false, protected:false }` | Créer la variable de groupes si absente (fallback après 404 du PUT) |
| `GET /projects/:id/feature_flags/:name` | — | (spec, non appelé) |
| `DELETE /projects/:id/feature_flags/:name` | — | (spec, non appelé — le nettoyage se fait via `PUT active:false`) |
| `GET/POST /projects/:id/feature_flags_user_lists` | — | (spec, non appelé) |
| `GET /user` · `GET /projects/:id` | — | (spec, non appelé — RBAC via `/user` désactivé) |

---

## 🏆 Achievements (gamification)

_Auth : header `PRIVATE-TOKEN: <token>` (token + `gitlabUrl` chargés de l'auth hub `Salsifi.loadAuth`) ; lecture via `gitlabFetch`/`gitlabPaginate` (pagination auto, garde-fou 50 pages)._

| Endpoint (méthode + chemin + params) | Données lues (champs de la réponse) | Utilisé pour |
|---|---|---|
| `GET /projects/:id` | `default_branch`, `reset_approvals_on_push` | Ref de fenêtre pour les autres loaders ; badge « reset approvals on push » |
| `GET /projects/:id/pipelines?updated_after=<ISO 30j>` (paginé) | `id`, `status`, `sha`, `ref`, `created_at` | successRate, weeklyDeploys, noFailedWeek, maxFailedStreak, MTTR, deploysFromMain, totalDeploys, trendUp |
| `GET /projects/:id/pipelines/:pipeline_id` (20 succès récents) | `duration` | avgPipelineTime (durée pipeline) |
| `GET /projects/:id/merge_requests?state=merged&updated_after=<ISO 30j>` (paginé) | `iid`, `author.id`, `created_at`, `merged_at`, `source_branch` | Échantillon MR (30), avgMRCycleTime, détection branches orphelines |
| `GET /projects/:id/merge_requests/:iid` | `changes_count` | avgMRSize (qualité MR) |
| `GET /projects/:id/merge_requests/:iid/changes` | `changes[].length` | avgMRFiles (taille MR) |
| `GET /projects/:id/merge_requests/:iid/approvals` | `approved_by[].user.id` / `.username` | reviewedMRRate, distinctReviewers, mrWithoutApproval |
| `GET /projects/:id/merge_requests/:iid/notes?sort=asc&order_by=created_at` (paginé) | `system`, `author.id`, `created_at` | avgCommentsPerMR, avgReviewTime (médiane) |
| `GET /projects/:id/merge_requests?state=opened` (paginé) | `created_at` | zombieMRs (MR ouvertes > 7 j) |
| `GET /projects/:id/repository/branches` (paginé) | `name`, `commit.committed_date` / `.created_at` | staleBranches (hygiène branches) |
| `GET /projects/:id/repository/tags` (paginé) | `name`, `commit.committed_date` / `.created_at` | hasSemverTags, taggedReleasesMonth |
| `GET /projects/:id/repository/tree?recursive=true` (paginé) | `path`, `name` | essential_files (README/.gitignore/CHANGELOG), lock_files_present, présence `.gitlab-ci.yml`, ci_versioned |
| `GET /projects/:id/repository/files/.gitlab-ci.yml?ref=<branch>` | `content` (base64, décodé) | Contenu YAML CI envoyé à `/ci/lint` |
| `POST /projects/:id/ci/lint` (body `{content}`) | `stages`, `jobs[].stage`, `jobs[].name`, `jobs[].environment(.name)` | pipelineStages, multi_stage_pipeline, automated_tests, hasDeployStage, hasRollbackJob, hasEnvSeparation |
| `GET /projects/:id/protected_branches` (paginé) | `name`, `allow_force_push` | branch_protection, forcePushBlocked |
| `GET /projects/:id/approval_rules` (paginé) | `rule_type`, `approvals_required` | approvalRulesOk (≥ 2 approbateurs) |
| `GET /projects/:id/repository/contributors` (paginé) | `commits` | activeContributors, topContributorShare (bus factor) |
| `GET /projects/:id/repository/commits?since=<ISO 30j>` (paginé) | `created_at` / `committed_date` | maxCommitGap (régularité) |
| `GET /projects/:id/feature_flags` | longueur du tableau | hasFeatureFlags, featureFlagsCount (Premium+, 403/404 toléré) |
| `POST /projects/:id/repository/branches` · `POST /projects/:id/repository/commits` · `POST /projects/:id/merge_requests` | `web_url` de la MR créée | Action « quick-fix » de remédiation (branche + commit fichier essentiel + MR) |
| `.../deployments` | — | (spec, non appelé — déploiements dérivés des pipelines `status=success`) |
| `.../jobs` | — | (spec, non appelé — jobs lus via `/ci/lint`) |
| `GET /user` | — | (spec, non appelé — auth/identité gérées en amont par le hub) |

---

### Notes transverses

- **Un même chemin, plusieurs appels** : certains modules appellent le même endpoint avec des `state`/bornes différents (ex. `merge_requests` merged/opened/closed dans Daily report) — comptés comme des appels distincts.
- **`GET /user`** apparaît dans presque tous les EPIC comme brique d'identité, mais **aucun module front ne l'appelle** : l'auth est résolue en amont par le hub (`Salsifi.loadAuth`) à partir du storage navigateur.
- **Écritures** : seuls Feature flags, Secrets scanner et Achievements écrivent (POST/PUT/DELETE) — création de branches, commits et MR de proposition, jamais de merge automatique.
- **Champs non lus** : quand une cellule indique une longueur de tableau (`length`) ou « aucun champ consommé », le code ne lit pas le détail des objets renvoyés.
