# Salsifi — Roadmap « IA » par module

> Où l'**IA** apporte une vraie valeur dans la plateforme, **pourquoi**, et **pour faire quoi**.
> Principe directeur : **IA quand il faut**. L'IA travaille sur le **flou** (comprendre du texte,
> résumer, rédiger, expliquer, trier de l'ambigu). Elle ne touche **jamais** au **déterministe**
> (les 4 mesures DORA, la détection de secrets, l'état d'un flag, l'XP anti-triche) : là, un calcul
> sûr et reproductible vaut mieux qu'un modèle. Ni gadget, ni « IA partout ».

## Ce que l'IA débloque (transversal)

- **Comprendre le langage naturel** — Salsi répond à une question mal formulée, on décrit une intention.
- **Résumer** — transformer ~20 sections de Daily, un gros diff, une rétro, en 3 phrases utiles.
- **Rédiger** — notes de version, plan d'accompagnement, brouillon de commentaire de revue.
- **Expliquer** — pourquoi ce red flag, cette non-conformité CIS, cette régression DORA.
- **Trier l'ambigu** — vrai secret vs faux positif, quick win prioritaire, estimé par analogie.

## Garde-fous (le contrat IA — non négociable)

1. **Déterministe d'abord.** L'IA ne remplace jamais un calcul fiable (DORA, secrets, flags, XP).
   Elle intervient **après**, sur l'interprétation.
2. **IA en assist, jamais en gate.** Elle **propose** ; l'humain approuve / merge / décide. Aucune
   action irréversible déclenchée par le modèle.
3. **Confidentialité — jamais de secret ni de token au LLM.** Pour Secrets / Security : on envoie le
   **type et l'emplacement**, **jamais la valeur** du secret ni le code sensible. Le token GitLab
   n'est **jamais** transmis au modèle : le back IA lit GitLab lui-même (compte de service, modèle
   « historien » — cf. `ROADMAP_BAC.md`).
4. **Réponses ancrées.** L'IA s'appuie sur le **contexte** (données du repo, glossaire, résultats) et
   **n'invente pas de chiffres** : une donnée absente → « demande à Salsi », pas d'hallucination.
5. **Transport plug-and-play.** Modèle **Vertex AI / Gemini côté LCL**. Front → une **URL** à coller
   (`salsi_ai_url` pour Salsi, `mr_reviewer_api_url` pour la revue de MR). Stub prêt : `salsi-ai-back/`.

## Légende des verdicts

| | Signification |
|---|---|
| 🟢 | **IA au cœur** — l'IA fait ce qu'aucun calcul ne peut (résumer, rédiger, comprendre du texte). |
| 🟡 | **IA en appoint** — utile pour expliquer / reformuler / prioriser ; le module marche déjà sans. |
| ⚪ | **Pas d'IA** — déterministe par nature ; l'IA n'ajouterait que du bruit ou du risque. |

## Synthèse

| Module | Chemin | Verdict | Ce que l'IA apporte en une phrase |
|---|---|:--:|---|
| Livraison (revue MR) | Livrer | 🟢 | Revue de MR assistée : décision + scores + findings + brouillon de commentaire. |
| Release Notes | Livrer | 🟢 | Génère les notes de version depuis les MR/commits mergés. |
| Feature Flag Manager | Livrer | 🟡 | Suggère le nettoyage des flags morts + nommage cohérent. |
| Daily Report | Mesurer | 🟢 | Résumé du standup en 3 phrases + ce qui compte parmi les 20 sections. |
| DevOps Assessment | Mesurer | 🟢 | Transforme les écarts (déclaratif ↔ GitLab) en plan d'accompagnement rédigé. |
| DORA Insights | Mesurer | 🟡 | Coaching narratif + explique une régression, propose des leviers. |
| Bus Factor | Mesurer | 🟡 | Explique le risque et suggère des actions de partage de savoir. |
| Générateur de rapport | Mesurer | 🟡 | Rédige la prose entre les blocs choisis. |
| Achievements | Mesurer | ⚪ | Badges/XP déterministes (l'anti-triche l'exige) — au mieux du texte gadget. |
| Repo Analyzer | Inspecter | 🟡 | Explique les red flags et priorise « par quoi commencer ». |
| Security Scanner | Inspecter | 🟡 | Explique une non-conformité CIS et propose le correctif ; trie l'OSV. |
| Secrets Scanner | Inspecter | 🟡 | Trie vrai secret / faux positif + remédiation — **sans jamais voir le secret**. |
| Branch Monitor | Inspecter | ⚪ | Âge / mergé = déterministe ; rien à interpréter. |
| Repo Diet | Inspecter | ⚪ | Mesure de poids ponctuelle — déterministe. |
| Secret Scanner Test | Inspecter | ⚪ | Investigation read-only déterministe. |
| Auto Retro | Collaborer | 🟢 | Synthétise la rétro depuis les events + la discussion, propose des actions. |
| Smart Estimate | Collaborer | 🟡 | Estimé par analogie (tickets passés similaires) ; la calibration reste statistique. |
| Salsi (assistant) | Transversal | 🟢 | Routeur déterministe d'abord, IA en dernier recours (flou, concepts, reformulation). |
| Scaffolder | Transversal | 🟡 | Propose une stack/config depuis une description, génère un squelette. |

