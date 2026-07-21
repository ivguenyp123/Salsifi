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

---

# 📊 Module DORA Insights — savoir complet (implémenté)

> On traite le module **en profondeur** : Salsi connaît les **définitions**, les
> **notes** (paliers + seuils exacts), les **ateliers reliés** et sait répondre à
> **« comment améliorer chaque mesure »**. Tout est un **miroir fidèle** du code du
> module (`js/insights.js` : `doraLevel()`, `DORA_COACH`, `renderGlobalScore`) —
> aucun seuil, aucun conseil inventé.

## 1. Définitions (les 4 mesures + global)

| Terme | Ce que Salsi répond (résumé) |
|---|---|
| **Fréquence de déploiement** (df, deploy freq) | À quelle fréquence tu livres en prod. Calcul : pipelines *success* prod / 30 j × 7 (dédupliqués par commit). |
| **Lead Time** (lt, délai de livraison, cycle time) | Délai premier commit → merge en prod. Calcul : médiane sur tes MR fusionnées. |
| **CFR** (taux d'échec, change failure rate) | Part des livraisons prod qui cassent. Calcul : pipelines prod en échec / total, pondéré récent (5 j/10 j/30 j). |
| **MTTR / TTRS** (temps de restauration) | Temps pour restaurer après incident. Calcul : médiane pipeline échec → succès sur branche prod. |
| **Score DORA /100** | Moyenne des 4 niveaux (Elite 100 · High 70 · Medium 40 · Low 15). ≥85 Elite · ≥60 High · ≥35 Medium · sinon Low. |

## 2. Les notes (paliers + seuils exacts) — « les niveaux DORA »

4 niveaux : 🟢 **Elite** · 🔵 **High** · 🟡 **Medium** · 🔴 **Low**.

| Mesure | 🟢 Elite | 🔵 High | 🟡 Medium | 🔴 Low |
|---|---|---|---|---|
| 🚀 Déploiement/sem | ≥ 7 | 1 → 7 | 0,25 → 1 | < 0,25 |
| ⚡ Lead Time | ≤ 24 h | ≤ 1 sem | ≤ 1 mois | > 1 mois |
| 🔧 CFR | ≤ 5 % | ≤ 10 % | ≤ 15 % | > 15 % |
| ⏱️ MTTR | ≤ 1 h | ≤ 24 h | ≤ 1 sem | > 1 sem |

Calcul du score : demande « **comment est calculé le score DORA** ». Rappel du
plafond : **MTTR manquant → score plafonné à 75** (Elite interdit) ; **2 mesures+
manquantes → plafond 50**.

## 3. « Comment améliorer ma mesure » (Coach condensé)

Salsi renvoie, par mesure : le **cap** (cible Elite), **pourquoi** ça compte
(stakes), les **3 premiers leviers** (avec lien vers le module associé), la
**mesure de progrès**, **un atelier d'accompagnement** (parmi les 205), et le
renvoi vers le **Coach Salsi** de DORA Insights (plan complet + suivi).

| Mesure | Levier n°1 | Module lié |
|---|---|---|
| 🚀 df | Automatiser le déploiement (CD) | Pipeline Generator |
| ⚡ lt | Réduire la taille des MR | MR Reviewer |
| 🔧 cfr | Quality gates avant merge | Gouvernance repo |
| ⏱️ mttr | Rollback en un geste / feature flag | Feature Flag Manager |

« **améliorer mon score DORA** » (sans mesure) → Salsi lit le cache et **cible la
mesure la plus basse**, puis fait le plan de celle-ci.

## 3 bis. Générer le rapport DORA (une action, pas juste une réponse)

« **génère / télécharge / exporte le rapport de mes DORA** » → Salsi **construit et
télécharge** le rapport HTML (miroir du bouton « Exporter » de DORA Insights), depuis
la **dernière analyse mémorisée** (cache `doraHistory`, aucune donnée re-fetchée) :
score /100 + niveau, les 4 métriques formatées (X/sem, Xj/Xh, X %) avec leur badge de
niveau, et la note de méthode. Fichier `DORA-<repo>-<AAAA-MM-JJ>.html`. Sans analyse
préalable → Salsi invite à ouvrir DORA Insights une fois. Intention tracée : `dora_report`.

## 4. Ateliers reliés (échantillon, sur 205)

Reliés automatiquement par mots-clés au corpus `Salsifi.workshops` :

- **df** : #53 (automatiser le déploiement), #55 (découpage incrémental), #105 (feature flags), #73 (anatomie pipeline).
- **lt** : #133 (SLA de review), #149/#150 (feature slicing / découpage MR), #104 (cycle time < 3 j), #100 (tri MR zombies).
- **cfr** : #122 (premier test dans le pipeline), #125 (quality gates bloquants), #138 (règles d'approbation), #120 (scan de vulnérabilités).
- **mttr** : #180 (stop-the-line), #184 (mesure du MTTR), #191 (process d'urgence), #193 (playbook), #195 (revert automatique).

## 5. Déclencheurs ajoutés (DORA)

- **améliorer** : `améliorer / optimiser / augmenter / réduire / baisser / progresser / booster / accélérer / muscler / passer Elite`.
- **mesure ciblée** : `fréquence / déploiement / df` · `lead time / lt / délai / cycle` · `cfr / taux d'échec` · `mttr / ttrs / restauration / résilience`.
- **niveaux** : `niveau / note / palier / barème / seuil / Elite / High/Medium/Low performer`.
- **score** : `comment est calculé le score / combien de points / comment marche le score`.

## 6. Journal & IA-fallback

Chaque question DORA est tracée dans `salsifi_qa_log` avec son intention
(`dora_improve_lt`, `dora_levels`, `dora_score_calc`…). Les intentions `unknown`
répétées diront quelles formulations DORA il reste à couvrir **avant** de brancher
l'IA en dernier recours.

---

# 🎮 Module Gaming / Achievements — savoir complet (implémenté)

> Miroir fidèle de `js/gaming.js` (catalogue des **47 badges**, 6 familles, le
> **gate anti-vide**) et de `js/gaming-history.js` (les **5 phases** + seuils). Les
> **recettes « comment débloquer »** sont lues au runtime dans `Salsifi.gamingRecipes`
> (`js/gaming-recipes.js`, chargé sur le hub) — `why` + `steps` + lien module.

## 1. Définitions

- **Badge / achievement** : une bonne pratique DevOps atteinte, mesurée sur tes
  vraies données GitLab (30 j). **47 badges**, **6 familles**, XP par badge.
- **Phase de maturité** : ta progression globale (5 phases, cf. §2).
- **Gate « en attente de données »** : cf. §4.

## 2. Les notes (phases de maturité) — « les phases »

| Phase | Seuil (fraction des 47 badges) |
|---|---|
| 🌱 Découverte | 0 % |
| 🧱 Structuration | ≥ 15 % (~7/47) |
| 🛡️ Fiabilisation | ≥ 40 % (~19/47) |
| ⚙️ Optimisation | ≥ 65 % (~31/47) |
| 🏆 Excellence | ≥ 85 % (~40/47) |

On **monte** dès qu'on franchit le seuil ; on ne **redescend** qu'après une baisse
**soutenue** (2 jours), jamais sur un mauvais jour (hystérésis).

## 3. Les 6 familles (catégories)

| Famille | Badges | Focus |
|---|---|---|
| 🚀 Delivery | 12 | Fréquence, stabilité, vitesse |
| 🔒 Qualité & Merge Requests | 10 | Review, approbations, taille MR |
| ⚙️ Stabilité & Pipelines | 5 | Résilience, recovery, tendance |
| 🧹 Hygiène & Repository | 9 | Branches, fichiers, protection |
| 🚌 Résilience & Connaissances | 4 | Bus factor, répartition, rotation |
| ⚡ Pratiques DevOps | 7 | Feature flags, CI/CD, automation |

« les badges **hygiène** » → liste de la famille (nom + critère).

## 4. Le gate anti-vide (« en attente de données »)

4 badges « d'absence » (No Failed Streak, Pipeline Resilient, No Merge Without
Approval, No Zombie MRs) seraient vrais sur un repo qui ne fait *rien*. Salsi les
neutralise tant qu'il n'y a pas assez d'activité (pipelines / MR) à juger — un repo
mort ne doit pas finir mieux noté qu'un repo vivant.

