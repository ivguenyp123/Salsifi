// ============================================
// DONNÉES JSON (questions + conseils)
// ============================================

const jsonData = {
  "metadata": {
    "version": "1.0",
    "total_questions": 38,
    "categories": [
      { "id": "culture", "label": "Culture & Organisation", "icon": "👥", "color": "#f472b6", "type": "declaratif_pur", "count": 10 },
      { "id": "delivery", "label": "Delivery", "icon": "🚀", "color": "#60a5fa", "type": "declaratif_mesurable", "count": 5 },
      { "id": "quality", "label": "Qualité Code", "icon": "🔒", "color": "#a78bfa", "type": "declaratif_mesurable", "count": 5 },
      { "id": "stability", "label": "Stabilité", "icon": "⚙️", "color": "#34d399", "type": "declaratif_mesurable", "count": 4 },
      { "id": "hygiene", "label": "Hygiène Repo", "icon": "🧹", "color": "#fbbf24", "type": "declaratif_mesurable", "count": 5 },
      { "id": "resilience", "label": "Résilience", "icon": "🛡️", "color": "#f87171", "type": "declaratif_mesurable", "count": 4 },
      { "id": "practices", "label": "Pratiques", "icon": "⚡", "color": "#fb923c", "type": "declaratif_mesurable", "count": 5 }
    ],
    "levels": [
      { "value": 1, "label": "Initial", "emoji": "🔴" },
      { "value": 2, "label": "En Progrès", "emoji": "🟡" },
      { "value": 3, "label": "Formalisé", "emoji": "🔵" },
      { "value": 4, "label": "Sous Contrôle", "emoji": "🟢" },
      { "value": 5, "label": "Optimisé", "emoji": "🟣" }
    ]
  },
  "questions": [
    {
      "id": "C01",
      "category": "culture",
      "question": "La squad dispose-t-elle de rituels communs entre Dev, Ops et autres parties prenantes ?",
      "metric": null,
      "advice": {
        "1": "Pas de rituels communs. Commencez par un daily standup de 15 min max avec Dev + Ops dans la même salle (ou le même call). Même si c'est informel au début. → **Action immédiate :** bloquez un créneau récurrent de 15 min demain matin dans les agendas Dev + Ops.",
        "2": "Rituels naissants mais irréguliers. Formalisez : un créneau fixe dans les agendas, un format standard (tour de table, blocages, actions). La régularité crée l'habitude.",
        "3": "Rituels en place mais pas toutes les parties prenantes. Invitez QA, sécu, produit aux rituels clés. Pas à tous — mais au sprint planning et à la rétrospective minimum.",
        "4": "Rituels cross-fonctionnels réguliers. Mesurez leur efficacité : les blocages remontés en daily sont-ils résolus dans la journée ? Sinon, ajustez le format.",
        "5": "Rituels optimisés et adaptatifs. Continuez à challenger le format. Partagez votre modèle avec d'autres squads. → **Action immédiate :** préparez un résumé de 10 min sur votre format de rituels et proposez un talk à une squad voisine d'ici 2 semaines."
      }
    },
    {
      "id": "C02",
      "category": "culture",
      "question": "Les outils collaboratifs (Teams, Jira, Confluence) sont-ils utilisés efficacement pour réduire les frictions ?",
      "metric": null,
      "advice": {
        "1": "Outils utilisés de façon chaotique. Faites un inventaire : listez tous les outils utilisés et identifiez les doublons. Un canal Teams OU un Confluence, pas les deux pour le même sujet. → **Action immédiate :** prenez 20 min et listez tous les outils utilisés par la squad sur un doc partagé.",
        "2": "Outils identifiés mais pas de conventions. Définissez des conventions : quel outil pour quel usage, nommage des canaux, structure des pages Confluence. Documentez-le en 1 page.",
        "3": "Conventions définies mais adoption partielle. Faites un audit d'usage : qui utilise quoi ? Identifiez les résistances et formez les récalcitrants. Supprimez les outils morts.",
        "4": "Bonne adoption, quelques frictions restantes. Automatisez : notifications Jira dans Teams, liens automatiques entre MR et tickets, templates de pages. Réduisez le copier-coller.",
        "5": "Outils maîtrisés, frictions minimales. Faites un REX trimestriel sur l'outillage. Les besoins évoluent — challengez vos choix tous les 6 mois. → **Action immédiate :** créez un court guide \"Comment on utilise les outils chez nous\" et déposez-le dans le canal de la tribu."
      }
    },
    {
      "id": "C03",
      "category": "culture",
      "question": "Les informations critiques (problèmes, priorités, décisions) circulent-elles rapidement et clairement à tous les membres ?",
      "metric": null,
      "advice": {
        "1": "Les infos critiques arrivent tard ou pas du tout. Créez un canal #incidents dédié. Quand quelque chose casse, un message immédiat avec : quoi, impact, qui gère, ETA. → **Action immédiate :** créez le canal #incidents maintenant et envoyez le lien à toute la squad.",
        "2": "Communication réactive mais désorganisée. Créez un template de communication d'incident. Forcez son usage. En 30 secondes on doit comprendre la situation.",
        "3": "Bonne communication réactive, faible proactivité. Ajoutez de la proactivité : un point hebdo de 5 min sur les risques identifiés, les dépendances à venir, les dates clés.",
        "4": "Communication fluide, quelques angles morts. Vérifiez que TOUT le monde reçoit les infos : les nouveaux, les mi-temps, les externes. Personne ne doit découvrir un problème par hasard.",
        "5": "Communication exemplaire. Documentez vos pratiques de communication de crise. Partagez-les avec les autres squads."
      }
    },
    {
      "id": "C04",
      "category": "culture",
      "question": "Les rôles et responsabilités sont-ils bien compris et partagés entre les parties ?",
      "metric": null,
      "advice": {
        "1": "Rôles flous, chacun fait un peu tout. Faites un atelier de 30 min : qui fait quoi ? Posez-le sur papier. Une matrice RACI simple sur les 10 activités clés de la squad. → **Action immédiate :** bloquez 30 min cette semaine avec la squad et posez la question \"qui fait quoi ?\".",
        "2": "Rôles définis mais pas partagés. Affichez la matrice RACI dans votre espace commun (Confluence, Teams). Chaque nouveau doit la lire en onboarding.",
        "3": "Rôles partagés mais zones grises sur les sujets transverses. Clarifiez les zones grises : qui décide du merge ? Qui valide un déploiement ? Qui contacte le support N3 ? Mettez-le par écrit.",
        "4": "Rôles clairs, revus occasionnellement. Instaurez une revue trimestrielle de la RACI. Les rôles évoluent avec l'équipe — un départ ou une arrivée change la donne.",
        "5": "Rôles fluides et bien compris par tous. Encouragez la polyvalence : chacun devrait pouvoir remplacer au moins une autre personne sur ses responsabilités clés."
      }
    },
    {
      "id": "C05",
      "category": "culture",
      "question": "Le backlog intègre-t-il les besoins techniques et opérationnels ? (→ User Stories Dev, Sec ET Ops)",
      "metric": null,
      "advice": {
        "1": "Backlog 100% fonctionnel, zéro technique. Commencez par ajouter 2-3 US techniques dans le prochain sprint. Dette technique, amélioration de pipeline, monitoring — ça compte. → **Action immédiate :** ajoutez 3 US techniques dans le prochain sprint, maintenant.",
        "2": "Quelques sujets techniques mais pas systématiques. Réservez un quota fixe : 20% du sprint minimum pour le technique. Pas négociable, même sous pression produit.",
        "3": "Quota technique respecté mais pas d'US ops/sécu. Élargissez : les US ne sont pas que Dev. Sécurité (scan, mise à jour deps), Ops (monitoring, alerting) doivent avoir leur place.",
        "4": "Backlog équilibré Dev/Ops/Sécu. Mesurez : quel % du sprint est réellement consacré au technique ? Si c'est en dessous de 20%, challengez le PO.",
        "5": "Backlog mature, priorisé par la valeur globale. Vous êtes au niveau. Partagez votre approche avec d'autres squads qui galèrent à faire accepter le technique."
      }
    },
    {
      "id": "C06",
      "category": "culture",
      "question": "Les dépendances avec d'autres squads sont-elles anticipées et coordonnées sans blocage ?",
      "metric": null,
      "advice": {
        "1": "Dépendances découvertes au dernier moment. Listez toutes vos dépendances actuelles : API, librairies, services partagés, équipes. Mettez-les sur un mur visible. → **Action immédiate :** réunissez la squad 15 min et posez une question : \"de qui dépend-on pour livrer ?\".",
        "2": "Dépendances identifiées mais pas de coordination. Instaurez un point de synchro bimensuel avec les squads dont vous dépendez. 15 min, agenda fixe : blocages et plannings.",
        "3": "Coordination en place, quelques surprises encore. Ajoutez les dépendances dans votre sprint planning : pour chaque US, \"de qui dépend-on ?\" Si la réponse est floue, c'est un risque.",
        "4": "Dépendances bien gérées, rares blocages. Négociez des SLA de réponse avec vos dépendances : \"Si on pose une question API, réponse sous 48h\". Formalisez-le.",
        "5": "Dépendances maîtrisées et anticipées. Vous êtes autonomes. Documentez vos contrats d'interface pour que les autres squads puissent s'en inspirer."
      }
    },
    {
      "id": "C07",
      "category": "culture",
      "question": "Avez-vous instauré des DevOps Reviews régulières ? (avec actions concrètes prises et réalisées)",
      "metric": null,
      "advice": {
        "1": "Aucune DevOps Review. Planifiez la première : 1h, mensuelle, avec Dev + Ops. Agenda simple : 3 métriques clés, 1 incident marquant, 3 actions pour le mois suivant. → **Action immédiate :** bloquez 1h le mois prochain dans les agendas de toute la squad.",
        "2": "Reviews occasionnelles, sans suivi. Formalisez un template : métriques (deploy freq, fail rate, review time), incidents, actions passées (faites ou pas ?), prochaines actions.",
        "3": "Reviews régulières mais actions pas toujours suivies. Ajoutez un suivi des actions : chaque action a un responsable et une deadline. En début de review, on passe en revue les actions du mois dernier.",
        "4": "Reviews régulières avec suivi des actions. Invitez le management une fois par trimestre. Montrez les métriques, les progrès, les blocages. C'est votre vitrine.",
        "5": "Reviews exemplaires, moteur d'amélioration continue. Ouvrez vos reviews aux autres squads. → **Action immédiate :** invitez une squad extérieure à votre prochaine DevOps Review."
      }
    },
    {
      "id": "C08",
      "category": "culture",
      "question": "Vous sentez-vous libre de partager des idées, signaler des problèmes ou admettre des erreurs sans crainte de répercussions ?",
      "metric": null,
      "advice": {
        "1": "Peur de parler, culture du blâme. Commencez par un post-mortem blameless après le prochain incident. Zéro nom, que le système. → **Action immédiate :** au prochain incident, appliquez la règle \"on parle du système, jamais des gens\".",
        "2": "Ouverture naissante mais fragile. Valorisez publiquement quand quelqu'un remonte un problème : \"Merci d'avoir signalé ça, on a évité un incident\". Le message passe vite.",
        "3": "Bonne ouverture dans la squad, plus difficile avec l'extérieur. Étendez la sécurité psychologique aux interactions inter-squads et avec le management. Les erreurs doivent être des opportunités d'apprentissage partout.",
        "4": "Sécurité psychologique établie. Faites des rétrospectives anonymes de temps en temps pour vérifier que tout le monde se sent vraiment libre. Les introvertis aussi.",
        "5": "Culture de transparence et d'apprentissage. Vous êtes un modèle. Partagez vos pratiques de blameless culture avec l'organisation."
      }
    },
    {
      "id": "C09",
      "category": "culture",
      "question": "La squad partage-t-elle ses retours d'expérience avec d'autres équipes internes ou externes ?",
      "metric": null,
      "advice": {
        "1": "Aucun partage externe. Commencez petit : un lightning talk de 10 min à une autre squad sur un sujet que vous maîtrisez. Un seul, pour débloquer. → **Action immédiate :** identifiez un sujet que vous maîtrisez et proposez un talk de 10 min à une squad voisine.",
        "2": "Partage ponctuel, pas systématique. Planifiez un REX trimestriel ouvert. Format court (15 min talk + 10 min questions). Le contenu compte plus que la forme.",
        "3": "REX réguliers mais audience limitée. Élargissez : invitez d'autres tribus, publiez un résumé sur Confluence. Le savoir doit circuler au-delà de votre cercle.",
        "4": "Partage régulier et apprécié. Créez un format récurrent (ex: \"Tech Talk du jeudi\") et invitez d'autres squads à présenter aussi. Le partage doit être bidirectionnel.",
        "5": "Culture de partage ancrée. Contribuez à la communauté interne : guides, articles, formations. Vous êtes des multiplicateurs de savoir."
      }
    },
    {
      "id": "C10",
      "category": "culture",
      "question": "Êtes-vous maître de votre calendrier de livraison (hors frozen zone) ?",
      "metric": null,
      "advice": {
        "1": "Calendrier dicté par les autres. Identifiez ce qui vous bloque : dépendances techniques, validations externes, frozen zones, contraintes réglementaires. Listez tout. → **Action immédiate :** prenez 10 min maintenant et notez tout ce qui vous empêche de livrer quand vous voulez.",
        "2": "Quelques marges de manœuvre mais beaucoup de contraintes. Négociez : pour chaque contrainte externe, demandez un SLA ou un processus de fast-track. Le but est de réduire l'imprévisibilité.",
        "3": "Autonomie partielle, certains sujets encore bloquants. Automatisez ce qui peut l'être : les validations manuelles sont votre ennemi. Si un humain doit cliquer pour que ça passe, c'est un goulot.",
        "4": "Bonne autonomie, rare blocages. Documentez vos contraintes résiduelles et les workarounds. Les frozen zones sont incompressibles — mais le reste peut être optimisé.",
        "5": "Maîtrise totale du calendrier. Vous pouvez livrer quand vous voulez. Maintenez cette autonomie — elle se perd vite si on n'y fait pas attention."
      }
    },
    {
      "id": "D01",
      "category": "delivery",
      "question": "La squad est-elle en capacité de livrer en production plusieurs fois par semaine ?",
      "metric": {
        "endpoint": "GET /projects/:id/pipelines?per_page=100",
        "mesure": "Nombre de pipelines success sur les 7 derniers jours / 7",
        "label": "Deploy freq",
        "seuils": { "bon": ">= 3/j", "moyen": ">= 1/j", "faible": "< 1/j" }
      },
      "advice": {
        "1": "Livraisons rares ou manuelles. Première étape : un pipeline qui se déclenche automatiquement sur chaque merge dans main. Même s'il ne déploie pas encore en prod. → **Action immédiate :** vérifiez que votre .gitlab-ci.yml se déclenche sur merge dans main. Si non, corrigez-le maintenant.",
        "2": "Pipeline automatique mais déploiement manuel. Ajoutez l'étape de déploiement dans le pipeline. Même avec un gate manuel au début — le but est que le chemin soit tracé.",
        "3": "Déploiement possible mais pas fréquent. Visez 1 déploiement par jour. Découpez le travail en petits incréments pour que chaque merge soit déployable.",
        "4": "Plusieurs déploiements par semaine. Passez à la livraison continue : chaque merge sur main déclenche un déploiement automatique. Feature flags pour gérer l'activation.",
        "5": "Déploiement continu, plusieurs fois par jour. Vous êtes au top. Monitorez le lead time (commit → prod) et optimisez-le en continu."
      }
    },
    {
      "id": "D02",
      "category": "delivery",
      "question": "Vos pipelines aboutissent-ils systématiquement sans intervention manuelle ?",
      "metric": {
        "endpoint": "GET /projects/:id/pipelines?per_page=100",
        "mesure": "Ratio pipelines success / total",
        "label": "Pipeline OK rate",
        "seuils": { "bon": ">= 90%", "moyen": ">= 70%", "faible": "< 70%" }
      },
      "advice": {
        "1": "Pipelines instables, échecs fréquents. Analysez les 10 derniers échecs : catégorisez (test flaky, dépendance, infra, code). Traitez la catégorie la plus fréquente en priorité. → **Action immédiate :** ouvrez GitLab, regardez les 10 derniers pipelines failed et catégorisez les causes.",
        "2": "Quelques échecs récurrents identifiés. Stabilisez les tests flaky : retry automatique, isolation des tests, fixtures déterministes. Un test qui échoue 1 fois sur 10 est un test cassé.",
        "3": "Pipeline majoritairement stable, quelques incidents. Ajoutez des retry sur les étapes réseau (pull d'images, dépendances). La plupart des échecs intermittents sont réseau.",
        "4": "Pipeline fiable, rares échecs. Monitorez le taux de succès par semaine. Alertez si ça descend sous 90%. La stabilité est un KPI à surveiller.",
        "5": "Pipeline solide comme un roc. Optimisez maintenant la vitesse. Cache, parallélisation, images légères. Un pipeline fiable ET rapide est le graal."
      }
    },
    {
      "id": "D03",
      "category": "delivery",
      "question": "Les déploiements passent-ils systématiquement par la branche principale ?",
      "metric": {
        "endpoint": "GET /projects/:id/pipelines?ref=main&per_page=100",
        "mesure": "Ratio pipelines sur main vs total des pipelines success",
        "label": "Deploy via main",
        "seuils": { "bon": ">= 90%", "moyen": ">= 70%", "faible": "< 70%" }
      },
      "advice": {
        "1": "Déploiements depuis n'importe quelle branche. Stop. Configurez le pipeline de deploy pour ne se déclencher QUE sur main. C'est un changement de 2 lignes dans le CI. → **Action immédiate :** ouvrez votre .gitlab-ci.yml et restreignez le job de deploy à main. Faites-le maintenant.",
        "2": "Majoritairement via main mais exceptions fréquentes. Identifiez pourquoi les exceptions existent : hotfix urgent ? Branche de release ? Formalisez un processus pour chaque cas.",
        "3": "Via main sauf cas documentés. Réduisez les exceptions : les hotfix doivent aussi passer par une MR sur main, même accélérée. Le raccourci d'aujourd'hui est le bug de demain.",
        "4": "Quasi-exclusivement via main. Vérifiez automatiquement : le pipeline de deploy doit refuser de s'exécuter s'il n'est pas sur main (sauf tag de release).",
        "5": "100% via main, aucune exception. Parfait. Documentez votre flow pour que les nouvelles squads puissent s'en inspirer."
      }
    },
    {
      "id": "D04",
      "category": "delivery",
      "question": "Utilisez-vous un système de versioning avec des releases taguées ?",
      "metric": {
        "endpoint": "GET /projects/:id/releases",
        "mesure": "Nombre de releases sur les 90 derniers jours",
        "label": "Releases taguées",
        "seuils": { "bon": ">= 5", "moyen": ">= 1", "faible": "0" }
      },
      "advice": {
        "1": "Aucun tag, aucune release. Commencez par taguer manuellement votre prochaine livraison : v1.0.0. Le premier tag est le plus important — il crée l'habitude. → **Action immédiate :** `git tag v1.0.0 && git push --tags` (30 secondes). Voilà, c'est fait.",
        "2": "Tags occasionnels, pas de convention. Adoptez le semantic versioning : vMAJOR.MINOR.PATCH. Documentez quand on incrémente quoi. Simple et universel.",
        "3": "Semver en place, tags manuels. Automatisez : le pipeline crée le tag et la release GitLab automatiquement sur chaque merge dans main. Zéro intervention humaine.",
        "4": "Releases automatiques, changelog partiel. Ajoutez un changelog automatique généré depuis les messages de commit ou les titres de MR. L'historique doit être lisible.",
        "5": "Versioning complet, changelog automatique, release notes. Vous êtes au top. Utilisez les releases pour communiquer aux équipes dépendantes."
      }
    },
    {
      "id": "D05",
      "category": "delivery",
      "question": "Votre pipeline complet s'exécute-t-il en moins de 15 minutes ?",
      "metric": {
        "endpoint": "GET /projects/:id/pipelines?per_page=20 (duration)",
        "mesure": "Durée moyenne des 20 derniers pipelines success",
        "label": "Durée pipeline",
        "seuils": { "bon": "< 10 min", "moyen": "< 20 min", "faible": ">= 20 min" }
      },
      "advice": {
        "1": "Pipeline très long (30+ min). Identifiez le goulot : quel stage prend le plus de temps ? Souvent c'est le build ou les tests. Commencez par là. → **Action immédiate :** ouvrez un pipeline récent, notez la durée de chaque stage. Le plus long est votre cible.",
        "2": "Pipeline long (20-30 min). Activez le cache des dépendances (node_modules, .m2, pip). C'est souvent 5-10 min de gagné immédiatement.",
        "3": "Pipeline correct (15-20 min). Parallélisez les stages indépendants : lint, tests unitaires, tests d'intégration peuvent tourner en même temps.",
        "4": "Pipeline rapide (10-15 min). Optimisez les images Docker : multi-stage build, images slim, layers cachées. Chaque seconde compte quand on déploie 5 fois par jour.",
        "5": "Pipeline ultra-rapide (moins de 10 min). Excellent. Monitorez la durée dans le temps — elle a tendance à dériver quand on ajoute des stages. → **Action immédiate :** documentez vos optimisations de pipeline (cache, parallélisation) et partagez le template avec les autres squads."
      }
    },
    {
      "id": "Q01",
      "category": "quality",
      "question": "Les merge requests sont-elles revues et mergées en moins de 48h ?",
      "metric": {
        "endpoint": "GET /projects/:id/merge_requests?state=merged&per_page=50",
        "mesure": "Temps moyen entre created_at et merged_at sur les 20 dernières MR",
        "label": "Review time",
        "seuils": { "bon": "< 2j", "moyen": "< 7j", "faible": ">= 7j" }
      },
      "advice": {
        "1": "MR qui traînent des semaines. Instaurez une règle simple : toute MR doit avoir un premier retour sous 24h. Pas un review complet — juste un \"j'ai vu, je review demain\". → **Action immédiate :** ouvrez GitLab, listez toutes les MR ouvertes. Pour chacune : review ou close. Aujourd'hui.",
        "2": "Review en quelques jours, pas systématiquement rapide. Ajoutez des rappels automatiques : notification après 24h sans review, escalade après 48h. L'outil fait le travail.",
        "3": "Majorité sous 48h, quelques exceptions. Analysez les exceptions : MR trop grosses ? Reviewer absent ? Sujet complexe ? Chaque raison a une solution différente.",
        "4": "Reviews rapides et régulières. Passez au SLA de review : objectif 24h pour le premier retour, 48h pour le merge. Mesurez et affichez.",
        "5": "Reviews quasi-instantanées. Vous êtes au niveau Netflix. Maintenez la cadence et assurez-vous que la qualité ne souffre pas de la vitesse."
      }
    },
    {
      "id": "Q02",
      "category": "quality",
      "question": "Chaque merge request est-elle revue par au moins 2 personnes distinctes de l'auteur ?",
      "metric": {
        "endpoint": "GET /projects/:id/approvals",
        "mesure": "approvals_before_merge >= 2 ET merge_requests_author_approval === false",
        "label": "Approval rules",
        "seuils": { "bon": "2+ approbateurs, author exclu", "moyen": "1 approbateur", "faible": "0 ou author peut approuver" }
      },
      "advice": {
        "1": "Pas de review ou 0 approbateurs requis. Configurez au minimum 1 approbateur dans les settings GitLab. C'est le strict minimum — un deuxième regard sur le code. → **Action immédiate :** Settings > General > Merge request approvals > mettez 1 approbateur minimum. Faites-le maintenant.",
        "2": "1 approbateur mais l'auteur peut s'approuver. Activez \"Prevent approval by author\". L'auteur ne doit JAMAIS pouvoir valider son propre code. C'est la base.",
        "3": "1 approbateur, auteur exclu. Passez à 2 approbateurs. Le principe des 4 yeux est un standard de l'industrie, surtout en environnement bancaire.",
        "4": "2 approbateurs, règles strictes. Ajoutez \"Prevent approvals by committers\" : un contributeur de la MR ne peut pas l'approuver. Même s'il n'est pas l'auteur.",
        "5": "Règles d'approbation exemplaires. Vérifiez que \"Reset approvals on push\" est activé : un nouveau commit invalide les approbations précédentes. Le code revu est celui qui est mergé. → **Action immédiate :** activez ces règles sur tous vos repos."
      }
    },
    {
      "id": "Q03",
      "category": "quality",
      "question": "Les code reviews génèrent-elles des échanges constructifs ?",
      "metric": {
        "endpoint": "GET /projects/:id/merge_requests?state=merged&per_page=20 (user_notes_count)",
        "mesure": "Nombre moyen de discussions (notes) par MR mergée",
        "label": "Discussions / MR",
        "seuils": { "bon": ">= 3", "moyen": ">= 1", "faible": "< 1" }
      },
      "advice": {
        "1": "Reviews = un LGTM et c'est mergé. Formez à la code review : un bon commentaire explique le \"pourquoi\", pas juste le \"quoi\". Partagez des exemples de bons commentaires. → **Action immédiate :** trouvez 1 exemple de bon commentaire de review dans votre historique et partagez-le dans le canal de la squad.",
        "2": "Quelques commentaires mais superficiels. Encouragez les questions ouvertes : \"Pourquoi ce choix ?\" plutôt que \"Change ça\". La review est une conversation, pas un audit.",
        "3": "Discussions de fond sur certaines MR. Systématisez : chaque review doit avoir au minimum 1 commentaire constructif. Si tout est parfait, un commentaire positif expliquant ce qui est bien fait.",
        "4": "Reviews riches et formatrices. Utilisez les reviews comme outil de mentorat : les seniors expliquent, les juniors apprennent. C'est le meilleur transfert de connaissances.",
        "5": "Culture de review exemplaire. Partagez vos meilleures reviews en REX. Une bonne review est un acte de craft — valorisez-le."
      }
    },
    {
      "id": "Q04",
      "category": "quality",
      "question": "Les merge requests sont-elles découpées en petits changements incrémentaux ?",
      "metric": {
        "endpoint": "GET /projects/:id/merge_requests/:iid/changes (changes_count)",
        "mesure": "Nombre moyen de fichiers modifiés par MR",
        "label": "Taille MR",
        "seuils": { "bon": "< 10 fichiers", "moyen": "< 25 fichiers", "faible": ">= 25 fichiers" }
      },
      "advice": {
        "1": "MR de 500+ lignes régulièrement. Règle d'or : moins de 200 lignes par MR. Au-delà, la qualité de review chute drastiquement. Découpez AVANT de coder, pas après. → **Action immédiate :** prenez votre prochaine US et découpez-la en 2-3 MR de moins de 200 lignes chacune avant de commencer à coder.",
        "2": "MR variables, parfois grosses. Formez au feature slicing : une fonctionnalité = plusieurs MR. Backend d'abord, puis API, puis front. Chaque MR est mergeable indépendamment.",
        "3": "Majorité de MR raisonnables, quelques grosses. Identifiez les cas qui produisent des grosses MR (refactoring, migration) et planifiez-les en plusieurs étapes.",
        "4": "MR bien découpées, culture du petit incrément. Ajoutez un check automatique : warning si la MR dépasse 200 lignes, blocage au-delà de 400. L'outil enforce la règle.",
        "5": "MR atomiques et bien nommées. Votre flow est exemplaire. Chaque MR raconte une histoire claire. Partagez votre approche."
      }
    },
    {
      "id": "Q05",
      "category": "quality",
      "question": "Est-il impossible de merger sans au moins une approbation ?",
      "metric": {
        "endpoint": "GET /projects/:id/merge_requests?state=merged (approvals count vs 0)",
        "mesure": "Pourcentage de MR mergées avec au moins 1 approbation",
        "label": "MR sans approval",
        "seuils": { "bon": "100% avec approval", "moyen": ">= 80%", "faible": "< 80%" }
      },
      "advice": {
        "1": "Merge possible sans aucune approbation. Activez la protection MAINTENANT. Settings > General > Merge request approvals. C'est un one-click qui change tout. → **Action immédiate :** Settings > General > Merge request approvals. Activez-le sur tous vos repos maintenant.",
        "2": "Protection activée mais contournable. Vérifiez que \"Prevent editing approval rules in merge requests\" est activé. Personne ne doit pouvoir réduire le nombre d'approbateurs sur sa MR.",
        "3": "Protection solide, quelques exceptions admin. Auditez les exceptions : qui merge sans approval et pourquoi ? Chaque exception est un trou dans votre filet de sécurité.",
        "4": "Aucune exception, règles strictes. Ajoutez des code owners sur les fichiers critiques : certains fichiers nécessitent l'approbation d'une personne spécifique.",
        "5": "Gouvernance complète des approbations. Vous êtes conforme. Monitorez avec le module Gouvernance pour détecter toute dérive."
      }
    },
    {
      "id": "S01",
      "category": "stability",
      "question": "Les échecs de pipeline sont-ils traités immédiatement comme une priorité bloquante ?",
      "metric": {
        "endpoint": "GET /projects/:id/pipelines?per_page=100",
        "mesure": "Taux d'échec (failed / total)",
        "label": "Fail rate",
        "seuils": { "bon": "< 5%", "moyen": "< 15%", "faible": ">= 15%" }
      },
      "advice": {
        "1": "Pipelines rouges ignorés pendant des jours. Instaurez la règle n°1 : pipeline rouge = stop the line. Personne ne merge tant que le pipeline n'est pas vert. Non négociable. → **Action immédiate :** annoncez la règle en daily demain : \"pipeline rouge = on arrête tout et on fix\".",
        "2": "Réaction lente, pas de responsable clair. Définissez un responsable : le dernier committer est responsable du fix OU du revert. Pas de \"c'est pas mon pipeline\".",
        "3": "Bonne réactivité mais pas systématique. Automatisez la notification : pipeline rouge → message dans le canal de la squad avec le nom du committer. La pression sociale fait le reste.",
        "4": "Réaction rapide et systématique. Mesurez le MTTR (Mean Time To Recovery) de vos pipelines. Objectif : moins de 2h entre l'échec et le fix.",
        "5": "Pipeline rouge = urgence absolue, toujours. Vous avez la bonne culture. Documentez vos SLA internes et partagez-les."
      }
    },
    {
      "id": "S02",
      "category": "stability",
      "question": "Votre taux de succès pipeline est-il stable dans le temps ?",
      "metric": {
        "endpoint": "GET /projects/:id/pipelines?per_page=100",
        "mesure": "Comparaison taux de succès semaine N vs semaine N-4",
        "label": "Tendance stabilité",
        "seuils": { "bon": "Stable ou en hausse", "moyen": "Légère baisse (<5%)", "faible": "Baisse >5%" }
      },
      "advice": {
        "1": "Taux de succès en dents de scie. Commencez par mesurer : allez dans GitLab > Analytics > CI/CD, exportez les données et tracez le taux de succès par semaine sur les 3 derniers mois. → **Action immédiate :** faites-le maintenant.",
        "2": "Tendance identifiée mais pas d'action. Analysez les baisses : qu'est-ce qui a changé ? Nouvelle dépendance ? Nouveau test ? Migration ? Chaque baisse a une cause.",
        "3": "Suivi hebdomadaire, réactions quand ça baisse. Ajoutez une alerte automatique : si le taux descend de plus de 5% vs la semaine précédente, notification au tech lead.",
        "4": "Taux stable et monitoré. Définissez un objectif : 90% minimum. En dessous, c'est un sujet en rétrospective. Le taux de succès est un KPI d'équipe.",
        "5": "Taux excellent et en amélioration continue. Challengez-vous : visez 95%. Chaque point au-dessus de 90% demande un effort disproportionné — mais c'est là que se fait la différence."
      }
    },
    {
      "id": "S03",
      "category": "stability",
      "question": "Quand un pipeline casse, est-il corrigé en moins de 2 heures ?",
      "metric": {
        "endpoint": "GET /projects/:id/pipelines (timestamp entre failed et next success)",
        "mesure": "Temps moyen entre un pipeline failed et le prochain success sur la même branche",
        "label": "Recovery time",
        "seuils": { "bon": "< 2h", "moyen": "< 24h", "faible": ">= 24h" }
      },
      "advice": {
        "1": "Correction en plusieurs jours. Process d'urgence : le committer a 2h pour fix ou revert. Si pas dispo, le binôme prend le relais. Pas de pipeline rouge overnight. → **Action immédiate :** définissez maintenant qui est responsable du fix si le pipeline casse après 17h.",
        "2": "Correction le jour même, pas en 2h. Réduisez le temps de diagnostic : des logs clairs, des messages d'erreur explicites, un lien vers la MR fautive. Le temps perdu est souvent en diagnostic.",
        "3": "Correction en quelques heures. Préparez des playbooks : les 5 causes d'échec les plus fréquentes et leur fix. Quand ça casse, on consulte le playbook avant de chercher.",
        "4": "Correction sous 2h systématiquement. Automatisez le revert : si le pipeline est rouge après 2h, revert automatique de la dernière MR. Radical mais efficace.",
        "5": "Correction quasi-immédiate. Excellent. Votre MTTR est votre force. Documentez vos pratiques de recovery."
      }
    },
    {
      "id": "S04",
      "category": "stability",
      "question": "Les échecs de pipeline restent-ils isolés (jamais plus de 2 consécutifs) ?",
      "metric": {
        "endpoint": "GET /projects/:id/pipelines?per_page=100",
        "mesure": "Plus longue série de pipelines failed consécutifs",
        "label": "Série max échecs",
        "seuils": { "bon": "1", "moyen": "2-3", "faible": ">= 4" }
      },
      "advice": {
        "1": "Séries d'échecs fréquentes (3+ consécutifs). Bloquez les merges quand le pipeline est rouge. Si personne ne peut merger, personne n'aggrave la situation. → **Action immédiate :** activez \"Pipelines must succeed\" dans Settings > General > Merge requests.",
        "2": "Quelques séries, pas systématiquement bloquant. Ajoutez un check pre-merge : le pipeline de la branche doit être vert AVANT de merger. Pas de merge à l'aveugle.",
        "3": "Séries rares, maximum 2 consécutifs. Analysez les séries quand elles arrivent : est-ce la même cause ? Des causes différentes ? Tirez-en des patterns.",
        "4": "Échecs toujours isolés. Félicitations. Monitorez la métrique et alertez si une série de 2+ apparaît — c'est un signal faible.",
        "5": "Pipeline quasi-infaillible. Vous êtes au top. La prochaine étape c'est le chaos engineering : cassez volontairement pour vérifier que vos filets fonctionnent."
      }
    },
    {
      "id": "H01",
      "category": "hygiene",
      "question": "Les branches mergées ou abandonnées sont-elles supprimées régulièrement ?",
      "metric": {
        "endpoint": "GET /projects/:id/repository/branches?per_page=100",
        "mesure": "Nombre de branches sans commit depuis >30 jours (hors main/master)",
        "label": "Branches stale",
        "seuils": { "bon": "< 5", "moyen": "< 20", "faible": ">= 20" }
      },
      "advice": {
        "1": "Branches jamais nettoyées (50+). Activez la suppression automatique de la branche source après merge dans les settings MR du projet. One click, problème résolu pour le futur. → **Action immédiate :** Settings > Merge requests > cochez \"Delete source branch\". Faites-le sur chaque repo maintenant.",
        "2": "Suppression auto activée mais historique sale. Faites un nettoyage one-shot : supprimez toutes les branches sans commit depuis 30+ jours (sauf main/master). Le module Branch Health peut aider.",
        "3": "Nettoyage régulier, quelques branches oubliées. Ajoutez un job hebdomadaire qui liste les branches stale et notifie les auteurs. La honte sociale fonctionne.",
        "4": "Repo propre, rare branches stale. Ajoutez une convention de nommage : feature/XX, bugfix/XX. Les branches sans préfixe sont suspectes.",
        "5": "Repo impeccable. Maintenez. Un repo propre c'est un signal de maturité — les nouveaux arrivants le voient immédiatement."
      }
    },
    {
      "id": "H02",
      "category": "hygiene",
      "question": "Les fichiers de lock de dépendances sont-ils versionnés ?",
      "metric": {
        "endpoint": "GET /projects/:id/repository/tree (récursif)",
        "mesure": "Présence de package-lock.json / yarn.lock / pom.xml lock etc. par rapport aux manifestes",
        "label": "Lock files",
        "seuils": { "bon": "Tous présents", "moyen": "Partiels", "faible": "Absents" }
      },
      "advice": {
        "1": "Pas de fichiers de lock. Ajoutez-les : exécutez la commande qui fige les dépendances dans votre écosystème (`npm install` pour Node, `poetry lock` pour Python, `mvn dependency:go-offline` pour Maven) et commitez le fichier généré (package-lock.json, poetry.lock, etc.). Pour Maven, assurez-vous que pom.xml contient des versions exactes (pas de SNAPSHOT). → **Action immédiate :** faites-le maintenant.",
        "2": "Lock files partiels. Vérifiez chaque écosystème : Node (package-lock), Python (poetry.lock/Pipfile.lock), Java (gradle.lockfile), Go (go.sum). Tous doivent être versionnés.",
        "3": "Lock files présents mais parfois ignorés. Vérifiez votre .gitignore : les lock files ne doivent PAS être ignorés. C'est une erreur classique.",
        "4": "Lock files systématiquement versionnés. Ajoutez un check CI qui vérifie la cohérence : le lock file doit correspondre au manifest (package.json vs package-lock.json).",
        "5": "Gestion des dépendances exemplaire. Ajoutez Renovate ou Dependabot pour les mises à jour automatiques avec MR dédiées."
      }
    },
    {
      "id": "H03",
      "category": "hygiene",
      "question": "La branche principale est-elle protégée contre le force push ?",
      "metric": {
        "endpoint": "GET /projects/:id/protected_branches",
        "mesure": "protected === true ET allow_force_push === false sur la branche par défaut",
        "label": "Branch protection",
        "seuils": { "bon": "Protégée, force push interdit", "moyen": "Protégée, force push autorisé", "faible": "Non protégée" }
      },
      "advice": {
        "1": "Branche non protégée. Urgence absolue. Settings > Repository > Protected branches. Protégez la branche principale (main/master) immédiatement. Un force push peut écraser tout l'historique. → **Action immédiate :** Settings > Repository > Protected branches. Protégez main/master. Faites-le maintenant avant de continuer le questionnaire.",
        "2": "Branche protégée mais force push autorisé. Désactivez le force push sur la branche principale. Il n'y a AUCUNE raison légitime de force push sur cette branche.",
        "3": "Protection basique en place. Configurez les niveaux d'accès : push = No one, merge = Maintainers. Personne ne pousse directement sur la branche principale.",
        "4": "Protection complète. Vérifiez avec le module Gouvernance que la protection est active sur TOUS les repos, pas seulement les principaux.",
        "5": "Gouvernance complète. Vous êtes conforme. Monitorez les changements — une protection peut être désactivée accidentellement."
      }
    },
    {
      "id": "H04",
      "category": "hygiene",
      "question": "Le repo contient-il les fichiers essentiels (README, .gitignore, CHANGELOG) ?",
      "metric": {
        "endpoint": "GET /projects/:id/repository/tree",
        "mesure": "Présence de README.md, .gitignore, CHANGELOG.md à la racine",
        "label": "Fichiers standards",
        "seuils": { "bon": "3/3 présents", "moyen": "2/3", "faible": "< 2/3" }
      },
      "advice": {
        "1": "Fichiers manquants. Créez au minimum un README.md avec : nom du projet, description, comment lancer, comment contribuer. 10 min de travail, des heures de gagnées. → **Action immédiate :** créez un README.md avec le nom du projet et \"comment lancer\" en 5 min. Commitez.",
        "2": "README basique, pas de CHANGELOG. Enrichissez le README : architecture, dépendances, contacts. Ajoutez un CHANGELOG.md même vide — il sera rempli au fil des releases.",
        "3": "README + .gitignore, CHANGELOG partiel. Automatisez le CHANGELOG depuis vos MR ou commits. Conventional Commits + outil de génération = CHANGELOG toujours à jour.",
        "4": "Tous les fichiers présents et maintenus. Ajoutez un CONTRIBUTING.md pour l'onboarding des nouveaux. Le repo doit être auto-documenté.",
        "5": "Documentation exemplaire. Votre repo est un modèle. Proposez-le comme template pour les nouveaux projets de la tribu."
      }
    },
    {
      "id": "H05",
      "category": "hygiene",
      "question": "Les merge requests ouvertes sont-elles traitées sous 7 jours ?",
      "metric": {
        "endpoint": "GET /projects/:id/merge_requests?state=opened",
        "mesure": "Nombre de MR ouvertes depuis plus de 7 jours",
        "label": "MR zombies",
        "seuils": { "bon": "0", "moyen": "1-3", "faible": ">= 4" }
      },
      "advice": {
        "1": "MR ouvertes depuis des semaines/mois. Faites un tri : pour chaque MR ouverte, décidez en 2 min : on merge, on ferme, ou on relance. Les MR zombies tuent la visibilité. → **Action immédiate :** ouvrez GitLab > Merge requests > Open. Pour chaque MR de plus de 7 jours : merge, close ou relance. Maintenant.",
        "2": "Quelques MR zombies identifiées. Abordez-les en daily : on prend une décision, on ne laisse pas traîner plus longtemps.",
        "3": "Nettoyage régulier, quelques oublis. Ajoutez une alerte automatique : notification au reviewer si une MR n'a pas de review après 3 jours.",
        "4": "MR traitées rapidement. Mesurez votre \"MR cycle time\" moyen. Objectif : moins de 3 jours de l'ouverture au merge.",
        "5": "Zéro MR zombie. Exemplaire. Votre flow est fluide — le code ne stagne jamais."
      }
    },
    {
      "id": "R01",
      "category": "resilience",
      "question": "Au moins 2 personnes dans la squad sont-elles capables d'intervenir sur chaque repo ?",
      "metric": {
        "endpoint": "GET /projects/:id/repository/contributors?per_page=100",
        "mesure": "Nombre de contributeurs actifs (avec commits récents)",
        "label": "Bus factor",
        "seuils": { "bon": ">= 3", "moyen": "2", "faible": "1" }
      },
      "advice": {
        "1": "Repo = 1 seule personne. Risque critique. Planifiez des sessions de pair programming : la personne qui connaît le repo code avec quelqu'un d'autre. 2h par semaine suffisent. → **Action immédiate :** planifiez une session de pair programming cette semaine entre la personne qui connaît le repo et quelqu'un d'autre.",
        "2": "2 personnes mais la seconde connaît peu. Faites des rotations sur les US : la deuxième personne prend une US sur ce repo. On apprend en faisant, pas en lisant.",
        "3": "2-3 personnes par repo. Documentez les \"bus factor critiques\" : quels repos n'ont que 2 personnes ? Priorisez le partage de connaissances sur ceux-là.",
        "4": "3+ personnes, bonne couverture. Formalisez un plan de backup : qui remplace qui en cas d'absence ? Ce plan doit être à jour et connu de tous.",
        "5": "Connaissance partagée, aucun SPOF. Vous êtes résilients. Maintenez les rotations même quand tout va bien — la connaissance se perd vite sans pratique."
      }
    },
    {
      "id": "R02",
      "category": "resilience",
      "question": "La charge de travail est-elle répartie équitablement entre les contributeurs ?",
      "metric": {
        "endpoint": "GET /projects/:id/repository/contributors (commit_count par auteur)",
        "mesure": "Ratio commits du top contributeur vs total (Gini simplifié)",
        "label": "Concentration commits",
        "seuils": { "bon": "Top contrib < 40%", "moyen": "< 60%", "faible": ">= 60%" }
      },
      "advice": {
        "1": "Un dev fait 70%+ des commits. Ce n'est pas de la performance, c'est un risque. Répartissez les US plus équitablement. Le \"héros\" doit devenir un \"mentor\". → **Action immédiate :** assignez la prochaine US de ce repo à quelqu'un d'autre que le contributeur principal.",
        "2": "Répartition déséquilibrée mais consciente. Assignez volontairement des US sur les zones que les autres ne connaissent pas. C'est inconfortable mais nécessaire.",
        "3": "Répartition correcte, quelques pics. Les pics sont normaux (expertise spécifique). Vérifiez qu'ils ne deviennent pas la norme. Si quelqu'un est toujours le go-to, c'est un signal.",
        "4": "Bonne répartition, polyvalence encouragée. Mesurez : si le top contributeur descend sous 40% des commits, vous êtes dans la zone saine.",
        "5": "Charge équilibrée, équipe polyvalente. Votre équipe est résiliente. Les départs ne sont plus un risque critique."
      }
    },
    {
      "id": "R03",
      "category": "resilience",
      "question": "Les reviews sont-elles faites par des personnes variées ?",
      "metric": {
        "endpoint": "GET /projects/:id/merge_requests?state=merged (merged_by distinct)",
        "mesure": "Nombre de reviewers/mergers distincts sur les 20 dernières MR",
        "label": "Diversité reviewers",
        "seuils": { "bon": ">= 3 personnes", "moyen": "2", "faible": "1 (toujours le même)" }
      },
      "advice": {
        "1": "Toujours le même reviewer. Instaurez une rotation : chaque MR est assignée au prochain reviewer disponible, pas au \"reviewer habituel\". Round-robin simple. → **Action immédiate :** sur la prochaine MR, assignez un reviewer différent du habituel.",
        "2": "2 reviewers mais toujours les mêmes. Élargissez : formez d'autres membres de la squad à la code review. Commencez par des MR simples pour les nouveaux reviewers.",
        "3": "Diversité partielle. Vérifiez que les juniors reviewent aussi les MR des seniors. La review n'est pas une question d'ancienneté — c'est un regard frais.",
        "4": "Bonne diversité de reviewers. Ajoutez des review cross-squad de temps en temps : un regard externe apporte des perspectives différentes.",
        "5": "Reviews variées et formatrices. Votre pratique de review est un outil de montée en compétence. → **Action immédiate :** créez un guide \"Comment bien reviewer\" et partagez-le avec la tribu."
      }
    },
    {
      "id": "R04",
      "category": "resilience",
      "question": "L'activité sur le repo est-elle régulière (pas de longues périodes d'inactivité) ?",
      "metric": {
        "endpoint": "GET /projects/:id/repository/commits?per_page=100",
        "mesure": "Plus long gap (en jours) entre 2 commits sur les 90 derniers jours",
        "label": "Régularité commits",
        "seuils": { "bon": "< 7j", "moyen": "< 14j", "faible": ">= 14j" }
      },
      "advice": {
        "1": "Longues périodes d'inactivité (2+ semaines). Découpez le travail en plus petits morceaux. Un commit par jour est mieux qu'un gros commit après 2 semaines de silence. → **Action immédiate :** découpez votre US en cours en morceaux committables de 1 journée max.",
        "2": "Activité irrégulière, rushes puis silences. Planifiez en petites itérations : des US de 1-2 jours max. Le flux de commits devient naturellement régulier.",
        "3": "Activité globalement régulière, quelques gaps. Les gaps correspondent souvent aux vacances ou aux sprints de planification. Identifiez-les et acceptez-les s'ils sont légitimes.",
        "4": "Activité régulière et prévisible. Votre flux de travail est sain. Le repo \"vit\" en continu — c'est un bon signal pour les observateurs externes.",
        "5": "Flux continu et régulier. Exemplaire. Un repo actif et régulier inspire confiance aux équipes qui en dépendent."
      }
    },
    {
      "id": "P01",
      "category": "practices",
      "question": "Utilisez-vous des feature flags pour découpler déploiement et activation de fonctionnalités ?",
      "metric": {
        "endpoint": "GET /projects/:id/variables",
        "mesure": "Présence de variables CI contenant 'flag' ou 'feature'",
        "label": "Feature flags",
        "seuils": { "bon": "Flags actifs et gérés", "moyen": "Quelques flags", "faible": "Aucun" }
      },
      "advice": {
        "1": "Aucun feature flag. Commencez par un cas simple : votre prochaine fonctionnalité majeure, derrière un flag. On/Off. Déployez le code inactif, activez quand c'est prêt. → **Action immédiate :** identifiez votre prochaine fonctionnalité et placez-la derrière un simple if/else avec une variable d'env.",
        "2": "Quelques flags informels (variables d'env). Structurez : adoptez un outil de feature flags (DevOps Hub, LaunchDarkly, ou simplement un service centralisé). Les variables d'env ne scalent pas.",
        "3": "Feature flags en place, usage occasionnel. Systématisez : toute nouvelle fonctionnalité visible par l'utilisateur passe par un flag. C'est le reflexe à ancrer.",
        "4": "Usage régulier, canary releases. Ajoutez du targeting : activation par utilisateur, par pourcentage, par environnement. Le flag devient un outil de release progressive.",
        "5": "Feature flags maîtrisés, lifecycle géré. Vous êtes au niveau des GAFA. → **Action immédiate :** planifiez un flag cleanup dans le prochain sprint (voir P02)."
      }
    },
    {
      "id": "P02",
      "category": "practices",
      "question": "Les feature flags obsolètes sont-ils régulièrement nettoyés ?",
      "metric": {
        "endpoint": "GET /projects/:id/variables",
        "mesure": "Nombre de variables flag non masquées (proxy : potentiellement zombies)",
        "label": "Zombie flags",
        "seuils": { "bon": "0", "moyen": "1-3", "faible": ">= 4" }
      },
      "advice": {
        "1": "Flags jamais nettoyés. Faites un inventaire : listez tous vos flags, identifiez ceux activés pour tout le monde depuis plus de 30 jours. Ce sont des zombies — supprimez-les. → **Action immédiate :** listez tous vos feature flags maintenant et identifiez ceux qui sont ON pour tout le monde depuis 30+ jours.",
        "2": "Nettoyage ponctuel. Instaurez une routine : tous les trimestres, revue des flags. Un flag activé pour tous depuis 30+ jours = candidat à la suppression.",
        "3": "Nettoyage régulier, quelques oublis. Ajoutez une date d'expiration à chaque flag dès sa création. Quand la date passe, une alerte rappelle de nettoyer.",
        "4": "Lifecycle des flags bien géré. Automatisez : un job qui scanne les flags expirés et crée une MR de nettoyage automatiquement.",
        "5": "Gestion exemplaire du lifecycle. Votre hygiène de flags est un modèle. Documentez votre process pour les autres squads."
      }
    },
    {
      "id": "P03",
      "category": "practices",
      "question": "Les versions de dépendances sont-elles fixées (pas de LATEST, SNAPSHOT, ranges) ?",
      "metric": {
        "endpoint": "GET /projects/:id/repository/files/pom.xml (contenu)",
        "mesure": "Nombre de version ranges, LATEST ou SNAPSHOT dans pom.xml",
        "label": "Versions Maven",
        "seuils": { "bon": "0", "moyen": "1-2", "faible": ">= 3" }
      },
      "advice": {
        "1": "Versions dynamiques partout (LATEST, SNAPSHOT, ranges). Fixez immédiatement : remplacez chaque version dynamique par la version exacte actuelle. → **Action immédiate :** cherchez dans vos fichiers de dépendances : `LATEST`, `SNAPSHOT`, `^`, `~`, `[` ou `.*` — remplacez par la version exacte (ex: `1.2.3`). Un build non reproductible est une bombe à retardement.",
        "2": "Majorité fixée, quelques SNAPSHOT / ranges. Traquez les SNAPSHOT et ranges : ils ne doivent exister que pendant le développement actif. Avant chaque release, tout doit être fixé.",
        "3": "Versions fixées, pas de processus de mise à jour. Ajoutez Renovate ou Dependabot : MR automatiques pour les mises à jour de dépendances. Vous reviewez et mergez — pas de travail manuel.",
        "4": "Versions fixées, mises à jour régulières. Ajoutez un scan de vulnérabilités sur les dépendances dans le pipeline. Une dépendance à jour est aussi une dépendance sûre.",
        "5": "Gestion des dépendances exemplaire. Votre supply chain est saine. Documentez vos pratiques pour la tribu."
      }
    },
    {
      "id": "P04",
      "category": "practices",
      "question": "Votre pipeline inclut-il des stages dédiés aux tests, au linting et à la sécurité ?",
      "metric": {
        "endpoint": "GET /projects/:id/pipelines/:id/jobs",
        "mesure": "Présence de stages test, lint, security dans le dernier pipeline",
        "label": "Stages pipeline",
        "seuils": { "bon": "3 stages (test+lint+secu)", "moyen": "2 stages", "faible": "< 2" }
      },
      "advice": {
        "1": "Pipeline = build seulement. Ajoutez un stage de test. Même 1 test unitaire dans le pipeline c'est mieux que 0. Le premier test est le plus important. → **Action immédiate :** ajoutez 1 test unitaire et un stage \"test\" dans votre .gitlab-ci.yml. Un seul test, mais dans le pipeline.",
        "2": "Build + tests, pas de lint ni sécu. Ajoutez un linter (ESLint, Checkstyle, Pylint) dans le pipeline. Le linting attrape les erreurs bêtes avant la review humaine.",
        "3": "Build + tests + lint, pas de sécu. Ajoutez un scan de sécurité : SAST (analyse statique) et/ou scan de dépendances. GitLab a des templates prêts à l'emploi.",
        "4": "Les 3 stages présents. Optimisez l'ordre : lint d'abord (rapide, catch les erreurs évidentes), puis tests, puis sécu. Fail fast.",
        "5": "Pipeline complet et optimisé. Ajoutez des quality gates : le pipeline bloque si la couverture de tests descend, si le lint a des erreurs critiques, si le scan sécu trouve une CVE haute."
      }
    },
    {
      "id": "P05",
      "category": "practices",
      "question": "La configuration CI/CD est-elle versionnée dans le repo ?",
      "metric": {
        "endpoint": "GET /projects/:id/repository/tree",
        "mesure": "Présence de .gitlab-ci.yml à la racine",
        "label": "CI versionnée",
        "seuils": { "bon": "Présent", "faible": "Absent" }
      },
      "advice": {
        "1": "CI configurée hors du repo (interface GitLab, Jenkins externe). Migrez vers un .gitlab-ci.yml dans le repo. La CI doit suivre le même cycle de vie que le code. → **Action immédiate :** créez un .gitlab-ci.yml à la racine du repo avec un stage build minimal. Commitez-le.",
        "2": "Fichier CI présent mais pas maintenu. Le .gitlab-ci.yml doit être reviewé comme du code : dans les MR, avec des commentaires. C'est du code d'infrastructure.",
        "3": "CI versionnée et maintenue. Factorisez : utilisez des templates partagés pour les stages communs. Chaque squad ne devrait pas réinventer la roue.",
        "4": "CI bien structurée, templates partagés. Ajoutez des tests sur votre CI : un changement de pipeline doit passer par une MR et être validé sur une branche avant d'atterrir sur main.",
        "5": "CI as Code exemplaire. Votre pipeline est documenté, testé, versionné. → **Action immédiate :** proposez votre `.gitlab-ci.yml` comme template de référence dans la tribu."
      }
    }
  ]
};

