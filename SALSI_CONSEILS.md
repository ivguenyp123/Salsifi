# Salsi — Conseils par badge (à valider)

Relis chaque conseil et coche-le quand il te va. Généré depuis `js/gaming-recipes.js` (fidèle à la prod). 47 badges.


---

## 🚀 Delivery

### Frequent Deploy  <sub>`frequent_deploy` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : ≥ 5 pipelines réussis / semaine (cible ≥ 5)
- **Pourquoi** : Déployer souvent, c'est réduire le **risque** : de petits changements fréquents sont plus faciles à vérifier et à annuler qu'une grosse livraison rare. Les équipes qui livrent souvent ont paradoxalement **moins d'incidents**, parce que chaque déploiement embarque peu de nouveautés.
- **Comment on fait** :
  1. Découpe tes features en **petits incréments** livrables (ce qui est fini part, le reste attend derrière un flag).
  2. Merge vers `main` **tous les jours** plutôt que d'accumuler une grosse branche.
  3. Automatise le déploiement en dev/test pour qu'il ne coûte rien (un merge = un déploiement).
- **Outil qui aide** : Feature Flag Manager

### High Frequency Deploy  <sub>`high_frequency_deploy` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : ≥ 10 pipelines réussis / semaine (cible ≥ 10)
- **Pourquoi** : Le niveau **Elite** (DORA) déploie plusieurs fois par jour. La clé n'est pas de coder plus vite, mais de **découpler le déploiement de la mise en visibilité** : on livre le code en continu, on active la fonctionnalité quand on veut.
- **Comment on fait** :
  1. Sépare **déployer** (mettre le code en prod) et **publier** (l'exposer aux users) via des **feature flags**.
  2. Mets en place une chaîne de **déploiement continu** jusqu'à un environnement de test à chaque merge.
  3. Réduis la taille des lots : plus c'est petit, plus c'est fréquent et sûr.
- **Outil qui aide** : Feature Flag Manager

### Fast Pipeline  <sub>`fast_pipeline` · 📋 modèle à coller</sub>

- [ ] **Validé**
- **Objectif** : Durée moyenne pipeline < 10 min (cible < 10 min)
- **Pourquoi** : Un pipeline lent, c'est du **feedback lent** : le dev attend, se déconcentre, empile les changements. Sous 10 min, on garde le flow. Les leviers : **cache**, **parallélisme** et images légères.
- **Comment on fait** :
  1. Mets en **cache** les dépendances (node_modules, .m2, .venv…) entre les jobs.
  2. Fais tourner les jobs indépendants **en parallèle** (pas en série).
  3. Utilise des images Docker **légères** (alpine, slim) pour démarrer plus vite.
- **Outil qui aide** : Pipeline Generator
- **Modèle** :

```yaml
# Cache + parallélisme (exemple npm)
default:
  cache:
    key: "$CI_COMMIT_REF_SLUG"
    paths:
      - .npm/

lint:
  stage: test
  script: [ "npm ci --cache .npm --prefer-offline", "npm run lint" ]

test:
  stage: test
  script: [ "npm ci --cache .npm --prefer-offline", "npm test" ]
# lint et test tournent en parallèle car même stage
```

### Very Fast Pipeline  <sub>`very_fast_pipeline` · 📋 modèle à coller</sub>

- [ ] **Validé**
- **Objectif** : Durée moyenne pipeline < 5 min (cible < 5 min)
- **Pourquoi** : Sous **5 min**, le pipeline devient invisible : on push, on a la réponse quasi tout de suite. On y arrive en ne rejouant que le nécessaire et en enchaînant les jobs par dépendances plutôt que par étapes bloquantes.
- **Comment on fait** :
  1. Utilise `needs:` pour lancer un job dès que ses dépendances sont prêtes (DAG, pas de stage qui bloque tout).
  2. Ne teste que ce qui change quand c'est possible (tests ciblés, `rules:changes`).
  3. Sors les tâches lentes (scans lourds) sur un pipeline planifié, hors du chemin critique.
- **Outil qui aide** : Pipeline Generator
- **Modèle** :

```yaml
build:
  stage: build
  script: [ "make build" ]

test:
  stage: test
  needs: [ "build" ]   # démarre dès que build est fini, sans attendre le reste
  script: [ "make test" ]
```

### Pipeline as Code  <sub>`pipeline_as_code` · 📄 fichier (MR)</sub>

- [ ] **Validé**
- **Objectif** : .gitlab-ci.yml présent (cible Présent)
- **Pourquoi** : Le pipeline « as code » (`.gitlab-ci.yml` versionné) rend ta chaîne de build **reproductible, relisible et historisée** : tout le monde voit comment ça se construit, et un changement de CI passe en revue comme le reste du code.
- **Comment on fait** :
  1. Ajoute un fichier `.gitlab-ci.yml` à la racine.
  2. Décris tes étapes (build, test, deploy).
  3. Au commit, GitLab lance le pipeline automatiquement.
- **Outil qui aide** : Pipeline Generator
- **Modèle** :

```yaml
stages:
  - build
  - test

build:
  stage: build
  script:
    - echo "TODO: build"

test:
  stage: test
  script:
    - echo "TODO: tests"
```

### Green Pipeline  <sub>`green_pipeline` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : Taux de succès > 90% (cible > 90%)
- **Pourquoi** : Un taux de succès > 90 %, c'est un pipeline **digne de confiance**. Le pire ennemi, ce sont les **tests flaky** (qui échouent au hasard) : ils poussent l'équipe à relancer sans réfléchir, et à ignorer les vrais échecs.
- **Comment on fait** :
  1. Repère les tests instables (échecs intermittents) et **isole-les** (quarantaine) le temps de les corriger.
  2. Corrige les causes : dépendances au temps, à l'ordre, à des services externes non mockés.
  3. Traite un pipeline rouge comme une **urgence**, pas comme du bruit.

### High Stability  <sub>`high_stability` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : Taux de succès > 95% (cible > 95%)
- **Pourquoi** : Au-delà de 95 % de succès, ta CI est un vrai **filet de sécurité** : quand elle est rouge, c'est un vrai problème. C'est le socle pour automatiser le déploiement en confiance.
- **Comment on fait** :
  1. Élimine **tous** les tests flaky restants (tolérance zéro).
  2. Ajoute des tests là où les incidents passés sont passés (chaque bug = un test de non-régression).
  3. Surveille la tendance : une baisse du taux de succès est un signal avant l'incident.

### Recovery Master  <sub>`recovery_master` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : MTTR < 2h (temps moyen de recovery) (cible < 2h)
- **Pourquoi** : Le **MTTR** (temps de rétablissement) compte plus que le taux de panne : tout le monde a des incidents, les meilleurs s'en **remettent vite** (< 2 h). Ça demande de savoir vite **quoi** casse et de pouvoir **revenir en arrière** sans stress.
- **Comment on fait** :
  1. Mets en place des **alertes** qui préviennent avant les utilisateurs.
  2. Écris des **runbooks** courts : « si X tombe, faire Y ».
  3. Garde un **rollback** testé et un chemin de déploiement rapide pour le correctif.

### No Failed Streak  <sub>`no_failed_streak` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : Max 1 pipeline failed consécutif (cible ≤ 1)
- **Pourquoi** : Une **série d'échecs** consécutifs (≥ 2), c'est le signe qu'on a continué à merger par-dessus un pipeline rouge. Chaque échec doit être traité avant de repartir, sinon on empile les problèmes.
- **Comment on fait** :
  1. Applique le principe « **on ne construit pas sur du rouge** » : pipeline cassé = priorité n°1.
  2. Bloque le merge tant que la CI n'est pas verte (règle de MR).
  3. Rends l'échec visible (notif équipe) pour qu'il soit repris tout de suite.

### Deploy from Main  <sub>`deploy_from_main` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : 100% des déploiements via main (cible 100%)
- **Pourquoi** : Déployer **uniquement depuis `main`** garantit que ce qui part en prod est bien passé par la revue et la CI. Déployer depuis une branche feature, c'est mettre en prod du code non validé — la porte ouverte aux surprises.
- **Comment on fait** :
  1. Restreins le job de déploiement à la branche par défaut : `rules: [{ if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH' }]`.
  2. Protège `main` pour que tout y passe par une MR revue.
  3. Fais des correctifs urgents via une MR express sur `main`, pas un déploiement de branche.

### Tagged Releases  <sub>`tagged_releases` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : ≥ 1 release taguée / mois (cible ≥ 1)
- **Pourquoi** : Un **tag Git** par release, c'est un point de repère immuable : on sait exactement quel code est en prod, on peut y revenir, et on relie livraison ↔ changements. Sans tag, « la version d'hier » n'existe nulle part.
- **Comment on fait** :
  1. Crée un tag à chaque livraison : `git tag v1.2.0 && git push --tags`.
  2. Idéalement, automatise-le dans un job de release qui tague sur `main`.
  3. Associe une **release note** au tag pour tracer ce qui change.
- **Outil qui aide** : Release Notes

### Semver  <sub>`semver` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : Tags suivent semver (vX.Y.Z) (cible vX.Y.Z)
- **Pourquoi** : Le **versionnage sémantique** (`vMAJEUR.MINEUR.CORRECTIF`) communique la nature du changement d'un coup d'œil : **MAJEUR** = cassant, **MINEUR** = nouveauté compatible, **CORRECTIF** = bugfix. Tes consommateurs savent s'ils peuvent mettre à jour sans risque.
- **Comment on fait** :
  1. Adopte le format `vX.Y.Z` pour tous tes tags.
  2. Incrémente **Z** pour un correctif, **Y** pour une fonctionnalité compatible, **X** pour une rupture.
  3. Note les ruptures explicitement dans la release.

---

## 🔍 Qualité & Revue

### Code Review Champion  <sub>`code_review_champion` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : ≥ 80% des MR avec approbation (cible ≥ 80%)
- **Pourquoi** : La revue de code n'est pas une formalité : c'est le moment où le savoir se **partage** et où les défauts sont attrapés au moins cher. Un fort taux de MR relues = une équipe qui apprend ensemble et un bus factor qui monte.
- **Comment on fait** :
  1. Fais de la revue une **priorité quotidienne** (bloc de temps dédié) — une MR qui attend, c'est du travail figé.
  2. Exige au moins une approbation avant merge.
  3. Relis pour **comprendre**, pas pour tamponner : pose des questions, propose des alternatives.

### Review Speed  <sub>`review_speed` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : Temps moyen de review < 2 jours (cible < 2 jours)
- **Pourquoi** : Une revue rapide garde le flux : plus une MR attend, plus l'auteur perd le contexte et plus les conflits s'accumulent. Viser une **première réponse dans la journée** change tout au rythme de l'équipe.
- **Comment on fait** :
  1. Définis un engagement d'équipe : « toute MR reçoit une première revue sous 24 h ».
  2. Notifie les relecteurs (assignation, canal dédié).
  3. Préfère plusieurs petites MR relisables vite à une grosse qui décourage.

### Very Fast Review  <sub>`very_fast_review` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : Temps de review < 1 jour (cible < 1 jour)
- **Pourquoi** : Une revue sous quelques heures, c'est le signe d'une équipe fluide où le code circule. Ça se gagne surtout en **rendant les MR petites** : on relit 50 lignes en 5 min, pas 800.
- **Comment on fait** :
  1. Réduis la taille des MR (voir le badge « Small MR »).
  2. Mets en place une rotation ou un binôme de revue pour qu'il y ait toujours quelqu'un.
  3. Automatise le style/lint pour que la revue se concentre sur le fond.

### Approval Rules  <sub>`approval_rules` · ⚙️ réglage GitLab</sub>

- [ ] **Validé**
- **Objectif** : 2 approbateurs requis, author exclu (cible Activé)
- **Pourquoi** : Des **règles d'approbation** garantissent qu'aucun code n'arrive en prod sans qu'un pair l'ait validé. C'est un contrôle simple qui attrape énormément de défauts et protège les zones sensibles.
- **Comment on fait** :
  1. GitLab → **Settings → Merge requests → Approvals**.
  2. Exige **au moins 1 approbation** (2 sur les repos critiques).
  3. Cible des approbateurs par zone via `CODEOWNERS` si besoin.
- **Note** : Réglage projet (pas un fichier) — l'application se fait côté GitLab.

### Reset Approvals  <sub>`reset_approvals` · ⚙️ réglage GitLab</sub>

- [ ] **Validé**
- **Objectif** : Approvals invalidées après push (cible Activé)
- **Pourquoi** : Sans « reset des approbations sur nouveau push », on peut faire approuver une MR… puis y ajouter du code non revu juste avant le merge. Réinitialiser force une **re-validation** de ce qui a réellement changé.
- **Comment on fait** :
  1. GitLab → **Settings → Merge requests**.
  2. Active « **Remove all approvals when commits are added** ».
  3. Combine avec « au moins 1 approbation requise ».
- **Note** : Réglage projet — côté GitLab.

### Small MR  <sub>`small_mr` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : Taille moyenne MR < 200 lignes (cible < 200)
- **Pourquoi** : La taille de la MR est le premier facteur de qualité de revue : au-delà de ~400 lignes, l'attention chute et les bugs passent. Les petites MR sont relues vite, mieux, et se mergent sans friction.
- **Comment on fait** :
  1. Découpe une grosse feature en **plusieurs MR** qui s'enchaînent (chacune complète et testable).
  2. Sépare le **refactoring** du changement fonctionnel (deux MR distinctes).
  3. Vise < 400 lignes ajoutées par MR.

### Tiny MR  <sub>`tiny_mr` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : Taille moyenne MR < 50 lignes (cible < 50)
- **Pourquoi** : Les toutes petites MR (< 100 lignes) sont l'idéal : quasi impossibles à faire passer un bug, relues en minutes, mergées le jour même. C'est un vrai super-pouvoir d'équipe.
- **Comment on fait** :
  1. Pense « **plus petit incrément qui a du sens** » à chaque fois.
  2. Livre les fondations d'abord (interfaces, tests) puis l'implémentation.
  3. N'aie pas peur d'enchaîner 5 MR de 60 lignes plutôt qu'une de 300.

### Low MR Files  <sub>`low_mr_files` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : < 10 fichiers modifiés par MR (cible < 10)
- **Pourquoi** : Une MR qui touche des dizaines de fichiers est difficile à tenir dans sa tête. Peu de fichiers = changement **focalisé**, plus facile à revoir et à annuler si besoin.
- **Comment on fait** :
  1. Un objectif = une MR : évite de mélanger plusieurs sujets.
  2. Isole les renommages/déplacements massifs dans une MR à part.
  3. Si beaucoup de fichiers changent « mécaniquement », explique-le en description.

### No Merge Without Approval  <sub>`no_merge_without_approval` · ⚙️ réglage GitLab</sub>

- [ ] **Validé**
- **Objectif** : 0 MR mergées sans approval (cible 0)
- **Pourquoi** : Interdire le merge sans approbation, c'est rendre la revue **non contournable**. Sinon, sous pression, on finit par merger « juste cette fois » — et c'est là que ça casse.
- **Comment on fait** :
  1. GitLab → **Settings → Merge requests** : exige au moins 1 approbation.
  2. Empêche l'auteur d'approuver sa propre MR.
  3. Protège `main` pour que la règle s'applique à tout.
- **Note** : Réglage projet — côté GitLab.

### Constructive Reviews  <sub>`constructive_reviews` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : > 3 commentaires / MR (cible > 3)
- **Pourquoi** : Le **nombre** de commentaires n'est qu'un proxy : ce qui compte, c'est une revue qui fait **avancer** le code et monter l'auteur en compétence. Une revue vivante (questions, alternatives, encouragements) vaut mieux qu'un « LGTM » vide.
- **Comment on fait** :
  1. Commente le **pourquoi**, propose des pistes, distingue « bloquant » de « suggestion ».
  2. Reconnais ce qui est bien fait, pas seulement ce qui cloche.
  3. Prends les échanges tendus en direct (appel) plutôt qu'en fil interminable.

---

## 🛡️ Stabilité

### Stable Build  <sub>`stable_build` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : Taux de succès > 90% (cible > 90%)
- **Pourquoi** : Un build stable, c'est la base de tout le reste : si la CI n'est pas fiable, personne ne lui fait confiance et les garde-fous sautent. La stabilité se construit en traquant l'aléatoire (flaky, dépendances externes).
- **Comment on fait** :
  1. Rends les builds **déterministes** : versions figées (lock files), pas d'appel réseau non maîtrisé.
  2. Mocke les services externes dans les tests.
  3. Corrige à la source dès qu'un job échoue « au hasard ».

### Pipeline Resilient  <sub>`pipeline_resilient` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : Échecs isolés (max 1 consécutif) (cible ≤ 1)
- **Pourquoi** : Un pipeline résilient limite les **échecs consécutifs** : il retente ce qui est transitoire (réseau) mais ne masque pas les vrais problèmes. L'idée est de ne pas rester bloqué sur des faux négatifs.
- **Comment on fait** :
  1. Ajoute un `retry` ciblé sur les erreurs transitoires (pas sur les échecs de test).
  2. Sépare « infra qui flanche » (retry) de « code cassé » (à corriger).
  3. Alerte quand un job retente trop souvent : c'est un symptôme.

### Quick Fix  <sub>`quick_fix` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : MTTR < 2h (cible < 2h)
- **Pourquoi** : Réparer vite un pipeline rouge, c'est protéger la productivité de **toute l'équipe** : tant que `main` est cassé, plus personne ne peut merger sereinement. La rapidité de correction est un réflexe culturel.
- **Comment on fait** :
  1. Règle : un `main` rouge se corrige (ou se **revert**) **immédiatement**.
  2. En cas de doute, **revert d'abord**, comprends ensuite.
  3. Garde le dernier commit petit pour pouvoir revenir en arrière sans douleur.

### No Pipeline Red  <sub>`no_pipeline_red` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : Aucun pipeline failed sur la semaine (cible 0 échec)
- **Pourquoi** : Passer une semaine sans pipeline rouge sur `main`, c'est le signe d'une chaîne saine. Ça se gagne en amont : rien de cassé n'arrive sur `main` parce que tout y passe vert.
- **Comment on fait** :
  1. Bloque le merge tant que la MR n'est pas verte.
  2. Fais tourner la CI sur la MR **avant** merge, pas seulement après.
  3. Traite les flaky : ils sont la première cause de rouge « injuste ».

### Trend Up  <sub>`trend_up` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : Taux succès en hausse sur 1 mois (cible Hausse)
- **Pourquoi** : Ce badge récompense une **trajectoire** : peu importe d'où tu pars, tu progresses. C'est le meilleur état d'esprit — viser l'amélioration continue plutôt qu'un score parfait d'un coup.
- **Comment on fait** :
  1. Choisis **un** indicateur à améliorer ce mois-ci (ex. durée pipeline).
  2. Fais un petit pas mesurable, observe, recommence.
  3. Célèbre les progrès : la régularité bat l'héroïsme.

---

## 🧹 Hygiène du dépôt

### Clean Repo  <sub>`clean_repo` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : 0 branches inactives > 30 jours (cible 0)
- **Pourquoi** : Un dépôt propre (peu de branches mortes, pas de vieux artefacts) réduit le **bruit** : on trouve vite l'info, on ne se trompe pas de branche, la CI ne traîne pas des scories. L'hygiène, c'est de la vitesse plus tard.
- **Comment on fait** :
  1. Supprime les branches déjà mergées et les branches abandonnées.
  2. Active la suppression auto de la branche source au merge.
  3. Range : pas de gros binaires ni de secrets dans l'historique.
- **Outil qui aide** : Branch Monitor

### Stale Branch Hunter  <sub>`stale_branch_hunter` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : < 5 branches inactives (cible < 5)
- **Pourquoi** : Les **branches mortes** (sans activité depuis longtemps) sont des pièges : on ne sait plus si elles contiennent du travail à récupérer ou du code abandonné. Les traquer régulièrement garde le dépôt lisible.
- **Comment on fait** :
  1. Repère les branches inactives depuis > 30 jours.
  2. Pour chacune : merger, ou archiver l'idée dans une issue, puis supprimer.
  3. Instaure une revue de branches mensuelle.
- **Outil qui aide** : Branch Monitor

### Lock Files Present  <sub>`lock_files_present` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : package-lock / yarn.lock / poetry.lock présent (cible Présent)
- **Pourquoi** : Un **lock file** (package-lock.json, poetry.lock…) fige les versions **exactes** de tes dépendances. Sans lui, deux installations à deux moments peuvent tirer des versions différentes — d'où le fameux « ça marche chez moi ». C'est aussi une barrière contre les mises à jour malveillantes surprises.
- **Comment on fait** :
  1. Génère le lock avec ton gestionnaire : npm → `npm install` ; Python → `poetry lock` / `pip freeze > requirements.txt` ; Maven → versions fixes dans le `pom.xml`.
  2. **Commit** le fichier généré (il doit être versionné).
  3. Mets à jour les dépendances volontairement, en relisant le diff du lock.

### Essential Files  <sub>`essential_files` · 📄 fichier (MR)</sub>

- [ ] **Validé**
- **Objectif** : README + .gitignore + CHANGELOG présents (cible 3/3)
- **Pourquoi** : Les fichiers essentiels (`README`, `.gitignore`, `LICENSE`) sont la **carte d'entrée** du dépôt : comment le lancer, quoi ignorer, ce qu'on a le droit d'en faire. Un repo sans README, c'est une boîte noire pour le prochain (souvent toi dans 6 mois).
- **Comment on fait** :
  1. Ajoute au moins un `README.md` : à quoi sert le projet, comment le lancer, qui contacter.
  2. Ajoute un `.gitignore` adapté à ta stack (évite de committer build/secrets).
  3. Ajoute un `LICENSE` si le contexte l'exige.
- **Note** : Je crée le `README.md` ; ajoute ensuite `.gitignore` / `LICENSE`.
- **Modèle** :

```yaml
# {{PROJECT}}

Description courte du projet.

## Lancer en local

```bash
# ...
```

## Contact

Équipe …
```

### Branch Protection  <sub>`branch_protection` · ⚙️ réglage GitLab</sub>

- [ ] **Validé**
- **Objectif** : Branche principale protégée (cible Protégée)
- **Pourquoi** : Protéger `main`, c'est empêcher qu'on y écrive directement sans passer par une MR revue. C'est la **serrure** de ton dépôt : sans elle, n'importe qui peut réécrire l'historique de la branche de prod.
- **Comment on fait** :
  1. GitLab → **Settings → Repository → Protected branches**.
  2. Protège `main` : seuls les Maintainers peuvent merger.
  3. Interdis le **force-push** sur cette branche.
- **Note** : Réglage projet — côté GitLab.

### Force Push Blocked  <sub>`force_push_blocked` · ⚙️ réglage GitLab</sub>

- [ ] **Validé**
- **Objectif** : Force push interdit sur main (cible Bloqué)
- **Pourquoi** : Le **force-push** réécrit l'historique : il peut faire disparaître des commits, casser les branches des autres et effacer des traces. Le bloquer sur `main` garantit un historique **immuable et fiable**.
- **Comment on fait** :
  1. GitLab → **Settings → Repository → Protected branches**.
  2. Sur `main`, laisse « Allowed to force push » **désactivé**.
  3. Éduque l'équipe : on ne force-push jamais une branche partagée.
- **Note** : Réglage projet — côté GitLab.

### No Zombie MRs  <sub>`no_zombie_mrs` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : 0 MR ouvertes > 7 jours (cible 0)
- **Pourquoi** : Une **MR zombie** (ouverte depuis très longtemps, sans activité) pollue : on ne sait plus si elle est à finir ou à jeter, elle accumule des conflits et brouille la vue d'équipe. Les fermer, c'est de la clarté.
- **Comment on fait** :
  1. Passe en revue les MR ouvertes > 30 jours.
  2. Pour chacune : finir et merger, ou fermer en notant l'idée dans une issue.
  3. Règle d'équipe : une MR se termine dans la semaine, sinon on la découpe.

### MR Cycle Time  <sub>`mr_cycle_time` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : MR ouvertes < 3 jours en moyenne (cible < 3 jours)
- **Pourquoi** : Le **temps de cycle** d'une MR (de l'ouverture au merge) mesure la fluidité de ton flux. Un cycle court = feedback rapide, moins de conflits, plus de valeur livrée. Les grands responsables : MR trop grosses et revues lentes.
- **Comment on fait** :
  1. Réduis la taille des MR (relecture plus rapide).
  2. Engage-toi sur un délai de première revue (24 h).
  3. Évite les MR bloquées en attente : relance, pair-review, ou découpe.

