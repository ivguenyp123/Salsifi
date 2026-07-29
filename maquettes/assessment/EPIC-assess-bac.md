# EPIC — Assessment (Maturité DevOps) « mode bac » : trajectoire, agrégation & suivi

> Architecture, auth, sécurité et référentiels communs. Les US (`US-assess-bac.md`)
> ne répètent pas ça. **Socle sécurité/intégrité : réutilise `../dora/EPIC-dora-bac.md` §3.**
> Maquette de référence : `assess-bac.html` (même dossier).

## 1. Vision

Le module actuel fait une **évaluation instantanée** : 38 questions / 8 axes, confrontées aux
données GitLab, score /100 + radar + plan d'accompagnement, sauvegardée en JSON local.
Le bac le fait passer à un **pilotage dans le temps** : conserver chaque évaluation, tracer la
**trajectoire de maturité**, **agréger** par squad → tribu → direction, **rappeler** la
ré-évaluation, **partager** un résultat et **suivre le plan d'action** jusqu'à vérification.

## 2. Architecture & auth

- **Front** : le module (navigateur) fait passer le questionnaire, lit GitLab avec le **token
  utilisateur** pour la confrontation, calcule le score, puis **pousse un snapshot d'évaluation**
  au bac. **Bac** : FastAPI + MongoDB qui **persiste, agrège, rappelle, partage**.
- **Modèle « historien »** (identique DORA) : le bac ne parle jamais à GitLab avec un token
  utilisateur et **n'en stocke aucun**. Identité validée en direct (`GET /user`), **vérif d'accès
  au repo** avant toute opération, puis jetée.
- **Frontière de confiance** ⚠️ : le score + la confrontation sont **calculés côté client → input
  non fiable**. Le bac stampe la **provenance** (voir §3) et ne recalcule pas à l'aveugle.
- **Jobs hors-ligne** (rappels de ré-évaluation, alertes de régression, agrégats direction) :
  **webhooks** signés ou **compte de service** dont le token vit dans **Vault**.

## 3. Socle sécurité & intégrité

Identique à `../dora/EPIC-dora-bac.md` §3, avec ces spécificités Assessment :
- **Provenance** sur chaque évaluation : `gitlab_instance, repo_id, squad_id, calculation_version,
  answers_hash, source_counts{...}, submitted_by, received_at`.
- **Clé d'unicité** `(gitlab_instance, repo_id, squad_id, assessed_at, calculation_version)`.
- **RBAC** : `viewer` lit · `contributor` évalue & crée un plan · `lead` valide/partage au niveau
  squad · `manager` voit la tribu/direction · `admin` gère les référentiels. `403` sinon.
- **Partage** = jeton de lecture à portée limitée (squad/tribu), révocable, tracé — jamais un token GitLab.
- **Versionnage** du **référentiel de questions** (`questionnaire_version`) : comparer deux
  évaluations exige la même version (ou une table de correspondance).

## 4. Référentiel — endpoints GitLab (confrontation, token front)

| Donnée | Endpoint | Sert (axe) |
|---|---|---|
| Déploiements | `GET /projects/:id/deployments` | Delivery / Stabilité |
| Pipelines | `GET /projects/:id/pipelines` (+ `/:pid`) | Delivery / Stabilité / Résilience |
| MR mergées | `GET /projects/:id/merge_requests?state=merged` | Qualité / Pratiques |
| Branches | `GET /projects/:id/repository/branches` | Hygiène |
| Protection & settings | `GET /projects/:id` · `.../protected_branches` | Sécurité |
| Auth/accès | `GET /user` · `GET /projects/:id` | identité + vérif accès |

## 5. Référentiel — API bac (FastAPI `/api/v1`)

```
POST /assessments                       GET /assessments?repo_id=&squad_id=&period=
GET  /assessments/{id}                  GET /assessments/{id}/confrontation
GET  /squads/{squad_id}/trajectory?period=
GET  /teams/{team_id}/rollup            GET /orgs/{org_id}/rollup
POST /assessments/{id}/action-plan      PATCH /action-items/{item_id}
POST /assessments/{id}/share            DELETE /shares/{token}
POST /reminders                         (job hors-ligne : due → notif)
```
En-têtes communs : `Authorization`, `X-GitLab-URL`, `Idempotency-Key` (POST).

## 6. Référentiel — collections MongoDB

`assessments` (unique `(instance,repo_id,squad_id,assessed_at,calculation_version)`) ·
`action_items` · `shares` (jeton, portée, expiration) · `reminders` · `rbac` · `audit_log`.

## 7. Règles produit transverses

- **Période** `30d|90d|180d|2a|custom` pilote la trajectoire **et** la fenêtre de comparaison.
- **Comparaison** de deux évaluations = même `questionnaire_version` (sinon « versions différentes »).
- **Auto vs déclaratif** : les réponses sont **déclaratives** ; GitLab sert à **confronter**, pas à
  remplacer. Les écarts nourrissent le plan.

## 8. Index des US

| # | US | Besoin |
|---|---|---|
| 01 | Évaluations persistées | persistance + provenance |
| 02 | Trajectoire de maturité | séries score + axes par période |
| 03 | Confrontation déclaratif ↔ GitLab conservée | écarts dans le temps |
| 04 | Rollup squad → tribu → direction | agrégation + RBAC |
| 05 | Rappel de ré-évaluation | scheduler |
| 06 | Partage & suivi du plan d'action | partage + suivi J+30 |
| 07 | Socle sécurité transversal | fondation |