// ============================================
// ADAPTATION POUR L'INTERFACE
// ============================================

const CATEGORIES = [
    { id:'culture', label:'Culture & Organisation', icon:'👥', color:'#f472b6', desc:'Rituels, collaboration, sécurité psychologique', type:'declaratif' },
    { id:'delivery', label:'Delivery', icon:'🚀', color:'#60a5fa', desc:'Fréquence de livraison, pipelines, releases' },
    { id:'quality', label:'Qualité Code', icon:'🔒', color:'#a78bfa', desc:'Reviews, approbations, taille des MR' },
    { id:'stability', label:'Stabilité', icon:'⚙️', color:'#34d399', desc:'Taux d\'échec, recovery, tendance' },
    { id:'hygiene', label:'Hygiène Repo', icon:'🧹', color:'#fbbf24', desc:'Branches, lock files, protection, fichiers standards' },
    { id:'resilience', label:'Résilience', icon:'🛡️', color:'#f87171', desc:'Bus factor, répartition, diversité reviews' },
    { id:'practices', label:'Pratiques', icon:'⚡', color:'#fb923c', desc:'Feature flags, CI versionnée, stages pipeline' },
    { id:'security', label:'Sécurité', icon:'🔐', color:'#f43f5e', desc:'Branch protection, approval settings, gouvernance', type:'data_only' }
];

