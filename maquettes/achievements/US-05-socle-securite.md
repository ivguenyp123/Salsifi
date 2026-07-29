# US-05 — Socle sécurité transversal

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-achievements-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : garantir l'**équité et l'intégrité** (le contrat de confiance du jeu).
- **Périmètre** : XP autoritatif côté serveur uniquement, validation du token sans stockage, vérif d'accès équipe/repo, idempotency des déblocages, audit, token de service en Vault, RBAC. *(détail : EPIC §3)*
- **Dépendances** : aucune (fondation des autres US).
- **Endpoints / collections** : transverse · `audit_log`, `rbac`.
- **Critères d'acceptation** :
```
Quand un score est établi pour le classement
Alors il provient du calcul serveur, jamais d'un XP fixé par le client.
Et un utilisateur ne voit que les leaderboards des équipes dont il est membre (403 sinon).
Et toute attribution/retrait de badge ou ajustement crée une entrée d'audit.
```
