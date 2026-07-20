# Salsifi — DevOps Hub 🌱

Plateforme interne d'aide à la **maturité DevOps** au-dessus de GitLab :
un ensemble de pages qui lisent l'API GitLab et transforment les données du
dépôt en **mesures, diagnostics, actions et gamification** — pour aider les
équipes à progresser concrètement.

> **100 % statique.** Aucun build, aucun bundler, aucun module ES. Tout est en
> `<script src>` classique + CSS statique, pour fonctionner **servi** (GitLab
> Pages / serveur web) **et** ouvert en local (`file://`).

---

## Démarrer

1. Ouvre **`login.html`** (ou `hub.html`) dans un navigateur.
2. Renseigne l'**URL de ton instance GitLab** + un **Personal Access Token**
   (scope `api` pour les modules qui écrivent, `read_api` suffit pour lire).
3. Tu arrives sur le **hub** : choisis un repo (ou une **tribu / workspace**),
   puis un module.

Le token vit dans le `localStorage` du navigateur (`devops_hub_workspaces`).
**Aucun token n'est stocké côté serveur** — c'est une contrainte de sécurité
structurante de la plateforme (voir plus bas).

---

## Architecture

```
login.html · hub.html · <module>.html      ← pages (racine)
css/theme.css                               ← design tokens (thème clair/sombre)
css/<module>.css                            ← style par page
js/theme.js                                 ← bascule de thème (data-theme)
js/common/                                  ← couche partagée
  ├─ utils.js     escapeHtml, escapeAttr, runWithConcurrency
  ├─ gitlab.js    gitlabFetch (retry 429), gitlabJson, gitlabPaginate (bornée)
  └─ auth.js      loadAuth, getRepoId
js/hub/                                      ← hub découpé en modules (portée globale)
js/<module>.js                               ← logique par page
```

- **Thème clair / sombre** : variables CSS (`css/theme.css`) pilotées par
  l'attribut `data-theme`, choisi sur le hub et appliqué partout.
- **Transport GitLab mutualisé** : toute page passe par `js/common/gitlab.js`
  (URL `/api/v4`, en-tête `PRIVATE-TOKEN`, pagination toujours bornée).
- **Portée globale volontaire** : pas de modules ES, pour rester ouvrable en
  `file://`. Les fonctions de page sont des `function` de premier niveau.

---

## Les modules

### 🗂️ Niveau workspace (une « tribu » = un ensemble de repos choisis)

| Module | Page | Rôle |
|---|---|---|
| **DORA Workspace** | `dora-workspace.html` | Les 4 métriques DORA agrégées sur tous les repos de la tribu, par squad. |
| **Gouvernance Workspace** | `gouvernance-repo.html?scope=workspace` | Scanner sécurité (secrets, historique, supply-chain, CIS) sur les repos choisis → résultats consolidés **par repo, classés par risque** + rapport. |
| **Accès & Rôles** | `access-workspace.html` | Qui a quel rôle sur les repos de la tribu : rapport de gouvernance, direct vs hérité, Maintainers/Owners, historique 30 j, liste blanche + rétrogradation semi-auto. |

### 📈 Mesurer & Progresser

| Module | Page | Rôle |
|---|---|---|
| **DORA Insights** | `insights.html` | Les 4 métriques DORA d'un repo + niveaux (Elite→Low), avec un **compagnon temporel** (journal des paliers, régime vs baseline, trajectoire) et le **Coach Salsi** : choisis une mesure à améliorer, reçois un plan profond qui évolue avec tes résultats (voir plus bas). |
| **DevOps Assessment** | `maturity.html` | Auto-évaluation de maturité connectée aux ateliers Confluence. |
| **Achievements (Salsi)** | `gaming.html` | Gamification **compagnon** : 47 badges, mémoire, phases, mascotte Salsi, atelier « comment on fait » (voir plus bas). |
| **Bus Factor** | `bus-factor.html` | Concentration du savoir dans l'équipe. |
| **Daily Report** | `daily-report.html` | Résumé quotidien d'activité. |
| **Générateur de rapport** | `report-builder.html` | Rapport HTML autonome composé par glisser-déposer. |

### 🛡️ Inspecter & Sécuriser

