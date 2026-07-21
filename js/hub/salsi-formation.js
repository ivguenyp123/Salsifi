/*
 * Salsi — Base de connaissance FORMATION (déterministe, sans IA)
 * ------------------------------------------------------------------
 * Chaque doc de formation devient des « entrées » : des mots-clés (déclencheurs)
 * + une réponse courte fidèle au doc. Salsi matche les mots-clés (après
 * normalisation) et répond. Pour ajouter un doc : ajoute son module + ses
 * entrées ci-dessous — aucune autre modif nécessaire.
 *
 * (Quand l'IA arrivera en fallback, elle pourra lire les docs bruts pour ce qui
 *  n'est pas encore couvert ici. Ce fichier reste la couche déterministe.)
 */
(function (global) {
    'use strict';
    var S = global.Salsifi || (global.Salsifi = {});

    S.formation = {
        modules: {
            ff: { num: '07', title: 'Feature Flags & Progressive Delivery', niveau: 'Avancé' }
        },
        // kw = déclencheurs (matchés en sous-chaîne après normalisation) ; a = réponse (html léger).
        entries: [
            {
                mod: 'ff', t: 'Déploiement ≠ activation',
                kw: ['decoupler deploiement', 'deploiement activation', 'deployer sans activer', 'difference deploiement activation', 'deploiement et activation', 'separer deploiement activation', 'deploiement vs activation'],
                a: 'L\'idée centrale des feature flags : on <b>fusionne et déploie le code tôt, mais désactivé (off)</b>, puis on <b>active indépendamment</b> quand on veut, pour qui on veut. Si ça tourne mal, on désactive <b>instantanément</b> — sans rollback ni redéploiement.'
            },
            {
                mod: 'ff', t: 'Bénéfice DORA des flags',
                all: ['flag', 'dora'],
                kw: ['benefice dora', 'flag et dora', 'flags dora', 'flag aide dora', 'flag cfr mttr', 'pourquoi flag dora', 'flag ameliore dora', 'flags aident', 'flag aident', 'aident mes dora', 'flags et dora', 'flags et mes dora', 'flag pour dora', 'flags ameliorent', 'flag baisse cfr', 'flag baisse mttr'],
                a: 'Le flag découple « déployer » (risqué, lent à annuler) de « activer » (instantané, réversible). Il fait <b>chuter le CFR et le MTTR</b> : un incident lié à une fonctionnalité se résout en <b>basculant un flag, en secondes</b> — pas en relançant un pipeline. C\'est aussi ce qui rend le <b>trunk-based</b> viable.'
            },
            {
                mod: 'ff', t: 'Les 4 types de flags',
                kw: ['types de flag', 'type de flag', 'familles de flag', 'quatre types', '4 types', 'taxonomie flag', 'categories de flag', 'sortes de flag'],
                a: 'Quatre familles selon leur durée de vie (taxonomie Fowler) :<br>🚀 <b>Release</b> — cacher du code incomplet (trunk-based), jours→semaines.<br>🧪 <b>Experiment</b> — A/B testing, mesurer un impact, semaines.<br>🛑 <b>Ops</b> — couper une fonctionnalité coûteuse (kill switch), longue durée.<br>👤 <b>Permission</b> — activer selon le profil/abonnement, permanent.<br><span class="sqa-hint">Ne pas confondre leurs durées de vie = première source de dette.</span>'
            },
            {
                mod: 'ff', t: 'Flag de release',
                kw: ['flag de release', 'release flag', 'flag release'],
                a: 'Un flag de <b>release</b> cache du <b>code incomplet</b> le temps du déploiement progressif (trunk-based). Durée de vie <b>jours → semaines</b>. Il change au fil du rollout, et <b>doit disparaître une fois la fonctionnalité à 100 %</b> — sinon c\'est de la dette de flags.'
            },
            {
                mod: 'ff', t: 'Flag d\'experiment',
                kw: ['flag experiment', 'flag d experiment', 'flag experimentation', 'flag a b', 'flag ab testing', 'flag test a b'],
                a: 'Un flag d\'<b>experiment</b> sert à l\'<b>A/B testing</b> : mesurer l\'impact d\'une variante sur un segment. Durée de vie de l\'ordre de <b>semaines</b> ; il change selon l\'expérience en cours.'
            },
            {
                mod: 'ff', t: 'Flag d\'ops (kill switch)',
                kw: ['flag ops', 'flag d ops', 'flag operation', 'flag d operation', 'flag ops kill'],
                a: 'Un flag d\'<b>ops</b> est un <b>disjoncteur</b> : couper instantanément une fonctionnalité coûteuse (export massif, reco chère) en cas de pic de charge ou d\'incident tiers, <b>sans déploiement</b>. Durée de vie longue. C\'est le <b>kill switch</b>.'
            },
            {
                mod: 'ff', t: 'Flag de permission',
                kw: ['flag de permission', 'flag permission', 'permission flag'],
                a: 'Un flag de <b>permission</b> active un comportement <b>selon le profil / l\'abonnement</b> de l\'utilisateur (ex. premium). Il est <b>permanent par nature</b> — à ne pas traiter comme un flag temporaire.'
            },
            {
                mod: 'ff', t: 'Contexte d\'évaluation',
                kw: ['contexte d evaluation', 'contexte evaluation', 'evaluer un flag', 'evaluation flag', 'flag contexte'],
                a: 'Un flag ne répond pas juste « on/off » : il <b>évalue une décision selon un contexte</b> (qui, où, quand — userId + attributs comme country, plan, betaOptIn). C\'est ce qui permet le <b>ciblage</b>.'
            },
            {
                mod: 'ff', t: 'Toujours une valeur par défaut',
                kw: ['valeur par defaut', 'valeur defaut flag', 'flag par defaut', 'flag injoignable', 'service de flag en panne', 'defaut sur'],
                a: 'Chaque évaluation porte une <b>valeur par défaut sûre</b>. Si le service de flags est injoignable, l\'appli <b>continue sur cette valeur</b> — jamais planter. Le flag est une optimisation de pilotage, <b>pas un point de défaillance unique</b>.'
            },
            {
                mod: 'ff', t: 'OpenFeature',
                kw: ['openfeature', 'open feature', 'abstraction flag', 'standard flag', 'cncf flag'],
                a: '<b>OpenFeature</b> (standard CNCF) <b>découple ton code du fournisseur</b> de flags : tu codes contre une API neutre et tu branches le provider de ton choix (Unleash, Flagsmith…). Tu évites le verrouillage à un outil.'
            },
            {
                mod: 'ff', t: 'Stratégies de ciblage (targeting)',
                kw: ['ciblage', 'targeting', 'strategie de ciblage', 'strategies de ciblage', 'cibler', 'segment'],
                a: 'Quatre stratégies de <b>ciblage</b> :<br>• <b>Pourcentage</b> — X % des users (hash stable) → canary fonctionnel.<br>• <b>Attribut</b> — country=FR, plan=premium… → permission / géo.<br>• <b>Liste / segment</b> — users ou équipes nommés → beta interne, dogfooding.<br>• <b>Rings</b> — cercles concentriques interne → beta → tous.'
            },
            {
                mod: 'ff', t: 'Rollout par pourcentage & hash stable',
                kw: ['rollout pourcentage', 'pourcentage utilisateurs', 'hash stable', 'rollout par pourcentage', 'clignote', 'flag clignote'],
                a: 'Pour un rollout à X %, on <b>hashe l\'ID utilisateur de façon stable</b> : un même user reste <b>toujours du même côté</b> du flag tant que le % ne bouge pas. Sans ça, l\'expérience « <b>clignote</b> » (on/off à chaque requête) → UX désastreuse et mesures faussées.'
            },
            {
                mod: 'ff', t: 'Rings (paliers)',
                kw: ['rings', 'cercles concentriques', 'deploiement par paliers', 'anneaux'],
                a: 'Les <b>rings</b> = cercles concentriques de déploiement organisationnel : <b>interne → beta → tous</b>. On élargit l\'audience par paliers en observant à chaque cran.'
            },
            {
                mod: 'ff', t: 'Canary vs Blue/Green vs Feature Flag',
                kw: ['canary', 'blue green', 'blue/green', 'canary vs', 'canary blue green', 'difference canary flag'],
                a: 'Trois leviers complémentaires, à des niveaux différents :<br>🟦 <b>Blue/Green</b> — l\'<b>infra</b> : deux environnements, on bascule le trafic (tout ou rien).<br>🐤 <b>Canary</b> — le <b>trafic réseau</b> : X % vers la nouvelle version (par version).<br>🚩 <b>Feature Flag</b> — le <b>code applicatif</b> : activer une fonctionnalité par segment/user (indépendamment de la version).<br><span class="sqa-hint">On peut faire un canary d\'une version qui contient 10 flags, chacun pour une audience différente.</span>'
            },
            {
                mod: 'ff', t: 'Montée en charge type (progressive delivery)',
                kw: ['montee en charge', 'progressive delivery', 'deploiement progressif', 'rollout progressif', 'monter progressivement', 'palier rollout', '1 10 50 100'],
                a: 'La montée type :<br>1. Déployer avec le flag à <b>off</b> — aucun changement visible.<br>2. Activer pour l\'<b>équipe interne</b>, récolter les retours.<br>3. Activer à <b>1 %</b>, surveiller erreurs/latence/métriques métier.<br>4. Élargir <b>1 → 10 → 50 → 100 %</b> par paliers, en observant.<br>5. À 100 % stable : <b>retirer le flag</b> du code et de la config.'
            },
            {
                mod: 'ff', t: 'Kill switch',
                kw: ['kill switch', 'disjoncteur', 'couper une fonctionnalite', 'coupe circuit', 'kill-switch'],
                a: 'Le <b>kill switch</b> (flag d\'ops) coupe instantanément une fonctionnalité coûteuse, <b>sans déploiement</b>. Idéalement couplé à une <b>dégradation gracieuse</b> (basculer sur un fallback simple plutôt que tomber).<br><span class="sqa-hint">⚠️ Il doit rester fiable même si le service de flags est en panne : cache local rafraîchi + valeur par défaut sûre.</span>'
            },
            {
                mod: 'ff', t: 'Dégradation gracieuse',
                kw: ['degradation gracieuse', 'fallback', 'degrader au lieu de tomber', 'mode degrade'],
                a: 'Coupler le kill switch à une <b>dégradation gracieuse</b> : quand on coupe la fonctionnalité coûteuse, on <b>bascule sur un fallback simple</b> (ex. recommandations statiques) au lieu de planter. L\'appli reste <b>dégradée mais stable</b>.'
            },
            {
                mod: 'ff', t: 'La dette de flags',
                kw: ['dette de flag', 'dette de flags', 'flag mort', 'flags morts', 'code mort flag', 'trop de flag', 'nettoyer les flag'],
                a: 'Chaque flag est un <b>if de plus</b> à tester et comprendre. Les <b>flags morts</b> (à 100 % mais jamais retirés) transforment le code en labyrinthe.<br><b>Symptômes</b> : flags à 100 % depuis des mois, combinaisons que personne n\'ose tester, code mort sous des flags off oubliés.<br><b>Discipline</b> : date d\'<b>expiration</b>, un <b>propriétaire</b>, un <b>ticket de nettoyage</b> créé dès la mise à 100 %, un <b>audit régulier</b>.'
            },
            {
                mod: 'ff', t: 'Un flag de release est un emprunt',
                kw: ['flag emprunt', 'flag est un emprunt', 'emprunt velocite', 'dette velocite flag'],
                a: 'Un flag de release, c\'est un <b>emprunt</b> : tu empruntes de la <b>vélocité</b> (livrer tôt, sans risque) contre une <b>dette</b> (un if à rembourser). Un emprunt sain se rembourse vite → <b>retire le flag une fois la fonctionnalité stable à 100 %</b>, sinon l\'intérêt s\'accumule en complexité.'
            },
            {
                mod: 'ff', t: 'Où stocker l\'état des flags',
                kw: ['ou stocker', 'stocker les flag', 'stocker mes flag', 'stocker un flag', 'stockage flag', 'stockage des flag', 'stocker l etat', 'unleash flagsmith', 'unleash', 'flagsmith', 'service de flag'],
                a: 'Trois options :<br>• <b>Service dédié</b> (Unleash, Flagsmith…) — ciblage riche, UI, audit, SDK ; mais une dépendance de plus.<br>• <b>Config GitOps</b> — versionné, auditable, réconcilié ; mais changement = commit (moins instantané).<br>• <b>Base / cache distribué</b> — simple et très rapide ; mais pas de ciblage/UI sans dev maison.'
            },
            {
                mod: 'ff', t: 'Flags et GitOps (tension)',
                kw: ['flag gitops', 'flags et gitops', 'gitops flag', 'flag dans git', 'tension gitops'],
                a: 'Mettre les flags dans <b>Git (GitOps)</b> donne l\'<b>audit et la réconciliation</b>, mais un kill switch « par commit » est <b>plus lent</b> qu\'un toggle d\'UI. Compromis fréquent : <b>flags de release en GitOps</b> (changements planifiés), <b>flags d\'ops dans un service à bascule instantanée</b>.'
            },
            {
                mod: 'ff', t: 'Audit & traçabilité des flags',
                kw: ['audit flag', 'tracabilite flag', 'historique flag', 'qui a change le flag', 'health score flag'],
                a: 'En environnement régulé : tracer <b>qui a changé quel flag, quand, pour quelle audience</b>. Garder l\'<b>historique des évaluations agrégées</b> (corréler un incident à une activation) et un <b>health score</b> par flag (taux d\'erreur on vs off).'
            }
        ]
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = S.formation;
})(typeof window !== 'undefined' ? window : this);
