# US-01 — Ingestion d'empreintes (jamais le secret)

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-secrets-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : conserver les findings entre les scans **sans jamais exposer la valeur du secret**.
- **Périmètre** : POST d'un finding (front, après détection) avec **empreinte** (hash salé), type, emplacement (repo/fichier/commit), first_seen. Déduplication par empreinte. **Hors périmètre** : envoyer la valeur du secret.
- **Dépendances** : socle sécurité (EPIC §3) ; accès GitLab.
- **Endpoints / collections** : `POST /secrets/findings`, `GET /secrets/findings` · `secret_findings`.
- **Critères d'acceptation** :
```
Étant donné un token valide et l'accès au repo
Quand je POST un finding avec une empreinte (sans la valeur du secret)
Alors il est enregistré (upsert par instance+repo+fingerprint), first_seen/last_seen tenus à jour.
Et un payload contenant la valeur brute du secret est refusé.
Et un utilisateur sans accès au repo_id reçoit 403.
```
