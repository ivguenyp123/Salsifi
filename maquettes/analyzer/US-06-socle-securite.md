# US-06 — Socle sécurité transversal

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-analyzer-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : garantir **l'intégrité** de bout en bout (le contrat de confiance).
- **Périmètre** : validation du token sans stockage, vérif d'accès au repo, provenance stampée, idempotency, audit, token de service & secrets d'envoi en Vault, RBAC (vue org bornée aux accès). *(détail : EPIC §3)*
- **Dépendances** : aucune (fondation des autres US).
- **Endpoints / collections** : transverse · `audit_log`, `rbac`.
- **Critères d'acceptation** :
```
Quand un POST vise un repo_id auquel l'utilisateur n'a pas accès
Alors la réponse est 403, et le repo n'apparaît pas dans sa vue org.
Et les scans hors-ligne n'utilisent jamais un token utilisateur (compte de service en Vault).
Et toute config de scan/alerte ou snapshot rejeté crée une entrée d'audit.
```
