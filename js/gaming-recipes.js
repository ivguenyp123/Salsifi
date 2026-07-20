/*
 * Salsifi — Atelier Salsi : recettes pédagogiques par badge.
 * ----------------------------------------------------------------------
 * Chaque entrée explique VRAIMENT : ce que c'est, pourquoi ça compte, et
 * comment on le fait — pas juste « fais ça ». La popup y ajoute l'état réel
 * du repo (valeur actuelle vs objectif) pour proposer ce qu'il faut faire.
 *
 *   mode      : 'create-file' (MR réelle) | 'template' (à coller) |
 *               'setting' (réglage GitLab) | 'coaching' (démarche)
 *   why       : pédagogie (HTML léger autorisé : <b>, <code>)
 *   steps[]   : marche à suivre concrète
 *   template? : modèle prêt à copier (create-file → contenu du fichier)
 *   filePath?, commitMsg? : pour create-file
 *   module?   : { name, url } — outil de la plateforme qui aide
 *   note?     : précision / garde-fou
 */
(function (global) {
    'use strict';
    var Salsifi = global.Salsifi || (global.Salsifi = {});

    var CI = 'pipeline-generator.html';
    var FF = 'feature-flag-manager.html';
    var BRANCHES = 'branch-cleaner.html';
    var RELEASES = 'release-notes.html';

    Salsifi.gamingRecipes = {

        // ═══════════ 🚀 DELIVERY ═══════════
        frequent_deploy: {
            mode: 'coaching',
            why: "Déployer souvent, c'est réduire le <b>risque</b> : de petits changements fréquents sont plus faciles à vérifier et à annuler qu'une grosse livraison rare. Les équipes qui livrent souvent ont paradoxalement <b>moins d'incidents</b>, parce que chaque déploiement embarque peu de nouveautés.",
            steps: [
                "Découpe tes features en <b>petits incréments</b> livrables (ce qui est fini part, le reste attend derrière un flag).",
                "Merge vers <code>main</code> <b>tous les jours</b> plutôt que d'accumuler une grosse branche.",
                "Automatise le déploiement en dev/test pour qu'il ne coûte rien (un merge = un déploiement)."
            ],
            module: { name: 'Feature Flag Manager', url: FF }
        },
        high_frequency_deploy: {
            mode: 'coaching',
            why: "Le niveau <b>Elite</b> (DORA) déploie plusieurs fois par jour. La clé n'est pas de coder plus vite, mais de <b>découpler le déploiement de la mise en visibilité</b> : on livre le code en continu, on active la fonctionnalité quand on veut.",
            steps: [
                "Sépare <b>déployer</b> (mettre le code en prod) et <b>publier</b> (l'exposer aux users) via des <b>feature flags</b>.",
                "Mets en place une chaîne de <b>déploiement continu</b> jusqu'à un environnement de test à chaque merge.",
                "Réduis la taille des lots : plus c'est petit, plus c'est fréquent et sûr."
            ],
            module: { name: 'Feature Flag Manager', url: FF }
        },
        fast_pipeline: {
            mode: 'template',
            why: "Un pipeline lent, c'est du <b>feedback lent</b> : le dev attend, se déconcentre, empile les changements. Sous 10 min, on garde le flow. Les leviers : <b>cache</b>, <b>parallélisme</b> et images légères.",
            steps: [
                "Mets en <b>cache</b> les dépendances (node_modules, .m2, .venv…) entre les jobs.",
                "Fais tourner les jobs indépendants <b>en parallèle</b> (pas en série).",
                "Utilise des images Docker <b>légères</b> (alpine, slim) pour démarrer plus vite."
            ],
            template: "# Cache + parallélisme (exemple npm)\ndefault:\n  cache:\n    key: \"$CI_COMMIT_REF_SLUG\"\n    paths:\n      - .npm/\n\nlint:\n  stage: test\n  script: [ \"npm ci --cache .npm --prefer-offline\", \"npm run lint\" ]\n\ntest:\n  stage: test\n  script: [ \"npm ci --cache .npm --prefer-offline\", \"npm test\" ]\n# lint et test tournent en parallèle car même stage\n",
            module: { name: 'Pipeline Generator', url: CI }
        },
        very_fast_pipeline: {
            mode: 'template',
            why: "Sous <b>5 min</b>, le pipeline devient invisible : on push, on a la réponse quasi tout de suite. On y arrive en ne rejouant que le nécessaire et en enchaînant les jobs par dépendances plutôt que par étapes bloquantes.",
            steps: [
                "Utilise <code>needs:</code> pour lancer un job dès que ses dépendances sont prêtes (DAG, pas de stage qui bloque tout).",
                "Ne teste que ce qui change quand c'est possible (tests ciblés, <code>rules:changes</code>).",
                "Sors les tâches lentes (scans lourds) sur un pipeline planifié, hors du chemin critique."
            ],
            template: "build:\n  stage: build\n  script: [ \"make build\" ]\n\ntest:\n  stage: test\n  needs: [ \"build\" ]   # démarre dès que build est fini, sans attendre le reste\n  script: [ \"make test\" ]\n",
            module: { name: 'Pipeline Generator', url: CI }
        },
        pipeline_as_code: {
            mode: 'create-file', filePath: '.gitlab-ci.yml', commitMsg: 'ci: ajoute un pipeline de base (.gitlab-ci.yml)',
            why: "Le pipeline « as code » (<code>.gitlab-ci.yml</code> versionné) rend ta chaîne de build <b>reproductible, relisible et historisée</b> : tout le monde voit comment ça se construit, et un changement de CI passe en revue comme le reste du code.",
            steps: [
                "Ajoute un fichier <code>.gitlab-ci.yml</code> à la racine.",
                "Décris tes étapes (build, test, deploy).",
                "Au commit, GitLab lance le pipeline automatiquement."
            ],
            template: "stages:\n  - build\n  - test\n\nbuild:\n  stage: build\n  script:\n    - echo \"TODO: build\"\n\ntest:\n  stage: test\n  script:\n    - echo \"TODO: tests\"\n",
            module: { name: 'Pipeline Generator', url: CI }
        },
        green_pipeline: {
            mode: 'coaching',
            why: "Un taux de succès > 90 %, c'est un pipeline <b>digne de confiance</b>. Le pire ennemi, ce sont les <b>tests flaky</b> (qui échouent au hasard) : ils poussent l'équipe à relancer sans réfléchir, et à ignorer les vrais échecs.",
            steps: [
                "Repère les tests instables (échecs intermittents) et <b>isole-les</b> (quarantaine) le temps de les corriger.",
                "Corrige les causes : dépendances au temps, à l'ordre, à des services externes non mockés.",
                "Traite un pipeline rouge comme une <b>urgence</b>, pas comme du bruit."
            ]
        },
        high_stability: {
            mode: 'coaching',
            why: "Au-delà de 95 % de succès, ta CI est un vrai <b>filet de sécurité</b> : quand elle est rouge, c'est un vrai problème. C'est le socle pour automatiser le déploiement en confiance.",
            steps: [
                "Élimine <b>tous</b> les tests flaky restants (tolérance zéro).",
                "Ajoute des tests là où les incidents passés sont passés (chaque bug = un test de non-régression).",
                "Surveille la tendance : une baisse du taux de succès est un signal avant l'incident."
            ]
        },
        recovery_master: {
            mode: 'coaching',
            why: "Le <b>MTTR</b> (temps de rétablissement) compte plus que le taux de panne : tout le monde a des incidents, les meilleurs s'en <b>remettent vite</b> (&lt; 2 h). Ça demande de savoir vite <b>quoi</b> casse et de pouvoir <b>revenir en arrière</b> sans stress.",
            steps: [
                "Mets en place des <b>alertes</b> qui préviennent avant les utilisateurs.",
                "Écris des <b>runbooks</b> courts : « si X tombe, faire Y ».",
                "Garde un <b>rollback</b> testé et un chemin de déploiement rapide pour le correctif."
            ]
        },
        no_failed_streak: {
            mode: 'coaching',
            why: "Une <b>série d'échecs</b> consécutifs (≥ 2), c'est le signe qu'on a continué à merger par-dessus un pipeline rouge. Chaque échec doit être traité avant de repartir, sinon on empile les problèmes.",
            steps: [
                "Applique le principe « <b>on ne construit pas sur du rouge</b> » : pipeline cassé = priorité n°1.",
                "Bloque le merge tant que la CI n'est pas verte (règle de MR).",
                "Rends l'échec visible (notif équipe) pour qu'il soit repris tout de suite."
            ]
        },
        deploy_from_main: {
            mode: 'coaching',
            why: "Déployer <b>uniquement depuis <code>main</code></b> garantit que ce qui part en prod est bien passé par la revue et la CI. Déployer depuis une branche feature, c'est mettre en prod du code non validé — la porte ouverte aux surprises.",
            steps: [
                "Restreins le job de déploiement à la branche par défaut : <code>rules: [{ if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH' }]</code>.",
                "Protège <code>main</code> pour que tout y passe par une MR revue.",
                "Fais des correctifs urgents via une MR express sur <code>main</code>, pas un déploiement de branche."
            ]
        },
        tagged_releases: {
            mode: 'coaching',
            why: "Un <b>tag Git</b> par release, c'est un point de repère immuable : on sait exactement quel code est en prod, on peut y revenir, et on relie livraison ↔ changements. Sans tag, « la version d'hier » n'existe nulle part.",
            steps: [
                "Crée un tag à chaque livraison : <code>git tag v1.2.0 &amp;&amp; git push --tags</code>.",
                "Idéalement, automatise-le dans un job de release qui tague sur <code>main</code>.",
                "Associe une <b>release note</b> au tag pour tracer ce qui change."
            ],
            module: { name: 'Release Notes', url: RELEASES }
        },
        semver: {
            mode: 'coaching',
            why: "Le <b>versionnage sémantique</b> (<code>vMAJEUR.MINEUR.CORRECTIF</code>) communique la nature du changement d'un coup d'œil : <b>MAJEUR</b> = cassant, <b>MINEUR</b> = nouveauté compatible, <b>CORRECTIF</b> = bugfix. Tes consommateurs savent s'ils peuvent mettre à jour sans risque.",
            steps: [
                "Adopte le format <code>vX.Y.Z</code> pour tous tes tags.",
                "Incrémente <b>Z</b> pour un correctif, <b>Y</b> pour une fonctionnalité compatible, <b>X</b> pour une rupture.",
                "Note les ruptures explicitement dans la release."
            ]
        },

        // ═══════════ 🔍 QUALITY ═══════════
        code_review_champion: {
            mode: 'coaching',
            why: "La revue de code n'est pas une formalité : c'est le moment où le savoir se <b>partage</b> et où les défauts sont attrapés au moins cher. Un fort taux de MR relues = une équipe qui apprend ensemble et un bus factor qui monte.",
            steps: [
                "Fais de la revue une <b>priorité quotidienne</b> (bloc de temps dédié) — une MR qui attend, c'est du travail figé.",
                "Exige au moins une approbation avant merge.",
                "Relis pour <b>comprendre</b>, pas pour tamponner : pose des questions, propose des alternatives."
            ]
        },
        review_speed: {
            mode: 'coaching',
            why: "Une revue rapide garde le flux : plus une MR attend, plus l'auteur perd le contexte et plus les conflits s'accumulent. Viser une <b>première réponse dans la journée</b> change tout au rythme de l'équipe.",
            steps: [
                "Définis un engagement d'équipe : « toute MR reçoit une première revue sous 24 h ».",
                "Notifie les relecteurs (assignation, canal dédié).",
                "Préfère plusieurs petites MR relisables vite à une grosse qui décourage."
            ]
        },
        very_fast_review: {
            mode: 'coaching',
            why: "Une revue sous quelques heures, c'est le signe d'une équipe fluide où le code circule. Ça se gagne surtout en <b>rendant les MR petites</b> : on relit 50 lignes en 5 min, pas 800.",
            steps: [
                "Réduis la taille des MR (voir le badge « Small MR »).",
                "Mets en place une rotation ou un binôme de revue pour qu'il y ait toujours quelqu'un.",
                "Automatise le style/lint pour que la revue se concentre sur le fond."
            ]
        },
        approval_rules: {
            mode: 'setting',
            why: "Des <b>règles d'approbation</b> garantissent qu'aucun code n'arrive en prod sans qu'un pair l'ait validé. C'est un contrôle simple qui attrape énormément de défauts et protège les zones sensibles.",
            steps: [
                "GitLab → <b>Settings → Merge requests → Approvals</b>.",
                "Exige <b>au moins 1 approbation</b> (2 sur les repos critiques).",
                "Cible des approbateurs par zone via <code>CODEOWNERS</code> si besoin."
            ],
            note: "Réglage projet (pas un fichier) — l'application se fait côté GitLab."
        },
        reset_approvals: {
            mode: 'setting',
            why: "Sans « reset des approbations sur nouveau push », on peut faire approuver une MR… puis y ajouter du code non revu juste avant le merge. Réinitialiser force une <b>re-validation</b> de ce qui a réellement changé.",
            steps: [
                "GitLab → <b>Settings → Merge requests</b>.",
                "Active « <b>Remove all approvals when commits are added</b> ».",
                "Combine avec « au moins 1 approbation requise »."
            ],
            note: "Réglage projet — côté GitLab."
        },
        small_mr: {
            mode: 'coaching',
            why: "La taille de la MR est le premier facteur de qualité de revue : au-delà de ~400 lignes, l'attention chute et les bugs passent. Les petites MR sont relues vite, mieux, et se mergent sans friction.",
            steps: [
                "Découpe une grosse feature en <b>plusieurs MR</b> qui s'enchaînent (chacune complète et testable).",
                "Sépare le <b>refactoring</b> du changement fonctionnel (deux MR distinctes).",
                "Vise &lt; 400 lignes ajoutées par MR."
            ]
        },
        tiny_mr: {
            mode: 'coaching',
            why: "Les toutes petites MR (&lt; 100 lignes) sont l'idéal : quasi impossibles à faire passer un bug, relues en minutes, mergées le jour même. C'est un vrai super-pouvoir d'équipe.",
            steps: [
                "Pense « <b>plus petit incrément qui a du sens</b> » à chaque fois.",
                "Livre les fondations d'abord (interfaces, tests) puis l'implémentation.",
                "N'aie pas peur d'enchaîner 5 MR de 60 lignes plutôt qu'une de 300."
            ]
        },
        low_mr_files: {
            mode: 'coaching',
            why: "Une MR qui touche des dizaines de fichiers est difficile à tenir dans sa tête. Peu de fichiers = changement <b>focalisé</b>, plus facile à revoir et à annuler si besoin.",
            steps: [
                "Un objectif = une MR : évite de mélanger plusieurs sujets.",
                "Isole les renommages/déplacements massifs dans une MR à part.",
                "Si beaucoup de fichiers changent « mécaniquement », explique-le en description."
            ]
        },
        no_merge_without_approval: {
            mode: 'setting',
            why: "Interdire le merge sans approbation, c'est rendre la revue <b>non contournable</b>. Sinon, sous pression, on finit par merger « juste cette fois » — et c'est là que ça casse.",
            steps: [
                "GitLab → <b>Settings → Merge requests</b> : exige au moins 1 approbation.",
                "Empêche l'auteur d'approuver sa propre MR.",
                "Protège <code>main</code> pour que la règle s'applique à tout."
            ],
            note: "Réglage projet — côté GitLab."
        },
        constructive_reviews: {
            mode: 'coaching',
            why: "Le <b>nombre</b> de commentaires n'est qu'un proxy : ce qui compte, c'est une revue qui fait <b>avancer</b> le code et monter l'auteur en compétence. Une revue vivante (questions, alternatives, encouragements) vaut mieux qu'un « LGTM » vide.",
            steps: [
                "Commente le <b>pourquoi</b>, propose des pistes, distingue « bloquant » de « suggestion ».",
                "Reconnais ce qui est bien fait, pas seulement ce qui cloche.",
                "Prends les échanges tendus en direct (appel) plutôt qu'en fil interminable."
            ]
        },

        // ═══════════ 🛡️ STABILITY ═══════════
        stable_build: {
            mode: 'coaching',
            why: "Un build stable, c'est la base de tout le reste : si la CI n'est pas fiable, personne ne lui fait confiance et les garde-fous sautent. La stabilité se construit en traquant l'aléatoire (flaky, dépendances externes).",
            steps: [
                "Rends les builds <b>déterministes</b> : versions figées (lock files), pas d'appel réseau non maîtrisé.",
                "Mocke les services externes dans les tests.",
                "Corrige à la source dès qu'un job échoue « au hasard »."
            ]
        },
        pipeline_resilient: {
            mode: 'coaching',
            why: "Un pipeline résilient limite les <b>échecs consécutifs</b> : il retente ce qui est transitoire (réseau) mais ne masque pas les vrais problèmes. L'idée est de ne pas rester bloqué sur des faux négatifs.",
            steps: [
                "Ajoute un <code>retry</code> ciblé sur les erreurs transitoires (pas sur les échecs de test).",
                "Sépare « infra qui flanche » (retry) de « code cassé » (à corriger).",
                "Alerte quand un job retente trop souvent : c'est un symptôme."
            ]
        },
        quick_fix: {
            mode: 'coaching',
            why: "Réparer vite un pipeline rouge, c'est protéger la productivité de <b>toute l'équipe</b> : tant que <code>main</code> est cassé, plus personne ne peut merger sereinement. La rapidité de correction est un réflexe culturel.",
            steps: [
                "Règle : un <code>main</code> rouge se corrige (ou se <b>revert</b>) <b>immédiatement</b>.",
                "En cas de doute, <b>revert d'abord</b>, comprends ensuite.",
                "Garde le dernier commit petit pour pouvoir revenir en arrière sans douleur."
            ]
        },
        no_pipeline_red: {
            mode: 'coaching',
            why: "Passer une semaine sans pipeline rouge sur <code>main</code>, c'est le signe d'une chaîne saine. Ça se gagne en amont : rien de cassé n'arrive sur <code>main</code> parce que tout y passe vert.",
            steps: [
                "Bloque le merge tant que la MR n'est pas verte.",
                "Fais tourner la CI sur la MR <b>avant</b> merge, pas seulement après.",
                "Traite les flaky : ils sont la première cause de rouge « injuste »."
            ]
        },
        trend_up: {
            mode: 'coaching',
            why: "Ce badge récompense une <b>trajectoire</b> : peu importe d'où tu pars, tu progresses. C'est le meilleur état d'esprit — viser l'amélioration continue plutôt qu'un score parfait d'un coup.",
            steps: [
                "Choisis <b>un</b> indicateur à améliorer ce mois-ci (ex. durée pipeline).",
                "Fais un petit pas mesurable, observe, recommence.",
                "Célèbre les progrès : la régularité bat l'héroïsme."
            ]
        },

        // ═══════════ 🧹 HYGIÈNE ═══════════
        clean_repo: {
            mode: 'coaching',
            why: "Un dépôt propre (peu de branches mortes, pas de vieux artefacts) réduit le <b>bruit</b> : on trouve vite l'info, on ne se trompe pas de branche, la CI ne traîne pas des scories. L'hygiène, c'est de la vitesse plus tard.",
            steps: [
                "Supprime les branches déjà mergées et les branches abandonnées.",
                "Active la suppression auto de la branche source au merge.",
                "Range : pas de gros binaires ni de secrets dans l'historique."
            ],
            module: { name: 'Branch Monitor', url: BRANCHES }
        },
        stale_branch_hunter: {
            mode: 'coaching',
            why: "Les <b>branches mortes</b> (sans activité depuis longtemps) sont des pièges : on ne sait plus si elles contiennent du travail à récupérer ou du code abandonné. Les traquer régulièrement garde le dépôt lisible.",
            steps: [
                "Repère les branches inactives depuis &gt; 30 jours.",
                "Pour chacune : merger, ou archiver l'idée dans une issue, puis supprimer.",
                "Instaure une revue de branches mensuelle."
            ],
            module: { name: 'Branch Monitor', url: BRANCHES }
        },
        lock_files_present: {
            mode: 'coaching',
            why: "Un <b>lock file</b> (package-lock.json, poetry.lock…) fige les versions <b>exactes</b> de tes dépendances. Sans lui, deux installations à deux moments peuvent tirer des versions différentes — d'où le fameux « ça marche chez moi ». C'est aussi une barrière contre les mises à jour malveillantes surprises.",
            steps: [
                "Génère le lock avec ton gestionnaire : npm → <code>npm install</code> ; Python → <code>poetry lock</code> / <code>pip freeze &gt; requirements.txt</code> ; Maven → versions fixes dans le <code>pom.xml</code>.",
                "<b>Commit</b> le fichier généré (il doit être versionné).",
                "Mets à jour les dépendances volontairement, en relisant le diff du lock."
            ]
        },
        essential_files: {
            mode: 'create-file', filePath: 'README.md', commitMsg: 'docs: ajoute un README',
            why: "Les fichiers essentiels (<code>README</code>, <code>.gitignore</code>, <code>LICENSE</code>) sont la <b>carte d'entrée</b> du dépôt : comment le lancer, quoi ignorer, ce qu'on a le droit d'en faire. Un repo sans README, c'est une boîte noire pour le prochain (souvent toi dans 6 mois).",
            steps: [
                "Ajoute au moins un <code>README.md</code> : à quoi sert le projet, comment le lancer, qui contacter.",
                "Ajoute un <code>.gitignore</code> adapté à ta stack (évite de committer build/secrets).",
                "Ajoute un <code>LICENSE</code> si le contexte l'exige."
            ],
            template: "# {{PROJECT}}\n\nDescription courte du projet.\n\n## Lancer en local\n\n    # commande pour lancer le projet en local\n\n## Contact\n\nÉquipe …\n",
            note: "Je crée le <code>README.md</code> ; ajoute ensuite <code>.gitignore</code> / <code>LICENSE</code>."
        },
        branch_protection: {
            mode: 'setting',
            why: "Protéger <code>main</code>, c'est empêcher qu'on y écrive directement sans passer par une MR revue. C'est la <b>serrure</b> de ton dépôt : sans elle, n'importe qui peut réécrire l'historique de la branche de prod.",
            steps: [
                "GitLab → <b>Settings → Repository → Protected branches</b>.",
                "Protège <code>main</code> : seuls les Maintainers peuvent merger.",
                "Interdis le <b>force-push</b> sur cette branche."
            ],
            note: "Réglage projet — côté GitLab."
        },
        force_push_blocked: {
            mode: 'setting',
            why: "Le <b>force-push</b> réécrit l'historique : il peut faire disparaître des commits, casser les branches des autres et effacer des traces. Le bloquer sur <code>main</code> garantit un historique <b>immuable et fiable</b>.",
            steps: [
                "GitLab → <b>Settings → Repository → Protected branches</b>.",
                "Sur <code>main</code>, laisse « Allowed to force push » <b>désactivé</b>.",
                "Éduque l'équipe : on ne force-push jamais une branche partagée."
            ],
            note: "Réglage projet — côté GitLab."
        },
        no_zombie_mrs: {
            mode: 'coaching',
            why: "Une <b>MR zombie</b> (ouverte depuis très longtemps, sans activité) pollue : on ne sait plus si elle est à finir ou à jeter, elle accumule des conflits et brouille la vue d'équipe. Les fermer, c'est de la clarté.",
            steps: [
                "Passe en revue les MR ouvertes &gt; 30 jours.",
                "Pour chacune : finir et merger, ou fermer en notant l'idée dans une issue.",
                "Règle d'équipe : une MR se termine dans la semaine, sinon on la découpe."
            ]
        },
        mr_cycle_time: {
            mode: 'coaching',
            why: "Le <b>temps de cycle</b> d'une MR (de l'ouverture au merge) mesure la fluidité de ton flux. Un cycle court = feedback rapide, moins de conflits, plus de valeur livrée. Les grands responsables : MR trop grosses et revues lentes.",
            steps: [
                "Réduis la taille des MR (relecture plus rapide).",
                "Engage-toi sur un délai de première revue (24 h).",
                "Évite les MR bloquées en attente : relance, pair-review, ou découpe."
            ]
        },
        merged_branches_cleaned: {
            mode: 'setting',
            why: "Une branche <b>mergée mais pas supprimée</b> ne sert plus à rien et encombre. Supprimer automatiquement la branche source au merge garde la liste des branches propre et compréhensible.",
            steps: [
                "GitLab → <b>Settings → Merge requests</b> : active « <b>Enable delete source branch by default</b> ».",
                "Coche « Delete source branch » sur les MR existantes au moment du merge.",
                "Nettoie les branches mergées historiques."
            ],
            module: { name: 'Branch Monitor', url: BRANCHES }
        },

        // ═══════════ 🧠 RÉSILIENCE ═══════════
        bus_factor_safe: {
            mode: 'coaching',
            why: "Le <b>bus factor</b>, c'est le nombre de personnes qui, si elles disparaissaient, bloqueraient le projet. Un bus factor de 1, c'est un risque majeur : tout le savoir est dans une seule tête. Le monter, c'est <b>partager la connaissance</b>.",
            steps: [
                "Fais tourner qui touche à quoi : évite qu'une seule personne possède un pan du code.",
                "Généralise la <b>revue croisée</b> (le savoir circule par la revue).",
                "Documente les zones critiques et pratique le pair-programming dessus."
            ]
        },
        work_balanced: {
            mode: 'coaching',
            why: "Quand un seul contributeur porte l'essentiel des commits, l'équipe est <b>fragile</b> et cette personne s'épuise. Un travail réparti, c'est plus de résilience et un rythme soutenable pour tout le monde.",
            steps: [
                "Répartis les sujets consciemment (pas toujours le même sur les tâches clés).",
                "Utilise le pair/mob-programming pour diffuser les zones difficiles.",
                "Surveille l'équilibre : si une personne fait &gt; 50 % des commits, agis."
            ]
        },
        reviewer_rotation: {
            mode: 'coaching',
            why: "Si c'est toujours la même personne qui relit, le savoir se concentre et la revue devient un goulot. Faire <b>tourner les relecteurs</b> diffuse la connaissance et évite le point unique de blocage.",
            steps: [
                "Mets en place une rotation (ou une assignation automatique) des relecteurs.",
                "Encourage les plus juniors à relire aussi (ils apprennent, ils apportent un œil neuf).",
                "Vise plusieurs relecteurs distincts sur la durée, pas un seul référent."
            ]
        },
        regular_activity: {
            mode: 'coaching',
            why: "Une activité régulière (pas de longs trous) est un signe de <b>santé</b> : le projet vit, les intégrations restent petites, les gens gardent le contexte. De longues pauses créent de grosses reprises risquées.",
            steps: [
                "Merge souvent, même de petites choses — évite les longues branches dormantes.",
                "Découpe le travail pour qu'il produise des commits fréquents.",
                "Si le projet est en pause, note-le (sinon les métriques deviennent trompeuses)."
            ]
        },

        // ═══════════ ⚙️ PRATIQUES DEVOPS ═══════════
        feature_flags: {
            mode: 'coaching',
            why: "Les <b>feature flags</b> permettent de livrer du code <b>désactivé</b> puis de l'activer quand on veut (progressivement, pour un sous-ensemble d'users, avec retour arrière instantané). C'est le levier qui découple déploiement et publication — la clé du déploiement fréquent et sûr.",
            steps: [
                "Introduis un flag autour de la nouvelle fonctionnalité (activé/désactivé sans redéployer).",
                "Livre le code éteint, active-le progressivement (canary, %).",
                "Retire le flag une fois la fonctionnalité stabilisée (dette à nettoyer)."
            ],
            module: { name: 'Feature Flag Manager', url: FF }
        },
        ci_versioned: {
            mode: 'create-file', filePath: '.gitlab-ci.yml', commitMsg: 'ci: versionne le pipeline (.gitlab-ci.yml)',
            why: "Avoir sa CI <b>versionnée dans le dépôt</b> (et non configurée à la main dans l'UI) la rend relisible, historisée et revue comme du code. Chaque évolution du pipeline passe par une MR — même rigueur que pour l'appli.",
            steps: [
                "Mets toute la config CI dans <code>.gitlab-ci.yml</code> à la racine.",
                "Évite les réglages « cachés » dans l'interface GitLab.",
                "Fais évoluer la CI par MR, comme le reste."
            ],
            template: "stages:\n  - build\n  - test\n\nbuild:\n  stage: build\n  script:\n    - echo \"TODO: build\"\n\ntest:\n  stage: test\n  script:\n    - echo \"TODO: tests\"\n",
            module: { name: 'Pipeline Generator', url: CI }
        },
        multi_stage_pipeline: {
            mode: 'template',
            why: "Un pipeline en <b>plusieurs étapes</b> (build → test → deploy) sépare les responsabilités et arrête tôt : si le build casse, on ne teste pas ; si les tests cassent, on ne déploie pas. Chaque étape est un garde-fou.",
            steps: [
                "Déclare des <code>stages</code> ordonnés (build, test, deploy).",
                "Range chaque job dans la bonne étape.",
                "Une étape ne démarre que si la précédente est verte."
            ],
            template: "stages:\n  - build\n  - test\n  - deploy\n\nbuild:\n  stage: build\n  script: [ \"make build\" ]\n\ntest:\n  stage: test\n  script: [ \"make test\" ]\n\ndeploy:\n  stage: deploy\n  script: [ \"make deploy\" ]\n  rules:\n    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'\n",
            module: { name: 'Pipeline Generator', url: CI }
        },
        automated_tests: {
            mode: 'template',
            why: "Des <b>tests automatiques</b> dans la CI, c'est le filet qui attrape les régressions avant la prod. Sans eux, chaque déploiement est un pari. Même une petite suite qui tourne à chaque MR change tout niveau confiance.",
            steps: [
                "Ajoute un job <code>test</code> dans ton <code>.gitlab-ci.yml</code>.",
                "Fais-le tourner à chaque MR (feedback avant merge).",
                "Complète progressivement : commence par le cœur métier et les bugs passés."
            ],
            template: "test:\n  stage: test\n  script:\n    - # lance ta suite de tests ici\n    - echo \"TODO: tests\"\n",
            note: "Ton <code>.gitlab-ci.yml</code> existe déjà — colle ce job dedans (je ne l'écrase pas automatiquement).",
            module: { name: 'Pipeline Generator', url: CI }
        },
        automated_deploy: {
            mode: 'template',
            why: "Un <b>déploiement automatisé</b> supprime les gestes manuels, source d'erreurs, et rend chaque livraison <b>reproductible</b>. Un merge sur <code>main</code> = un déploiement, sans intervention humaine fragile.",
            steps: [
                "Ajoute un job <code>deploy</code> déclenché sur <code>main</code>.",
                "Scripte tout le déploiement (aucune étape manuelle).",
                "Commence par l'environnement de test, puis étends."
            ],
            template: "deploy:\n  stage: deploy\n  script:\n    - # commande de déploiement (helm, kubectl, script…)\n    - echo \"TODO: deploy\"\n  environment:\n    name: test\n  rules:\n    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'\n",
            module: { name: 'Pipeline Generator', url: CI }
        },
        env_separation: {
            mode: 'template',
            why: "Séparer les <b>environnements</b> (test / prod) évite le pire : tester sans risquer la prod, et déployer en prod en connaissance de cause. GitLab suit alors « quoi est déployé où », ce qui fiabilise ton score DORA.",
            steps: [
                "Déclare des <code>environment:</code> distincts (test, production).",
                "Un job de déploiement par environnement, avec ses propres règles.",
                "Protège la prod (déclenchement manuel ou sur <code>main</code> uniquement)."
            ],
            template: "deploy_test:\n  stage: deploy\n  script: [ \"echo deploy test\" ]\n  environment: { name: test }\n  rules: [ { if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH' } ]\n\ndeploy_prod:\n  stage: deploy\n  script: [ \"echo deploy prod\" ]\n  environment: { name: production }\n  when: manual   # déclenchement humain volontaire\n  rules: [ { if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH' } ]\n",
            module: { name: 'Pipeline Generator', url: CI }
        },
        rollback_ready: {
            mode: 'template',
            why: "Un <b>rollback</b> prêt et testé, c'est ce qui transforme un incident en non-événement : on revient à la version d'avant en un clic, sans stress ni improvisation. C'est le pilier du MTTR faible.",
            steps: [
                "Ajoute un job <code>rollback</code> manuel qui redéploie la version précédente.",
                "Teste-le <b>avant</b> d'en avoir besoin (un rollback jamais testé n'existe pas).",
                "Garde les versions déployables (tags/artefacts) pour pouvoir y revenir."
            ],
            template: "rollback_prod:\n  stage: deploy\n  script:\n    - # redéploie la version précédente (tag/artefact connu)\n    - echo \"TODO: rollback\"\n  environment: { name: production }\n  when: manual\n  rules: [ { if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH' } ]\n",
            module: { name: 'Pipeline Generator', url: CI }
        }
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = Salsifi.gamingRecipes;

})(typeof window !== 'undefined' ? window : this);
