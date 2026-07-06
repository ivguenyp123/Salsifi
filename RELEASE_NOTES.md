# Salsifi — DevOps Hub · Notes de version

## v1.0.1 — 2026-07-06 · Correctifs

Grande passe de revue (5 relectures croisées de tous les modules, chaque
signalement vérifié dans le code avant correction). **17 défauts de correction**
corrigés, validés en syntaxe **et** au navigateur (14 pages, zéro erreur JS
introduite). Aucune régression : les correctifs sont locaux et ciblés.

### 🐛 Calcul & métriques

| Module | Défaut | Effet | Correctif |
|---|---|---|---|
| **hub** | `syn.tags` jamais renseigné | Badge « Semantic Versioning » indébloquable, XP sous-compté (−75) | `tags` ajouté à la synthèse |
| **maturité** | Pilier data **Sécurité toujours à 0** (questions `dataOnly` X01-X05 exclues du calcul) | Carte Sécurité « non conforme » et score global amputé (~12 pts) malgré des métriques GitLab bien lues | `dataScoreForCat` inclut les questions data |
| **feature flags** | `% rollout` forcé à 100 dès qu'un flag est actif | Un rollout progressif à 25 % affiché à 100 %, classification faussée | `active` = interrupteur, pas pourcentage |
| **feature flags** | Sparkline de santé lue via `b.s` (→ NaN) | Courbe jamais tracée | Lecture de `b.score` |
| **gaming** | Taux review/MR calculés sur un échantillon de 30 mais divisés par le total | Badges de review indébloquables dès >30 MRs | Division par la taille réelle de l'échantillon |
| **insights · gaming · dora** | MTTR : pannes consécutives d'un même incident comptées plusieurs fois | Médiane MTTR biaisée vers le bas, nb d'incidents gonflé | Seule la 1ʳᵉ panne d'une série démarre le chrono |
| **daily-report** | Issues sans borne haute + « du jour » basé sur `updated_at` | Compteurs gonflés sur une date passée | Filtre sur `merged_at` / `closed_at` + borne haute |

### 🔎 Scanners & analyse

- **secrets-scanner & gouvernance-repo** : `getFileContent` utilisait `?ref=HEAD`
  (404 silencieux) → **aucun contenu lu**, 0 secret / 0 alerte supply / Maven CIS
  figées en permanence. On passe désormais la branche par défaut du repo.
- **CIS (gouvernance & secrets)** : les erreurs non-403 (404 GitLab CE, réseau)
  étaient prises pour un vrai résultat → **faux « non conforme » et faux
  « conforme »**. Elles deviennent « non vérifiable ».
- **repo-analyzer** : une réponse non-tableau (endpoint 403) faisait **planter
  toute l'analyse** ; chaque fetch de liste est coercé en tableau.
- **repo-diet** : détection des dossiers par **sous-chaîne** (`bin` matchait
  `combine.js`, `out` matchait `about.md`…) → faux positifs massifs. Match par
  segment de chemin + un fichier n'est plus compté qu'une fois.

### 🔒 Écritures GitLab & sécurité

- **branch-cleaner** : la **branche par défaut** est exclue de la suppression
  même si sa protection a été retirée (`branch.default`).
- **pipeline-generator** : les variables **sensibles étaient poussées non
  masquées** (tokens/mots de passe visibles dans les logs de jobs) → masquées ;
  `exportSecretsTemplate` plantait (`currentSecrets` inexistant) → corrigé.
- **feature flags** : annuler la confirmation prod depuis le wizard cleanup
  laissait le handler patché en place → **risque de toggle sur le mauvais flag**.
  Le handler d'origine est restauré et l'action en attente purgée.
- **mr-reviewer** : attribut `data-iid` dupliqué (coquille).

### 🔜 Identifié, non corrigé (volontairement)

- **repo-analyzer** : détection CODEOWNERS / templates MR sur un arbre non
  récursif (faux positifs) — le passage en récursif change la sémantique des
  autres détections racine, reporté.
- **insights CFR** : carte / quick-wins / score affichent 3 valeurs — c'est le
  « plancher de tendance » **voulu**, à clarifier côté UX plutôt qu'à corriger.
- Décalage de fuseau du graphe d'évolution, paginations partielles, code mort
  (hub) : mineurs / cosmétiques.

---

## v1.0.0 — 2026-07-06

Première version consolidée de la plateforme. Un ensemble de pages HTML/CSS/JS
statiques (aucun build, fonctionne servi **et** en local `file://`) est devenu
une plateforme cohérente : couche commune factorisée, moteur d'atelier connecté,
scaffolder conversationnel, fiabilité renforcée.

> Compatibilité : tout reste en `<script src>` classique et CSS statique — **pas
> de bundler, pas de module ES** — pour continuer à marcher à la fois servi (dev/
> prod GitLab) et ouvert en local (`file://`).

---

## ✨ Points forts

- **Couche commune `js/common/` + `css/theme.css`** : le code partagé vit à un
  seul endroit (utilitaires, transport GitLab, pagination, auth, design tokens).
- **Moteur d'atelier connecté** : le plan de maturité et le hub pointent vers les
  vraies pages Confluence des 205 ateliers.
