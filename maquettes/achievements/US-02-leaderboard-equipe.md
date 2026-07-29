# US-02 — Leaderboard d'équipe partagé

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-achievements-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : le **sel du jeu** — se comparer à son équipe (impossible en local isolé).
- **Périmètre** : classement des membres d'une équipe par XP (validé serveur), avec niveau, badges, streak ; borné aux équipes de l'utilisateur (RBAC). **Hors périmètre** : classement global non consenti.
- **Dépendances** : US-01 (XP serveur) ; RBAC (EPIC §3).
- **Endpoints / collections** : `GET /teams/{team_id}/leaderboard?season=` · `user_scores`, `teams`, `rbac`.
- **Critères d'acceptation** :
```
Quand j'ouvre le leaderboard de mon équipe
Alors je vois les membres classés par XP validé serveur, avec niveau, badges et streak.
Et je ne vois pas le classement d'une équipe dont je ne fais pas partie (403).
Et mon rang se met à jour après le recalcul serveur, pas depuis mon navigateur.
```
