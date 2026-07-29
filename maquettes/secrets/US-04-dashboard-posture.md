# US-04 — Dashboard posture

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-secrets-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : voir la **posture s'améliorer** (moins de secrets actifs, remédiation plus rapide) et piloter par repo/org.
- **Périmètre** : KPIs (secrets actifs, faux positifs, résolus, MTTR de remédiation), tendance des secrets actifs dans le temps, répartition par type et par repo ; par période.
- **Dépendances** : US-01, US-02 (statuts) ; RBAC.
- **Endpoints / collections** : `GET /secrets/posture?repo_id=&period=` · `secret_findings` (agrégés).
- **Critères d'acceptation** :
```
Quand j'ouvre le dashboard posture d'un repo
Alors je vois les secrets actifs, faux positifs, résolus, le MTTR de remédiation,
la tendance des secrets actifs et la répartition par type.
Et un « faux positif » ou « résolu » n'est pas compté comme actif.
Et une période (30/90/180 j) filtre la tendance et la fenêtre.
```