- **Scaffolder « Concierge »** : un assistant conversationnel qui déduit le flow
  Git de la squad et prépare la Merge Request, à la place du formulaire.
- **Fiabilité** : plus aucune pagination GitLab non bornée (risque de boucle).
- **Gouvernance d'accès** : le Secrets Scanner n'est plus lançable en self-service.

---

## 🏗️ Couche commune (factorisation)

Le code dupliqué dans chaque page a été regroupé, sans changement de comportement
(chaque étape validée au navigateur).

| Fichier | Contenu |
|---|---|
| `js/common/utils.js` | `escapeHtml`, `escapeAttr`, `runWithConcurrency` |
| `js/common/gitlab.js` | `gitlabFetch` (retry HTTP 429), `gitlabJson`, `gitlabPaginate` |
| `js/common/auth.js` | `loadAuth`, `getRepoId` |
| `js/common/workshops.js` | référentiel des 205 ateliers ↔ liens Confluence |
| `css/theme.css` | design tokens partagés (couleurs, fonds, texte, catégories) |

- **Utilitaires JS** : `escapeHtml`/`escapeAttr` (×14, sécurité XSS) et
  `runWithConcurrency` factorisés. (~330 lignes de doublons supprimées avec le CSS.)
- **Transport GitLab** : un seul `gitlabFetch` (URL `/api/v4`, header
  `PRIVATE-TOKEN`, retry sur rate-limit 429). Chaque page garde son contrat
  d'origine (Response brute ou JSON-ou-null).
- **Design tokens** : 224 déclarations de couleurs dupliquées retirées de 18
  fichiers CSS. Rebrand = 1 ligne au lieu de 25. Zéro régression visuelle
  (valeurs calculées + diff pixel vérifiés).
- **Authentification** : lecture de l'auth GitLab et résolution du repo courant
  centralisées. **14 modules** lisent désormais l'auth via un seul fichier —
  changer le format de stockage = 1 fichier à toucher au lieu de 14.

---

## 🎓 Moteur d'atelier (maturité ↔ hub ↔ Confluence)

- **Référentiel** `workshops.js` : relie le plan de maturité (axe + niveau +
  action), le numéro d'action (#1–205) et la page Confluence. 166 actions liées,
  39 encore « à écrire » (surtout Résilience & Stabilité).
- **Maturité** : en fin d'évaluation, chaque action du plan d'accompagnement
  affiche un bouton **« 📄 Voir l'atelier »** vers sa page Confluence.
- **Hub** : le bloc « Pour aller plus loin » est désormais **piloté par les axes
  faibles** de la squad et sourcé sur le référentiel — vrais ateliers cliquables
  + conseils génériques non-cliquables. Fini les toasts « atelier à venir » : les
  22 cartes périmées (slugs désynchronisés) ont été retirées.

---

## 🛎️ Scaffolder → Concierge conversationnel

Le « Démarrer un projet » (`project-scaffolder.html`) passe d'un wizard à
formulaire à un **assistant conversationnel** :

- 5 questions concrètes (feature flags, cadence, taille d'équipe, CI…) → le noyau
  déterministe **déduit le flow Git** (Trunk / Gitflow / Feature branching) avec
  raisonnement visible et contestation possible.
- La conversation collecte ensuite la stack et Docker, montre le périmètre
  d'exécution, puis lance le **moteur réel** (écriture des fichiers, branches,
  protections, ouverture de la Merge Request — le merge reste le geste humain).
- Look adapté aux design tokens de la plateforme, bouton retour au hub, mode
  expert (mémoire du contexte).

---

## 🔒 Gouvernance & accès

- **Secrets Scanner réservé** : l'outil qui balaie *tous* les repos accessibles
  n'est plus lançable par les équipes depuis le hub (carte grisée, badge
  « réservé », clic bloqué avec explication). Le Security Scanner (conformité
  CIS) reste, lui, accessible.

---

## 🛡️ Fiabilité

- **Pagination GitLab bornée partout** : `gitlabPaginate` (cap 50 pages,
  `per_page` auto, arrêt sur page vide/partielle) remplace 8 paginations locales,
  dont deux `while(true)` sans garde-fou (hub, dora-workspace). Les paginations
  inline restantes (gouvernance-repo, secrets-scanner) ont reçu un cap défensif.
  → Plus aucune boucle de pagination non bornée dans le code vivant.

---

## 🧭 Divers

- **Renommage** `hub-mockup-v2_1.html` → **`hub.html`** (41 références mises à
  jour : liens retour, constantes, redirections).
- Structure du dépôt normalisée : pages HTML à la racine, `css/` et `js/` (dont
  `js/common/`).

---

## 🔜 Suite possible

- Rédiger les **39 pages Confluence** d'ateliers manquantes (axes Résilience &
  Stabilité surtout).
- Migrer les derniers modules « tout inline » (`pipeline-generator`,
  `repo-analyzer`, `gouvernance-repo`, `secrets-scanner`) vers la couche commune
  (auth, `gitlabJson`).
- Verrou côté page pour le Secrets Scanner (l'URL directe reste atteignable).
- Filtrage par chemin des ateliers recommandés du hub (aujourd'hui globaux).
