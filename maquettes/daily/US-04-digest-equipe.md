# US-04 — Digest d'équipe (multi-repos)

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-daily-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : un **seul rapport consolidé** pour une squad qui a **plusieurs repos** (pas un mail par repo).
- **Périmètre** : sélectionner un ensemble de repos ; composer un digest agrégé (stats totales + faits saillants par repo) ; peut être programmé (US-01) ou généré à la demande. **Hors périmètre** : mélanger des repos auxquels l'utilisateur n'a pas accès.
- **Dépendances** : US-01 (envoi), US-03 (archive) ; vérif d'accès (EPIC §3).
- **Endpoints / collections** : `POST /daily/team-digest` · `team_digests`, `daily_archive`.
- **Critères d'acceptation** :
```
Étant donné une squad avec 4 repos accessibles
Quand je génère un digest d'équipe
Alors j'obtiens un rapport unique agrégeant les 4 repos (totaux + par repo).
Et un repo auquel l'utilisateur n'a pas accès ne peut pas être ajouté au digest.
Et le digest d'équipe peut être programmé comme un envoi matinal (US-01).
```
