/* salsi/qa · gaming.js — achievements, bus factor, rapport quotidien, repo analyzer (chargé 3e). */

'use strict';

    var GAMING_CATS = {
        delivery: { ic: '🚀', name: 'Delivery', desc: 'Fréquence, stabilité, vitesse' },
        quality: { ic: '🔒', name: 'Qualité & Merge Requests', desc: 'Review, approbations, taille MR' },
        stability: { ic: '⚙️', name: 'Stabilité & Pipelines', desc: 'Résilience, recovery, tendance' },
        hygiene: { ic: '🧹', name: 'Hygiène & Repository', desc: 'Branches, fichiers, protection' },
        resilience: { ic: '🚌', name: 'Résilience & Connaissances', desc: 'Bus factor, répartition, rotation' },
        practices: { ic: '⚡', name: 'Pratiques DevOps', desc: 'Feature flags, CI/CD, automation' }
    };
    // [id, cat, icon, name, criteria, tip, xp] — extrait verbatim du BADGES de gaming.js
    var GAMING_BADGES = [
        ['frequent_deploy','delivery','📦','Frequent Deploy','≥ 5 pipelines réussis / semaine','Découpez vos features en plus petits morceaux pour déployer plus souvent.',100],
        ['high_frequency_deploy','delivery','🚀','High Frequency Deploy','≥ 10 pipelines réussis / semaine','Les équipes DORA Elite déploient plusieurs fois par jour.',150],
        ['fast_pipeline','delivery','⚡','Fast Pipeline','Durée moyenne pipeline < 10 min','Parallélisez vos jobs et utilisez le cache GitLab.',100],
        ['very_fast_pipeline','delivery','⚡⚡','Very Fast Pipeline','Durée moyenne pipeline < 5 min','Optimisez le cache, réduisez les dépendances, utilisez des images légères.',150],
        ['pipeline_as_code','delivery','📝','Pipeline as Code','.gitlab-ci.yml présent','Créez un fichier .gitlab-ci.yml à la racine du repo.',50],
        ['green_pipeline','delivery','✅','Green Pipeline','Taux de succès > 90%','Corrigez les tests flaky et améliorez la qualité du code.',150],
        ['high_stability','delivery','🟢','High Stability','Taux de succès > 95%','Éliminez tous les tests instables et automatisez les rollbacks.',200],
        ['recovery_master','delivery','🔄','Recovery Master','MTTR < 2h (temps moyen de recovery)','Mettez en place des alertes et des runbooks pour réagir vite.',200],
        ['no_failed_streak','delivery','📉','No Failed Streak','Max 1 pipeline failed consécutif','Réagissez vite aux échecs pour éviter les séries de fails.',150],
        ['deploy_from_main','delivery','🎯','Deploy from Main','100% des déploiements via main','Ne déployez jamais depuis une branche feature.',100],
        ['tagged_releases','delivery','🏷️','Tagged Releases','≥ 1 release taguée / mois','Créez un tag Git pour chaque release.',75],
        ['semver','delivery','🔢','Semver','Tags suivent semver (vX.Y.Z)','Utilisez des tags comme v1.0.0, v1.1.0, v2.0.0.',75],
        ['code_review_champion','quality','👀','Code Review Champion','≥ 80% des MR avec approbation','Demandez toujours une review avant de merger.',150],
        ['review_speed','quality','⏱️','Review Speed','Temps moyen de review < 2 jours','Réservez du temps quotidien pour les reviews.',100],
        ['very_fast_review','quality','⚡','Very Fast Review','Temps de review < 1 jour','Priorisez les reviews dès leur arrivée.',150],
        ['approval_rules','quality','🔐','Approval Rules','2 approbateurs requis, author exclu','Settings → Merge requests → Approval rules.',100],
        ['reset_approvals','quality','🔁','Reset Approvals','Approvals invalidées après push','Settings → Merge requests → Remove all approvals on push.',100],
        ['small_mr','quality','✂️','Small MR','Taille moyenne MR < 200 lignes','Découpez vos changements en MR atomiques.',100],
        ['tiny_mr','quality','🧩','Tiny MR','Taille moyenne MR < 50 lignes','Les micro-MR sont reviewées en quelques minutes.',150],
        ['low_mr_files','quality','📄','Low MR Files','< 10 fichiers modifiés par MR','Moins de fichiers = review plus ciblée.',75],
        ['no_merge_without_approval','quality','🛡️','No Merge Without Approval','0 MR mergées sans approval','Bloquez les merges sans approbation.',150],
        ['constructive_reviews','quality','💬','Constructive Reviews','> 3 commentaires / MR','Encouragez les discussions constructives sur le code.',100],
        ['stable_build','stability','✅','Stable Build','Taux de succès > 90%','Identifiez et corrigez les tests flaky.',150],
        ['pipeline_resilient','stability','🛡️','Pipeline Resilient','Échecs isolés (max 1 consécutif)','Réagissez vite aux premiers signes de problème.',100],
        ['quick_fix','stability','🔧','Quick Fix','MTTR < 2h','Préparez des runbooks pour les incidents courants.',200],
        ['no_pipeline_red','stability','🚦','No Pipeline Red','Aucun pipeline failed sur la semaine','Maintenez un taux de succès parfait cette semaine.',100],
        ['trend_up','stability','📈','Trend Up','Taux succès en hausse sur 1 mois','Améliorez continuellement votre CI/CD.',75],
        ['clean_repo','hygiene','🧹','Clean Repo','0 branches inactives > 30 jours','Supprimez les branches déjà mergées.',75],
        ['stale_branch_hunter','hygiene','🌿','Stale Branch Hunter','< 5 branches inactives','Nettoyez régulièrement vos branches.',50],
        ['lock_files_present','hygiene','🔒','Lock Files Present','package-lock / yarn.lock / poetry.lock présent','Committez vos fichiers de lock pour garantir la reproductibilité.',75],
        ['essential_files','hygiene','📁','Essential Files','README + .gitignore + CHANGELOG présents','Documentez votre projet avec les fichiers essentiels.',100],
        ['branch_protection','hygiene','🛡️','Branch Protection','Branche principale protégée','Settings → Repository → Protected branches.',100],
        ['force_push_blocked','hygiene','🚫','Force Push Blocked','Force push interdit sur main','Désactivez allow_force_push sur la branche protégée.',100],
        ['no_zombie_mrs','hygiene','🧟','No Zombie MRs','0 MR ouvertes > 7 jours','Fermez ou mergez vos MRs rapidement.',100],
        ['mr_cycle_time','hygiene','⏲️','MR Cycle Time','MR ouvertes < 3 jours en moyenne','Réduisez le temps entre création et merge.',100],
        ['merged_branches_cleaned','hygiene','🗑️','Merged Branches Cleaned','< 3 branches mergées non supprimées','Activez la suppression auto des branches après merge.',75],
        ['bus_factor_safe','resilience','🚌','Bus Factor Safe','≥ 3 contributeurs actifs','Impliquez plus de développeurs dans le projet.',100],
        ['work_balanced','resilience','⚖️','Work Balanced','Top contributeur < 40% des commits','Répartissez le travail entre les membres de l\'équipe.',100],
        ['reviewer_rotation','resilience','🔄','Reviewer Rotation','≥ 3 reviewers distincts sur les MR','Faites tourner les reviewers pour partager la connaissance.',100],
        ['regular_activity','resilience','📅','Regular Activity','Gap max entre commits < 7 jours','Maintenez une activité régulière sur le projet.',75],
        ['feature_flags','practices','🚩','Feature Flags','Utilisation de feature flags','Utilisez GitLab Feature Flags ou Unleash.',100],
        ['ci_versioned','practices','📝','CI Versioned','.gitlab-ci.yml dans le repo','Versionnez votre pipeline dans le repo.',75],
        ['multi_stage_pipeline','practices','🔀','Multi-Stage Pipeline','≥ 3 stages dans le pipeline','Structurez votre pipeline : build, test, deploy.',75],
        ['automated_tests','practices','🧪','Automated Tests','Stage de test dans le pipeline','Ajoutez un job de test dans votre CI.',100],
        ['automated_deploy','practices','🚀','Automated Deploy','Stage de deploy dans le pipeline','Automatisez vos déploiements.',100],
        ['env_separation','practices','🌍','Environment Separation','Variables d\'environnement par env','Utilisez les environnements GitLab (dev, staging, prod).',75],
        ['rollback_ready','practices','⏪','Rollback Ready','Job de rollback disponible','Préparez un job pour revenir à la version précédente.',100]
    ];
    var GAMING_TOTAL = GAMING_BADGES.length; // 47
    // Index normalisé pour la recherche (nom + critère + tip).
    var GB_INDEX = GAMING_BADGES.map(function (b) {
        return { id: b[0], cat: b[1], icon: b[2], name: b[3], crit: b[4], tip: b[5], xp: b[6], hay: norm(b[3] + ' ' + b[4] + ' ' + b[5]), nameN: norm(b[3]) };
    });
    // 4 badges « d'absence » neutralisés tant qu'il n'y a pas assez de signal.
    var GAMING_GATED = { no_failed_streak: 1, pipeline_resilient: 1, no_merge_without_approval: 1, no_zombie_mrs: 1 };
    var GAMING_PHASES = [
        { emoji: '🌱', label: 'Découverte', from: '0 %' },
        { emoji: '🧱', label: 'Structuration', from: '≥ 15 % (~7/47)' },
        { emoji: '🛡️', label: 'Fiabilisation', from: '≥ 40 % (~19/47)' },
        { emoji: '⚙️', label: 'Optimisation', from: '≥ 65 % (~31/47)' },
        { emoji: '🏆', label: 'Excellence', from: '≥ 85 % (~40/47)' }
    ];
    // Trouve le badge le plus proche de la question (ou null).
    function findBadge(n) {
        var toks = n.split(' ').filter(function (w) { return w.length > 2 && !ATL_STOP[w]; });
        if (!toks.length) return null;
        var best = null, bestScore = 0;
        GB_INDEX.forEach(function (b) {
            var s = 0;
            toks.forEach(function (t) {
                if (b.nameN.indexOf(t) >= 0) s += 3;
                else if (b.hay.indexOf(t) >= 0) s += (t.length > 4 ? 2 : 1);
            });
            if (s > bestScore) { bestScore = s; best = b; }
        });
        return bestScore >= 3 ? best : null;
    }
    function catFromN(n) {
        if (/qualite|review|revue|approbation|approval|\bmr\b|merge request|commentaire/.test(n)) return 'quality';
        if (/hygien|branche|repo|protection|protegee|fichier|readme|lock|zombie/.test(n)) return 'hygiene';
        if (/resilience|bus factor|connaissance|rotation|contributeur|equilibr/.test(n)) return 'resilience';
        if (/pratique|feature flag|automation|automatis|\bci\b|stage/.test(n)) return 'practices';
        if (/stabilite|resilient|recovery|tendance|flaky/.test(n)) return 'stability';
        if (/delivery|livraison|deploiement|frequence|pipeline|release|tag/.test(n)) return 'delivery';
        return null;
    }
    // Fiche badge : critère + (recette « comment débloquer » si demandé/dispo).
    function d_badge_info(b, howto) {
        var cat = GAMING_CATS[b.cat];
        var head = `${b.icon} <b>${esc(b.name)}</b> · ${cat.ic} ${esc(cat.name)} · <b>${b.xp} XP</b><br><span class="sqa-hint">Critère : ${esc(b.crit)}</span>`;
        var gate = GAMING_GATED[b.id] ? `<div class="sqa-hint">⏳ Badge « d'absence » : compte seulement quand il y a assez d'activité (pipelines/MR) à juger.</div>` : '';
        var rec = (Salsifi.gamingRecipes || {})[b.id];
        if (howto) {
            if (rec) {
                var steps = (rec.steps || []).slice(0, 3).map(function (s) { return `<div class="sqa-atl-d">• ${s}</div>`; }).join(''); // HTML de confiance (module)
                var modH = rec.module ? `<div style="margin-top:5px"><a href="${esc(rec.module.url)}" target="_blank" rel="noopener">🧰 ${esc(rec.module.name)} ↗</a></div>` : '';
                return { html: `${head}<div class="sqa-atl"><b>Pour le débloquer :</b>${steps}${modH}</div>${gate}` };
            }
            return { html: `${head}<div class="sqa-atl"><b>Pour le débloquer :</b> ${esc(b.tip)}</div>${gate}` };
        }
        return { html: `${head}<div class="sqa-hint">💡 ${esc(b.tip)}</div>${gate}` };
    }
    // Les 5 phases de maturité + seuils (les « notes » du gaming).
    function d_gaming_phases() {
        var rows = GAMING_PHASES.map(function (p) { return `${p.emoji} <b>${esc(p.label)}</b> — ${esc(p.from)}`; }).join('<br>');
        return { html: `🎮 Les <b>5 phases de maturité</b> (sur ${GAMING_TOTAL} badges) :<br>${rows}<br><span class="sqa-hint">On monte dès qu'on franchit le seuil ; on ne redescend qu'après une baisse soutenue (2 jours), pas sur un mauvais jour.</span>` };
    }
    // Les 6 familles de badges.
    function d_gaming_cats() {
        var counts = {}; GAMING_BADGES.forEach(function (b) { counts[b[1]] = (counts[b[1]] || 0) + 1; });
        var rows = Object.keys(GAMING_CATS).map(function (k) { var c = GAMING_CATS[k]; return `${c.ic} <b>${esc(c.name)}</b> (${counts[k]}) — <span class="sqa-hint">${esc(c.desc)}</span>`; }).join('<br>');
        return { html: `🎮 Les <b>6 familles</b> de badges (${GAMING_TOTAL} au total) :<br>${rows}<br><span class="sqa-hint">Demande « les badges <b>hygiène</b> » pour la liste d'une famille.</span>` };
    }
    // Explique le gate anti-vide.
    function d_gaming_gate() {
        return { html: `⏳ <b>« En attente de données »</b> : certains badges « d'absence » (0 échec, 0 MR sans approbation…) seraient vrais sur un repo qui ne fait <i>rien</i>. Salsi les neutralise tant qu'il n'y a pas assez d'activité (pipelines / MR) à juger — un repo mort ne doit pas finir mieux noté qu'un repo vivant. Concernés : <b>No Failed Streak</b>, <b>Pipeline Resilient</b>, <b>No Merge Without Approval</b>, <b>No Zombie MRs</b>.` };
    }
    // Liste des badges (d'une famille si précisée, sinon renvoie les familles).
    function d_badge_list(n) {
        var cat = catFromN(n);
        if (!cat) return d_gaming_cats();
        var c = GAMING_CATS[cat];
        var items = GB_INDEX.filter(function (b) { return b.cat === cat; }).map(function (b) { return `${b.icon} <b>${esc(b.name)}</b> <span class="sqa-hint">— ${esc(b.crit)}</span>`; }).join('<br>');
        return { html: `${c.ic} <b>${esc(c.name)}</b> :<br>${items}` };
    }
    // « quel badge je peux gagner facilement ? » → propose des badges faciles NON débloqués.
    // Ordre de facilité : réglages GitLab + fichiers à créer + hygiène (actions ponctuelles, faible XP).
    var EASY_BADGES = ['pipeline_as_code', 'essential_files', 'lock_files_present', 'branch_protection', 'force_push_blocked', 'approval_rules', 'reset_approvals', 'semver', 'tagged_releases', 'ci_versioned', 'multi_stage_pipeline', 'automated_tests', 'clean_repo', 'stale_branch_hunter'];
    function d_badge_easy() {
        var pid = targetRepo();
        var GH = Salsifi.gamingHistory, g = (GH && GH.read && pid) ? GH.read(pid) : [];
        var unlocked = (g && g.length) ? (g[g.length - 1].unlocked || []) : [];
        var uset = {}; unlocked.forEach(function (id) { uset[id] = 1; });
        var cand = EASY_BADGES.map(function (id) { return GB_INDEX.filter(function (b) { return b.id === id; })[0]; })
            .filter(Boolean).filter(function (b) { return !uset[b.id]; }).slice(0, 3);
        if (!cand.length) return { html: `Beau boulot 🌱 les badges les plus faciles sont déjà en poche ! Ouvre <b>Achievements</b> pour viser les suivants, ou demande-moi « comment débloquer <b>&lt;badge&gt;</b> ».` };
        var items = cand.map(function (b) {
            var rec = (Salsifi.gamingRecipes || {})[b.id];
            var tip = (rec && rec.steps && rec.steps[0]) ? rec.steps[0] : esc(b.tip); // step = HTML de confiance
            var mod = (rec && rec.module) ? ` <a href="${esc(rec.module.url)}" target="_blank" rel="noopener">🧰 ${esc(rec.module.name)} ↗</a>` : '';
            return `<div class="sqa-atl"><b>${b.icon} ${esc(b.name)}</b> · ${b.xp} XP${mod}<div class="sqa-atl-d">${tip}</div></div>`;
        }).join('');
        return { html: `🎮 Les badges les plus <b>faciles</b> à débloquer pour toi (actions rapides, pas encore obtenus) :${items}<span class="sqa-hint">Dis « comment débloquer &lt;badge&gt; » pour le plan complet.</span>` };
    }
    // Routeur gaming : renvoie une réponse taguée, ou null si hors sujet.
    async function gamingRoute(n, isData) {
        var easyAsk = /(facile|facilement|rapide|rapidement|vite|simple|quick ?win)/.test(n) && /(badge|gagner|debloqu|obtenir|remporter|avoir|\bxp\b)/.test(n);
        var gameCtx = /badge|badges|achievement|succes|troph|\bxp\b|debloqu|maturite|phase de/.test(n) || easyAsk;
        if (!gameCtx) return null;
        function tag(r, k) { r.intent = k; return r; }
        // « lequel je peux gagner facilement » → propose un badge facile (priorité haute).
        if (easyAsk || (/facile|facilement|le plus simple|rapide a/.test(n) && /badge/.test(n))) return tag(d_badge_easy(), 'gaming_easy');
        if (/phase|maturite|palier|decouverte|structuration|fiabilisation|optimisation|excellence/.test(n)) return tag(d_gaming_phases(), 'gaming_phases');
        if (/famille|familles|categorie|categories|\baxe\b|axes/.test(n)) return tag(d_gaming_cats(), 'gaming_cats');
        if (/attente de donnee|en attente|grise|verrouille pourquoi|pourquoi.*(pas|jamais).*(debloqu|badge)|badge.*(pas|jamais).*debloqu/.test(n)) return tag(d_gaming_gate(), 'gaming_gate');
        if (/liste|tous les badges|quels badges|catalogue|lesquel|les badges (de|d|hygien|qualit|delivery|resilience|stabilit|pratique)/.test(n)) return tag(d_badge_list(n), 'gaming_list');
        var b = findBadge(n);
        var howto = /comment|debloqu|obtenir|avoir|gagner|remplir|valider|atteindre|ameliorer|progresser|conseil|astuce/.test(n);
        if (b) return tag(d_badge_info(b, howto), 'gaming_badge');
        if (howto) return { html: `Pour débloquer plus de badges : ouvre <b>Achievements</b> (tes badges verrouillés + leur recette), ou dis-moi un badge précis — ex. « comment débloquer <b>Small MR</b> ». Familles : 🚀 Delivery · 🔒 Qualité · ⚙️ Stabilité · 🧹 Hygiène · 🚌 Résilience · ⚡ Pratiques.`, intent: 'gaming_howto' };
        if (isData) return tag(await d_badges(n), 'badges');
        return tag({ html: defHtml('badges') }, 'badges');
    }

    // ══════════════════════════════════════════════════════════════════
    //  SAVOIR BUS FACTOR — miroir fidèle de js/bus-factor.js + bus-factor.html
    //  Mesure le savoir d'AUJOURD'HUI, par zone de code. Niveaux 1/2/≥3, score /5.
    // ══════════════════════════════════════════════════════════════════
    // Les « notes » : niveaux par zone + score global /5.
    function d_bf_levels() {
        return {
            html: `🚌 <b>Bus Factor</b> — combien de personnes peuvent partir avant que le projet soit bloqué. Mesuré <b>par zone de code</b> (le savoir d'aujourd'hui, pas l'historique) :<br>` +
                `🔴 <b>BF = 1</b> — une seule personne connaît le code → <b>risque critique</b><br>` +
                `🟡 <b>BF = 2</b> — deux personnes → <b>risque moyen</b><br>` +
                `🟢 <b>BF ≥ 3</b> — trois ou plus → <b>risque faible</b><br>` +
                `<span class="sqa-hint">Score global <b>/5</b> = médiane des zones pondérée par leur activité : &lt; 2 🔴 RISQUE CRITIQUE · &lt; 3 🟡 RISQUE MOYEN · ≥ 3 🟢 RISQUE FAIBLE. Un contributeur qui détient ≥ 70 % d'une zone est signalé « dominant ».</span>`
        };
    }
    // « comment améliorer / réduire mon bus factor »
    function d_bf_improve() {
        var levers = [
            { t: 'Pair / mob-programming sur les zones critiques', d: 'Deux personnes sur le code où une seule sait aujourd\'hui : le savoir se diffuse en le faisant ensemble.' },
            { t: 'Revue croisée systématique', d: 'Le savoir circule par la review — fais relire les zones que peu de gens maîtrisent.' },
            { t: 'Rotation des reviewers (≥ 3 distincts)', d: 'Évite le relecteur unique : plusieurs yeux sur la durée diffusent la connaissance.' },
            { t: 'Documenter les zones critiques', d: 'Un README par module + des runbooks : ce qui est écrit ne part pas avec la personne.' },
            { t: 'Répartir le travail', d: 'Vise un top contributeur sous ~40 % des commits : pas de zone « propriété » d\'une seule personne.' }
        ];
        var lv = levers.slice(0, 3).map(function (l) { return `<div class="sqa-atl"><b>${esc(l.t)}</b><div class="sqa-atl-d">${esc(l.d)}</div></div>`; }).join('');
        var atlTop = scoreAteliers(['bus', 'factor', 'resilience', 'rotation', 'connaissance', 'pair', 'continuite'])[0];
        var atlHtml = atlTop ? `<div class="sqa-hint">🎓 Atelier pour se faire accompagner :</div>${atelierCard(atlTop.a)}` : '';
        return {
            html: `🚌 <b>Réduire ton risque bus factor</b> — l'objectif : que <b>personne ne soit seul</b> à savoir.${lv}` +
                `<div class="sqa-hint">🎮 Badges liés : <b>Bus Factor Safe</b> (≥ 3 contributeurs), <b>Work Balanced</b> (&lt; 40 %), <b>Reviewer Rotation</b> (≥ 3 relecteurs).</div>${atlHtml}` +
                `<div class="sqa-hint">Ouvre le module <b>🚌 Bus Factor</b> pour voir <b>quelles zones</b> et <b>qui</b> concentrent le savoir.</div>`
        };
    }

    // ══════════════════════════════════════════════════════════════════
    //  SAVOIR DAILY REPORT — miroir fidèle de js/daily-report.js + .html
    //  Résumé de la journée GitLab (pensé standup) + « conseils du jour ».
    // ══════════════════════════════════════════════════════════════════
    // Ce que contient le rapport (6 chiffres + sections).
    function d_daily_content() {
        return {
            html: `📋 Le <b>Daily Report</b> résume ta journée GitLab (pensé pour le <b>standup</b>). En tête, <b>6 chiffres</b> : MRs mergées · pipelines · échecs · déploiements · taux de succès · commits.<br>` +
                `Puis les sections : <b>conseils du jour</b>, pipelines en échec, déploiements, tags/releases, MRs (mergées / en attente / fermées), branches (actives / stale > 30 j / mergées non supprimées), issues, <b>pipelines de longue durée</b> (> 15 min), branches à surveiller, <b>reverts</b>.<br>` +
                `<span class="sqa-hint">Navigable jour par jour. Ouvre le module <b>📋 Daily Report</b>.</span>`
        };
    }
    // Les « conseils du jour » : ce que le rapport détecte + seuils (max 5, triés).
    function d_daily_tips() {
        var rows = [
            '🔴 <b>pipelines en échec</b> → à débloquer en priorité',
            '👀 <b>MR mergée sans reviewer</b> → qualité',
            '📝 <b>MR sans description</b> (&lt; 20 car.)',
            '📐 <b>commits non conventionnels</b> (&gt; 40 % ; feat/fix/docs…)',
            '⏳ <b>MR en attente + 7 jours</b> → risque de conflits',
            '⏱️ <b>pipeline &gt; 15 min</b> → perf',
            '🔄 <b>reverts</b> → problème en prod ou MR mergée trop vite ?',
            '🐛 <b>nouveaux bugs</b> ouverts',
            '🚀 <b>pas de déploiement</b> malgré des pipelines',
            '✅ tout vert · 🎉 MRs toutes reviewées · 🔥 grosse journée · 😴 journée calme'
        ].map(function (r) { return '• ' + r; }).join('<br>');
        return { html: `📋 Les <b>conseils du jour</b> (max 5, triés urgence → positif). Le rapport signale :<br>${rows}` };
    }
    // Mon rapport du jour (digest live).
    async function d_daily() {
        var c = repoCtx(); if (c.err) return c.err;
        var d = new Date(), since = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString(), todayStr = new Date().toISOString().slice(0, 10);
        var res = await Promise.all([
            J(c, `/projects/${c.pid}/pipelines?per_page=100&updated_after=${encodeURIComponent(since)}`),
            J(c, `/projects/${c.pid}/merge_requests?state=merged&per_page=100&updated_after=${encodeURIComponent(since)}`),
            J(c, `/projects/${c.pid}/deployments?per_page=100&order_by=created_at&sort=desc`)
        ]);
        var pl = (res[0] || []).filter(function (p) { return (p.created_at || '').slice(0, 10) === todayStr; });
        var mg = (res[1] || []), dp = (res[2] || []).filter(function (x) { return (x.created_at || '').slice(0, 10) === todayStr; });
        var failed = pl.filter(function (p) { return p.status === 'failed'; }).length;
        var succ = pl.filter(function (p) { return p.status === 'success'; }).length;
        var rate = pl.length ? Math.round(succ / pl.length * 100) : null;
        return { html: `📋 <b>Aujourd'hui</b> sur <b>${esc(c.name)}</b> : <b>${pl.length}</b> pipeline(s)${failed ? ` (<b>${failed}</b> en échec)` : ''}, <b>${mg.length}</b> MR mergée(s), <b>${dp.length}</b> déploiement(s)${rate != null ? `, taux succès <b>${rate}%</b>` : ''}.<br><span class="sqa-hint">Détail + conseils du jour → module <b>📋 Daily Report</b>.</span>` };
    }

    // ══════════════════════════════════════════════════════════════════
    //  SAVOIR REPO ANALYZER — miroir fidèle de js/repo-analyzer.js
    //  Score de santé /100, sous-scores CI/MR, red flags, quick-wins priorisés.
    //  Salsi refetch les mêmes endpoints (commits 90 j, MR state=all, per_page=100).
    // ══════════════════════════════════════════════════════════════════
    var RA_EXCL = { main: 1, master: 1, develop: 1, dev: 1 };
    function raAge(iso) { return iso ? Math.floor((Date.now() - Date.parse(iso)) / 86400000) : null; }
    function raBus(cs) { var t = cs.reduce(function (s, x) { return s + (x.commits || 0); }, 0); if (!t) return { name: '-', pct: 0 }; var top = cs.reduce(function (m, x) { return (x.commits || 0) > (m.commits || 0) ? x : m; }, cs[0]); return { name: top.name || top.email || '?', pct: Math.round((top.commits || 0) / t * 100) }; }
    function raDead(bs) { return bs.filter(function (b) { return b.name && !RA_EXCL[b.name.toLowerCase()] && b.commit && raAge(b.commit.committed_date) > 90; }); }
    function raStale(bs) { return bs.filter(function (b) { var a = b.commit && raAge(b.commit.committed_date); return b.name && !RA_EXCL[b.name.toLowerCase()] && a != null && a > 30 && a <= 90; }); }
    function raMrScore(mrs) { var open = mrs.filter(function (m) { return m.state === 'opened'; }), merged = mrs.filter(function (m) { return m.state === 'merged'; }); var s = 100; if (!merged.length && open.length) s -= 40; if (open.length > 10) s -= 20; s -= open.filter(function (m) { return raAge(m.created_at) > 7; }).length * 5; s -= open.filter(function (m) { return raAge(m.created_at) > 30; }).length * 10; return Math.max(0, s); }
    function raPag(c, ep, mp) { return Salsifi.gitlabPaginate(c.auth.gitlabUrl, c.auth.token, ep, { maxPages: mp || 3 }).catch(function () { return []; }); }
    function raSince() { return new Date(Date.now() - 90 * 86400000).toISOString(); }

    // « ma note / mon score repo » → santé /100 (formule exacte) + sous-scores.
    async function d_repo_score() {
        var c = repoCtx(); if (c.err) return c.err;
        var R = await Promise.all([
            J(c, `/projects/${c.pid}/repository/commits?per_page=100&since=${encodeURIComponent(raSince())}`),
            J(c, `/projects/${c.pid}/merge_requests?state=all&per_page=100`),
            J(c, `/projects/${c.pid}/repository/contributors?per_page=100`),
            J(c, `/projects/${c.pid}/pipelines?per_page=100`)
        ]);
        var commits = R[0] || [], mrs = R[1] || [], contribs = R[2] || [], pipelines = R[3] || [];
        var openMRs = mrs.filter(function (m) { return m.state === 'opened'; }), bf = raBus(contribs);
        var score = 100, deduc = [];
        if (!commits.length) { score -= 40; deduc.push('aucun commit sur 90 j (−40)'); }
        if (openMRs.length >= 10) { score -= 10; deduc.push('≥ 10 MR ouvertes (−10)'); }
        if (bf.pct >= 80) { score -= 15; deduc.push(`bus factor ${bf.pct} % (−15)`); }
        score = Math.max(0, Math.min(100, score));
        var ci = pipelines.length ? Math.round(pipelines.filter(function (p) { return p.status === 'success'; }).length / pipelines.length * 100) : 0;
        var mrS = raMrScore(mrs), col = score >= 80 ? '🟢' : score >= 50 ? '🟡' : '🔴';
        return { html: `📁 <b>Santé de ${esc(c.name)}</b> : ${col} <b>${score}/100</b>.${deduc.length ? ` <span class="sqa-hint">Ce qui pèse : ${esc(deduc.join(' · '))}.</span>` : ' Rien à retirer 🎉'}<br>Sous-scores : ⚙️ CI/CD <b>${ci}%</b> · 🔀 Code reviews (MR) <b>${mrS}%</b>.<br><span class="sqa-hint">Demande « <b>ce qui ne va pas</b> » ou « <b>comment améliorer mon repo</b> » pour le détail.</span>` };
    }

    // « ce qui ne va pas / mes red flags » → alertes critiques (formule exacte).
    async function d_repo_flags() {
        var c = repoCtx(); if (c.err) return c.err;
        var R = await Promise.all([
            raPag(c, `/projects/${c.pid}/repository/branches`, 3),
            J(c, `/projects/${c.pid}/repository/contributors?per_page=100`),
            J(c, `/projects/${c.pid}/pipelines?per_page=100`),
            F(c, `/projects/${c.pid}/protected_branches?per_page=100`)
        ]);
        var branches = R[0] || [], contribs = R[1] || [], pipelines = R[2] || [], prot = R[3];
        var flags = [];
        var mainB = branches.filter(function (b) { return ['main', 'master'].indexOf(b.name.toLowerCase()) >= 0; })[0];
        if (mainB && prot.status !== 403 && Array.isArray(prot.data)) {
            var isProt = prot.data.map(function (b) { return b.name.toLowerCase(); }).indexOf(mainB.name.toLowerCase()) >= 0;
            if (!isProt) flags.push('🛡️ <b>Branche main non protégée</b> — risque de push direct en prod.');
        }
        var bf = raBus(contribs);
        if (bf.pct >= 75) flags.push(`🚌 <b>Bus factor ${bf.pct >= 90 ? 'critique' : 'élevé'} (${bf.pct} %)</b> — ${esc(bf.name)} concentre le savoir.`);
        if (pipelines.length) { var rate = Math.round(pipelines.filter(function (p) { return p.status === 'success'; }).length / pipelines.length * 100); if (rate < 60) flags.push(`💥 <b>CI/CD instable (${rate} % succès)</b> — beaucoup de builds échouent.`); }
        var dead = raDead(branches); if (dead.length >= 5) flags.push(`💀 <b>${dead.length} branches mortes</b> (> 90 j) — le repo est pollué.`);
        if (!flags.length) return { html: `🎉 <b>Aucune alerte critique</b> sur <b>${esc(c.name)}</b> — les fondamentaux sont au vert. Demande « comment améliorer mon repo » pour les optimisations.` };
        return { html: `🚨 <b>Ce qui ne va pas</b> sur <b>${esc(c.name)}</b> :<br>` + flags.map(function (f) { return '• ' + f; }).join('<br>') + `<br><span class="sqa-hint">« comment améliorer mon repo » → le plan d'action priorisé.</span>` };
    }

    // « comment améliorer mon repo / quick wins » → actions priorisées (miroir des 24 règles).
    async function d_repo_improve() {
        var c = repoCtx(); if (c.err) return c.err;
        var R = await Promise.all([
            raPag(c, `/projects/${c.pid}/repository/branches`, 3),
            J(c, `/projects/${c.pid}/merge_requests?state=all&per_page=100`),
            J(c, `/projects/${c.pid}/repository/contributors?per_page=100`),
            J(c, `/projects/${c.pid}/pipelines?per_page=100`),
            F(c, `/projects/${c.pid}/protected_branches?per_page=100`),
            J(c, `/projects/${c.pid}/repository/commits?per_page=100&since=${encodeURIComponent(raSince())}`),
            raPag(c, `/projects/${c.pid}/repository/tree?recursive=true`, 5),
            J(c, `/projects/${c.pid}/labels?per_page=100`)
        ]);
        var branches = R[0] || [], mrs = R[1] || [], contribs = R[2] || [], pipelines = R[3] || [], prot = R[4], commits = R[5] || [], tree = R[6] || [], labels = R[7] || [];
        var open = mrs.filter(function (m) { return m.state === 'opened'; }), merged = mrs.filter(function (m) { return m.state === 'merged'; });
        var files = tree.filter(function (f) { return f.path && f.path.indexOf('/') < 0; }).map(function (f) { return (f.name || '').toLowerCase(); });
        var hasCi = files.indexOf('.gitlab-ci.yml') >= 0, bf = raBus(contribs);
        var qw = [];
        function add(p, icon, t, d) { qw.push({ p: p, icon: icon, t: t, d: d }); }
        // CRITIQUE (0)
        var mainB = branches.filter(function (b) { return ['main', 'master'].indexOf(b.name.toLowerCase()) >= 0; })[0];
        var isProt = prot.status !== 403 && Array.isArray(prot.data) && mainB && prot.data.map(function (b) { return b.name.toLowerCase(); }).indexOf(mainB.name.toLowerCase()) >= 0;
        if (mainB && prot.status !== 403 && !isProt) add(0, '🛡️', 'Protéger la branche main', 'N\'importe qui peut push en prod.');
        if (!pipelines.length && !hasCi) add(0, '⚙️', 'Configurer CI/CD', 'Aucun pipeline : builds et tests non automatisés.');
        if (bf.pct >= 90) add(0, '🚌', 'Bus factor critique', `${bf.name} = ${bf.pct} % du code. Partagez la connaissance.`);
        var aband = open.filter(function (m) { return raAge(m.created_at) > 30; }); if (aband.length) add(0, '📌', `Closer ${aband.length} MR abandonnée(s)`, 'Ouvertes depuis > 30 j : merger, closer ou relancer.');
        var dead = raDead(branches); if (dead.length) add(0, '💀', `Supprimer ${dead.length} branche(s) morte(s)`, 'Inactives > 90 j : elles polluent le repo.');
        // URGENT (1)
        var conf = open.filter(function (m) { return m.has_conflicts === true; }); if (conf.length) add(1, '⚔️', `Résoudre ${conf.length} conflit(s) de MR`, 'Ces MR ne peuvent pas être mergées en l\'état.');
        var oldm = open.filter(function (m) { var a = raAge(m.created_at); return a > 7 && a <= 30; }); if (oldm.length) add(1, '⏳', `Reviewer ${oldm.length} MR en attente`, 'Ouvertes > 7 j : le feedback devient obsolète.');
        var noRev = open.filter(function (m) { return !m.reviewers || !m.reviewers.length; }); if (noRev.length) add(1, '👀', `Assigner ${noRev.length} reviewer(s)`, 'Code mergé sans validation possible.');
        var stale = raStale(branches); if (stale.length) add(1, '🧹', `Nettoyer ${stale.length} branche(s) stale`, 'Inactives 30-90 j : finir, merger ou supprimer.');
        var failed = pipelines.filter(function (p) { return p.status === 'failed'; }); if (pipelines.length && failed.length >= pipelines.length * 0.3) add(1, '💥', 'Pipelines en échec', `${failed.length} échecs : investiguez les causes.`);
        // IMPORTANT (2)
        var noDesc = merged.concat(open).filter(function (m) { return !m.description || m.description.trim().length < 10; }); if (noDesc.length) add(2, '📝', `Documenter ${noDesc.length} MR`, 'Description manquante : les reviewers manquent de contexte.');
        if (bf.pct >= 70 && bf.pct < 90) add(2, '🤝', 'Améliorer le bus factor', `${bf.name} = ${bf.pct} %. Planifiez du pair programming.`);
        var conv = /^(feat|fix|docs|style|refactor|test|chore|build|ci)(\(.+\))?:/; var nonConv = commits.filter(function (cm) { return !conv.test(cm.title || ''); }); if (commits.length > 10 && nonConv.length > commits.length * 0.7) add(2, '📐', 'Adopter Conventional Commits', 'Standardisez : feat:, fix:, docs:…');
        // AMÉLIORATION (3)
        if (files.filter(function (f) { return f.indexOf('readme') === 0; }).length === 0) add(3, '📖', 'Créer un README', 'Aide les nouveaux arrivants à comprendre le projet.');
        if (files.indexOf('.gitignore') < 0) add(3, '🚫', 'Ajouter un .gitignore', 'Évite de committer node_modules, build, secrets…');
        if (contribs.length > 3 && !tree.some(function (f) { return /^(CODEOWNERS|docs\/CODEOWNERS|\.gitlab\/CODEOWNERS)$/i.test(f.path || ''); })) add(3, '👥', 'Créer un CODEOWNERS', 'Assigne les reviewers par zone de code.');
        if (!labels.length) add(3, '🏷️', 'Définir des labels', 'Pour catégoriser et filtrer MRs/issues.');

        if (!qw.length) return { html: `🎉 <b>${esc(c.name)}</b> : rien de critique, beau boulot ! Continue comme ça. 🌱` };
        qw.sort(function (a, b) { return a.p - b.p; });
        var pl = ['🔴 critique', '🟠 urgent', '🟡 important', '🔵 amélioration'];
        var items = qw.slice(0, 6).map(function (w) { return `<div class="sqa-atl"><b>${w.icon} ${esc(w.t)}</b> <span class="sqa-hint">${pl[w.p]}</span><div class="sqa-atl-d">${esc(w.d)}</div></div>`; }).join('');
        return { html: `🛠️ <b>Comment améliorer ${esc(c.name)}</b> — top ${Math.min(qw.length, 6)} sur ${qw.length} action(s) :${items}<span class="sqa-hint">Détail complet + boutons d'action → module <b>Repo Analyzer</b>.</span>` };
    }

    // « mon repo est-il actif ? » → badge d'activité (formule exacte du module).
    async function d_repo_activity() {
        var c = repoCtx(); if (c.err) return c.err;
        var R = await Promise.all([
            J(c, `/projects/${c.pid}/repository/commits?per_page=100&since=${encodeURIComponent(raSince())}`),
            J(c, `/projects/${c.pid}/merge_requests?state=all&per_page=100`)
        ]);
        var commits = R[0] || [], mrs = R[1] || [];
        var last = commits.length ? raAge(commits[0].created_at || commits[0].committed_date) : null;
        var avg = (commits.length + mrs.length) / 30, badge = avg >= 2 ? '🔥 Très actif' : avg >= 0.5 ? '✅ Actif' : '😴 Peu actif';
        return { html: `📁 <b>${esc(c.name)}</b> : ${badge} — <b>${commits.length}</b> commit(s) (90 j), <b>${mrs.length}</b> MR${last != null ? `, dernier commit il y a <b>${last} j</b>` : ''}.` };
    }

    // Routeur Repo Analyzer : score / ce qui ne va pas / améliorer / activité.
    async function repoRoute(n) {
        var repoAsk = /repo analyzer|analyzer|analyse (de |du |mon )?repo|sante (de |du |mon )?repo|health|red flag|point.* ?a? ?ameliorer|quick ?win|ce qui (ne )?va pas|ce qui cloche|qu est ce qui (ne )?va pas|mes (probleme|alerte|souci|red flag)|note (globale|de mon repo|du repo|repo)|score (de mon |du |mon )?repo|ameliorer mon repo|comment (je m ameliore|m ameliorer|je progresse|progresser|s ameliorer)|etat de mon repo global|mon repo est il|repo actif/.test(n);
        if (!repoAsk) return null;
        function tag(r, k) { r.intent = k; return r; }
        if (/ce qui (ne )?va pas|cloche|probleme|alerte|red flag|risque|qu est ce qui|ce qui cloche/.test(n)) return tag(await d_repo_flags(), 'repo_flags');
        if (/ameliore|ameliorer|quick ?win|action|recommand|que faire|que dois je|point.* ?ameliorer|conseil|progresser|optimiser/.test(n)) return tag(await d_repo_improve(), 'repo_improve');
        if (/actif|activite|vivant|mort|inactif/.test(n)) return tag(await d_repo_activity(), 'repo_activity');
        return tag(await d_repo_score(), 'repo_score');
    }

    // ══════════════════════════════════════════════════════════════════
    //  AIDE — « que fait la plateforme + comment tu peux m'aider »
    //  Panorama des 4 pôles / 18 modules (desc officielles) + capacités de Salsi.
    // ══════════════════════════════════════════════════════════════════
