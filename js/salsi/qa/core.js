/* salsi/qa · core.js — socle : auth, dépôts, contexte GitLab, feature flags (chargé 1er). */

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
