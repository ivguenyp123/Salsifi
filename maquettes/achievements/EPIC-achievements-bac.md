# EPIC — Achievements « mode bac » : leaderboard, XP validé serveur & saisons

> Architecture, auth, sécurité et référentiels communs. Les US (`US-achievements-bac.md`)
> ne répètent pas ça. **Socle sécurité/intégrité : réutilise `../dora/EPIC-dora-bac.md` §3.**
> Maquette de référence : `achievements-bac.html` (même dossier).

## 1. Vision

Le module actuel calcule **côté navigateur** les badges / XP / niveaux d'un utilisateur depuis son
activité GitLab (30 j), avec historique local. Le jeu reste **solo et isolé**. Le bac ouvre le
**multijoueur** : un **leaderboard d'équipe partagé**, un **XP validé côté serveur** (anti-triche,
condition d'un classement équitable), des **saisons & défis d'équipe**, et un **historique des
déblocages persistant et cross-device**.

## 2. Architecture & auth

- **Front** : le module (navigateur) affiche badges / XP. Mais pour le classement, **le bac
  recalcule le score depuis GitLab** — il ne fait pas confiance au chiffre envoyé par le client.
- **Bac** : FastAPI + MongoDB qui **valide, agrège, classe, historise**.
- **Modèle « historien »** : aucun token utilisateur stocké ; identité validée en direct, **vérif
  d'accès au repo/à l'équipe** avant toute opération.
- **Calcul serveur** : un **job** (compte de service, token en **Vault**) recalcule périodiquement
  l'XP de chaque membre depuis GitLab → source de vérité du leaderboard.

## 3. Socle sécurité & intégrité — ⚠️ l'anti-triche est le cœur

Identique à `../dora/EPIC-dora-bac.md` §3, avec **la** spécificité Achievements :
- **XP jamais cru sur parole** : le score affiché par le navigateur est **indicatif** ; le
  **classement** utilise l'XP **recalculé côté serveur** depuis les événements GitLab (déterministe,
  versionné `scoring_version`). Un client qui envoie un XP gonflé n'affecte pas le leaderboard.
- **Provenance** de chaque score serveur : `gitlab_instance, user_id, scoring_version,
  source_window, source_counts, computed_at`.
- **Idempotency / déterminisme** : un même déblocage (même événement GitLab) ne compte qu'une fois.
- **RBAC & périmètre** : un membre ne voit que le(s) leaderboard(s) des équipes dont il fait partie ;
  `viewer` lit · `member` participe · `lead` configure saisons/défis · `admin` gère les référentiels.
- **Audit** : attribution/retrait de badge, changement de saison, ajustement manuel tracés.

## 4. Référentiel — endpoints GitLab (calcul serveur, compte de service)

| Signal | Endpoint | Badges concernés |
|---|---|---|
| Déploiements | `.../deployments` | delivery, stabilité |
| Pipelines / jobs | `.../pipelines` · `.../jobs` | fiabilité, résilience |
| MR (mergées, taille, review) | `GET /projects/:id/merge_requests` | qualité & review |
| Commits / contributeurs | `.../repository/commits` · `.../contributors` | régularité, bus factor |
| Branches / conformité | `.../branches` · `.../protected_branches` | hygiène, pratiques |
| Auth/accès | `GET /user` · `GET /projects/:id` | identité + accès |

## 5. Référentiel — API bac (FastAPI `/api/v1`)

```
POST /achievements/score            (recalcul serveur ; le client ne fixe pas l'XP)
GET  /teams/{team_id}/leaderboard?season=
GET  /users/{user_id}/achievements  GET /users/{user_id}/unlocks
POST /seasons                       GET /seasons/{id}/challenges
POST /challenges/{id}/progress      (calculé serveur)
```
En-têtes communs : `Authorization`, `X-GitLab-URL`, `Idempotency-Key`.

## 6. Référentiel — collections MongoDB

`user_scores` (XP serveur, unique `(instance,user_id,scoring_version)`) · `unlocks` (historique
des déblocages) · `seasons` · `challenges` · `teams` · `rbac` · `audit_log`.

## 7. Règles produit transverses

- **XP du classement = serveur**, pas navigateur (équité).
- **Leaderboard borné à l'équipe** de l'utilisateur (pas de classement global non consenti).
- **Saisons** : les défis d'équipe donnent un **XP bonus collectif**, remis à zéro par saison (historisé).

## 8. Index des US

| # | US | Besoin |
|---|---|---|
| 01 | XP & badges validés serveur | anti-triche |
| 02 | Leaderboard d'équipe partagé | classement équitable |
| 03 | Saisons & défis d'équipe | jeu collectif |
| 04 | Historique des déblocages | persistance cross-device |
| 05 | Socle sécurité transversal | fondation |