const QUESTIONS = [];
const ADVICE = {};

// Charger les questions du JSON (sauf sécurité qui reste à part)
for (const q of jsonData.questions) {
    QUESTIONS.push({
        id: q.id,
        cat: q.category,
        q: q.question,
        metric: q.metric ? q.metric.label : null
    });
    ADVICE[q.id] = q.advice;
}

const METRIC_KEY_MAP = {
    'Deploy freq': 'deploy_freq', 'Pipeline OK rate': 'pipeline_ok', 'Deploy via main': 'deploy_main',
    'Releases taguées': 'releases', 'Durée pipeline': 'pipeline_duration', 'Review time': 'review_time',
    'Approval rules': 'approval_rules', 'Discussions / MR': 'discussions_mr', 'Taille MR': 'mr_size',
    'MR sans approval': 'mr_no_approval', 'Fail rate': 'fail_rate', 'Tendance stabilité': 'trend',
    'Recovery time': 'recovery_time', 'Série max échecs': 'fail_streak', 'Branches stale': 'stale_branches',
    'Lock files': 'lock_files', 'Branch protection': 'branch_protection', 'Fichiers standards': 'std_files',
    'MR zombies': 'zombie_mrs', 'Bus factor': 'bus_factor', 'Concentration commits': 'commit_concentration',
    'Diversité reviewers': 'reviewer_diversity', 'Régularité commits': 'commit_regularity',
    'Feature flags': 'feature_flags', 'Zombie flags': 'zombie_flags', 'Versions Maven': 'maven_versions',
    'Stages pipeline': 'pipeline_stages', 'CI versionnée': 'ci_versioned'
};
QUESTIONS.forEach(q => { if (q.metric && METRIC_KEY_MAP[q.metric]) q.metric = METRIC_KEY_MAP[q.metric]; });

const SECURITY_QUESTIONS = [
    { id:'X01', cat:'security', q:"Branche principale protégée", metric:'sec_branch_protected', dataOnly:true },
    { id:'X02', cat:'security', q:"Force push interdit sur la branche principale", metric:'sec_force_push', dataOnly:true },
    { id:'X03', cat:'security', q:"Auteur empêché d'approuver sa propre MR", metric:'sec_author_approval', dataOnly:true },
    { id:'X04', cat:'security', q:"Contributeurs empêchés d'approuver leurs commits", metric:'sec_committer_approval', dataOnly:true },
    { id:'X05', cat:'security', q:"Approbations invalidées après un nouveau push", metric:'sec_reset_approvals', dataOnly:true }
];
for (const sq of SECURITY_QUESTIONS) {
    QUESTIONS.push(sq);
    ADVICE[sq.id] = {
        non_conforme: "Activer le paramètre dans les settings GitLab",
        conforme: "Paramètre correct"
    };
}

const LEVELS = ['Initial','En Progrès','Formalisé','Sous Contrôle','Optimisé'];

// ============================================
// AUTH GITLAB + HELPERS — Nouveau format hub (localStorage) + fallback ancien
// ============================================
let GITLAB_URL = null;
let GITLAB_TOKEN = null;
let PROJECT_ID = null;

// Concurrence pour les fetches détaillés (MR changes, etc.).
// Aligné sur l'écosystème (autoretro, daily-report, etc.).
const FETCH_CONCURRENCY = 8;

// ============================================
// HELPERS — fetchGitLab (retry 429), runWithConcurrency, escapeHtml
// ============================================

async function fetchGitLab(endpoint, init = {}) {
            return window.Salsifi.gitlabFetch(GITLAB_URL, GITLAB_TOKEN, endpoint, init);
        }

function runWithConcurrency(tasks, limit) { return window.Salsifi.runWithConcurrency(tasks, limit); }

function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }

function escapeAttr(v) { return window.Salsifi.escapeAttr(v); }

// Wrapper qui parse JSON ou renvoie null sur erreur. Préserve le comportement
// "tolérant" du code initial (tous les callers font `data || []`).
async function glFetch(endpoint) {
    try {
        const r = await fetchGitLab(endpoint);
        if (!r.ok) return null;
        return r.json();
    } catch (e) {
        console.error('GitLab API error:', e);
        return null;
    }
}

// Wrapper RAW (pour pom.xml et autres fichiers texte).
// Avant : glFetch utilisait toujours .json() → le check `typeof === 'string'`
// dans le Maven analyzer ne pouvait JAMAIS être vrai → code mort silencieux.
async function glFetchRaw(endpoint) {
    try {
        const r = await fetchGitLab(endpoint);
        if (!r.ok) return null;
        return r.text();
    } catch (e) {
        console.error('GitLab API raw error:', e);
        return null;
    }
}

// ============================================
// TOAST — remplace les alert() bloquants
// ============================================

function showToast(message, type = 'info') {
    let toast = document.getElementById('maturity-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'maturity-toast';
        toast.style.cssText = `
            position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            padding: 12px 24px; border-radius: 999px;
            color: var(--text-primary, #f5f1ff);
            font-family: var(--font-body, 'Manrope', sans-serif);
            font-weight: 500; font-size: 14px;
            z-index: 10000;
            backdrop-filter: blur(20px);
            box-shadow: 0 12px 32px rgba(0,0,0,0.4);
            opacity: 0; transition: opacity .25s ease, transform .25s ease;
            pointer-events: none;
            max-width: 90vw; text-align: center;
            border: 1px solid var(--border-strong, rgba(255,255,255,0.18));
        `;
        document.body.appendChild(toast);
    }
    const bg = type === 'error'   ? 'rgba(251, 113, 133, 0.20)'
             : type === 'warning' ? 'rgba(251, 191, 36, 0.20)'
             : type === 'success' ? 'rgba(45, 212, 191, 0.20)'
             :                       'rgba(124, 92, 255, 0.20)';
    toast.style.background = bg;
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
    }, 3000);
}

// ============================================
// GUARD STRICT — appelé AU CHARGEMENT (pas après le quiz comme avant !)
// ============================================

function initAuth() {
    // Nouveau format hub : localStorage 'devops_hub_workspaces' (JSON) + 'hub_selected_repo_id'
    const authRaw = localStorage.getItem('devops_hub_workspaces');
    if (authRaw) {
        try {
            const auth = JSON.parse(authRaw);
            GITLAB_TOKEN = auth.token;
            GITLAB_URL = auth.gitlabUrl;
        } catch { /* fallback ci-dessous */ }
    }
    // Fallback ancien format (sessionStorage)
    if (!GITLAB_TOKEN) GITLAB_TOKEN = sessionStorage.getItem('gitlab_token');
    if (!GITLAB_URL) GITLAB_URL = sessionStorage.getItem('gitlab_base_url');

    // Project ID : nouveau format puis ancien
    const selectedRepoId = localStorage.getItem('hub_selected_repo_id');
    PROJECT_ID = selectedRepoId || sessionStorage.getItem('gitlab_project_id');

    // Guard strict — check immédiat au chargement
    // (au lieu d'attendre la fin du quiz comme dans la version d'origine).
    if (!GITLAB_TOKEN || !GITLAB_URL || !PROJECT_ID) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// ============================================
// EVENT DELEGATION — remplace tous les onclick inline (HTML + JS)
// ============================================

const ACTION_HANDLERS = {
    'start-quiz':        () => startQuiz(),
    'next-cat':          () => nextCat(),
    'prev-cat':          () => prevCat(),
    'finish-quiz':       () => finishQuiz(),
    'go-actions':        () => goActions(),
    'show-screen':       (e, el) => showScreen(el.dataset.screen),
    'export-action-plan':() => exportActionPlan(),
    'open-cf-modal':     (e, el) => openCfModal(parseInt(el.dataset.catIdx, 10)),
    'close-cf-modal':    () => closeCfModal(),
    'pick':              (e, el) => pick(el.dataset.qid, parseInt(el.dataset.val, 10)),
    'cf-overlay-click':  (e, el) => { if (e.target === el) closeCfModal(); }
};

function attachEventDelegation() {
    document.body.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const handler = ACTION_HANDLERS[el.dataset.action];
        if (handler) handler(e, el);
    });
    // Radio inputs des questions : passent par event delegation 'change'
    // (avant : onchange="pick(...)" inline dans chaque radio).
    document.body.addEventListener('change', (e) => {
        const el = e.target.closest('input[type="radio"][data-action="pick"]');
        if (!el) return;
        pick(el.dataset.qid, parseInt(el.dataset.val, 10));
    });
    // Escape ferme le modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCfModal();
    });
}

