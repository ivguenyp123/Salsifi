# EPIC — DORA « mode bac » : trajectoire, interventions & boucle d'action

> Cet EPIC porte **l'architecture, l'auth, la sécurité et les référentiels** communs.
> Les US (`US-dora-bac.md`) **ne répètent pas** ça : chacune ne contient que
> *valeur · périmètre · dépendances · endpoints/collections · critères d'acceptation*.
> Maquette de référence : `dora-bac.html` (même dossier).

## 1. Vision

Faire passer DORA d'un **tableau de bord instantané** à une **trajectoire suivie** : relier
*ce qu'on fait* (coaching, atelier, formation, décision, orga) à *ce que ça donne*
(évolution des 4 métriques + indice), sur une **période choisie**, avec un **niveau de
confiance honnête**, et **fermer la boucle** (plan d'action → US Jira → vérification J+30).
Jamais de causalité affirmée : de la **corrélation cadrée**.

## 2. Architecture & auth

- **Front** : le module DORA (navigateur) lit GitLab avec le **token utilisateur**, calcule
  les 4 métriques, puis **pousse un snapshot** au bac. **Bac** : FastAPI + MongoDB qui
  **persiste, agrège, suit dans le temps**.
- **Modèle « historien »** : le bac ne parle jamais à GitLab avec un token utilisateur et
  **n'en stocke aucun**.
  - *Identité sans stockage* : token en en-tête (`Authorization: Bearer` + `X-GitLab-URL`),
    validé en direct (`GET /user`), puis jeté.
  - *Frontière de confiance* ⚠️ : le snapshot est **calculé côté client → input non fiable**.
    Le bac ne le croit pas sur parole (voir §3).
  - *Jobs hors-ligne* (agrégation, alertes) : **webhooks GitLab** (signés + anti-rejeu) ou
    **compte de service** dont le token vit dans **Vault**.

## 3. Socle sécurité & intégrité (transverse — vaut pour tous les modules)

1. **Vérif d'accès au projet** : après `/user`, confirmer que l'utilisateur a **accès** au
   `repo_id` (`GET /projects/:id` en son nom) avant d'accepter/servir une donnée → `403` sinon.
2. **Provenance stampée** sur chaque snapshot : `gitlab_instance, calculation_version,
   source_window, source_counts{deployments,pipelines,merged_mrs,incidents}, calculated_by,
   received_at` → preuve du calcul, incohérences détectables.
3. **Clé d'unicité** `(gitlab_instance, repo_id, at, calculation_version)`.
4. **Idempotency-Key** sur tout POST à effet de bord (surtout création Jira).
5. **Définition de « production »** configurable par repo (`env_prod_pattern`, défaut `^prod(uction)?$`).
6. **Versionnage** : `calculation_version` (DORA) + `index_version` (indice Salsifi) stockés.
7. **Journal d'audit** : toute modif d'intervention / résultat / snapshot rejeté (`{actor, at, before, after}`).
8. **Webhooks** : signature HMAC + anti-rejeu (timestamp + nonce).
9. **RBAC** : `viewer | contributor | maintainer | admin`.
10. **Jira partiel** : `partially_succeeded` si 3 US/4 ; rejeu des manquantes.

## 4. Référentiel — endpoints GitLab (source de vérité, token front)

| Donnée | Endpoint | Sert |
|---|---|---|
| Déploiements prod | `GET /projects/:id/deployments?environment=production` | DF + events « déploiement » |
| Pipelines défaut | `GET /projects/:id/pipelines?ref=:default` (+ `/pipelines/:pid`) | CFR, MTTR |
| MR mergées | `GET /projects/:id/merge_requests?state=merged` (+ `/:iid/commits`) | LT + events « revue » |
| Incidents | `GET /projects/:id/issues?labels=incident` | events « incident » |
| Conf | `GET /projects/:id/repository/commits?path=.gitlab-ci.yml` | events « conf » |
| Auth/accès | `GET /user` · `GET /projects/:id` | identité + vérif accès |

## 5. Référentiel — API bac (FastAPI `/api/v1`)

```
POST /snapshots                          GET /snapshots?repo_id=&period=
GET  /metrics/{metric}/series?repo_id=&period=
POST /interventions                      GET /interventions?repo_id=&from=&to=
GET  /interventions/{id}                 PATCH /interventions/{id}
GET  /interventions/{id}/impact?window=
GET  /calendar?repo_id=&month=
POST /action-plans                       POST /verifications
GET  /teams/{team_id}/dora?period=
```
En-têtes communs : `Authorization`, `X-GitLab-URL`, `Idempotency-Key` (POST).

## 6. Référentiel — collections MongoDB

`snapshots` · `interventions` · `verifications` · `action_plans` · `audit_log` · `rbac`
(schémas détaillés en annexe ; index clés : `snapshots` unique
`(gitlab_instance,repo_id,at,calculation_version)`, `action_plans` unique `(idempotency_key)`).

## 7. Règles produit transverses

- **Période** `30d|90d|180d|custom` pilote la série **et** la fenêtre d'analyse.
- **Confiance** = force de corrélation × changements concomitants × suffisance des données
  → `strong | concurrent | partial`. Jamais « X a causé Y ».
- **Auto vs manuel** : GitLab aspire MR/incidents/déploiements/conf ; l'humain saisit
  coaching/atelier/formation/décision/orga.

## 8. Index des US (par besoin)

| # | US | Besoin |
|---|---|---|
| 01 | Snapshots DORA persistés | persistance + provenance |
| 02 | Trajectoire & graphiques historiques | séries par période |
| 03 | Journal manuel des interventions | saisie du non-GitLab |
| 04 | Calendrier unifié | fusion auto + manuel |
| 05 | Fiche d'intervention | suivi formel |
| 06 | Avant/après & confiance | corrélation cadrée |
| 07 | Recommandations & plan d'action | boucle |
| 08 | Création des US Jira | idempotence/partiel |
| 09 | Vérification J+30 | scheduler |
| 10 | Vue squad/direction & alertes | agrégation + RBAC |
| 11 | Socle sécurité transversal | fondation |
