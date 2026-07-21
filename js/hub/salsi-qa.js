/*
 * Salsi — Q&R (chat déterministe) · icône flottante bas-droite du hub
 * ------------------------------------------------------------------
 * V1 SANS IA : un routeur d'intentions. On normalise la question, on matche des
 * déclencheurs curés (« ff » = feature flag), puis on répond soit par une
 * DÉFINITION (glossaire fixe), soit par un RÉSULTAT (requête GitLab sur le repo
 * sélectionné). Hors périmètre → refus honnête. Voir SALSI_QA.md pour le catalogue.
 *
 * (L'IA pourra venir plus tard PAR-DESSUS ce noyau déterministe.)
 */
(function () {
    'use strict';
    var Salsifi = window.Salsifi || (window.Salsifi = {});
    function esc(s) { return Salsifi.escapeHtml ? Salsifi.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    var DAY = 86400000;

    function getAuth() {
        try { if (typeof loadAuth === 'function') { var a = loadAuth({ redirect: false }); if (a) return a; } } catch (e) { }
        try { var raw = lsGet('devops_hub_workspaces'); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }
    function knownRepos(u) {
        try { var raw = lsGet('hub_cache_repos_' + (u || '')); if (raw) { var c = JSON.parse(raw); if (c && Array.isArray(c.repos) && c.repos.length) return c.repos; } } catch (e) { }
        try { if (typeof allRepos !== 'undefined' && Array.isArray(allRepos) && allRepos.length) return allRepos; } catch (e) { }
        return null;
    }
    function repoName(repos, pid) { if (!repos) return null; for (var i = 0; i < repos.length; i++) if (String(repos[i].id) === String(pid)) return repos[i].name; return null; }
    function targetRepo() {
        var sel = lsGet('hub_selected_repo_id'); if (sel) return sel;
        var keys = []; try { for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)); } catch (e) { }
        for (var j = 0; j < keys.length; j++) { var m = keys[j].match(/^salsifi_dora_history_(.+)$/); if (m) return m[1]; }
        return null;
    }
    function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }

    // Contexte repo pour les questions « résultats ».
    function repoCtx() {
        var auth = getAuth(); if (!auth) return { err: { html: 'Reconnecte-toi pour que je puisse chercher.' } };
        var pid = targetRepo();
        if (!pid) return { err: { html: 'Choisis d\'abord un repo dans le hub (en haut à gauche), puis repose ta question — je réponds sur le repo sélectionné. 🌱' } };
        return { auth: auth, pid: pid, name: repoName(knownRepos(auth.username), pid) || ('repo #' + pid) };
    }
    function J(ctx, ep) { return Salsifi.gitlabJson(ctx.auth.gitlabUrl, ctx.auth.token, ep); }
    async function F(ctx, ep) { try { var r = await Salsifi.gitlabFetch(ctx.auth.gitlabUrl, ctx.auth.token, ep); return { status: r.status, data: r.ok ? await r.json() : null }; } catch (e) { return { status: 0, data: null }; } }
    function win(n) {
        var now = Date.now();
        if (/aujourd/.test(n)) { var d = new Date(); return { label: "aujourd'hui", since: new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString(), todayStr: new Date().toISOString().slice(0, 10) }; }
        if (/semaine|7 ?j|7 jours/.test(n)) return { label: 'cette semaine', since: new Date(now - 7 * DAY).toISOString() };
        if (/mois|30 ?j|30 jours/.test(n)) return { label: 'ce mois-ci', since: new Date(now - 30 * DAY).toISOString() };
        return { label: '(récent)', since: new Date(now - 30 * DAY).toISOString() };
    }

    // ── Handlers « résultats » (repo sélectionné) ──
    async function d_pipelines(n) {
        var c = repoCtx(); if (c.err) return c.err; var w = win(n);
        var arr = await J(c, `/projects/${c.pid}/pipelines?per_page=100` + (w.since ? `&updated_after=${encodeURIComponent(w.since)}` : '')) || [];
        if (w.todayStr) arr = arr.filter(function (p) { return (p.created_at || '').slice(0, 10) === w.todayStr; });
        var failed = arr.filter(function (p) { return p.status === 'failed'; }).length;
        if (/echec|echou|failed|rouge|casse/.test(n)) return { html: `🚀 <b>${failed}</b> pipeline(s) en échec ${w.label} sur <b>${esc(c.name)}</b> (sur ${arr.length}).` };
        return { html: `🚀 <b>${arr.length}</b> pipeline(s) ${w.label} sur <b>${esc(c.name)}</b>${failed ? ` — dont <b>${failed}</b> en échec` : ''}.` };
    }
    async function d_mr(n) {
        var c = repoCtx(); if (c.err) return c.err;
        if (/merg/.test(n)) { var w = win(n); var mg = await J(c, `/projects/${c.pid}/merge_requests?state=merged&per_page=100&updated_after=${encodeURIComponent(w.since)}`) || []; return { html: `🔀 <b>${mg.length}</b> MR mergées ${w.label} sur <b>${esc(c.name)}</b>.` }; }
        var op = await J(c, `/projects/${c.pid}/merge_requests?state=opened&per_page=100`) || [];
        var now = Date.now(), z = op.filter(function (m) { return (now - Date.parse(m.created_at)) / DAY > 7; }).length;
        if (/zombie|traine|vieille|dorm/.test(n)) return { html: `🧟 <b>${z}</b> MR qui traînent (ouvertes 7 j+) sur <b>${esc(c.name)}</b>, sur ${op.length} ouvertes.` };
        return { html: `🔀 <b>${op.length}</b> MR ouvertes sur <b>${esc(c.name)}</b>${z ? ` — dont <b>${z}</b> qui traînent (7 j+)` : ''}.` };
    }
    async function d_branches(n) {
        var c = repoCtx(); if (c.err) return c.err;
        var arr = await Salsifi.gitlabPaginate(c.auth.gitlabUrl, c.auth.token, `/projects/${c.pid}/repository/branches`, { maxPages: 3 }).catch(function () { return []; });
        var dead = arr.filter(function (b) { if (['main', 'master', 'develop', 'dev'].indexOf(b.name) >= 0) return false; return b.commit && b.commit.committed_date && (Date.now() - Date.parse(b.commit.committed_date)) / DAY > 60; });
        // « nom / liste / lesquelles » → on cite les branches, sinon on compte.
        if (/nom|liste|lesquel|laquelle|lequel|montre|affiche|donne/.test(n)) {
            if (!dead.length) return { html: `🌿 Aucune branche morte (60 j+) sur <b>${esc(c.name)}</b>.` };
            var names = dead.slice(0, 12).map(function (b) { return `<code>${esc(b.name)}</code>`; }).join(', ');
            return { html: `🌿 Branche(s) morte(s) sur <b>${esc(c.name)}</b> : ${names}${dead.length > 12 ? ` … (+${dead.length - 12})` : ''}.` };
        }
        return { html: `🌿 <b>${dead.length}</b> branche(s) morte(s) (60 j+) sur <b>${esc(c.name)}</b>, sur ${arr.length} au total.` };
    }
    async function d_bus(n) {
        var c = repoCtx(); if (c.err) return c.err;
        var ct = await J(c, `/projects/${c.pid}/repository/contributors`) || [];
        if (!ct.length) return { html: `Pas de données de contributeurs sur <b>${esc(c.name)}</b>.` };
        var total = ct.reduce(function (s, x) { return s + (x.commits || 0); }, 0), top = ct.reduce(function (m, x) { return Math.max(m, x.commits || 0); }, 0), share = total ? top / total : 0;
        if (ct.length === 1) return { html: `🚌 Bus factor <b>🔴 critique</b> : 1 seul contributeur sur <b>${esc(c.name)}</b>. Ouvre le module <b>Bus Factor</b> pour le détail par zone.` };
        var risk = ct.length < 3 ? '🟡 risque moyen' : (share >= 0.7 ? '🟡 concentration élevée' : '🟢 risque faible');
        return { html: `🚌 <b>${ct.length}</b> contributeurs sur <b>${esc(c.name)}</b> ; le top en concentre <b>${Math.round(share * 100)}%</b> — ${risk}.${share >= 0.7 ? ' ⚠️ un dominant (≥ 70 %)' : ''}<br><span class="sqa-hint">Détail par zone de code → module <b>🚌 Bus Factor</b>.</span>` };
    }
    async function d_deploy(n) {
        var c = repoCtx(); if (c.err) return c.err; var w = win(n);
        var d = await J(c, `/projects/${c.pid}/deployments?per_page=100&order_by=created_at&sort=desc`) || [];
        if (w.since) d = d.filter(function (x) { return Date.parse(x.created_at) >= Date.parse(w.since); });
        var prod = d.filter(function (x) { return /prod/i.test((x.environment && x.environment.name) || ''); }).length;
        return { html: `📦 <b>${d.length}</b> déploiement(s) ${w.label} sur <b>${esc(c.name)}</b>${prod ? `, dont <b>${prod}</b> en prod` : ''}.` };
    }
    async function d_flags(n) {
        var c = repoCtx(); if (c.err) return c.err;
        var r = await F(c, `/projects/${c.pid}/feature_flags?per_page=100`);
        if (!(r.status >= 200 && r.status < 300) || !Array.isArray(r.data) || !r.data.length) return { html: `🚩 Aucun feature flag configuré sur <b>${esc(c.name)}</b> (ou non activé).` };
        var inactive = r.data.filter(function (f) { return f.active === false; }).length;
        return { html: `🚩 <b>${r.data.length}</b> feature flag(s) sur <b>${esc(c.name)}</b>${inactive ? `, dont <b>${inactive}</b> inactif(s)` : ''}.` };
    }
    async function d_dora(n) {
        var c = repoCtx(); if (c.err) return c.err;
        var DH = Salsifi.doraHistory, h = DH ? DH.read(c.pid) : [];
        if (!h || !h.length) return { html: `Je n'ai pas encore de mesure DORA pour <b>${esc(c.name)}</b> — ouvre <b>DORA Insights</b> une fois et je saurai répondre.` };
        var last = h[h.length - 1], lv = last.levels || {}, sc = last.metrics && last.metrics.doraScore;
        var head = (typeof sc === 'number') ? ` — score <b>${Math.round(sc)}/100</b>` : '';
        return { html: `📊 <b>${esc(c.name)}</b>${head} : 🔧 CFR <b>${esc(lv.cfr || '—')}</b> · ⚡ lead time <b>${esc(lv.lt || '—')}</b> · 🚀 déploiement <b>${esc(lv.df || '—')}</b> · ⏱️ MTTR <b>${esc(lv.mttr || '—')}</b>.` };
    }
    async function d_badges(n) {
        var c = repoCtx(); if (c.err) return c.err;
        var GH = Salsifi.gamingHistory, g = GH ? GH.read(c.pid) : [];
        if (!g || !g.length) return { html: `Pas encore de badges suivis pour <b>${esc(c.name)}</b> — passe par <b>Achievements</b>.` };
        var u = (g[g.length - 1].unlocked || []).length, ph = '';
        try { if (GH.computePhase) { var p = GH.computePhase(g, GAMING_TOTAL); if (p && p.label) ph = ` · phase ${p.emoji} <b>${esc(p.label)}</b> (${Math.round(p.progress * 100)}%)`; } } catch (e) { }
        return { html: `🎮 <b>${u}/${GAMING_TOTAL}</b> badges sur <b>${esc(c.name)}</b>${ph}.` };
    }
    async function d_secu(n) {
        var c = repoCtx(); if (c.err) return c.err;
        var res = await Promise.all([J(c, `/projects/${c.pid}`), F(c, `/projects/${c.pid}/protected_branches?per_page=100`), F(c, `/projects/${c.pid}/approvals`)]);
        var proj = res[0], prot = res[1], appr = res[2], def = (proj && proj.default_branch) || 'main', bits = [];
        if (prot.status === 403) bits.push('branche : 🔒 non vérifiable');
        else if (Array.isArray(prot.data)) bits.push(prot.data.some(function (b) { return b.name === def; }) ? 'branche par défaut protégée ✅' : '❌ branche par défaut NON protégée');
        if (appr.status === 403) bits.push('approbations : 🔒 non vérifiable');
        else if (appr.data) bits.push((appr.data.approvals_before_merge || 0) >= 1 ? `${appr.data.approvals_before_merge} approbation(s) requise(s) ✅` : '❌ 0 approbation requise');
        return { html: `🔒 <b>${esc(c.name)}</b> : ${bits.join(' · ') || 'rien à signaler'}.` };
    }
    function d_secrets() { return { html: `🔎 Pour les <b>secrets exposés</b>, c'est un scan à part (lourd) : ouvre le <b>Secrets Scanner</b> / la <b>Gouvernance</b>. Je ne le lance pas en direct ici.` }; }
    function d_etat() {
        try { if (typeof window.salsiBriefShow === 'function') { window.salsiBriefShow(); return { html: `📋 J'ouvre le <b>bilan complet</b> de ton repo (sécurité, bus factor, activité, DORA…) — regarde la fenêtre qui s'affiche. 👉` }; } } catch (e) { }
        return { html: `Ouvre le <b>bilan</b> via la pastille 🌱 Salsi en haut du hub (sélectionne d'abord un repo).` };
    }

    // ══════════════════════════════════════════════════════════════════
    //  SAVOIR DORA — miroir fidèle du module DORA Insights (js/insights.js)
    //  Seuils = doraLevel() · Leviers/stakes/measure = DORA_COACH · Score = renderGlobalScore
    //  On ne réinvente rien : Salsi répond avec le contenu exact de la maquette.
    // ══════════════════════════════════════════════════════════════════
    var DORA_KB = {
        df: {
            emoji: '🚀', label: 'Fréquence de déploiement', short: 'fréquence de déploiement',
            def: 'À quelle fréquence tu livres en prod. Souvent = petits lots, moins de risque à chaque mise en prod, retour terrain rapide.',
            calc: 'pipelines <i>success</i> en prod sur 30 j × 7 (dédupliqués par commit).',
            // notes Elite→Low, seuils exacts de doraLevel('df')
            levels: [
                { lv: 'Elite', ic: '🟢', th: '≥ 7 déploiements/sem' },
                { lv: 'High', ic: '🔵', th: '1 à 7 /sem' },
                { lv: 'Medium', ic: '🟡', th: '0,25 à 1 /sem (≈ 1 par mois → 1 par semaine)' },
                { lv: 'Low', ic: '🔴', th: '< 0,25 /sem (moins d\'1 par mois)' }
            ],
            target: '≥ 7 déploiements/sem (Elite)',
            stakes: 'Déployer souvent, c\'est livrer par petits lots : moins de risque à chaque mise en prod, un retour terrain rapide, et la fin des « big bang » stressants.',
            levers: [
                { t: 'Automatiser le déploiement (CD)', d: 'Un merge sur la branche par défaut déclenche le déploiement, sans geste manuel. Tant qu\'un humain doit « lancer » la prod, la fréquence plafonne.', mod: 'Pipeline Generator', page: 'pipeline-generator.html' },
                { t: 'Découper en petites MR', d: 'Vise des MR sous ~200 lignes : elles se relisent et se mergent dans la journée. Plus tu fusionnes petit et souvent, plus tu déploies.' },
                { t: 'Feature flags', d: 'Déploie du code inactif derrière un flag pour découpler « déployer » de « activer ».', mod: 'Feature Flag Manager', page: 'feature-flag-manager.html' },
                { t: 'Branches courtes (trunk-based)', d: 'Branche → merge en quelques jours max, sinon ça finit en gros merges rares.' },
                { t: 'Pipeline rapide et fiable', d: 'Un CI vert en quelques minutes rend le déploiement fréquent tenable.' }
            ],
            measure: 'Je te sais en progrès quand le nombre de pipelines réussis par semaine grimpe.',
            atl: 'pipeline deploiement automatisation ci cd trunk'
        },
        lt: {
            emoji: '⚡', label: 'Lead Time', short: 'lead time',
            def: 'Le délai entre « le dev commence » (premier commit) et « c\'est en prod » (merge). Long = de la valeur qui dort et des reviews qui traînent.',
            calc: 'médiane du délai premier commit → merge de tes MR fusionnées (30 j).',
            levels: [
                { lv: 'Elite', ic: '🟢', th: '≤ 24 h (moins d\'un jour)' },
                { lv: 'High', ic: '🔵', th: '≤ 1 semaine (24 h → 168 h)' },
                { lv: 'Medium', ic: '🟡', th: '≤ 1 mois (168 h → 720 h)' },
                { lv: 'Low', ic: '🔴', th: '> 1 mois (720 h+)' }
            ],
            target: '≤ 24 h premier commit → prod (Elite)',
            stakes: 'Un Lead Time long, c\'est de la valeur qui dort, des reviews qui traînent et du contexte perdu entre l\'écriture et la livraison.',
            levers: [
                { t: 'Réduire la taille des MR', d: 'Une petite MR se relit en minutes ; une grosse traîne des jours. C\'est le levier n°1 sur le lead time.', mod: 'MR Reviewer', page: 'mr-reviewer.html' },
                { t: 'Un SLA de review', d: 'Fixe une attente d\'équipe (ex. première review < 4 h ouvrées), revieweurs désignés + notifications. La review qui dort est souvent le plus gros du délai.' },
                { t: 'Merger dès que c\'est vert', d: 'Une MR approuvée au pipeline vert ne devrait pas attendre. Traque les MR « prêtes mais pas mergées ».' },
                { t: 'Limiter le travail en cours', d: 'Trop de MR ouvertes en parallèle = rien n\'avance. Fini d\'abord, commence ensuite.' },
                { t: 'Automatiser les checks bloquants', d: 'Lint, format, tests : laisse le CI le faire, la review s\'éternise moins.' }
            ],
            measure: 'Ta progression se lit sur la médiane premier commit → merge de tes MR fusionnées.',
            atl: 'revue review mr taille wip cycle livraison flux goulot'
        },
        cfr: {
            emoji: '🔧', label: 'Change Failure Rate (CFR)', short: 'taux d\'échec (CFR)',
            def: 'La part de tes livraisons prod qui cassent (échec / rollback). Trop haut : tu vas vite mais tu casses souvent.',
            calc: 'pipelines prod (main/master) en échec / total × 100, pondéré vers le récent (fenêtres 5 j / 10 j / 30 j).',
            levels: [
                { lv: 'Elite', ic: '🟢', th: '≤ 5 % des déploiements en échec' },
                { lv: 'High', ic: '🔵', th: '≤ 10 %' },
                { lv: 'Medium', ic: '🟡', th: '≤ 15 %' },
                { lv: 'Low', ic: '🔴', th: '> 15 %' }
            ],
            target: '≤ 5 % de déploiements en échec (Elite)',
            stakes: 'Un CFR trop haut, c\'est des rollbacks, du stress, et une confiance qui s\'érode à chaque incident.',
            levers: [
                { t: 'Quality gates avant merge', d: 'Pipeline vert obligatoire, review obligatoire, branche par défaut protégée : rendre le merge d\'un changement non vérifié impossible.', mod: 'Gouvernance repo', page: 'gouvernance-repo.html' },
                { t: 'Tests automatisés sur les chemins critiques', d: 'Sans filet, chaque déploiement est un pari. Couvre d\'abord les parcours qui font mal quand ils cassent.' },
                { t: 'Un staging représentatif', d: 'Tester « comme en prod » attrape les surprises de config et d\'environnement avant les utilisateurs.' },
                { t: 'Des changements plus petits', d: 'Un petit changement casse moins souvent et se diagnostique en minutes.' },
                { t: 'Deux paires d\'yeux sur les zones sensibles', d: 'Sur le code critique, exige une vraie revue. Le coût d\'une review << le coût d\'un rollback.' }
            ],
            measure: 'Ta progression se lit sur le % de pipelines prod (main/master) en échec, pondéré vers le récent.',
            atl: 'test couverture qualite quality gate rollback tdd'
        },
        mttr: {
            emoji: '⏱️', label: 'Temps de restauration (MTTR / TTRS)', short: 'temps de restauration (MTTR)',
            def: 'Le temps pour revenir à la normale après un incident. La résilience compte autant que la vitesse.',
            calc: 'médiane de la durée pipeline en échec → succès qui restaure, sur branche prod.',
            levels: [
                { lv: 'Elite', ic: '🟢', th: '≤ 1 h pour restaurer' },
                { lv: 'High', ic: '🔵', th: '≤ 24 h (moins d\'un jour)' },
                { lv: 'Medium', ic: '🟡', th: '≤ 1 semaine (24 h → 168 h)' },
                { lv: 'Low', ic: '🔴', th: '> 1 semaine (168 h+)' }
            ],
            target: '≤ 1 h pour restaurer le service (Elite)',
            stakes: 'Un MTTR long, c\'est un incident qui dure, donc de l\'impact utilisateur. Ça finira par casser — la question c\'est en combien de temps tu reviens.',
            levers: [
                { t: 'Rollback en un geste', d: 'Revenir à la version précédente en une commande (ou un clic) transforme un incident d\'une heure en incident de cinq minutes.' },
                { t: 'Détecter vite', d: 'Alerting sur les pipelines/déploiements en échec + monitoring des symptômes : on ne restaure pas ce qu\'on n\'a pas vu tomber.' },
                { t: 'Déployer petit et souvent', d: 'Un petit changement est plus facile à annuler et diagnostiquer.' },
                { t: 'Couper via un feature flag', d: 'Désactiver la fonctionnalité fautive sans redéployer : la remédiation la plus rapide qui soit.', mod: 'Feature Flag Manager', page: 'feature-flag-manager.html' },
                { t: 'Des runbooks', d: 'Une procédure écrite pour les incidents fréquents évite d\'improviser sous pression.' }
            ],
            measure: 'Ta progression se lit sur le temps médian entre un pipeline en échec et le succès qui restaure.',
            atl: 'incident monitoring alerting observabilite rollback post mortem runbook resilience'
        }
    };
    var DORA_ORDER = { Low: 0, Medium: 1, High: 2, Elite: 3 };
    // Détecte de quelle mesure DORA parle la question (ou null).
    function doraKeyFromN(n) {
        if (/\bcfr\b|taux d echec|change failure|echec de changement|stabilite|ca casse|je casse|on casse/.test(n)) return 'cfr';
        if (/\bmttr\b|ttrs|restauration|time to restore|temps de reprise|resilience|recuperation/.test(n)) return 'mttr';
        if (/lead time|\blt\b|delai de livraison|temps de cycle|cycle time|delai de mise en prod/.test(n)) return 'lt';
        if (/frequence de deploiement|deployment frequency|deploy freq|\bdf\b|deployer|deploiement|livrer plus souvent|frequence.*deploi/.test(n)) return 'df';
        return null;
    }
    // « comment améliorer ma mesure » → plan condensé fidèle au Coach du module.
    function d_dora_improve(key, n) {
        // pas de mesure ciblée → on prend la plus faible du cache, sinon on propose de choisir.
        var suggestNote = '';
        if (!key) {
            var c = repoCtx(); var pid = c.err ? targetRepo() : c.pid;
            var DH = Salsifi.doraHistory, h = (DH && pid) ? DH.read(pid) : [];
            if (h && h.length) {
                var lv = h[h.length - 1].levels || {}, worst = null, worstRank = 99;
                ['df', 'lt', 'cfr', 'mttr'].forEach(function (k) { var r = DORA_ORDER[lv[k]]; if (typeof r === 'number' && r < worstRank) { worstRank = r; worst = k; } });
                if (worst) { key = worst; suggestNote = `👉 Je te suggère d'attaquer <b>${DORA_KB[key].label}</b> — c'est ta mesure la plus basse (<b>${esc(lv[key])}</b>).<br>`; }
            }
            if (!key) {
                return { html: `Sur quelle des <b>4 mesures DORA</b> veux-tu progresser ? 🌱<br>🚀 <b>fréquence de déploiement</b> · ⚡ <b>lead time</b> · 🔧 <b>CFR</b> (taux d'échec) · ⏱️ <b>MTTR</b> (restauration).<br>Dis-moi « améliorer mon <b>lead time</b> » — ou ouvre le <b>Coach Salsi</b> dans <a href="insights.html" target="_blank" rel="noopener">DORA Insights ↗</a> pour un plan complet suivi dans le temps.` };
            }
        }
        var m = DORA_KB[key];
        var levers = m.levers.slice(0, 3).map(function (l) {
            var mod = l.mod ? ` <a href="${esc(l.page)}" target="_blank" rel="noopener">🧰 ${esc(l.mod)} ↗</a>` : '';
            return `<div class="sqa-atl"><b>${esc(l.t)}</b>${mod}<div class="sqa-atl-d">${esc(l.d)}</div></div>`;
        }).join('');
        var more = m.levers.length > 3 ? `<div class="sqa-hint">+${m.levers.length - 3} autres leviers dans le <b>Coach Salsi</b> (DORA Insights).</div>` : '';
        // Un atelier d'accompagnement relié à la mesure (parmi les 205).
        var atlTop = scoreAteliers(m.atl.split(' '))[0];
        var atlHtml = atlTop ? `<div class="sqa-hint">🎓 Atelier pour se faire accompagner :</div>${atelierCard(atlTop.a)}` : '';
        return {
            html: `${suggestNote}${m.emoji} <b>Améliorer ta ${esc(m.short)}</b> — cap : <b>${esc(m.target)}</b>.<br><span class="sqa-hint">${esc(m.stakes)}</span>${levers}${more}` +
                `<div class="sqa-atl-x">📏 ${esc(m.measure)}</div>${atlHtml}` +
                `<div class="sqa-hint">Plan complet + suivi dans le temps → <b>Coach Salsi</b> dans <a href="insights.html" target="_blank" rel="noopener">DORA Insights ↗</a>.</div>`
        };
    }
    // « les notes / niveaux DORA » → les 4 paliers, seuils exacts. key ⇒ une mesure, sinon les 4.
    function d_dora_levels(key) {
        function block(k) {
            var m = DORA_KB[k];
            var rows = m.levels.map(function (L) { return `${L.ic} <b>${L.lv}</b> — ${esc(L.th)}`; }).join('<br>');
            return `${m.emoji} <b>${esc(m.label)}</b><br>${rows}`;
        }
        if (key) return { html: block(key) };
        return {
            html: `📊 Les <b>4 niveaux DORA</b> (🟢 Elite · 🔵 High · 🟡 Medium · 🔴 Low), seuils par mesure :<br><br>` +
                ['df', 'lt', 'cfr', 'mttr'].map(block).join('<br><br>') +
                `<div class="sqa-hint">Le score global /100 combine ces 4 niveaux — demande-moi « comment est calculé le score DORA ».</div>`
        };
    }
    // « comment est calculé le score DORA » → la formule exacte du module.
    function d_dora_scorecalc() {
        return {
            html: `🎯 <b>Score DORA /100</b> : chaque mesure vaut des points selon son niveau — 🟢 Elite <b>100</b> · 🔵 High <b>70</b> · 🟡 Medium <b>40</b> · 🔴 Low <b>15</b>. Le score = la <b>moyenne</b> des 4.<br>` +
                `Niveau global : ≥ 85 🏆 Elite · ≥ 60 ✅ High · ≥ 35 📈 Medium · sinon ⚠️ Low.<br>` +
                `<span class="sqa-hint">⚠️ Si le <b>MTTR</b> manque, le score est plafonné à 75 (Elite interdit) : sans mesure de résilience, on ne peut pas garantir le haut du tableau. Si 2 mesures+ manquent, plafond à 50.</span>`
        };
    }

    // ══════════════════════════════════════════════════════════════════
    //  SAVOIR GAMING / ACHIEVEMENTS — miroir fidèle de js/gaming.js
    //  47 badges · 6 familles · 5 phases (gaming-history.js) · gate anti-vide.
    //  Recettes « comment débloquer » lues au runtime dans Salsifi.gamingRecipes.
    // ══════════════════════════════════════════════════════════════════
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
    // Routeur gaming : renvoie une réponse taguée, ou null si hors sujet.
    async function gamingRoute(n, isData) {
        var gameCtx = /badge|badges|achievement|succes|troph|\bxp\b|debloqu|maturite|phase de/.test(n);
        if (!gameCtx) return null;
        function tag(r, k) { r.intent = k; return r; }
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
        meta: { t: 'Salsifi', x: 'Une plateforme d\'aide à la maturité DevOps au-dessus de GitLab : mesures (DORA), sécurité (secrets, CIS, Blast Radius), gouvernance des accès, gamification. Moi (Salsi) je fais le lien.' }
    };

    // ── Intentions : déclencheurs + (def et/ou data). Ordre = priorité de match. ──
    var INTENTS = [
        { k: 'etat_repo', trig: ['etat', 'bilan', 'sante', 'diagnostic', 'comment va', 'ca va mon', 'resume de mon repo', 'ou ca coince'], data: d_etat },
        { k: 'cfr', trig: ['cfr', 'taux d echec', 'change failure rate', 'echec de changement'], def: 'cfr', data: d_dora },
        { k: 'mttr', trig: ['mttr', 'temps de restauration', 'time to restore', 'temps de reprise'], def: 'mttr', data: d_dora },
        { k: 'lead_time', trig: ['lead time', 'delai de livraison'], def: 'lead_time', data: d_dora },
        { k: 'deploy_freq', trig: ['frequence de deploiement', 'deployment frequency'], def: 'deploy_freq', data: d_deploy },
        { k: 'feature_flags', trig: ['feature flag', 'feature flags', 'ff', 'flag', 'flags', 'drapeau'], def: 'feature_flags', data: d_flags },
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
        { k: 'meta', trig: ['salsifi', 'salsi', 'plateforme', 'tu sais faire', 'qui es tu'], def: 'meta' }
    ];
    function hit(n, trig) { return trig.some(function (t) { var tn = norm(t); if (tn.length <= 3) return new RegExp('(^| )' + tn.replace(/ /g, ' ') + '( |$)').test(n); return n.indexOf(tn) >= 0; }); }

    // ── Journal des questions (socle pour « l'IA en dernier recours ») ──
    // Trace question + date/heure + contexte (repo) + intention (ou « unknown »).
    // Quand l'IA arrivera en fallback, ce journal dira quelles questions inconnues
    // folder dans le déterministe → on appelle l'IA de moins en moins.
    function logQ(q, intentKey) {
        try {
            var raw = lsGet('salsifi_qa_log'); var arr = raw ? JSON.parse(raw) : [];
            arr.push({ q: q, at: new Date().toISOString(), repo: targetRepo() || null, intent: intentKey || 'unknown' });
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
            'Moi c\'est <b>Salsi</b> 🌱 le compagnon de la plateforme : je réponds sur tes <b>mesures</b> (DORA), tes <b>badges</b>, ton <b>bus factor</b>, ta <b>sécu</b>… et je t\'oriente vers le bon module. 100 % déterministe, <b>zéro IA</b> pour l\'instant.'
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

    var _lastIntent = null;   // mémoire de contexte pour les questions de suivi (« lesquelles ? »)
    async function answer(q) {
        var n = norm(q);
        // ── Small-talk d'abord (salut, ça va, merci…) — rendu null si vraie question derrière ──
        var st = smalltalkRoute(n); if (st) return st;
        // ── DORA d'abord (le module qu'on travaille en profondeur) ──
        var doraCtx = /\bdora\b|deploiement|deployment|lead time|\blt\b|\bcfr\b|taux d echec|change failure|\bmttr\b|ttrs|restauration|frequence/.test(n);
        var improveVerb = /ameliorer|optimiser|augmenter|reduire|baisser|progresser|booster|accelerer|muscler|monter|passer elite|atteindre elite|comment (faire|augmenter|reduire|ameliorer|optimiser|progresser)/.test(n);
        // « comment améliorer ma fréquence / mon lead time / mon CFR / mon MTTR (ou mon score DORA) »
        // (avant le calcul-du-score : « améliorer mon score » = progresser, pas « comment c'est calculé »)
        if (improveVerb) {
            var dk = doraKeyFromN(n);
            if (dk || /\bdora\b|score/.test(n)) { var ri = d_dora_improve(dk, n); ri.intent = 'dora_improve' + (dk ? '_' + dk : ''); return ri; }
        }
        // « comment est calculé le score DORA »
        if (/\bdora\b|score/.test(n) && /calcul|calcule|c est quoi le score|score.*(marche|fonctionne)|combien de points|comment (ca marche|fonctionne)/.test(n)) {
            var rc = d_dora_scorecalc(); rc.intent = 'dora_score_calc'; return rc;
        }
        // ── Gaming / Achievements (avant les « niveaux » DORA : « phases »/« badges » gagnent) ──
        var gr = await gamingRoute(n, /(combien|nombre|mon |ma |mes |quel|quelle|aujourd|semaine|mois)/.test(n));
        if (gr) return gr;
        // ── Daily Report : conseils du jour / ce qu'il contient (avant l'atelier générique) ──
        var dailyCtx = /daily|standup|rapport (du jour|quotidien|journalier|d activite)/.test(n);
        if (/conseil du jour|conseils du jour/.test(n) || (dailyCtx && /conseil|signale|detecte|declenche|alerte|flag/.test(n))) { var rdt = d_daily_tips(); rdt.intent = 'daily_tips'; return rdt; }
        if (dailyCtx && /contient|dans le|sections?|quoi dedans|que montre|qu y a|comprend|composition/.test(n)) { var rdc = d_daily_content(); rdc.intent = 'daily_content'; return rdc; }
        // ── Bus Factor : améliorer / les niveaux (avant l'atelier générique et les niveaux DORA) ──
        var busCtx = /bus factor|busfactor|facteur de bus|camion|silo de connaissance|qui sait quoi/.test(n);
        if (busCtx) {
            if (improveVerb || /pair programming|mob|partager le savoir|repartir|rotation|documenter|reduire le risque|desiloter|dessilot/.test(n)) { var rbi = d_bf_improve(); rbi.intent = 'busfactor_improve'; return rbi; }
            if (/niveau|niveaux|note|notes|palier|risque|critique|score|seuil|sur 5|\/5|comment.*(calcul|marche|fonctionne)/.test(n)) { var rbl = d_bf_levels(); rbl.intent = 'busfactor_levels'; return rbl; }
        }
        // « les niveaux / les notes / les paliers DORA » (ou « c'est quoi Elite »)
        if (/niveau|niveaux|note|notes|palier|paliers|bareme|baremes|seuil|seuils|elite|high performer|medium performer|low performer|barometre/.test(n) && (doraCtx || /elite|palier|performer|bareme/.test(n))) {
            var rl = d_dora_levels(doraKeyFromN(n)); rl.intent = 'dora_levels'; return rl;
        }
        // Ateliers : question d'amélioration → on recommande un atelier (avant tout le reste).
        if (/\batelier|workshop|accompagnement|optimiser|ameliorer|\breduire\b|progresser|muscler|comment (faire|reduire|ameliorer|optimiser)/.test(n)) {
            var atl = searchAteliers(n); if (atl) { atl.intent = 'atelier'; return atl; }
        }
        var isDef = /(c est quoi|qu est ce|c est quoi|explique|definition|ca veut dire|signifie|comprends pas|c est koi)/.test(n);
        var isData = /(combien|nombre|mon |ma |mes |quel|quelle|\bnom\b|liste|lesquel|laquelle|lequel|montre|affiche|donne|aujourd|semaine|mois|derni|est ce que|qui )/.test(n);
        var intent = null;
        for (var i = 0; i < INTENTS.length; i++) { if (hit(n, INTENTS[i].trig)) { intent = INTENTS[i]; break; } }
        // Suivi : pas d'intention trouvée mais une demande de donnée → dernière intention.
        if (!intent && isData && _lastIntent && _lastIntent.data && /nom|liste|lesquel|laquelle|lequel|lesquelles|montre|affiche|donne|detail/.test(n)) intent = _lastIntent;
        if (!intent) return { html: `Je ne réponds que sur la <b>plateforme</b> 🌱 — les concepts (« c'est quoi le bus factor ? »), tes résultats (pipelines, MR, bus factor, DORA, sécu…) et les ateliers (« atelier pour optimiser mon flow »). Reformule, ou essaie : « l'état de mon repo », « combien de FF ? ».`, intent: 'unknown' };
        if (intent.data) _lastIntent = intent;
        var r;
        if (isDef && intent.def) r = { html: defHtml(intent.def) };
        else if (isData && intent.data) r = await intent.data(n);
        else if (intent.data && !intent.def) r = await intent.data(n);
        else if (intent.def && !intent.data) r = { html: defHtml(intent.def) };
        else r = { html: defHtml(intent.def, true) };
        r.intent = intent.k;
        return r;
    }
    // Export du journal (téléchargement .jsonl) pour l'analyse hors-ligne.
    window.salsiQaExport = function () {
        var raw = lsGet('salsifi_qa_log'); var arr = raw ? JSON.parse(raw) : [];
        var body = arr.map(function (e) { return JSON.stringify(e); }).join('\n');
        var blob = new Blob([body], { type: 'application/x-ndjson' }); var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = 'salsi-qa-log.jsonl'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    };

    // ── UI : icône flottante + panneau chat ──
    var msgsEl;
    function addMsg(role, html) {
        if (!msgsEl) return;
        var d = document.createElement('div'); d.className = 'sqa-msg ' + role; d.innerHTML = html;
        msgsEl.appendChild(d); msgsEl.scrollTop = msgsEl.scrollHeight;
        return d;
    }
    async function ask(q) {
        if (!q) return;
        addMsg('user', esc(q));
        var pending = addMsg('salsi', '⏳ …');
        var r; try { r = await answer(q); } catch (e) { r = { html: '😅 Je n\'ai pas pu répondre — réessaie.', intent: 'error' }; }
        logQ(q, r && r.intent);   // trace : question + heure + contexte + intention (socle IA-fallback)
        if (pending) pending.innerHTML = r.html;
        if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
    }
    function suggestions() {
        var chips = ['mon score DORA ?', 'améliorer mon lead time', 'combien de badges ?', 'comment débloquer Small MR ?', 'les phases de maturité', 'combien de FF ?'];
        return '<div class="sqa-chips">' + chips.map(function (c) { return `<button class="sqa-chip" data-q="${esc(c)}">${esc(c)}</button>`; }).join('') + '</div>';
    }
    function togglePanel(open) {
        var p = document.getElementById('salsiQaPanel'); if (!p) return;
        var show = open != null ? open : p.style.display === 'none';
        p.style.display = show ? 'flex' : 'none';
        if (show) { var inp = document.getElementById('sqaQ'); if (inp) inp.focus(); }
    }
    function build() {
        if (document.getElementById('salsiFab')) return;
        var mascot = Salsifi.mascotSVG ? Salsifi.mascotSVG('happy') : '🌱';
        var fab = document.createElement('button'); fab.id = 'salsiFab'; fab.className = 'salsi-fab'; fab.title = 'Demande à Salsi (plateforme)'; fab.innerHTML = mascot;
        var panel = document.createElement('div'); panel.id = 'salsiQaPanel'; panel.className = 'salsi-qa-panel'; panel.style.display = 'none';
        panel.innerHTML =
            '<div class="sqa-head"><span class="sqa-ava">' + mascot + '</span><div><div class="sqa-title">Salsi</div><div class="sqa-sub">questions sur la plateforme · 0 IA</div></div><button class="sqa-x" id="sqaX">✕</button></div>' +
            '<div class="sqa-msgs" id="sqaMsgs"></div>' +
            '<div class="sqa-input"><input id="sqaQ" type="text" placeholder="c\'est quoi le bus factor ? · combien de FF ?" autocomplete="off"><button id="sqaSend" title="Demander">↑</button></div>';
        document.body.appendChild(fab); document.body.appendChild(panel);
        msgsEl = panel.querySelector('#sqaMsgs');
        addMsg('salsi', 'Salut, moi c\'est <b>Salsi</b> 🌱 Pose-moi une question sur la plateforme — un concept ou tes chiffres. ' + suggestions());

        fab.addEventListener('click', function () { togglePanel(); });
        panel.querySelector('#sqaX').addEventListener('click', function () { togglePanel(false); });
        var inp = panel.querySelector('#sqaQ'), send = panel.querySelector('#sqaSend');
        function go() { var q = inp.value.trim(); if (!q) return; inp.value = ''; ask(q); }
        send.addEventListener('click', go);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
        panel.addEventListener('click', function (e) { var c = e.target.closest && e.target.closest('.sqa-chip'); if (c) { ask(c.getAttribute('data-q')); } });
    }

    window.salsiQaAsk = ask;
    window.salsiQaToggle = togglePanel;

    document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { if (getAuth()) build(); }, 500); });
})();
