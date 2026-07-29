# US-03 — Vue org multi-repos

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-analyzer-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : **piloter à l'échelle** — comparer tous les repos, repérer les plus fragiles, agréger par squad/org.
- **Périmètre** : agrégation des derniers snapshots par repo (santé, bus factor, red flags, tendance), classé du plus fragile au plus sain + moyenne ; RBAC (bornée aux repos accessibles).
- **Dépendances** : US-01 ; RBAC (EPIC §3).
- **Endpoints / collections** : `GET /orgs/{org_id}/repo-health`, `GET /teams/{team_id}/repo-health` · `repo_health_snapshots` (agrégés), `rbac`.
- **Critères d'acceptation** :
```
Quand j'ouvre la vue org
Alors je vois chaque repo avec sa santé, son bus factor et ses red flags, classés du plus fragile au plus sain.
Et un repo en bus factor 1 est signalé comme critique.
Et l'agrégat ne contient que les repos auxquels l'utilisateur a accès.
```
