# US-02 — Trajectoire de santé

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-analyzer-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : voir la santé d'un repo **évoluer** (le score progresse-t-il ?) sur une période choisie.
- **Périmètre** : série du score de conformité (et sous-scores) par période (30/90/180 j) ; gestion « données insuffisantes ».
- **Dépendances** : US-01 (snapshots).
- **Endpoints / collections** : `GET /repo-health/{repo_id}/trajectory?period=` · `repo_health_snapshots`.
- **Critères d'acceptation** :
```
Étant donné des snapshots sur plusieurs semaines
Quand je choisis « 90 jours »
Alors la courbe et la fenêtre d'analyse ne portent que sur 90 jours.
Et si moins de 2 snapshots existent sur la période, aucune tendance n'est affichée.
```
