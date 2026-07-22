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
    // ── Feature Flags : répond à TOUTE question sur les données du module ──
    function ffActive(f) { return f.active !== false; }
    function ffEnvs(f) {   // environnements (scopes) couverts par les stratégies
        var set = {};
        (f.strategies || []).forEach(function (s) { (s.scopes || []).forEach(function (sc) { if (sc.environment_scope) set[sc.environment_scope] = 1; }); });
        var arr = Object.keys(set);
        return arr.length ? arr : ['*']; // '*' = tous les environnements
    }
    function ffPct(f) {    // pourcentage de rollout (max sur les stratégies), ou null
        var best = null;
        (f.strategies || []).forEach(function (s) {
            if (s.parameters && s.parameters.percentage != null) { var p = parseInt(s.parameters.percentage, 10); if (!isNaN(p)) best = Math.max(best == null ? 0 : best, p); }
            else if (s.name === 'default') best = Math.max(best == null ? 0 : best, 100);
        });
        return best;
    }
    function ffClean(name) { return norm(String(name || '').replace(/^(enable|disable)-/, '').replace(/[-_]/g, ' ')); }
    function ffFind(n, flags) {   // le flag dont le nom (nettoyé ou brut) apparaît dans la question
        var best = null, bestLen = 0;
        flags.forEach(function (f) {
            [ffClean(f.name), norm(String(f.name).replace(/[-_]/g, ' '))].forEach(function (cand) {
                if (cand.length >= 4 && n.indexOf(cand) >= 0 && cand.length > bestLen) { best = f; bestLen = cand.length; }
            });
        });
        return best;
    }
    function ffLabel(f) { return esc(String(f.name)) + ' ' + (ffActive(f) ? '🟢 ON' : '🔴 OFF'); }
    function ffDetail(f) {
        var envs = ffEnvs(f).map(function (e) { return e === '*' ? 'tous' : e; }).join(', ');
        var pct = ffPct(f), strat = (f.strategies || []).map(function (s) { return s.name; });
        var bits = [ffActive(f) ? '🟢 <b>ON</b>' : '🔴 <b>OFF</b>'];
        if (pct != null && pct < 100) bits.push(`rollout <b>${pct}%</b>`);
        bits.push(`env : <b>${esc(envs)}</b>`);
        if (strat.length) bits.push(`stratégie(s) : ${esc(strat.join(', '))}`);
        return { html: `🚩 <b>${esc(f.name)}</b> — ${bits.join(' · ')}.` };
    }
    async function d_flags(n) {
        var c = repoCtx(); if (c.err) return c.err;
        var r = await F(c, `/projects/${c.pid}/feature_flags?per_page=100`);
        if (r.status === 403) return { html: `🚩 Feature flags : 🔒 non vérifiable (droits) sur <b>${esc(c.name)}</b>.` };
        if (!(r.status >= 200 && r.status < 300) || !Array.isArray(r.data) || !r.data.length) return { html: `🚩 Aucun feature flag configuré sur <b>${esc(c.name)}</b> (ou non activé).` };
        var flags = r.data, total = flags.length;
        var on = flags.filter(ffActive), off = flags.filter(function (f) { return !ffActive(f); });

        // 1) Détail d'un flag précis nommé dans la question.
        var named = ffFind(n, flags); if (named) return ffDetail(named);

        // 2) Par environnement (« sur quel environnement », « en prod »…).
        if (/environnement|env |scope|\bprod\b|production|staging|preprod|recette|integration|dev\b/.test(n)) {
            var envMap = {};
            flags.forEach(function (f) { ffEnvs(f).forEach(function (e) { (envMap[e] = envMap[e] || []).push(f); }); });
            var askProd = /\bprod\b|production/.test(n);
            if (askProd) {
                var inProd = flags.filter(function (f) { return ffEnvs(f).some(function (e) { return e === 'production' || e === '*'; }); });
                if (!inProd.length) return { html: `🚩 Aucun feature flag ciblé sur <b>production</b> sur <b>${esc(c.name)}</b>.` };
                return { html: `🚩 <b>${inProd.length}</b> flag(s) en <b>production</b> sur <b>${esc(c.name)}</b> : ` + inProd.slice(0, 12).map(ffLabel).join(', ') + (inProd.length > 12 ? ` … (+${inProd.length - 12})` : '') + '.' };
            }
            var rows = Object.keys(envMap).map(function (e) { return `<b>${esc(e === '*' ? 'tous' : e)}</b> : ${envMap[e].length}`; }).join(' · ');
            return { html: `🚩 Répartition par environnement sur <b>${esc(c.name)}</b> : ${rows}.<br><span class="sqa-hint">« quels flags en prod ? » pour la liste d'un environnement.</span>` };
        }

        // 3) Actifs / inactifs (ON/OFF).
        if (/actif|active|activ|inactif|desactiv|\bon\b|\boff\b|allum|eteint|coupe/.test(n)) {
            var wantOff = /inactif|desactiv|\boff\b|eteint|coupe/.test(n);
            var lst = wantOff ? off : on;
            if (!lst.length) return { html: `🚩 Aucun flag ${wantOff ? 'inactif' : 'actif'} sur <b>${esc(c.name)}</b>.` };
            return { html: `🚩 <b>${lst.length}</b> flag(s) ${wantOff ? '🔴 inactif(s)' : '🟢 actif(s)'} sur <b>${esc(c.name)}</b> : ` + lst.slice(0, 12).map(function (f) { return `<code>${esc(f.name)}</code>`; }).join(', ') + (lst.length > 12 ? ` … (+${lst.length - 12})` : '') + '.' };
        }

        // 4) Noms / liste.
        if (/nom|liste|lesquel|laquelle|lequel|quels|quelles|montre|affiche|donne|detail|tous les/.test(n)) {
            return { html: `🚩 <b>${total}</b> feature flag(s) sur <b>${esc(c.name)}</b> :<br>` + flags.slice(0, 20).map(ffLabel).join('<br>') + (total > 20 ? `<br>… (+${total - 20})` : '') };
        }

        // 5) Par défaut : le compte + ON/OFF + envs.
        var envAll = {}; flags.forEach(function (f) { ffEnvs(f).forEach(function (e) { envAll[e] = 1; }); });
        var envList = Object.keys(envAll).map(function (e) { return e === '*' ? 'tous' : e; }).join(', ');
        return { html: `🚩 <b>${total}</b> feature flag(s) sur <b>${esc(c.name)}</b> — <b>${on.length}</b> 🟢 ON, <b>${off.length}</b> 🔴 OFF. Environnement(s) : <b>${esc(envList)}</b>.<br><span class="sqa-hint">Demande « leurs noms », « lesquels en prod », « lesquels inactifs », ou le nom d'un flag pour son détail.</span>` };
    }
    async function d_dora(n) {
        var c = repoCtx(); if (c.err) return c.err;
        var DH = Salsifi.doraHistory, h = DH ? DH.read(c.pid) : [];
        if (!h || !h.length) return { html: `Je n'ai pas encore de mesure DORA pour <b>${esc(c.name)}</b> — ouvre <b>DORA Insights</b> une fois et je saurai répondre.` };
        var last = h[h.length - 1], lv = last.levels || {}, sc = last.metrics && last.metrics.doraScore;
        var head = (typeof sc === 'number') ? ` — score <b>${Math.round(sc)}/100</b>` : '';
        var lvIc = { Elite: '🟢', High: '🔵', Medium: '🟡', Low: '🔴' };
        // Mesure ciblée (« la note de mon lead time ») → on répond juste celle-là.
        var key = doraKeyFromN(n || '');
        if (key && DORA_KB[key]) {
            var l = lv[key] || '—', m = DORA_KB[key];
            return { html: `${m.emoji} Ta <b>${esc(m.short)}</b> sur <b>${esc(c.name)}</b> : ${lvIc[l] || ''} <b>${esc(l)}</b> — cible Elite : ${esc(m.target)}${head}.` };
        }
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
    // « quelles sont mes priorités de la journée » → ouvre le bilan Salsi (top 5, sécu d'abord).
    function d_priorities() {
        try { if (typeof window.salsiBriefShow === 'function') { window.salsiBriefShow(); return { html: `🎯 J'ouvre tes <b>priorités du jour</b> — le bilan Salsi te classe le <b>top 5</b> à traiter (la sécurité d'abord), en analysant ton repo. 👉` }; } } catch (e) { }
        return { html: `Tes <b>priorités</b> s'affichent via la pastille 🌱 <b>Salsi</b> en haut du hub — sélectionne d'abord un repo, et je te sors le top 5 à traiter.` };
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
    // « génère-moi le rapport de mes DORA » → construit le rapport HTML (miroir du
    // module) depuis le cache DORA et le télécharge. Zéro donnée re-fetchée : on
    // utilise la dernière analyse mémorisée par DORA Insights.
    function doraFmtVal(metric, v) {
        if (v == null) return '—';
        if (metric === 'df') return v + '/sem';
        if (metric === 'cfr') return v + '%';
        return v >= 24 ? (v / 24).toFixed(1) + 'j' : v + 'h';
    }
    function triggerDownload(filename, content, mime) {
        try {
            var blob = new Blob([content], { type: (mime || 'text/html') + ';charset=utf-8' });
            var url = URL.createObjectURL(blob), a = document.createElement('a');
            a.href = url; a.download = filename; document.body.appendChild(a); a.click();
            document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
            return true;
        } catch (e) { return false; }
    }
    function d_dora_report() {
        var c = repoCtx(); if (c.err) return c.err;
        var DH = Salsifi.doraHistory, h = (DH && DH.read) ? DH.read(c.pid) : [];
        if (!h || !h.length) return { html: `Je n'ai pas encore de mesure DORA pour <b>${esc(c.name)}</b> — ouvre une fois <b>DORA Insights</b> (l'analyse se mémorise), puis redemande-moi « génère le rapport DORA ». 🌱` };
        var last = h[h.length - 1], m = last.metrics || {}, lv = last.levels || {}, cls = last.cls;
        var df = doraFmtVal('df', m.df), lt = doraFmtVal('lt', m.lt), cfr = doraFmtVal('cfr', m.cfr), mttr = doraFmtVal('mttr', m.mttrDora);
        var scoreValue = (typeof m.doraScore === 'number') ? Math.round(m.doraScore) : '—';
        var titles = { elite: '🏆 Elite Performer', high: '✅ High Performer', medium: '📈 Medium Performer', low: '⚠️ Low Performer' };
        var scoreLevel = cls ? (titles[cls] || cls) : 'Score indisponible';
        var dfB = lv.df || 'N/A', ltB = lv.lt || 'N/A', cfrB = lv.cfr || 'N/A', mttrB = lv.mttr || 'N/A';
        var now = new Date();
        var dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        var timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        var name = esc(c.name);
        var html = '<!DOCTYPE html>\n<html lang="fr"><head><meta charset="UTF-8"><title>Rapport DORA — ' + name + ' — ' + dateStr + '</title>'
            + '<style>:root{--o1:rgba(255,255,255,.05);--o2:rgba(255,255,255,.12);--o15:rgba(255,255,255,.15);--o07:rgba(255,255,255,.07)}'
            + '*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:linear-gradient(135deg,#1e1b4b,#312e81,#4c1d95);min-height:100vh;color:#fff;padding:40px}'
            + '.container{max-width:900px;margin:0 auto}.header{text-align:center;padding:40px;background:var(--o1);border-radius:24px;border:1px solid var(--o2);margin-bottom:40px}'
            + '.header h1{font-size:32px;font-weight:800;margin-bottom:8px}.header p{opacity:.7;font-size:15px}.project{display:inline-block;padding:10px 20px;background:var(--o15);border-radius:12px;font-size:16px;font-weight:600;margin-top:16px}'
            + '.section-title{font-size:20px;font-weight:700;margin:30px 0 16px;padding-bottom:10px;border-bottom:2px solid var(--o2)}.score-global{text-align:center;padding:30px;background:var(--o1);border-radius:20px;border:1px solid var(--o2);margin-bottom:30px}'
            + '.score-value{font-size:64px;font-weight:800}.score-level{font-size:20px;font-weight:700;margin-top:8px}.dora-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:30px}'
            + '.dora-card{background:var(--o1);border-radius:16px;padding:24px;border:1px solid var(--o2)}.dora-name{font-size:13px;font-weight:600;opacity:.8;margin-bottom:8px}.dora-val{font-size:36px;font-weight:800;margin-bottom:8px}'
            + '.dora-badge{display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600}.method-note{background:var(--o07);border:1px solid var(--o15);border-radius:12px;padding:16px;font-size:12px;opacity:.75;margin-top:20px;line-height:1.7}.footer{text-align:center;margin-top:40px;opacity:.5;font-size:13px}</style></head><body><div class="container">'
            + '<div class="header"><div style="font-size:56px;margin-bottom:16px">📊</div><h1>Rapport DORA Metrics</h1><p>Performance DevOps</p><div class="project">📦 ' + name + '</div><p style="margin-top:12px;font-size:13px;opacity:.6">Généré le ' + dateStr + ' à ' + timeStr + '</p></div>'
            + '<div class="score-global"><div class="score-value">' + scoreValue + '/100</div><div class="score-level">' + esc(scoreLevel) + '</div></div>'
            + '<div class="section-title">🎯 Les 4 métriques DORA</div><div class="dora-grid">'
            + '<div class="dora-card"><div class="dora-name">🚀 Deploy Frequency</div><div class="dora-val" style="color:#a5b4fc">' + esc(df) + '</div><span class="dora-badge" style="background:rgba(165,180,252,.2);color:#a5b4fc">' + esc(dfB) + '</span></div>'
            + '<div class="dora-card"><div class="dora-name">⚡ Lead Time for Changes</div><div class="dora-val" style="color:#6ee7b7">' + esc(lt) + '</div><span class="dora-badge" style="background:rgba(110,231,183,.2);color:#6ee7b7">' + esc(ltB) + '</span></div>'
            + '<div class="dora-card"><div class="dora-name">🔧 Change Failure Rate</div><div class="dora-val" style="color:#fca5a5">' + esc(cfr) + '</div><span class="dora-badge" style="background:rgba(252,165,165,.2);color:#fca5a5">' + esc(cfrB) + '</span></div>'
            + '<div class="dora-card"><div class="dora-name">⏱️ Time to Restore Service</div><div class="dora-val" style="color:#fcd34d">' + esc(mttr) + '</div><span class="dora-badge" style="background:rgba(252,211,77,.2);color:#fcd34d">' + esc(mttrB) + '</span></div></div>'
            + '<div class="method-note"><strong>Méthode de calcul</strong><br>DF : pipelines success sur env prod / 30j × 7<br>Lead Time : médiane first_commit_at → merged_at des MRs<br>CFR : pipelines failed / total pipelines × 100 (fenêtres pondérées 5j/10j/30j)<br>TTRS : médiane durée pipeline failed → success suivant sur branche prod<br><br><strong>⚠️ Note sur le score global :</strong> si MTTR est manquant, le score est plafonné à 75/100 maximum. Toute métrique absente réduit la fiabilité du score.</div>'
            + '<div class="footer">DevOps Hub © ' + now.getFullYear() + '</div></div></body></html>';
        var filename = 'DORA-' + String(c.name).replace(/[^a-zA-Z0-9]/g, '-') + '-' + now.toISOString().split('T')[0] + '.html';
        var okDl = triggerDownload(filename, html, 'text/html');
        if (!okDl) return { html: `😅 Je n'ai pas pu déclencher le téléchargement (blocage navigateur ?). Réessaie, ou exporte depuis <b>DORA Insights</b>.` };
        var when = last.at ? ` (analyse du <b>${esc(last.at)}</b>)` : '';
        return { html: `📄 Rapport DORA de <b>${name}</b> généré et téléchargé ✅${when}<br>Score <b>${scoreValue}/100</b> — ${esc(scoreLevel)}. Fichier : <code>${esc(filename)}</code>.<br><span class="sqa-hint">C'est un instantané de ta dernière analyse DORA. Rouvre <b>DORA Insights</b> pour rafraîchir les chiffres avant d'exporter.</span>` };
    }

    // ══════════════════════════════════════════════════════════════════
    //  RAPPORT D'ACTIVITÉ — jour / semaine / mois (miroir du Daily Report)
    //  Reproduit generateStandaloneReport() : santé, best-practices, jour-par-jour.
    //  NOUVEAU : le « jour » (days=1) qui n'existait pas dans le module.
    // ══════════════════════════════════════════════════════════════════
    function inRange(iso, a, b) { var t = Date.parse(iso); return !isNaN(t) && t >= a && t <= b; }
    function pctScore(x) { return x >= 70 ? '#34d399' : x >= 40 ? '#fbbf24' : '#f87171'; }
    async function d_activity_report(days, label) {
        var c = repoCtx(); if (c.err) return c.err;
        var base = c.auth.gitlabUrl, tok = c.auth.token, P = c.pid;
        var end = new Date(), start = new Date(); start.setDate(start.getDate() - days + 1); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
        var aMs = start.getTime(), bMs = end.getTime(), after = start.toISOString(), before = end.toISOString();
        var pag = function (ep, mp) { return Salsifi.gitlabPaginate(base, tok, ep, { maxPages: mp || 3 }).catch(function () { return []; }); };
        var qr = `updated_after=${encodeURIComponent(after)}&updated_before=${encodeURIComponent(before)}`;
        var R;
        try {
            R = await Promise.all([
                pag(`/projects/${P}/pipelines?${qr}&order_by=updated_at&sort=desc`, 5),
                pag(`/projects/${P}/merge_requests?state=merged&${qr}`, 3),
                Salsifi.gitlabPaginate(base, tok, `/projects/${P}/merge_requests?state=opened`, { maxPages: 3 }).catch(function () { return []; }),
                pag(`/projects/${P}/merge_requests?state=closed&${qr}`, 2),
                pag(`/projects/${P}/deployments?${qr}`, 2),
                Salsifi.gitlabPaginate(base, tok, `/projects/${P}/repository/branches`, { maxPages: 3 }).catch(function () { return []; }),
                pag(`/projects/${P}/repository/commits?since=${encodeURIComponent(after)}&until=${encodeURIComponent(before)}`, 5)
            ]);
        } catch (e) { return { html: `😅 Je n'ai pas pu récupérer les données pour le rapport. Réessaie.` }; }
        var pipelines = (R[0] || []).filter(function (p) { return inRange(p.created_at, aMs, bMs); });
        var mrsMerged = (R[1] || []).filter(function (m) { return m.merged_at && inRange(m.merged_at, aMs, bMs); });
        var mrsOpen = R[2] || [];
        var mrsClosed = (R[3] || []).filter(function (m) { return inRange(m.updated_at || m.created_at, aMs, bMs); });
        var deployments = (R[4] || []).filter(function (d) { return inRange(d.created_at, aMs, bMs); });
        var branches = R[5] || [], commits = (R[6] || []).filter(function (cm) { return inRange(cm.created_at, aMs, bMs); });

        var total = pipelines.length, success = pipelines.filter(function (p) { return p.status === 'success'; }).length, failed = pipelines.filter(function (p) { return p.status === 'failed'; }).length;
        var rate = total ? Math.round(success / total * 100) : 0;
        var staleBranches = branches.filter(function (b) { var d = b.commit && (b.commit.committed_date || b.commit.created_at); return d && (Date.now() - Date.parse(d)) / 86400000 > 90; }).length;
        var oldMrs = mrsOpen.filter(function (mr) { return (Date.now() - Date.parse(mr.created_at)) / 86400000 > 7; }).length;
        var health = 100; if (rate < 80) health -= 20; if (rate < 60) health -= 15; if (staleBranches > 20) health -= 15; if (oldMrs > 5) health -= 10;
        health = Math.max(0, Math.min(100, health));
        var hText = health >= 80 ? 'Bonne santé' : health >= 50 ? 'À surveiller' : 'Critique', hColor = pctScore(health);

        // best-practices (formules exactes du module)
        var staleMrs = mrsOpen.map(function (mr) { return { ageDays: Math.floor((Date.now() - Date.parse(mr.created_at)) / 86400000), iid: mr.iid, title: mr.title }; }).filter(function (mr) { return mr.ageDays >= 2; }).sort(function (a, b) { return b.ageDays - a.ageDays; });
        var avgPipPerDay = total / Math.max(days, 1);
        var reviewScore = mrsOpen.length ? Math.max(0, Math.round(100 - (staleMrs.length / mrsOpen.length) * 100)) : 100;
        var branchScore = branches.length ? Math.max(0, Math.min(100, Math.round(100 - (staleBranches / branches.length) * 200))) : 100;
        var failRateScore = Math.max(0, 100 - (total ? Math.round(failed / total * 100) : 0));
        var practices = [
            { icon: '⚡', name: 'Pipeline Speed', score: Math.min(100, Math.round(avgPipPerDay > 0 ? 90 : 50)), detail: `${avgPipPerDay.toFixed(1)} pip/jour` },
            { icon: '✅', name: 'Success Rate', score: rate, detail: `${success}/${total} success` },
            { icon: '👀', name: 'Review Speed', score: reviewScore, detail: `${staleMrs.length} MR > 48h` },
            { icon: '🌿', name: 'Branch Hygiene', score: branchScore, detail: `${staleBranches} stale > 90j` },
            { icon: '🔴', name: 'Failure Rate', score: failRateScore, detail: `${failed} échecs` }
        ];
        var globalBP = Math.round(practices.reduce(function (s, p) { return s + p.score; }, 0) / practices.length);

        // jour-par-jour (bucket local)
        var dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'], daily = [];
        for (var i = days - 1; i >= 0; i--) {
            var dd = new Date(); dd.setDate(dd.getDate() - i); var ds = new Date(dd); ds.setHours(0, 0, 0, 0); var de = new Date(dd); de.setHours(23, 59, 59, 999);
            var s = ds.getTime(), e2 = de.getTime();
            daily.push({
                label: dayNames[dd.getDay()], date: dd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
                success: pipelines.filter(function (p) { return p.status === 'success' && inRange(p.created_at, s, e2); }).length,
                failed: pipelines.filter(function (p) { return p.status === 'failed' && inRange(p.created_at, s, e2); }).length,
                total: pipelines.filter(function (p) { return inRange(p.created_at, s, e2); }).length,
                mrsMerged: mrsMerged.filter(function (m) { return inRange(m.merged_at, s, e2); }).length,
                commits: commits.filter(function (cm) { return inRange(cm.created_at, s, e2); }).length
            });
        }
        // top failures par branche
        var failByRef = {}; pipelines.filter(function (p) { return p.status === 'failed'; }).forEach(function (p) { var ref = p.ref || 'unknown'; failByRef[ref] = (failByRef[ref] || 0) + 1; });
        var topFails = Object.keys(failByRef).map(function (k) { return { ref: k, n: failByRef[k] }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);

        var startStr = start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
        var endStr = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        var rangeStr = days === 1 ? endStr : (startStr + ' → ' + endStr);
        var nm = esc(c.name);
        // barres jour-par-jour
        var maxPip = Math.max.apply(null, daily.map(function (x) { return x.total; }).concat([1]));
        var bars = daily.map(function (x) {
            var hPct = Math.round((x.total / maxPip) * 100), fPct = x.total ? Math.round((x.failed / x.total) * 100) : 0;
            return `<div style="flex:1;text-align:center"><div style="height:90px;display:flex;align-items:flex-end;justify-content:center"><div title="${x.total} pipelines" style="width:60%;height:${Math.max(hPct, 2)}%;background:linear-gradient(180deg,#34d399 ${100 - fPct}%,#f87171 ${100 - fPct}%);border-radius:4px 4px 0 0"></div></div><div style="font-size:10px;opacity:.7;margin-top:4px">${esc(x.label)}</div><div style="font-size:9px;opacity:.5">${esc(x.date)}</div></div>`;
        }).join('');
        var practiceRows = practices.map(function (p) {
            return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>${p.icon} ${esc(p.name)} <span style="opacity:.6;font-size:11px">${esc(p.detail)}</span></span><b style="color:${pctScore(p.score)}">${p.score}</b></div><div style="height:7px;background:rgba(255,255,255,.1);border-radius:4px;overflow:hidden"><div style="height:100%;width:${p.score}%;background:${pctScore(p.score)}"></div></div></div>`;
        }).join('');
        var failRows = topFails.length ? topFails.map(function (f) { return `<tr><td style="padding:6px 10px"><code>${esc(f.ref)}</code></td><td style="padding:6px 10px;text-align:right;color:#f87171"><b>${f.n}</b></td></tr>`; }).join('') : `<tr><td colspan="2" style="padding:10px;opacity:.6">Aucun échec sur la période 🎉</td></tr>`;
        var staleRows = staleMrs.slice(0, 5).map(function (mr) { return `<tr><td style="padding:6px 10px">!${esc(mr.iid)} ${esc((mr.title || '').slice(0, 50))}</td><td style="padding:6px 10px;text-align:right">${mr.ageDays} j</td></tr>`; }).join('') || `<tr><td colspan="2" style="padding:10px;opacity:.6">Aucune MR ancienne 👍</td></tr>`;
        var dailyTable = daily.map(function (x) { return `<tr><td style="padding:5px 10px">${esc(x.label)} ${esc(x.date)}</td><td style="padding:5px 10px;text-align:center">${x.total}</td><td style="padding:5px 10px;text-align:center;color:#34d399">${x.success}</td><td style="padding:5px 10px;text-align:center;color:#f87171">${x.failed}</td><td style="padding:5px 10px;text-align:center">${x.mrsMerged}</td><td style="padding:5px 10px;text-align:center">${x.commits}</td></tr>`; }).join('');

        var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:linear-gradient(135deg,#0f172a,#1e293b,#312e81);min-height:100vh;color:#e2e8f0;padding:32px}.wrap{max-width:960px;margin:0 auto}.card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:24px;margin-bottom:20px}h1{font-size:28px;font-weight:800}h2{font-size:17px;font-weight:700;margin-bottom:14px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px}.stat{background:rgba(255,255,255,.04);border-radius:12px;padding:14px;text-align:center}.stat .v{font-size:26px;font-weight:800}.stat .l{font-size:11px;opacity:.6;margin-top:2px}table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;padding:6px 10px;opacity:.6;font-weight:600;border-bottom:1px solid rgba(255,255,255,.1)}tr{border-bottom:1px solid rgba(255,255,255,.05)}.foot{text-align:center;opacity:.4;font-size:12px;margin-top:8px}';
        var html = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rapport ' + esc(label) + ' — ' + nm + ' — ' + esc(rangeStr) + '</title><style>' + css + '</style></head><body><div class="wrap">'
            + '<div class="card" style="text-align:center"><div style="font-size:46px">📋</div><h1>Rapport ' + esc(label) + '</h1><p style="opacity:.7;margin-top:6px">📦 ' + nm + ' · ' + esc(rangeStr) + '</p>'
            + '<div style="display:inline-block;margin-top:16px;padding:10px 22px;border-radius:14px;background:' + hColor + '22;border:1px solid ' + hColor + '55"><span style="font-size:30px;font-weight:800;color:' + hColor + '">' + health + '/100</span> <span style="font-weight:700;color:' + hColor + '">' + hText + '</span></div></div>'
            + '<div class="card"><h2>📊 Vue d\'ensemble</h2><div class="grid">'
            + '<div class="stat"><div class="v">' + total + '</div><div class="l">Pipelines</div></div>'
            + '<div class="stat"><div class="v" style="color:#34d399">' + rate + '%</div><div class="l">Taux succès</div></div>'
            + '<div class="stat"><div class="v" style="color:#f87171">' + failed + '</div><div class="l">Échecs</div></div>'
            + '<div class="stat"><div class="v">' + mrsMerged.length + '</div><div class="l">MR mergées</div></div>'
            + '<div class="stat"><div class="v">' + mrsOpen.length + '</div><div class="l">MR ouvertes</div></div>'
            + '<div class="stat"><div class="v">' + deployments.length + '</div><div class="l">Déploiements</div></div>'
            + '<div class="stat"><div class="v">' + commits.length + '</div><div class="l">Commits</div></div></div></div>'
            + '<div class="card"><h2>📈 Activité jour par jour</h2><div style="display:flex;gap:6px;align-items:flex-end">' + bars + '</div>'
            + '<table style="margin-top:16px"><tr><th>Jour</th><th style="text-align:center">Pip.</th><th style="text-align:center">✅</th><th style="text-align:center">❌</th><th style="text-align:center">MR</th><th style="text-align:center">Commits</th></tr>' + dailyTable + '</table></div>'
            + '<div class="card"><h2>🎯 Bonnes pratiques — global <b style="color:' + pctScore(globalBP) + '">' + globalBP + '/100</b></h2>' + practiceRows + '</div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">'
            + '<div class="card"><h2>🔴 Top échecs par branche</h2><table>' + failRows + '</table></div>'
            + '<div class="card"><h2>⏳ MR qui traînent</h2><table>' + staleRows + '</table></div></div>'
            + '<div class="card foot">Généré par Salsi 🌱 · ' + esc(endStr) + ' · Données GitLab bornées (' + label.toLowerCase() + ')</div>'
            + '</div></body></html>';
        var filename = 'rapport-' + String(label).toLowerCase() + '-' + String(c.name).replace(/[^a-zA-Z0-9]/g, '-') + '-' + end.toISOString().split('T')[0] + '.html';
        if (!triggerDownload(filename, html, 'text/html')) return { html: `😅 Téléchargement bloqué par le navigateur. Réessaie.` };
        return { html: `📄 Rapport <b>${esc(label)}</b> de <b>${nm}</b> généré et téléchargé ✅ (${esc(rangeStr)}).<br>Santé <b style="color:${hColor}">${health}/100</b> — ${esc(hText)} · ${total} pipelines (${rate}% succès) · ${mrsMerged.length} MR mergées · ${commits.length} commits.<br>Fichier : <code>${esc(filename)}</code>.` };
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
    // ── FORMATION : réponses issues des docs de formation (js/hub/salsi-formation.js) ──
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
        var foot = m.title ? `<div class="sqa-hint">📘 Formation · Module ${esc(m.num || '')} — ${esc(m.title)}${m.niveau ? ' (' + esc(m.niveau) + ')' : ''}</div>` : '';
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

    var _lastIntent = null;   // mémoire de contexte pour les questions de suivi (« lesquelles ? »)
    async function answer(q) {
        var n = norm(q);
        // ── Small-talk d'abord (salut, ça va, merci…) — rendu null si vraie question derrière ──
        var st = smalltalkRoute(n); if (st) return st;
        // ── Un module précis nommé (« c'est quoi Smart Estimate ? ») gagne sur l'aide générale ──
        var ml = moduleLookup(n); if (ml) return ml;
        // ── Formation : concepts des docs (canary, kill switch, dette de flags, types de flags…) ──
        var fr = formationRoute(n); if (fr) return fr;
        // ── Aide : « que fait la plateforme / comment tu peux m'aider / les modules » ──
        if (/que (fait|fais|font)|a quoi (sert|ca sert|servent|serts)|qu est ce que (tu sais|tu peux|salsifi|la plateforme|le hub|c est)|c est quoi (la plateforme|salsifi|le hub)|tes (fonctionnalites|capacites|features|possibilites)|que (peux|sais) tu faire|(comment|est ce que) (tu peux|pourrais|peux tu|tu pourrais).* ?m aider|tu peux m aider|(liste|tous|quels) (des )?modules|les modules|toutes les fonctionnalites|montre moi ce que tu sais|presente (toi|la plateforme)|a quoi tu sers|ton aide/.test(n)) {
            var rh = d_help(); rh.intent = 'help'; return rh;
        }
        // ── DORA d'abord (le module qu'on travaille en profondeur) ──
        var doraCtx = /\bdora\b|deploiement|deployment|lead time|\blt\b|\bcfr\b|taux d echec|change failure|\bmttr\b|ttrs|restauration|frequence/.test(n);
        var improveVerb = /ameliorer|optimiser|augmenter|reduire|baisser|progresser|booster|accelerer|muscler|monter|passer elite|atteindre elite|comment (faire|augmenter|reduire|ameliorer|optimiser|progresser)/.test(n);
        // ── Rapports téléchargeables (une action) ──
        var wantReport = /rapport|report|\bexport/.test(n) && /genere|generer|telecharge|download|exporte|exporter|\bexport\b|fais moi|sors moi|produit|edite|donne moi le rapport|veux le rapport|cree|bilan a telecharger/.test(n) && !/c est quoi|qu est ce/.test(n);
        // « génère / télécharge / exporte le rapport de mes DORA » → rapport DORA
        if (wantReport && (/\bdora\b/.test(n) || doraCtx)) {
            var rr = d_dora_report(); rr.intent = 'dora_report'; return rr;
        }
        // « génère le rapport du jour / de la semaine / du mois » → rapport d'activité
        if (wantReport) {
            var per = null;
            if (/semaine|hebdo|\b7 ?j/.test(n)) per = { d: 7, l: 'Semaine' };
            else if (/mois|mensuel|\b30 ?j/.test(n)) per = { d: 30, l: 'Mois' };
            else if (/jour|quotidien|journalier|aujourd|daily|journee/.test(n)) per = { d: 1, l: 'Jour' };
            if (per) { var ra = await d_activity_report(per.d, per.l); ra.intent = 'activity_report_' + per.l.toLowerCase(); return ra; }
            return { html: `Quel rapport veux-tu ? 📄 « rapport du <b>jour</b> », « rapport de la <b>semaine</b> », « rapport du <b>mois</b> » — ou « le rapport <b>DORA</b> ».`, intent: 'report_ask' };
        }
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
        // « comment je m'en sers / comment ça marche / comment utiliser <module> » → mode d'emploi
        // (après le score-calc DORA, avant les routes module → « comment marche le bus factor » = usage).
        if (/comment (je )?m en (sers|servir)|comment (on )?(s en sert|s en servir|l utilise|l utiliser|utiliser|utilise|je fais|on fait)|comment (ca |c est )?(marche|fonctionne|s utilise)|ca s utilise comment|je m en sers comment/.test(n)) {
            var uk = usageKeyFromN(n) || (_lastIntent && usageKeyFromIntent(_lastIntent.k));
            if (uk) { var ru = usageHelp(uk); ru.intent = 'usage_' + uk; return ru; }
            return { html: `Dis-moi de quel module tu parles 🌱 — <b>DORA</b>, <b>badges</b>, <b>bus factor</b>, <b>Daily</b>, <b>feature flags</b>, <b>Repo Analyzer</b>… ou demande « <b>que fait la plateforme</b> » pour la vue d'ensemble.`, intent: 'usage_ask' };
        }
        // ── Gaming / Achievements (avant les « niveaux » DORA : « phases »/« badges » gagnent) ──
        var gr = await gamingRoute(n, /(combien|nombre|mon |ma |mes |quel|quelle|aujourd|semaine|mois)/.test(n));
        if (gr) {
            // Le sujet courant devient « badges » → un suivi (« lesquels ? ») ne repart pas
            // sur une intention obsolète (ex. feature flags) restée en mémoire.
            var _bi = INTENTS.filter(function (x) { return x.k === 'badges'; })[0]; if (_bi) _lastIntent = _bi;
            return gr;
        }
        // ── Daily Report : conseils du jour / ce qu'il contient (avant l'atelier générique) ──
        var dailyCtx = /daily|standup|rapport (du jour|quotidien|journalier|d activite)/.test(n);
        if (/conseil du jour|conseils du jour/.test(n) || (dailyCtx && /conseil|signale|detecte|declenche|alerte|flag/.test(n))) { var rdt = d_daily_tips(); rdt.intent = 'daily_tips'; return rdt; }
        if (dailyCtx && /contient|dans le|sections?|quoi dedans|que montre|qu y a|comprend|composition/.test(n)) { var rdc = d_daily_content(); rdc.intent = 'daily_content'; return rdc; }
        // ── Repo Analyzer : score / ce qui ne va pas / améliorer / activité (avant l'atelier) ──
        var rp = await repoRoute(n); if (rp) return rp;
        // ── Bus Factor : améliorer / les niveaux (avant l'atelier générique et les niveaux DORA) ──
        var busCtx = /bus factor|busfactor|facteur de bus|camion|silo de connaissance|qui sait quoi/.test(n);
        if (busCtx) {
            if (improveVerb || /pair programming|mob|partager le savoir|repartir|rotation|documenter|reduire le risque|desiloter|dessilot/.test(n)) { var rbi = d_bf_improve(); rbi.intent = 'busfactor_improve'; return rbi; }
            // « la note de MON bus factor » → mes vraies données (d_bus), pas le tableau générique.
            if (/niveau|niveaux|note|notes|palier|risque|critique|score|seuil|sur 5|\/5|comment.*(calcul|marche|fonctionne)/.test(n) && !/\bmon\b|\bma\b|\bmes\b/.test(n)) { var rbl = d_bf_levels(); rbl.intent = 'busfactor_levels'; return rbl; }
        }
        // « les niveaux / les notes / les paliers DORA » (ou « c'est quoi Elite »)
        if (/niveau|niveaux|note|notes|palier|paliers|bareme|baremes|seuil|seuils|elite|high performer|medium performer|low performer|barometre/.test(n) && (doraCtx || /elite|palier|performer|bareme/.test(n))) {
            // « la note de MON lead time / MES dora » → mes vraies mesures (pas le tableau générique).
            if (/\bmon\b|\bma\b|\bmes\b/.test(n)) { var rmy = await d_dora(n); rmy.intent = 'dora'; return rmy; }
            var rl = d_dora_levels(doraKeyFromN(n)); rl.intent = 'dora_levels'; return rl;
        }
        // Ateliers : question d'amélioration → on recommande un atelier (avant tout le reste).
        if (/\batelier|workshop|accompagnement|optimiser|ameliorer|\breduire\b|progresser|muscler|comment (faire|reduire|ameliorer|optimiser)/.test(n)) {
            var atl = searchAteliers(n); if (atl) { atl.intent = 'atelier'; return atl; }
        }
        var isDef = /(c est quoi|qu est ce|c est quoi|explique|definition|ca veut dire|signifie|comprends pas|c est koi)/.test(n);
        var isData = /(combien|nombre|mon |ma |mes |quel|quelle|nom|liste|lesquel|laquelle|lequel|montre|affiche|donne|aujourd|semaine|mois|derni|est ce que|qui |environnement|\benv\b|actif|inactif|\bon\b|\boff\b)/.test(n);
        var intent = null;
        for (var i = 0; i < INTENTS.length; i++) { if (hit(n, INTENTS[i].trig)) { intent = INTENTS[i]; break; } }
        // Suivi : pas d'intention trouvée mais une demande de donnée → dernière intention.
        if (!intent && isData && _lastIntent && _lastIntent.data && /nom|liste|lesquel|laquelle|lequel|lesquelles|montre|affiche|donne|detail|environnement|\benv\b|actif|inactif|\bprod\b|\bon\b|\boff\b/.test(n)) intent = _lastIntent;
        if (!intent) return { html: `Je ne réponds que sur la <b>plateforme</b> 🌱 — les concepts (« c'est quoi le bus factor ? »), tes résultats (pipelines, MR, bus factor, DORA, sécu…) et les ateliers (« atelier pour optimiser mon flow »). Reformule, ou essaie : « l'état de mon repo », « combien de FF ? ».`, intent: 'unknown' };
        if (intent.data) _lastIntent = intent;
        var r;
        if (isDef && intent.def) r = { html: defHtml(intent.def) };
        else if (isData && intent.data) r = await intent.data(n);
        else if (intent.data && !intent.def) r = await intent.data(n);
        else if (intent.def && !intent.data) r = { html: defHtml(intent.def) };
        else if (intent.dataFirst && intent.data) r = await intent.data(n); // module orienté données (ex. FF) → répond données par défaut
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
        // ── IA en DERNIER recours : uniquement si le déterministe ne sait pas ET l'IA est branchée ──
        var usedAI = false;
        if (r && r.intent === 'unknown' && Salsifi.aiConfigured && Salsifi.aiConfigured()) {
            if (pending) pending.innerHTML = '⚡ Je réfléchis…';
            try {
                var ai = await Salsifi.aiAsk({ question: q, contexte: salsiContext() });
                if (ai && ai.answer) { usedAI = true; r = { html: ai.answer + '<div class="sqa-hint">⚡ Réponse assistée par IA (hors déterministe)</div>', intent: ai.horsPerimetre ? 'ai_out' : 'ai' }; }
            } catch (e) { /* on garde le refus honnête */ }
        }
        logQ(q, r && r.intent, usedAI);   // trace : question + heure + contexte + intention + ai
        if (pending) pending.innerHTML = r.html;
        if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
    }
    function suggestions() {
        var chips = ['mes priorités du jour ?', 'que fait la plateforme ?', 'la note de mon repo ?', 'mon score DORA ?', 'combien de FF ?', 'ce qui ne va pas ?'];
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
        var aiOn = !!(Salsifi.aiConfigured && Salsifi.aiConfigured());
        var sub = aiOn ? 'plateforme · IA en secours' : 'questions sur la plateforme · 0 IA';
        panel.innerHTML =
            '<div class="sqa-head"><span class="sqa-ava">' + mascot + '</span><div><div class="sqa-title">Salsi</div><div class="sqa-sub">' + sub + '</div></div><button class="sqa-x" id="sqaX">✕</button></div>' +
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
