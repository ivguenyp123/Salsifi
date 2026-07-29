# US — Secrets Scanner « mode bac » (index)

> **Architecture, auth, sécurité, endpoints et collections : voir `EPIC-secrets-bac.md`.**
> Une US = un besoin = **un fichier**. Chaque US ne contient que :
> *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

| # | US | Besoin | Fichier |
|---|---|---|---|
| 01 | Ingestion d'empreintes (jamais le secret) | persistance sûre | [`US-01-ingestion-empreintes.md`](US-01-ingestion-empreintes.md) |
| 02 | Cycle de vie des findings | statut gouverné | [`US-02-cycle-de-vie.md`](US-02-cycle-de-vie.md) |
| 03 | Alerte nouveaux secrets | scan planifié + notif | [`US-03-alerte-nouveaux-secrets.md`](US-03-alerte-nouveaux-secrets.md) |
| 04 | Dashboard posture | KPIs + tendance + MTTR | [`US-04-dashboard-posture.md`](US-04-dashboard-posture.md) |
| 05 | Faux positifs & waivers | risque accepté gouverné | [`US-05-faux-positifs-waivers.md`](US-05-faux-positifs-waivers.md) |
| 06 | Socle sécurité transversal | fondation | [`US-06-socle-securite.md`](US-06-socle-securite.md) |
