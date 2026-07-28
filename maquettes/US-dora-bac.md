# US — DORA « mode bac » : trajectoire, interventions & boucle d'action

> Spec de la version réelle derrière la maquette `maquettes/dora-bac.html`.
> **Front** : le module DORA existant (navigateur, lit GitLab avec le token de
> l'utilisateur, calcule les 4 métriques). **Bac** : un service **Python FastAPI +
> MongoDB** qui *persiste, agrège et suit dans le temps* — sans jamais stocker de token.

---

## 1. Vision

Faire passer DORA d'un **tableau de bord instantané** à une **trajectoire suivie** :
on relie *ce qu'on fait* (coaching, atelier, formation, décision d'équipe) à
*ce que ça donne* (évolution des 4 métriques), sur une **période choisie**, avec un
**niveau de confiance honnête** — et on **ferme la boucle** (plan d'action + US Jira +
vérification à J+30). Jamais de causalité affirmée : de la **corrélation cadrée**.

---

## 2. User Stories

- **US-01 — Trajectoire sur période** · *En tant que coach/tech lead, je veux voir
  l'évolution de mes 4 métriques DORA et de l'indice delivery sur **30 / 90 / 180 jours**
  (ou personnalisé), pour vérifier qu'une amélioration **tient dans la durée**, pas juste
  d'un mois à l'autre.*
