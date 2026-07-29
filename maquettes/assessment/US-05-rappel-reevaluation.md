# US-05 — Rappel de ré-évaluation

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-assess-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : **ne pas oublier** de ré-évaluer (cadence trimestrielle) sans y penser.
- **Périmètre** : planifier un rappel par squad (défaut : dernière éval + 3 mois) ; à échéance, notification (mail/Teams) par un **job hors-ligne**, même hub fermé. **Hors périmètre** : forcer l'évaluation.
- **Dépendances** : US-01 ; jobs hors-ligne (webhooks / compte de service, EPIC §2).
- **Endpoints / collections** : `POST /reminders` · `reminders`.
- **Critères d'acceptation** :
```
Étant donné une évaluation d'une squad
Quand j'active le rappel trimestriel
Alors une échéance est fixée à dernière_éval + 3 mois.
Et à l'échéance, une notification est envoyée même si personne n'a le hub ouvert.
Et désactiver le rappel supprime l'échéance (tracé).
```
