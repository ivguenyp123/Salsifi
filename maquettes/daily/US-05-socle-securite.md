# US-05 — Socle sécurité transversal

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-daily-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : garantir **l'intégrité** de bout en bout (le contrat de confiance).
- **Périmètre** : validation du token sans stockage, vérif d'accès au repo, secrets d'envoi (mail/Teams) en Vault, idempotency d'envoi, audit, RBAC. *(détail : EPIC §3)*
- **Dépendances** : aucune (fondation des autres US).
- **Endpoints / collections** : transverse · `audit_log`, `rbac`.
- **Critères d'acceptation** :
```
Quand un envoi programmé s'exécute
Alors il n'utilise jamais un token utilisateur stocké ; les secrets d'envoi viennent de Vault.
Et un rapport n'est envoyé qu'à des destinataires ayant accès au repo (sinon exclus/403).
Et tout envoi, modification de programmation ou génération de digest crée une entrée d'audit.
```
