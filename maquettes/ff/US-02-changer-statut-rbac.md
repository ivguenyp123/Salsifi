# US-02 — Changer le statut (RBAC / kill switch)

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-ff-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : basculer un flag ON/OFF, avec les **bons droits** (couper vite en incident).
- **Périmètre** : toggle immédiat par un maintainer (appliqué par son navigateur) + audit. RBAC vérifié côté bac.
- **Dépendances** : socle RBAC (EPIC §3) ; US-06 (audit).
- **Endpoints / collections** : GitLab `PUT /feature_flags/:name` · bac `POST /flags/.../audit` · `flag_audit`, `rbac`.
- **Critères d'acceptation** :
```
Étant donné un utilisateur « viewer » ou « contributor »
Quand il tente de basculer un flag
Alors l'action est refusée (interrupteur verrouillé, 403 côté API).
Et un maintainer peut basculer OFF immédiatement (kill switch), tracé au journal.
```
