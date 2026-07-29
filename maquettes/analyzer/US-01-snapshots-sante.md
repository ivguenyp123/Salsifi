# US-01 — Snapshots de santé persistés

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-analyzer-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : garder un historique fiable de la santé d'un repo, au-delà d'une analyse jetable.
- **Périmètre** : POST d'un snapshot (front, après analyse) avec provenance (score de conformité, red flags, bus factor, source_counts) ; GET d'une série. **Hors périmètre** : le calcul (fait par le front).
- **Dépendances** : socle sécurité (EPIC §3) ; accès GitLab.
- **Endpoints / collections** : `POST /repo-health/snapshots`, `GET /repo-health/snapshots` · `repo_health_snapshots`.
- **Critères d'acceptation** :
```
Étant donné un token valide et l'accès au repo
Quand je POST un snapshot de santé avec provenance
Alors il est enregistré (upsert par instance+repo+at+calculation_version).
Et un utilisateur sans accès au repo_id reçoit 403.
Et le même snapshot reçu deux fois ne crée pas de doublon.
```
