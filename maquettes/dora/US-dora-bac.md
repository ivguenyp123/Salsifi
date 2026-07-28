# US — DORA « mode bac »

> **Architecture, auth, sécurité, endpoints et collections : voir `EPIC-dora-bac.md`.**
> Chaque US ci-dessous ne contient que : *valeur métier · périmètre · dépendances ·
> endpoints & collections concernés · critères d'acceptation*. Une US = un besoin.

---

## US-01 — Snapshots DORA persistés
- **Valeur** : conserver un historique **fiable et partagé** des 4 métriques + indice, au-delà du navigateur.
- **Périmètre** : POST d'un snapshot (front, après calcul) avec provenance ; GET d'une série. **Hors périmètre** : le calcul des métriques (fait par le front).
- **Dépendances** : socle sécurité (EPIC §3) ; accès GitLab.
- **Endpoints / collections** : `POST /snapshots`, `GET /snapshots` · `snapshots`.
- **Critères d'acceptation** :
```
Étant donné un token valide et l'accès au repo
Quand je POST un snapshot avec provenance (instance, version, source_counts)
Alors il est enregistré (upsert par instance+repo+at+calculation_version).
Et un utilisateur sans accès au repo_id reçoit 403.
Et le même snapshot reçu deux fois ne crée pas de doublon.
```

## US-02 — Trajectoire & graphiques historiques
- **Valeur** : voir l'évolution sur **30 / 90 / 180 jours** et vérifier qu'une amélioration **tient**.
- **Périmètre** : séries par période et par métrique + marqueurs d'intervention ; gestion « données insuffisantes ».
- **Dépendances** : US-01 (snapshots), US-05 (interventions → marqueurs).
- **Endpoints / collections** : `GET /snapshots?period=`, `GET /metrics/{metric}/series` · `snapshots`, `interventions`.
- **Critères d'acceptation** :
```
Étant donné des snapshots sur 6 mois
Quand je choisis « 90 jours »
Alors le graphe et la fenêtre d'analyse ne portent que sur 90 jours.
Et si moins de 2 snapshots existent sur la période, aucune tendance n'est affichée.
```

## US-03 — Journal manuel des interventions
- **Valeur** : saisir **uniquement ce que GitLab ne voit pas** (coaching, atelier, formation, décision, orga).
- **Périmètre** : CRUD d'interventions de types manuels. **Hors périmètre** : saisir un type détecté par GitLab.
- **Dépendances** : RBAC (contributor+).
- **Endpoints / collections** : `POST/GET /interventions` · `interventions`.
- **Critères d'acceptation** :
```
Quand je crée une intervention manuelle
Alors seuls les types coaching/atelier/formation/décision/orga sont acceptés.
Et un type couvert par GitLab (MR/incident/déploiement) est refusé à la saisie.
Et un utilisateur « viewer » ne peut pas créer d'intervention.
```

## US-04 — Calendrier unifié GitLab + interventions
- **Valeur** : voir **jour par jour** ce qui s'est passé, en distinguant l'auto du manuel.
- **Périmètre** : fusion des événements GitLab (aspirés) et des interventions, avec la **source**.
- **Dépendances** : US-03 ; endpoints GitLab (EPIC §4).
- **Endpoints / collections** : `GET /calendar` · `interventions` (+ events GitLab live).
- **Critères d'acceptation** :
```
Quand j'ouvre le calendrier d'un mois
Alors les événements GitLab sont marqués « détecté automatiquement » et non éditables,
et les interventions sont marquées « saisi » et éditables.
```

## US-05 — Fiche d'intervention
- **Valeur** : **suivi formel** d'une intervention (de l'hypothèse au résultat).
- **Périmètre** : consultation/édition d'une fiche : hypothèse, métrique ciblée, responsable, dates (début → vérif), US Jira, statut, résultat.
- **Dépendances** : US-03 ; US-06 (impact/confiance).
- **Endpoints / collections** : `GET/PATCH /interventions/{id}`, `GET /interventions/{id}/impact` · `interventions`.
- **Critères d'acceptation** :
```
Étant donné une intervention existante
Quand l'utilisateur ouvre sa fiche
Alors il voit l'hypothèse, la métrique, le responsable, les dates, l'US Jira et le résultat.
Et si la date de vérification n'est pas atteinte, le résultat est « à vérifier ».
Et si plusieurs changements sont détectés dans la fenêtre, la confiance ne peut être « strong ».
```

