# US-02 — Cycle de vie des findings

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-secrets-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : suivre chaque secret **de la détection à la résolution**, au lieu d'une liste qui repart de zéro à chaque scan.
- **Périmètre** : statut par finding (nouveau → confirmé → en rotation → résolu, ou faux positif), avec acteur et date ; RBAC (analyst+ change le statut). **Hors périmètre** : la remédiation technique elle-même.
- **Dépendances** : US-01 ; socle RBAC + audit (EPIC §3).
- **Endpoints / collections** : `PATCH /secrets/findings/{id}` · `secret_findings`, `secret_audit`.
- **Critères d'acceptation** :
```
Étant donné un utilisateur « viewer »
Quand il tente de changer le statut d'un finding
Alors l'action est refusée (403).
Et un analyste peut faire passer un finding nouveau → confirmé → en rotation → résolu,
chaque transition étant tracée { acteur, date, avant → après }.
Et un finding résolu qui réapparaît (même empreinte) rouvre en « nouveau » et alerte.
```
