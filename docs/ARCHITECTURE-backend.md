# Backend `archicapa` — Architecture

> Un monorepo, des déploiements indépendants. Une seule équipe, une instance
> Mongo partagée, des services qui se déploient chacun de leur côté. Voici
> comment le dépôt est structuré et les règles qui tiennent ça ensemble.

## La décision, en trois règles

1. **📦 Un seul dépôt** — `archicapa/backend`. Un dossier par service, un dossier
   `packages/` pour le code partagé. Pas un repo par service.
2. **🚀 Chaque service est autonome** — sa propre entrée, sa logique, son image,
   déployable seul. La structure sépare les services sans séparer les dépôts.
3. **🔑 Une collection = un service propriétaire** qui écrit dedans. Les autres
   passent par son API. Même instance, même base, jamais deux écrivains sur la
   même collection.

---

## 01 · Pourquoi un monorepo

Le repo-par-service protège des frontières d'équipe. Vous n'en avez pas.

Le seul argument fort du multi-repo, c'est d'isoler des équipes qui ne veulent
pas se marcher dessus. À **une seule équipe**, il ne s'applique pas — et il
coûte cher :

- **Changement transverse atomique.** Tu modifies un modèle Mongo partagé + les
  3 services qui l'utilisent → **1 commit, 1 PR**. En multi-repo, c'est 4 PRs
  coordonnées entre 4 dépôts, avec des bumps de version entre eux.
- **Un seul endroit** pour le lint, les types, la connexion Mongo. Pas de
  duplication ni de dérive.
- **Le déploiement indépendant reste possible** — c'est une question
  d'outillage, pas de frontière de dépôt.

> **À retenir :** déployer indépendamment ≠ repos séparés. La structure isole
> chaque service ; un monorepo déploie très bien chacun tout seul.

---

## 02 · Structure complète

Exemple en Node/TypeScript — le principe tient quel que soit le langage.

```
archicapa-backend/
├─ services/                    # un dossier = un service déployable
│  ├─ facturation/
│  │  ├─ src/
│  │  │  ├─ index.ts            # entrée HTTP du service
│  │  │  ├─ routes.ts           # l'API exposée aux autres services
│  │  │  ├─ repository.ts       # SEUL code qui écrit dans `factures`
│  │  │  └─ domain.ts           # logique métier pure
│  │  ├─ test/
│  │  ├─ Dockerfile
│  │  ├─ .gitlab-ci.yml         # CI du service (déjà en place)
│  │  ├─ package.json           # @archicapa/facturation
│  │  └─ README.md              # ce qu'il possède + son API
│  ├─ inventaire/               # même structure
│  └─ notifications/
│
├─ packages/                    # code partagé, jamais déployé seul
│  ├─ mongo/
│  │  └─ src/
│  │     ├─ client.ts           # connexion unique (pool) à l'instance
│  │     ├─ collections.ts      # registre collection → propriétaire
│  │     └─ index.ts
│  ├─ auth/                     # vérif token / sessions, partagé
│  ├─ types/                    # DTO échangés entre services
│  └─ config/                   # lecture + validation de l'env au boot
│
├─ infra/
│  ├─ docker-compose.yml        # mongo + services en local
│  └─ mongo-init/               # base + users applicatifs (droits limités)
│
├─ .gitlab-ci.yml               # CI racine (déjà en place)
├─ package.json                 # workspaces : services/* + packages/*
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ .env.example
└─ ARCHITECTURE.md              # ce document
```

Chaque service est **autonome** : son entrée HTTP, sa logique, son `Dockerfile`.
Il ne dépend des autres que par `packages/*` (code partagé) et par leurs **API**
(jamais par leurs données).

---

## 03 · La règle Mongo — le cœur du sujet

Partager l'instance : sain. Partager les collections : le piège.

Une instance, une base `archicapa`, et **un propriétaire par collection**. Le
registre est explicite et versionné :

```ts
// packages/mongo/src/collections.ts
// Source de vérité : qui possède quoi.
// Un seul service ÉCRIT dans chaque collection.
export const OWNERS = {
  factures:      'facturation',
  articles:      'inventaire',
  stocks:        'inventaire',
  notifications: 'notifications',
} as const;
```

**✓ À faire** — `inventaire` a besoin d'une facture → il appelle
`GET /facturation/v1/factures/:id`. C'est `facturation` qui lit sa propre
collection.

**✕ À éviter** — `inventaire` fait `db.collection('factures').find()` en direct.
Le jour où `facturation` change son schéma, `inventaire` casse en silence.

> **Verrou technique :** donne à chaque service son **propre utilisateur Mongo**,
> avec les droits limités à ses collections. L'utilisateur de `inventaire` ne
> *peut pas* écrire dans `factures`, même par erreur. La règle devient
> impossible à violer.

---

## 04 · Packages partagés & le seul coût