### Merged Branches Cleaned  <sub>`merged_branches_cleaned` · ⚙️ réglage GitLab</sub>

- [ ] **Validé**
- **Objectif** : < 3 branches mergées non supprimées (cible < 3)
- **Pourquoi** : Une branche **mergée mais pas supprimée** ne sert plus à rien et encombre. Supprimer automatiquement la branche source au merge garde la liste des branches propre et compréhensible.
- **Comment on fait** :
  1. GitLab → **Settings → Merge requests** : active « **Enable delete source branch by default** ».
  2. Coche « Delete source branch » sur les MR existantes au moment du merge.
  3. Nettoie les branches mergées historiques.
- **Outil qui aide** : Branch Monitor

---

## 🧠 Résilience

### Bus Factor Safe  <sub>`bus_factor_safe` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : ≥ 3 contributeurs actifs (cible ≥ 3)
- **Pourquoi** : Le **bus factor**, c'est le nombre de personnes qui, si elles disparaissaient, bloqueraient le projet. Un bus factor de 1, c'est un risque majeur : tout le savoir est dans une seule tête. Le monter, c'est **partager la connaissance**.
- **Comment on fait** :
  1. Fais tourner qui touche à quoi : évite qu'une seule personne possède un pan du code.
  2. Généralise la **revue croisée** (le savoir circule par la revue).
  3. Documente les zones critiques et pratique le pair-programming dessus.