## 5. « Comment débloquer le badge X »

Salsi trouve le badge par son **nom ou son critère** (fuzzy), puis renvoie :
critère + XP + famille, et — si demandé (« comment débloquer / obtenir ») — la
**recette** (`steps` de `gamingRecipes`) + le **lien module** quand il y en a un
(Pipeline Generator, Feature Flag Manager, Branch Monitor, Release Notes).
Exemples : « comment débloquer Small MR », « le badge bus factor safe c'est quoi ».

## 6. Mes résultats

« combien de badges / mes badges / ma phase » → `X/47` + la **phase courante**
(via `gamingHistory.computePhase`).

## 7. Déclencheurs & journal

- Contexte gaming : `badge / achievement / succès / trophée / xp / débloquer / maturité / phase`.
- Intentions tracées : `gaming_phases`, `gaming_cats`, `gaming_badge`, `gaming_gate`,
  `gaming_list`, `gaming_howto`, `badges`.
- Isolation : « améliorer mon MTTR » reste **DORA** ; « c'est quoi le bus factor »
  reste la **définition** (pas le badge *Bus Factor Safe*).

---

# 🚌 Module Bus Factor — savoir complet (implémenté)

> Miroir fidèle de `js/bus-factor.js` + `bus-factor.html`. Salsi mesure le savoir
> **d'aujourd'hui** (qui sait quoi maintenant), **par zone de code**.

