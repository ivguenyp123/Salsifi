# Salsifi — Roadmap « bac » (backend) par module

> Ce que chaque module de la plateforme peut gagner avec un **backend** (base
> Mongo + service serveur). Aujourd'hui tout tourne **100 % navigateur** : lecture
> live GitLab, calculs côté client, état en `localStorage`. Puissant, mais borné à
> l'onglet ouvert, à une machine, à un utilisateur, à l'instant T.

## Ce que le back débloque (transversal)

Le socle bac apporte des **capacités** que les modules réutilisent :

- **Persistance partagée** — l'historique et l'état vivent au-delà d'un onglet, d'une
  machine et d'un utilisateur (fini le `localStorage` isolé).
- **Multi-utilisateur / équipe** — tout le monde voit les mêmes données, agrégées par
  squad / direction / organisation.
- **Tâches planifiées (scheduler)** — snapshots DORA nocturnes, rapports quotidiens,
  scans récurrents… sans que personne n'ouvre le hub.
- **Notifications hors-ligne** — mail / Teams / webhook, même hub fermé.
- **Webhooks GitLab entrants** — réagir à un event (push, MR, pipeline) au lieu de
  _poller_ → temps réel et moins d'appels API.
- **Historique & tendances** — mesurer l'évolution dans le temps, pas juste l'instant.
- **RBAC & audit** — qui a le droit de quoi, et une trace de qui a fait quoi.

## Légende des verdicts

| | Signification |
|---|---|
| 🟢 | **Fort besoin** — le back débloque la valeur principale (historique, planifié, notif, équipe). |
| 🟡 | **Bénéficie** — marche déjà en live ; le back ajoute confort, historique, partage. |
| ⚪ | **Pas besoin** — analyse ponctuelle « one-shot », le navigateur suffit. |

## Vue d'ensemble

| Module | Chemin | Verdict | Ce que le back ajoute en une phrase |
|---|---|:--:|---|
| DORA Insights | Mesurer | 🟢 | Historique persistant + snapshots planifiés + vue équipe/org. |
| DevOps Assessment | Mesurer | 🟢 | Suivi des évaluations dans le temps + rollup par squad. |
| Achievements | Mesurer | 🟢 | Leaderboard d'équipe partagé + XP anti-triche serveur. |
| Bus Factor | Mesurer | 🟡 | Tendance + alerte quand une zone devient mono-porteur. |
| Daily Report | Mesurer | 🟢 | Génération + envoi planifiés (standup auto), archive. |
| Générateur de rapport | Mesurer | 🟡 | Modèles sauvegardés, génération planifiée, PDF serveur. |
| **Livraison** | Livrer | 🟢 | Surveillance hors-ligne + historique/audit + file + métriques. |
| Feature Flag Manager | Livrer | 🟢 | Journal d'audit + dette de flags suivie + alertes flags morts. |
| Release Notes | Livrer | 🟡 | Publication + archive + agrégation multi-repo. |
| Repo Analyzer | Inspecter | 🟡 | Santé suivie dans le temps + dashboard org + scans planifiés. |
| Security Scanner | Inspecter | 🟢 | Posture de conformité suivie + vue org + waivers + alertes. |
| Repo Diet | Inspecter | ⚪ | Analyse ponctuelle — pas besoin (option : poids dans le temps). |
| Branch Monitor | Inspecter | 🟡 | Rappels de nettoyage planifiés + historique. |
| Secrets Scanner | Inspecter | 🟢 | Cycle de vie des findings + alerte nouveaux secrets + dashboard. |
| Secret Scanner Test | Inspecter | ⚪ | Investigation read-only — option : archiver les enquêtes. |
| MR Reviewer AI | Collaborer | 🟢 | Back IA (déjà prêt) + historique de revues + métriques. |
| Auto Retro | Collaborer | 🟢 | Rétros stockées + suivi des actions dans le temps. |
| Smart Estimate | Collaborer | 🟢 | Estimé vs réel → calibration/vélocité qui apprend. |
| Salsi (assistant) | Transversal | 🟡 | Mémoire persistante + IA branchée + savoir d'équipe. |

