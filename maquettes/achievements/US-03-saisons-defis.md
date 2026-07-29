# US-03 — Saisons & défis d'équipe

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-achievements-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : entretenir la motivation dans le temps avec des **objectifs collectifs** renouvelés.
- **Périmètre** : saisons (période) ; défis d'équipe (objectif mesurable → XP bonus collectif) dont la progression est **calculée serveur** ; remise à zéro par saison (historisée). **Hors périmètre** : progression déclarée par le client.
- **Dépendances** : US-01 (calcul serveur) ; US-02 (équipe) ; RBAC (lead configure).
- **Endpoints / collections** : `POST /seasons`, `GET /seasons/{id}/challenges`, `POST /challenges/{id}/progress` · `seasons`, `challenges`.
- **Critères d'acceptation** :
```
Étant donné une saison active avec un défi « 50 déploiements sans échec »
Quand l'équipe déploie sans échec
Alors la progression du défi est mise à jour depuis GitLab (calcul serveur), pas déclarée.
Et à la fin de saison, les compteurs sont remis à zéro et la saison est archivée.
Et seul un lead peut créer ou modifier une saison / un défi.
```