## 1. Définition

Le **bus factor** = nombre minimum de personnes qui doivent quitter l'équipe avant
que le projet soit bloqué. Calculé par répertoire = nombre de personnes couvrant
**80 %** des commits de la zone.

## 2. Les notes (niveaux + score global)

| Par zone | Risque |
|---|---|
| 🔴 **BF = 1** (une seule tête) | risque critique |
| 🟡 **BF = 2** | risque moyen |
| 🟢 **BF ≥ 3** | risque faible |

**Score global /5** = médiane des zones **pondérée par leur activité** (commits) :
`< 2` 🔴 RISQUE CRITIQUE · `< 3` 🟡 RISQUE MOYEN · `≥ 3` 🟢 RISQUE FAIBLE.
Un contributeur qui détient **≥ 70 %** d'une zone est signalé « dominant ».

## 3. « Comment améliorer / réduire mon bus factor »

Leviers (miroir des recommandations du module) : **pair / mob-programming** sur les
zones critiques, **revue croisée**, **rotation des reviewers (≥ 3)**, **documenter**
les zones critiques, **répartir** le travail (top contributeur < 40 %). Salsi relie
aussi les **badges** (Bus Factor Safe, Work Balanced, Reviewer Rotation), un **atelier**
(axe Résilience & Bus Factor), et renvoie au module 🚌 pour voir *quelles zones / qui*.

## 4. Mes résultats

« mon bus factor » → nb de contributeurs + part du top + **libellé de risque**, avec
renvoi au module pour le détail par zone.

## 5. Déclencheurs & journal

- Contexte : `bus factor / facteur de bus / silo de connaissance / qui sait quoi`.
- Intentions tracées : `busfactor_levels`, `busfactor_improve`, `bus_factor`.

---

# 😊 Small-talk — rendre Salsi sympa (implémenté)

> Des petites phrases pour que Salsi soit chaleureux, **sans jamais voler une vraie
> question** : si une demande se cache derrière le bonjour, on la traite normalement.

## Types reconnus (réponses variées, en rotation)

| Type | Déclencheurs | Exemple de réponse |
|---|---|---|
| `greet` | salut, bonjour, coucou, hello, hey, yo, slt, cc | « Salut 🌱 Moi c'est Salsi… on regarde quoi ? » |
| `howru` | ça va, ça roule, la forme, quoi de neuf, tu vas bien | « Au taquet, merci 🌱 … on regarde quoi ? » |
| `thanks` | merci, thx, nickel, génial, parfait, au top | « Avec plaisir 🌱 … » |
| `bye` | au revoir, à plus, ciao, bonne journée, à bientôt | « À bientôt 🌱 … » |
| `compliment` | t'es cool, tu gères, bien joué, gg, j't'aime | « Trop sympa 💚 … » |
| `whoru` | qui es-tu, tu es quoi, tu es une IA, tu sers à quoi | « Moi c'est Salsi 🌱 … zéro IA pour l'instant » |

## Règle d'or — ne jamais voler une vraie question

Après avoir retiré les motifs small-talk + les mots de remplissage (`salsi`, `stp`,
`dis-moi`, `un peu`, `bien`…), s'il **reste ≥ 3 caractères** de vraie demande, Salsi
**rend la main** au routeur normal :

- « salut c'est quoi le bus factor ? » → répond **bus factor** (le bonjour est ignoré).
- « bonjour, mon score DORA ? » → répond **DORA**.
- « ça va **mon repo** ? » → **état du repo** (pas le small-talk « ça va »).

Intentions tracées : `smalltalk_greet / howru / thanks / bye / compliment / whoru`.

---

# 📋 Module Daily Report — savoir complet (implémenté)

> Miroir fidèle de `js/daily-report.js` + `daily-report.html`. Le résumé de la
> journée GitLab, pensé pour le **standup**, avec ses **conseils du jour**.

## 1. Définition

Le **Daily Report** résume ton activité GitLab de la journée (MRs, pipelines,
déploiements, commits, taux de succès) et sort des **conseils du jour**.

## 2. Ce qu'il contient

**6 chiffres** en tête : MRs mergées · pipelines · échecs · déploiements · taux de
succès · commits. Puis les **sections** : conseils du jour, pipelines en échec,
déploiements, tags/releases, MRs (mergées / en attente / fermées), branches
(actives / stale > 30 j / mergées non supprimées), issues, pipelines de longue
durée (> 15 min), branches à surveiller, reverts. Navigable jour par jour.

