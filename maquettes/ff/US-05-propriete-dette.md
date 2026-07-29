# US-05 — Propriété & dette

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-ff-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

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