// ============================================
// BOOTSTRAP — exécuté immédiatement (script en bas du body, DOM prêt)
// ============================================

if (!initAuth()) {
    // Redirect déjà déclenché, on stoppe l'exécution
    throw new Error('Auth required');
}

attachEventDelegation();

// Date par défaut (était en fin de fichier, déplacé ici pour clarté)
const inDateEl = document.getElementById('inDate');
if (inDateEl) inDateEl.value = new Date().toISOString().split('T')[0];

// ============================================
// GITLAB_DATA — rempli par fetchAllMetrics()
// ============================================
let GITLAB_DATA = {};

async function fetchAllMetrics(updateStep) {
    const pid = PROJECT_ID;

    const now = new Date();
    const since7d = new Date(now - 7 * 86400000);
    const since4w = new Date(now - 28 * 86400000);
    const since90d = new Date(now - 90 * 86400000);

    // ── PHASE A : projectDetails EN PREMIER pour avoir defaultBranch ────────
    // Avant : projectDetails fetché plus tard ; mainPipelines et staleBranches
    // filtraient sur 'main' || 'master' hardcodé. Sur un projet avec
    // default branch 'develop' / 'integration' / 'recette', tous ces calculs
    // étaient FAUX.
    // Maintenant : on récupère default_branch d'abord, on l'utilise partout.
    updateStep(1);
    const projectDetails = await glFetch(`/projects/${pid}`) || {};
    const defaultBranch = projectDetails.default_branch || 'main';

    // ── PHASE B : 11 fetches indépendants en PARALLÈLE ──────────────────────
    // Avant : ~20 fetches en série dans 7 sections séquentielles = ~7-8s.
    // Maintenant : Promise.all sur les indépendants = ~1-2s pour cette phase.
    updateStep(2);
    const [
        pipelines, mergedMRs, openMRs, branches, protectedBranches,
        approvalRules, tree, contributors, commits, variables, releases
    ] = await Promise.all([
        glFetch(`/projects/${pid}/pipelines?per_page=100&updated_after=${since90d.toISOString()}`),
        glFetch(`/projects/${pid}/merge_requests?state=merged&per_page=100&order_by=created_at&sort=desc&updated_after=${since90d.toISOString()}`),
        glFetch(`/projects/${pid}/merge_requests?state=opened&per_page=100`),
        glFetch(`/projects/${pid}/repository/branches?per_page=100`),
        glFetch(`/projects/${pid}/protected_branches`),
        glFetch(`/projects/${pid}/approval_rules`),
        glFetch(`/projects/${pid}/repository/tree?per_page=100`),
        glFetch(`/projects/${pid}/repository/contributors?per_page=100`),
        glFetch(`/projects/${pid}/repository/commits?per_page=100&since=${since90d.toISOString()}`),
        glFetch(`/projects/${pid}/variables`),
        glFetch(`/projects/${pid}/releases?per_page=20`)
    ]).then(arr => arr.map(x => x || []));

    // ── PHASE C : ANALYSE PIPELINES (synchrone après le fetch) ──────────────
    updateStep(3);
    const total = pipelines.length;
    const success = pipelines.filter(p => p.status === 'success').length;
    const failed = pipelines.filter(p => p.status === 'failed').length;
    const pipelineOkPct = total > 0 ? Math.round(success / total * 100) : 0;
    const pipelineOkScore = pipelineOkPct >= 90 ? 100 : pipelineOkPct >= 70 ? 70 : 40;

    const recent7d = pipelines.filter(p => new Date(p.created_at) > since7d && p.status === 'success');
    const deployFreq = (recent7d.length / 7).toFixed(1);
    const deployFreqScore = Math.min(100, Math.round(parseFloat(deployFreq) / 3 * 100));

    // Avant : `p.ref === 'main' || p.ref === 'master'` hardcodé.
    // Maintenant : on utilise la default branch détectée.
    const mainPipelines = pipelines.filter(p => p.ref === defaultBranch);
    const deployMainPct = total > 0 ? Math.round(mainPipelines.length / total * 100) : 0;
    const deployMainScore = deployMainPct >= 90 ? 100 : deployMainPct >= 70 ? 70 : 40;

    const failRate = total > 0 ? Math.round(failed / total * 100) : 0;
    const failRateScore = failRate <= 5 ? 100 : failRate <= 15 ? 70 : 40;

    const successPipelines = pipelines.filter(p => p.status === 'success' && p.duration);
    const avgDuration = successPipelines.length > 0
        ? Math.round(successPipelines.slice(0, 20).reduce((s, p) => s + (p.duration || 0), 0) / Math.min(20, successPipelines.length) / 60)
        : 0;
    const durationScore = avgDuration < 10 ? 100 : avgDuration < 20 ? 70 : 40;

    let maxStreak = 0, currentStreak = 0;
    pipelines.forEach(p => {
        if (p.status === 'failed') { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak); }
        else { currentStreak = 0; }
    });
    const failStreakScore = maxStreak <= 1 ? 100 : maxStreak <= 3 ? 70 : 40;

    const recentPipelines = pipelines.filter(p => new Date(p.created_at) > since7d);
    const olderPipelines = pipelines.filter(p => new Date(p.created_at) > since4w && new Date(p.created_at) <= since7d);
    const recentRate = recentPipelines.length > 0 ? recentPipelines.filter(p => p.status === 'success').length / recentPipelines.length : 0;
    const olderRate = olderPipelines.length > 0 ? olderPipelines.filter(p => p.status === 'success').length / olderPipelines.length : recentRate;
    const trendDiff = Math.round((recentRate - olderRate) * 100);
    const trendScore = trendDiff >= 0 ? 100 : trendDiff >= -5 ? 70 : 40;

    let recoveryTimes = [];
    for (let i = 0; i < pipelines.length - 1; i++) {
        if (pipelines[i].status === 'success' && pipelines[i + 1]?.status === 'failed') {
            const diff = (new Date(pipelines[i].created_at) - new Date(pipelines[i + 1].created_at)) / 3600000;
            if (diff > 0) recoveryTimes.push(diff);
        }
    }
    const avgRecovery = recoveryTimes.length > 0 ? Math.round(recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length) : 0;
    const recoveryScore = avgRecovery < 2 ? 100 : avgRecovery < 24 ? 60 : 30;

    // ── ANALYSE MR ──────────────────────────────────────────────────────────
    updateStep(4);
    let reviewTimes = [];
    mergedMRs.slice(0, 20).forEach(mr => {
        if (mr.created_at && mr.merged_at) {
            const days = (new Date(mr.merged_at) - new Date(mr.created_at)) / 86400000;
            reviewTimes.push(days);
        }
    });
    const avgReviewTime = reviewTimes.length > 0 ? reviewTimes.reduce((a, b) => a + b, 0) / reviewTimes.length : 0;
    const reviewTimeScore = avgReviewTime < 2 ? 100 : avgReviewTime < 7 ? 60 : 30;

    const avgDiscussions = mergedMRs.length > 0
        ? mergedMRs.slice(0, 20).reduce((s, mr) => s + (mr.user_notes_count || 0), 0) / Math.min(20, mergedMRs.length)
        : 0;
    const discussionsScore = avgDiscussions >= 3 ? 100 : avgDiscussions >= 1 ? 70 : 40;

    const zombieMRs = openMRs.filter(mr => (now - new Date(mr.created_at)) / 86400000 > 7).length;
    const zombieMRsScore = zombieMRs === 0 ? 100 : zombieMRs <= 3 ? 60 : 30;

    const noApprovalMRs = mergedMRs.filter(mr => (mr.user_notes_count || 0) === 0).length;
    const noApprovalPct = mergedMRs.length > 0 ? Math.round(noApprovalMRs / mergedMRs.length * 100) : 0;
    const noApprovalScore = noApprovalPct === 0 ? 100 : noApprovalPct <= 20 ? 70 : 40;

    const mergers = [...new Set(mergedMRs.slice(0, 20).map(mr => mr.merged_by?.id).filter(Boolean))];
    const reviewerDiversity = mergers.length;
    const reviewerDiversityScore = reviewerDiversity >= 3 ? 100 : reviewerDiversity >= 2 ? 60 : 30;

    // ── ANALYSE BRANCHES ────────────────────────────────────────────────────
    updateStep(5);
    // Avant : hardcoded 'main' || 'master'. Maintenant : defaultBranch.
    const staleBranches = branches.filter(b => {
        if (b.name === defaultBranch) return false;
        const lastCommit = new Date(b.commit?.committed_date || b.commit?.created_at || 0);
        return (now - lastCommit) / 86400000 > 30;
    }).length;
    const staleBranchesScore = staleBranches < 5 ? 100 : staleBranches < 20 ? 60 : 30;

    const mainProtected = protectedBranches.find(b => b.name === defaultBranch);
    const isProtected = !!mainProtected;
    const forcePushAllowed = mainProtected?.allow_force_push ?? true;
    const branchProtectionScore = isProtected && !forcePushAllowed ? 100 : isProtected ? 70 : 30;

    const minApprovers = approvalRules.length > 0 ? Math.max(...approvalRules.map(r => r.approvals_required || 0)) : 0;
    const approvalRulesScore = minApprovers >= 2 ? 100 : minApprovers >= 1 ? 60 : 30;

    // ── ANALYSE GOUVERNANCE ─────────────────────────────────────────────────
    // Avant : double fetch /projects/:id (ligne 860 + ligne 873 dans le code
    // original). Maintenant : on réutilise projectDetails fetché en Phase A.
    const authorCanApprove = !(projectDetails.merge_requests_author_approval === false);
    const committerCanApprove = !(projectDetails.merge_requests_disable_committers_approval === true);
    const resetOnPush = projectDetails.reset_approvals_on_push ?? false;

    // ── ANALYSE FICHIERS ────────────────────────────────────────────────────
    updateStep(6);
    const fileNames = tree.map(f => f.name.toLowerCase());
    const hasReadme = fileNames.some(f => f.startsWith('readme'));
    const hasGitignore = fileNames.includes('.gitignore');
    const hasChangelog = fileNames.some(f => f.includes('changelog'));
    const hasCi = fileNames.includes('.gitlab-ci.yml');
    const stdFilesCount = [hasReadme, hasGitignore, hasChangelog].filter(Boolean).length;
    const stdFilesScore = stdFilesCount === 3 ? 100 : stdFilesCount === 2 ? 70 : 40;

    const hasLockFile = fileNames.some(f =>
        f === 'package-lock.json' || f === 'yarn.lock' || f === 'pnpm-lock.yaml' ||
        f === 'poetry.lock' || f === 'pipfile.lock' || f === 'go.sum' || f === 'gradle.lockfile'
    );
    const lockFilesScore = hasLockFile ? 100 : 40;
    const ciVersionedScore = hasCi ? 100 : 30;

    // ── ANALYSE CONTRIBUTEURS ───────────────────────────────────────────────
    updateStep(7);
    const activeContributors = contributors.filter(c => c.commits > 0).length;
    const busFactorScore = activeContributors >= 3 ? 100 : activeContributors >= 2 ? 60 : 30;

    const totalCommits = contributors.reduce((s, c) => s + c.commits, 0);
    const topContributorCommits = contributors.length > 0 ? Math.max(...contributors.map(c => c.commits)) : 0;
    const concentrationPct = totalCommits > 0 ? Math.round(topContributorCommits / totalCommits * 100) : 0;
    const concentrationScore = concentrationPct < 40 ? 100 : concentrationPct < 60 ? 60 : 30;

    let maxGap = 0;
    for (let i = 0; i < commits.length - 1; i++) {
        const gap = (new Date(commits[i].created_at) - new Date(commits[i + 1].created_at)) / 86400000;
        maxGap = Math.max(maxGap, gap);
    }
    const regularityScore = maxGap < 7 ? 100 : maxGap < 14 ? 70 : 40;

    // ── ANALYSE FEATURE FLAGS + STAGES + MR SIZES + MAVEN ───────────────────
    updateStep(8);
    const flagVars = variables.filter(v =>
        v.key.toLowerCase().includes('flag') ||
        v.key.toLowerCase().includes('feature') ||
        v.key.toLowerCase().includes('toggle')
    );
    const featureFlagsScore = flagVars.length >= 3 ? 100 : flagVars.length >= 1 ? 60 : 30;
    const zombieFlags = flagVars.filter(v => !v.masked).length;
    const zombieFlagsScore = zombieFlags === 0 ? 100 : zombieFlags <= 3 ? 70 : 40;

    // Jobs + MR sizes + Maven en parallèle (3 fetches indépendants).
    const lastPipelineId = pipelines.length > 0 ? pipelines[0].id : null;
    const hasPom = fileNames.includes('pom.xml');

    const [jobs, mrSizes, pomContent] = await Promise.all([
        lastPipelineId ? glFetch(`/projects/${pid}/pipelines/${lastPipelineId}/jobs`) : Promise.resolve(null),
        // MR sizes : runWithConcurrency au lieu de Promise.all « brut » (20
        // fetches → si l'instance est saturée, on cape à 8 simultanés).
        (async () => {
            if (mergedMRs.length === 0) return [];
            const tasks = mergedMRs.slice(0, 20).map(mr => async () => {
                const changes = await glFetch(`/projects/${pid}/merge_requests/${mr.iid}/changes`);
                return changes?.changes?.length || 0;
            });
            const results = await runWithConcurrency(tasks, FETCH_CONCURRENCY);
            return results.map(r => r.status === 'fulfilled' ? r.value : 0);
        })(),
        // Maven : fetch RAW (avant : glFetch utilisait .json() → typeof
        // pomContent === 'string' était toujours faux → code mort).
        hasPom ? glFetchRaw(`/projects/${pid}/repository/files/pom.xml/raw?ref=${encodeURIComponent(defaultBranch)}`)
               : Promise.resolve(null)
    ]);

    let pipelineStagesScore = 50;
    if (jobs && jobs.length > 0) {
        const stages = [...new Set(jobs.map(j => j.stage.toLowerCase()))];
        const hasTest = stages.some(s => s.includes('test'));
        const hasLint = stages.some(s => s.includes('lint') || s.includes('quality'));
        const hasSecurity = stages.some(s => s.includes('secur') || s.includes('sast') || s.includes('scan'));
        const stageCount = [hasTest, hasLint, hasSecurity].filter(Boolean).length;
        pipelineStagesScore = stageCount >= 3 ? 100 : stageCount >= 2 ? 70 : 40;
    }

    const avgMRSize = mrSizes.length > 0
        ? Math.round(mrSizes.reduce((a, b) => a + b, 0) / mrSizes.length)
        : 0;
    const mrSizeScore = avgMRSize < 10 ? 100 : avgMRSize < 25 ? 60 : 30;

    const recentReleases = releases.filter(r => new Date(r.released_at || r.created_at) > since90d).length;
    const releasesScore = recentReleases >= 5 ? 100 : recentReleases >= 1 ? 60 : 30;

    // Maven check : maintenant fonctionnel (pomContent est une vraie string)
    let mavenScore = null;
    if (hasPom && typeof pomContent === 'string') {
        const snapshotCount = (pomContent.match(/SNAPSHOT/gi) || []).length;
        mavenScore = snapshotCount === 0 ? 100 : snapshotCount <= 2 ? 70 : 40;
    }

    GITLAB_DATA = {
        deploy_freq: { score: deployFreqScore, val: `${deployFreq}/jour`, rule: '≥ 3/jour' },
        pipeline_ok: { score: pipelineOkScore, val: `${pipelineOkPct}%`, rule: '≥ 90%' },
        deploy_main: { score: deployMainScore, val: `${deployMainPct}% via ${defaultBranch}`, rule: '≥ 90%' },
        releases: { score: releasesScore, val: `${recentReleases} en 3 mois`, rule: '≥ 5/trimestre' },
        pipeline_duration: { score: durationScore, val: `${avgDuration} min`, rule: '< 10 min' },
        review_time: { score: reviewTimeScore, val: `${avgReviewTime.toFixed(1)} jours`, rule: '< 2 jours' },
        approval_rules: { score: approvalRulesScore, val: `${minApprovers} approbateur(s)`, rule: '2+ approbateurs' },
        discussions_mr: { score: discussionsScore, val: `${avgDiscussions.toFixed(1)} /MR`, rule: '≥ 3/MR' },
        mr_size: { score: mrSizeScore, val: `${avgMRSize} fichiers/MR`, rule: '< 10 fichiers' },
        mr_no_approval: { score: noApprovalScore, val: `${noApprovalPct}% sans review`, rule: '0%' },
        fail_rate: { score: failRateScore, val: `${failRate}%`, rule: '< 5%' },
        trend: { score: trendScore, val: `${trendDiff >= 0 ? '+' : ''}${trendDiff}%`, rule: 'Stable' },
        recovery_time: { score: recoveryScore, val: `${avgRecovery}h`, rule: '< 2h' },
        fail_streak: { score: failStreakScore, val: `max ${maxStreak}`, rule: 'max 1' },
        stale_branches: { score: staleBranchesScore, val: `${staleBranches} branches`, rule: '< 5' },
        lock_files: { score: lockFilesScore, val: hasLockFile ? 'Présents' : 'Absents', rule: 'Présents' },
        branch_protection: { score: branchProtectionScore, val: isProtected ? (forcePushAllowed ? 'Protégée, force push ON' : 'Protégée, force push OFF') : 'Non protégée', rule: 'Force push OFF' },
        std_files: { score: stdFilesScore, val: [hasReadme ? 'README' : '', hasGitignore ? '.gitignore' : '', hasChangelog ? 'CHANGELOG' : ''].filter(Boolean).join(' + ') || 'Aucun', rule: 'README + .gitignore + CHANGELOG' },
        zombie_mrs: { score: zombieMRsScore, val: `${zombieMRs} MR > 7j`, rule: '0' },
        bus_factor: { score: busFactorScore, val: `${activeContributors} contributeurs`, rule: '≥ 3' },
        commit_concentration: { score: concentrationScore, val: `${concentrationPct}% par 1`, rule: '< 40%' },
        reviewer_diversity: { score: reviewerDiversityScore, val: `${reviewerDiversity} reviewers`, rule: '≥ 3' },
        commit_regularity: { score: regularityScore, val: `gap ${Math.round(maxGap)}j`, rule: '< 7j' },
        feature_flags: { score: featureFlagsScore, val: `${flagVars.length} flags`, rule: 'Gérés' },
        zombie_flags: { score: zombieFlagsScore, val: `${zombieFlags} suspects`, rule: '0' },
        maven_versions: { score: mavenScore, val: mavenScore === null ? 'Non applicable' : mavenScore === 100 ? '0 SNAPSHOT' : 'SNAPSHOT présents', rule: '0' },
        pipeline_stages: { score: pipelineStagesScore, val: pipelineStagesScore >= 100 ? 'test+lint+secu' : pipelineStagesScore >= 70 ? '2 stages' : 'incomplet', rule: 'test+lint+secu' },
        ci_versioned: { score: ciVersionedScore, val: hasCi ? 'Présent' : 'Absent', rule: 'Présent' },
        sec_branch_protected: { score: isProtected ? 100 : 30, val: isProtected ? 'Protégée' : 'Non protégée', rule: 'Protégée' },
        sec_force_push: { score: !forcePushAllowed ? 100 : 40, val: forcePushAllowed ? 'Autorisé' : 'Interdit', rule: 'Interdit' },
        sec_author_approval: { score: !authorCanApprove ? 100 : 40, val: authorCanApprove ? 'Autorisé' : 'Bloqué', rule: 'Bloqué' },
        sec_committer_approval: { score: !committerCanApprove ? 100 : 40, val: committerCanApprove ? 'Autorisé' : 'Bloqué', rule: 'Bloqué' },
        sec_reset_approvals: { score: resetOnPush ? 100 : 40, val: resetOnPush ? 'Activé' : 'Désactivé', rule: 'Activé' }
    };

    return GITLAB_DATA;
}

function getAdvice(qid, level) {
    const a = ADVICE[qid];
    if (!a) return null;
    if (a[level]) return a[level];
    if (level === 'non_conforme' && a.non_conforme) return a.non_conforme;
    if (level === 'conforme' && a.conforme) return a.conforme;
    return a[3] || null;
}

