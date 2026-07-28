# EPIC — Feature Flags « mode bac » : cycle de vie, rollout progressif & gouvernance

> Architecture, auth, sécurité et référentiels communs. Les US (`US-ff-bac.md`) ne
> répètent pas ça. **Socle sécurité/intégrité : réutilise `EPIC-dora-bac.md` §3.**
> Maquette de référence : `maquettes/ff-bac.html`.

## 1. Vision

Le module actuel gère le **cycle de vie** (création, ON/OFF, environnements, stratégies,
rollout %, audit, décommission). Le bac ajoute la **gouvernance** : **RBAC**, **ownership**,
**dette** (flags morts), **approbation**, **audit persistant**, et un **rollout progressif
orchestré au déploiement** (OFF → 10 % → 50 % → 100 %) avec santé et rollback.

## 2. Architecture & auth

La **vérité de l'état** d'un flag vit dans **GitLab Feature Flags** (ou Unleash) — le
**front lit/écrit** avec le token utilisateur. Le **bac** est une **couche de gouvernance**
(il ne détient pas l'état ; il enregistre, gouverne, planifie). **Aucun token stocké**,
identité validée en direct, **vérif d'accès au repo** avant toute opération (EPIC-dora §3).

**Trois chemins d'application** (le bac n'écrit jamais dans GitLab avec un token user) :

| Cas | Qui applique à GitLab | Rôle du bac |
|---|---|---|
| Bascule immédiate (maintainer, kill switch) | navigateur du maintainer (token user) | audit |
| Bascule gouvernée (prod / contributor) | navigateur de l'**approbateur** après validation | change-request, gate RBAC, audit |
| Palier de rollout **au deploy** | **job CI** du pipeline (service account Vault / `CI_JOB_TOKEN`) | fournit le % cible, reçoit la santé, décide rollback |

> Le « au prochain deploy » = un **job CI** qui, à chaque déploiement, demande au bac le
> palier cible et l'applique. Aucun secret dans le navigateur.

## 3. Socle sécurité & intégrité

Identique à `EPIC-dora-bac.md` §3, avec ces spécificités FF :
- **RBAC = cœur** : `viewer` lit · `contributor` crée & **propose** · `maintainer` **change
  le statut / étend le rollout / approuve** · `admin` + décommission + owners. `403` sinon.
- **Idempotency** sur `change-requests`, `approve`, `decommission` (Jira).
- **Application côté navigateur/CI, jamais côté bac.**
- **Webhook deploy** signé (HMAC) + anti-rejeu.
- **Kill switch immédiat** : couper (OFF) prime sur la cérémonie pour un maintainer.

## 4. Référentiel — endpoints GitLab (état des flags, token front)

| Action | Endpoint |
|---|---|
| Lister | `GET /projects/:id/feature_flags` |
| Détail | `GET /projects/:id/feature_flags/:name` |
| Créer | `POST /projects/:id/feature_flags` |
| Update (active, stratégies, scopes/env, **% rollout**) | `PUT /projects/:id/feature_flags/:name` |
| Supprimer | `DELETE /projects/:id/feature_flags/:name` |
| Listes users (ciblage) | `GET/POST /projects/:id/feature_flags_user_lists` |
| Auth/accès | `GET /user` · `GET /projects/:id` |

> Rollout % = stratégie `flexibleRollout` (`parameters.rollout`) par **scope d'environnement**.

## 5. Référentiel — API bac (FastAPI `/api/v1`)

```
GET  /flags/{repo_id}/{key}/meta         PUT /flags/{repo_id}/{key}/owner
GET  /flags/{repo_id}/{key}/audit        POST /flags/{repo_id}/{key}/audit
POST /flags/{repo_id}/{key}/change-requests
POST /change-requests/{id}/approve|reject|applied
POST /flags/{repo_id}/{key}/rollout-schedule
GET  /flags/{repo_id}/{key}/rollout-target?env=&deploy_id=   (job CI)
POST /flags/{repo_id}/{key}/rollout-applied                  (job CI)
GET  /flags/{repo_id}/debt               POST /flags/{repo_id}/{key}/decommission
```

## 6. Référentiel — collections MongoDB

`flag_meta` (owner, tags, debt_status ; unique `(instance,repo_id,key)`) · `flag_audit` ·
`change_requests` (unique `idempotency_key`) · `rollout_schedules` · `rbac`.

## 7. Règles produit transverses

- **Au deploy, pas à chaud** : une extension de palier s'applique au prochain déploiement
  (déterministe, tracé, rollbackable). Le **kill switch OFF** reste immédiat.
- **Auto vs manuel** : l'**état** vient de GitLab ; le bac ajoute owner/dette/appro/rollout/audit.

## 8. Index des US

| # | US | Besoin |
|---|---|---|
| 01 | Liste & état des flags | inventaire |
| 02 | Changer le statut (RBAC) | kill switch gouverné |
| 03 | Rollout progressif au deploy | livraison graduelle |
| 04 | Approbation des bascules | gate |
| 05 | Propriété & dette | ownership + nettoyage |
| 06 | Journal d'audit | traçabilité |
