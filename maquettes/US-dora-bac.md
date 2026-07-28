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
utilisateur et n'en **stocke aucun**. Trois règles :
- **Identité sans stockage** : chaque requête porte le token en en-tête
  (`Authorization: Bearer <PAT>` + `X-GitLab-URL`) ; le back le valide **en direct**
  (`GET /user`) pour connaître l'utilisateur, puis le **jette**.
- **Frontière de confiance** ⚠️ : le snapshot est **calculé côté navigateur** → c'est un
  **input non fiable**. Un client pourrait poster un indice ou des métriques falsifiés,
  ou viser un `repo_id` arbitraire. Le back **ne croit pas le snapshot sur parole** : il
  (1) **vérifie l'accès** de l'utilisateur au `repo_id` (appel GitLab en son nom), (2)
  **stampe la provenance** (instance, version de calcul, fenêtre, **compteurs sources**),
  (3) borne par une **clé d'unicité** et une **idempotency-key**. Détail en §7.
- **Jobs hors-ligne** (agrégation nocturne, alertes régression) : via **webhooks GitLab**
  (signés + anti-rejeu) ou un **compte de service** dédié dont le token vit dans **Vault**
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
  headers: Authorization, X-GitLab-URL, Idempotency-Key: <uuid>
  body: {
    gitlab_instance, repo_id, at (ISO date), calculation_version,
    metrics:{df,lt,cfr,mttr}, levels:{df,lt,cfr,mttr}, index, index_version,
    source_window:{ from, to },
    source_counts:{ deployments, pipelines, merged_mrs, incidents }
  }
  # Le serveur :
  #  1) valide le token (GET /user) → user
  #  2) VÉRIFIE l'accès de user au repo_id (GET /projects/:id en son nom) → sinon 403
  #  3) stampe calculated_by=user, received_at, gitlab_instance
  #  4) upsert par clé d'unicité (gitlab_instance, repo_id, at, calculation_version)
  → 201 { id } | 403 pas d'accès au repo | 409 idempotency/conflit

GET /api/v1/snapshots?repo_id=&period=90d
  # period ∈ 30d | 90d | 180d | custom(&from=&to=)
  # accès au repo re-vérifié (GET /projects/:id en tant que l'appelant)
  → 200 { repo_id, period, calculation_version, points:[ { at, metrics, levels, index } ] }

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
// snapshots  (un point par repo/jour/version) — provenance stampée, jamais cru sur parole
{ _id, gitlab_instance, repo_id, at, calculation_version, index_version,
  metrics:{df,lt,cfr,mttr}, levels:{...}, index,
  source_window:{from,to},
  source_counts:{ deployments, pipelines, merged_mrs, incidents }, // preuve du calcul
  calculated_by, received_at, source:"front" }

// interventions  (le journal + la fiche)
{ _id, repo_id, type, title, hypothesis, target_metric, owner,
  started_at, verify_at, jira_key, result, status:"planned|active|verified",
  created_by, created_at }

// verifications  (les vérifs J+30 planifiées)
{ _id, ref:{kind:"intervention|action_plan", id}, due_at, done_at, outcome }

// action_plans  (les recos Salsi transformées en actions)
{ _id, repo_id, target_metric, levers:[...],
  jira_keys:[...], jira_status:"succeeded|partially_succeeded|failed",
  verification_id, idempotency_key, created_by, created_at }

// audit_log  (toute modif d'intervention / de résultat / de snapshot rejeté)
{ _id, entity:"intervention|result|snapshot", entity_id, action,
  before, after, actor, at, ip? }