// ============================================
// ÉTAT ET FONCTIONS DE BASE
// ============================================
const answers = {};
let currentCatIdx = 0;
let selectedActions = new Set();

// ============================================
// IMPORT / EXPORT — Sauvegarde JSON de l'évaluation
// ============================================
// Permet de reprendre une évaluation interrompue ou de la partager
// entre coachs. Le JSON capture : métadonnées, progression, réponses.
// Format versionné pour pouvoir évoluer sans casser les fichiers existants.

const MATURITY_STATE_TYPE = 'lcl-devops-hub-maturity';
const MATURITY_STATE_VERSION = 1;

function exportMaturityState() {
    const squad = (document.getElementById('inSquad').value || '').trim();
    const tribu = (document.getElementById('inTribu').value || '').trim();
    const date  = document.getElementById('inDate').value || new Date().toISOString().split('T')[0];

    if (Object.keys(answers).length === 0) {
        alert('Rien à sauvegarder : aucune réponse pour le moment.');
        return;
    }

    const payload = {
        type: MATURITY_STATE_TYPE,
        version: MATURITY_STATE_VERSION,
        exportedAt: new Date().toISOString(),
        metadata: { squad, tribu, date },
        progress: { currentCatIdx },
        answers: { ...answers }
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);

    // Nom de fichier : maturite-<squad>-<date>.json (slugifié)
    const slug = (squad || 'squad')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'squad';
    const filename = `maturite-${slug}-${date}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') showToast(`💾 Sauvegardé : ${filename}`, 'success');
}

function importMaturityState(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    // Reset le file input pour permettre de réimporter le même fichier ensuite
    event.target.value = '';

    const reader = new FileReader();
    reader.onerror = () => alert('❌ Impossible de lire le fichier.');
    reader.onload = (e) => {
        let data;
        try {
            data = JSON.parse(e.target.result);
        } catch (err) {
            alert('❌ Fichier JSON invalide : ' + err.message);
            return;
        }

        // Validation du format
        if (!data || typeof data !== 'object') {
            alert('❌ Fichier invalide : structure inattendue.');
            return;
        }
        if (data.type !== MATURITY_STATE_TYPE) {
            alert(`❌ Ce fichier n'est pas une sauvegarde de maturité DevOps Hub (type attendu : "${MATURITY_STATE_TYPE}").`);
            return;
        }
        if (typeof data.version !== 'number' || data.version > MATURITY_STATE_VERSION) {
            alert(`❌ Version de fichier non supportée (${data.version}). Version max : ${MATURITY_STATE_VERSION}.`);
            return;
        }
        if (!data.answers || typeof data.answers !== 'object') {
            alert('❌ Fichier invalide : aucune réponse trouvée.');
            return;
        }

        // Restauration des métadonnées
        const meta = data.metadata || {};
        if (meta.squad) document.getElementById('inSquad').value = meta.squad;
        if (meta.tribu) document.getElementById('inTribu').value = meta.tribu;
        if (meta.date)  document.getElementById('inDate').value  = meta.date;

        // Restauration des réponses (on vide l'état actuel d'abord)
        Object.keys(answers).forEach(k => delete answers[k]);
        Object.entries(data.answers).forEach(([qid, val]) => { answers[qid] = val; });

        // Restauration de la progression — clampé sur la plage valide
        const restoredIdx = (data.progress && typeof data.progress.currentCatIdx === 'number')
            ? data.progress.currentCatIdx : 0;
        currentCatIdx = Math.max(0, Math.min(restoredIdx, quizCategories.length - 1));

        // Bascule sur l'écran quiz
        renderCategory();
        showScreen('s-quiz');

        const answeredCount = Object.keys(answers).length;
        if (typeof showToast === 'function') {
            showToast(`📂 Évaluation restaurée — ${answeredCount} réponse${answeredCount > 1 ? 's' : ''}`, 'success');
        }
    };
    reader.readAsText(file);
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0,0);
    const steps = { 's-welcome':'Étape 1/4','s-quiz':'Étape 2/4','s-loading':'Analyse...','s-report':'Rapport','s-actions':'Plan' };
    document.getElementById('headerStep').textContent = steps[id] || '';
}

function startQuiz() {
    document.getElementById('inDate').value = document.getElementById('inDate').value || new Date().toISOString().split('T')[0];
    currentCatIdx = 0;
    renderCategory();
    showScreen('s-quiz');
}

const quizCategories = CATEGORIES.filter(c => c.type !== 'data_only');

function getCatQuestions(catId) {
    return QUESTIONS.filter(q => q.cat === catId && !q.dataOnly);
}

function getAllQuestions() {
    return QUESTIONS.filter(q => !q.dataOnly);
}

function renderCategory() {
    const cat = quizCategories[currentCatIdx];
    const qs = getCatQuestions(cat.id);
    const bgColors = { culture:'rgba(244,114,182,0.15)', delivery:'rgba(96,165,250,0.15)', quality:'rgba(167,139,250,0.15)',
        stability:'rgba(52,211,153,0.15)', hygiene:'rgba(251,191,36,0.15)', resilience:'rgba(248,113,113,0.15)', practices:'rgba(249,115,22,0.15)' };
    document.getElementById('categoryHeader').innerHTML = `<div class="category-header" style="background:${bgColors[cat.id]}"><div class="ch-icon">${cat.icon}</div><div class="ch-info"><div class="ch-name">${cat.label}</div><div class="ch-desc">${cat.desc}</div></div><div class="ch-count">${qs.length} questions</div></div>`;
    document.getElementById('questionList').innerHTML = qs.map((q,i) => {
        const current = answers[q.id] || null;
        return `<div class="q-card ${current ? 'answered' : ''}" id="qc-${q.id}"><div class="q-num">Question ${String(i+1).padStart(2,'0')} / ${qs.length}</div><div class="q-text">${q.q}</div><div class="levels">${LEVELS.map((l,v) => `<label class="lvl-opt"><input type="radio" name="ans-${q.id}" value="${v+1}" ${current===v+1?'checked':''} onchange="pick('${q.id}',${v+1})"><div class="lvl-box"><div class="lvl-num">${v+1}</div><div class="lvl-lbl">${l}</div></div></label>`).join('')}</div></div>`;
    }).join('');
    const isFirst = currentCatIdx === 0;
    const isLast = currentCatIdx === quizCategories.length - 1;
    document.getElementById('quizNav').innerHTML = `${isFirst ? '' : '<button class="btn-nav btn-prev" onclick="prevCat()">← Précédent</button>'}${isLast ? '<button class="btn-nav btn-finish" onclick="finishQuiz()">🚀 Analyser les résultats</button>' : '<button class="btn-nav btn-next" onclick="nextCat()">Suivant →</button>'}`;
    updateProgress();
}

function pick(qid, val) { answers[qid] = val; document.getElementById('qc-'+qid).classList.add('answered'); updateProgress(); }
function updateProgress() { const total = getAllQuestions().length; const done = Object.keys(answers).length; document.getElementById('qpFill').style.width = (done/total*100)+'%'; document.getElementById('qpText').textContent = done + ' / ' + total; }
function nextCat() {
    const cat = quizCategories[currentCatIdx];
    const qs = getCatQuestions(cat.id);
    const unanswered = qs.filter(q => !answers[q.id]);
    if (unanswered.length > 0) {
        alert(`⚠️ Veuillez répondre à toutes les questions avant de continuer (${unanswered.length} sans réponse).`);
        return;
    }
    if (currentCatIdx < quizCategories.length - 1) { currentCatIdx++; renderCategory(); }
}
function prevCat() { if (currentCatIdx > 0) { currentCatIdx--; renderCategory(); } }

async function finishQuiz() {
    if (!initAuth()) return;
    
    showScreen('s-loading');
    const steps = ['Connexion GitLab…','Analyse pipelines…','Scan MR…','Vérification branches…','Scan Gouvernance…','Analyse fichiers…','Contributeurs…','Feature flags…'];
    const stepsEl = document.getElementById('ldSteps');
    const fill = document.getElementById('ldFill');
    stepsEl.innerHTML = steps.map((s,i) => `<div class="ld-step" id="ldst-${i}">⏳ ${s}</div>`).join('');
    
    const updateStep = (stepNum) => {
        if (stepNum > 0) {
            document.getElementById('ldst-' + (stepNum - 1)).classList.add('done');
            document.getElementById('ldst-' + (stepNum - 1)).textContent = '✓ ' + steps[stepNum - 1].replace('…', '');
        }
        fill.style.width = (stepNum / steps.length * 100) + '%';
    };
    
    try {
        await fetchAllMetrics(updateStep);
        
        document.getElementById('ldst-' + (steps.length - 1)).classList.add('done');
        document.getElementById('ldst-' + (steps.length - 1)).textContent = '✓ ' + steps[steps.length - 1].replace('…', '');
        fill.style.width = '100%';
        
        await new Promise(r => setTimeout(r, 500));
        showScreen('s-report');
        renderReport();
    } catch (err) {
        console.error('Erreur analyse GitLab:', err);
        alert('Erreur lors de l\'analyse GitLab. Vérifiez votre connexion et réessayez.');
        showScreen('s-quiz');
    }
}

function declScoreForCat(catId) {
    const cat = CATEGORIES.find(c => c.id === catId);
    if (cat?.type === 'data_only') return null;
    const qs = getCatQuestions(catId);
    const vals = qs.map(q => answers[q.id]).filter(Boolean);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length/5*100);
}

function dataScoreForCat(catId) {
    const qs = getCatQuestions(catId).filter(q => q.metric);
    if (!qs.length) return null;
    const scored = qs.filter(q => GITLAB_DATA[q.metric]?.score != null);
    if (!scored.length) return null;
    return Math.round(scored.reduce((s,q) => s + GITLAB_DATA[q.metric].score, 0) / scored.length);
}

function renderReport() {
    const catScores = CATEGORIES.map(c => {
        const decl = declScoreForCat(c.id);
        const data = dataScoreForCat(c.id);
        let final = c.type === 'data_only' ? (data||0) : (data !== null ? Math.round((decl+data)/2) : (decl||0));
        return { ...c, decl, data, final };
    });
    const globalScore = Math.round(catScores.reduce((s,c)=>s+c.final,0)/catScores.length);
    const lvl = globalScore >= 80 ? 4 : globalScore >= 60 ? 3 : globalScore >= 40 ? 2 : globalScore >= 20 ? 1 : 0;
    document.getElementById('rhScore').textContent = globalScore;
    document.getElementById('rhLevel').textContent = LEVELS[lvl];
    document.getElementById('rhMeta').textContent = `${document.getElementById('inSquad').value} · ${document.getElementById('inTribu').value} · ${document.getElementById('inDate').value}`;
    const ctx = document.getElementById('radarChart').getContext('2d');
    new Chart(ctx, {
        type:'radar', data:{ labels: catScores.map(c=>c.icon+' '+c.label.split(' ')[0]), datasets:[
            { label:'Déclaratif', data:catScores.map(c=>c.decl), backgroundColor:'rgba(167,139,250,0.15)', borderColor:'rgba(167,139,250,0.6)', borderWidth:2, borderDash:[5,5], pointRadius:4 },
            { label:'Data GitLab', data:catScores.map(c=>c.data??c.decl), backgroundColor:'rgba(96,165,250,0.15)', borderColor:'rgba(96,165,250,0.8)', borderWidth:2, pointRadius:5 }
        ]},
        options:{ responsive:true, maintainAspectRatio:false, scales:{ r:{ beginAtZero:true, max:100, grid:{ color:'rgba(255,255,255,0.06)' }, pointLabels:{ font:{ size:11 }, color:'rgba(255,255,255,0.6)' } } }, plugins:{ legend:{ labels:{ color:'rgba(255,255,255,0.6)', font:{ size:11 } } } } }
    });
    window._catScores = catScores;
    document.getElementById('confrontGrid').innerHTML = catScores.map((c,idx) => {
        const delta = (c.data!==null && c.decl!==null) ? c.decl - c.data : 0;
        const badgeClass = c.type === 'data_only' ? (c.data>=80?'aligned':c.data>=50?'gap':'big-gap') : (Math.abs(delta)<5?'aligned':Math.abs(delta)<20?'gap':'big-gap');
        const badgeText = c.type === 'data_only' ? (c.data>=80?'✓ Conforme':c.data>=50?'⚠️ Partiel':'🔴 Non conforme') : (Math.abs(delta)<5?'✓ Aligné':delta>0?`↑ +${delta}`:`↓ ${delta}`);
        return `<div class="cf-card" onclick="openCfModal(${idx})"><div class="cf-header"><div class="cf-icon">${c.icon}</div><div class="cf-name">${c.label}</div><div class="cf-badge ${badgeClass}">${badgeText}</div></div><div class="cf-bars"><div class="cf-bar-row"><div class="cf-bar-label">Déclar.</div><div class="cf-bar-track"><div class="cf-bar-fill declaratif" style="width:${c.decl??0}%"></div></div><div class="cf-bar-val">${c.decl??'-'}</div></div>${c.type !== 'data_only'?`<div class="cf-bar-row"><div class="cf-bar-label">Data</div><div class="cf-bar-track"><div class="cf-bar-fill data" style="width:${c.data??0}%"></div></div><div class="cf-bar-val">${c.data??'-'}</div></div>`:''}</div><div class="cf-expand-hint">▼ Cliquer pour le détail</div></div>`;
    }).join('');
}

