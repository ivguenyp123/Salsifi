# US-03 — Confrontation déclaratif ↔ GitLab conservée

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-assess-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : garder la **mise en perspective** (perception vs données réelles) et voir si les **écarts se réduisent**.
- **Périmètre** : stockage, avec l'évaluation, des écarts par axe (déclaratif vs GitLab) et de leur source ; consultation dans le temps. **Hors périmètre** : recalcul par le bac (il conserve, il ne recalcule pas à l'aveugle).
- **Dépendances** : US-01 (évaluations) ; endpoints GitLab (EPIC §4).
- **Endpoints / collections** : `GET /assessments/{id}/confrontation` · `assessments`.
- **Critères d'acceptation** :
```
Quand j'ouvre une évaluation passée
Alors je vois, par axe, la réponse déclarative et la donnée GitLab confrontée au moment de l'éval,
avec source_counts (provenance).
Et je peux comparer les écarts d'une évaluation à l'autre pour la même squad.
```