```

**Index** : `snapshots` **unique** `(gitlab_instance, repo_id, at, calculation_version)` ·
`interventions (repo_id, started_at)` · `verifications (due_at)` ·
`action_plans` **unique** `(idempotency_key)` · `audit_log (entity, entity_id, at)`.

---

## 7. Sécurité & intégrité — le socle réutilisable (à appliquer à TOUS les modules)

> Comme les données sont calculées côté client puis envoyées au bac, la sécurité ne peut
> pas être un ajout : c'est le **contrat**. Ces règles valent pour DORA **et** pour tout
> module futur qui persiste des données au bac.

1. **Vérif d'accès au projet** (obligatoire) — après `GET /user`, le serveur confirme que
   l'utilisateur a **réellement accès** au `repo_id` (`GET /projects/:id` en son nom) avant
   d'**accepter** (POST) ou de **servir** (GET) la moindre donnée. Sinon `403`. Empêche de
   poster/lire sur un `repo_id` arbitraire.
2. **Provenance stampée** — chaque snapshot porte `gitlab_instance`, `calculation_version`,
   `source_window` et surtout `source_counts` (deployments / pipelines / merged_mrs /
   incidents). On garde la **preuve du calcul** → on peut détecter une valeur incohérente
   (indice élevé mais 0 déploiement) et recalculer/auditer plus tard.
3. **Clé d'unicité** `(gitlab_instance, repo_id, at, calculation_version)` — pas seulement
   `(repo_id, at)` : deux instances homonymes ou deux versions de formule ne s'écrasent pas.
4. **Idempotency-Key** sur tous les `POST` à effet de bord — **surtout la création Jira** :
   un rejeu réseau ne crée pas 4 US en double.
5. **Définition de « production »** — un déploiement compte pour la prod si son environnement
   matche un motif **configurable par repo** (`env_prod_pattern`, défaut `^prod(uction)?$`).
   Explicite, versionné, auditable — pas d'ambiguïté sur le DF/CFR.
6. **Versionnage des formules** — `calculation_version` (DORA) + `index_version` (indice
   Salsifi) stockés sur chaque snapshot. Une évolution de formule est **traçable** et ne
   corrompt pas l'historique ; les comparaisons se font à version égale.
7. **Journal d'audit** — toute modification d'une **intervention** ou d'un **résultat**
   (et tout snapshot rejeté) est tracée `{actor, at, before, after}`.
8. **Webhooks** — **signature HMAC** (secret partagé, en-tête `X-Gitlab-Token`) +
   **anti-rejeu** (timestamp + nonce, fenêtre courte). Un webhook non signé/rejoué est
   refusé.
9. **Politique d'accès (RBAC)** — rôles `viewer | contributor | maintainer | admin` :
   qui **voit** une squad/direction, qui **crée** une intervention, qui **corrige** un
   résultat. Le viewer lit, ne modifie pas.
10. **Jira partiellement réussi** — si 3 US/4 sont créées, statut `partially_succeeded`
    (jamais un faux « tout ok ») ; l'idempotency permet de **rejouer** les manquantes.

---

## 8. Critères d'acceptation (Gherkin)

**US-01 — Trajectoire sur période**
```
Étant donné des snapshots sur 6 mois
Quand je choisis la période « 90 jours »
Alors le graphe et la fenêtre d'analyse ne portent que sur 90 jours.
Et si moins de 2 snapshots existent sur la période, aucune tendance
n'est affichée (message « données insuffisantes »).
```

**US-02 — Journal des interventions**
```
Étant donné des événements GitLab (MR, incident, déploiement, conf)
et des interventions saisies
Quand j'ouvre le calendrier
Alors les événements GitLab sont marqués « détecté automatiquement » et non éditables,
et les interventions sont marquées « saisi » et éditables.
Et je ne peux pas saisir manuellement un type déjà couvert par GitLab.
```

**US-03 — Fiche d'intervention**
```
Étant donné une intervention existante
Quand l'utilisateur ouvre sa fiche
Alors il voit l'hypothèse, la métrique, le responsable,
les dates, l'US Jira et le résultat observé.
Et si la date de vérification n'est pas atteinte,
le résultat est affiché comme « à vérifier ».
Et si plusieurs changements sont détectés dans la fenêtre,
le niveau de confiance ne peut pas être « strong ».
```

**US-04 — Niveau de confiance**
```
Étant donné un impact calculé autour d'une intervention
Quand la fenêtre contient au moins un changement concomitant
Alors la confiance est au plus « concurrent » (jamais « strong »).
Et si le nombre de snapshots est insuffisant, la confiance est « partial ».
```

**US-05 — Coach & boucle d'action**
```
Étant donné une recommandation Salsi sur une métrique
Quand je clique « Créer les US Jira » et que 3 US sur 4 réussissent
Alors le statut est « partiellement créé », les 3 clés sont listées,
et un rejeu (même idempotency-key) ne crée que la 4ᵉ manquante.
Et « Planifier une vérif J+30 » crée une vérification à due_at = début + 30 jours.
```

**US-06 — Vue équipe & accès**
```
Étant donné un utilisateur au rôle « viewer » d'une squad
Quand il ouvre la vue équipe
Alors il voit les métriques mais ne peut ni créer ni corriger.
Et un POST de snapshot sur un repo_id auquel il n'a pas accès renvoie 403.
```

---

## 9. Règles produit

- **Période** : `30d | 90d | 180d | custom` pilote la série renvoyée **et** la fenêtre
  d'analyse avant/après. Le front redessine le graphe à partir de `points`.
- **Confiance** (`GET /interventions/{id}/impact`) : combine **force de corrélation** ×
  **changements concomitants** × **suffisance des données** → `strong | concurrent |
  partial`. Jamais « X a causé Y ».
- **Auto vs manuel** : GitLab aspire MR / incidents / déploiements / conf ; l'humain ne
  saisit que coaching / atelier / formation / décision / orga.
