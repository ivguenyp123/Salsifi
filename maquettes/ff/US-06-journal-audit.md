# US-06 — Journal d'audit

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-ff-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

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
