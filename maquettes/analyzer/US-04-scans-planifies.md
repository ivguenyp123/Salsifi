# US-04 — Scans planifiés

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-analyzer-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : garder la santé à jour **sans ouvrir le hub**.
- **Périmètre** : planifier une ré-analyse (nocturne) par un **job hors-ligne** (compte de service / Vault) qui pousse un snapshot par repo. **Hors périmètre** : réécrire dans GitLab.
- **Dépendances** : US-01 (snapshots) ; job hors-ligne (EPIC §2).
- **Endpoints / collections** : `POST /repo-health/scan-schedule`, `GET /repo-health/scan-target` · `scan_schedules`.
- **Critères d'acceptation** :
```
Étant donné un scan planifié chaque nuit
Quand l'heure arrive
Alors le job ré-analyse les repos accessibles et pousse un snapshot par repo, même hub fermé.
Et désactiver la planification arrête les scans (tracé).
```