| Module | Page | Rôle |
|---|---|---|
| **Security / Gouvernance repo** | `gouvernance-repo.html` | Le scanner ci-dessus, sur un seul repo (`?repo=<id>`). |
| **Secrets Scanner** | `secrets-scanner.html` | Balaie *tous* les repos accessibles — **réservé** (non self-service). |
| **Repo Analyzer** | `repo-analyzer.html` | Analyse de santé d'un dépôt. |
| **Repo Diet** | `repo-diet.html` | Poids du dépôt, gros fichiers, dossiers inutiles. |

### 🚀 Livrer

| Module | Page | Rôle |
|---|---|---|
| **Pipeline Generator** | `pipeline-generator.html` | Génère un `.gitlab-ci.yml` adapté. |
| **Feature Flag Manager** | `feature-flag-manager.html` | Pilote les feature flags, groupes, rapport par environnement. |
| **Release Notes** | `release-notes.html` | Notes de version depuis les tags / MR. |
| **Project Scaffolder** | `project-scaffolder.html` | Assistant conversationnel : déduit le flow Git, prépare la MR. |
| **Platform Concierge** | `platform-concierge.html` | Livraison gouvernée en langage naturel (couche IA + noyau déterministe). |
| **Smart Estimate** | `smart-estimate.html` | Aide à l'estimation. |

### 🤝 Collaborer

| Module | Page | Rôle |
|---|---|---|
| **MR Reviewer** | `mr-reviewer.html` | Aide à la revue de merge requests. |
| **Auto Retro** | `autoretro.html` | Matière à rétrospective. |
| **Branch Monitor** | `branch-cleaner.html` | Branches mortes / mergées à nettoyer. |

---

## Le compagnon « Salsi » (module Achievements)

Le module gaming n'est pas un simple mur de badges : c'est un **compagnon
temporel**, entièrement **déterministe (aucune IA)**.

- **Snapshot** quotidien (`js/gaming-history.js`) → l'historique s'écrit
  (badges + métriques). Stockage isolé derrière une interface, remplaçable par
  un back plus tard sans réécrire le reste.
- **Journal** « ce qui s'est passé » : records, rechutes, retours, régressions.
- **Phases de maturation** (machine à états + hystérésis).
- **Régime** : comparaison à la baseline glissante **propre à l'équipe**.
- **Voix** : conseils non répétés, escalade s'ils sont ignorés.
- **Mascotte Salsi** : un visage qui réagit à l'humeur.
- **Atelier** : pour chaque badge, « tu veux que je t'explique ? » ouvre une
  popup pédagogique (pourquoi + démarche + modèle + création de MR quand c'est
  un fichier). Recettes dans `js/gaming-recipes.js` — voir
  [`SALSI_CONSEILS.md`](SALSI_CONSEILS.md).

Le **même moteur temporel** (fonctions pures de `js/gaming-history.js`) alimente
aussi le module **DORA Insights** via `js/dora-history.js` : là, l'événement phare
n'est pas un badge mais une **transition de palier DORA** (Low↔…↔Elite), avec le
même journal / régime / trajectoire. À la place d'une « voix » passive, Insights a
un **Coach Salsi** : tu choisis **une des 4 mesures** à améliorer, il te donne un
plan profond (enjeu, leviers priorisés, mouvement du moment, pièges) qui **évolue**
en comparant ta mesure au moment où tu as pris le cap. Un seul système, deux modules.

---

## Sécurité & contraintes

- **Pas de stockage de token à long terme** côté serveur : tout le calcul se
  fait dans le navigateur avec le token de session. Les éventuels back-ends
  (ex. service de snapshots) ne stockent que des **métriques**, jamais de token.
- **Aucune écriture n'est mergée automatiquement** : les modules qui écrivent
  (MR de rapport, correctifs Salsi, scaffolder…) **proposent** une MR ; le merge
  reste un geste humain.
- **Pagination GitLab bornée** partout (`gitlabPaginate`) — pas de boucle
  infinie possible.

---

## Développement

- **Pas de build.** Édite les fichiers, recharge la page.
- **Vérifs** : `node --check <fichier.js>` sur les scripts touchés ; les moteurs
  déterministes (ex. `js/gaming-history.js`) sont testables hors-ligne via
  `require()` en node.
- **Convention** : classique `<script src>`, pas de module ES, pour rester
  compatible `file://`.

## Voir aussi

- [`RELEASE_NOTES.md`](RELEASE_NOTES.md) — historique des versions.
- [`SALSI_CONSEILS.md`](SALSI_CONSEILS.md) — les 47 conseils de Salsi, à valider.
