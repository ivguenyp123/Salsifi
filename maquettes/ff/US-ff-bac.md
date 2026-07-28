# US — Feature Flags « mode bac »

> **Architecture, auth, sécurité, endpoints et collections : voir `EPIC-ff-bac.md`.**
> Chaque US ne contient que : *valeur métier · périmètre · dépendances · endpoints &
> collections · critères d'acceptation*. Une US = un besoin.

---

## US-01 — Liste & état des flags
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

## US-02 — Changer le statut (RBAC / kill switch)
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

## US-03 — Rollout progressif au deploy
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

## US-04 — Approbation des bascules
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

## US-05 — Propriété & dette
- **Valeur** : savoir **qui possède** chaque flag et **nettoyer** les flags morts.
- **Périmètre** : owner par flag ; détection de dette (100 % depuis > N jours, ou OFF oublié) ; décommission gouvernée (+ US Jira de retrait du code).
- **Dépendances** : RBAC (owner : owner/admin ; décommission : admin) ; idempotency Jira.
- **Endpoints / collections** : bac `PUT .../owner`, `GET /flags/{repo}/debt`, `POST .../decommission` · `flag_meta`.
- **Critères d'acceptation** :
```
Étant donné un flag actif à 100 % depuis plus de 90 jours
Alors il apparaît comme « mort » avec son owner dans « Nettoyage & dette ».
Et « Décommissionner » (admin) crée l'US Jira de retrait et marque le flag « decommissioning ».
Et seul l'owner (ou un admin) peut changer l'owner d'un flag.
```

## US-06 — Journal d'audit
- **Valeur** : **traçabilité** complète, au-delà de l'audit limité de GitLab.
- **Périmètre** : enregistrement de chaque création / bascule / extension / approbation / rollback / décommission ; consultation par flag et globale.
- **Dépendances** : toutes les US écrivant un changement.
- **Endpoints / collections** : bac `GET/POST /flags/.../audit` · `flag_audit`.
- **Critères d'acceptation** :
```
Quand un changement est appliqué (bascule, extension, approbation, rollback, décommission)
Alors une entrée { acteur, date, avant → après } est enregistrée,
visible dans la fiche du flag et dans le journal global.
```