---

# Chemin — Livrer

## 🚚 Livraison (revue de MR) — 🟢 IA au cœur
**Aujourd'hui** : cockpit MR (liste, diff, approuver, merger, commenter) + **bouton 🤖 Analyse IA**
déjà branché (`POST /api/analyze-from-gitlab`).
**Avec l'IA** — *pourquoi* : lire et juger du code est du raisonnement sur du texte, impossible en déterministe.
- **Revue assistée** : décision (✅/📝/❌) + scores (sécu/qualité/perf) + findings éditables.
- **Résumé de diff** : « ce que fait cette MR » en 2 lignes pour l'approbateur pressé.
- **Brouillon de commentaire / description** de MR, que l'humain valide.
> C'est la **vitrine IA** de la plateforme. L'assistant existe côté LCL → on colle l'URL.

## 📝 Release Notes — 🟢 IA au cœur
**Aujourd'hui** : compose des notes à partir des MR/tags.
**Avec l'IA** — *pourquoi* : résumer N changements techniques en un texte lisible est un cas d'usage IA canonique.
- **Génération** des notes depuis les MR/commits mergés d'une version (groupées par thème : feat / fix / breaking).
- **Ton adaptable** (interne technique vs annonce métier).

## 🚩 Feature Flag Manager — 🟡 IA en appoint
**Aujourd'hui** : cycle de vie, rollout, dette (déterministe).
**Avec l'IA** — *pourquoi* : l'état est déterministe ; l'IA n'aide qu'au **jugement mou**.
- **Suggérer le nettoyage** : proposer un texte de décommission pour un flag mort (« 100 % depuis 6 mois »).
- **Nommage** cohérent d'un nouveau flag. Rien de critique : l'IA ne bascule ni ne supprime.

---

# Chemin — Mesurer & Progresser

## 📅 Daily Report — 🟢 IA au cœur
**Aujourd'hui** : ~20 sections + stats du jour.
**Avec l'IA** — *pourquoi* : condenser beaucoup d'infos en un message de standup est du résumé pur.
- **Digest en 3 phrases** : « hier : 6 MR, 1 pipeline rouge à regarder, 2 MR en attente > 24 h ».
- **Mise en avant** de ce qui mérite l'attention (bruit filtré). Le calcul des stats reste déterministe.

## 📋 DevOps Assessment (Maturité) — 🟢 IA au cœur
**Aujourd'hui** : score /8 axes + confrontation déclaratif ↔ GitLab.
**Avec l'IA** — *pourquoi* : passer d'écarts chiffrés à un **plan rédigé** est de la synthèse.
- **Plan d'accompagnement** rédigé à partir des écarts (perception vs données).
- **Proposition d'ateliers** ciblés par axe faible. Le score et la confrontation restent déterministes.

## 📊 DORA Insights — 🟡 IA en appoint
**Aujourd'hui** : 4 mesures (déterministes) + coach à leviers.
**Avec l'IA** — *pourquoi* : les mesures ne se calculent **jamais** par IA ; elle sert l'interprétation.
- **Expliquer une régression** en langage clair (« ton CFR grimpe depuis 3 semaines, probablement… »).
- **Coaching narratif** plus contextuel que les leviers fixes. Jamais de chiffre inventé.

## 🚌 Bus Factor — 🟡 IA en appoint
**Aujourd'hui** : calcul du savoir concentré (déterministe).
**Avec l'IA** — expliquer le **risque** (« si X part, la zone paiement est orpheline ») et suggérer des
actions de **partage de savoir** (pairing, doc, rotation de reviewers).

