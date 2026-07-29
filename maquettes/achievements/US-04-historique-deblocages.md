# US-04 — Historique des déblocages

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-achievements-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : retrouver **quand** chaque badge a été débloqué, et avoir les **mêmes badges partout** (cross-device).
- **Périmètre** : enregistrement de chaque déblocage (badge, date, XP) ; consultation par utilisateur et par équipe ; synchronisation entre appareils. **Hors périmètre** : historique borné au navigateur.
- **Dépendances** : US-01 (déblocages validés).
- **Endpoints / collections** : `GET /users/{user_id}/unlocks` · `unlocks`.
- **Critères d'acceptation** :
```
Quand un badge est débloqué (validé serveur)
Alors une entrée { badge, date, xp } est enregistrée et visible dans l'historique.
Et je retrouve les mêmes badges et le même historique sur un autre appareil.
Et un badge « perdu » (condition non maintenue) apparaît comme tel, sans effacer l'historique.
```
