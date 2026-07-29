# EPIC — Secrets Scanner « mode bac » : cycle de vie, alertes & posture

> Architecture, auth, sécurité et référentiels communs. Les US (`US-secrets-bac.md`)
> ne répètent pas ça. **Socle sécurité/intégrité : réutilise `../dora/EPIC-dora-bac.md` §3.**
> Maquette de référence : `secrets-bac.html` (même dossier).

## 1. Vision

Le module actuel **scanne à la demande** (Surface / Historique / Supply-chain / CIS) et liste les
secrets exposés — mais chaque scan repart de zéro : pas de mémoire, pas de suivi, pas d'alerte.
Le bac ajoute la **gouvernance** : un **cycle de vie** par finding (nouveau → confirmé → en
rotation → résolu / faux positif), des **alertes sur nouveaux secrets** (scan planifié hors-ligne),
et une **posture** dans le temps (secrets actifs, MTTR de remédiation, tendance, par type/repo).

## 2. Architecture & auth

- **Front** : le module (navigateur) scanne GitLab avec le **token utilisateur** et détecte les
  secrets (déjà le cas). Il **pousse au bac une empreinte** de chaque finding — **jamais la valeur**.
- **Bac** : FastAPI + MongoDB qui **suit le cycle de vie, déduplique, alerte, agrège**.
- **Modèle « historien »** : aucun token utilisateur stocké ; identité validée en direct, **vérif
  d'accès au repo** avant toute opération.
- **Scan hors-ligne** (alerte nouveaux secrets) : **job** avec **compte de service** (token en
  **Vault**) qui scanne périodiquement et pousse des empreintes.

## 3. Socle sécurité & intégrité — ⚠️ le secret ne quitte jamais le navigateur

Identique à `../dora/EPIC-dora-bac.md` §3, avec **la** spécificité Secrets Scanner :
- **Zéro valeur de secret côté bac** : on stocke une **empreinte** = hash **salé** (secret + repo +
  chemin), le **type**, l'**emplacement** (repo, fichier, commit), les **dates** et le **statut**.
  Jamais la chaîne du secret, ni assez pour la reconstituer.
- **Déduplication** par empreinte : `(gitlab_instance, repo_id, fingerprint)` — un même secret vu
  dans N scans = **un** finding, avec `first_seen` / `last_seen`.
- **« Nouveau »** = empreinte **absente de l'historique** → base de l'alerte.
- **RBAC** : `viewer` lit · `analyst` change le statut (confirmer / faux positif / résolu) · `admin`
  gère les waivers (risque accepté avec expiration) & les référentiels. `403` sinon.
- **Idempotency** sur l'ingestion (rejeu d'un scan ne recrée pas de findings).
- **Audit** : tout changement de statut, waiver, alerte tracé (`{actor, at, before, after}`).
- **Secrets d'envoi & token de service en Vault**.

## 4. Référentiel — endpoints GitLab (scan, token front / service)

| Donnée | Endpoint | Mode |
|---|---|---|
| Arbre & fichiers (HEAD) | `GET /projects/:id/repository/tree` · `.../files/:path/raw` | Surface |
| Commits & diffs | `GET /projects/:id/repository/commits` · `.../diff` | Historique |
| Manifestes / CI | `.../files/{package.json,pom.xml,.gitlab-ci.yml}/raw` | Supply-chain |
| Conformité | `GET /projects/:id` · `.../protected_branches` · `.../approval_rules` | CIS |
| Auth/accès | `GET /user` · `GET /projects/:id` | tous |

## 5. Référentiel — API bac (FastAPI `/api/v1`)

```
POST /secrets/findings              (ingestion : empreintes, jamais le secret)
GET  /secrets/findings?repo_id=&status=
PATCH /secrets/findings/{id}        (statut : confirmé | faux positif | en rotation | résolu)
POST /secrets/findings/{id}/waiver  DELETE /secrets/waivers/{id}
GET  /secrets/posture?repo_id=&period=   (KPIs + tendance + par type)
POST /secrets/scan-schedule         GET /secrets/scan-target   (job hors-ligne)
POST /secrets/alerts                (job → API d'envoi mail/Teams)
```
En-têtes communs : `Authorization`, `X-GitLab-URL`, `Idempotency-Key`.

## 6. Référentiel — collections MongoDB

`secret_findings` (unique `(instance,repo_id,fingerprint)` — **pas de valeur**) ·
`secret_waivers` (risque accepté + expiration) · `scan_schedules` · `secret_audit` · `rbac`.

## 7. Règles produit transverses

- **Le secret ne quitte jamais le navigateur** : le bac ne voit qu'une empreinte.
- **Alerte = nouveauté** : on n'alerte que sur une empreinte jamais vue (anti-bruit).
- **Faux positif & waiver** sont des statuts **gouvernés** (RBAC + audit + expiration), pas un simple masquage.

## 8. Index des US

| # | US | Besoin |
|---|---|---|
| 01 | Ingestion d'empreintes (jamais le secret) | persistance sûre |
| 02 | Cycle de vie des findings | statut gouverné |
| 03 | Alerte nouveaux secrets | scan planifié + notif |
| 04 | Dashboard posture | KPIs + tendance + MTTR |
| 05 | Faux positifs & waivers | risque accepté gouverné |
| 06 | Socle sécurité transversal | fondation |
