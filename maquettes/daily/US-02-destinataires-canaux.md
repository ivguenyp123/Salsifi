# US-02 — Destinataires & canaux

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-daily-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : envoyer **au bon monde, sur le bon canal**, sans fuite d'activité inter-équipes.
- **Périmètre** : configurer par programmation les destinataires (mail) et le canal Teams ; RBAC (seul un lead configure) ; les destinataires doivent avoir **accès au repo**.
- **Dépendances** : US-01 ; socle RBAC + vérif d'accès (EPIC §3).
- **Endpoints / collections** : `PATCH /daily/schedules/{id}` · `daily_schedules`, `rbac`.
- **Critères d'acceptation** :
```
Étant donné un utilisateur « viewer » ou « contributor »
Quand il tente de modifier les destinataires d'une programmation
Alors l'action est refusée (403) ; seul un lead configure.
Et un destinataire sans accès au repo est signalé et exclu de l'envoi.
Et le canal (mail, Teams, ou les deux) est mémorisé par programmation.
```
