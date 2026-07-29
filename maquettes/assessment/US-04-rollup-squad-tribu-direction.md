# US-04 — Rollup squad → tribu → direction

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-assess-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : **piloter à l'échelle** (comparer les squads, agréger par tribu/direction) — impossible en local isolé.
- **Périmètre** : agrégation des dernières évaluations par squad → moyenne tribu → vue direction ; tendance par squad ; RBAC (viewer lit, lead/manager selon niveau).
- **Dépendances** : US-01 ; RBAC (EPIC §3).
- **Endpoints / collections** : `GET /teams/{team_id}/rollup`, `GET /orgs/{org_id}/rollup` · `assessments` (agrégés), `rbac`.
- **Critères d'acceptation** :
```
Étant donné plusieurs squads d'une même tribu ayant des évaluations
Quand un manager ouvre la vue tribu
Alors il voit l'indice et le niveau de chaque squad + la moyenne de la tribu.
Et un viewer voit les chiffres mais ne peut ni corriger ni partager.
Et une squad sans évaluation récente est signalée (pas comptée comme 0).
```
