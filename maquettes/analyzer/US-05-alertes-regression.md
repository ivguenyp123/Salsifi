# US-05 — Alertes de régression

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-analyzer-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : être **prévenu quand un repo se dégrade**, sans surveiller à la main.
- **Périmètre** : à chaque scan, comparer au précédent ; alerter si le score chute (> seuil), si un **nouveau red flag** apparaît, ou si le **bus factor tombe à 1** ; notif via l'API d'envoi existante. **Hors périmètre** : alerter sur amélioration/bruit.
- **Dépendances** : US-01, US-04 ; API d'envoi existante.
- **Endpoints / collections** : `POST /repo-health/alerts` · `regression_alerts`, `repo_health_snapshots`.
- **Critères d'acceptation** :
```
Étant donné deux snapshots successifs d'un repo
Quand le score chute de plus de 10 points, ou qu'un nouveau red flag apparaît, ou que le bus factor passe à 1
Alors une alerte est envoyée (mail/Teams), même hub fermé.
Et une simple amélioration ne déclenche pas d'alerte.
```
