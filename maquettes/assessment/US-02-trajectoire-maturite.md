# US-02 — Trajectoire de maturité

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-assess-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : voir la maturité **évoluer dans le temps** (indice global + par axe) et vérifier qu'une progression **tient**.
- **Périmètre** : série de l'indice /100 et des 8 axes par **période** (30/90/180 j, 1 an, 2 ans) ; delta par axe vs évaluation précédente ; gestion « données insuffisantes ».
- **Dépendances** : US-01 (évaluations) ; même `questionnaire_version` pour comparer.
- **Endpoints / collections** : `GET /assessments?period=`, `GET /squads/{squad_id}/trajectory?period=` · `assessments`.
- **Critères d'acceptation** :
```
Étant donné plusieurs évaluations d'une squad sur 2 ans
Quand je choisis « 1 an »
Alors la courbe et la fenêtre d'analyse ne portent que sur 1 an.
Et si moins de 2 évaluations existent sur la période, aucune tendance n'est affichée.
Et deux évaluations de questionnaire_version différentes ne sont pas comparées silencieusement (signalées).
```
