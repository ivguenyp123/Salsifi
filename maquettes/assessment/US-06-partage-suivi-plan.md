# US-06 — Partage & suivi du plan d'action

> Architecture, auth, sécurité, endpoints et collections : voir `EPIC-assess-bac.md`.
> Cette US ne contient que : *valeur · périmètre · dépendances · endpoints & collections · critères d'acceptation*.

- **Valeur** : **partager** un résultat (tribu/direction) et **suivre le plan** issu des écarts jusqu'à vérification.
- **Périmètre** : lien de partage en **lecture seule** (jeton à portée limitée, révocable) ; plan d'action avec statut par item (à faire / en cours / fait) et **vérification à J+30**. **Hors périmètre** : partage en écriture.
- **Dépendances** : US-01, US-03 (écarts → items) ; RBAC ; idempotency.
- **Endpoints / collections** : `POST /assessments/{id}/share`, `DELETE /shares/{token}`, `POST /assessments/{id}/action-plan`, `PATCH /action-items/{item_id}` · `shares`, `action_items`.
- **Critères d'acceptation** :
```
Quand un lead génère un lien de partage
Alors le destinataire voit le rapport en lecture seule, sans pouvoir le modifier (RBAC viewer),
et le lien est révocable et tracé.
Et quand je fais avancer un item du plan (à faire → en cours → fait)
Alors son statut et sa date de vérification J+30 sont conservés et visibles dans le suivi.
```