- **US-02 — Journal des interventions** · *…je veux saisir uniquement ce que GitLab ne
  voit pas (atelier, coaching, formation, décision, changement d'orga) ; les MR,
  incidents, déploiements et changements de conf sont **aspirés automatiquement**.*
- **US-03 — Fiche d'intervention** · *…au clic sur une intervention, je veux une fiche
  formelle : **hypothèse, métrique ciblée, responsable, date de début → date de
  vérification (J+30), US Jira, résultat observé**.*
- **US-04 — Confiance** · *…à côté d'un impact, je veux un **niveau de confiance**
  (corrélation forte · plusieurs changements simultanés · données partielles) et le
  **caveat** des changements concomitants détectés.*
- **US-05 — Coach & boucle** · *…sous les recommandations de Salsi (leviers par métrique),
  je veux **créer le plan d'action**, **créer les US Jira** et **planifier une
  vérification à J+30** en un clic.*
- **US-06 — Vue équipe** · *…je veux agréger la trajectoire par **squad / direction** et
  être **alerté d'une régression** (même hub fermé).*

---

## 3. Architecture & auth (contrainte : pas de stockage de token)

```
Navigateur (module DORA)                FastAPI (bac)              MongoDB
  │  lit GitLab avec le token user         │                         │
  ├─ calcule les 4 métriques  ───────────► POST /snapshots ─────────► snapshots
  │                                        │  (valide le token live)  │
  ├─ GET /snapshots?period= ◄───────────── série agrégée ◄─────────── │
  ├─ POST /interventions  ───────────────► fiche ────────────────────► interventions
  └─ POST /action-plans   ───────────────► plan + US Jira + verif ───► action_plans / verifications
```

**Modèle « historien »** : le back **ne parle jamais** à GitLab avec un token
utilisateur et n'en **stocke aucun**. Deux règles :
- **Identité sans stockage** : chaque requête porte le token en en-tête
  (`Authorization: Bearer <PAT>` + `X-GitLab-URL`) ; le back le valide **en direct**
  (`GET /user`) pour connaître l'utilisateur, puis le **jette**.
- **Jobs hors-ligne** (agrégation nocturne, alertes régression) : via **webhooks GitLab**
  (aucun token) ou un **compte de service** dédié dont le token vit dans **Vault**
  (jamais un token utilisateur).

---

## 4. Endpoints GitLab utilisés (source de vérité, calculés côté front)

Les 4 métriques et les événements auto sont calculés par le front à partir de l'API
GitLab REST (mêmes appels que le module actuel) :

| Donnée | Endpoint GitLab | Sert à |
|---|---|---|
| Déploiements prod | `GET /projects/:id/deployments?environment=production&updated_after=` | **DF** (fréquence) + événements « déploiement » du calendrier |
| Pipelines branche par défaut | `GET /projects/:id/pipelines?ref=:default&updated_after=` (+ `GET /pipelines/:pid`) | **CFR** (échecs/total) et **MTTR** (durée échec→succès) |
| MR mergées | `GET /projects/:id/merge_requests?state=merged&updated_after=` | **LT** (1ᵉʳ commit → merge) + événements « revue » |
| Commits d'une MR | `GET /projects/:id/merge_requests/:iid/commits` | date du 1ᵉʳ commit (LT) |
| Incidents | `GET /projects/:id/issues?labels=incident&updated_after=` | événements « incident » du calendrier |
| Changement de conf | `GET /projects/:id/repository/commits?path=.gitlab-ci.yml` (+ overlays kustomize) | événements « conf » du calendrier |
| Projet / branche défaut | `GET /projects/:id` | `default_branch`, `path_with_namespace` |
| Identité (auth) | `GET /user` | valider le token + connaître l'utilisateur (jamais stocké) |

> Le front calcule un **snapshot** (les 4 valeurs + niveaux + indice) puis le **POST** au
> bac. L'historique de la trajectoire vient du bac, pas de GitLab.

---

## 5. API du bac — FastAPI (`/api/v1`)

En-têtes communs : `Authorization: Bearer <PAT>`, `X-GitLab-URL: <instance>`.
Le back valide le token en direct, en déduit `user`, puis l'oublie.

### Snapshots (trajectoire)
```
POST /api/v1/snapshots
  body: { repo_id, at (ISO date), metrics:{df,lt,cfr,mttr}, levels:{df,lt,cfr,mttr}, index }
  → 201 { id }
  # upsert par (repo_id, at) — un point par jour

GET /api/v1/snapshots?repo_id=&period=90d
  # period ∈ 30d | 90d | 180d | custom(&from=&to=)
  → 200 { repo_id, period, points:[ { at, metrics, levels, index } ] }

GET /api/v1/metrics/{metric}/series?repo_id=&period=90d
  # metric ∈ df|lt|cfr|mttr|index
  → 200 { metric, period, points:[{at,value,level}], marks:[{at,type,intervention_id,label}] }
```

### Interventions (journal + fiche)
```
POST /api/v1/interventions
  body: { repo_id, type, title, hypothesis, target_metric, owner,
          started_at, verify_at, jira_key? }
  # type ∈ coaching | atelier | formation | decision | orga | libre
  → 201 { id }

GET  /api/v1/interventions?repo_id=&from=&to=
  → 200 [ { id, type, title, target_metric, started_at, verify_at, status } ]

GET  /api/v1/interventions/{id}
  → 200 { ...fiche complète..., impact:{ before, after, delta, confidence } }

PATCH /api/v1/interventions/{id}
  body: { result?, verified_at?, jira_key?, status? }   # renseigne le résultat à J+30

GET  /api/v1/interventions/{id}/impact?window=30d
  # avant/après autour de started_at (médiane fenêtre), + concomitants détectés
  → 200 { before, after, delta, confidence:"strong|concurrent|partial",
          concomitant:[ {type,at,label} ] }
```

### Calendrier (auto + manuel fusionnés)
```
GET /api/v1/calendar?repo_id=&month=2026-04
  → 200 { days:[ { date, source:"gitlab|manual", type, label, intervention_id? } ] }
  # source=gitlab : déploiements, incidents, revues, conf (aspirés)
  # source=manual : interventions du journal
```

### Boucle d'action (fermer la boucle)
```
POST /api/v1/action-plans
  body: { repo_id, target_metric, levers:[lever_id], intervention_id? }
  → 201 { id, jira_keys:[], verification_id }
  # crée le plan, (option) crée les US Jira, planifie la vérif J+30

POST /api/v1/verifications
  body: { intervention_id|action_plan_id, due_at }
  → 201 { id }   # à échéance : compare avant/après et notifie
```

### Vue équipe & alertes
```
GET /api/v1/teams/{team_id}/dora?period=90d
  → 200 { squads:[ {name, index, level, trend, recent_interventions:[]} ] }

# régression détectée par job planifié → notification (mail/Teams/webhook)
```

---

## 6. Modèle de données (MongoDB)

```jsonc
// snapshots  (un point par repo et par jour)
{ _id, repo_id, at, metrics:{df,lt,cfr,mttr}, levels:{...}, index, source:"front" }

// interventions  (le journal + la fiche)
{ _id, repo_id, type, title, hypothesis, target_metric, owner,
  started_at, verify_at, jira_key, result, status:"planned|active|verified",
  created_by, created_at }

// verifications  (les vérifs J+30 planifiées)
{ _id, ref:{kind:"intervention|action_plan", id}, due_at, done_at, outcome }

// action_plans  (les recos Salsi transformées en actions)
{ _id, repo_id, target_metric, levers:[...], jira_keys:[...],
  verification_id, created_by, created_at }
```

**Index conseillés** : `snapshots (repo_id, at)`, `interventions (repo_id, started_at)`,
`verifications (due_at)`.

---

## 7. Règles clés

- **Période** : `30d | 90d | 180d | custom` pilote la série renvoyée **et** la fenêtre
  d'analyse avant/après. Le front redessine le graphe à partir de `points`.
- **Confiance** (`GET /interventions/{id}/impact`) : combine la **force de corrélation**
  (ampleur du delta vs bruit), la **présence de changements concomitants** (autres
  interventions / conf déployée dans la fenêtre) et la **suffisance des données** (nombre
  de snapshots) → `strong | concurrent | partial`. Jamais « X a causé Y ».
- **Jamais de token stocké** : identité validée en direct ; jobs hors-ligne via webhooks
  ou compte de service Vault.
- **Auto vs manuel** : GitLab aspire MR / incidents / déploiements / conf ; l'humain ne
  saisit que coaching / atelier / formation / décision / orga.
