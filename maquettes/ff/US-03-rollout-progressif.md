# US-03 — Rollout progressif au deploy

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-ff-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : déployer une feature **graduellement** (OFF → 10 % → 50 % → 100 %) sans risque, avec **rollback**.
- **Périmètre** : planifier les paliers ; application **au prochain déploiement** par un job CI ; santé (taux d'erreur, exposés) ; auto-rollback au dépassement de seuil. **Hors périmètre** : changement à chaud.
- **Dépendances** : US-02 (statut) ; webhook/CI deploy (EPIC §2).
- **Endpoints / collections** : bac `POST .../rollout-schedule`, `GET .../rollout-target`, `POST .../rollout-applied` · `rollout_schedules`.
- **Critères d'acceptation** :
```
Étant donné un flag au palier 10 % en production
Quand un maintainer clique « Étendre à 50 % »
Alors 50 % est planifié pour le PROCHAIN déploiement (pas immédiat),
et au déploiement le job CI applique 50 % puis renvoie la santé.
Et si le taux d'erreur dépasse le seuil, un rollback au palier précédent est déclenché et tracé.
```
