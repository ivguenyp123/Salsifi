# US-01 — Évaluations persistées

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-assess-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : conserver chaque évaluation (score + réponses + confrontation) au-delà du JSON local.
- **Périmètre** : POST d'un snapshot d'évaluation (front, après calcul) avec provenance ; GET d'une évaluation. **Hors périmètre** : le calcul du score (fait par le front).
- **Dépendances** : socle sécurité (EPIC §3) ; accès GitLab.
- **Endpoints / collections** : `POST /assessments`, `GET /assessments/{id}` · `assessments`.
- **Critères d'acceptation** :
```
Étant donné un token valide et l'accès au repo
Quand je POST une évaluation avec provenance (instance, squad, questionnaire_version, answers_hash)
Alors elle est enregistrée (upsert par instance+repo+squad+assessed_at+calculation_version).
Et un utilisateur sans accès au repo_id reçoit 403.
Et la même évaluation reçue deux fois ne crée pas de doublon.
```