### Work Balanced  <sub>`work_balanced` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : Top contributeur < 40% des commits (cible < 40%)
- **Pourquoi** : Quand un seul contributeur porte l'essentiel des commits, l'équipe est **fragile** et cette personne s'épuise. Un travail réparti, c'est plus de résilience et un rythme soutenable pour tout le monde.
- **Comment on fait** :
  1. Répartis les sujets consciemment (pas toujours le même sur les tâches clés).
  2. Utilise le pair/mob-programming pour diffuser les zones difficiles.
  3. Surveille l'équilibre : si une personne fait > 50 % des commits, agis.

### Reviewer Rotation  <sub>`reviewer_rotation` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : ≥ 3 reviewers distincts sur les MR (cible ≥ 3)
- **Pourquoi** : Si c'est toujours la même personne qui relit, le savoir se concentre et la revue devient un goulot. Faire **tourner les relecteurs** diffuse la connaissance et évite le point unique de blocage.
- **Comment on fait** :
  1. Mets en place une rotation (ou une assignation automatique) des relecteurs.
  2. Encourage les plus juniors à relire aussi (ils apprennent, ils apportent un œil neuf).
  3. Vise plusieurs relecteurs distincts sur la durée, pas un seul référent.

### Regular Activity  <sub>`regular_activity` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : Gap max entre commits < 7 jours (cible < 7 jours)
- **Pourquoi** : Une activité régulière (pas de longs trous) est un signe de **santé** : le projet vit, les intégrations restent petites, les gens gardent le contexte. De longues pauses créent de grosses reprises risquées.
- **Comment on fait** :
  1. Merge souvent, même de petites choses — évite les longues branches dormantes.
  2. Découpe le travail pour qu'il produise des commits fréquents.
  3. Si le projet est en pause, note-le (sinon les métriques deviennent trompeuses).