## US-06 — Calcul avant/après & niveau de confiance
- **Valeur** : **mesurer l'évolution** autour d'une intervention **sans affirmer la causalité**.
- **Périmètre** : fenêtres avant/après (médiane), détection des changements concomitants, verdict `strong | concurrent | partial`.
- **Dépendances** : US-01 (snapshots), US-04 (events → concomitants).
- **Endpoints / collections** : `GET /interventions/{id}/impact` · `snapshots`, `interventions`.
- **Critères d'acceptation** :
```
Quand la fenêtre contient au moins un changement concomitant
Alors la confiance est au plus « concurrent » (jamais « strong »).
Et si les snapshots sont insuffisants, la confiance est « partial ».
```

## US-07 — Recommandations Salsi & plan d'action
- **Valeur** : transformer une reco en **action suivie**.
- **Périmètre** : leviers proposés par métrique (déterministe) ; création d'un plan d'action ; suivi.
- **Dépendances** : RBAC (contributor+) ; US-08 (Jira), US-09 (vérif).
- **Endpoints / collections** : `POST /action-plans` · `action_plans`.
- **Critères d'acceptation** :
```
Quand je crée un plan d'action depuis une recommandation
Alors le plan lie les leviers choisis à la métrique cible,
et propose la création des US Jira (US-08) et la planification d'une vérif (US-09).
```

## US-08 — Création des US Jira
- **Valeur** : matérialiser le plan en **tickets** de façon sûre.
- **Périmètre** : création **idempotente**, gestion de la **création partielle**, **rejeu** des seules US manquantes.
- **Dépendances** : US-07 ; idempotency (EPIC §3).
- **Endpoints / collections** : `POST /action-plans` (avec `Idempotency-Key`) · `action_plans`.
- **Critères d'acceptation** :
```
Quand je crée les US Jira et que 3 sur 4 réussissent
Alors le statut est « partiellement créé » et les 3 clés sont listées.
Et un rejeu (même idempotency-key) ne crée que la 4ᵉ manquante.
```

## US-09 — Vérification planifiée à J+30
- **Valeur** : **vérifier** que l'action a porté, sans y penser.
- **Périmètre** : scheduler ; à échéance, comparaison avant/après, résultat, notification.
- **Dépendances** : US-06 (impact), US-05 (intervention).
- **Endpoints / collections** : `POST /verifications` · `verifications`.
- **Critères d'acceptation** :
```
Quand je planifie une vérification
Alors elle est due à début + 30 jours.
Et à l'échéance, l'outcome (avant/après + confiance) est calculé et notifié.
```

## US-10 — Vue squad/direction & alertes de régression
- **Valeur** : **piloter à l'échelle** équipe/direction et être alerté d'une régression.
- **Périmètre** : agrégation, tendances, RBAC ; alerte régression (job hors-ligne, notif mail/Teams).
- **Dépendances** : US-01 ; RBAC ; jobs hors-ligne (webhooks / compte de service).
- **Endpoints / collections** : `GET /teams/{team_id}/dora` · `snapshots` (agrégés), `rbac`.
- **Critères d'acceptation** :
```
Étant donné un utilisateur « viewer » d'une squad
Quand il ouvre la vue équipe
Alors il voit les métriques mais ne peut ni créer ni corriger.
Et une régression détectée déclenche une notification, même hub fermé.
```

## US-11 — Socle sécurité transversal
- **Valeur** : garantir **l'intégrité** de bout en bout (le contrat de confiance).
- **Périmètre** : validation du token sans stockage, vérif d'accès au repo, provenance, idempotency, audit, webhooks signés + anti-rejeu, secrets en Vault, RBAC. *(détail : EPIC §3)*
- **Dépendances** : aucune (fondation des autres US).
- **Endpoints / collections** : transverse · `audit_log`.
- **Critères d'acceptation** :
```
Quand un POST vise un repo_id auquel l'utilisateur n'a pas accès
Alors la réponse est 403.
Et un webhook non signé ou rejoué est refusé.
Et toute modification d'une intervention ou d'un résultat crée une entrée d'audit.
```