---

# Chemin 1 — Mesurer & Progresser

## 📊 DORA Insights — 🟢 fort besoin
**Aujourd'hui** : calcule DF / LTC / CFR / MTTR en live depuis GitLab, historique en `localStorage`.
**Avec le bac** :
- **Historique persistant et partagé** (par repo, squad, direction) — plus lié à un navigateur.
- **Snapshots planifiés** (nocturnes) → courbes fiables sans devoir ouvrir le module.
- **Agrégation d'équipe/org** : les 4 mesures d'un ensemble de repos, classement des squads.
- **Alertes de régression** (ex. CFR qui grimpe, DF qui chute) → mail/Teams.
- **Benchmark interne** : « où se situe mon équipe vs la médiane LCL ».

## 📋 DevOps Assessment (Maturité) — 🟢 fort besoin
**Aujourd'hui** : score sur 8 axes, radar, historique local.
**Avec le bac** :
- **Évaluations horodatées** conservées → trajectoire de maturité réelle.
- **Rollup par squad / département**, comparaison entre équipes.
- **Rappels planifiés** de ré-évaluation trimestrielle.
- **Partage** d'un résultat (lien) et plan d'action suivi dans le temps.

## 🏆 Achievements — 🟢 fort besoin
**Aujourd'hui** : badges/XP/niveaux calculés depuis GitLab, historique local.
**Avec le bac** :
- **Leaderboard d'équipe** partagé (le sel du jeu, impossible en local isolé).
- **XP validé côté serveur** (anti-triche, cohérence entre membres).
- **Défis d'équipe / saisons**, historique des déblocages.
- **Cross-device** : mêmes badges partout.