---

## ⚙️ Pratiques DevOps

### Feature Flags  <sub>`feature_flags` · 🧭 démarche</sub>

- [ ] **Validé**
- **Objectif** : Utilisation de feature flags (cible ≥ 1)
- **Pourquoi** : Les **feature flags** permettent de livrer du code **désactivé** puis de l'activer quand on veut (progressivement, pour un sous-ensemble d'users, avec retour arrière instantané). C'est le levier qui découple déploiement et publication — la clé du déploiement fréquent et sûr.
- **Comment on fait** :
  1. Introduis un flag autour de la nouvelle fonctionnalité (activé/désactivé sans redéployer).
  2. Livre le code éteint, active-le progressivement (canary, %).
  3. Retire le flag une fois la fonctionnalité stabilisée (dette à nettoyer).
- **Outil qui aide** : Feature Flag Manager

### CI Versioned  <sub>`ci_versioned` · 📄 fichier (MR)</sub>

- [ ] **Validé**
- **Objectif** : .gitlab-ci.yml dans le repo (cible Versionné)
- **Pourquoi** : Avoir sa CI **versionnée dans le dépôt** (et non configurée à la main dans l'UI) la rend relisible, historisée et revue comme du code. Chaque évolution du pipeline passe par une MR — même rigueur que pour l'appli.
- **Comment on fait** :
  1. Mets toute la config CI dans `.gitlab-ci.yml` à la racine.
  2. Évite les réglages « cachés » dans l'interface GitLab.
  3. Fais évoluer la CI par MR, comme le reste.
- **Outil qui aide** : Pipeline Generator
- **Modèle** :

```yaml
stages:
  - build
  - test

build:
  stage: build
  script:
    - echo "TODO: build"

test:
  stage: test
  script:
    - echo "TODO: tests"
```

### Multi-Stage Pipeline  <sub>`multi_stage_pipeline` · 📋 modèle à coller</sub>

- [ ] **Validé**
- **Objectif** : ≥ 3 stages dans le pipeline (cible ≥ 3)
- **Pourquoi** : Un pipeline en **plusieurs étapes** (build → test → deploy) sépare les responsabilités et arrête tôt : si le build casse, on ne teste pas ; si les tests cassent, on ne déploie pas. Chaque étape est un garde-fou.
- **Comment on fait** :
  1. Déclare des `stages` ordonnés (build, test, deploy).
  2. Range chaque job dans la bonne étape.
  3. Une étape ne démarre que si la précédente est verte.
- **Outil qui aide** : Pipeline Generator
- **Modèle** :

```yaml
stages:
  - build
  - test
  - deploy

build:
  stage: build
  script: [ "make build" ]

test:
  stage: test
  script: [ "make test" ]

deploy:
  stage: deploy
  script: [ "make deploy" ]
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

### Automated Tests  <sub>`automated_tests` · 📋 modèle à coller</sub>

- [ ] **Validé**
- **Objectif** : Stage de test dans le pipeline (cible Présent)
- **Pourquoi** : Des **tests automatiques** dans la CI, c'est le filet qui attrape les régressions avant la prod. Sans eux, chaque déploiement est un pari. Même une petite suite qui tourne à chaque MR change tout niveau confiance.
- **Comment on fait** :
  1. Ajoute un job `test` dans ton `.gitlab-ci.yml`.
  2. Fais-le tourner à chaque MR (feedback avant merge).
  3. Complète progressivement : commence par le cœur métier et les bugs passés.
- **Outil qui aide** : Pipeline Generator
- **Note** : Ton `.gitlab-ci.yml` existe déjà — colle ce job dedans (je ne l'écrase pas automatiquement).
- **Modèle** :

```yaml
test:
  stage: test
  script:
    - # lance ta suite de tests ici
    - echo "TODO: tests"
```

### Automated Deploy  <sub>`automated_deploy` · 📋 modèle à coller</sub>

- [ ] **Validé**
- **Objectif** : Stage de deploy dans le pipeline (cible Présent)
- **Pourquoi** : Un **déploiement automatisé** supprime les gestes manuels, source d'erreurs, et rend chaque livraison **reproductible**. Un merge sur `main` = un déploiement, sans intervention humaine fragile.
- **Comment on fait** :
  1. Ajoute un job `deploy` déclenché sur `main`.
  2. Scripte tout le déploiement (aucune étape manuelle).
  3. Commence par l'environnement de test, puis étends.
- **Outil qui aide** : Pipeline Generator
- **Modèle** :

```yaml
deploy:
  stage: deploy
  script:
    - # commande de déploiement (helm, kubectl, script…)
    - echo "TODO: deploy"
  environment:
    name: test
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

### Environment Separation  <sub>`env_separation` · 📋 modèle à coller</sub>

- [ ] **Validé**
- **Objectif** : Variables d\ (cible Séparés)
- **Pourquoi** : Séparer les **environnements** (test / prod) évite le pire : tester sans risquer la prod, et déployer en prod en connaissance de cause. GitLab suit alors « quoi est déployé où », ce qui fiabilise ton score DORA.
- **Comment on fait** :
  1. Déclare des `environment:` distincts (test, production).
  2. Un job de déploiement par environnement, avec ses propres règles.
  3. Protège la prod (déclenchement manuel ou sur `main` uniquement).
- **Outil qui aide** : Pipeline Generator
- **Modèle** :

```yaml
deploy_test:
  stage: deploy
  script: [ "echo deploy test" ]
  environment: { name: test }
  rules: [ { if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH' } ]

deploy_prod:
  stage: deploy
  script: [ "echo deploy prod" ]
  environment: { name: production }
  when: manual   # déclenchement humain volontaire
  rules: [ { if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH' } ]
```

### Rollback Ready  <sub>`rollback_ready` · 📋 modèle à coller</sub>

- [ ] **Validé**
- **Objectif** : Job de rollback disponible (cible Disponible)
- **Pourquoi** : Un **rollback** prêt et testé, c'est ce qui transforme un incident en non-événement : on revient à la version d'avant en un clic, sans stress ni improvisation. C'est le pilier du MTTR faible.
- **Comment on fait** :
  1. Ajoute un job `rollback` manuel qui redéploie la version précédente.
  2. Teste-le **avant** d'en avoir besoin (un rollback jamais testé n'existe pas).
  3. Garde les versions déployables (tags/artefacts) pour pouvoir y revenir.
- **Outil qui aide** : Pipeline Generator
- **Modèle** :

```yaml
rollback_prod:
  stage: deploy
  script:
    - # redéploie la version précédente (tag/artefact connu)
    - echo "TODO: rollback"
  environment: { name: production }
  when: manual
  rules: [ { if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH' } ]
```
