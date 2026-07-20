# Salsi — Questions & Réponses (catalogue à valider)

> But : Salsi répond à des questions **sur la plateforme uniquement**, de façon
> **100 % déterministe** (aucune IA). C'est un **routeur d'intentions** :
> il reconnaît le sujet + le module, puis répond soit par une **définition**
> (texte fixe), soit par un **résultat** (requête GitLab / lecture d'un cache).
>
> **À valider ici AVANT de coder** : garde-t-on tout ? On élague ? Les formulations
> et les seuils te vont-ils ?

## Reconnaissance des formulations (déclencheurs)

Salsi ne devine pas : il matche des **déclencheurs** curés, après **normalisation**
(minuscules, accents retirés, ponctuation ignorée). « combien de **FF** » = « combien
de **feature flag** » parce que `ff` est un déclencheur de l'intention *feature flags*.

- **Marqueur de type** : *combien / mon / ma / quel / aujourd'hui / cette semaine* →
  **donnée** ; *c'est quoi / qu'est-ce / explique / ça veut dire / définition* → **définition**.
- **Abréviations courtes** matchées avec frontières de mots (`\bff\b`, `\bmr\b`, `\bci\b`)
  pour ne pas matcher dans `effort`, `diff`, `merci`…
- **Aucun déclencheur trouvé** → refus honnête + « voici ce que je sais faire ».

| Intention | Déclencheurs (synonymes / abréviations) |
|---|---|
| feature_flags | feature flag, feature-flag, feature flags, `ff`, flag, flags, drapeau |
| pipelines | pipeline, pipelines, `ci`, build, job, jobs |
| merge_requests | merge request, merge requests, `mr`, `pr`, revue, review, demande de fusion |
| deploiements | déploiement, deploy, deployment, mise en prod, prod |
| branches | branche, branches, branche morte, stale branch |
| bus_factor | bus factor, bus-factor, busfactor, facteur de bus |
| contributeurs | contributeur, contributrice, qui commit, qui contribue |
| dora | dora, score dora, niveau dora |
| deploy_freq | fréquence de déploiement, `df`, deployment frequency |
| lead_time | lead time, lead-time, `lt`, délai de livraison |
| cfr | cfr, taux d'échec, change failure rate, échec de changement |
| mttr | mttr, temps de restauration, time to restore, temps de reprise |
| securite | sécurité, protégée, protection, approbation, approvals, security.md, codeowners |
| secrets | secret, secrets, token exposé, clé exposée, mot de passe |
| cis | cis, conformité, benchmark, bonnes pratiques |
| blast_radius | blast radius, ioc, sbom, compromission, supply chain, `p0`, `p1`, `p2`, `p3` |
| badges | badge, badges, achievement, achievements, succès |
| acces_roles | accès, rôle, role, owner, maintainer, droits, permissions |

> À compléter/élaguer : ajoute les formulations réelles de ton équipe (jargon interne,
> anglicismes, fautes fréquentes). Chaque ligne ajoutée = une question de plus comprise.

---

## Comment ça marche (règles du jeu)

- **Deux familles de questions**
  - 📖 **Définition** — « c'est quoi le bus factor ? » → explication fixe (glossaire).
  - 📊 **Mes résultats** — « combien de pipelines aujourd'hui ? » → vraie donnée.
- **Périmètre des résultats** : par défaut le **repo sélectionné** dans le hub
  (comme le bilan). Quelques questions sont *workspace* ou *cache*. Précisé par question.
- **Fenêtres de temps** reconnues : *aujourd'hui*, *cette semaine* (7 j), *ce mois* (30 j),
  *au total*. Défaut = récent borné.
- **Honnêteté** : `403` → « 🔒 non vérifiable (droits) », jamais compté à charge.
  Hors périmètre → Salsi le dit (« je réponds sur la plateforme… »), il ne bluffe pas.
- **Sources** : `api` = appel GitLab live · `cache` = compagnon en localStorage
  (DORA/gaming) · `calcul` = dérivé côté client.

---

## 📈 DORA Insights

### 📖 Définitions
| Terme | Définition courte |
|---|---|
| DORA | Les 4 métriques de performance de livraison : fréquence de déploiement, lead time, taux d'échec (CFR), temps de restauration (MTTR). Niveaux Low → Elite. |
| Fréquence de déploiement | À quelle fréquence tu livres en prod. Élevée = petits lots, moins de risque. Elite ≥ 7/sem. |
| Lead time | Délai premier commit → mise en prod. Elite ≤ 24 h. |
| CFR (taux d'échec) | Part des déploiements qui cassent. Elite ≤ 5 %. |
| MTTR (temps de restauration) | Temps pour restaurer le service après incident. Elite ≤ 1 h. |
| Niveau / trajectoire | Low/Medium/High/Elite par métrique ; la trajectoire = tendance vs ta normale. |

### 📊 Mes résultats
| Question (exemples) | Source | Portée |
|---|---|---|
| « mon score DORA ? » / « je suis à quel niveau ? » | cache (sinon api) | repo sélectionné |
| « mon lead time / CFR / MTTR ? » | cache | repo sélectionné |
| « ça s'améliore ou ça recule ? » (trajectoire) | cache | repo sélectionné |

---

## 🚀 Livrer — Pipelines / Déploiements / Feature Flags / Releases

### 📖 Définitions
| Terme | Définition |
|---|---|
| Pipeline | La chaîne CI/CD qui build/teste/déploie à chaque changement. |
| Feature flag | Un interrupteur pour activer/désactiver une fonctionnalité **sans redéployer** — découple « déployer » de « activer ». |
| Environnement protégé | Un env (prod…) dont le déploiement exige des droits/approbations. |
| Release / tag | Une version publiée, figée par un tag. |

### 📊 Mes résultats
| Question (exemples) | Source | Portée |
|---|---|---|
| « combien de pipelines aujourd'hui / cette semaine ? » | api `/pipelines` | repo sélectionné |
| « combien ont échoué ? » | api `/pipelines?status=failed` | repo sélectionné |
| « combien de déploiements en prod ? » | api `/deployments` | repo sélectionné |
| « c'est déployé où, encore actif en prod ? » | api `/environments` | repo sélectionné |
| « combien de feature flags ? lesquels sont inactifs ? » | api `/feature_flags` | repo sélectionné |
| « dernière release / dernier tag ? » | api `/releases`, `/repository/tags` | repo sélectionné |

---

## 🛡️ Inspecter & Sécuriser — CIS / Secrets / Blast Radius

### 📖 Définitions
| Terme | Définition |
|---|---|
| CIS | Référentiel de bonnes pratiques (GitLab Benchmark) : branche protégée, approbations, lock files, SECURITY.md… |
| Secret | Valeur sensible (token, clé, mot de passe) qui ne doit jamais être en clair dans le code. |
| Branche protégée | Interdit le force-push / la suppression / le merge non contrôlé sur la branche par défaut. |
| Blast Radius | Reconstitution d'un incident supply-chain : où un composant était, s'il a tourné, ce qu'il pouvait atteindre, ce qu'il a produit. |
| IOC | Indicateur de compromission : le point de départ d'une enquête (package+version, image, commit…). |
| SBOM | Inventaire exact des composants réellement résolus d'un build (CycloneDX) — meilleure preuve d'exécution. |
| P0 → P3 | Priorité Blast Radius : P0 critique (exécuté + secrets/écriture/prod), P1 exécution avérée, P2 exposition probable, P3 présence seule. |

### 📊 Mes résultats
| Question (exemples) | Source | Portée |
|---|---|---|
| « ma branche par défaut est protégée ? » | api `/protected_branches` | repo sélectionné |
| « combien d'approbations sont requises ? » | api `/approvals` | repo sélectionné |
| « j'ai un SECURITY.md / CODEOWNERS ? » | api `/repository/tree` | repo sélectionné |
| « mon repo est public ? » | api `/projects/:id` | repo sélectionné |
| « des secrets exposés ? » | ➜ **renvoie vers le Secrets Scanner** (scan lourd, pas en Q&A) | — |

---

## 🧠 Résilience & Santé — Bus Factor / Repo Analyzer / Branch Monitor / Repo Diet

### 📖 Définitions
| Terme | Définition |
|---|---|
| Bus factor | Nombre de personnes qui peuvent disparaître (« passer sous un bus ») avant que le projet soit bloqué. Bus factor 1 = savoir détenu par une seule personne → risque critique. |
| Branche morte | Branche sans commit depuis longtemps (≥ 60 j) — souvent du travail non livré. |
| Repo inactif | Aucune activité depuis longtemps (≥ 90 j). |

### 📊 Mes résultats
| Question (exemples) | Source | Portée |
|---|---|---|
| « c'est quoi mon bus factor ? » (mesure) | api `/repository/contributors` + calcul | repo sélectionné |
| « qui commit le plus ? » | api `/repository/contributors` | repo sélectionné |
| « combien de branches mortes ? » | api `/repository/branches` + calcul | repo sélectionné |
| « depuis quand le repo est inactif ? » | api `/projects/:id` (`last_activity_at`) | repo sélectionné |
| « combien de contributeurs actifs ? » | api `/repository/contributors` | repo sélectionné |

---

## 🤝 Collaborer — MR / Revue / Rétro

### 📖 Définitions
| Terme | Définition |
|---|---|
| Merge Request (MR) | Une demande de fusion, relue avant d'entrer dans la branche principale. |
| MR zombie | MR ouverte depuis longtemps sans activité — bloque le flux. |
| Taux de review | Part des MR mergées après une vraie approbation. |

### 📊 Mes résultats
| Question (exemples) | Source | Portée |
|---|---|---|
| « combien de MR ouvertes ? » | api `/merge_requests?state=opened` | repo sélectionné |
| « des MR qui traînent (zombies) ? » | api `/merge_requests` + calcul (âge) | repo sélectionné |
| « combien de MR mergées cette semaine ? » | api `/merge_requests?state=merged` | repo sélectionné |

---

## 🎮 Achievements (Salsi)

### 📖 Définitions
| Terme | Définition |
|---|---|
| Badge | Une bonne pratique DevOps atteinte (47 au total). |
| Phase | Ton stade de maturité (Découverte → Excellence), avec hystérésis. |
| Compagnon | Salsi se souvient : journal, régime vs ta normale, conseils non répétés. |

### 📊 Mes résultats
| Question (exemples) | Source | Portée |
|---|---|---|
| « combien de badges j'ai ? » | cache (gaming) | repo sélectionné |
| « lesquels me manquent / faciles à décrocher ? » | cache | repo sélectionné |
| « j'ai perdu un badge ? » | cache (journal) | repo sélectionné |

---

## 🗂️ Workspace — Accès & Rôles

### 📖 Définitions
| Terme | Définition |
|---|---|
| Maintainer / Owner | Niveaux d'accès élevés (peuvent administrer / tout faire). |
| Accès hérité vs direct | Hérité = via le groupe parent ; direct = donné sur le repo. |
| Liste blanche | Les seuls Maintainers autorisés ; les autres sont signalés. |

### 📊 Mes résultats
| Question (exemples) | Source | Portée |
|---|---|---|
| « qui est Owner / Maintainer ? » | api `/members/all` | repos du workspace |
| « des Maintainers hors liste blanche ? » | api + variable projet | workspace |

---

## 🎓 Ateliers (référentiel de 205 actions)

Salsi est relié au référentiel `Salsifi.workshops` (les ateliers/capsules
d'accompagnement + leur lien Confluence). Une **question d'amélioration**
recommande les 3 ateliers les plus proches.

- **Déclencheurs** : `atelier`, `workshop`, `optimiser`, `améliorer`, `réduire`,
  `progresser`, `comment faire`… → recherche par mots-clés dans titre + action + axe.
- **Synonymes DevOps** : `flow` → flux/livraison/pipeline/goulot/dépendance ;
  `pipeline` → ci/cd/échec/build ; `incident` → post-mortem/MTTR ; etc.
- **Réponse** : 3 ateliers max, chacun avec son **lien Confluence** (ou « pas encore
  de page »), sa description et son axe/niveau. Aucun résultat → invite à un mot-clé.
- Exemples : « atelier pour optimiser mon flow », « comment réduire mes échecs de
  pipeline ? », « atelier rituels », « progresser sur la dette ».

## 🌱 Méta (Salsi & la plateforme)

| Question | Réponse (fixe) |
|---|---|
| « c'est quoi Salsifi ? » | Plateforme d'aide à la maturité DevOps au-dessus de GitLab : mesures (DORA), sécurité (secrets, CIS, Blast Radius), gouvernance des accès, gamification. |
| « qui es-tu, Salsi ? » | Le compagnon : je fais le lien entre les modules et je te dis où mettre ton énergie. |
| « qu'est-ce que tu sais faire ? » | Définitions des concepts + tes résultats (pipelines, MR, bus factor, DORA, sécu…) sur le repo sélectionné. |

---

## Périmètre & garde-fous (rappel)

- **Un repo à la fois** (le sélectionné) pour les résultats — jamais un scan des 1000.
- **Pas de scan lourd en Q&A** : les questions « secrets ? » renvoient vers le module dédié.
- **403 → non vérifiable**, jamais compté à charge.
- **Hors périmètre → refus honnête** (pas de chatbot généraliste, aucune IA).

---

## ▶️ Ce que je te propose pour la V1 (à trancher)

Pour ne pas tout coder d'un coup, une **V1 resserrée** couvrant le plus utile :

1. **Définitions** : DORA (+4), bus factor, CFR, lead time, MTTR, feature flag, secret,
   CIS, blast radius, P0-P3, SBOM, IOC (≈ 15 termes).
2. **Résultats sur le repo sélectionné** : pipelines (aujourd'hui/semaine/échecs),
   MR ouvertes, branches mortes, bus factor, déploiements, feature flags,
   DORA (cache), badges (cache).
3. **Fallback honnête** + renvoi vers les modules pour le lourd (secrets, blast radius).

> **Tu valides / élagues cette liste, et je code la V1.** On ajoutera les modules
> restants (workspace, releases, rétro…) au fur et à mesure.