## 🚌 Bus Factor — 🟡 bénéficie
**Aujourd'hui** : calcul live par zone de code (savoir d'aujourd'hui).
**Avec le bac** :
- **Tendance dans le temps** (le bus factor s'améliore-t-il ?).
- **Alerte** quand une zone bascule en mono-porteur (BF=1).
- **Vue org** : les zones critiques de tous les repos d'une squad.
- _Le calcul lui-même reste très bien en live._

## 📅 Daily Report — 🟢 fort besoin
**Aujourd'hui** : digest GitLab du jour pour le standup, navigable jour par jour.
**Avec le bac** :
- **Génération + envoi planifiés** (chaque matin, mail/Teams) — _la_ feature qui change tout.
- **Archive** consultable (au-delà de ce que l'API renvoie).
- **Digest d'équipe** consolidé, pas seulement par repo.

## 📄 Générateur de rapport — 🟡 bénéficie
**Aujourd'hui** : compose un HTML téléchargeable à partir de blocs (module en finalisation).
**Avec le bac** :
- **Modèles sauvegardés** et **bibliothèque partagée** de rapports.
- **Génération planifiée** (rapport hebdo automatique).
- **Export PDF côté serveur** (rendu fidèle) et **envoi** aux destinataires.

---

# Chemin 2 — Livrer & Déployer

## 🚚 Livraison — 🟢 fort besoin (le plus gros levier)
**Aujourd'hui** : préparer (bump + overlays + MR), valider/merger, train de pipeline,
et **surveillance proactive** — mais côté navigateur, tant que l'onglet est ouvert.
**Avec le bac** :
- **Surveillance serveur des MR** via **webhooks GitLab** → notif « ta MR est approuvée,
  on livre ? » **même hub fermé** (mail/Teams). Fin du poll navigateur.
- **Historique & audit des livraisons** partagé : qui a livré quoi, quand, quel env, quel
  résultat pipeline. Traçabilité conformité.
- **File de livraison / calendrier** (fenêtres de livraison, gel prod).
- **Rollback tracé** (bouton gouverné + trace de qui/quand/pourquoi).
- **RBAC** : qui peut livrer en prod vs uat vs dev.
- **Métriques de delivery** stockées (lead time, fréquence, taux d'échec par équipe).

## 🚩 Feature Flag Manager — 🟢 fort besoin
**Aujourd'hui** : cycle de vie, audit, decommission, RBAC via l'API GitLab.
**Avec le bac** :
- **Journal d'audit persistant** des changements de flags (qui a activé/coupé quoi).
- **Dette de flags** suivie dans le temps + **alerte flags morts** (activés depuis N mois).
- **Registre de propriété** (owner par flag) et **workflow d'approbation** de bascule.
- **Rappels de decommission** planifiés.

## 📝 Release Notes — 🟡 bénéficie
**Aujourd'hui** : génère les notes par tag Git.
**Avec le bac** :
- **Publication & archive** des notes (portail interne, historique consultable).
- **Abonnement** (être notifié d'une nouvelle version d'un service).
- **Agrégation multi-repo** (note de version d'un ensemble applicatif).

---

# Chemin 3 — Inspecter & Sécuriser

## 🔬 Repo Analyzer — 🟡 bénéficie
**Aujourd'hui** : état global du repo en live.
**Avec le bac** :
- **Santé suivie dans le temps** (le repo s'améliore-t-il ?).
- **Dashboard org** : la santé de tous les repos d'une squad, tri par risque.
- **Scans planifiés** + alerte quand un repo se dégrade.

## 🛡️ Security Scanner (Gouvernance) — 🟢 fort besoin
**Aujourd'hui** : conformité CIS GitLab, note A→F, crée des MR de remédiation.
**Avec le bac** :
- **Posture de conformité suivie** dans le temps (courbe A→F par repo/squad).
- **Vue org** : le taux de conformité de toute l'organisation, non-conformités priorisées.
- **Registre de dérogations (waivers)** : accepter un écart avec justification + échéance.
- **Scans planifiés** + **alerte** sur nouvelle non-conformité (ex. branche dé-protégée).
- **Audit trail** des remédiations (MR créées, mergées, refusées).

## 🥗 Repo Diet — ⚪ pas besoin
**Aujourd'hui** : détecte binaires/archives/logs, génère un `.gitignore`. Analyse ponctuelle.
**Avec le bac** (optionnel, faible valeur) :
- Suivre le **poids du repo dans le temps**, alerter sur une grosse prise de poids.
- _Sinon : le navigateur suffit largement, pas de bac nécessaire._

## 🌳 Branch Monitor — 🟡 bénéficie
**Aujourd'hui** : détecte/nettoie les branches obsolètes (âge, mergé, protégé).
**Avec le bac** :
- **Rappels de nettoyage planifiés** (mail hebdo « 12 branches mortes »).
- **Historique** des nettoyages + politique par repo.
- _La détection reste très bien en live._

## 🔑 Secrets Scanner — 🟢 fort besoin
**Aujourd'hui** : balaie TOUS les repos accessibles (réservé plateforme), fichier/ligne/type.
**Avec le bac** :
- **Cycle de vie des findings** : nouveau / en cours / résolu / faux positif, avec triage
  persistant (ne pas re-signaler ce qui est déjà traité).
- **Alerte sur nouveau secret** exposé (webhook push) — temps réel, pas au prochain scan manuel.
- **Dashboard** de l'exposition à l'échelle org + **suivi de remédiation** (révocation).
- **Historique** : combien de secrets, où, tendance.

## 🧪 Secret Scanner Test (Blast Radius) — ⚪ pas besoin
**Aujourd'hui** : rayon d'impact d'un IOC (package compromis), read-only, timeline.
**Avec le bac** (optionnel) :
- **Archiver les enquêtes** (IOC, périmètre, date) pour la traçabilité incident.
- _Le cœur (analyse à la demande) n'a pas besoin de bac._

---

# Chemin 4 — Collaborer & Améliorer

## 🤖 MR Reviewer AI — 🟢 fort besoin
**Aujourd'hui** : analyse IA des MR (qualité, risques, couverture). L'IA passe par le back.
**Avec le bac** :
- **Back IA** (déjà prêt, cf. `salsi-ai-back/`) — le maillon nécessaire.
- **Historique de revues** par MR/repo, **métriques** (temps de review, findings récurrents).
- **Boucle d'amélioration** : feedback humain sur les suggestions → affine les prompts.

## 🔄 Auto Retro — 🟢 fort besoin
**Aujourd'hui** : génère une rétro à partir de GitLab (+ user stories Jira).
**Avec le bac** :
- **Rétros stockées** et consultables (mémoire d'équipe).
- **Suivi des actions** décidées en rétro (créées, faites, abandonnées) — le vrai ROI d'une rétro.
- **Récurrence** (rétro auto à chaque fin de sprint) + tendances d'un sprint à l'autre.

## 🎯 Smart Estimate — 🟢 fort besoin
**Aujourd'hui** : estime la charge d'une feature depuis l'historique des MR.
**Avec le bac** :
- **Estimé vs réel** conservé → l'outil **se calibre** au fil du temps (précision qui monte).
- **Vélocité d'équipe** apprise et suivie.
- **Modèle par équipe** (chaque squad a son rythme).

---

# Transversal

## 🌱 Salsi (assistant) — 🟡 bénéficie (déjà bien outillé)
**Aujourd'hui** : routeur déterministe + actions de livraison réelles ; IA en dernier recours
(back prêt à brancher). Mémoire de contexte en session.
**Avec le bac** :
- **IA branchée** (déployer `salsi-ai-back/` + coller l'URL) → réponses libres hors périmètre déterministe.
- **Mémoire persistante** : dernière branche, préférences de flow, mapping majeur/mineur **par équipe**, survivant aux sessions et machines.
- **Savoir d'équipe** : le journal des questions (`salsi_qa_log`) centralisé → améliorer le déterministe, mesurer ce que les gens demandent.
- **Surveillance de livraison côté serveur** (cf. module Livraison) pilotée par Salsi.

## 🧱 Le socle « bac » à prévoir
Composants transverses que la plupart des modules 🟢 réutilisent :
- **Service de notification** (mail / Teams / webhook) — mutualisé.
- **Scheduler** (cron) — snapshots DORA, Daily Report, scans récurrents.
- **Ingestion de webhooks GitLab** — remplace le polling (livraison, secrets, sécu).
- **Store d'historique & métriques** (Mongo) — séries temporelles par repo/équipe.
- **Profils / RBAC / audit** — qui voit quoi, qui peut livrer où, trace des actions.
- **Cache serveur partagé** — moins d'appels GitLab, cohérence multi-utilisateur.

---

# Suggestion d'ordre d'attaque (quick wins d'abord)

1. **Socle minimal** : store Mongo + service de notif + scheduler + ingestion webhooks.
2. **Livraison — surveillance serveur** (webhook MR approuvée → notif) : plus gros « waouh »,
   prolonge direct ce qu'on vient de faire.
3. **Daily Report planifié** (envoi matinal auto) : valeur immédiate, techniquement simple.
4. **DORA / Maturité — historique persistant + vue équipe** : la mesure devient une trajectoire.
5. **Security / Secrets — suivi + alertes** : conformité qui vit dans le temps.
6. **Collab (Retro actions, Smart Estimate calibré, MR Reviewer historisé)** : l'IA + la mémoire.

> Modules **sans bac** : **Repo Diet** et **Secret Scanner Test** (analyses ponctuelles).
> Tout le reste gagne — mais on priorise les 🟢 qui débloquent une valeur qu'on **ne peut pas**
> faire côté navigateur (planifié, hors-ligne, équipe, historique).
