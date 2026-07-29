# EPIC — Daily Report « mode bac » : envoi programmé, archive & digest d'équipe

> Architecture, auth, sécurité et référentiels communs. Les US (`US-daily-bac.md`)
> ne répètent pas ça. **Socle sécurité/intégrité : réutilise `../dora/EPIC-dora-bac.md` §3.**
> Maquette de référence : `daily-bac.html` (même dossier).

## 1. Vision

Le module actuel **génère à la demande** un digest de l'activité GitLab du jour (stats + ~20
sections), navigable jour par jour — pratique pour le standup, mais **il faut ouvrir le hub**.
Le bac le rend **autonome** : **programmer** l'envoi chaque matin via **l'API d'envoi existante
(mail/Teams)**, **archiver** les rapports au-delà de la fenêtre de l'API GitLab, et consolider un
**digest d'équipe multi-repos**.

## 2. Architecture & auth

- **Front** : le module (navigateur) lit GitLab avec le **token utilisateur** et **compose** le
  rapport (déjà le cas). Le bac ne remplace pas ça ; il **orchestre** (planifie, archive, agrège).
- **Envoi** : **l'API d'envoi mail/Teams existe déjà** (service interne LCL). Le bac ne réimplémente
  pas l'envoi — un **job hors-ligne** (compte de service / webhook, token en **Vault**) **compose le
  rapport puis appelle cette API** à l'heure programmée, même hub fermé.
- **Modèle « historien »** (identique DORA) : le bac ne stocke aucun token utilisateur ; identité
  validée en direct, **vérif d'accès au repo** avant toute opération.

## 3. Socle sécurité & intégrité

Identique à `../dora/EPIC-dora-bac.md` §3, avec ces spécificités Daily :
- **Secrets d'envoi en Vault** : credentials de l'API mail/Teams jamais dans le navigateur.
- **Vérif d'accès** : un rapport programmé sur un repo n'est envoyé qu'aux **destinataires
  autorisés** sur ce repo (pas de fuite d'activité inter-équipes).
- **Idempotency** sur l'envoi programmé : une exécution rejouée ne renvoie pas deux fois le même
  rapport (clé `(repo_id, date, canal)`).
- **RBAC** : `viewer` lit l'archive · `contributor` déclenche un envoi test · `lead` configure la
  programmation & les destinataires d'une squad · `admin` gère les référentiels. `403` sinon.
- **Audit** : chaque envoi (auto/test), modif de programmation et génération de digest tracé.

## 4. Référentiel — endpoints GitLab (composition, token front / service)

| Donnée | Endpoint | Section |
|---|---|---|
| MR (mergées/ouvertes/fermées) | `GET /projects/:id/merge_requests?updated_after=` | MRs |
| Pipelines (+ échecs, durée) | `GET /projects/:id/pipelines?updated_after=` | Pipelines |
| Déploiements | `GET /projects/:id/deployments` | Déploiements |
| Commits | `GET /projects/:id/repository/commits?since=&until=` | Commits |
| Issues / bugs | `GET /projects/:id/issues?updated_after=` | Issues / Bugs |
| Branches / tags | `.../repository/branches` · `.../tags` | Branches / Releases |
| Auth/accès | `GET /user` · `GET /projects/:id` | identité + accès |

## 5. Référentiel — API bac (FastAPI `/api/v1`)

```
POST /daily/schedules              GET /daily/schedules?repo_id=
PATCH /daily/schedules/{id}        DELETE /daily/schedules/{id}
POST /daily/send-now               (test : compose + appelle l'API d'envoi)
GET  /daily/archive?repo_id=&from=&to=   GET /daily/archive/{id}
POST /daily/team-digest            (multi-repos → 1 rapport consolidé)
```
> L'envoi effectif passe par **l'API d'envoi mail/Teams existante** (hors périmètre bac : le bac
> l'**appelle**, il ne la réimplémente pas). En-têtes communs : `Authorization`, `X-GitLab-URL`, `Idempotency-Key`.

## 6. Référentiel — collections MongoDB

`daily_schedules` (unique `(instance,repo_id,canal)`) · `daily_archive` (rapports composés) ·
`team_digests` · `rbac` · `audit_log`.

## 7. Règles produit transverses

- **Le bac n'envoie pas lui-même** : il **compose** et **délègue** à l'API d'envoi existante.
- **Au matin, pas à la demande** : la programmation est déterministe (heure + jours ouvrés),
  rejouable et idempotente ; la génération à la demande reste dispo dans le module.
- **Archive** = source de vérité au-delà de la fenêtre bornée de l'API GitLab.

## 8. Index des US

| # | US | Besoin |
|---|---|---|
| 01 | Envoi programmé | scheduler + délégation à l'API d'envoi |
| 02 | Destinataires & canaux | config mail/Teams + RBAC |
| 03 | Archive des rapports | persistance au-delà de l'API GitLab |
| 04 | Digest d'équipe (multi-repos) | consolidation squad |
| 05 | Socle sécurité transversal | fondation |
