# US-01 — XP & badges validés serveur (anti-triche)

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-achievements-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : un score **équitable et non falsifiable** — condition d'un classement partagé.
- **Périmètre** : le bac **recalcule l'XP depuis GitLab** (déterministe, versionné) ; le chiffre envoyé par le navigateur est indicatif, jamais autoritatif. **Hors périmètre** : laisser le client fixer son XP.
- **Dépendances** : socle sécurité (EPIC §3) ; calcul serveur (compte de service).
- **Endpoints / collections** : `POST /achievements/score`, `GET /users/{user_id}/achievements` · `user_scores`.
- **Critères d'acceptation** :
```
Étant donné un client qui envoie un XP gonflé
Quand le bac calcule le classement
Alors il utilise l'XP recalculé côté serveur depuis GitLab, pas la valeur du client.
Et le score serveur porte sa provenance (scoring_version, source_counts, computed_at).
Et un même déblocage (même événement GitLab) ne compte qu'une fois (idempotent).
```
