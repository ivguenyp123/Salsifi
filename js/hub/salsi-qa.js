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
        if (ct.length === 1) return { html: `🚌 Bus factor <b>critique</b> : 1 seul contributeur sur <b>${esc(c.name)}</b>.` };
        return { html: `🚌 <b>${ct.length}</b> contributeurs sur <b>${esc(c.name)}</b> ; le top en concentre <b>${Math.round(share * 100)}%</b>.${share >= 0.7 ? ' ⚠️ concentration élevée' : ''}` };
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
        return { html: `🎮 <b>${(g[g.length - 1].unlocked || []).length}/47</b> badges sur <b>${esc(c.name)}</b>.` };
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
    function searchAteliers(n) {
        var W = Salsifi.workshops; if (!W || !W.actions) return { html: 'Le référentiel d\'ateliers n\'est pas chargé.' };
        var kws = n.split(' ').filter(function (w) { return w.length > 2 && !ATL_STOP[w]; });
        if (!kws.length) return { html: `Sur quel sujet veux-tu progresser ? 🌱 Essaie : « atelier <b>flow</b> », « atelier <b>pipeline</b> », « atelier <b>dette</b> », « <b>incidents</b> », « <b>sécurité</b> », « <b>rituels</b> », « <b>dépendances</b> ».` };
        var terms = atlExpand(kws), scored = [];
        Object.keys(W.actions).forEach(function (k) {
            var a = W.actions[k], txt = norm((a.action || '') + ' ' + (a.titre || '') + ' ' + (a.axeLabel || ''));
            var score = 0; terms.forEach(function (t) { if (txt.indexOf(t) >= 0) score += (t.length > 4 ? 2 : 1); });
            if (score > 0) scored.push({ a: a, score: score });
        });
        scored.sort(function (x, y) { return y.score - x.score; });
        var top = scored.slice(0, 3);
        if (!top.length) return { html: `Je n'ai pas trouvé d'atelier pile sur « ${esc(kws.join(' '))} » 🌱 Essaie un mot-clé plus large : flow, pipeline, dette, incidents, sécurité, rituels, dépendances.` };
        var items = top.map(function (s) {
            var a = s.a, desc = a.action || a.titre, title = a.page || a.titre;
            var head = a.lien ? `<a href="${esc(a.lien)}" target="_blank" rel="noopener">🎓 ${esc(title)} ↗</a>` : `🎓 ${esc(title)} <span class="sqa-hint">(pas encore de page)</span>`;
            return `<div class="sqa-atl">${head}<div class="sqa-atl-d">${esc(desc)}</div><div class="sqa-atl-x">${esc(a.axeLabel || '')} · niv. ${esc(a.niveau)}</div></div>`;
        }).join('');
        return { html: `🎓 Les ateliers les plus proches :${items}` };
    }

    // ── Glossaire (définitions fixes) ──
    var G = {
        bus_factor: { t: 'Bus factor', x: 'Le nombre de personnes qui peuvent disparaître (« passer sous un bus ») avant que le projet soit bloqué. Bus factor 1 = savoir détenu par une seule personne → risque critique.' },
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
        meta: { t: 'Salsifi', x: 'Une plateforme d\'aide à la maturité DevOps au-dessus de GitLab : mesures (DORA), sécurité (secrets, CIS, Blast Radius), gouvernance des accès, gamification. Moi (Salsi) je fais le lien.' }
    };

    // ── Intentions : déclencheurs + (def et/ou data). Ordre = priorité de match. ──
    var INTENTS = [
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
        { k: 'meta', trig: ['salsifi', 'salsi', 'plateforme', 'tu sais faire', 'qui es tu'], def: 'meta' }
    ];
    function hit(n, trig) { return trig.some(function (t) { var tn = norm(t); if (tn.length <= 3) return new RegExp('(^| )' + tn.replace(/ /g, ' ') + '( |$)').test(n); return n.indexOf(tn) >= 0; }); }

    var _lastIntent = null;   // mémoire de contexte pour les questions de suivi (« lesquelles ? »)
    async function answer(q) {
        var n = norm(q);
        // Ateliers : question d'amélioration → on recommande un atelier (avant tout le reste).
        // « atelier … », « comment optimiser/améliorer/réduire … », « progresser sur … ».
        if (/\batelier|workshop|accompagnement|optimiser|ameliorer|\breduire\b|progresser|muscler|comment (faire|reduire|ameliorer|optimiser)/.test(n)) {
            var atl = searchAteliers(n); if (atl) return atl;
        }
        var isDef = /(c est quoi|qu est ce|c est quoi|explique|definition|ca veut dire|signifie|comprends pas|c est koi)/.test(n);
        var isData = /(combien|nombre|mon |ma |mes |quel|quelle|\bnom\b|liste|lesquel|laquelle|lequel|montre|affiche|donne|aujourd|semaine|mois|derni|est ce que|qui )/.test(n);
        var intent = null;
        for (var i = 0; i < INTENTS.length; i++) { if (hit(n, INTENTS[i].trig)) { intent = INTENTS[i]; break; } }
        // Suivi : pas d'intention trouvée mais une demande de donnée (« lesquelles ? »,
        // « leur nom ? ») → on réutilise la dernière intention avec données.
        if (!intent && isData && _lastIntent && _lastIntent.data && /nom|liste|lesquel|laquelle|lequel|lesquelles|montre|affiche|donne|detail/.test(n)) intent = _lastIntent;
        if (!intent) return { html: `Je ne réponds que sur la <b>plateforme</b> 🌱 — les concepts (« c'est quoi le bus factor ? ») et tes résultats (pipelines, MR, bus factor, DORA, sécu…). Reformule, ou essaie : « combien de FF ? », « c'est quoi le CFR ? ».` };
        if (intent.data) _lastIntent = intent;
        if (isDef && intent.def) return { html: `<b>${esc(G[intent.def].t)}</b> — ${esc(G[intent.def].x)}` };
        if (isData && intent.data) return await intent.data(n);
        if (intent.data && !intent.def) return await intent.data(n);
        if (intent.def && !intent.data) return { html: `<b>${esc(G[intent.def].t)}</b> — ${esc(G[intent.def].x)}` };
        // les deux, sans marqueur clair → définition + invite
        return { html: `<b>${esc(G[intent.def].t)}</b> — ${esc(G[intent.def].x)}<br><span class="sqa-hint">(pour tes chiffres, ajoute « combien… » ou « mon… »)</span>` };
    }

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
        var r; try { r = await answer(q); } catch (e) { r = { html: '😅 Je n\'ai pas pu répondre — réessaie.' }; }
        if (pending) pending.innerHTML = r.html;
        if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
    }
    function suggestions() {
        var chips = ['c\'est quoi le bus factor ?', 'combien de pipelines aujourd\'hui ?', 'combien de FF ?', 'ma branche est protégée ?', 'mon score DORA ?'];
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
