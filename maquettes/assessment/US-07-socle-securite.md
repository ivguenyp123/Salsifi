# US-07 — Socle sécurité transversal

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-assess-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : garantir **l'intégrité** de bout en bout (le contrat de confiance).
- **Périmètre** : validation du token sans stockage, vérif d'accès au repo, provenance stampée, idempotency, audit, jetons de partage à portée limitée, secrets en Vault, RBAC, versionnage du questionnaire. *(détail : EPIC §3)*
- **Dépendances** : aucune (fondation des autres US).
- **Endpoints / collections** : transverse · `audit_log`, `rbac`, `shares`.
- **Critères d'acceptation** :
```
Quand un POST vise un repo_id auquel l'utilisateur n'a pas accès
Alors la réponse est 403.
Et un jeton de partage expiré ou révoqué ne donne plus accès.
Et toute modification d'une évaluation, d'un item de plan ou d'un partage crée une entrée d'audit.
```