Les services partagent `@archicapa/mongo`, `@archicapa/auth`, `@archicapa/types`,
`@archicapa/config`. Avantage : une seule version, pas de dérive.

**Le coût :** quand un `packages/*` change, il faut redéployer les services qui
en dépendent. En monorepo ce lien est **visible au même endroit** (le package et
ses consommateurs sont côte à côte), au lieu d'être caché dans des bumps de
version entre dépôts. Un seul point de vérité, un seul comportement à comprendre.

---

## 05 · CI sur le monorepo

Le seul vrai défi : **ne construire, tester et déployer que ce qui a changé** —
jamais tout le repo à chaque commit. Deux niveaux :

- **Filtres de chemin** (`rules: changes:`) — « ce service a changé, OU un
  `packages/*` a changé → je le build ». Simple, suffisant pour démarrer.
- **Graphe de dépendances** (Nx / Turborepo / Bazel) — calcule les services
  *réellement* impactés par un diff (propagation des packages comprise) et
  **cache** ce qui n'a pas bougé. Plus précis quand le nombre de services croît.

> **Règle d'or :** un `packages/*` change → on redéploie ses consommateurs. Le
> graphe le fait tout seul ; en filtres de chemin, c'est le
> `changes: [packages/**]` présent sur chaque service.

---

## 06 · Mesurer DORA sur un monorepo

**Clé = le service déployable, jamais le repo.** Si DORA compte « les
déploiements *du repo* », un monorepo donne une fréquence ridicule et un lead
time faussé. Chaque métrique se mesure **par service** :

- **Deployment frequency** — par service (`facturation:sha` en prod = 1
  déploiement de `facturation`).
- **Lead time** — commit → prod *de ce service*.
- **Change failure rate / MTTR** — attribués au **service qui a échoué**, pas au repo.

### Livrer en feature flag

Le flag **découple *déployer* de *release*** : tu déploies flag **off** (dark),
tu allumes plus tard. Effet sur DORA :

| Métrique | Effet du feature flag |
|---|---|
| **Deployment frequency** | **↑** — petits incréments continus ; même une feature incomplète part en prod derrière son flag. |
| **Lead time (to deploy)** | **↑** — merge → prod reste court, tu n'attends pas que la feature soit finie. |
| **Change failure rate** | ⚠️ le piège (ci-dessous). |
| **MTTR** | **↑** — un incident = couper le flag (secondes), pas un rollback + redeploy. |

**Le piège du CFR.** Un flip de flag **n'est pas un déploiement**. Si un flag mal
allumé casse la prod et que tu ne comptes les échecs que sur les *déploiements*,
l'incident disparaît de ton change failure rate : DORA devient magnifique… et
faux. C'est la façon classique de truquer DORA sans être plus fiable.

> **Pour garder DORA honnête :** traite un changement de flag comme un
> **événement de changement**. Logue chaque flip (qui, quand, quel %) ; si un
> incident vient d'un flag, il **compte** dans le CFR, comme un déploiement raté.

Le vrai gain vient du **rollout progressif** (1 % → 25 % → 100 %) avec
**kill-switch** et rollback auto sur seuil d'erreurs : c'est ça qui réduit
réellement le blast radius, donc CFR et MTTR. Et **nettoie les flags morts** —
un flag qui traîne devient de la dette et un risque.

---

## 07 · Conventions

| Sujet | Règle |
|---|---|
| **Base** | 1 instance, 1 base `archicapa`. Un **user Mongo par service**, droits limités à ses collections. |
| **Collection** | Un seul propriétaire (voir `OWNERS`). Nommée au pluriel, minuscules : `factures`, `stocks`. |
| **API interne** | REST/HTTP entre services, versionnée `/v1`. C'est le *seul* moyen d'accéder aux données d'un autre. |
| **Packages** | Scope `@archicapa/*`. Jamais déployés seuls ; consommés en workspace. |
| **Version** | Tag et image **par service** : `facturation-v1.4.0`, image `facturation:<sha>`. Chacun versionné indépendamment. |
| **Config** | Env lue et **validée au démarrage** via `@archicapa/config`. Aucun secret en dur ; le service refuse de booter si l'env manque. |

---

## 08 · Quand passer à plusieurs repos

Le monorepo est le bon choix tant que vous êtes une équipe. Scinde un service
dans son propre dépôt **seulement** si l'un de ces points devient vrai :

- Une **deuxième équipe** apparaît et doit avancer sans coordination.
- Un service doit être **open-sourcé** ou partagé hors de l'organisation.
- Contrainte de **conformité / cloisonnement d'accès** au code sur un service précis.
- Un service part sur une **stack radicalement différente** avec sa propre
  astreinte et sa cadence de release séparée.

Le cas échéant : un hybride (2-3 dépôts groupés par frontière d'équipe) — jamais
un dépôt par service.

---

*Adapte les noms de services (facturation / inventaire / notifications sont des
exemples) ; les trois règles, elles, ne bougent pas.*
