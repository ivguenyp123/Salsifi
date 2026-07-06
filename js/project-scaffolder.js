        // ============================================
        // AUTH + REPO — modèle plateforme (aligné DevOps Hub)
        // Token : localStorage 'devops_hub_workspaces' = { gitlabUrl, token, username }
        // Repo  : passé en query param ?repo=<id> par la modal "Démarrer" du Hub
        // ============================================
        const STORAGE_KEY = 'devops_hub_workspaces';

        // ⚠️ Nom de page du NOUVEAU hub (le seul endroit à changer pour les liens retour).
        // Le mockup V2 est désormais le hub. Si tu le renommes (ex. hub.html en prod), change ici.
        const HUB_URL = 'hub.html';

        function loadAuth() {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            try {
                const data = JSON.parse(raw);
                if (!data.gitlabUrl || !data.token) return null;
                return data;
            } catch { return null; }
        }

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

        async function checkRepoScaffoldable(project) {
            // Cas 1 : repo totalement vide (aucun commit / pas de branche par défaut).
            // Le moteur fait `update README.md` et branche depuis `main` → il LUI FAUT un README initial.
            if (project.empty_repo || !project.default_branch) {
                return {
                    ok: false,
                    reason: "Ce repo n'a pas encore de branche par défaut.",
                    detail: "Initialise-le côté GitLab avec un README (option « Initialize repository with a README ») puis relance « Démarrer »."
                };
            }
            const branch = project.default_branch;

            // Cas 2 : contenu à la racine de la branche par défaut.
            let tree;
            try {
                tree = await gitlabAPI(`/projects/${project.id}/repository/tree?ref=${encodeURIComponent(branch)}&per_page=100`);
            } catch (e) {
                // Par sécurité, en cas de doute on bloque plutôt que de risquer un écrasement.
                return {
                    ok: false,
                    reason: "Impossible de vérifier le contenu du repo.",
                    detail: "Vérification de sécurité échouée (" + e.message + "). Initialisation annulée par prudence."
                };
            }
            const meaningful = (tree || []).filter(e => !SCAFFOLD_ALLOWLIST.has(e.name));
            if (meaningful.length > 0) {
                const sample = meaningful.slice(0, 4).map(e => e.name).join(', ');
                return {
                    ok: false,
                    reason: "Ce repo n'est pas vide.",
                    detail: `${meaningful.length} élément(s) déjà présent(s) à la racine de « ${branch} » (ex. ${sample}${meaningful.length > 4 ? '…' : ''}). Initialisation annulée pour ne rien écraser.`
                };
            }

            // Cas 3 : historique (plus d'un commit) → on bloque par prudence même si la racine est "propre".
            try {
                const commits = await gitlabAPI(`/projects/${project.id}/repository/commits?per_page=2&ref_name=${encodeURIComponent(branch)}`);
                if (Array.isArray(commits) && commits.length > 1) {
                    return {
                        ok: false,
                        reason: "Ce repo a déjà un historique.",
                        detail: `Plusieurs commits sur « ${branch} ». Initialisation annulée par prudence — le Scaffolder est réservé aux repos neufs.`
                    };
                }
            } catch (e) {
                console.warn('Vérif commits non concluante (on continue) :', e.message);
            }

            return { ok: true };
        }

        function showBlocked(reason, detail) {
            const t = document.getElementById('thread');
            if (t) t.innerHTML = `<div class="blocked-wrap"><h2>\ud83d\uded1 ${esc(reason)}</h2>`
                + `<p>${esc(detail)}</p>`
                + `<p>Le Concierge ne touche qu'aux repos neufs. <a href="${HUB_URL}" data-hub-link>\u2190 Retour au hub</a></p></div>`;
        }

        // ============================================
        // STATE
        // ============================================
        let currentStep = 1;
        const totalSteps = 4;
        
        const config = {
            workflow: 'gitflow',
            stack: 'java',
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
        // CONCIERGE — moteur conversationnel (remplace le wizard)
        // Le noyau déduit le flow ; la conversation remplit `config`,
        // puis on lance le VRAI initializeProject() (écriture GitLab).
        // ============================================

        // Le moteur réel appelle loadingOverlay.classList : on neutralise
        // (le pipeline est désormais rendu dans le fil de discussion).
        const loadingOverlay = { classList: { add() {}, remove() {} } };

        let thread, toastEl;

        /* ─── Catalogue des flows (pick → clé config du moteur) ─── */
        const FLOWS = {
            trunk:   { ic: '🪵', name: 'Trunk-based',       cfg: 'trunk',            sub: "Une branche principale, features éphémères derrière des feature flags." },
            gitflow: { ic: '🌿', name: 'Gitflow',           cfg: 'gitflow',          sub: "develop + release/* + hotfix/*. Structuré, fait pour les versions." },
            feature: { ic: '🌱', name: 'Feature branching', cfg: 'feature-branching', sub: "Branches feature/* courtes, MR vers main. Le choix d'équilibre." },
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

        /* ─── Les 5 signaux (séquence maïeutique) — que du concret ─── */
        const SIGNALS = [
            {key:'flags', q:"Première chose, la plus déterminante : votre équipe utilise des <b>feature flags</b> ? (masquer du code pas fini en prod)",
             opts:[['🚩',"Oui, on s'en sert","feature flags en place",true],['🚫','Non, pas vraiment','pas de flags',false],['🤷','Je ne sais pas',"on n'en utilise pas alors",false]]},
            {key:'fast', q:"Vous livrez plutôt <b>en continu</b> (plusieurs fois par semaine) ou <b>par versions</b> datées ?",
             opts:[['⚡','En continu','déploiements fréquents',true],['📦','Par versions','releases planifiées',false]]},
            {key:'team', q:"Vous êtes <b>combien</b> à pousser sur ce repo ?",
             opts:[['👤','1 à 4','petite équipe','small'],['👥','5 à 12','équipe moyenne','mid'],['🏢','Plus de 12','grande équipe','large']]},
            {key:'cad', q:"Et la <b>cadence</b> de mise en prod, c'est plutôt…",
             opts:[['🔄','Plusieurs fois/jour','flux continu','daily'],['🗓️','Par sprint / semaine','rythme régulier','sprint'],['📌','Par version datée','jalonné','release']]},
            {key:'ci', q:"Dernier point : votre <b>CI/CD</b>, vous la diriez comment ? (tests auto, pipeline fiable)",
             opts:[['🟢',"Solide, on a confiance",'CI mature','high'],['🟡','Correcte, perfectible','CI moyenne','mid'],['🔴','Fragile ou quasi absente','CI faible','low']]},
        ];

        /* ─── Noyau déterministe : déduire le flow ─── */
        function deduceFlow(s){
            const reasons = {trunk:[], gitflow:[], feature:[]};
            if(s.flags){ reasons.trunk.push(['pro','🚩','Feature flags en place',"le prérequis n°1 du trunk"]); }
            else { reasons.trunk.push(['con','🚩','Pas de feature flags','trunk devient risqué sans eux']); }
            if(s.fast){ reasons.trunk.push(['pro','⚡','Livraison continue','colle au flux du trunk']);
                        reasons.feature.push(['pro','⚡','Rythme soutenu','features courtes adaptées']); }
            else { reasons.gitflow.push(['pro','📦','Livraison par versions','ce pour quoi Gitflow est fait']); }
            if(s.team==='large'){ reasons.gitflow.push(['pro','🏢','Grande équipe','la structure release/* aide à coordonner']);
                                  reasons.feature.push(['pro','🏢','Beaucoup de monde',"l'isolation par branche limite les collisions"]); }
            else if(s.team==='small'){ reasons.trunk.push(['pro','👤','Petite équipe','coordination légère, trunk fluide']); }
            if(s.cad==='daily'){ reasons.trunk.push(['pro','🔄','Plusieurs déploiements/jour','trunk est taillé pour ça']); }
            else if(s.cad==='release'){ reasons.gitflow.push(['pro','📌','Versions datées','hotfix/* et release/* prennent tout leur sens']); }
            else { reasons.feature.push(['pro','🗓️','Rythme par sprint','MR régulières vers main']); }
            if(s.ci==='high'){ reasons.trunk.push(['pro','🟢','CI solide',"trunk EXIGE une CI fiable — vous l'avez"]); }
            else if(s.ci==='low'){ reasons.trunk.push(['con','🔴','CI fragile','trunk casserait main en continu']);
                                   reasons.gitflow.push(['pro','🟢','CI perfectible','les paliers de Gitflow pardonnent davantage']); }

            let score = {trunk:0, gitflow:0, feature:1};
            if(s.flags && s.ci!=='low'){ score.trunk += 2; if(s.fast)score.trunk++; if(s.cad==='daily')score.trunk++; if(s.team==='small')score.trunk++; if(s.ci==='high')score.trunk++; }
            else { score.trunk = -2; }
            if(!s.fast || s.cad==='release'){ score.gitflow += 2; }
            if(s.team==='large') score.gitflow++;
            if(s.ci==='low') score.gitflow++;
            if(s.cad==='release') score.gitflow++;
            if(s.team!=='large') score.feature++;
            if(s.cad==='sprint') score.feature++;
            if(!s.flags && s.fast) score.feature++;

            const ranked = Object.entries(score).sort((a,b)=>b[1]-a[1]);
            const pick = ranked[0][0];
            const gap = ranked[0][1]-ranked[1][1];
            const conf = Math.max(62, Math.min(96, 70 + gap*9));
            return {pick, reasons:reasons[pick], score, ranked, conf};
        }

        /* ─── État conversation ─── */
        let answers = {}, qi = 0, deduced = null, visits = 0, chosenFlow = null;

        /* ─── Entrée : appelée par boot() après auth + repo + garde-fou ─── */
        function startConcierge(reset){
            thread = document.getElementById('thread');
            toastEl = document.getElementById('toast');
            thread.innerHTML = ''; answers = {}; qi = 0; deduced = null; chosenFlow = null;
            if(reset){ visits++; try{ sessionStorage.setItem('cc_visits', visits); }catch(e){} }
            else { try{ visits = +(sessionStorage.getItem('cc_visits') || 0); }catch(e){ visits = 0; } }
            const expert = visits >= 1;
            document.getElementById('expertBadge').classList.toggle('on', expert);
            const repo = sessionData.projectName || 'ton repo';

            if(expert){
                bot(`Re 👋 <code>${esc(repo)}</code> ? Même contexte que la dernière fois (petite équipe, flags, CI solide) ?`, ()=>{
                    quick([
                        ['⚡','Oui, pareil','je redéduis direct', ()=>{ mine('Même contexte'); answers={flags:true,fast:true,team:'small',cad:'daily',ci:'high'};
                            botThink(()=>{ deduced=deduceFlow(answers); bot("Alors c'est limpide :", showReco); }); }],
                        ['🎛️','Non, c\'est différent','repose les questions', ()=>{ visits=0; document.getElementById('expertBadge').classList.remove('on'); mine("C'est différent cette fois"); startFlowSequence(); }],
                    ]);
                });
                return;
            }

            bot(`Salut 👋 <code>${esc(repo)}</code> est tout neuf. Avant de générer quoi que ce soit, il y a <b>une</b> décision qui compte vraiment et qui t'engagera pour des mois : <b>le flow Git</b>.`, ()=>{
                botThink(()=> bot("Pas besoin d'être expert Git — je te pose 5 petites questions de contexte, et je te recommande le bon. Tu valides ou tu contestes. On y va ?", ()=>{
                    quick([
                        ['🎯','Allons-y','guide-moi', ()=>{ mine('Allons-y'); startFlowSequence(); }],
                        ['🧠','Je sais déjà lequel je veux','je te le dis', ()=>{ mine('Je sais déjà'); pickFlowDirect(); }],
                    ]);
                }));
            });
        }

        /* ─── séquence maïeutique : une question à la fois ─── */
        function startFlowSequence(){ qi=0; answers={}; askSignal(); }
        function askSignal(){
            if(qi>=SIGNALS.length){ runDeduction(); return; }
            const sg = SIGNALS[qi];
            botThink(()=>{
                bot(sg.q, ()=>{
                    qmeta();
                    quick(sg.opts.map(([ic,title,sub,val])=>[ic,title,sub,()=>{
                        answers[sg.key]=val; mine(title); qi++; askSignal();
                    }]));
                });
            }, qi===0?500:680);
        }
        function qmeta(){
            const c=document.createElement('div'); c.className='qmeta';
            let dots=''; for(let k=0;k<SIGNALS.length;k++){ dots+=`<i class="${k<qi?'done':k===qi?'cur':''}"></i>`; }
            c.innerHTML = `question ${qi+1} / ${SIGNALS.length} <span class="qdots">${dots}</span>`;
            thread.appendChild(c); scroll();
        }
        function runDeduction(){
            botThink(()=>{
                deduced = deduceFlow(answers);
                bot("Voilà, j'ai tout ce qu'il me faut. Je croise les 5 signaux…", showReco);
            }, 950);
        }

        /* ─── LA RECO : raisonnement visible ─── */
        function showReco(){
            const f = FLOWS[deduced.pick];
            const wrap=document.createElement('div'); wrap.className='reco';
            let sig = deduced.reasons.map(([type,ic,t,w])=>`
                <div class="signal ${type}"><span class="sg-ic">${type==='pro'?'✓':'⚠'}</span>
                <span class="sg-tx"><b>${t}</b> — ${w}</span></div>`).join('');
            if(!sig) sig = `<div class="signal pro"><span class="sg-ic">✓</span><span class="sg-tx">Choix d'équilibre, sans contre-indication forte.</span></div>`;
            wrap.innerHTML = `
                <div class="reco-top">
                    <div class="reco-tag">MA RECOMMANDATION</div>
                    <div class="reco-name">${f.ic} ${f.name}<span class="reco-conf">${deduced.conf}% sûr</span></div>
                    <div class="reco-sub">${f.sub}</div>
                </div>
                <div class="reco-why">
                    <div class="reco-why-h">POURQUOI — ce qui a pesé dans ta situation</div>
                    ${sig}
                </div>
                <div class="reco-foot">
                    <button class="pbtn go" data-go>Parfait, on part là-dessus</button>
                    <button class="pbtn alt" data-no>Pas convaincu, montre les autres</button>
                </div>`;
            thread.appendChild(wrap); scroll();
            wrap.querySelector('[data-go]').onclick=()=>{ wrap.querySelector('.reco-foot').remove(); acceptFlow(deduced.pick); };
            wrap.querySelector('[data-no]').onclick=()=>{ wrap.style.opacity=.55; showAlternatives(); };
        }

        /* ─── contester : alternatives avec lucidité ─── */
        function showAlternatives(){
            botThink(()=> bot("Carrément, c'est ta décision. Voilà les deux autres, avec ce que ça impliquerait <b>pour ta situation précise</b> — sans te le cacher :", ()=>{
                const others = deduced.ranked.filter(([k])=>k!==deduced.pick);
                const c=document.createElement('div'); c.className='alts';
                others.forEach(([k,sc])=>{
                    const f=FLOWS[k];
                    const risky = (k==='trunk' && (!answers.flags || answers.ci==='low'));
                    const fit = sc<=0 ? 'déconseillé ici' : sc<2 ? 'possible' : 'solide aussi';
                    let why='';
                    if(k==='trunk'&&!answers.flags) why="Sans feature flags, tu pousserais du code non fini en prod. Techniquement jouable, mais c'est le piège classique.";
                    else if(k==='trunk'&&answers.ci==='low') why="Trunk exige une CI béton ; avec une CI fragile, main casserait souvent.";
                    else if(k==='gitflow'&&answers.fast) why="Solide, mais ses paliers release/* ralentiraient ton rythme continu.";
                    else if(k==='gitflow') why="Très structuré — un peu lourd si l'équipe est petite, mais sûr.";
                    else if(k==='feature') why="Le compromis sûr : moins optimal que ma reco ici, mais jamais un mauvais choix.";
                    else if(k==='trunk') why="Viable vu tes signaux, mais demande de la discipline d'équipe.";
                    const card=document.createElement('div'); card.className='alt-card'+(risky?' warn':'');
                    card.innerHTML=`<div class="ac-top"><span>${f.ic}</span><span class="ac-name">${f.name}</span><span class="ac-fit">${fit}</span></div><div class="ac-why">${risky?'⚠ ':''}${why}</div>`;
                    card.onclick=()=>{ mine('Je préfère '+f.name); if(risky){ confirmRisky(k); } else { acceptFlow(k); } };
                    c.appendChild(card);
                });
                const back=document.createElement('div'); back.className='alt-card';
                back.innerHTML=`<div class="ac-top"><span>↩️</span><span class="ac-name">Finalement, je garde ta reco</span><span class="ac-fit">${FLOWS[deduced.pick].name}</span></div>`;
                back.onclick=()=>{ mine('Je garde ta reco'); acceptFlow(deduced.pick); };
                c.appendChild(back);
                thread.appendChild(c); scroll();
            }));
        }
        function confirmRisky(k){
            botThink(()=> bot("Ok — je te suis, c'est toi qui décides. Juste pour être clair : je le mettrai en place proprement, mais le risque que je t'ai signalé reste réel. On y va quand même ?", ()=>{
                quick([
                    ['✅','Oui, je sais ce que je fais','en conscience', ()=>{ mine('Oui, en conscience'); acceptFlow(k); }],
                    ['↩️','Non, reviens à ta reco','plus prudent', ()=>{ mine('Reviens à ta reco'); acceptFlow(deduced.pick); }],
                ]);
            }));
        }

        /* ─── flow accepté → on écrit config puis on demande la stack ─── */
        function acceptFlow(k){
            chosenFlow = k;
            config.workflow = FLOWS[k].cfg;
            config.options.protectDevelop = (config.workflow === 'gitflow');
            botThink(()=> bot(`Excellent. <b>${FLOWS[k].name}</b>, c'est noté 🔒 Deux derniers points et je te montre tout :`, askStack));
        }
        function pickFlowDirect(){
            botThink(()=> bot("Vas-y, lequel ?", ()=>{
                quick(Object.entries(FLOWS).map(([k,f])=>[f.ic,f.name,f.sub.split('.')[0],()=>{
                    mine(f.name); acceptFlow(k);
                }]));
            }));
        }

        /* ─── stack ─── */
        function askStack(){
            botThink(()=> bot("La <b>techno principale</b> du projet, c'est laquelle ? (je génère la structure et le pipeline adaptés)", ()=>{
                quick(STACKS.map(([ic,title,sub,val])=>[ic,title,sub,()=>{
                    config.stack = val; mine(title); askDocker();
                }]));
            }));
        }

        /* ─── docker ─── */
        function askDocker(){
            botThink(()=> bot("Tu veux un <b>Dockerfile</b> prêt à l'emploi ? (image multi-stage)", ()=>{
                quick([
                    ['🐳','Oui, ajoute Docker','multi-stage', ()=>{ config.options.dockerfile = true; mine('Oui, Docker'); showRecap(); }],
                    ['🙅','Non merci','pas de Docker', ()=>{ config.options.dockerfile = false; mine('Pas de Docker'); showRecap(); }],
                ]);
            }));
        }

        /* ─── recap éditable ─── */
        function showRecap(){
            const f = FLOWS[chosenFlow] || FLOWS.feature;
            const stackLabel = (STACKS.find(s=>s[3]===config.stack) || ['📦','Vide'])[1];
            const stackIc = (STACKS.find(s=>s[3]===config.stack) || ['📦'])[0];
            const wrap=document.createElement('div'); wrap.className='recap';
            wrap.innerHTML=`
                <div class="recap-h">✨ Ce que je vais créer</div>
                <div class="recap-rows">
                    <div class="recap-row"><span class="ri">${stackIc}</span><span class="rl">stack</span><span class="rv">${esc(stackLabel)}</span><span class="redit" data-e="stack">changer</span></div>
                    <div class="recap-row"><span class="ri">${f.ic}</span><span class="rl">flow</span><span class="rv">${f.name}</span><span class="redit" data-e="flow">changer</span></div>
                    <div class="recap-row"><span class="ri">🐳</span><span class="rl">docker</span><span class="rv">${config.options.dockerfile?'Oui, multi-stage':'Non'}</span><span class="redit" data-e="docker">changer</span></div>
                    <div class="recap-row"><span class="ri">🦊</span><span class="rl">ci</span><span class="rv">Template LCL · ${esc(config.stack)} · ${config.workflow}</span></div>
                </div>
                <div class="recap-foot">
                    <button class="pbtn go" data-go style="background:linear-gradient(135deg,var(--cc-warm),var(--cc-pink));color:#1a1018">C'est parfait, montre le périmètre</button>
                    <button class="pbtn alt" data-no>Un détail à changer</button>
                </div>`;
            thread.appendChild(wrap); scroll();
            wrap.querySelector('[data-go]').onclick=()=>{ wrap.querySelector('.recap-foot').remove(); showScope(); };
            wrap.querySelector('[data-no]').onclick=()=>{ wrap.style.opacity=.5; botThink(()=>bot("Dis-moi quoi 👍",()=>{
                quick([
                    ['🌿','Le flow','revenir dessus',()=>{ mine('Le flow'); startFlowSequence(); }],
                    ['🧱','La stack','changer de techno',()=>{ mine('La stack'); askStack(); }],
                    ['🐳','Docker','activer / désactiver',()=>{ mine('Docker'); askDocker(); }],
                ]);
            })); };
            wrap.querySelectorAll('.redit').forEach(el=>el.onclick=()=>{
                wrap.style.opacity=.5;
                if(el.dataset.e==='flow'){ mine('Revoir le flow'); startFlowSequence(); }
                else if(el.dataset.e==='stack'){ mine('Revoir la stack'); askStack(); }
                else { mine('Revoir Docker'); askDocker(); }
            });
        }

        /* ─── scope : périmètre d'exécution avant d'agir ─── */
        function showScope(){
            const branch = config.workflow==='gitflow' ? 'develop' : 'main';
            const dockerLine = config.options.dockerfile ? ' + Dockerfile' : '';
            const sc=document.createElement('div'); sc.className='scope';
            sc.innerHTML=`
                <div class="scope-h">🔒 périmètre d'exécution</div>
                <div class="scope-body">
                    <div class="scope-line"><span class="si sok">✓</span><span>Initialiser la structure <b>${FLOWS[chosenFlow].name}</b> (branche cible <b>${branch}</b>)</span></div>
                    <div class="scope-line"><span class="si sok">✓</span><span>Écrire les fichiers <b>${esc(config.stack)}</b>${dockerLine} + le <code>.gitlab-ci.yml</code> adapté</span></div>
                    <div class="scope-line"><span class="si sok">✓</span><span>Ouvrir une <b>Merge Request</b></span></div>
                    <div class="scope-line"><span class="si sno">✕</span><span class="sno">Aucun merge. Aucun déploiement. Aucun push direct.</span></div>
                </div>`;
            thread.appendChild(sc); scroll();
            botThink(()=> bot("Je lance ?", ()=>{
                quick([
                    ['🚀','Oui, prépare la MR','je validerai le merge', ()=>{ mine('Lance'); runPipeline(); }],
                    ['✋','Attends','je revois', ()=>{ mine('Je revois'); showRecap(); }],
                ]);
            }));
        }

        /* ─── pipeline RÉEL : rend les étapes, puis appelle initializeProject() ─── */
        function runPipeline(){
            const steps=[
                ['files','Écriture des fichiers + ouverture de la MR'],
                ['branches','Création des branches du flow'],
                ['protect','Protection des branches'],
                ['settings','Réglages projet'],
            ];
            const pipe=document.createElement('div'); pipe.className='pipe';
            pipe.innerHTML=steps.map(([k,s])=>`<div class="pipe-step" data-loading="${k}"><span class="ps-ic"></span><span>${s}</span></div>`).join('');
            thread.appendChild(pipe); scroll();
            // → moteur réel (setLoadingStep pilote les .pipe-step, showSuccess rend la done-card)
            initializeProject();
        }

        /* ════ primitives de chat ════ */
        function bot(html,cb,delay){
            const m=document.createElement('div'); m.className='msg';
            m.innerHTML=`<div class="av bot">🛎️</div><div class="bubble bot">${html}</div>`;
            thread.appendChild(m); scroll(); if(cb) setTimeout(cb, delay||420);
        }
        function botThink(cb,ms){
            const m=document.createElement('div'); m.className='msg';
            m.innerHTML=`<div class="av bot">🛎️</div><div class="bubble bot"><div class="typing"><i></i><i></i><i></i></div></div>`;
            thread.appendChild(m); scroll();
            setTimeout(()=>{ m.remove(); cb(); }, ms||780);
        }
        function mine(txt){
            const m=document.createElement('div'); m.className='msg mine';
            m.innerHTML=`<div class="av me">🧑</div><div class="bubble me">${esc(txt)}</div>`;
            thread.appendChild(m); scroll();
        }
        function quick(items,append){
            if(!append) clearInputs();
            const c=document.createElement('div'); c.className='choices'; c.dataset.input='1';
            items.forEach(([ic,title,sub,fn])=>{
                const btn=document.createElement('button'); btn.className=sub?'choice':'choice ghost';
                btn.innerHTML=sub?`<span class="ic">${ic}</span><span class="tx"><b>${title}</b><small>${sub}</small></span>`:`<span class="ic">${ic}</span> ${title}`;
                btn.onclick=()=>{ clearInputs(); fn(); }; c.appendChild(btn);
            });
            thread.appendChild(c); scroll();
        }
        function clearInputs(){ thread.querySelectorAll('[data-input]').forEach(e=>e.remove()); }
        function scroll(){ setTimeout(()=>{ if(thread) thread.scrollTop=thread.scrollHeight; }, 30); }
        function esc(s){ return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
        function toastMsg(m){ if(!toastEl) return; toastEl.textContent=m; toastEl.classList.add('on'); setTimeout(()=>toastEl.classList.remove('on'),2600); }


        // ============================================
        // FILE TEMPLATES
        // ============================================
        
        function getReadmeContent() {
            return `# ${sessionData.projectName}

${projectDescription || 'Description du projet.'}

## 🚀 Getting Started

\`\`\`bash
git clone ${sessionData.gitlabUrl}.git
cd ${sessionData.projectName}
\`\`\`

## 📁 Structure

\`\`\`
${sessionData.projectName}/
├── src/           # Code source
├── kustomize/     # Manifests Kubernetes (ArgoCD)
└── ...
\`\`\`

## 🔧 Configuration

Voir le Pipeline Generator du DevOps Hub pour configurer le CI/CD.

---
*Généré par LCL DevOps Hub*
`;
        }

        function getGitignore() {
            const common = `# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/
`;
            const stacks = {
                'java': `# Java
target/
*.class
*.jar
*.war
.mvn/
!.mvn/wrapper/maven-wrapper.jar
`,
                'angular': `# Node
node_modules/
dist/
.angular/
.npm/
npm-debug.log
`,
                'python': `# Python
__pycache__/
*.py[cod]
*$py.class
.Python
venv/
.venv/
*.egg-info/
dist/
build/
.pytest_cache/
`,
                'node': `# Node
node_modules/
dist/
.npm/
npm-debug.log
*.tsbuildinfo
`,
                'dotnet': `# .NET
bin/
obj/
*.user
*.suo
.vs/
`,
                'empty': ''
            };
            return common + (stacks[config.stack] || '');
        }

        function getGitlabCi() {
            return `# GitLab CI/CD Pipeline
# ═══════════════════════════════════════════════════════════════
# Utilisez le Pipeline Generator du DevOps Hub pour configurer
# ce fichier avec les stages et jobs adaptés à votre projet.
# ═══════════════════════════════════════════════════════════════

stages: []

# TODO: Configurer via Pipeline Generator
`;
        }

        function getEditorconfig() {
            return `# EditorConfig - https://editorconfig.org
root = true

[*]
charset = utf-8
indent_style = space
indent_size = 4
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.{yml,yaml}]
indent_size = 2

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
`;
        }

        function getDockerfile() {
            const dockerfiles = {
                'java': `# Multi-stage build for Java
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
`,
                'angular': `# Multi-stage build for Angular
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build --prod

FROM nginx:alpine
COPY --from=builder /app/dist/*/browser /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`,
                'python': `# Multi-stage build for Python
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY src ./src
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0"]
`,
                'node': `# Multi-stage build for Node.js
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/main.js"]
`,
                'dotnet': `# Multi-stage build for .NET
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS builder
WORKDIR /app
COPY *.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o out

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=builder /app/out .
EXPOSE 8080
ENTRYPOINT ["dotnet", "${sessionData.projectName}.dll"]
`,
                'empty': `FROM alpine:latest
WORKDIR /app
CMD ["sh"]
`
            };
            return dockerfiles[config.stack] || dockerfiles['empty'];
        }

        function getPomXml() {
            return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    
    <groupId>com.lcl</groupId>
    <artifactId>${sessionData.projectName}</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <packaging>jar</packaging>
    
    <name>${sessionData.projectName}</name>
    <description>${projectDescription || 'Application LCL'}</description>
    
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
    </parent>
    
    <properties>
        <java.version>21</java.version>
    </properties>
    
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
    
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
`;
        }

        function getPackageJson(type) {
            if (type === 'angular') {
                return JSON.stringify({
                    name: sessionData.projectName,
                    version: "1.0.0",
                    scripts: {
                        start: "ng serve",
                        build: "ng build",
                        test: "ng test"
                    },
                    dependencies: {
                        "@angular/core": "^17.0.0",
                        "@angular/common": "^17.0.0"
                    },
                    devDependencies: {
                        "@angular/cli": "^17.0.0",
                        "typescript": "~5.2.0"
                    }
                }, null, 2);
            } else {
                return JSON.stringify({
                    name: sessionData.projectName,
                    version: "1.0.0",
                    description: projectDescription || "",
                    main: "dist/main.js",
                    scripts: {
                        start: "node dist/main.js",
                        build: "tsc",
                        dev: "ts-node src/main.ts"
                    },
                    dependencies: {
                        express: "^4.18.0"
                    },
                    devDependencies: {
                        typescript: "^5.0.0"
                    }
                }, null, 2);
            }
        }

        function getAngularJson() {
            return JSON.stringify({
                "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
                version: 1,
                projects: {
                    [sessionData.projectName]: {
                        projectType: "application",
                        root: "",
                        sourceRoot: "src"
                    }
                }
            }, null, 2);
        }

        function getPyprojectToml() {
            return `[project]
name = "${sessionData.projectName}"
version = "1.0.0"
description = "${projectDescription || ''}"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.100.0",
    "uvicorn>=0.23.0",
]

[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"
`;
        }

        function getRequirementsTxt() {
            return `fastapi>=0.100.0
uvicorn>=0.23.0
pydantic>=2.0.0
`;
        }

        function getCsproj() {
            return `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
`;
        }

        // ============================================
        // COBOL / MAINFRAME TEMPLATES
        // ============================================

        function getCobolHelloWorld() {
            return `       IDENTIFICATION DIVISION.
       PROGRAM-ID. ${sessionData.projectName.toUpperCase().replace(/-/g, '').substring(0, 8)}.
       AUTHOR. LCL DEVOPS HUB.
      *****************************************************************
      * ${sessionData.projectName}
      * ${projectDescription || 'Programme COBOL généré par DevOps Hub'}
      *****************************************************************
       
       ENVIRONMENT DIVISION.
       
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-MESSAGE    PIC X(50) VALUE 'HELLO FROM DEVOPS HUB'.
       
       PROCEDURE DIVISION.
           DISPLAY WS-MESSAGE
           STOP RUN.
`;
        }

        function getCobolCopybook() {
            return `      *****************************************************************
      * COPYBOOK: ${sessionData.projectName.toUpperCase().substring(0, 8)}
      * Description: Structure de données commune
      *****************************************************************
       01 WS-COMMON-AREA.
          05 WS-RETURN-CODE     PIC S9(4) COMP VALUE 0.
          05 WS-ERROR-MSG       PIC X(80) VALUE SPACES.
          05 WS-TIMESTAMP       PIC X(26) VALUE SPACES.
`;
        }

        function getJclTemplate() {
            const pgmName = sessionData.projectName.toUpperCase().replace(/-/g, '').substring(0, 8);
            return `//${pgmName}J JOB (ACCT),'${sessionData.projectName}',
//             CLASS=A,MSGCLASS=X,NOTIFY=&SYSUID
//*****************************************************************
//* JCL: ${sessionData.projectName}
//* Description: ${projectDescription || 'Job généré par DevOps Hub'}
//*****************************************************************
//STEP01   EXEC PGM=${pgmName}
//STEPLIB  DD DSN=YOUR.LOADLIB,DISP=SHR
//SYSOUT   DD SYSOUT=*
//SYSPRINT DD SYSOUT=*
//SYSIN    DD DUMMY
`;
        }

        function getDbbBuildGroovy() {
            return `// DBB Build Script for ${sessionData.projectName}
// Generated by LCL DevOps Hub
// Documentation: https://www.ibm.com/docs/en/dbb

@groovy.transform.BaseScript com.ibm.dbb.groovy.ScriptLoader baseScript
import com.ibm.dbb.build.*
import com.ibm.dbb.dependency.*
import com.ibm.dbb.repository.*

// Build properties
def properties = BuildProperties.getInstance()
properties.buildPropFiles = ['build.properties']

// Source directories
def srcDirs = [
    'src/cobol',
    'src/copybook'
]

// Compile COBOL programs
def cobolCompile = new CobolCompile()
cobolCompile.command = properties.getFileProperty('cobolCompiler')

println "** Building ${sessionData.projectName} **"

srcDirs.each { dir ->
    def files = new FileNameFinder().getFileNames(dir, '**/*.cbl')
    files.each { file ->
        println "Compiling: \$file"
        // Add your compile logic here
    }
}

println "** Build complete **"
`;
        }

        function getDbbBuildProperties() {
            return `# DBB Build Properties for ${sessionData.projectName}
# Generated by LCL DevOps Hub

# z/OS Configuration
zosHlq=${sessionData.projectName.toUpperCase().replace(/-/g, '').substring(0, 8)}
zosDatasets=\${zosHlq}.LOAD,\${zosHlq}.DBRM,\${zosHlq}.OBJ

# Compiler options
cobolCompiler=IGYCRCTL
cobolOptions=LIB,RENT,APOST,TRUNC(OPT)

# Copybook paths
copybookPaths=src/copybook

# Build output
buildOutputDir=build/outputs
`;
        }

        function getMainframeGitignore() {
            return `# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db

# Build outputs
build/
*.load
*.lst
*.obj
*.dbrm

# DBB
logs/
.dbb/

# Listings
*.listing
*.lis

# Temporary
*.tmp
*.bak
`;
        }

        function getMainframeGitlabCi() {
            return `# GitLab CI/CD Pipeline for Mainframe
# ═══════════════════════════════════════════════════════════════
# Ce pipeline utilise DBB (Dependency Based Build) pour compiler
# les programmes COBOL et les déployer sur z/OS.
# ═══════════════════════════════════════════════════════════════

stages:
  - build
  - test
  - deploy

variables:
  DBB_HOME: /usr/lpp/dbb
  ZOSMF_HOST: your-zosmf-host.lcl.fr
  
# TODO: Configurer via Pipeline Generator ou zOps Platform
# Documentation: https://devops-hub.lcl.internal/zops

build:
  stage: build
  tags:
    - zos-runner
  script:
    - echo "Building with DBB..."
    # groovyz build/build.groovy
  only:
    - main
    - develop

# deploy:
#   stage: deploy
#   script:
#     - echo "Deploying to z/OS..."
#   environment:
#     name: production
`;
        }

        function getMainframeReadme() {
            return `# ${sessionData.projectName}

${projectDescription || 'Projet Mainframe COBOL généré par DevOps Hub.'}

## 🏛️ Structure du projet

\`\`\`
${sessionData.projectName}/
├── src/
│   ├── cobol/          # Programmes COBOL (.cbl)
│   ├── copybook/       # COPY books (.cpy)
│   ├── jcl/            # Jobs JCL
│   └── bms/            # Écrans BMS (CICS)
├── build/
│   ├── build.groovy    # Script DBB
│   └── build.properties
├── config/
│   └── dbb/            # Configuration DBB
└── test/
    └── unit/           # Tests unitaires
\`\`\`

## 🚀 Getting Started

### Prérequis
- IBM Dependency Based Build (DBB)
- Accès z/OS avec RACF approprié
- GitLab Runner configuré pour z/OS

### Clone
\`\`\`bash
git clone ${sessionData.gitlabUrl}.git
cd ${sessionData.projectName}
\`\`\`

### Build local (avec DBB)
\`\`\`bash
groovyz build/build.groovy
\`\`\`

## 🔧 Configuration

### DBB
Modifier \`build/build.properties\` pour adapter:
- HLQ des datasets
- Options de compilation
- Chemins des copybooks

### CI/CD
Voir le [zOps Platform](zops-platform.html) pour:
- Configuration du runner z/OS
- Déploiement automatisé
- Feature flags COBOL

## 📚 Documentation
- [IBM DBB Documentation](https://www.ibm.com/docs/en/dbb)
- [LCL DevOps Hub - zOps](zops-platform.html)

---
*Généré par LCL DevOps Hub - zOps Platform*
`;
        }

        // ============================================
        // GITLAB API HELPER
        // ============================================
        
        async function gitlabAPI(endpoint, method = 'GET', body = null) {
            const options = {
                method,
                headers: { 
                    'PRIVATE-TOKEN': sessionData.gitlabToken, 
                    'Content-Type': 'application/json' 
                }
            };
            if (body) options.body = JSON.stringify(body);
            
            let response = await fetch(`${sessionData.gitlabBaseUrl}/api/v4${endpoint}`, options);
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
                await new Promise(r => setTimeout(r, retryAfter * 1000));
                response = await fetch(`${sessionData.gitlabBaseUrl}/api/v4${endpoint}`, options);
            }
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`API Error ${response.status}: ${error}`);
            }
            
            return response.status === 204 ? null : response.json();
        }

        function setLoadingStep(step, state) {
            const el = document.querySelector(`.pipe-step[data-loading="${step}"]`);
            if (!el) return;
            el.classList.remove('run', 'done', 'error');
            el.classList.add(state === 'active' ? 'run' : state);
            const ic = el.querySelector('.ps-ic');
            if (ic) ic.textContent = state === 'done' ? '✓' : state === 'error' ? '✕' : '';
        }

        // ============================================
        // INITIALIZE PROJECT (API calls)
        // ============================================
        async function initializeProject() {
            // ⛔ Re-vérification de dernière seconde avant TOUT write (l'état a pu changer).
            try {
                const project = await gitlabAPI(`/projects/${sessionData.projectId}`);
                const guard = await checkRepoScaffoldable(project);
                if (!guard.ok) {
                    showBlocked(guard.reason, guard.detail);
                    return; // on n'écrit rien
                }
            } catch (e) {
                alert("Vérification de sécurité impossible avant l'initialisation.\n\n" + e.message + "\n\nAnnulé pour ne rien risquer.");
                return;
            }

            loadingOverlay.classList.add('show');
            const createdFiles = [];
            const createdBranches = ['main'];
            const appliedSettings = [];
            const initBranch = 'init/devops-hub-setup';

            try {
                // ─────────────────────────────────────────
                // STEP 1: Create files on init branch
                // ─────────────────────────────────────────
                setLoadingStep('files', 'active');
                
                const actions = [];
                
                // README.md - update existing
                actions.push({ action: 'update', file_path: 'README.md', content: getReadmeContent() });
                createdFiles.push('README.md');
                
                // .gitignore
                actions.push({ action: 'create', file_path: '.gitignore', content: getGitignore() });
                createdFiles.push('.gitignore');
                
                // .gitlab-ci.yml
                if (config.options.gitlabCi) {
                    actions.push({ action: 'create', file_path: '.gitlab-ci.yml', content: getGitlabCi() });
                    createdFiles.push('.gitlab-ci.yml');
                }
                
                // .editorconfig
                if (config.options.editorconfig) {
                    actions.push({ action: 'create', file_path: '.editorconfig', content: getEditorconfig() });
                    createdFiles.push('.editorconfig');
                }
                
                // Dockerfile
                if (config.options.dockerfile) {
                    actions.push({ action: 'create', file_path: 'Dockerfile', content: getDockerfile() });
                    createdFiles.push('Dockerfile');
                }
                
                // Stack-specific files
                if (config.stack === 'java') {
                    actions.push({ action: 'create', file_path: 'pom.xml', content: getPomXml() });
                    actions.push({ action: 'create', file_path: 'src/main/java/.gitkeep', content: '' });
                    actions.push({ action: 'create', file_path: 'src/test/java/.gitkeep', content: '' });
                    createdFiles.push('pom.xml', 'src/');
                } else if (config.stack === 'angular') {
                    actions.push({ action: 'create', file_path: 'package.json', content: getPackageJson('angular') });
                    actions.push({ action: 'create', file_path: 'angular.json', content: getAngularJson() });
                    actions.push({ action: 'create', file_path: 'src/.gitkeep', content: '' });
                    createdFiles.push('package.json', 'angular.json', 'src/');
                } else if (config.stack === 'python') {
                    actions.push({ action: 'create', file_path: 'pyproject.toml', content: getPyprojectToml() });
                    actions.push({ action: 'create', file_path: 'requirements.txt', content: getRequirementsTxt() });
                    actions.push({ action: 'create', file_path: 'src/__init__.py', content: '' });
                    actions.push({ action: 'create', file_path: 'src/main.py', content: '# Entry point\n' });
                    createdFiles.push('pyproject.toml', 'requirements.txt', 'src/');
                } else if (config.stack === 'node') {
                    actions.push({ action: 'create', file_path: 'package.json', content: getPackageJson('node') });
                    actions.push({ action: 'create', file_path: 'src/.gitkeep', content: '' });
                    createdFiles.push('package.json', 'src/');
                } else if (config.stack === 'dotnet') {
                    actions.push({ action: 'create', file_path: `${sessionData.projectName}.csproj`, content: getCsproj() });
                    actions.push({ action: 'create', file_path: 'src/.gitkeep', content: '' });
                    createdFiles.push(`${sessionData.projectName}.csproj`, 'src/');
                } else if (config.stack === 'cobol') {
                    // COBOL / Mainframe structure
                    // Override README with mainframe-specific
                    actions[0] = { action: 'update', file_path: 'README.md', content: getMainframeReadme() };
                    // Override .gitignore
                    actions[1] = { action: 'create', file_path: '.gitignore', content: getMainframeGitignore() };
                    // Override .gitlab-ci.yml if enabled
                    if (config.options.gitlabCi) {
                        const ciIndex = actions.findIndex(a => a.file_path === '.gitlab-ci.yml');
                        if (ciIndex !== -1) {
                            actions[ciIndex] = { action: 'create', file_path: '.gitlab-ci.yml', content: getMainframeGitlabCi() };
                        }
                    }
                    
                    // Source structure
                    const pgmName = sessionData.projectName.toUpperCase().replace(/-/g, '').substring(0, 8);
                    actions.push({ action: 'create', file_path: `src/cobol/${pgmName}.cbl`, content: getCobolHelloWorld() });
                    actions.push({ action: 'create', file_path: 'src/copybook/COMMON.cpy', content: getCobolCopybook() });
                    actions.push({ action: 'create', file_path: `src/jcl/${pgmName}.jcl`, content: getJclTemplate() });
                    actions.push({ action: 'create', file_path: 'src/bms/.gitkeep', content: '' });
                    
                    // DBB Build
                    actions.push({ action: 'create', file_path: 'build/build.groovy', content: getDbbBuildGroovy() });
                    actions.push({ action: 'create', file_path: 'build/build.properties', content: getDbbBuildProperties() });
                    
                    // Config & Test
                    actions.push({ action: 'create', file_path: 'config/dbb/.gitkeep', content: '' });
                    actions.push({ action: 'create', file_path: 'test/unit/.gitkeep', content: '' });
                    
                    createdFiles.push('src/cobol/', 'src/copybook/', 'src/jcl/', 'build/');
                }
                
                // Kustomize structure (vide)
                if (config.options.kustomize) {
                    actions.push({ action: 'create', file_path: 'kustomize/base/.gitkeep', content: '' });
                    actions.push({ action: 'create', file_path: 'kustomize/overlays/dev/.gitkeep', content: '' });
                    actions.push({ action: 'create', file_path: 'kustomize/overlays/recette/.gitkeep', content: '' });
                    actions.push({ action: 'create', file_path: 'kustomize/overlays/prod/.gitkeep', content: '' });
                    createdFiles.push('kustomize/');
                }
                
                // Create init branch first
                await gitlabAPI(`/projects/${sessionData.projectId}/repository/branches`, 'POST', {
                    branch: initBranch,
                    ref: 'main'
                });
                console.log('✅ Branch created:', initBranch);
                
                // Commit all files to init branch
                await gitlabAPI(`/projects/${sessionData.projectId}/repository/commits`, 'POST', {
                    branch: initBranch,
                    commit_message: '🚀 Initial project setup by DevOps Hub',
                    actions: actions
                });
                console.log('✅ Files committed');
                
                // Create MR (leave it open for review/merge)
                const mr = await gitlabAPI(`/projects/${sessionData.projectId}/merge_requests`, 'POST', {
                    source_branch: initBranch,
                    target_branch: 'main',
                    title: '🚀 Initial project setup by DevOps Hub',
                    description: `## 🚀 Initialisation du projet par DevOps Hub

### Configuration
- **Workflow**: ${config.workflow}
- **Stack**: ${config.stack}

### Fichiers créés
${createdFiles.map(f => '- `' + f + '`').join('\n')}

---
*Généré automatiquement par [LCL DevOps Hub](${HUB_URL})*`,
                    remove_source_branch: true
                });
                console.log('✅ MR created:', mr.iid);
                
                // Store MR info for success screen
                window.createdMR = mr;
                
                setLoadingStep('files', 'done');

                // ─────────────────────────────────────────
                // STEP 2: Create branches
                // ─────────────────────────────────────────
                setLoadingStep('branches', 'active');
                
                // Create branches from init branch (which has all files)
                // After MR merge, these will be based on the correct content
                if (config.workflow === 'gitflow') {
                    await gitlabAPI(`/projects/${sessionData.projectId}/repository/branches`, 'POST', {
                        branch: 'develop',
                        ref: initBranch
                    });
                    createdBranches.push('develop');
                    
                    await gitlabAPI(`/projects/${sessionData.projectId}/repository/branches`, 'POST', {
                        branch: 'feature/example',
                        ref: 'develop'
                    });
                    createdBranches.push('feature/example');
                } else if (config.workflow === 'feature-branching') {
                    await gitlabAPI(`/projects/${sessionData.projectId}/repository/branches`, 'POST', {
                        branch: 'feature/example',
                        ref: initBranch
                    });
                    createdBranches.push('feature/example');
                }
                
                setLoadingStep('branches', 'done');

                // ─────────────────────────────────────────
                // STEP 3: Protect branches
                // ─────────────────────────────────────────
                setLoadingStep('protect', 'active');
                
                if (config.options.protectMain) {
                    try {
                        await gitlabAPI(`/projects/${sessionData.projectId}/protected_branches`, 'POST', {
                            name: 'main',
                            push_access_level: 0,
                            merge_access_level: 40,
                            allow_force_push: false
                        });
                        appliedSettings.push('main protégée');
                    } catch (e) {
                        console.warn('Branch main already protected:', e.message);
                        appliedSettings.push('main protégée');
                    }
                }
                
                if (config.workflow === 'gitflow' && config.options.protectDevelop) {
                    try {
                        await gitlabAPI(`/projects/${sessionData.projectId}/protected_branches`, 'POST', {
                            name: 'develop',
                            push_access_level: 0,
                            merge_access_level: 40,
                            allow_force_push: false
                        });
                        appliedSettings.push('develop protégée');
                    } catch (e) {
                        console.warn('Branch develop protection error:', e.message);
                    }
                }
                
                setLoadingStep('protect', 'done');

                // ─────────────────────────────────────────
                // STEP 4: Project settings (merge train)
                // ─────────────────────────────────────────
                setLoadingStep('settings', 'active');
                
                if (config.workflow === 'trunk') {
                    try {
                        await gitlabAPI(`/projects/${sessionData.projectId}`, 'PUT', {
                            merge_pipelines_enabled: true,
                            merge_trains_enabled: true
                        });
                        appliedSettings.push('Merge train activé');
                    } catch (e) {
                        console.warn('Merge train activation error:', e.message);
                    }
                }
                
                setLoadingStep('settings', 'done');

                // ─────────────────────────────────────────
                // SUCCESS
                // ─────────────────────────────────────────
                await new Promise(r => setTimeout(r, 500));
                loadingOverlay.classList.remove('show');
                showSuccess(createdFiles, createdBranches, appliedSettings);

            } catch (error) {
                console.error('Initialization error:', error);
                setLoadingStep('files', 'error');
                loadingOverlay.classList.remove('show');
                alert('Erreur lors de l\'initialisation:\n\n' + error.message);
            }
        }

        function showSuccess(files, branches, settings) {
            const f = FLOWS[chosenFlow] || FLOWS.feature;
            const mrUrl = `${sessionData.gitlabUrl}/-/merge_requests/${window.createdMR.iid}`;
            const d = document.createElement('div'); d.className = 'done-card';
            d.innerHTML = `<h3>\u2728 Pr\u00eat \u2014 la MR t'attend</h3>`
                + `<p>Structure <b>${esc(f.name)}</b> initialis\u00e9e, ${files.length} fichiers \u00e9crits, CI adapt\u00e9e au flow, Merge Request ouverte. Tu n'as plus qu'\u00e0 relire et merger.</p>`
                + `<a class="gitbtn" href="${mrUrl}" target="_blank" rel="noopener">\ud83e\udd8a Voir la Merge Request</a>`
                + `<div class="clone">git clone ${esc(sessionData.gitlabUrl)}.git</div>`
                + `<div class="humannote">Je m'arr\u00eate l\u00e0. C'est toi qui valides et merges \u2014 je ne touche jamais \u00e0 la branche prot\u00e9g\u00e9e.</div>`;
            thread.appendChild(d); scroll();
            botThink(() => bot("La prochaine fois, je me souviendrai de ton contexte et j'irai droit \u00e0 la reco. \u00c0 tout' \ud83d\udc4b", () => {
                quick([['\u21ba', 'Refaire un repo', 'recommencer', () => startConcierge(true)]]);
            }), 500);
        }

        // ============================================
        // EVENT LISTENERS
        // ============================================

        // ============================================
        // INIT
        // ============================================
        boot();