function openCfModal(catIdx) {
    const c = window._catScores[catIdx];
    const qs = QUESTIONS.filter(q => q.cat === c.id);
    const details = qs.map((q,i) => {
        const declVal = answers[q.id] || 3;
        const declLabel = LEVELS[declVal-1];
        const declScore = Math.round(declVal / 5 * 100);
        const m = q.metric ? GITLAB_DATA[q.metric] : null;
        const dataScore = m ? m.score : null;
        const advice = getAdvice(q.id, declVal);
        let gapClass = '';
        let gapBadge = '';
        if (m) {
            const delta = declScore - dataScore;
            const absDelta = Math.abs(delta);
            if (absDelta < 15) {
                gapClass = 'border-left:4px solid rgba(16,185,129,0.5);';
                gapBadge = '<span style="font-size:10px;background:rgba(16,185,129,0.2);color:#6ee7b7;padding:2px 8px;border-radius:6px;font-weight:700">✓ Aligné</span>';
            } else if (delta > 0) {
                gapClass = 'border-left:4px solid rgba(251,191,36,0.5);';
                gapBadge = '<span style="font-size:10px;background:rgba(251,191,36,0.2);color:#fde68a;padding:2px 8px;border-radius:6px;font-weight:700">↑ +' + Math.round(delta) + '</span>';
            } else {
                gapClass = 'border-left:4px solid rgba(96,165,250,0.5);';
                gapBadge = '<span style="font-size:10px;background:rgba(96,165,250,0.2);color:#93c5fd;padding:2px 8px;border-radius:6px;font-weight:700">↓ ' + Math.round(delta) + '</span>';
            }
        }
        const dataPills = m
            ? '<span class="cf-d-pill real">📊 ' + m.val + ' <span style="opacity:0.55;font-weight:400">· règle : ' + m.rule + '</span></span> ' + gapBadge
            : '';
        return '<div class="cf-detail-item" style="' + gapClass + '"><div class="cf-dq">' + (i+1) + '. ' + q.q + '</div><div class="cf-d-scores"><span class="cf-d-pill decl">✋ ' + declVal + '/5 — ' + declLabel + '</span>' + dataPills + '</div><div class="cf-d-explain">💡 ' + (advice || 'Continuez à progresser') + '</div></div>';
    }).join('');
    document.getElementById('cfModal').innerHTML = '<button class="cf-modal-close" onclick="closeCfModal()">✕</button><div class="cf-modal-header"><div class="cf-modal-icon">' + c.icon + '</div><div class="cf-modal-title">' + c.label + '</div></div><div class="cf-modal-section-title">Détail question par question</div>' + details;
    document.getElementById('cfOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}
function closeCfModal() { document.getElementById('cfOverlay').classList.remove('open'); document.body.style.overflow = ''; }

// ============================================
// PLAN D'ACCOMPAGNEMENT
// ============================================

const ACCOMPAGNEMENT_INLINE = {
  "D01": {
    "label": "Capacité à livrer plusieurs fois par semaine",
    "categorie": "Toolchain CI/CD",
    "niveaux": {
      "1": {"titre": "Livraisons rares ou manuelles", "actions": ["Atelier \"Notre premier pipeline\" : accompagner la squad à créer son premier déclencheur automatique sur merge dans main, même sans déploiement encore", "Session découverte de la CI/CD modulaire : présenter les templates disponibles et choisir ensemble le point de départ"]},
      "2": {"titre": "Pipeline automatique mais déploiement encore manuel", "actions": ["Session automatisation du déploiement : accompagner l'ajout de l'étape deploy dans le pipeline existant, avec un gate manuel au début si besoin", "Atelier feature flags : introduire le découplage déploiement/activation pour lever la peur de déployer souvent"]},
      "3": {"titre": "Déploiement possible mais fréquence insuffisante", "actions": ["Atelier découpage incrémental : apprendre à slicer les fonctionnalités pour que chaque merge soit déployable indépendamment", "Session \"Pourquoi livrer souvent ?\" : faire émerger les freins culturels et techniques qui limitent la fréquence"]}
    }
  },
  "D02": {
    "label": "Pipelines sans intervention manuelle",
    "categorie": "Toolchain CI/CD",
    "niveaux": {
      "1": {"titre": "Pipelines instables, échecs fréquents", "actions": ["Atelier \"Autopsie de nos échecs\" : catégoriser ensemble les 10 derniers échecs et identifier la cause dominante", "Session stabilisation prioritaire : attaquer ensemble la catégorie d'échec la plus fréquente — tests flaky, réseau, infra"]},
      "2": {"titre": "Quelques échecs récurrents identifiés", "actions": ["Session retry et résilience : mettre en place les retry automatiques sur les étapes réseau et les tests instables", "Atelier \"Nos tests dans le miroir\" : distinguer les vrais échecs des faux positifs et reprendre confiance dans le pipeline"]},
      "3": {"titre": "Pipeline majoritairement stable, quelques incidents", "actions": ["Session monitoring de la stabilité : mettre en place une alerte si le taux de succès descend sous 90%", "Atelier optimisation : identifier et éliminer les dernières causes d'échec intermittent"]}
    }
  },
  "D03": {
    "label": "Déploiements via la branche principale",
    "categorie": "Toolchain CI/CD",
    "niveaux": {
      "1": {"titre": "Déploiements depuis n'importe quelle branche", "actions": ["Session \"Pourquoi main ?\" : faire comprendre ensemble les risques et configurer immédiatement la restriction à main dans le .gitlab-ci.yml", "Atelier gouvernance des branches : co-construire les règles de nommage et de cycle de vie adaptées à la squad"]},
      "2": {"titre": "Majoritairement via main mais exceptions fréquentes", "actions": ["Session formalisation des exceptions : documenter ensemble les cas légitimes (hotfix, release) et créer un process pour chacun", "Atelier \"Nos déploiements hors main\" : identifier pourquoi les exceptions existent et les éliminer une par une"]},
      "3": {"titre": "Via main sauf cas documentés", "actions": ["Session automatisation de la vérification : configurer le pipeline pour refuser de s'exécuter hors main automatiquement"]}
    }
  },
  "D04": {
    "label": "Versioning avec releases taguées",
    "categorie": "Toolchain CI/CD",
    "niveaux": {
      "1": {"titre": "Aucun tag, aucune release", "actions": ["Atelier \"Notre première release\" : créer ensemble le premier tag et la première release GitLab, poser les bases du semantic versioning", "Session \"Pourquoi versionner ?\" : faire comprendre l'enjeu du versioning pour les équipes dépendantes"]},
      "2": {"titre": "Tags occasionnels, pas de convention", "actions": ["Session semantic versioning : adopter ensemble le standard vMAJOR.MINOR.PATCH et documenter quand on incrémente quoi", "Atelier automatisation des tags : configurer le pipeline pour créer le tag automatiquement sur chaque merge dans main"]},
      "3": {"titre": "Semver en place mais releases manuelles", "actions": ["Session automatisation du changelog : mettre en place la génération automatique du changelog depuis les commits ou titres de MR"]}
    }
  },
  "D05": {
    "label": "Pipeline en moins de 15 minutes",
    "categorie": "Toolchain CI/CD",
    "niveaux": {
      "1": {"titre": "Pipeline très long (30+ min)", "actions": ["Atelier \"Anatomie de notre pipeline\" : mesurer ensemble la durée de chaque stage et identifier le goulot principal", "Session cache des dépendances : mettre en place le cache node_modules/.m2/pip — souvent 5 à 10 min de gagnées immédiatement"]},
      "2": {"titre": "Pipeline long (15-30 min)", "actions": ["Session parallélisation : identifier les stages indépendants et les faire tourner en parallèle", "Atelier optimisation Docker : réduire l'empreinte des images — multi-stage build, images slim, layers cachées"]},
      "3": {"titre": "Pipeline correct (10-15 min)", "actions": ["Session quality gates : ancrer les seuils de durée dans le pipeline et alerter si ça dérive", "Session mise en place des indicateurs : suivre la durée dans le temps et célébrer les progrès avec la squad"]}
    }
  },
  "Q01": {
    "label": "MR revues et mergées en moins de 48h",
    "categorie": "Processus Merge",
    "diagnostic": "Session diagnostic du process MR actuel : cartographier ensemble le cycle de vie d'une MR de l'ouverture au merge, identifier les frictions et questionner les habitudes installées",
    "niveaux": {
      "1": {"titre": "MR qui traînent des semaines", "actions": ["Atelier \"Nos MR dans le miroir\" : visualiser ensemble les temps de review réels et prendre conscience collectivement de l'impact sur la vélocité", "Session mise en place d'un SLA de review : co-décider d'un premier retour obligatoire sous 24h et d'un merge sous 48h"]},
      "2": {"titre": "Review en quelques jours, pas systématiquement rapide", "actions": ["Session rappels automatiques : configurer ensemble les notifications après 24h sans review et l'escalade après 48h", "Atelier \"Pourquoi nos MR traînent ?\" : identifier les vraies causes — MR trop grosses, reviewer absent, sujet complexe"]},
      "3": {"titre": "Majorité sous 48h, quelques exceptions", "actions": ["Session analyse des exceptions : comprendre ensemble pourquoi certaines MR dépassent le SLA et traiter chaque cause"]}
    }
  },
  "Q02": {
    "label": "Review par au moins 2 personnes",
    "categorie": "Processus Merge",
    "niveaux": {
      "1": {"titre": "Pas de règle d'approbation ou auteur peut s'approuver", "actions": ["Session \"Pourquoi 2 approbateurs ?\" : faire comprendre ensemble l'enjeu du principe des 4 yeux en contexte bancaire", "Atelier configuration des règles : activer ensemble les règles d'approbation dans GitLab — 2 approbateurs minimum, auteur exclu"]},
      "2": {"titre": "1 approbateur, auteur exclu", "actions": ["Session passage à 2 approbateurs : accompagner la squad à configurer et accepter la règle des 2 approbateurs", "Atelier \"Prevent approvals by committers\" : comprendre et activer ensemble le paramètre complémentaire"]},
      "3": {"titre": "2 approbateurs mais règles non complètes", "actions": ["Session finalisation des règles : activer ensemble \"Reset approvals on push\" et \"Prevent editing approval rules\""]}
    }
  },
  "Q03": {
    "label": "Code reviews avec échanges constructifs",
    "categorie": "Processus Merge",
    "niveaux": {
      "1": {"titre": "Reviews = un LGTM et c'est mergé", "actions": ["Atelier \"Qu'est-ce qu'une bonne review ?\" : faire émerger collectivement les critères d'une review utile et co-construire une charte de la code review", "Session pratique de review en binôme : s'exercer ensemble sur de vraies MR et observer les réflexes"]},
      "2": {"titre": "Quelques commentaires mais superficiels", "actions": ["Atelier feedback constructif : travailler la posture du reviewer — questionner plutôt qu'imposer, expliquer le \"pourquoi\"", "Session \"Nos meilleures reviews\" : identifier ensemble des exemples de bonnes reviews dans l'historique et les partager"]},
      "3": {"titre": "Discussions de fond sur certaines MR seulement", "actions": ["Session systématisation : co-décider que chaque review comporte au minimum 1 commentaire constructif", "Atelier mentorat par la review : utiliser les reviews comme outil de montée en compétence des juniors"]}
    }
  },
  "Q04": {
    "label": "MR découpées en petits changements incrémentaux",
    "categorie": "Processus Merge",
    "niveaux": {
      "1": {"titre": "MR de 500+ lignes régulièrement", "actions": ["Atelier \"Pourquoi découper ?\" : faire prendre conscience ensemble de l'impact des grosses MR sur la qualité de review", "Session feature slicing : apprendre à découper une fonctionnalité avant de coder — backend, API, front en MR séparées"]},
      "2": {"titre": "MR variables, parfois très grosses", "actions": ["Atelier découpage incrémental : s'exercer ensemble sur une US en cours et la découper en 2-3 MR autonomes", "Session \"Notre règle des 200 lignes\" : co-décider d'un seuil et des mécanismes de rappel adaptés à la squad"]},
      "3": {"titre": "Majorité de MR raisonnables, quelques grosses", "actions": ["Session identification des patterns : comprendre ensemble quels types de sujets produisent des grosses MR et les anticiper"]}
    }
  },
  "Q05": {
    "label": "Impossible de merger sans approbation",
    "categorie": "Processus Merge",
    "niveaux": {
      "1": {"titre": "Merge possible sans aucune approbation", "actions": ["Session activation immédiate : configurer ensemble la protection dans Settings > Merge request approvals", "Atelier \"Nos merges sans review\" : visualiser ensemble les MR mergées sans approbation et mesurer le risque"]},
      "2": {"titre": "Protection activée mais contournable", "actions": ["Session \"Prevent editing approval rules\" : comprendre et activer ensemble la règle qui empêche de contourner les approbations", "Atelier audit des exceptions : identifier qui merge sans approbation et pourquoi"]},
      "3": {"titre": "Protection solide, quelques exceptions admin", "actions": ["Session code owners : accompagner la squad à configurer des approbateurs spécifiques sur les fichiers critiques"]}
    }
  },
  "S01": {
    "label": "Échecs de pipeline traités immédiatement comme priorité bloquante",
    "categorie": "Stabilité Pipeline",
    "niveaux": {
      "1": {"titre": "Pipelines rouges ignorés pendant des jours", "actions": ["Atelier \"Notre culture face aux échecs\" : faire émerger comment la squad réagit aujourd'hui à un pipeline rouge", "Session stop-the-line : co-construire et ancrer la règle — pipeline rouge = plus aucun merge jusqu'au fix", "Mise en place des notifications automatiques : pipeline rouge → message immédiat dans le canal squad"]},
      "2": {"titre": "Réaction lente, pas de responsable clair", "actions": ["Session \"Qui est responsable ?\" : co-définir que le dernier committer est responsable du fix ou du revert", "Atelier notification avec responsable : configurer l'alerte pipeline rouge avec le nom du committer"]},
      "3": {"titre": "Bonne réactivité mais pas systématique", "actions": ["Session mesure du MTTR : mettre en place le suivi du temps entre l'échec et le fix (objectif < 2h)"]}
    }
  },
  "S02": {
    "label": "Taux de succès pipeline stable dans le temps",
    "categorie": "Stabilité Pipeline",
    "niveaux": {
      "1": {"titre": "Taux de succès en dents de scie", "actions": ["Session \"Lire nos métriques\" : apprendre ensemble à visualiser la tendance du taux de succès sur les 3 derniers mois", "Atelier \"Qu'est-ce qui a changé ?\" : analyser ensemble les baisses — nouvelle dépendance, nouveau test, migration"]},
      "2": {"titre": "Tendance identifiée mais pas d'action", "actions": ["Session alerte automatique : configurer une notification si le taux baisse de plus de 5% vs la semaine précédente", "Atelier \"Nos KPIs de stabilité\" : co-définir un objectif de 90% minimum et en faire un KPI d'équipe affiché"]},
      "3": {"titre": "Suivi hebdomadaire, réactions quand ça baisse", "actions": ["Session objectif 95% : challenger la squad à dépasser le seuil de confort et documenter les actions qui font la différence"]}
    }
  },
  "S03": {
    "label": "Pipeline corrigé en moins de 2 heures",
    "categorie": "Stabilité Pipeline",
    "niveaux": {
      "1": {"titre": "Correction en plusieurs jours", "actions": ["Atelier \"Comment on réagit quand ça casse ?\" : rejouer ensemble un incident récent et identifier les frictions de diagnostic", "Session process d'urgence : co-définir — le committer a 2h pour fix ou revert, le binôme prend le relais sinon", "Session logs et diagnostic : améliorer ensemble la lisibilité des messages d'erreur pour réduire le temps de diagnostic"]},
      "2": {"titre": "Correction le jour même, pas en 2h", "actions": ["Co-construction du playbook : documenter ensemble les 5 causes d'échec les plus fréquentes et leur fix associé", "Atelier \"Qui est responsable après 17h ?\" : clarifier les rôles et le SLA de fix en dehors des heures ouvrées"]},
      "3": {"titre": "Correction en quelques heures", "actions": ["Session revert automatique : explorer ensemble la mise en place d'un revert automatique si le pipeline reste rouge après 2h"]}
    }
  },
  "S04": {
    "label": "Échecs de pipeline isolés, jamais plus de 2 consécutifs",
    "categorie": "Stabilité Pipeline",
    "niveaux": {
      "1": {"titre": "Séries d'échecs fréquentes (3+ consécutifs)", "actions": ["Session activation de \"Pipelines must succeed\" : comprendre l'impact et configurer ensemble la protection dans Settings > Merge requests", "Atelier \"Nos séries d'échecs dans le miroir\" : visualiser ensemble les séries passées et identifier les patterns"]},
      "2": {"titre": "Quelques séries, pas systématiquement bloquant", "actions": ["Session check pre-merge : configurer le pipeline pour refuser un merge si la branche est rouge", "Atelier analyse des séries : comprendre ensemble ce qui déclenche les séries — même cause ou causes différentes"]},
      "3": {"titre": "Séries rares, maximum 2 consécutifs", "actions": ["Session alerte signal faible : configurer une alerte dès qu'une série de 2 apparaît pour intervenir avant que ça s'aggrave"]}
    }
  },
  "H01": {
    "label": "Branches mergées ou abandonnées supprimées régulièrement",
    "categorie": "Hygiène & Gouvernance",
    "diagnostic": "Session diagnostic de l'état du repo : parcourir ensemble l'état des branches, fichiers et settings, faire émerger ce qui freine ou inquiète l'équipe",
    "niveaux": {
      "1": {"titre": "Branches jamais nettoyées (50+)", "actions": ["Session activation de la suppression automatique : configurer ensemble la suppression de la branche source après merge", "Atelier nettoyage one-shot : passer ensemble en revue toutes les branches et décider — merge, fermer ou garder"]},
      "2": {"titre": "Suppression auto activée mais historique sale", "actions": ["Session nettoyage de l'existant : accompagner la squad à supprimer toutes les branches sans commit depuis 30+ jours", "Atelier conventions de nommage : co-construire des règles de nommage pour identifier rapidement les branches à nettoyer"]},
      "3": {"titre": "Nettoyage régulier, quelques branches oubliées", "actions": ["Session automatisation des alertes : mettre en place un job hebdomadaire qui liste les branches stale et notifie les auteurs"]}
    }
  },
  "H02": {
    "label": "Fichiers de lock de dépendances versionnés",
    "categorie": "Hygiène & Gouvernance",
    "niveaux": {
      "1": {"titre": "Pas de fichiers de lock", "actions": ["Session \"Pourquoi les lock files ?\" : sensibiliser ensemble aux risques des builds non reproductibles", "Atelier mise en place des lock files : accompagner la squad à générer et commiter les lock files pour chaque écosystème"]},
      "2": {"titre": "Lock files partiels", "actions": ["Session audit des écosystèmes : vérifier ensemble chaque écosystème — Node, Python, Java, Go — et compléter les manquants", "Atelier .gitignore : vérifier que les lock files ne sont pas ignorés accidentellement"]},
      "3": {"titre": "Lock files présents mais parfois non mis à jour", "actions": ["Session Renovate/Dependabot : mettre en place les mises à jour automatiques avec MR dédiées"]}
    }
  },
  "H03": {
    "label": "Branche principale protégée contre le force push",
    "categorie": "Hygiène & Gouvernance",
    "niveaux": {
      "1": {"titre": "Branche non protégée", "actions": ["Session activation immédiate : configurer ensemble la protection dans Settings > Repository > Protected branches", "Atelier \"Les risques du force push\" : comprendre ensemble ce qu'un force push peut détruire sur un repo de prod"]},
      "2": {"titre": "Branche protégée mais force push autorisé", "actions": ["Session désactivation du force push : accompagner la squad à désactiver l'option et comprendre pourquoi c'est non négociable"]},
      "3": {"titre": "Protection basique en place", "actions": ["Session niveaux d'accès : configurer ensemble push = No one, merge = Maintainers uniquement"]}
    }
  },
  "H04": {
    "label": "Fichiers essentiels présents (README, .gitignore, CHANGELOG)",
    "categorie": "Hygiène & Gouvernance",
    "niveaux": {
      "1": {"titre": "Aucun fichier standard", "actions": ["Atelier \"Notre repo a une identité\" : co-construire ensemble un README minimal — nom, description, comment lancer, comment contribuer", "Session .gitignore : créer ensemble un .gitignore adapté à leur stack technique"]},
      "2": {"titre": "1 ou 2 fichiers présents", "actions": ["Atelier enrichissement du README : ajouter ensemble l'architecture, les dépendances, les contacts", "Session CHANGELOG : créer le fichier et co-décider du processus de mise à jour à chaque release"]},
      "3": {"titre": "Fichiers présents mais non maintenus", "actions": ["Session automatisation du CHANGELOG : mettre en place la génération automatique depuis les commits ou MR", "Atelier CONTRIBUTING.md : co-rédiger ensemble le guide d'onboarding des nouveaux contributeurs"]}
    }
  },
  "H05": {
    "label": "MR ouvertes traitées sous 7 jours",
    "categorie": "Hygiène & Gouvernance",
    "niveaux": {
      "1": {"titre": "MR ouvertes depuis des semaines ou mois", "actions": ["Atelier tri des MR zombies : passer ensemble en revue chaque MR ouverte et décider — merge, close ou relance", "Session \"Pourquoi nos MR s'accumulent ?\" : faire émerger les vraies causes et co-construire des règles de traitement"]},
      "2": {"titre": "Quelques MR zombies identifiées", "actions": ["Session rappels automatiques : configurer une notification au reviewer si une MR n'a pas de review après 3 jours", "Atelier rituel de tri hebdomadaire : instaurer un point de 10 min en daily pour traiter les MR en attente"]},
      "3": {"titre": "Nettoyage régulier, quelques oublis", "actions": ["Session mesure du cycle time : mettre en place le suivi du temps moyen de l'ouverture au merge (objectif < 3 jours)"]}
    }
  },
  "R01": {
    "label": "Au moins 2 personnes capables d'intervenir sur chaque repo",
    "categorie": "Résilience & Bus Factor",
    "diagnostic": "Session diagnostic de la connaissance partagée : cartographier ensemble qui sait quoi sur quels repos, faire émerger les zones de fragilité et les dépendances silencieuses",
    "niveaux": {
      "1": {"titre": "1 seule personne connaît le repo", "actions": ["Atelier \"Et si untel partait demain ?\" : simuler ensemble la perte du membre clé et prendre conscience collectivement du risque", "Session pair programming ciblé : accompagner des binômes sur les zones critiques pour diffuser la connaissance en faisant"]},
      "2": {"titre": "2 personnes mais la seconde connaît peu", "actions": ["Atelier rotation sur les US : assigner délibérément des US à la deuxième personne sur ce repo", "Session documentation des zones critiques : formaliser ce que seul l'expert sait aujourd'hui"]},
      "3": {"titre": "2-3 personnes, couverture partielle", "actions": ["Atelier plan de continuité : co-construire un plan de backup — qui remplace qui, sur quoi, dans quel délai"]}
    }
  },
  "R02": {
    "label": "Charge de travail répartie équitablement",
    "categorie": "Résilience & Bus Factor",
    "niveaux": {
      "1": {"titre": "1 dev fait 70%+ des commits", "actions": ["Atelier \"Notre répartition dans le miroir\" : visualiser ensemble la concentration des commits et mesurer le risque", "Session répartition des US : assigner la prochaine US à quelqu'un d'autre que le contributeur principal"]},
      "2": {"titre": "Répartition déséquilibrée mais consciente", "actions": ["Atelier rotation volontaire : co-construire un principe de rotation des sujets pour diversifier les zones de connaissance", "Session \"Le héros devient mentor\" : accompagner le contributeur principal à transmettre plutôt qu'à faire"]},
      "3": {"titre": "Répartition correcte, quelques pics", "actions": ["Session mesure de la concentration : suivre le ratio du top contributeur et alerter si ça dépasse 40%"]}
    }
  },
  "R03": {
    "label": "Reviews faites par des personnes variées",
    "categorie": "Résilience & Bus Factor",
    "niveaux": {
      "1": {"titre": "Toujours le même reviewer", "actions": ["Session \"Pourquoi diversifier les reviews ?\" : faire comprendre ensemble l'enjeu de la diffusion de connaissance par la review", "Atelier rotation des reviewers : mettre en place un système de round-robin pour l'assignation des reviews"]},
      "2": {"titre": "2 reviewers mais toujours les mêmes", "actions": ["Session formation à la review : accompagner d'autres membres de la squad à prendre le rôle de reviewer sur des MR simples", "Atelier \"Les juniors reviewent les seniors\" : lever ensemble le frein hiérarchique dans la pratique de review"]},
      "3": {"titre": "Diversité partielle", "actions": ["Session review cross-squad : organiser des reviews croisées avec une squad voisine pour apporter un regard externe"]}
    }
  },
  "R04": {
    "label": "Activité régulière sur le repo",
    "categorie": "Résilience & Bus Factor",
    "niveaux": {
      "1": {"titre": "Longues périodes d'inactivité (2+ semaines)", "actions": ["Atelier \"Notre rythme de contribution\" : visualiser ensemble les gaps d'activité et identifier les causes", "Session découpage en petits incréments : apprendre à commiter quotidiennement plutôt qu'en un gros batch"]},
      "2": {"titre": "Activité irrégulière, rushes puis silences", "actions": ["Session planification en petites itérations : co-construire des US de 1-2 jours max pour créer un flux naturel de commits", "Atelier \"Nos US dans le miroir\" : visualiser ensemble la taille des US et leur impact sur la régularité du flux"]},
      "3": {"titre": "Activité globalement régulière, quelques gaps", "actions": ["Session identification des gaps légitimes : distinguer les gaps acceptables (congés) des gaps problématiques (blocages) et traiter ces derniers"]}
    }
  },
  "C01": {
    "label": "Rituels communs entre Dev, Ops et parties prenantes",
    "categorie": "Culture & Rituels",
    "niveaux": {
      "1": {"titre": "Aucun rituel commun", "actions": ["Atelier \"Notre premier daily\" : accompagner la squad à instaurer un daily standup de 15 min max avec Dev + Ops", "Session \"Pourquoi des rituels ?\" : faire comprendre ensemble la valeur des rituels comme ciment de la collaboration"]},
      "2": {"titre": "Rituels naissants mais irréguliers", "actions": ["Session formalisation des rituels : bloquer des créneaux fixes dans les agendas et co-construire un format standard", "Atelier inclusion des parties prenantes : élargir progressivement les rituels à QA, sécu, produit"]},
      "3": {"titre": "Rituels en place mais pas toutes les parties prenantes", "actions": ["Session mesure de l'efficacité : co-évaluer si les blocages remontés en daily sont résolus dans la journée et ajuster le format"]}
    }
  },
  "C02": {
    "label": "Outils collaboratifs utilisés efficacement",
    "categorie": "Culture & Rituels",
    "niveaux": {
      "1": {"titre": "Outils utilisés de façon chaotique", "actions": ["Atelier \"Notre inventaire outillage\" : lister ensemble tous les outils utilisés, identifier les doublons et les usages qui se chevauchent", "Session \"Un outil, un usage\" : co-décider des conventions — quel outil pour quel usage"]},
      "2": {"titre": "Outils identifiés mais pas de conventions", "actions": ["Session documentation des conventions : formaliser en 1 page les règles d'usage et les partager avec toute la squad", "Atelier audit d'adoption : identifier qui utilise quoi et former les récalcitrants"]},
      "3": {"titre": "Conventions définies mais adoption partielle", "actions": ["Session automatisation : mettre en place les notifications croisées, les liens automatiques entre outils et les templates"]}
    }
  },
  "C03": {
    "label": "Informations critiques circulent rapidement et clairement",
    "categorie": "Culture & Rituels",
    "niveaux": {
      "1": {"titre": "Les infos critiques arrivent tard ou pas du tout", "actions": ["Atelier \"Notre canal incidents\" : créer ensemble un canal dédié aux incidents avec un template de communication standard", "Session \"Quand et comment communiquer ?\" : co-construire un protocole de communication de crise adapté à la squad"]},
      "2": {"titre": "Communication réactive mais désorganisée", "actions": ["Session template d'incident : formaliser ensemble le format — quoi, impact, qui gère, ETA — et l'imposer comme standard", "Atelier proactivité : instaurer un point hebdo de 5 min sur les risques identifiés et les dépendances à venir"]},
      "3": {"titre": "Bonne communication réactive, faible proactivité", "actions": ["Session \"Angles morts\" : identifier ensemble qui ne reçoit pas les infos — nouveaux, mi-temps, externes — et les inclure"]}
    }
  },
  "C04": {
    "label": "Rôles et responsabilités bien compris et partagés",
    "categorie": "Culture & Rituels",
    "niveaux": {
      "1": {"titre": "Rôles flous, chacun fait un peu tout", "actions": ["Atelier RACI : co-construire ensemble une matrice RACI sur les 10 activités clés de la squad en 30 min", "Session \"Qui décide quoi ?\" : clarifier les décisions clés — qui valide un merge, qui contacte le support N3"]},
      "2": {"titre": "Rôles définis mais pas partagés", "actions": ["Session affichage de la RACI : rendre la matrice visible et accessible, l'intégrer à l'onboarding des nouveaux", "Atelier zones grises : identifier et clarifier les responsabilités sur les sujets transverses"]},
      "3": {"titre": "Rôles partagés, revus occasionnellement", "actions": ["Session revue trimestrielle : instaurer une revue de la RACI à chaque changement d'équipe ou de périmètre"]}
    }
  },
  "C05": {
    "label": "Backlog intègre les besoins techniques et opérationnels",
    "categorie": "Culture & Rituels",
    "niveaux": {
      "1": {"titre": "Backlog 100% fonctionnel, zéro technique", "actions": ["Atelier \"Notre backlog est-il complet ?\" : faire émerger ce qui manque côté technique, sécu et ops", "Session négociation avec le PO : accompagner la squad à défendre un quota minimum de 20% pour le technique"]},
      "2": {"titre": "Quelques sujets techniques mais pas systématiques", "actions": ["Session quota technique : formaliser un engagement de 20% minimum par sprint, non négociable", "Atelier \"US techniques bien rédigées\" : apprendre à écrire des US techniques avec de la valeur visible pour le PO"]},
      "3": {"titre": "Quota respecté mais pas d'US ops/sécu", "actions": ["Session élargissement du backlog : intégrer systématiquement les sujets sécu (scan, dépendances) et ops (monitoring, alerting)"]}
    }
  },
  "C06": {
    "label": "Dépendances inter-squads anticipées et coordonnées",
    "categorie": "Culture & Rituels",
    "niveaux": {
      "1": {"titre": "Dépendances découvertes au dernier moment", "actions": ["Atelier cartographie des dépendances : identifier ensemble toutes les dépendances externes et les rendre visibles", "Session synchro inter-squads : instaurer un point bimensuel de 15 min avec les squads dont on dépend"]},
      "2": {"titre": "Dépendances identifiées mais pas de coordination", "actions": ["Session intégration au sprint planning : pour chaque US, identifier \"de qui dépend-on ?\" et traiter les flous comme des risques", "Atelier SLA de réponse : négocier ensemble des engagements de réponse avec les squads dépendantes"]},
      "3": {"titre": "Coordination en place, quelques surprises encore", "actions": ["Session contrats d'interface : documenter ensemble les interfaces exposées pour que les autres squads puissent s'y fier"]}
    }
  },
  "C07": {
    "label": "DevOps Reviews régulières avec actions concrètes",
    "categorie": "Culture & Rituels",
    "niveaux": {
      "1": {"titre": "Aucune DevOps Review", "actions": ["Accompagnement DevOps Review : co-construire le format, le rythme et les indicateurs de la première DevOps Review", "Session \"Notre première DevOps Review\" : animer ensemble la première session et poser 3 actions concrètes pour le mois suivant"]},
      "2": {"titre": "Reviews occasionnelles sans suivi", "actions": ["Session formalisation du template : métriques clés, incidents marquants, actions passées, prochaines actions", "Atelier suivi des actions : chaque action a un responsable et une deadline — on commence à la prochaine session"]},
      "3": {"titre": "Reviews régulières mais actions pas toujours suivies", "actions": ["Session ouverture au management : préparer ensemble une DevOps Review pour le management — métriques, progrès, blocages"]}
    }
  },
  "C08": {
    "label": "Sécurité psychologique — liberté de partager et d'admettre les erreurs",
    "categorie": "Culture & Rituels",
    "niveaux": {
      "1": {"titre": "Peur de parler, culture du blâme", "actions": ["Atelier blameless culture : introduire le post-mortem sans blame sur un incident récent — zéro nom, que le système", "Session \"On parle du système, jamais des gens\" : ancrer la règle et la pratiquer ensemble sur un cas concret"]},
      "2": {"titre": "Ouverture naissante mais fragile", "actions": ["Atelier valorisation publique : apprendre à remercier explicitement celui qui remonte un problème", "Session rétrospective anonyme : utiliser des formats anonymes pour vérifier que tout le monde se sent vraiment libre"]},
      "3": {"titre": "Bonne ouverture dans la squad, plus difficile avec l'extérieur", "actions": ["Session extension de la sécurité psychologique : travailler la posture dans les interactions inter-squads et avec le management"]}
    }
  },
  "C09": {
    "label": "Partage de retours d'expérience avec d'autres équipes",
    "categorie": "Culture & Rituels",
    "niveaux": {
      "1": {"titre": "Aucun partage externe", "actions": ["Session \"Notre premier lightning talk\" : identifier un sujet maîtrisé et préparer ensemble un talk de 10 min pour une squad voisine", "Atelier \"Qu'est-ce qu'on sait faire ?\" : faire émerger les expertises de la squad qui pourraient intéresser d'autres équipes"]},
      "2": {"titre": "Partage ponctuel, pas systématique", "actions": ["Session REX trimestriel : planifier ensemble un format court et l'inscrire dans le calendrier", "Atelier documentation du savoir : publier un résumé des REX sur Confluence pour élargir l'audience"]},
      "3": {"titre": "REX réguliers mais audience limitée", "actions": ["Session élargissement de l'audience : inviter d'autres tribus et co-construire un format bidirectionnel d'échange"]}
    }
  },
  "C10": {
    "label": "Maîtrise du calendrier de livraison",
    "categorie": "Culture & Rituels",
    "niveaux": {
      "1": {"titre": "Calendrier dicté par les autres", "actions": ["Atelier \"Nos contraintes dans le miroir\" : lister ensemble tout ce qui empêche de livrer quand on veut", "Session négociation des SLA : pour chaque contrainte externe, demander un SLA ou un process de fast-track"]},
      "2": {"titre": "Quelques marges de manœuvre mais beaucoup de contraintes", "actions": ["Atelier automatisation des validations : identifier les validations manuelles qui peuvent être automatisées", "Session workarounds documentés : formaliser les contournements pour les contraintes incompressibles"]},
      "3": {"titre": "Autonomie partielle, certains sujets encore bloquants", "actions": ["Session identification des goulots résiduels : traiter un par un les derniers points de blocage et mesurer le gain d'autonomie"]}
    }
  },
  "P01": {
    "label": "Utilisation de feature flags",
    "categorie": "Pratiques DevOps",
    "niveaux": {
      "1": {"titre": "Aucun feature flag", "actions": ["Atelier \"Déployer sans activer\" : introduire le concept de feature flag et montrer ce que ça change dans le quotidien de la squad", "Session premier flag : accompagner la squad à mettre en place son premier feature flag sur une vraie fonctionnalité en cours"]},
      "2": {"titre": "Quelques flags informels (variables d'env)", "actions": ["Session structuration : accompagner la squad à adopter un outil de feature flags adapté à leur contexte", "Atelier \"Nos flags actuels\" : inventorier les variables d'env existantes et les migrer vers un système structuré"]},
      "3": {"titre": "Feature flags en place, usage occasionnel", "actions": ["Session systématisation : co-décider que toute nouvelle fonctionnalité visible passe par un flag", "Atelier targeting : introduire l'activation par utilisateur, par pourcentage, par environnement"]}
    }
  },
  "P02": {
    "label": "Feature flags obsolètes nettoyés régulièrement",
    "categorie": "Pratiques DevOps",
    "niveaux": {
      "1": {"titre": "Flags jamais nettoyés", "actions": ["Session \"Nos flags dans le miroir\" : inventorier ensemble tous les flags et identifier les zombies", "Atelier nettoyage one-shot : supprimer ensemble les flags zombies identifiés"]},
      "2": {"titre": "Nettoyage ponctuel", "actions": ["Session rituel trimestriel : instaurer une revue régulière des flags et co-décider des critères de suppression", "Atelier date d'expiration : ajouter une date d'expiration à chaque nouveau flag dès sa création"]},
      "3": {"titre": "Nettoyage régulier, quelques oublis", "actions": ["Session automatisation : mettre en place un job qui scanne les flags expirés et crée une MR de nettoyage automatiquement"]}
    }
  },
  "P03": {
    "label": "Versions de dépendances fixées (pas de LATEST, SNAPSHOT, ranges)",
    "categorie": "Pratiques DevOps",
    "niveaux": {
      "1": {"titre": "Versions dynamiques partout", "actions": ["Atelier \"SNAPSHOT en prod : le risque invisible\" : sensibiliser ensemble aux dangers des versions non fixées", "Session fixation immédiate : remplacer ensemble chaque SNAPSHOT et range par la version exacte actuelle"]},
      "2": {"titre": "Majorité fixée, quelques SNAPSHOT résiduels", "actions": ["Session \"Avant chaque release\" : co-décider que tout SNAPSHOT doit être fixé avant toute mise en prod", "Atelier Renovate/Dependabot : mettre en place les MR automatiques de mise à jour de dépendances"]},
      "3": {"titre": "Versions fixées, pas de processus de mise à jour", "actions": ["Session scan de vulnérabilités : ajouter un scan de dépendances dans le pipeline pour détecter les CVE"]}
    }
  },
  "P04": {
    "label": "Pipeline inclut des stages dédiés aux tests, lint et sécurité",
    "categorie": "Pratiques DevOps",
    "niveaux": {
      "1": {"titre": "Pipeline = build seulement", "actions": ["Atelier \"Qu'est-ce qu'un pipeline complet ?\" : faire découvrir ensemble les 3 stages fondamentaux — test, lint, sécu", "Session premier test dans le pipeline : ajouter ensemble 1 test unitaire et un stage test dans le .gitlab-ci.yml"]},
      "2": {"titre": "Build + tests, pas de lint ni sécu", "actions": ["Session ajout du linter : choisir ensemble un linter adapté à leur stack et l'intégrer dans le pipeline", "Atelier scan de sécurité : intégrer un SAST ou un scan de dépendances en utilisant les templates GitLab disponibles"]},
      "3": {"titre": "2 stages présents, le 3ème manquant", "actions": ["Session complétion et quality gates : ajouter le stage manquant et définir des seuils bloquants"]}
    }
  },
  "P05": {
    "label": "Configuration CI/CD versionnée dans le repo",
    "categorie": "Pratiques DevOps",
    "niveaux": {
      "1": {"titre": "Pas de .gitlab-ci.yml", "actions": ["Atelier \"Notre pipeline existe-t-il vraiment ?\" : prendre conscience ensemble de ce que l'absence de CI versionnée implique", "Session création du premier fichier : créer ensemble un .gitlab-ci.yml minimal avec un stage build et le commiter"]},
      "2": {"titre": "Fichier CI présent mais non maintenu", "actions": ["Atelier \"Notre CI comme du code\" : apprendre à reviewer le .gitlab-ci.yml dans les MR comme n'importe quel code", "Session factorisation : utiliser des templates partagés pour les stages communs et éviter la duplication"]},
      "3": {"titre": "CI versionnée et maintenue", "actions": ["Session tests sur la CI : mettre en place une validation du pipeline sur une branche avant de merger dans main"]}
    }
  },
  "X01": {"label": "Branche principale protégée", "categorie": "Sécurité", "securite": true, "action": "Mise en conformité sécurité : activation du setting obligatoire — branch protection"},
  "X02": {"label": "Force push interdit sur la branche principale", "categorie": "Sécurité", "securite": true, "action": "Mise en conformité sécurité : activation du setting obligatoire — interdiction du force push"},
  "X03": {"label": "Auteur empêché d'approuver sa propre MR", "categorie": "Sécurité", "securite": true, "action": "Mise en conformité sécurité : activation du setting obligatoire — Prevent approval by author"},
  "X04": {"label": "Contributeurs empêchés d'approuver leurs commits", "categorie": "Sécurité", "securite": true, "action": "Mise en conformité sécurité : activation du setting obligatoire — Prevent approvals by users who add commits"},
  "X05": {"label": "Approbations invalidées après un nouveau push", "categorie": "Sécurité", "securite": true, "action": "Mise en conformité sécurité : activation du setting obligatoire — Remove all approvals when commits are added"}
};

let ACCOMPAGNEMENT_DATA = null;

async function loadAccompagnement() {
    if (ACCOMPAGNEMENT_DATA) return ACCOMPAGNEMENT_DATA;
    ACCOMPAGNEMENT_DATA = ACCOMPAGNEMENT_INLINE;
    return ACCOMPAGNEMENT_DATA;
}

async function goActions() {
    showScreen('s-actions');
    await renderAccompaniments();
}

async function renderAccompaniments() {
    const acc = await loadAccompagnement();

    const items = QUESTIONS.map(q => {
        const declVal = answers[q.id] || null;
        const dataScore = q.metric ? (GITLAB_DATA[q.metric]?.score ?? null) : null;
        const metricData = q.metric ? GITLAB_DATA[q.metric] : null;
        return { ...q, declVal, dataScore, metricData };
    });

    const accompagnements = [];
    const diagnosticsAjoutes = new Set();

    items.forEach(item => {
        const qAcc = acc[item.id];
        if (!qAcc) return;

        if (qAcc.securite) {
            if (item.dataScore !== null && item.dataScore < 80) {
                accompagnements.push({
                    id: item.id,
                    title: qAcc.label,
                    categorie: qAcc.categorie,
                    dataPoint: item.metricData ? item.metricData.val : null,
                    actions: [{ id: `${item.id}#0`, text: qAcc.action, done: false }],
                    niveau: null,
                    niveauTitre: null,
                    isDiagnostic: false
                });
            }
            return;
        }

        let niveauDeclencheur = null;

        if (item.declVal !== null && item.declVal <= 3) {
            niveauDeclencheur = item.declVal;
        }

        if (item.dataScore !== null && item.dataScore <= 60) {
            const niveauData = item.dataScore <= 20 ? 1 : item.dataScore <= 40 ? 2 : 3;
            if (niveauDeclencheur === null || niveauData < niveauDeclencheur) {
                niveauDeclencheur = niveauData;
            }
        }

        if (niveauDeclencheur === null) return;

        const niveauKey = String(Math.min(niveauDeclencheur, 3));
        const niveauInfo = qAcc.niveaux ? qAcc.niveaux[niveauKey] : null;
        if (!niveauInfo) return;

        if (qAcc.diagnostic && !diagnosticsAjoutes.has(item.cat)) {
            diagnosticsAjoutes.add(item.cat);
            const diagId = `diag-${item.cat}`;
            accompagnements.push({
                id: diagId,
                title: `Diagnostic — ${qAcc.categorie}`,
                categorie: qAcc.categorie,
                dataPoint: null,
                actions: [{ id: `${diagId}#0`, text: qAcc.diagnostic, done: false }],
                niveau: null,
                niveauTitre: null,
                isDiagnostic: true
            });
        }

        accompagnements.push({
            id: item.id,
            title: qAcc.label,
            categorie: qAcc.categorie,
            dataPoint: item.metricData ? `${item.metricData.val} · règle : ${item.metricData.rule}` : null,
            actions: niveauInfo.actions.map((a, i) => ({ id: `${item.id}#${i}`, text: a, done: false })),
            niveau: niveauDeclencheur,
            niveauTitre: niveauInfo.titre,
            isDiagnostic: false
        });
    });

    const categoriesMap = {};
    accompagnements.forEach(a => {
        if (!categoriesMap[a.categorie]) categoriesMap[a.categorie] = [];
        categoriesMap[a.categorie].push(a);
    });

    const totalActions = accompagnements.filter(a => !a.isDiagnostic).reduce((s,a) => s + a.actions.length, 0);
    document.getElementById('actionsStats').innerHTML = `<div class="as-pill"><span class="as-num">${Object.keys(categoriesMap).length}</span> Axes</div><div class="as-pill"><span class="as-num">${accompagnements.filter(a=>!a.isDiagnostic).length}</span> Accompagnements</div><div class="as-pill"><span class="as-num">${totalActions}</span> Actions</div><div class="as-pill"><span class="as-num">${selectedActions.size}</span> Sélectionnées</div>`;

    const catIcons = {
        'Toolchain CI/CD': '⚙️', 'Processus Merge': '🔒', 'Hygiène & Gouvernance': '🧹',
        'Sécurité': '🔐', 'Résilience & Bus Factor': '🚌', 'Culture & Rituels': '👥',
        'Stabilité Pipeline': '⚙️', 'Pratiques DevOps': '⚡'
    };

    let html = '';
    Object.entries(categoriesMap).forEach(([cat, catItems]) => {
        const icon = catIcons[cat] || '📋';
        html += `<div class="action-category"><div class="ac-header">${icon} ${cat}</div>`;
        catItems.forEach(item => {
            if (item.isDiagnostic) {
                html += `<div style="background:rgba(255,255,255,0.04);border-left:3px solid rgba(167,139,250,0.5);border-radius:10px;padding:12px 16px;margin-bottom:10px;">`;
                html += `<div style="font-size:11px;font-weight:700;opacity:0.5;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em;">🔍 Diagnostic</div>`;
                html += `<div class="action-item ${selectedActions.has(item.actions[0].id)?'selected':''}" data-aid="${item.actions[0].id}"><div class="ai-check"></div><div class="ai-content"><div class="ai-task">${item.actions[0].text}</div></div></div>`;
                html += `</div>`;
            } else {
                const niveauColor = item.niveau === 1 ? 'rgba(248,113,113,0.3)' : item.niveau === 2 ? 'rgba(251,191,36,0.3)' : 'rgba(96,165,250,0.3)';
                html += `<div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:14px 16px;margin-bottom:10px;">`;
                html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">`;
                html += `<div style="font-size:13px;font-weight:700;flex:1;">${item.title}</div>`;
                if (item.niveau) html += `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:${niveauColor}">Niveau ${item.niveau} — ${item.niveauTitre}</span>`;
                html += `</div>`;
                if (item.dataPoint) html += `<div style="font-size:11px;opacity:0.5;margin-bottom:8px;">📊 ${item.dataPoint}</div>`;
                item.actions.forEach(action => {
                    html += `<div class="action-item ${selectedActions.has(action.id)?'selected':''}" data-aid="${action.id}"><div class="ai-check"></div><div class="ai-content"><div class="ai-task">${action.text}</div></div></div>`;
                });
                html += `</div>`;
            }
        });
        html += `</div>`;
    });

    if (accompagnements.length === 0) html = `<div style="text-align:center;padding:60px;"><div style="font-size:48px;">🏆</div><div style="font-size:20px;font-weight:700;">Félicitations !</div><div>Aucun accompagnement détecté — squad au top !</div></div>`;
    document.getElementById('actionsList').innerHTML = html;
}

// Délégation d'événement : un seul listener attaché sur #actionsList,
// indépendant du contenu du texte (zéro souci d'échappement).
(function attachActionListDelegation() {
    const list = document.getElementById('actionsList');
    if (!list || list.dataset.delegated === '1') return;
    list.addEventListener('click', (e) => {
        const item = e.target.closest('.action-item[data-aid]');
        if (!item || !list.contains(item)) return;
        const aid = item.dataset.aid;
        if (selectedActions.has(aid)) selectedActions.delete(aid);
        else selectedActions.add(aid);
        renderAccompaniments();
    });
    list.dataset.delegated = '1';
})();


// ============================================
// EXPORT HTML — Plan d'accompagnement standalone
// ============================================
// Génère un fichier HTML autonome (téléchargement direct).
// Le HTML sémantique (h1/h2/h3/ul/li/strong) permet le copier-coller
// dans Confluence/Jira/Word avec préservation de la structure.

function exportActionPlan() {
    // ---- Métadonnées ----
    const squad = (document.getElementById('inSquad').value || 'Squad').trim();
    const tribu = (document.getElementById('inTribu').value || '—').trim();
    const date  = document.getElementById('inDate').value || new Date().toISOString().split('T')[0];
    const score = parseInt(document.getElementById('rhScore').textContent, 10) || 0;
    const level = document.getElementById('rhLevel').textContent.trim() || '—';

    // ---- Collecte des actions, par catégorie (cochées + non cochées) ----
    const categoriesMap = {};      // actions retenues (cochées)
    const unselectedMap = {};      // actions non retenues (non cochées)
    document.querySelectorAll('.action-category').forEach(catEl => {
        const headerEl = catEl.querySelector('.ac-header');
        const catName = headerEl ? headerEl.textContent.trim() : 'Actions';

        catEl.querySelectorAll('.action-item').forEach(item => {
            const taskEl = item.querySelector('.ai-task');
            if (!taskEl) return;
            const text = taskEl.textContent.trim();
            const target = item.classList.contains('selected') ? categoriesMap : unselectedMap;
            if (!target[catName]) target[catName] = [];
            target[catName].push(text);
        });
    });

    // Note : on autorise l'export même sans action retenue.
    // Le rapport reste utile pour le détail de l'évaluation et le backlog.
    const totalActions = Object.values(categoriesMap).reduce((s, arr) => s + arr.length, 0);
    const totalUnselected = Object.values(unselectedMap).reduce((s, arr) => s + arr.length, 0);

    if (totalActions === 0 && totalUnselected === 0 && Object.keys(answers).length === 0) {
        alert('Rien à exporter : aucune action et aucune réponse au quiz.');
        return;
    }

    // ---- Collecte du détail des questions, regroupées par catégorie ----
    // On suit la même logique que openCfModal() : declVal, dataScore, gap, conseil.
    const questionsByCategory = {};
    CATEGORIES.forEach(cat => {
        const qs = QUESTIONS.filter(q => q.cat === cat.id);
        if (qs.length === 0) return;

        const items = [];
        let totalDecl = 0, declCount = 0, totalData = 0, dataCount = 0;

        qs.forEach((q, i) => {
            const declValRaw = answers[q.id];
            const m = q.metric ? GITLAB_DATA[q.metric] : null;

            // Sécurité : niveau déclaratif = 'conforme' / 'non_conforme' (pas un nombre)
            let declValNum = null, declLabel = '—', declScore = null;
            if (declValRaw === 'conforme') { declLabel = 'Conforme'; declScore = 100; }
            else if (declValRaw === 'non_conforme') { declLabel = 'Non conforme'; declScore = 0; }
            else if (typeof declValRaw === 'number') {
                declValNum = declValRaw;
                declLabel = `Niveau ${declValNum}/5 — ${LEVELS[declValNum - 1] || ''}`;
                declScore = Math.round(declValNum / 5 * 100);
            } else {
                declLabel = 'Non répondu';
            }

            const dataScore = m ? m.score : null;
            const dataVal   = m ? m.val   : null;
            const dataRule  = m ? m.rule  : null;

            // Gap
            let gap = null;
            if (declScore !== null && dataScore !== null) {
                gap = declScore - dataScore;
            }

            // Aggregations pour le résumé de catégorie
            if (declScore !== null) { totalDecl += declScore; declCount++; }
            if (dataScore !== null) { totalData += dataScore; dataCount++; }

            const advice = (declValRaw !== undefined && declValRaw !== null)
                ? getAdvice(q.id, declValRaw)
                : null;

            items.push({
                num: i + 1, q: q.q, declLabel, declScore,
                dataVal, dataRule, dataScore, gap, advice
            });
        });

        questionsByCategory[cat.id] = {
            label: cat.label, icon: cat.icon, color: cat.color,
            avgDecl: declCount > 0 ? Math.round(totalDecl / declCount) : null,
            avgData: dataCount > 0 ? Math.round(totalData / dataCount) : null,
            count: qs.length,
            items
        };
    });

    // Niveau → couleur d'accent
    const accent = score >= 80 ? '#10b981'
                 : score >= 60 ? '#3b82f6'
                 : score >= 40 ? '#f59e0b'
                 : '#ef4444';
    const accentSoft = score >= 80 ? '#d1fae5'
                     : score >= 60 ? '#dbeafe'
                     : score >= 40 ? '#fef3c7'
                     : '#fee2e2';

    // Helper : escape HTML pour le contenu utilisateur
    const esc = (s) => String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    // ---- Sections d'actions ----
    let sectionsHTML = '';
    Object.entries(categoriesMap).forEach(([cat, actions]) => {
        const items = actions.map(a => `<li>${esc(a)}</li>`).join('');
        sectionsHTML += `
        <section class="axis">
            <h3>${esc(cat)} <span class="axis-count">${actions.length} action${actions.length > 1 ? 's' : ''}</span></h3>
            <ul>${items}</ul>
        </section>`;
    });

    // ---- Sections d'actions NON retenues (accordéon) ----
    let unselectedHTML = '';
    Object.entries(unselectedMap).forEach(([cat, actions]) => {
        const items = actions.map(a => `<li>${esc(a)}</li>`).join('');
        unselectedHTML += `
        <section class="axis-skip">
            <h3>${esc(cat)} <span class="axis-count-skip">${actions.length}</span></h3>
            <ul>${items}</ul>
        </section>`;
    });

    // ---- HTML du détail des questions (sections dépliables) ----
    let questionsHTML = '';
    let totalQuestionsRendered = 0;

    Object.values(questionsByCategory).forEach(cat => {
        if (cat.items.length === 0) return;
        totalQuestionsRendered += cat.items.length;

        const itemsHTML = cat.items.map(it => {
            // Pills
            let pills = '';
            pills += `<span class="q-pill q-decl">✋ ${esc(it.declLabel)}</span>`;
            if (it.dataVal !== null && it.dataVal !== undefined) {
                pills += `<span class="q-pill q-data">📊 ${esc(it.dataVal)}${it.dataRule ? ` <span class="q-rule">· règle : ${esc(it.dataRule)}</span>` : ''}</span>`;
            }
            if (it.gap !== null) {
                const absG = Math.abs(it.gap);
                if (absG < 15) {
                    pills += `<span class="q-pill q-gap-ok">✓ Aligné</span>`;
                } else if (it.gap > 0) {
                    pills += `<span class="q-pill q-gap-up">↑ +${Math.round(it.gap)} (déclaration optimiste)</span>`;
                } else {
                    pills += `<span class="q-pill q-gap-down">↓ ${Math.round(it.gap)} (data sous-évaluée)</span>`;
                }
            }

            const adviceHTML = it.advice
                ? `<div class="q-advice">💡 ${esc(it.advice)}</div>`
                : '';

            // Border-left selon gap
            let borderColor = '#ecebf3';
            if (it.gap !== null) {
                const absG = Math.abs(it.gap);
                if (absG < 15) borderColor = '#10b981';
                else if (it.gap > 0) borderColor = '#f59e0b';
                else borderColor = '#3b82f6';
            }

            return `
            <div class="q-item" style="border-left-color:${borderColor}">
                <div class="q-text"><span class="q-num">${it.num}.</span> ${esc(it.q)}</div>
                <div class="q-pills">${pills}</div>
                ${adviceHTML}
            </div>`;
        }).join('');

        const summaryStats = [];
        if (cat.avgDecl !== null) summaryStats.push(`Déclaratif : <strong>${cat.avgDecl}/100</strong>`);
        if (cat.avgData !== null) summaryStats.push(`Data : <strong>${cat.avgData}/100</strong>`);
        const summaryStatsHTML = summaryStats.length ? ` <span class="q-cat-stats">${summaryStats.join(' · ')}</span>` : '';

        questionsHTML += `
        <details class="q-cat" style="border-left-color:${cat.color}">
            <summary>
                <span class="q-cat-icon">${cat.icon}</span>
                <span class="q-cat-label">${esc(cat.label)}</span>
                <span class="q-cat-count">${cat.items.length} question${cat.items.length > 1 ? 's' : ''}</span>
                ${summaryStatsHTML}
                <span class="q-cat-chev">▾</span>
            </summary>
            <div class="q-items">
                ${itemsHTML}
            </div>
        </details>`;
    });

    const generatedAt = new Date().toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });

    // ---- Document HTML complet ----
    const doc = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Plan DevOps — ${esc(squad)} — ${esc(date)}</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #f4f4f7; }
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #1e1b2e;
        line-height: 1.6;
        padding: 40px 20px;
    }
    .page {
        max-width: 880px; margin: 0 auto;
        background: #fff;
        border-radius: 18px;
        box-shadow: 0 24px 60px -20px rgba(102,126,234,0.25), 0 8px 24px -8px rgba(0,0,0,0.08);
        overflow: hidden;
    }

    /* Hero */
    .hero {
        position: relative;
        padding: 48px 56px 56px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #fff;
        overflow: hidden;
    }
    .hero::before {
        content: ''; position: absolute; inset: 0;
        background:
            radial-gradient(800px 300px at 100% -10%, rgba(255,255,255,0.18), transparent 60%),
            radial-gradient(500px 200px at -10% 110%, rgba(255,255,255,0.10), transparent 60%);
        pointer-events: none;
    }
    .hero > * { position: relative; }
    .eyebrow {
        font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase;
        opacity: 0.75; margin-bottom: 14px;
    }
    .hero h1 {
        font-size: 34px; font-weight: 800; letter-spacing: -0.02em;
        margin-bottom: 22px; line-height: 1.15;
    }
    .meta-grid {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
        margin-top: 8px;
    }
    .meta-card {
        background: rgba(255,255,255,0.13);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.22);
        border-radius: 12px;
        padding: 14px 18px;
    }
    .meta-card .label {
        font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
        text-transform: uppercase; opacity: 0.72; margin-bottom: 6px;
    }
    .meta-card .value {
        font-size: 17px; font-weight: 700;
    }

    /* Score block */
    .score-block {
        display: grid; grid-template-columns: auto 1fr; gap: 36px;
        align-items: center;
        padding: 40px 56px;
        border-bottom: 1px solid #ecebf3;
    }
    .gauge {
        position: relative; width: 168px; height: 168px;
    }
    .gauge svg { transform: rotate(-90deg); }
    .gauge .gv-text {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
    }
    .gauge .gv-num {
        font-size: 44px; font-weight: 800; color: ${accent}; line-height: 1;
    }
    .gauge .gv-sub {
        font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
        text-transform: uppercase; color: #8a8499; margin-top: 6px;
    }
    .score-info .level-pill {
        display: inline-block; padding: 6px 14px; border-radius: 999px;
        background: ${accentSoft}; color: ${accent};
        font-size: 12px; font-weight: 700; letter-spacing: 0.04em;
        margin-bottom: 14px;
    }
    .score-info h2 {
        font-size: 24px; font-weight: 800; letter-spacing: -0.01em;
        color: #1e1b2e; margin-bottom: 10px;
    }
    .score-info p {
        color: #5a5570; font-size: 14px; max-width: 460px;
    }
    .stat-row {
        display: flex; gap: 24px; margin-top: 18px;
    }
    .stat-row .stat {
        font-size: 13px; color: #5a5570;
    }
    .stat-row .stat strong {
        color: #1e1b2e; font-size: 17px; font-weight: 800; display: block;
    }

    /* Body */
    .body {
        padding: 40px 56px 48px;
    }
    .body > h2 {
        font-size: 13px; font-weight: 700; letter-spacing: 0.14em;
        text-transform: uppercase; color: #8a8499;
        margin-bottom: 20px;
        padding-bottom: 14px;
        border-bottom: 1px solid #ecebf3;
    }
    .axis {
        margin-bottom: 28px;
        padding: 22px 24px;
        background: #fafafe;
        border: 1px solid #ecebf3;
        border-left: 4px solid #764ba2;
        border-radius: 12px;
    }
    .axis h3 {
        font-size: 17px; font-weight: 800; color: #1e1b2e;
        margin-bottom: 14px;
        display: flex; align-items: center; gap: 10px;
    }
    .axis-count {
        font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
        background: #ece9f6; color: #764ba2;
        padding: 3px 10px; border-radius: 999px;
    }
    .axis ul {
        list-style: none; padding: 0;
    }
    .axis li {
        position: relative;
        padding: 10px 0 10px 30px;
        border-bottom: 1px dashed #ecebf3;
        font-size: 14px; color: #2c2840;
    }
    .axis li:last-child { border-bottom: none; }
    .axis li::before {
        content: '✓';
        position: absolute; left: 0; top: 50%; transform: translateY(-50%);
        width: 20px; height: 20px;
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: #fff; font-size: 12px; font-weight: 800;
        display: flex; align-items: center; justify-content: center;
        border-radius: 50%;
    }

    /* Empty state — aucune action retenue */
    .empty-actions {
        text-align: center;
        padding: 32px 20px;
        background: #fafafe;
        border: 1px dashed #d8d3e8;
        border-radius: 12px;
    }
    .empty-icon { font-size: 36px; margin-bottom: 10px; opacity: 0.7; }
    .empty-title {
        font-size: 15px; font-weight: 800; color: #5a5570;
        margin-bottom: 6px;
    }
    .empty-sub {
        font-size: 13px; color: #8a8499; line-height: 1.5;
        max-width: 440px; margin: 0 auto;
    }

    /* Actions NON retenues (accordéon, secondaire) */
    .skip-section {
        padding: 0 56px 24px;
    }
    details.skip-block {
        background: #fafafe;
        border: 1px dashed #d8d3e8;
        border-radius: 12px;
        overflow: hidden;
    }
    details.skip-block summary {
        padding: 14px 20px;
        cursor: pointer;
        list-style: none;
        display: flex;
        align-items: center;
        gap: 12px;
        user-select: none;
        font-size: 13px;
        color: #5a5570;
    }
    details.skip-block summary::-webkit-details-marker { display: none; }
    .skip-icon { font-size: 16px; opacity: 0.7; }
    .skip-label { font-weight: 700; color: #5a5570; flex: 1; letter-spacing: 0.02em; }
    .skip-count {
        font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
        background: #ece9f6; color: #8a8499;
        padding: 3px 10px; border-radius: 999px;
    }
    .skip-chev {
        font-size: 14px; color: #8a8499;
        transition: transform 0.2s;
    }
    details.skip-block[open] .skip-chev { transform: rotate(180deg); }
    .skip-body {
        padding: 14px 20px 18px;
        border-top: 1px dashed #d8d3e8;
    }
    .skip-body .skip-intro {
        font-size: 12px; color: #8a8499; font-style: italic;
        margin-bottom: 14px; line-height: 1.5;
    }
    section.axis-skip {
        margin-bottom: 14px;
        padding: 12px 16px;
        background: #fff;
        border: 1px solid #ecebf3;
        border-radius: 10px;
    }
    section.axis-skip h3 {
        font-size: 13px; font-weight: 700; color: #5a5570;
        margin-bottom: 8px;
        display: flex; align-items: center; gap: 8px;
    }
    .axis-count-skip {
        font-size: 10px; font-weight: 700;
        background: #f0eef7; color: #8a8499;
        padding: 2px 8px; border-radius: 999px;
    }
    section.axis-skip ul {
        list-style: none; padding: 0;
    }
    section.axis-skip li {
        position: relative;
        padding: 6px 0 6px 24px;
        font-size: 12.5px; color: #8a8499;
        border-bottom: 1px dashed #ecebf3;
        line-height: 1.5;
    }
    section.axis-skip li:last-child { border-bottom: none; }
    section.axis-skip li::before {
        content: '○';
        position: absolute; left: 4px; top: 50%; transform: translateY(-50%);
        color: #c5bfd6; font-size: 14px; font-weight: 700;
    }

    /* Détail des questions (dépliables) */
    .questions-section {
        padding: 8px 56px 40px;
    }
    .questions-section > h2 {
        font-size: 13px; font-weight: 700; letter-spacing: 0.14em;
        text-transform: uppercase; color: #8a8499;
        margin-bottom: 20px;
        padding-bottom: 14px;
        border-bottom: 1px solid #ecebf3;
    }
    details.q-cat {
        background: #fff;
        border: 1px solid #ecebf3;
        border-left: 4px solid #764ba2;
        border-radius: 12px;
        margin-bottom: 14px;
        overflow: hidden;
        transition: box-shadow 0.2s;
    }
    details.q-cat[open] {
        box-shadow: 0 4px 16px -8px rgba(102,126,234,0.25);
    }
    details.q-cat summary {
        padding: 16px 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 14px;
        list-style: none;
        user-select: none;
    }
    details.q-cat summary::-webkit-details-marker { display: none; }
    .q-cat-icon { font-size: 20px; }
    .q-cat-label { font-weight: 800; color: #1e1b2e; flex: 1; }
    .q-cat-count {
        font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
        background: #ece9f6; color: #764ba2;
        padding: 3px 10px; border-radius: 999px;
    }
    .q-cat-stats {
        font-size: 11px; color: #5a5570;
    }
    .q-cat-stats strong { color: #1e1b2e; font-weight: 800; }
    .q-cat-chev {
        font-size: 14px; color: #8a8499;
        transition: transform 0.2s;
    }
    details.q-cat[open] .q-cat-chev { transform: rotate(180deg); }
    .q-items {
        padding: 0 20px 18px;
        border-top: 1px solid #ecebf3;
    }
    .q-item {
        padding: 14px 16px;
        margin-top: 12px;
        background: #fafafe;
        border-radius: 10px;
        border-left: 3px solid #ecebf3;
    }
    .q-text {
        font-size: 13px; font-weight: 700; color: #1e1b2e;
        margin-bottom: 10px; line-height: 1.45;
    }
    .q-num {
        display: inline-block;
        color: #764ba2; font-weight: 800;
        margin-right: 4px;
    }
    .q-pills {
        display: flex; flex-wrap: wrap; gap: 6px;
        margin-bottom: 8px;
    }
    .q-pill {
        font-size: 11px; font-weight: 700;
        padding: 4px 10px; border-radius: 6px;
        line-height: 1.4;
    }
    .q-pill.q-decl { background: #f3f0fb; color: #5b3a93; }
    .q-pill.q-data { background: #eef4ff; color: #1e40af; }
    .q-rule { font-weight: 400; opacity: 0.7; }
    .q-pill.q-gap-ok   { background: #d1fae5; color: #065f46; }
    .q-pill.q-gap-up   { background: #fef3c7; color: #92400e; }
    .q-pill.q-gap-down { background: #dbeafe; color: #1e40af; }
    .q-advice {
        font-size: 12px; color: #5a5570;
        font-style: italic;
        padding: 8px 12px;
        background: #fff;
        border-radius: 6px;
        border: 1px solid #ecebf3;
        line-height: 1.5;
    }

    /* Footer */
    .footer {
        padding: 22px 56px 28px;
        border-top: 1px solid #ecebf3;
        font-size: 11px; color: #8a8499;
        display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;
    }
    .footer strong { color: #5a5570; }

    /* Print : tout déplier pour l'impression */
    @media print {
        body { background: #fff; padding: 0; }
        .page { box-shadow: none; border-radius: 0; }
        .axis, .axis-skip, .q-cat, .q-item, .skip-block { break-inside: avoid; }
        details.q-cat > .q-items,
        details.skip-block > .skip-body { display: block !important; }
        details.q-cat:not([open]) > summary ~ *,
        details.skip-block:not([open]) > summary ~ * { display: block !important; }
        .q-cat-chev, .skip-chev { display: none; }
    }
</style>
</head>
<body>
<div class="page">
    <header class="hero">
        <div class="eyebrow">DevOps Hub · Plan d'accompagnement</div>
        <h1>🎯 Plan DevOps — ${esc(squad)}</h1>
        <div class="meta-grid">
            <div class="meta-card">
                <div class="label">Squad</div>
                <div class="value">${esc(squad)}</div>
            </div>
            <div class="meta-card">
                <div class="label">Tribu</div>
                <div class="value">${esc(tribu)}</div>
            </div>
            <div class="meta-card">
                <div class="label">Date</div>
                <div class="value">${esc(date)}</div>
            </div>
        </div>
    </header>

    <section class="score-block">
        <div class="gauge">
            <svg width="168" height="168" viewBox="0 0 168 168">
                <circle cx="84" cy="84" r="74" fill="none" stroke="#ecebf3" stroke-width="14"/>
                <circle cx="84" cy="84" r="74" fill="none" stroke="${accent}" stroke-width="14"
                        stroke-linecap="round"
                        stroke-dasharray="${(score / 100 * 2 * Math.PI * 74).toFixed(2)} ${(2 * Math.PI * 74).toFixed(2)}"/>
            </svg>
            <div class="gv-text">
                <div class="gv-num">${score}</div>
                <div class="gv-sub">/ 100</div>
            </div>
        </div>
        <div class="score-info">
            <span class="level-pill">${esc(level)}</span>
            <h2>Score global de maturité</h2>
            <p>Plan d'accompagnement issu de l'évaluation déclarative croisée avec les données GitLab. Les actions ci-dessous ont été sélectionnées pour combler les écarts identifiés.</p>
            <div class="stat-row">
                <div class="stat"><strong>${Object.keys(categoriesMap).length}</strong>Axes</div>
                <div class="stat"><strong>${totalActions}</strong>Actions</div>
            </div>
        </div>
    </section>

    <main class="body">
        <h2>Actions retenues</h2>
        ${totalActions > 0 ? sectionsHTML : `
        <div class="empty-actions">
            <div class="empty-icon">🎯</div>
            <div class="empty-title">Aucune action retenue pour ce plan</div>
            <div class="empty-sub">Ce rapport présente l'évaluation de maturité ${totalUnselected > 0 ? `et un backlog de ${totalUnselected} action${totalUnselected > 1 ? 's' : ''} disponibles` : ''}.</div>
        </div>`}
    </main>

    ${totalUnselected > 0 ? `<section class="skip-section">
        <details class="skip-block">
            <summary>
                <span class="skip-icon">📦</span>
                <span class="skip-label">Actions non retenues — backlog</span>
                <span class="skip-count">${totalUnselected} action${totalUnselected > 1 ? 's' : ''}</span>
                <span class="skip-chev">▾</span>
            </summary>
            <div class="skip-body">
                <div class="skip-intro">Ces actions ont été identifiées par le diagnostic mais n'ont pas été retenues pour ce trimestre. Elles restent disponibles pour les itérations suivantes.</div>
                ${unselectedHTML}
            </div>
        </details>
    </section>` : ''}

    ${totalQuestionsRendered > 0 ? `<section class="questions-section">
        <h2>Détail de l'évaluation — questions &amp; résultats</h2>
        ${questionsHTML}
    </section>` : ''}

    <footer class="footer">
        <span>Généré par <strong>DevOps Hub</strong> · Maturité DevOps</span>
        <span>${esc(generatedAt)}</span>
    </footer>
</div>
</body>
</html>`;

    // ---- Téléchargement ----
    const safeSquad = squad.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'squad';
    const filename = `plan-devops_${safeSquad}_${date}.html`;
    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

document.getElementById('inDate').value = new Date().toISOString().split('T')[0];