## 3. Les « conseils du jour » (règles + seuils) — les « notes »

Max 5, triés **urgence → positif** (critical > warning > info > success) :

| Signal | Seuil |
|---|---|
| 🔴 pipelines en échec | ≥ 1 |
| 👀 MR mergée sans reviewer | ≥ 1 |
| 📝 MR sans description | < 20 car. (si ≥ 2 MR) |
| 📐 commits non conventionnels | > 40 % (si ≥ 3 commits) |
| ⏳ MR en attente | + 7 jours |
| ⏱️ pipeline long | > 15 min |
| 🔄 reverts | ≥ 1 |
| 🐛 nouveaux bugs | label `bug` |
| 🚀 pas de déploiement | mais > 3 pipelines |
| ✅ / 🎉 / 🔥 / 😴 | tout vert / MRs reviewées / grosse / calme |

## 4. Mon rapport du jour

« mon rapport du jour » → digest live : pipelines (dont échecs), MRs mergées,
déploiements, taux de succès du jour, + renvoi au module.

## 5. Déclencheurs & journal

- Contexte : `daily / daily report / rapport du jour / standup / rapport quotidien`.
- Intentions tracées : `daily_content`, `daily_tips`, `daily`.
- Isolation : « combien de pipelines aujourd'hui » reste le comptage **pipelines**
  (pas le rapport) ; « conseils du jour » va bien aux **conseils** même sans « daily ».

## Rapports d'activité téléchargeables — jour / semaine / mois (action)

« **génère le rapport du jour / de la semaine / du mois** » → Salsi **fetch les
données GitLab de la période**, calcule et **télécharge** un rapport HTML autonome
(miroir de `generateStandaloneReport` du Daily Report) :

- **Santé /100** (mêmes malus : taux succès < 80/< 60, branches stale > 90 j > 20,
  MR ouvertes > 7 j > 5).
- **Vue d'ensemble** : pipelines / taux succès / échecs / MR mergées / ouvertes /
  déploiements / commits.
- **Activité jour par jour** (barres + tableau) — bucketing local des données.
- **Bonnes pratiques** (5 scores + global, formules exactes du module).
- **Top échecs par branche** + **MR qui traînent**.

Périodes : `jour` (**NOUVEAU** — n'existait pas dans le module) = 1 j · `semaine` = 7 j
· `mois` = 30 j. Fichier `rapport-<période>-<repo>-<date>.html`. « génère un rapport »
sans période → Salsi demande laquelle. Intentions : `activity_report_jour/semaine/mois`.
« rapport DORA » reste routé vers le rapport **DORA** (score /100).

---

# 🚩 Module Feature Flags — savoir complet (implémenté)

> Miroir fidèle de `js/feature-flag-manager.js`. Salsi lit `/feature_flags` en
> **live** et répond à **toute** question sur l'état de tes flags.

## 1. Définition

Un **feature flag** = interrupteur pour activer/désactiver une fonctionnalité sans
redéployer (découple « déployer » de « activer »).

## 2. Toutes les questions sur les données (répond à tout)

Une seule lecture GitLab (`/projects/:id/feature_flags`) alimente toutes ces réponses :

| Question | Réponse |
|---|---|
| « combien de FF ? » | total + **N ON / M OFF** + environnements |
| « leurs noms / la liste » | liste des flags avec 🟢 ON / 🔴 OFF |
| « sur quel environnement ? » | répartition par `environment_scope` (prod, staging, tous…) |
| « lesquels en prod ? » | flags ciblés `production` (ou `*`) |
| « lesquels sont actifs / inactifs ? » | listes ON / OFF |
| « le flag <nom> ? » | **détail** : ON/OFF · rollout % · env · stratégie(s) |

- **Nom d'un flag** : reconnu même partiel/sans préfixe (« apple pay » → `enable-apple-pay`).
- **Rollout %** : lu dans `strategies[].parameters.percentage` (`default` = 100 %).
- **Environnements** : `strategies[].scopes[].environment_scope` (`*` = tous).
- `403` → 🔒 non vérifiable ; aucun flag → dit clairement « aucun (ou non activé) ».

## 3. Détails techniques du routeur

- `feature_flags` est **`dataFirst`** : une question FF sans « c'est quoi » répond
  par les **données** (pas la définition). « c'est quoi un feature flag » → définition.
- `isData` élargi : `nom(s)`, `environnement`, `actif/inactif`, `on/off` comptent
  comme demandes de données (corrige « leurs noms » au pluriel).
- Suivi conversationnel : après « combien de FF ? », « leurs noms ? » / « sur quel
  environnement ? » / « lesquels en prod ? » restent sur les feature flags.
- Intention tracée : `feature_flags`.
