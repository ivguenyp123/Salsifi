# US-01 — Liste & état des flags

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-ff-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : voir d'un coup l'inventaire des flags et leur état réel.
- **Périmètre** : liste (statut ON/OFF, environnements, rollout %, owner, âge, dernière modif). État lu depuis GitLab, méta depuis le bac (fusion).
- **Dépendances** : accès GitLab ; US-05 (owner).
- **Endpoints / collections** : GitLab `GET /feature_flags` · bac `GET /flags/{repo}/{key}/meta` · `flag_meta`.
- **Critères d'acceptation** :
```
Quand j'ouvre le module
Alors chaque flag affiche statut, environnements, rollout %, owner et âge,
l'état venant de GitLab et la propriété/dette venant du bac.
```
