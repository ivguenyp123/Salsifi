/* salsi/qa · knowledge.js — aide/usage, ateliers, glossaire, intentions, smalltalk (chargé 4e). */

'use strict';

    var HELP_POLES = [
        {
            t: '📊 Mesurer & Progresser', m: [
                ['📊', 'DORA Insights', 'tes 4 chiffres du delivery (DF, lead time, CFR, MTTR) + Coach + rapport'],
                ['📋', 'DevOps Assessment', 'score de maturité sur 8 axes, radar et historique'],
                ['🏆', 'Achievements', 'badges DevOps + phases de maturité (motivation par le jeu)'],
                ['🚌', 'Bus Factor', 'les zones de code maîtrisées par une seule personne'],
                ['📅', 'Daily Report', 'synthèse quotidienne pour le standup + conseils du jour'],
                ['📄', 'Générateur de rapport', 'composer un rapport HTML à partir de blocs 🚧 bientôt']
            ]
        },
        {
            t: '🚀 Livrer & Déployer', m: [
                ['⚙️', 'Pipeline Generator', 'génère ton .gitlab-ci.yml en wizard, pousse, lance, suit les logs'],
                ['🚩', 'Feature Flag Manager', 'cycle de vie des flags : création, audit, decommission, RBAC'],
                ['📝', 'Release Notes', 'génère les notes de version automatiquement par tag Git']
            ]
        },
        {
            t: '🔬 Inspecter & Sécuriser', m: [
                ['🔬', 'Repo Analyzer', 'état global : santé /100, red flags, quick-wins priorisés'],
                ['🛡️', 'Security Scanner', 'conformité CIS GitLab (branch protection, approvals, lock files) — note A→F'],
                ['🥗', 'Repo Diet', 'détecte binaires/archives/logs et génère un .gitignore'],
                ['🌳', 'Branch Monitor', 'détecte et nettoie les branches obsolètes'],
                ['🔑', 'Secrets Scanner', 'secrets exposés dans tes repos 🔒 réservé plateforme'],
                ['🧪', 'Secret Scanner Test', 'Blast Radius d\'un IOC (package compromis), read-only + timeline']
            ]
        },
        {
            t: '🤝 Collaborer & Améliorer', m: [
                ['🤖', 'MR Reviewer AI', 'analyse IA des MR : qualité, risques, couverture, suggestions'],
                ['🔄', 'Auto Retro', 'génère une rétro à partir des données GitLab (user stories incluses)'],
                ['🎯', 'Smart Estimate', 'estime la charge d\'une feature à partir de l\'historique des MR']
            ]
        }
    ];
    // Index des modules « peu couverts » → au moins définissables (« c'est quoi X ? »).
    // Les 6 modules à couverture profonde gardent leurs routes riches (exclus ici).
    var DEEP_MODULES = { 'DORA Insights': 1, 'Achievements': 1, 'Bus Factor': 1, 'Daily Report': 1, 'Feature Flag Manager': 1, 'Repo Analyzer': 1 };
    var MODULE_INDEX = [];
    HELP_POLES.forEach(function (p) { p.m.forEach(function (x) { if (!DEEP_MODULES[x[1]]) MODULE_INDEX.push({ icon: x[0], name: x[1], desc: x[2], pole: p.t.replace(/^\S+\s/, ''), hay: norm(x[1]) }); }); });
    // Trouve le module nommé (tous ses mots ≥ 4 lettres présents) ou null.
    function moduleLookup(n) {
        var best = null, bestScore = 0;
        MODULE_INDEX.forEach(function (m) {
            var toks = m.hay.split(' ').filter(function (t) { return t.length >= 4; });
            if (!toks.length) return;
            if (toks.every(function (t) { return n.indexOf(t) >= 0; }) && toks.length > bestScore) { best = m; bestScore = toks.length; }
        });
        if (!best) return null;
        return { html: `${best.icon} <b>${esc(best.name)}</b> — ${esc(best.desc)}.<br><span class="sqa-hint">Pôle « ${esc(best.pole)} ». Je réponds en <b>détail</b> (chiffres, note, améliorer) sur DORA, Achievements, Bus Factor, Daily, Feature Flags et Repo Analyzer.</span>`, intent: 'module_info' };
    }
    // « comment je m'en sers / comment ça marche » → comment utiliser le module + ce que Salsi répond.
    var USAGE = {
        dora: { ic: '📊', label: 'DORA Insights', page: 'insights.html', how: 'tu y vois tes 4 mesures + un score /100, et le Coach te fait un plan par mesure', ask: ['mon score DORA ?', 'améliorer mon lead time', 'les niveaux DORA', 'génère le rapport DORA'] },
        badges: { ic: '🏆', label: 'Achievements', page: 'gaming.html', how: 'tu débloques des badges selon tes pratiques GitLab réelles, avec des phases de maturité', ask: ['combien de badges ?', 'quel badge gagner facilement ?', 'comment débloquer Small MR ?'] },
        bus_factor: { ic: '🚌', label: 'Bus Factor', page: 'bus-factor.html', how: 'tu repères les zones de code maîtrisées par une seule personne', ask: ['mon bus factor ?', 'comment réduire mon bus factor ?'] },
        daily: { ic: '📅', label: 'Daily Report', page: 'daily-report.html', how: 'le résumé de ta journée + des conseils, pensé pour le standup', ask: ['mon rapport du jour', 'les conseils du jour', 'génère le rapport de la semaine'] },
        feature_flags: { ic: '🚩', label: 'Feature Flag Manager', page: 'feature-flag-manager.html', how: 'tu gères le cycle de vie de tes feature flags', ask: ['combien de FF ?', 'lesquels en prod ?', 'le flag <nom> ?'] },
        repo_analyzer: { ic: '🔬', label: 'Repo Analyzer', page: 'repo-analyzer.html', how: 'l\'audit complet de ton repo : santé, red flags, quick-wins', ask: ['la note de mon repo ?', 'ce qui ne va pas ?', 'comment améliorer mon repo ?'] }
    };
    function usageHelp(key) {
        var u = USAGE[key];
        var asks = u.ask.map(function (a) { return `« ${esc(a)} »`; }).join(' · ');
        return { html: `${u.ic} <b>${esc(u.label)}</b> — ${esc(u.how)}. <a href="${esc(u.page)}" target="_blank" rel="noopener">Ouvrir le module ↗</a><br>Et moi, tu peux me demander direct : ${asks}. 🌱` };
    }
    function usageKeyFromN(n) {
        if (doraKeyFromN(n) || /\bdora\b/.test(n)) return 'dora';
        if (/badge|achievement|gaming|succes/.test(n)) return 'badges';
        if (/bus factor|busfactor|facteur de bus/.test(n)) return 'bus_factor';
        if (/daily|standup|rapport du jour/.test(n)) return 'daily';
        if (/feature flag|\bff\b|drapeau/.test(n)) return 'feature_flags';
        if (/repo analyzer|analyse.*repo|sante.*repo/.test(n)) return 'repo_analyzer';
        return null;
    }
    function usageKeyFromIntent(k) {
        if (['dora', 'cfr', 'mttr', 'lead_time', 'deploy_freq'].indexOf(k) >= 0) return 'dora';
        if (k === 'badges') return 'badges';
        if (k === 'bus_factor') return 'bus_factor';
        if (k === 'daily') return 'daily';
        if (k === 'feature_flags') return 'feature_flags';
        if (k === 'repo_analyzer' || /^repo_/.test(k)) return 'repo_analyzer';
        return null;
    }
    // ── FORMATION : réponses issues des docs de formation (js/salsi/formation.js) ──
    // Match par mots-clés (sous-chaîne, normalisé). Renvoie la meilleure entrée ou null.
    function formationRoute(n) {
        var F = Salsifi.formation; if (!F || !F.entries) return null;
        var best = null, bestScore = 0;
        F.entries.forEach(function (e) {
            // Co-occurrence : tous les tokens `all` présents (robuste aux tournures libres).
            if (e.all && e.all.every(function (tok) { return n.indexOf(norm(tok)) >= 0; })) {
                var sc = 100 + e.all.join('').length;
                if (sc > bestScore) { bestScore = sc; best = e; }
            }
            // Mots-clés (sous-chaîne) : on garde le plus long match.
            (e.kw || []).forEach(function (k) {
                var kn = norm(k);
                if (kn.length >= 4 && n.indexOf(kn) >= 0 && kn.length > bestScore) { best = e; bestScore = kn.length; }
            });
        });
        if (!best) return null;
        var m = F.modules[best.mod] || {};
        var foot = m.title ? `<div class="sqa-hint">📘 Formation${(m.num && m.num !== '—') ? ' · Module ' + esc(m.num) : ''} — ${esc(m.title)}${m.niveau ? ' (' + esc(m.niveau) + ')' : ''}</div>` : '';
        return { html: `${best.a}${foot}`, intent: 'formation' };
    }
    function d_help() {
        var poles = HELP_POLES.map(function (p) {
            var mods = p.m.map(function (x) { return `${x[0]} <b>${esc(x[1])}</b> — <span class="sqa-hint">${esc(x[2])}</span>`; }).join('<br>');
            return `<b>${p.t}</b><br>${mods}`;
        }).join('<br><br>');
        var moi = [
            '📖 <b>Définir</b> les concepts — « c\'est quoi le bus factor ? », « les niveaux DORA »',
            '📊 <b>Sortir tes chiffres</b> — « combien de FF ? », « mon score DORA ? », « la note de mon repo ? », « combien de MR ? »',
            '🩺 <b>Dire ce qui ne va pas</b> + <b>comment progresser</b> — repo, DORA, bus factor',
            '🎮 <b>Badges</b> — « combien de badges ? », « quel badge gagner facilement ? »',
            '📄 <b>Générer & télécharger des rapports</b> — DORA, et jour / semaine / mois',
            '🎓 <b>Te relier aux 205 ateliers</b> — « atelier pour optimiser mon flow »'
        ].map(function (x) { return '• ' + x; }).join('<br>');
        return {
            html: `🌱 <b>Salsifi</b> — plateforme d'aide à la maturité DevOps au-dessus de GitLab. <b>4 pôles, 18 modules</b> :<br><br>${poles}<br><br>` +
                `💬 <b>Moi (Salsi), je t'aide à :</b><br>${moi}<br><br>` +
                `<span class="sqa-hint">Pose ta question — un concept, un chiffre, « ce qui ne va pas », ou « génère le rapport de la semaine ». 🌱</span>`
        };
    }

    // ── Ateliers : recherche dans le référentiel (205 actions) + lien Confluence ──
    var ATL_STOP = { c: 1, est: 1, quoi: 1, mon: 1, ma: 1, mes: 1, de: 1, du: 1, la: 1, le: 1, les: 1, un: 1, une: 1, des: 1, pour: 1, sur: 1, au: 1, aux: 1, et: 1, ou: 1, comment: 1, je: 1, tu: 1, on: 1, nous: 1, notre: 1, nos: 1, avec: 1, dans: 1, en: 1, ce: 1, cette: 1, veux: 1, aide: 1, faire: 1, plus: 1, moins: 1, optimiser: 1, ameliorer: 1, reduire: 1, progresser: 1, muscler: 1, atelier: 1, ateliers: 1, workshop: 1, session: 1, accompagnement: 1, sait: 1, peux: 1, avoir: 1, mieux: 1, gerer: 1, notre: 1 };
    var ATL_SYN = {
        flow: ['flux', 'livraison', 'delivery', 'pipeline', 'lead time', 'cycle', 'goulot', 'dependance', 'wip', 'valeur'],
        flux: ['flow', 'livraison', 'goulot', 'dependance'],
        pipeline: ['pipeline', 'ci', 'cd', 'echec', 'build', 'automatis'],
        dette: ['dette', 'technique', 'refactor', 'backlog'],
        securite: ['securite', 'secret', 'vulnerabilite', 'scan', 'supply'],
        test: ['test', 'couverture', 'qualite', 'tdd'],
        incident: ['incident', 'post mortem', 'mttr', 'crise', 'blame'],
        rituel: ['rituel', 'daily', 'retro', 'ceremonie', 'standup'],
        dependance: ['dependance', 'couplage', 'inter squad', 'synchro'],
        deploiement: ['deploiement', 'deploy', 'release', 'livraison'],
        monitoring: ['monitoring', 'alerting', 'observabilite', 'metrique']
    };
    function atlExpand(kws) {
        var out = {}; kws.forEach(function (w) { out[w] = 1; (ATL_SYN[w] || []).forEach(function (s) { out[s] = 1; }); });
        return Object.keys(out);
    }
    // Score les 205 ateliers sur une liste de termes → [{a,score}] trié décroissant.
    function scoreAteliers(terms) {
        var W = Salsifi.workshops; if (!W || !W.actions) return [];
        var scored = [];
        Object.keys(W.actions).forEach(function (k) {
            var a = W.actions[k], txt = norm((a.action || '') + ' ' + (a.titre || '') + ' ' + (a.axeLabel || ''));
            var score = 0; terms.forEach(function (t) { if (txt.indexOf(t) >= 0) score += (t.length > 4 ? 2 : 1); });
            if (score > 0) scored.push({ a: a, score: score });
        });
        scored.sort(function (x, y) { return y.score - x.score; });
        return scored;
    }
    function atelierCard(a) {
        var desc = a.action || a.titre, title = a.page || a.titre;
        var head = a.lien ? `<a href="${esc(a.lien)}" target="_blank" rel="noopener">🎓 ${esc(title)} ↗</a>` : `🎓 ${esc(title)} <span class="sqa-hint">(pas encore de page)</span>`;
        return `<div class="sqa-atl">${head}<div class="sqa-atl-d">${esc(desc)}</div><div class="sqa-atl-x">${esc(a.axeLabel || '')} · niv. ${esc(a.niveau)}</div></div>`;
    }
    function searchAteliers(n) {
        var W = Salsifi.workshops; if (!W || !W.actions) return { html: 'Le référentiel d\'ateliers n\'est pas chargé.' };
        var kws = n.split(' ').filter(function (w) { return w.length > 2 && !ATL_STOP[w]; });
        if (!kws.length) return { html: `Sur quel sujet veux-tu progresser ? 🌱 Essaie : « atelier <b>flow</b> », « atelier <b>pipeline</b> », « atelier <b>dette</b> », « <b>incidents</b> », « <b>sécurité</b> », « <b>rituels</b> », « <b>dépendances</b> ».` };
        var top = scoreAteliers(atlExpand(kws)).slice(0, 3);
        if (!top.length) return { html: `Je n'ai pas trouvé d'atelier pile sur « ${esc(kws.join(' '))} » 🌱 Essaie un mot-clé plus large : flow, pipeline, dette, incidents, sécurité, rituels, dépendances.` };
        return { html: `🎓 Les ateliers les plus proches :` + top.map(function (s) { return atelierCard(s.a); }).join('') };
    }

    // ── Glossaire (définitions fixes) ──
    var G = {
        bus_factor: { t: 'Bus factor', x: 'Le nombre de personnes qui peuvent disparaître (« passer sous un bus ») avant que le projet soit bloqué. Par zone de code : 🔴 BF 1 = une seule tête → critique · 🟡 BF 2 = moyen · 🟢 BF ≥ 3 = faible. Score global /5.' },
        dora: { t: 'DORA', x: 'Les 4 métriques de livraison : fréquence de déploiement, lead time, taux d\'échec (CFR), temps de restauration (MTTR). Niveaux Low → Elite.' },
        deploy_freq: { t: 'Fréquence de déploiement', x: 'À quelle fréquence tu livres en prod. Élevée = petits lots, moins de risque. Elite ≥ 7/sem.' },
        lead_time: { t: 'Lead time', x: 'Délai entre le premier commit d\'un changement et sa mise en prod. Elite ≤ 24 h.' },
        cfr: { t: 'CFR (taux d\'échec)', x: 'La part de tes déploiements qui cassent (échec/rollback). Elite ≤ 5 %.' },
        mttr: { t: 'MTTR', x: 'Temps pour restaurer le service après un incident. Elite ≤ 1 h.' },
        feature_flags: { t: 'Feature flag', x: 'Un interrupteur pour activer/désactiver une fonctionnalité sans redéployer — découple « déployer » de « activer ».' },
        secrets: { t: 'Secret', x: 'Une valeur sensible (token, clé, mot de passe) qui ne doit jamais être en clair dans le code. Le Secrets Scanner les détecte.' },
        cis: { t: 'CIS', x: 'Le référentiel de bonnes pratiques (GitLab Benchmark) : branche protégée, approbations, lock files, SECURITY.md…' },
        blast_radius: { t: 'Blast Radius', x: 'La reconstitution d\'un incident supply-chain : où un composant compromis était, s\'il a tourné, ce qu\'il pouvait atteindre, ce qu\'il a produit.' },
        p_levels: { t: 'P0 → P3', x: 'Priorités du Blast Radius : P0 critique (exécuté + accès secrets/écriture/prod), P1 exécution avérée, P2 exposition probable, P3 présence seule.' },
        sbom: { t: 'SBOM', x: 'Software Bill of Materials : l\'inventaire exact des composants résolus d\'un build (CycloneDX) — la meilleure preuve d\'exécution d\'une dépendance.' },
        ioc: { t: 'IOC', x: 'Indicateur de compromission : le point de départ d\'une enquête (un package+version, une image, un commit malveillant…).' },
        branches: { t: 'Branche morte', x: 'Une branche sans commit depuis longtemps (≥ 60 j) — souvent du travail non livré, à nettoyer.' },
        badges: { t: 'Badges (Salsi)', x: 'Des bonnes pratiques DevOps atteintes (47 au total), avec des phases de maturité et un compagnon qui suit tes progrès.' },
        daily: { t: 'Daily Report', x: 'Le résumé de ton activité GitLab de la journée (MRs, pipelines, déploiements, commits, taux de succès), pensé pour le daily standup. Il sort aussi des « conseils du jour » (échecs, MR sans review, reverts…).' },
        repo_analyzer: { t: 'Repo Analyzer', x: 'L\'audit complet de ton repo : santé /100, sous-scores CI/CD et code reviews, alertes (« red flags »), et un plan d\'actions priorisé (quick wins). Demande « ma note », « ce qui ne va pas », « comment améliorer mon repo ».' },
        meta: { t: 'Salsifi', x: 'Une plateforme d\'aide à la maturité DevOps au-dessus de GitLab : mesures (DORA), sécurité (secrets, CIS, Blast Radius), gouvernance des accès, gamification. Moi (Salsi) je fais le lien.' }
    };

    // ── Intentions : déclencheurs + (def et/ou data). Ordre = priorité de match. ──
    var INTENTS = [
        { k: 'priorites', trig: ['priorite', 'priorites', 'priorite du jour', 'priorites du jour', 'priorites de la journee', 'par quoi commencer', 'par quoi je commence', 'par ou commencer', 'commencer par quoi', 'sur quoi me concentrer', 'quoi faire aujourd', 'mes priorites', 'top priorites', 'sur quoi bosser'], data: d_priorities },
        { k: 'etat_repo', trig: ['etat', 'bilan', 'sante', 'diagnostic', 'comment va', 'ca va mon', 'resume de mon repo', 'ou ca coince'], data: d_etat },
        { k: 'cfr', trig: ['cfr', 'taux d echec', 'change failure rate', 'echec de changement'], def: 'cfr', data: d_dora },
        { k: 'mttr', trig: ['mttr', 'temps de restauration', 'time to restore', 'temps de reprise'], def: 'mttr', data: d_dora },
        { k: 'lead_time', trig: ['lead time', 'delai de livraison'], def: 'lead_time', data: d_dora },
        { k: 'deploy_freq', trig: ['frequence de deploiement', 'deployment frequency'], def: 'deploy_freq', data: d_deploy },
        { k: 'feature_flags', trig: ['feature flag', 'feature flags', 'ff', 'flag', 'flags', 'drapeau'], def: 'feature_flags', data: d_flags, dataFirst: true },
        { k: 'pipelines', trig: ['pipeline', 'pipelines', 'ci', 'build', 'job', 'jobs'], data: d_pipelines },
        { k: 'merge_requests', trig: ['merge request', 'mr', 'pr', 'revue', 'review', 'demande de fusion'], data: d_mr },
        { k: 'deploiements', trig: ['deploiement', 'deployment', 'deploy', 'mise en prod'], data: d_deploy },
        // sécurité AVANT branches : « ma branche est protégée ? » doit gagner sur « branche »
        { k: 'securite', trig: ['securite', 'protege', 'protegee', 'protection', 'approbation', 'approbations', 'approval', 'approvals', 'codeowners', 'security md'], data: d_secu },
        { k: 'branches', trig: ['branche', 'branches', 'branche morte', 'stale branch'], def: 'branches', data: d_branches },
        { k: 'bus_factor', trig: ['bus factor', 'busfactor', 'facteur de bus', 'qui commit', 'qui contribue', 'contributeur'], def: 'bus_factor', data: d_bus },
        { k: 'secrets', trig: ['secret', 'secrets', 'token expose', 'cle expose', 'mot de passe'], def: 'secrets', data: d_secrets },
        { k: 'cis', trig: ['cis', 'conformite', 'benchmark', 'bonnes pratiques'], def: 'cis' },
        { k: 'blast_radius', trig: ['blast radius', 'supply chain', 'compromission'], def: 'blast_radius' },
        { k: 'p_levels', trig: ['p0', 'p1', 'p2', 'p3'], def: 'p_levels' },
        { k: 'sbom', trig: ['sbom', 'cyclonedx', 'bill of material'], def: 'sbom' },
        { k: 'ioc', trig: ['ioc', 'indicateur de compromission'], def: 'ioc' },
        { k: 'dora', trig: ['dora', 'score dora', 'niveau dora'], def: 'dora', data: d_dora },
        { k: 'badges', trig: ['badge', 'badges', 'achievement', 'succes'], def: 'badges', data: d_badges },
        { k: 'daily', trig: ['daily report', 'daily', 'rapport du jour', 'rapport quotidien', 'rapport journalier', 'standup', 'rapport d activite'], def: 'daily', data: d_daily },
        { k: 'repo_analyzer', trig: ['repo analyzer', 'analyzer', 'analyse de repo', 'analyse du repo', 'sante du repo', 'sante de mon repo', 'audit du repo', 'audit repo'], def: 'repo_analyzer', data: d_repo_score, dataFirst: true },
        { k: 'meta', trig: ['salsifi', 'salsi', 'plateforme', 'tu sais faire', 'qui es tu'], def: 'meta' }
    ];
    function hit(n, trig) { return trig.some(function (t) { var tn = norm(t); if (tn.length <= 3) return new RegExp('(^| )' + tn.replace(/ /g, ' ') + '( |$)').test(n); return n.indexOf(tn) >= 0; }); }

    // ── Journal des questions (socle pour « l'IA en dernier recours ») ──
    // Trace question + date/heure + contexte (repo) + intention (ou « unknown »).
    // Quand l'IA arrivera en fallback, ce journal dira quelles questions inconnues
    // folder dans le déterministe → on appelle l'IA de moins en moins.
    function logQ(q, intentKey, ai) {
        try {
            var raw = lsGet('salsifi_qa_log'); var arr = raw ? JSON.parse(raw) : [];
            arr.push({ q: q, at: new Date().toISOString(), repo: targetRepo() || null, intent: intentKey || 'unknown', ai: !!ai });
            if (arr.length > 800) arr = arr.slice(arr.length - 800);
            localStorage.setItem('salsifi_qa_log', JSON.stringify(arr));
        } catch (e) { /* quota / indispo */ }
    }
    function defHtml(k, hint) { return `<b>${esc(G[k].t)}</b> — ${esc(G[k].x)}` + (hint ? `<br><span class="sqa-hint">(pour tes chiffres, ajoute « combien… » ou « mon… »)</span>` : ''); }

    // ══════════════════════════════════════════════════════════════════
    //  SMALL-TALK — pour rendre Salsi sympa (déterministe, jamais volé à une vraie
    //  question : s'il reste une demande derrière « salut … », on la traite).
    // ══════════════════════════════════════════════════════════════════
    var ST = {
        greet: /\b(salut|bonjour|bonsoir|coucou|hello|hey|yo|wesh|hola|holla|slt|cc)\b/,
        howru: /\b(ca va|ca roule|comment vas tu|comment tu vas|comment allez vous|tu vas bien|la forme|comment ca va|quoi de neuf|bien ou quoi|tout va bien)\b/,
        thanks: /\b(merci|mercii|thx|thanks|nickel|genial|parfait|excellent|bravo|c est top|trop bien|j adore|impec|impeccable|au top)\b/,
        bye: /\b(au revoir|a plus|a plus tard|a toute|bye|ciao|adios|bonne journee|bonne soiree|a bientot|a demain|bonne nuit|a la prochaine)\b/,
        whoru: /\b(qui es tu|tu es qui|t es qui|c est quoi ton nom|tu es quoi|tu sers a quoi|tu es un robot|tu es une ia|es tu une ia|tu es humain)\b/,
        compliment: /\b(t es cool|tu gere|tu geres|bien joue|je t aime|t es fort|t es le meilleur|t es genial|tu es super|t es sympa|t es la meilleure|good job|gg|t es trop bien)\b/
    };
    var ST_FILLER = { salsi: 1, stp: 1, dis: 1, dit: 1, moi: 1, alors: 1, donc: 1, bon: 1, eh: 1, ben: 1, toi: 1, please: 1, svp: 1, oui: 1, non: 1, ok: 1, hey: 1, et: 1, un: 1, peu: 1, la: 1, ca: 1, va: 1, aussi: 1, bien: 1, tres: 1, beaucoup: 1 };
    var ST_MSG = {
        greet: [
            'Salut 🌱 Moi c\'est <b>Salsi</b>. Prêt à t\'aider sur ta plateforme — pose-moi une question (DORA, badges, bus factor, sécu…).',
            'Coucou 👋 Content de te voir ! On regarde quoi aujourd\'hui — ton <b>score DORA</b>, tes <b>badges</b>, ta <b>sécu</b> ?',
            'Hey 🌱 Salsi à ton service. Un concept à t\'expliquer, ou un chiffre à sortir de ton repo ?'
        ],
        howru: [
            'Au taquet, merci 🌱 Et surtout prêt à t\'aider — DORA, badges, bus factor, sécu… on regarde quoi ?',
            'Toujours vert 🟢 Et toi ? Dis-moi ce que tu veux vérifier sur ton repo.',
            'Ça roule ! 🌱 Pose-moi une question plateforme quand tu veux — « mon score DORA ? », « combien de badges ? »…'
        ],
        thanks: [
            'Avec plaisir 🌱 N\'hésite pas si tu veux creuser autre chose.',
            'De rien ! 💚 Je reste là pour tes questions plateforme.',
            'Quand tu veux 🙌 Un autre truc à regarder sur ton repo ?'
        ],
        bye: [
            'À bientôt 🌱 Reviens quand tu veux checker ton flow.',
            'Ciao 👋 Bonne continuation sur tes livraisons !',
            'À plus ! 💚 Je garde un œil sur ton repo (façon de parler).'
        ],
        compliment: [
            'Merci 🥲🌱 Toi aussi tu gères. On améliore un truc ensemble ?',
            'Trop sympa 💚 Allez, dis-moi ce qu\'on regarde !',
            'Ça fait plaisir 🌱 Je continue à te sortir les bons chiffres quand tu veux.'
        ],
        whoru: [
            'Moi c\'est <b>Salsi</b> 🌱 le compagnon de la plateforme : je réponds sur tes <b>mesures</b> (DORA), tes <b>badges</b>, ton <b>bus factor</b>, ta <b>sécu</b>… je t\'oriente vers le bon module, et je sais aussi <b>livrer avec toi</b>. Je réponds direct sur tes données, et l\'<b>IA</b> prend le relais quand il faut.'
        ]
    };
    var _stN = 0;
    function stPick(arr) { var m = arr[_stN % arr.length]; _stN++; return m; }
    // Renvoie une réponse small-talk, ou null si une vraie question se cache derrière.
    function smalltalkRoute(n) {
        var type = null;
        if (ST.thanks.test(n)) type = 'thanks';
        else if (ST.bye.test(n)) type = 'bye';
        else if (ST.compliment.test(n)) type = 'compliment';
        else if (ST.whoru.test(n)) type = 'whoru';
        else if (ST.howru.test(n)) type = 'howru';
        else if (ST.greet.test(n)) type = 'greet';
        if (!type) return null;
        // Résidu : on enlève les motifs small-talk + les mots de remplissage.
        // S'il reste une vraie demande (« salut c'est quoi le bus factor »), on rend
        // la main au routeur normal — le bonjour est simplement ignoré.
        var rest = n.replace(ST.greet, ' ').replace(ST.howru, ' ').replace(ST.thanks, ' ')
            .replace(ST.bye, ' ').replace(ST.whoru, ' ').replace(ST.compliment, ' ');
        rest = rest.split(' ').filter(function (w) { return w.length > 1 && !ST_FILLER[w]; }).join(' ').trim();
        if (rest.length >= 3) return null;
        return { html: stPick(ST_MSG[type]), intent: 'smalltalk_' + type };
    }

    // ── Contexte pour l'IA-fallback (grounding) : tout le savoir déterministe + tes résultats ──
    // Envoyé au back seulement quand le déterministe ne sait pas. L'IA répond « dans le
    // périmètre plateforme » à partir de ça, cohérente avec Salsi, sans halluciner.
    function stripTags(s) { return String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
    function salsiContext() {
        var ctx = { plateforme: 'Salsifi — aide à la maturité DevOps au-dessus de GitLab (LCL). 4 pôles, 18 modules.', modules: [], glossaire: [], formation: [], resultats: {} };
        try { HELP_POLES.forEach(function (p) { p.m.forEach(function (x) { ctx.modules.push({ nom: x[1], desc: x[2], pole: p.t }); }); }); } catch (e) { }
        try { Object.keys(G).forEach(function (k) { ctx.glossaire.push({ terme: G[k].t, def: G[k].x }); }); } catch (e) { }
        try { var F = Salsifi.formation; if (F && F.entries) F.entries.forEach(function (e) { ctx.formation.push({ titre: e.t, reponse: stripTags(e.a), module: (F.modules[e.mod] || {}).title }); }); } catch (e) { }
        try {
            var pid = targetRepo();
            if (pid) {
                var DH = Salsifi.doraHistory, h = (DH && DH.read) ? DH.read(pid) : [];
                if (h && h.length) { var last = h[h.length - 1]; ctx.resultats.dora = { score: last.metrics && last.metrics.doraScore, niveaux: last.levels }; }
                var GH = Salsifi.gamingHistory, g = (GH && GH.read) ? GH.read(pid) : [];
                if (g && g.length) ctx.resultats.badges = (g[g.length - 1].unlocked || []).length + '/47';
                var nm = repoName(knownRepos((getAuth() || {}).username), pid); if (nm) ctx.resultats.repo = nm;
            }
        } catch (e) { }
        return ctx;
    }