## 📄 Générateur de rapport — 🟡 IA en appoint
**Avec l'IA** — rédiger la **prose de liaison** entre des blocs choisis, proposer un titre / une synthèse.
La composition et les données restent déterministes.

## 🏆 Achievements — ⚪ Pas d'IA
Badges, XP, niveaux = **déterministes**, et l'**anti-triche l'exige** (un score IA serait ni
reproductible ni défendable). Au mieux, l'IA écrirait la voix du compagnon → **gadget**, écarté.

---

# Chemin — Inspecter

## 🔍 Repo Analyzer — 🟡 IA en appoint
**Avec l'IA** — *pourquoi* : le score est déterministe ; l'IA aide à **agir**.
- **Expliquer** un red flag et son impact.
- **Prioriser** les quick wins : « par quoi commencer, vu ton contexte ». Pas de recalcul par l'IA.

## 🔒 Security Scanner (CIS / supply-chain) — 🟡 IA en appoint
**Avec l'IA** — la **détection reste déterministe** ; l'IA sert la **remédiation**.
- **Expliquer** une non-conformité CIS et proposer le correctif (ex. règle de protection de branche).
- **Trier** les findings OSV (exploitable ici ? contexte ?).
- ⚠️ **Jamais** de code sensible ni de secret au LLM — seulement la nature du problème.

## 🔑 Secrets Scanner — 🟡 IA en appoint (sous contrainte forte)
**Avec l'IA** — *pourquoi* : distinguer un vrai secret d'un faux positif est du **jugement**.
- **Triage** vrai secret / faux positif à partir du **type et du contexte**.
- **Suggérer la remédiation** (rotation, Vault).
- ⚠️ **RÈGLE ABSOLUE** : la **valeur du secret n'est JAMAIS envoyée au LLM** — uniquement le type,
  l'emplacement, l'empreinte. Cohérent avec le socle bac (« jamais la valeur »).

## 🌿 Branch Monitor · 🍃 Repo Diet · 🧪 Secret Scanner Test — ⚪ Pas d'IA
Déterministes par nature (âge de branche, poids, investigation read-only). Rien à interpréter.

---

# Chemin — Collaborer

## 🔄 Auto Retro — 🟢 IA au cœur
**Aujourd'hui** : rétro assistée par les events GitLab.
**Avec l'IA** — *pourquoi* : regrouper des ressentis et des faits en thèmes est du raisonnement sur du texte.
- **Synthèse** de la rétro depuis les events + la discussion d'équipe.
- **Clustering** des thèmes (ce qui revient), **brouillon d'actions**. L'équipe valide.

## 🎯 Smart Estimate — 🟡 IA en appoint
**Avec l'IA** — *pourquoi* : suggérer un estimé par **analogie** (tickets passés similaires, RAG sur
l'historique) aide au cadrage. La **calibration** (estimé vs réel) reste **statistique**, pas IA.

---

# Transversal

## 🌱 Salsi (assistant) — 🟢 IA au cœur (mais en dernier recours)
**Aujourd'hui** : routeur **déterministe** (intents → réponses sûres, actions réelles), IA en fallback.
**Avec l'IA** — *pourquoi* : c'est **le** modèle « IA quand il faut ».
- **Déterministe d'abord** : concepts du glossaire, résultats de l'utilisateur, actions (livraison, MR…).
- **IA en dernier recours** : question hors-script, reformulation, explication d'un concept absent du glossaire.
- Réponses **ancrées** dans le contexte, jamais de chiffre inventé.

## 🏗️ Scaffolder — 🟡 IA en appoint
**Avec l'IA** — proposer une **stack / config** à partir d'une description libre du projet, générer un
**squelette** commenté. Les gabarits déterministes restent la base.

---

## Priorités IA (ordre de valeur)

1. **Livraison — revue de MR** 🟢 (déjà branché ; il ne manque que l'URL de l'assistant LCL).
2. **Daily Report — digest 3 phrases** 🟢 (fort impact, faible risque).
3. **Auto Retro — synthèse** 🟢.
4. **Release Notes — génération** 🟢.
5. **DevOps Assessment — plan rédigé** 🟢.
6. Le reste 🟡 au fil de l'eau. Les ⚪ restent **volontairement sans IA**.
