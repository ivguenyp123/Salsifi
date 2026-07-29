# US-04 — Approbation des bascules

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-ff-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : une bascule sensible (prod, ou par un contributor) passe par une **validation**.
- **Périmètre** : demande de changement (change-request) → approbation par un maintainer → application par le navigateur de l'approbateur. RBAC + audit.
- **Dépendances** : US-02, US-03 ; RBAC.
- **Endpoints / collections** : bac `POST .../change-requests`, `POST /change-requests/{id}/approve|reject|applied` · `change_requests`.
- **Critères d'acceptation** :
```
Étant donné un contributor qui demande une extension en production
Quand il soumet la demande
Alors une change-request « pending » est créée (rien n'est appliqué).
Et quand un maintainer l'approuve, le changement est appliqué et la demande passe « applied ».
Et la demande et l'approbation sont tracées avec les deux acteurs.
```
