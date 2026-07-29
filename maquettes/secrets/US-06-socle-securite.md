# US-06 — Socle sécurité transversal

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-secrets-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : garantir que **le secret ne fuit jamais** et que tout est tracé (le contrat de confiance).
- **Périmètre** : jamais de valeur de secret côté bac (empreinte salée), validation du token sans stockage, vérif d'accès au repo, idempotency, audit, token de service & secrets d'envoi en Vault, RBAC. *(détail : EPIC §3)*
- **Dépendances** : aucune (fondation des autres US).
- **Endpoints / collections** : transverse · `secret_audit`, `rbac`.
- **Critères d'acceptation** :
```
Quand un finding est ingéré
Alors il ne contient qu'une empreinte (hash salé), jamais la valeur du secret ni de quoi la reconstituer.
Et un POST visant un repo_id sans accès reçoit 403.
Et tout changement de statut, waiver ou alerte crée une entrée d'audit.
```
