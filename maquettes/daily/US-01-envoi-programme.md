# US-01 — Envoi programmé

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-daily-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : recevoir le Daily **chaque matin sans ouvrir le hub** (la feature qui change tout).
- **Périmètre** : programmer une cadence (heure + jours ouvrés) par repo ; à l'échéance, un **job hors-ligne compose le rapport et appelle l'API d'envoi existante** (mail/Teams). **Hors périmètre** : réimplémenter l'envoi (l'API existe).
- **Dépendances** : API d'envoi existante ; job hors-ligne (compte de service / Vault, EPIC §2) ; US-02 (destinataires).
- **Endpoints / collections** : `POST/PATCH/DELETE /daily/schedules`, `POST /daily/send-now` · `daily_schedules`.
- **Critères d'acceptation** :
```
Étant donné une programmation « 08:30, jours ouvrés » active sur un repo
Quand l'heure arrive un jour ouvré
Alors le job compose le rapport du jour et appelle l'API d'envoi (mail + Teams), même hub fermé.
Et une exécution rejouée pour la même (repo, date, canal) ne renvoie pas deux fois (idempotent).
Et « Envoyer maintenant (test) » déclenche un envoi immédiat sans attendre l'échéance.
```
