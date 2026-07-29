# US-05 — Faux positifs & waivers

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-secrets-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : **réduire le bruit** sans masquer un vrai risque durablement.
- **Périmètre** : marquer un finding « faux positif » (gouverné) ; poser un **waiver** = risque accepté avec **motif + expiration** (admin) ; à expiration, le finding **réapparaît**. **Hors périmètre** : suppression silencieuse et définitive.
- **Dépendances** : US-02 (statut) ; RBAC (admin pour waiver) ; audit.
- **Endpoints / collections** : `POST /secrets/findings/{id}/waiver`, `DELETE /secrets/waivers/{id}` · `secret_waivers`, `secret_audit`.
- **Critères d'acceptation** :
```
Étant donné un finding jugé acceptable temporairement
Quand un admin pose un waiver avec motif et date d'expiration
Alors le finding sort des « actifs » jusqu'à l'expiration, avec le motif tracé.
Et à l'expiration, le finding réapparaît comme actif (pas oublié).
Et un « faux positif » et un « waiver » sont distincts et audités.
```
