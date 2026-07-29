# US-03 — Archive des rapports

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-daily-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : **retrouver un rapport passé** au-delà de la fenêtre bornée de l'API GitLab.
- **Périmètre** : conserver chaque rapport composé (auto ou test) ; consultation par date ; recherche. **Hors périmètre** : recomposer un rapport ancien depuis GitLab (les données peuvent avoir disparu de la fenêtre API).
- **Dépendances** : US-01 (composition) ; RBAC (viewer+).
- **Endpoints / collections** : `GET /daily/archive?repo_id=&from=&to=`, `GET /daily/archive/{id}` · `daily_archive`.
- **Critères d'acceptation** :
```
Quand un rapport est composé (programmé ou test)
Alors il est archivé avec sa date, son repo et son contenu.
Et je peux rouvrir un rapport d'il y a plusieurs mois même s'il n'est plus dans la fenêtre de l'API GitLab.
Et un utilisateur sans accès au repo ne voit pas son archive (403).
```
