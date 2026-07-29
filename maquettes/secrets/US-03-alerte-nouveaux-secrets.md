# US-03 — Alerte nouveaux secrets

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-secrets-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : être **prévenu tout de suite** quand un secret jamais vu apparaît, sans relancer un scan à la main.
- **Périmètre** : scan planifié par un **job hors-ligne** (compte de service / Vault) ; à la détection d'une **empreinte inédite**, notification via **l'API d'envoi existante** (mail/Teams) ; escalade si critique (clé cloud/privée en prod). **Hors périmètre** : réimplémenter l'envoi.
- **Dépendances** : US-01 (empreintes) ; job hors-ligne (EPIC §2) ; API d'envoi existante.
- **Endpoints / collections** : `POST /secrets/scan-schedule`, `POST /secrets/alerts` · `scan_schedules`, `secret_findings`.
- **Critères d'acceptation** :
```
Étant donné un scan planifié chaque nuit
Quand le job détecte une empreinte absente de l'historique
Alors une alerte est envoyée (mail/Teams), même hub fermé.
Et une empreinte déjà connue ne redéclenche pas d'alerte (anti-bruit).
Et un secret critique en production déclenche une escalade immédiate.
```
