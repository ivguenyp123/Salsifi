# EPIC — Repo Analyzer « mode bac » : santé dans le temps, vue org & scans planifiés

> Architecture, auth, sécurité et référentiels communs. Les US (`US-analyzer-bac.md`)
> ne répètent pas ça. **Socle sécurité/intégrité : réutilise `../dora/EPIC-dora-bac.md` §3.**
> Maquette de référence : `analyzer-bac.html` (même dossier).

## 1. Vision

Le module actuel fait une **analyse en profondeur, instantanée, d'UN repo** : scores de conformité,
red flags, quick wins, bus factor, activité, CI/CD. Mais chaque analyse repart de zéro et ne voit
qu'un repo. Le bac ajoute la **durée et l'échelle** : suivre la **santé dans le temps** (par repo),
une **vue org multi-repos** (comparer, classer les plus fragiles, agréger par squad), des **scans
planifiés** (ré-analyse nocturne) et des **alertes de régression** (score qui chute, nouveau red
flag, bus factor qui tombe à 1).

## 2. Architecture & auth

- **Front** : le module (navigateur) analyse GitLab avec le **token utilisateur** et calcule score,
  red flags, bus factor (déjà le cas). Il **pousse un snapshot de santé** au bac.
- **Bac** : FastAPI + MongoDB qui **persiste, agrège, planifie, alerte**.
- **Modèle « historien »** : aucun token utilisateur stocké ; identité validée en direct, **vérif
  d'accès au repo** avant toute opération.
- **Scans hors-ligne** (nocturnes, alertes org) : **job** avec **compte de service** (token en
  **Vault**) qui ré-analyse et pousse des snapshots ; alertes via **l'API d'envoi existante** (mail/Teams).

## 3. Socle sécurité & intégrité

Identique à `../dora/EPIC-dora-bac.md` §3, avec ces spécificités Repo Analyzer :
- **Provenance** sur chaque snapshot : `gitlab_instance, repo_id, calculation_version,
  source_counts{branches,commits,mrs,pipelines,contributors}, calculated_by, received_at`.
- **Clé d'unicité** `(gitlab_instance, repo_id, at, calculation_version)`.
- **Snapshot calculé côté client = input non fiable** : le bac stampe la provenance, ne recalcule pas à l'aveugle.
- **RBAC** : `viewer` lit · `contributor` déclenche une analyse · `lead` configure scans & alertes d'une squad · `manager` voit la vue org/direction · `admin` gère les référentiels. `403` sinon.
- **Vue org bornée par les accès** : un utilisateur ne voit dans l'agrégat que les repos auxquels il a accès.
- **Audit** : config de scan, alerte, snapshot rejeté tracés.

## 4. Référentiel — endpoints GitLab (analyse, token front / service)

| Donnée | Endpoint | Sert |
|---|---|---|
| Branches (+ protection) | `.../repository/branches` · `.../protected_branches` | âge branches, conformité |
| Commits / contributeurs | `.../repository/commits` · `.../repository/contributors` | activité, bus factor |
| MR | `GET /projects/:id/merge_requests` | fluidité review |
| Pipelines / jobs | `.../pipelines` · `.../jobs` | taux succès CI, modules instables |
| Déploiements | `.../deployments` | fiabilité déploiement |
| Arbre / labels / projet | `.../repository/tree` · `.../labels` · `GET /projects/:id` | red flags, méta |
| Auth/accès | `GET /user` · `GET /projects/:id` | identité + accès |

## 5. Référentiel — API bac (FastAPI `/api/v1`)

```
POST /repo-health/snapshots            GET /repo-health/snapshots?repo_id=&period=
GET  /repo-health/{repo_id}/trajectory?period=
GET  /orgs/{org_id}/repo-health        GET /teams/{team_id}/repo-health
POST /repo-health/scan-schedule        GET /repo-health/scan-target   (job hors-ligne)
POST /repo-health/alerts               (job → API d'envoi mail/Teams)
```
En-têtes communs : `Authorization`, `X-GitLab-URL`, `Idempotency-Key`.

## 6. Référentiel — collections MongoDB

`repo_health_snapshots` (unique `(instance,repo_id,at,calculation_version)`) ·
`scan_schedules` · `regression_alerts` · `rbac` · `audit_log`.

## 7. Règles produit transverses

- **Période** `30/90/180 j` pilote la trajectoire **et** la fenêtre de comparaison.
- **Vue org** classée du plus fragile au plus sain ; **bus factor 1** = critique (savoir mono-porteur).
- **Alerte = régression** : on n'alerte que sur une dégradation (score, red flag, bus factor), pas à chaque scan.

## 8. Index des US

| # | US | Besoin |
|---|---|---|
| 01 | Snapshots de santé persistés | persistance + provenance |
| 02 | Trajectoire de santé | série score par période |
| 03 | Vue org multi-repos | agrégation + RBAC |
| 04 | Scans planifiés | scheduler hors-ligne |
| 05 | Alertes de régression | notif dégradation |
| 06 | Socle sécurité transversal | fondation |
