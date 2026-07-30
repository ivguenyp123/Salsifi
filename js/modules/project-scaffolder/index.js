/* project-scaffolder · index.js — entrée & câblage (chargé en dernier). */

        const auth = loadAuth();

        if (!auth) { window.location.href = 'login.html'; }


        const repoId = new URLSearchParams(location.search).get('repo');

        if (!repoId) { window.location.href = HUB_URL; }

        // sessionData conserve les mêmes champs que le moteur attend ;
        // gitlabUrl (web_url du repo) et projectName sont remplis après fetch.

        const sessionData = {
            gitlabBaseUrl: auth ? auth.gitlabUrl : null, // racine instance → /api/v4
            gitlabUrl: null,                              // web_url du repo (clone + lien MR)
            gitlabToken: auth ? auth.token : null,
            projectName: null,
            projectId: repoId
        };

        // Description du projet (utilisée dans les templates)

        let projectDescription = '';

        // Charge le repo cible depuis GitLab puis amorce l'UI.

        async function boot() {
            // Tous les liens retour pointent sur le nouveau hub
            document.querySelectorAll('[data-hub-link]').forEach(a => { a.href = HUB_URL; });
            // Salsi dans l'en-tête (mascotte + sous-titre), si le SVG est chargé.
            try {
                const bell = document.querySelector('.bell');
                if (bell && window.Salsifi && Salsifi.mascotSVG) { bell.classList.add('salsi'); bell.innerHTML = Salsifi.mascotSVG('proud'); }
                const h1 = document.querySelector('.top-meta h1'); if (h1) h1.textContent = 'Scaffold · Salsi';
            } catch (e) { /* header cosmétique, non bloquant */ }
            try {
                const project = await gitlabAPI(`/projects/${sessionData.projectId}`);
                sessionData.projectName = project.name;
                sessionData.gitlabUrl   = project.web_url;
                projectDescription      = project.description || '';
                document.getElementById('headerProjectName').textContent = project.name;

                // ⛔ GARDE-FOU : ne JAMAIS scaffolder un repo qui a du contenu.
                const guard = await checkRepoScaffoldable(project);
                if (!guard.ok) {
                    showBlocked(guard.reason, guard.detail);
                    return; // wizard jamais affiché → aucun write possible
                }

                startConcierge(false);
            } catch (e) {
                console.error('Erreur chargement du repo:', e);
                alert("Impossible de charger le repo sélectionné.\n\n" + e.message + "\n\nRetour au Hub.");
                window.location.href = HUB_URL;
            }
        }

        // ============================================
        // GARDE-FOU "REPO VIDE" — bloque toute écriture destructive
        // ============================================
        // Autorisé : repo neuf, branche par défaut avec au plus un README/.gitignore/LICENSE
        // et un seul commit. Tout le reste = refus, on ne touche à rien.

        const SCAFFOLD_ALLOWLIST = new Set([
            'README.md', 'readme.md', 'Readme.md', 'README', 'README.rst',
            '.gitignore', 'LICENSE', 'LICENSE.md', 'LICENCE', 'license'
        ]);


        let currentStep = 1;

        const totalSteps = 4;
        

        const config = {
            workflow: 'gitflow',
            stack: 'java',
            framework: null,
            options: {
                kustomize: true,
                gitlabCi: true,
                dockerfile: false,
                editorconfig: true,
                protectMain: true,
                protectDevelop: false
            }
        };

        // ============================================
        // SCAFFOLD — moteur conversationnel (remplace le wizard)
        // Le noyau déduit le flow ; la conversation remplit `config`,
        // puis on lance le VRAI initializeProject() (écriture GitLab).
        // ============================================

        // Le moteur réel appelle loadingOverlay.classList : on neutralise
        // (le pipeline est désormais rendu dans le fil de discussion).

        const loadingOverlay = { classList: { add() {}, remove() {} } };


        let thread, toastEl;

        /* ─── Catalogue des flows (pick → clé config du moteur) ─── */

        const FLOWS = {
            trunk:   { ic: '🪵', name: 'Trunk-based',       cfg: 'trunk',
                sub: "Une seule branche principale, sur laquelle tout le monde fusionne très souvent.",
                desc: "Il n'y a qu'une branche vivante : <code>main</code>. Chacun y intègre son travail plusieurs fois par jour, en tout petits morceaux. Le code pas encore fini n'est <b>pas</b> isolé dans une branche à part : il est fusionné dans <code>main</code> mais masqué derrière des <b>feature flags</b> (les interrupteurs). Résultat : aucune branche qui traîne, une intégration permanente, une mise en prod très rapide. En contrepartie, ça <b>exige</b> des feature flags et une CI fiable." },
            gitflow: { ic: '🌿', name: 'Gitflow',           cfg: 'gitflow',
                sub: "Des branches dédiées par étape : develop, release/*, hotfix/*.",
                desc: "Deux branches durables : <code>main</code> (le reflet exact de la prod) et <code>develop</code> (là où tout s'intègre). On prépare chaque version sur une branche <code>release/*</code>, et on corrige un incident de prod en urgence via <code>hotfix/*</code>. Très structuré et prévisible, pensé pour livrer des <b>versions datées</b> — mais plus lourd et plus lent au quotidien." },
            feature: { ic: '🌱', name: 'Feature branching', cfg: 'feature-branching',
                sub: "Une branche courte par fonctionnalité, fusionnée dans main via une MR relue.",
                desc: "Pour chaque tâche, on crée une branche <code>feature/*</code> courte, on développe dessus, puis on la fusionne dans <code>main</code> via une Merge Request relue. Simple à comprendre, bon isolement du travail, et <b>pas besoin de feature flags</b>. Le compromis classique : moins rapide que le trunk, moins carré que Gitflow, mais rarement un mauvais choix." },
        };
        // clé moteur → clé FLOWS (pour re-afficher un flow choisi en direct)

        const CFG_TO_FLOW = { trunk: 'trunk', gitflow: 'gitflow', 'feature-branching': 'feature' };

        /* ─── Catalogue des stacks (aligné sur le moteur) ─── */

        const STACKS = [
            ['☕', 'Java',              'Maven + Spring',        'java'],
            ['🟢', 'Node',              'package.json',          'node'],
            ['🐍', 'Python',            'pyproject + requirements', 'python'],
            ['🅰️', 'Angular',           'package.json + angular.json', 'angular'],
            ['🔷', '.NET',              'csproj',                'dotnet'],
            ['📟', 'COBOL / Mainframe', 'structure DBB + JCL',   'cobol'],
            ['📦', 'Vide',              'juste la structure Git', 'empty'],
        ];

        /* ─── Frameworks par stack (question posée après le langage) ───
         * Les stacks absentes ici (angular, cobol, empty) n'ont pas de
         * question framework : le framework est implicite ou non pertinent. */

        const FRAMEWORKS = {
            java:   [['🍃','Spring Boot',   'jar autoportant, le plus courant',      'spring'],
                     ['🏛️','Jakarta EE',    'ex-J2EE, war déployé sur serveur d\'app','jakarta'],
                     ['⚡','Quarkus',       'cloud-native, démarrage éclair',        'quarkus']],
            node:   [['🚂','Express',       'minimaliste, ultra répandu',            'express'],
                     ['🐦','NestJS',        'structuré, TypeScript, à la Angular',   'nest'],
                     ['🍱','Fastify',       'léger et très rapide',                  'fastify']],
            python: [['⚡','FastAPI',       'API async moderne',                     'fastapi'],
                     ['🎸','Django',        'framework complet, batteries incluses', 'django'],
                     ['🧪','Flask',         'micro-framework souple',                'flask']],
            dotnet: [['🌐','ASP.NET Core Web API', 'API REST à contrôleurs',         'webapi'],
                     ['✨','Minimal API',   'endpoints légers, sans contrôleurs',    'minimal']],
        };
        // Retourne [ic, nom, sub, val] du framework courant, ou null.

        const SIGNALS = [
            {key:'flags',
             q:"Première chose, la plus déterminante : les <b>feature flags</b>.<br><br>"
             + "Un feature flag, c'est un simple <b>interrupteur dans le code</b> (souvent un <code>if</code> piloté par une config) qui <b>active ou masque une fonctionnalité en production, sans changer de branche</b>. Ça permet de fusionner du code pas encore fini sans que l'utilisateur le voie : on allume l'interrupteur le jour où c'est prêt.<br><br>"
             + "👉 À ne pas confondre avec une <b>branche</b> : la branche isole le code <i>avant</i> de le fusionner ; le flag masque du code <i>déjà fusionné et parti en prod</i>. C'est ce qui rend le trunk-based possible.<br><br>"
             + "Votre équipe s'en sert ?",
             opts:[['🚩',"Oui, on s'en sert","des flags en place",true],['🚫','Non','pas de flags',false],['🤷','On ne connaît pas',"on part sans, alors",false]]},
            {key:'merge',
             q:"Vous <b>fusionnez</b> votre travail dans la branche principale à quelle fréquence ? (autrement dit : au bout de combien de temps votre code rejoint celui des autres)",
             opts:[['🔄','Chaque jour ou presque','petites intégrations continues','daily'],['🗓️','Quelques fois par semaine','par petits lots','week'],['📦','Quand la fonctionnalité est finie','plus grosses intégrations','done']]},
            {key:'team', q:"Vous êtes <b>combien</b> à pousser sur ce repo ?",
             opts:[['👤','1 à 4','petite équipe','small'],['👥','5 à 12','équipe moyenne','mid'],['🏢','Plus de 12','grande équipe','large']]},
            {key:'cad', q:"Dernier point : la <b>mise en production</b>, c'est à quel rythme ?",
             opts:[['⚡','Plusieurs fois par semaine','flux continu','daily'],['🗓️','Par sprint / à date régulière','rythme cadencé','sprint'],['📌','Par version datée / jalon','releases planifiées','release']]},
        ];

        /* ─── Noyau déterministe : déduire le flow ─── */
        // Note : la CI n'est plus demandée — les projets partent sur la CI LCL
        // par défaut, qu'on considère fiable. Le prérequis « CI solide » du trunk
        // est donc couvert d'office (voir le pro ci-dessous).

        let answers = {}, qi = 0, deduced = null, visits = 0, chosenFlow = null;

        /* ─── Entrée : appelée par boot() après auth + repo + garde-fou ─── */

        boot();
