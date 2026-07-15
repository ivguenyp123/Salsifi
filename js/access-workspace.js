// ═══════════════════════════════════════════════════
// ACCÈS & RÔLES - Vue workspace des droits GitLab
// ───────────────────────────────────────────────────
// Phase 1 (front-only, aucun back) : lit les membres de chaque repo du
// workspace via l'API GitLab, distingue accès DIRECT vs HÉRITÉ (groupe),
// et met en avant les Maintainers/Owners + les points d'attention.
//
// Aucune donnée n'est stockée : tout est recalculé à chaque ouverture à
// partir du token de session (localStorage, pattern hub/gouvernance/DORA).
// ═══════════════════════════════════════════════════

let GITLAB_URL = null, token = null, currentWorkspace = null;
let myUsername = '';    // utilisateur connecté (auteur des modifications de liste blanche)
let lastModel = null;   // dernier modèle calculé (pour export / re-render)
let lastReport = null;  // dernier rapport de gouvernance calculé (pour téléchargement)
let historyLoaded = false;   // chargement paresseux de l'onglet Historique
let lastHistory = null;      // derniers résultats d'historique (pour re-filtrer sans refetch)

// Filtres de tri par rôle (partagés Par repo / Par personne) et par type d'événement (Historique).
let repoFilter = 'all';      // all | admin | owner | maintainer
let peopleFilter = 'all';    // all | admin | owner | maintainer
let historyFilter = 'all';   // all | role | membership

// Liste blanche des Maintainers autorisés (portée workspace).
// Stockée en variable projet GitLab partagée (écriture = droit Maintainer),
// avec repli localStorage personnel pour la lecture/écriture non partagée.
const ALLOWLIST_VAR = 'SALSIFI_ROLE_ALLOWLIST';
let allowlist = { usernames: [], shared: false, updatedBy: null, updatedAt: null };

const HUB_URL = 'hub.html';

// GitLab access levels → libellé lisible.
const ROLE_LABELS = {
    5:  'Minimal',
    10: 'Guest',
    20: 'Reporter',
    30: 'Developer',
    40: 'Maintainer',
    50: 'Owner'
};
function roleLabel(level) { return ROLE_LABELS[level] || ('Niveau ' + level); }
// Un « administrateur » du repo = quelqu'un qui peut gérer les accès : Maintainer ou Owner.
function isAdminLevel(level) { return level >= 40; }

// Filtre de tri par rôle, partagé Par repo / Par personne.
function matchRole(level, f) {
    if (f === 'owner') return level >= 50;
    if (f === 'maintainer') return level === 40;
    if (f === 'admin') return level >= 40;   // Maintainers + Owners
    return true;                              // all
}
const ROLE_FILTERS = [['all', 'Tous'], ['admin', '👑 Maintainers & Owners'], ['owner', 'Owners'], ['maintainer', 'Maintainers']];
function roleFilterBar(current, setter) {
    return '<div class="filter-bar">' + ROLE_FILTERS.map(([v, l]) =>
        `<button class="filter-chip${current === v ? ' is-active' : ''}" onclick="${setter}('${v}')">${l}</button>`).join('') + '</div>';
}
function setReposFilter(f) { repoFilter = f; renderReposView(lastModel.repos, lastModel.errored); }
function setPeopleFilter(f) { peopleFilter = f; renderPeopleTable(lastModel.peopleList); }

const esc = window.Salsifi.escapeHtml;
const escA = window.Salsifi.escapeAttr;

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-hub-link]').forEach(a => { a.href = HUB_URL; });
    init();
    document.getElementById('refreshBtn').addEventListener('click', loadAccessData);
    document.getElementById('exportBtn').addEventListener('click', exportCsv);
    document.querySelectorAll('.tab').forEach(t => {
        t.addEventListener('click', () => switchTab(t.dataset.tab));
    });
});

function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('is-active', p.id === 'panel-' + name));
    // L'historique appelle l'API → on ne le charge qu'au premier affichage.
    if (name === 'history' && !historyLoaded) loadHistory();
}

function daysAgoISO(d) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString(); }

async function init() {
    const _auth = window.Salsifi.loadAuth({ redirect: false });
    if (!_auth) {
        return showError('Non connecté. Ouvre le hub et connecte-toi d\'abord. <br><a href="' + HUB_URL + '" style="color:#a78bfa;">← Retour au hub</a>');
    }
    GITLAB_URL = _auth.gitlabUrl;
    token = _auth.token;
    myUsername = _auth.username || '';

    const wsJson = sessionStorage.getItem('current_workspace');
    if (!wsJson) {
        return showError(
            'Aucune tribu sélectionnée. Ouvre ce module depuis le hub : ' +
            'choisis une tribu (workspace) puis clique sur Accès & Rôles. ' +
            '<br><a href="' + HUB_URL + '" style="color:#a78bfa;">← Retour au hub</a>'
        );
    }
    currentWorkspace = JSON.parse(wsJson);

    if (!currentWorkspace.repositories?.length) {
        return showError('Ce workspace ne contient aucun repo.');
    }
    document.getElementById('workspaceName').textContent =
        `🗂️ ${currentWorkspace.name} (${currentWorkspace.repositories.length} repos)`;
    await loadAllowlist();
    await loadAccessData();
}

function showError(html) {
    document.getElementById('loadingContainer').style.display = 'none';
    document.getElementById('mainContent').style.display = 'none';
    const box = document.getElementById('errorContainer');
    box.style.display = 'block';
    box.innerHTML = '<div class="error-message">' + html + '</div>';
}

function showToast(msg, isError) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast is-visible' + (isError ? ' is-error' : '');
    setTimeout(() => { t.className = 'toast'; }, 2600);
}

// ───── Récupération des membres d'un repo ─────────────────────────────
// On lit DEUX listes :
//  - /members/all : membres effectifs (directs + hérités du groupe parent)
//  - /members     : membres DIRECTS seulement
// Le diff des ids donne le drapeau « hérité » (accès venant du groupe).
async function fetchRepoMembers(repo) {
    const [all, direct] = await Promise.all([
        window.Salsifi.gitlabPaginate(GITLAB_URL, token, `/projects/${repo.id}/members/all`)
            .catch(() => null),
        window.Salsifi.gitlabPaginate(GITLAB_URL, token, `/projects/${repo.id}/members`)
            .catch(() => [])
    ]);
    if (all === null) {
        return { repo, error: true, members: [] };
    }
    const directIds = new Set((direct || []).map(m => m.id));
    // /members/all peut renvoyer des doublons (même user à plusieurs niveaux
    // hérités) : on garde le niveau d'accès le plus élevé par utilisateur.
    const byId = new Map();
    for (const m of all) {
        const prev = byId.get(m.id);
        if (!prev || m.access_level > prev.access_level) {
            byId.set(m.id, m);
        }
    }
    const members = Array.from(byId.values()).map(m => ({
        id: m.id,
        username: m.username,
        name: m.name || m.username,
        state: m.state,
        access_level: m.access_level,
        role: roleLabel(m.access_level),
        inherited: !directIds.has(m.id),
        expires_at: m.expires_at || null,
        created_at: m.created_at || null
    })).sort((a, b) => b.access_level - a.access_level || a.name.localeCompare(b.name));

    return { repo, error: false, members };
}

async function loadAccessData() {
    document.getElementById('errorContainer').style.display = 'none';
    document.getElementById('mainContent').style.display = 'none';
    const loading = document.getElementById('loadingContainer');
    loading.style.display = 'block';
    document.getElementById('loadingText').textContent =
        `Lecture des membres sur ${currentWorkspace.repositories.length} repos…`;

    const repos = currentWorkspace.repositories;
    const tasks = repos.map(r => () => fetchRepoMembers(r));
    const settled = await window.Salsifi.runWithConcurrency(tasks, 5);
    const repoResults = settled.map(s => s.status === 'fulfilled' ? s.value : { repo: null, error: true, members: [] })
        .filter(r => r.repo);

    lastModel = buildModel(repoResults);
    loading.style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    render(lastModel);

    // L'historique est reconstruit à la demande : on invalide le cache et,
    // si l'onglet est ouvert, on le recharge tout de suite.
    historyLoaded = false;
    const histView = document.getElementById('historyView');
    if (histView) histView.innerHTML = '<div class="muted" style="padding:20px;">Ouvre cet onglet pour charger l\'historique des 30 derniers jours…</div>';
    if (document.querySelector('.tab.is-active')?.dataset.tab === 'history') loadHistory();
}

// ───── Construction du modèle agrégé ──────────────────────────────────
function buildModel(repoResults) {
    const people = new Map();   // username → { id, username, name, maxLevel, repos:[{name, role, level, inherited, expires_at}] }
    const repos = [];
    const errored = [];

    for (const rr of repoResults) {
        if (rr.error) { errored.push(rr.repo); continue; }
        const admins = rr.members.filter(m => isAdminLevel(m.access_level) && m.state !== 'blocked');
        repos.push({
            id: rr.repo.id,
            name: rr.repo.name,
            path: rr.repo.path_with_namespace || rr.repo.name,
            members: rr.members,
            adminCount: admins.length
        });
        for (const m of rr.members) {
            let p = people.get(m.username);
            if (!p) {
                p = { id: m.id, username: m.username, name: m.name, maxLevel: 0, repos: [] };
                people.set(m.username, p);
            }
            if (m.access_level > p.maxLevel) p.maxLevel = m.access_level;
            p.repos.push({ name: rr.repo.name, role: m.role, level: m.access_level, inherited: m.inherited, expires_at: m.expires_at });
        }
    }

    const peopleList = Array.from(people.values())
        .sort((a, b) => b.maxLevel - a.maxLevel || a.name.localeCompare(b.name));

    // Admins distincts (Maintainer/Owner sur au moins un repo).
    const admins = peopleList.filter(p => isAdminLevel(p.maxLevel));

    // ── Alertes ────────────────────────────────────────────────────
    const alerts = [];
    const noAdmin = repos.filter(r => r.adminCount === 0);
    const soloAdmin = repos.filter(r => r.adminCount === 1);
    if (noAdmin.length) {
        alerts.push({
            level: 'danger',
            title: `${noAdmin.length} repo(s) sans Maintainer/Owner`,
            detail: 'Personne ne peut administrer les accès de ces repos : ' +
                noAdmin.map(r => esc(r.name)).join(', ') + '.'
        });
    }
    if (soloAdmin.length) {
        alerts.push({
            level: 'warn',
            title: `${soloAdmin.length} repo(s) avec un seul Maintainer/Owner`,
            detail: 'Bus factor d\'accès = 1. Si cette personne part, plus personne ne gère les droits : ' +
                soloAdmin.map(r => esc(r.name)).join(', ') + '.'
        });
    }
    // Accès qui expirent bientôt (< 30 jours) ou déjà expirés.
    const expiring = [];
    const now = Date.now();
    for (const r of repos) {
        for (const m of r.members) {
            if (!m.expires_at) continue;
            const days = Math.floor((new Date(m.expires_at).getTime() - now) / 86400000);
            if (days <= 30) expiring.push({ repo: r.name, name: m.name, role: m.role, days });
        }
    }
    if (expiring.length) {
        alerts.push({
            level: 'warn',
            title: `${expiring.length} accès expire(nt) sous 30 jours`,
            detail: expiring
                .sort((a, b) => a.days - b.days)
                .map(e => `${esc(e.name)} (${e.role}) sur ${esc(e.repo)} — ${e.days < 0 ? 'expiré' : 'dans ' + e.days + 'j'}`)
                .join(' · ')
        });
    }

    if (!alerts.length) {
        alerts.push({ level: 'ok', title: 'Aucun point bloquant détecté', detail: 'Chaque repo a au moins deux administrateurs et aucun accès n\'expire dans le mois.' });
    }

    return { repos, peopleList, admins, alerts, errored };
}

// ───── Rendu ──────────────────────────────────────────────────────────
function render(model) {
    renderSummary(model);
    renderAlerts(model.alerts);
    renderReport(model);
    renderReposView(model.repos, model.errored);
    renderPeopleTable(model.peopleList);
    renderAdmins(model.admins);
    renderCompliance(model);
}

function renderSummary(model) {
    const uniquePeople = model.peopleList.length;
    const owners = model.peopleList.filter(p => p.maxLevel >= 50).length;
    const maintainers = model.peopleList.filter(p => p.maxLevel === 40).length;
    const cards = [
        { label: 'Repos analysés', value: model.repos.length, meta: model.errored.length ? `${model.errored.length} inaccessibles` : 'Tous lus' },
        { label: 'Personnes uniques', value: uniquePeople, meta: 'Directs + hérités' },
        { label: 'Owners', value: owners, meta: 'Niveau 50' },
        { label: 'Maintainers', value: maintainers, meta: 'Niveau 40 max' }
    ];
    document.getElementById('summaryCards').innerHTML = cards.map(c => `
        <div class="summary-card">
            <div class="summary-label">${c.label}</div>
            <div class="summary-value">${c.value}</div>
            <div class="summary-trend trend-flat">${c.meta}</div>
        </div>`).join('');
}

function renderAlerts(alerts) {
    document.getElementById('alertsContainer').innerHTML = alerts.map(a => `
        <div class="alert alert-${a.level}">
            <div class="alert-title">${alertIcon(a.level)} ${esc(a.title)}</div>
            <div class="alert-detail">${a.detail}</div>
        </div>`).join('');
}
function alertIcon(level) {
    return level === 'danger' ? '🔴' : level === 'warn' ? '🟠' : '🟢';
}

function renderReposView(repos, errored) {
    let html = roleFilterBar(repoFilter, 'setReposFilter');
    if (errored.length) {
        html += `<div class="repo-errors">⚠️ ${errored.length} repo(s) non lisibles (droits insuffisants ou introuvables) : ` +
            errored.map(r => esc(r.name)).join(', ') + '</div>';
    }
    const shown = repos
        .map(r => ({ ...r, members: r.members.filter(m => matchRole(m.access_level, repoFilter)) }))
        .filter(r => repoFilter === 'all' || r.members.length);
    if (!shown.length) {
        document.getElementById('reposView').innerHTML = html + '<div class="muted" style="padding:16px;">Aucun membre ne correspond à ce filtre.</div>';
        return;
    }
    html += shown.map(r => {
        const rows = r.members.map(m => `
            <tr>
                <td>
                    <div class="m-name">${esc(m.name)}</div>
                    <div class="m-user">@${esc(m.username)}${m.state === 'blocked' ? ' <span class="pill pill-blocked">bloqué</span>' : ''}</div>
                </td>
                <td><span class="role-badge lvl-${m.access_level}">${esc(m.role)}</span></td>
                <td>${m.inherited ? '<span class="pill pill-inherited" title="Accès venant du groupe parent">hérité</span>' : '<span class="pill pill-direct">direct</span>'}</td>
                <td>${m.expires_at ? esc(m.expires_at.slice(0, 10)) : '<span class="muted">—</span>'}</td>
            </tr>`).join('');
        const adminTag = r.adminCount === 0
            ? '<span class="pill pill-blocked">0 admin</span>'
            : r.adminCount === 1
                ? '<span class="pill pill-warn">1 admin</span>'
                : `<span class="pill pill-ok">${r.adminCount} admins</span>`;
        return `
        <div class="repo-block">
            <div class="repo-head">
                <div class="repo-title">📦 ${esc(r.name)} ${adminTag}</div>
                <div class="repo-meta">${r.members.length} membre(s)</div>
            </div>
            <div class="table-container">
                <table>
                    <thead><tr><th>Personne</th><th>Rôle</th><th>Origine</th><th>Expire</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="4" class="muted">Aucun membre lisible.</td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
    }).join('');
    document.getElementById('reposView').innerHTML = html || '<div class="muted">Aucun repo lisible.</div>';
}

function renderPeopleTable(people) {
    const bar = document.getElementById('peopleFilterBar');
    if (bar) bar.innerHTML = roleFilterBar(peopleFilter, 'setPeopleFilter');
    const shown = people.filter(p => matchRole(p.maxLevel, peopleFilter));
    document.getElementById('peopleTableBody').innerHTML = shown.map(p => {
        const detail = p.repos
            .sort((a, b) => b.level - a.level)
            .map(r => `${esc(r.name)} <span class="role-badge sm lvl-${r.level}">${esc(r.role)}</span>${r.inherited ? '<span class="pill pill-inherited sm">hérité</span>' : ''}`)
            .join(' · ');
        return `
            <tr>
                <td>
                    <div class="m-name">${esc(p.name)}</div>
                    <div class="m-user">@${esc(p.username)}</div>
                </td>
                <td><span class="role-badge lvl-${p.maxLevel}">${esc(roleLabel(p.maxLevel))}</span></td>
                <td>${p.repos.length}</td>
                <td class="detail-cell">${detail}</td>
            </tr>`;
    }).join('') || '<tr><td colspan="4" class="muted">Aucune personne.</td></tr>';
}

function renderAdmins(admins) {
    if (!admins.length) {
        document.getElementById('adminsView').innerHTML = '<div class="muted">Aucun Maintainer/Owner trouvé.</div>';
        return;
    }
    document.getElementById('adminsView').innerHTML = `
        <div class="admin-grid">` +
        admins.map(p => {
            const scope = p.repos.filter(r => isAdminLevel(r.level));
            return `
            <div class="admin-card">
                <div class="admin-head">
                    <div class="admin-name">${p.maxLevel >= 50 ? '👑' : '🔧'} ${esc(p.name)}</div>
                    <span class="role-badge lvl-${p.maxLevel}">${esc(roleLabel(p.maxLevel))}</span>
                </div>
                <div class="admin-user">@${esc(p.username)}</div>
                <div class="admin-scope">Administre ${scope.length} repo(s) :</div>
                <div class="admin-repos">${scope.map(r => `<span class="chip">${esc(r.name)}${r.inherited ? ' ·hérité' : ''}</span>`).join('')}</div>
            </div>`;
        }).join('') +
        `</div>`;
}

// ═══════════════════════════════════════════════════
// RAPPORT — synthèse de gouvernance des accès
// ───────────────────────────────────────────────────
// Calcule les signaux de dette d'accès à partir du roster déjà chargé :
// accès hérités (racine au niveau groupe), accès sans expiration (pas de
// revue), comptes bloqués encore listés, comptes de service en rôle élevé.
// ═══════════════════════════════════════════════════

// Heuristique « compte technique / de service » (bot, robot, root…).
// Sert à signaler pour revue, pas à bloquer : quelques faux positifs tolérés.
const SERVICE_RX = /(^|[_-])(bot|bots|robot|operator|runner|service|svc|deploy|deployer|ci|cd|pipeline|automation|token|sonar|nexus|artifactory|vault|terraform|ansible|jenkins|scanner)([_-]|$)/i;
function looksLikeService(username, name) {
    const u = String(username || ''), n = String(name || '');
    if (/^(root|administrator|ghost|support[-_]?bot)$/i.test(u)) return true;
    if (SERVICE_RX.test(u) || SERVICE_RX.test(n)) return true;
    if (/^app[_-]/i.test(u)) return true;                     // APP_ZOE_0147
    if (/^(svc|sa)[_-]/i.test(u) || /[_-]sa$/i.test(u)) return true;
    if (/^[A-Z0-9_]{4,}$/.test(u) && /\d/.test(u)) return true; // MAJUSCULES + chiffres = compte technique
    return false;
}
function isBlockedState(state) { return !!state && state !== 'active'; }

function computeReport(model) {
    const pairs = [];   // 1 accès = (repo, membre)
    for (const r of model.repos) for (const m of r.members) pairs.push({ repoId: r.id, repo: r.name, m });
    const total = pairs.length;
    const inherited = pairs.filter(p => p.m.inherited);
    const noExpiry = pairs.filter(p => !p.m.expires_at);
    const blocked = pairs.filter(p => isBlockedState(p.m.state));
    const ownersPairs = pairs.filter(p => p.m.access_level >= 50);
    const service = pairs.filter(p => looksLikeService(p.m.username, p.m.name));
    const serviceHigh = service.filter(p => p.m.access_level >= 40);
    const serviceOwner = service.filter(p => p.m.access_level >= 50);
    const pct = n => total ? Math.round((n / total) * 100) : 0;

    const findings = [];
    if (serviceOwner.length) {
        findings.push({ sev: 'critical', icon: '💣', title: 'Comptes de service / techniques en Owner', count: serviceOwner.length, pairs: serviceOwner,
            desc: 'Un compte technique (bot, root, deploy…) avec le niveau max. Si son token fuite, c\'est un Owner complet. Ces comptes devraient être Maintainer ou moins — jamais Owner.' });
    }
    if (blocked.length) {
        findings.push({ sev: 'critical', icon: '🚫', title: 'Comptes bloqués encore présents', count: blocked.length, pairs: blocked,
            desc: 'Comptes bloqués (LDAP / suspendus / partis) qui gardent leur rôle. Si le blocage saute ou est contourné, l\'accès est toujours là. Dette d\'accès à purger.' });
    }
    const inhPct = pct(inherited.length);
    if (inhPct >= 50) {
        const distinctInhOwners = new Set(inherited.filter(p => p.m.access_level >= 50).map(p => p.m.username));
        findings.push({ sev: 'warn', icon: '🌳', title: `Sur-héritage : ${inhPct}% des accès viennent du groupe`, count: inherited.length, pairs: [],
            desc: `La racine du problème n'est pas dans les repos mais dans le <b>groupe parent</b> : ${inherited.length} accès sur ${total} sont hérités${distinctInhOwners.size ? `, dont ${distinctInhOwners.size} Owner(s) distinct(s) collés au niveau du groupe et qui ruissellent sur tous les projets` : ''}. À traiter au niveau du groupe, pas repo par repo.` });
    }
    const expPct = pct(noExpiry.length);
    if (expPct >= 50) {
        findings.push({ sev: 'warn', icon: '♾️', title: `Aucune expiration sur ${expPct}% des accès`, count: noExpiry.length, pairs: [],
            desc: `${noExpiry.length} accès sur ${total} n'ont pas de date d'expiration : aucune revue périodique. Ces droits restent en place indéfiniment jusqu'à retrait manuel — qui n'arrive jamais. Poser des dates d'expiration + une revue trimestrielle.` });
    }
    if (serviceHigh.length > serviceOwner.length) {
        const rest = serviceHigh.filter(p => p.m.access_level < 50);
        findings.push({ sev: 'warn', icon: '🤖', title: 'Comptes de service en Maintainer', count: rest.length, pairs: rest,
            desc: 'Comptes techniques avec droit d\'admin (Maintainer). À vérifier : un bot a rarement besoin de gérer les membres ; Developer suffit souvent.' });
    }

    return { total, inherited, noExpiry, blocked, ownersPairs, service, serviceHigh, serviceOwner, findings, pct,
        distinctOwners: new Set(ownersPairs.map(p => p.m.username)),
        errored: model.errored };
}

function pairListHtml(pairs, max) {
    max = max || 15;
    const items = pairs.slice(0, max).map(p => `
        <li>
            <b>${esc(p.m.name)}</b> <span class="muted">@${esc(p.m.username)}</span>
            <span class="role-badge sm lvl-${p.m.access_level}">${esc(p.m.role)}</span>
            <span class="chip">${esc(p.repo)}</span>${p.m.inherited ? ' <span class="pill pill-inherited sm">hérité</span>' : ''}${isBlockedState(p.m.state) ? ` <span class="pill pill-blocked">${esc(p.m.state)}</span>` : ''}${!p.m.expires_at ? ' <span class="pill pill-direct">sans expiration</span>' : ''}
        </li>`).join('');
    const more = pairs.length > max ? `<li class="muted">… et ${pairs.length - max} autre(s)</li>` : '';
    return `<ul class="rpt-list">${items}${more}</ul>`;
}

function renderReport(model) {
    const view = document.getElementById('reportView');
    if (!view) return;
    const rep = computeReport(model);
    lastReport = rep;

    if (!rep.total) {
        view.innerHTML = '<div class="muted" style="padding:20px;">Aucun accès lisible sur les repos du workspace.</div>';
        return;
    }

    const kpis = [
        { label: 'Accès totaux', value: rep.total, meta: `${model.repos.length} repos`, tone: '' },
        { label: 'Hérités du groupe', value: rep.pct(rep.inherited.length) + '%', meta: `${rep.inherited.length} accès`, tone: rep.pct(rep.inherited.length) >= 50 ? 'bad' : '' },
        { label: 'Sans expiration', value: rep.pct(rep.noExpiry.length) + '%', meta: `${rep.noExpiry.length} accès`, tone: rep.pct(rep.noExpiry.length) >= 50 ? 'bad' : '' },
        { label: 'Comptes bloqués', value: rep.blocked.length, meta: 'encore listés', tone: rep.blocked.length ? 'bad' : 'good' },
        { label: 'Service en rôle élevé', value: rep.serviceHigh.length, meta: `dont ${rep.serviceOwner.length} Owner`, tone: rep.serviceOwner.length ? 'bad' : (rep.serviceHigh.length ? 'warn' : 'good') },
        { label: 'Owners distincts', value: rep.distinctOwners.size, meta: `${rep.ownersPairs.length} accès Owner`, tone: rep.distinctOwners.size > 10 ? 'bad' : '' }
    ];
    const kpiHtml = `<div class="rpt-kpis">` + kpis.map(k => `
        <div class="rpt-kpi">
            <div class="rpt-kpi-label">${k.label}</div>
            <div class="rpt-kpi-value ${k.tone}">${k.value}</div>
            <div class="rpt-kpi-meta">${k.meta}</div>
        </div>`).join('') + `</div>`;

    const findingsHtml = rep.findings.length
        ? rep.findings.map(f => `
            <div class="rpt-finding sev-${f.sev}">
                <div class="rpt-finding-head">${f.icon} <b>${esc(f.title)}</b> <span class="rpt-count">${f.count}</span></div>
                <div class="rpt-finding-desc">${f.desc}</div>
                ${f.pairs.length ? pairListHtml(f.pairs) : ''}
            </div>`).join('')
        : '<div class="wl-ok">✅ Aucun signal de dette d\'accès majeur détecté.</div>';

    const reco = `
        <div class="rpt-reco">
            <div class="rpt-reco-title">🧭 Par où commencer</div>
            <ol>
                ${rep.serviceOwner.length ? '<li><b>Dégrader les comptes de service en Owner</b> → Maintainer ou moins (onglet Conformité pour les Maintainers directs).</li>' : ''}
                ${rep.blocked.length ? '<li><b>Purger les comptes bloqués</b> encore listés — retirer l\'accès, ne pas juste compter sur le blocage LDAP.</li>' : ''}
                ${rep.pct(rep.inherited.length) >= 50 ? '<li><b>Attaquer la racine au niveau du groupe parent</b> : réduire la liste des Owners de groupe plutôt que corriger repo par repo.</li>' : ''}
                ${rep.pct(rep.noExpiry.length) >= 50 ? '<li><b>Poser des dates d\'expiration</b> et instaurer une revue trimestrielle des accès.</li>' : ''}
                <li>Définir la <b>liste blanche des Maintainers autorisés</b> (onglet Conformité) pour détecter automatiquement les prochains écarts.</li>
            </ol>
        </div>`;

    const head = `
        <div class="rpt-head">
            <div>
                <div class="rpt-title">📋 Rapport de gouvernance des accès</div>
                <div class="rpt-sub">${esc(currentWorkspace.name)} · ${model.repos.length} repos · ${rep.total} accès${rep.errored.length ? ` · ${rep.errored.length} repo(s) non lus` : ''}</div>
            </div>
            <button class="btn-ghost" onclick="downloadReport()">⬇️ Télécharger (HTML)</button>
        </div>`;

    view.innerHTML = head + kpiHtml + '<div class="block-title" style="margin-top:8px;">🚩 Signaux de dette d\'accès</div>' + findingsHtml + reco;
}

// Rapport téléchargeable autonome (HTML autoportant, styles inline).
function downloadReport() {
    if (!lastReport || !lastModel) return;
    const rep = lastReport;
    const date = new Date().toISOString().slice(0, 10);
    const kpiRow = [
        ['Accès totaux', rep.total], ['Hérités', rep.pct(rep.inherited.length) + '% (' + rep.inherited.length + ')'],
        ['Sans expiration', rep.pct(rep.noExpiry.length) + '% (' + rep.noExpiry.length + ')'],
        ['Comptes bloqués', rep.blocked.length], ['Service en rôle élevé', rep.serviceHigh.length + ' (dont ' + rep.serviceOwner.length + ' Owner)'],
        ['Owners distincts', rep.distinctOwners.size]
    ].map(([l, v]) => `<td><div class="l">${l}</div><div class="v">${v}</div></td>`).join('');
    const findingBlocks = rep.findings.map(f => {
        const li = f.pairs.map(p => `<li>${esc(p.m.name)} (@${esc(p.m.username)}) — ${esc(p.m.role)} · ${esc(p.repo)}${p.m.inherited ? ' [hérité]' : ''}${isBlockedState(p.m.state) ? ' [' + esc(p.m.state) + ']' : ''}</li>`).join('');
        return `<div class="f sev-${f.sev}"><h3>${f.icon} ${esc(f.title)} — ${f.count}</h3><p>${f.desc}</p>${li ? '<ul>' + li + '</ul>' : ''}</div>`;
    }).join('');
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Rapport accès — ${esc(currentWorkspace.name)} — ${date}</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f1117;color:#e6e8ee;margin:0;padding:32px;}
h1{font-size:22px;margin:0 0 4px;} .sub{color:#9aa0ae;font-size:13px;margin-bottom:24px;}
table.kpi{width:100%;border-collapse:collapse;margin-bottom:28px;} table.kpi td{background:#171a23;border:1px solid #262a36;border-radius:10px;padding:14px;text-align:center;}
table.kpi .l{font-size:11px;color:#9aa0ae;text-transform:uppercase;letter-spacing:.04em;} table.kpi .v{font-size:24px;font-weight:700;margin-top:6px;}
.f{background:#171a23;border:1px solid #262a36;border-left-width:4px;border-radius:10px;padding:16px 18px;margin-bottom:14px;}
.f.sev-critical{border-left-color:#ef4444;} .f.sev-warn{border-left-color:#fb923c;}
.f h3{margin:0 0 6px;font-size:15px;} .f p{margin:0 0 10px;color:#c3c8d4;font-size:13px;line-height:1.5;}
.f ul{margin:0;padding-left:20px;font-size:13px;color:#c3c8d4;} .f li{margin:2px 0;}
.foot{margin-top:24px;color:#6b7280;font-size:11px;}
</style></head><body>
<h1>📋 Rapport de gouvernance des accès</h1>
<div class="sub">${esc(currentWorkspace.name)} · ${lastModel.repos.length} repos · ${rep.total} accès · généré le ${date}</div>
<table class="kpi"><tr>${kpiRow}</tr></table>
<h2 style="font-size:16px;">🚩 Signaux de dette d'accès</h2>
${findingBlocks || '<p>Aucun signal majeur.</p>'}
<div class="foot">Généré par Salsifi — Accès &amp; Rôles. Les comptes « de service » sont détectés par heuristique (à vérifier).</div>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (currentWorkspace.name || 'workspace').replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
    a.href = url;
    a.download = `rapport-acces-${safe}-${date}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✓ Rapport téléchargé');
}

// ═══════════════════════════════════════════════════
// CONFORMITÉ — liste blanche des Maintainers + rétrogradation semi-auto
// ───────────────────────────────────────────────────
// Le token de session écrit : PUT /projects/:id/members/:user_id
// access_level=30 rétrograde un Maintainer en Developer. L'action n'est
// JAMAIS silencieuse : détection à l'ouverture, correction sur clic.
// Garde-fous : on ne touche jamais un Owner (impossible avec un token
// Maintainer) ni un accès hérité (à corriger au niveau du groupe).
// ═══════════════════════════════════════════════════

function lsKey() { return 'salsifi_role_allowlist:' + (currentWorkspace.id || currentWorkspace.name || 'ws'); }

function parseAllowlistValue(str) {
    try {
        const j = JSON.parse(str);
        if (Array.isArray(j)) return { usernames: j, updatedBy: null, updatedAt: null };
        return { usernames: Array.isArray(j.usernames) ? j.usernames : [], updatedBy: j.updatedBy || null, updatedAt: j.updatedAt || null };
    } catch { return null; }
}

// Lit une variable projet GitLab (null si absente / non lisible).
async function gitlabVarGet(projectId, key) {
    try {
        const r = await window.Salsifi.gitlabFetch(GITLAB_URL, token, `/projects/${projectId}/variables/${key}`);
        if (!r.ok) return null;
        const j = await r.json();
        return (j && typeof j.value === 'string') ? j.value : null;
    } catch { return null; }
}

// Écrit une variable projet (PUT, puis POST si elle n'existe pas). Renvoie true si OK.
async function gitlabVarSet(projectId, key, value) {
    const common = { headers: { 'Content-Type': 'application/json' } };
    try {
        let r = await window.Salsifi.gitlabFetch(GITLAB_URL, token, `/projects/${projectId}/variables/${key}`, {
            ...common, method: 'PUT', body: JSON.stringify({ value })
        });
        if (r.status === 404) {
            r = await window.Salsifi.gitlabFetch(GITLAB_URL, token, `/projects/${projectId}/variables`, {
                ...common, method: 'POST', body: JSON.stringify({ key, value, masked: false, protected: false })
            });
        }
        return r.ok;
    } catch { return false; }
}

async function loadAllowlist() {
    // 1) Variable partagée : on scanne les repos, le premier trouvé gagne.
    for (const repo of currentWorkspace.repositories) {
        const val = await gitlabVarGet(repo.id, ALLOWLIST_VAR);
        if (val != null) {
            const parsed = parseAllowlistValue(val);
            if (parsed) { allowlist = { ...parsed, shared: true }; return; }
        }
    }
    // 2) Repli localStorage personnel.
    try {
        const raw = localStorage.getItem(lsKey());
        if (raw) { const p = parseAllowlistValue(raw); if (p) { allowlist = { ...p, shared: false }; return; } }
    } catch { /* ignore */ }
    allowlist = { usernames: [], shared: false, updatedBy: null, updatedAt: null };
}

async function saveAllowlist(usernames) {
    allowlist.usernames = usernames;
    allowlist.updatedAt = new Date().toISOString();
    allowlist.updatedBy = myUsername || null;
    const payload = JSON.stringify({ usernames, updatedAt: allowlist.updatedAt, updatedBy: allowlist.updatedBy });
    // Miroir local systématique (cache + repli).
    try { localStorage.setItem(lsKey(), payload); } catch { /* ignore */ }
    // Partage : écrit la variable sur tous les repos du workspace (best effort).
    const tasks = currentWorkspace.repositories.map(r => () => gitlabVarSet(r.id, ALLOWLIST_VAR, payload));
    const settled = await window.Salsifi.runWithConcurrency(tasks, 4);
    const okCount = settled.filter(s => s.status === 'fulfilled' && s.value === true).length;
    allowlist.shared = okCount > 0;
    return { okCount, total: currentWorkspace.repositories.length };
}

function allowedSet() { return new Set(allowlist.usernames.map(u => String(u).toLowerCase())); }

// Écarts = membres Maintainer/Owner (directs ou hérités) hors liste blanche.
function computeViolations(model) {
    const wl = allowedSet();
    const list = [];
    for (const repo of model.repos) {
        for (const m of repo.members) {
            if (m.access_level < 40) continue;
            if (wl.has(String(m.username).toLowerCase())) continue;
            if (m.state === 'blocked') continue;   // déjà inactif
            let kind;
            if (m.inherited) kind = 'inherited';           // → à traiter au niveau du groupe
            else if (m.access_level >= 50) kind = 'owner';  // → intouchable par un token Maintainer
            else kind = 'demotable';                         // Maintainer direct → rétrogradable
            list.push({ repoId: repo.id, repoName: repo.name, userId: m.id, username: m.username, name: m.name, level: m.access_level, role: m.role, kind });
        }
    }
    return list;
}

function currentTextareaUsernames() {
    const ta = document.getElementById('wlTextarea');
    if (!ta) return allowlist.usernames.slice();
    return Array.from(new Set(ta.value.split(/[\n,;]+/).map(s => s.trim().replace(/^@/, '')).filter(Boolean)));
}

async function onSaveAllowlist() {
    const usernames = currentTextareaUsernames();
    showToast('Enregistrement…');
    const res = await saveAllowlist(usernames);
    if (res.okCount > 0) showToast(`✓ Liste partagée (${res.okCount}/${res.total} repos)`);
    else showToast('✓ Enregistrée en local — partage impossible (droit Maintainer requis)');
    renderCompliance(lastModel);
}

function onSeedMaintainers() {
    if (!lastModel) return;
    const current = new Set(currentTextareaUsernames());
    for (const p of lastModel.admins) current.add(p.username);
    const ta = document.getElementById('wlTextarea');
    if (ta) ta.value = Array.from(current).join('\n');
    showToast('Maintainers/Owners actuels ajoutés — pense à Enregistrer');
}

async function putMemberLevel(projectId, userId, level) {
    try {
        const r = await window.Salsifi.gitlabFetch(GITLAB_URL, token, `/projects/${projectId}/members/${userId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_level: level })
        });
        return r.ok;
    } catch { return false; }
}

async function demoteMember(repoId, userId) {
    const repo = lastModel.repos.find(r => r.id === repoId);
    const m = repo && repo.members.find(x => x.id === userId);
    if (!repo || !m) return;
    if (!confirm(`Rétrograder ${m.name} (@${m.username}) en Developer sur « ${repo.name} » ?`)) return;
    const ok = await putMemberLevel(repoId, userId, 30);
    if (ok) { showToast(`✓ ${m.name} rétrogradé en Developer`); await reloadAfterChange(); }
    else showToast('Échec — droit Maintainer requis sur ce repo ?', true);
}

async function fixAllViolations() {
    const demotable = computeViolations(lastModel).filter(v => v.kind === 'demotable');
    if (!demotable.length) return;
    if (!confirm(`Rétrograder ${demotable.length} Maintainer(s) non autorisé(s) en Developer ?\n\n` +
        demotable.map(v => `• ${v.name} sur ${v.repoName}`).join('\n'))) return;
    let ok = 0, fail = 0;
    for (const v of demotable) {
        (await putMemberLevel(v.repoId, v.userId, 30)) ? ok++ : fail++;
    }
    showToast(`✓ ${ok} rétrogradé(s)${fail ? ` · ${fail} échec(s)` : ''}`, fail > 0);
    await reloadAfterChange();
}

async function reloadAfterChange() {
    await loadAccessData();   // recharge le roster + re-render (dont Conformité)
    switchTab('compliance');
}

function renderCompliance(model) {
    const view = document.getElementById('complianceView');
    if (!view) return;
    const banner = allowlist.shared
        ? '<div class="wl-banner wl-shared">🌐 Liste <b>partagée</b> (variable GitLab du workspace) — visible par toute l\'équipe.</div>'
        : '<div class="wl-banner wl-personal">👤 Liste <b>personnelle</b> (ton navigateur). Enregistre en tant que Maintainer pour la partager.</div>';

    const editor = `
        <div class="chart-card wl-editor">
            <div class="wl-title">✅ Maintainers autorisés — portée workspace</div>
            <p class="wl-help">Un <b>username GitLab</b> par ligne. Ces personnes ont le droit d'être Maintainer/Owner sur les repos du workspace.</p>
            ${banner}
            <textarea id="wlTextarea" class="wl-textarea" spellcheck="false" placeholder="alice&#10;bob&#10;charlie">${esc(allowlist.usernames.join('\n'))}</textarea>
            <div class="wl-actions">
                <button class="btn-refresh" onclick="onSaveAllowlist()">💾 Enregistrer</button>
                <button class="btn-ghost" onclick="onSeedMaintainers()">➕ Ajouter les Maintainers/Owners actuels</button>
                ${allowlist.updatedAt ? `<span class="wl-meta">MàJ ${esc(allowlist.updatedAt.slice(0, 10))}${allowlist.updatedBy ? ' par @' + esc(allowlist.updatedBy) : ''}</span>` : ''}
            </div>
        </div>`;

    if (!allowlist.usernames.length) {
        view.innerHTML = editor + '<div class="muted" style="padding:20px;">Définis la liste des Maintainers autorisés pour activer la détection des écarts.</div>';
        return;
    }

    const wl = allowedSet();
    const viol = computeViolations(model);
    const demotable = viol.filter(v => v.kind === 'demotable');
    const okAdmins = model.admins.filter(p => wl.has(p.username.toLowerCase()));

    const head = `
        <div class="summary" style="margin-bottom:20px;">
            <div class="summary-card"><div class="summary-label">Admins conformes</div><div class="summary-value">${okAdmins.length}</div><div class="summary-trend trend-flat">Dans la liste</div></div>
            <div class="summary-card"><div class="summary-label">Écarts détectés</div><div class="summary-value" style="color:${viol.length ? '#fca5a5' : '#5eead4'}">${viol.length}</div><div class="summary-trend trend-flat">Hors liste</div></div>
            <div class="summary-card"><div class="summary-label">Corrigeables en 1 clic</div><div class="summary-value">${demotable.length}</div><div class="summary-trend trend-flat">Maintainer direct</div></div>
            <div class="summary-card"><div class="summary-label">À traiter à la main</div><div class="summary-value">${viol.length - demotable.length}</div><div class="summary-trend trend-flat">Owner / hérité</div></div>
        </div>`;

    if (!viol.length) {
        view.innerHTML = editor + head + '<div class="wl-ok">✅ Tous les Maintainers/Owners sont dans la liste blanche. Aucun écart.</div>';
        return;
    }

    const rows = viol.map(v => {
        let action;
        if (v.kind === 'demotable') {
            action = `<button class="btn-danger" onclick="demoteMember(${v.repoId}, ${v.userId})">⬇️ Rétrograder en Developer</button>`;
        } else if (v.kind === 'owner') {
            action = '<span class="viol-manual">Owner — à retirer à la main (un token Maintainer ne peut pas rétrograder un Owner).</span>';
        } else {
            action = '<span class="viol-manual">Accès hérité — à corriger au niveau du groupe parent.</span>';
        }
        return `
            <div class="viol-row">
                <div class="viol-who">
                    <div class="m-name">${esc(v.name)} <span class="role-badge lvl-${v.level}">${esc(v.role)}</span></div>
                    <div class="m-user">@${esc(v.username)} · <span class="chip">${esc(v.repoName)}</span>${v.kind === 'inherited' ? ' <span class="pill pill-inherited">hérité</span>' : ''}</div>
                </div>
                <div class="viol-action">${action}</div>
            </div>`;
    }).join('');

    const bulk = demotable.length
        ? `<div class="wl-bulk"><button class="btn-fix" onclick="fixAllViolations()">🛡️ Tout corriger (${demotable.length} rétrogradation${demotable.length > 1 ? 's' : ''})</button><span class="wl-meta">Ne touche que les Maintainers directs. Owners et accès hérités exclus.</span></div>`
        : '';

    view.innerHTML = editor + head + '<div class="block-title" style="margin-top:6px;">🚩 Écarts à traiter</div>' + bulk + `<div class="viol-list">${rows}</div>`;
}

// ═══════════════════════════════════════════════════
// HISTORIQUE DU MOIS (accès & rôles)
// ───────────────────────────────────────────────────
// Deux sources selon l'édition GitLab du repo :
//  1) AUDIT EVENTS (/audit_events) — Premium+ : ajouts, changements de
//     rôle, retraits, changements d'expiration, avec l'auteur.
//  2) Fallback ÉVÉNEMENTS (/events?action=joined|left) — toutes éditions :
//     uniquement les arrivées / départs (pas les changements de rôle).
// ═══════════════════════════════════════════════════

const HIST_ICON = { added: '➕', joined: '➕', removed: '➖', left: '➖', role: '🔄', expiration: '⏳' };

async function loadHistory() {
    historyLoaded = true;
    const view = document.getElementById('historyView');
    view.innerHTML = '<div class="loading" style="padding:40px;"><div class="spinner"></div><p>Lecture des mouvements d\'accès du mois…</p></div>';

    const afterISO = daysAgoISO(30);
    const afterDate = afterISO.slice(0, 10);
    const tasks = currentWorkspace.repositories.map(r => () => fetchRepoHistory(r, afterISO, afterDate));
    const settled = await window.Salsifi.runWithConcurrency(tasks, 5);
    const results = settled.map(s => s.status === 'fulfilled' ? s.value : null).filter(Boolean);
    renderHistory(results);
}

async function fetchRepoHistory(repo, afterISO, afterDate) {
    // 1) Tente les Audit Events (probe léger per_page=1 pour tester l'accès).
    let probe = null;
    try {
        probe = await window.Salsifi.gitlabFetch(
            GITLAB_URL, token,
            `/projects/${repo.id}/audit_events?created_after=${encodeURIComponent(afterISO)}&per_page=1`
        );
    } catch { probe = null; }

    if (probe && probe.ok) {
        const events = await window.Salsifi.gitlabPaginate(
            GITLAB_URL, token,
            `/projects/${repo.id}/audit_events?created_after=${encodeURIComponent(afterISO)}`,
            { maxPages: 5 }
        ).catch(() => []);
        return { repo, mode: 'audit', entries: parseAuditEvents(repo, events) };
    }

    // 2) Fallback CE : arrivées / départs via l'API Events.
    try {
        const [joined, left] = await Promise.all([
            window.Salsifi.gitlabPaginate(GITLAB_URL, token, `/projects/${repo.id}/events?action=joined&after=${afterDate}`, { maxPages: 5 }),
            window.Salsifi.gitlabPaginate(GITLAB_URL, token, `/projects/${repo.id}/events?action=left&after=${afterDate}`, { maxPages: 5 })
        ]);
        return { repo, mode: 'events', entries: parseCeEvents(repo, joined, left) };
    } catch {
        return { repo, mode: 'error', entries: [] };
    }
}

// Ne garde que les événements d'audit liés à l'appartenance / aux droits.
// Robuste aux variantes de format GitLab : champs structurés (add/change/
// remove + from/to) OU message libre `custom_message` selon la version.
function parseAuditEvents(repo, events) {
    const out = [];
    for (const e of events) {
        const d = e.details || {};
        const at = e.created_at;
        const actor = d.author_name || null;
        const subject = d.target_details || d.target_id || '?';
        const isUser = d.target_type === 'User' || d.target_type === 'Member' || !d.target_type;
        const cm = String(d.custom_message || '').toLowerCase();

        if (d.change === 'access_level' || d.change === 'access level' || (isUser && cm.includes('access level'))) {
            // Changement de rôle : le cœur de ce que l'équipe veut suivre.
            const text = (d.from || d.to)
                ? `rôle ${d.from || '?'} → ${d.to || '?'}`
                : (d.custom_message || 'changement de rôle');
            out.push({ at, repo: repo.name, actor, subject, kind: 'role', text });
        } else if (d.add === 'user_access' || (isUser && cm.includes('added user'))) {
            out.push({ at, repo: repo.name, actor, subject, kind: 'added', text: d.as ? `ajouté comme ${d.as}` : (d.custom_message || 'ajouté au projet') });
        } else if (d.remove === 'user_access' || (isUser && cm.includes('removed user'))) {
            out.push({ at, repo: repo.name, actor, subject, kind: 'removed', text: d.custom_message || 'retiré du projet' });
        } else if (d.change === 'expiration_date' || d.change === 'expiry' || (isUser && cm.includes('expiration'))) {
            out.push({ at, repo: repo.name, actor, subject, kind: 'expiration', text: `expiration ${d.from || '∅'} → ${d.to || '∅'}` });
        }
        // les autres audit events (paramètres, CI…) sont ignorés : hors périmètre accès.
    }
    return out;
}

function parseCeEvents(repo, joined, left) {
    const out = [];
    for (const e of joined || []) {
        out.push({ at: e.created_at, repo: repo.name, actor: null, subject: (e.author && e.author.name) || '?', kind: 'joined', text: 'a rejoint le projet' });
    }
    for (const e of left || []) {
        out.push({ at: e.created_at, repo: repo.name, actor: null, subject: (e.author && e.author.name) || '?', kind: 'left', text: 'a quitté le projet' });
    }
    return out;
}

const HIST_FILTERS = [['all', 'Tout'], ['role', '🔄 Changements de rôle'], ['membership', '➕➖ Arrivées / départs']];
function histFilterBar() {
    return '<div class="filter-bar">' + HIST_FILTERS.map(([v, l]) =>
        `<button class="filter-chip${historyFilter === v ? ' is-active' : ''}" onclick="setHistoryFilter('${v}')">${l}</button>`).join('') + '</div>';
}
function setHistoryFilter(f) { historyFilter = f; if (lastHistory) renderHistory(lastHistory); }
function histMatch(kind) {
    if (historyFilter === 'role') return kind === 'role' || kind === 'expiration';
    if (historyFilter === 'membership') return kind === 'added' || kind === 'removed' || kind === 'joined' || kind === 'left';
    return true;
}

function renderHistory(results) {
    lastHistory = results;
    const view = document.getElementById('historyView');
    const auditRepos = results.filter(r => r.mode === 'audit').length;
    const eventsOnly = results.filter(r => r.mode === 'events').length;
    const errored = results.filter(r => r.mode === 'error').length;

    // Indicateur de couverture : dit d'emblée si les changements de rôle sont suivis chez toi.
    let banner = `<div class="hist-note">${auditRepos
        ? `🔄 Changements de rôle suivis sur <b>${auditRepos} repo(s)</b> (Audit Events).`
        : '🔄 Changements de rôle <b>non disponibles</b> : aucun repo ne donne accès aux Audit Events (édition CE ou droits insuffisants).'}${eventsOnly ? ` ➕➖ Arrivées/départs seulement sur <b>${eventsOnly} repo(s)</b> en CE.` : ''}</div>`;
    if (!auditRepos) {
        banner += '<div class="hist-note">ℹ️ Sur un repo CE, GitLab n\'expose <b>aucun</b> historique de changement de rôle. Pour l\'obtenir malgré tout, il faudra photographier les rôles dans le temps (snapshot-service) et comparer.</div>';
    }
    if (errored) {
        banner += `<div class="repo-errors">⚠️ ${errored} repo(s) : historique non lisible (droits insuffisants).</div>`;
    }
    banner += histFilterBar();

    const all = results.flatMap(r => r.entries).filter(e => e.at && histMatch(e.kind));
    all.sort((a, b) => new Date(b.at) - new Date(a.at));

    if (!all.length) {
        const what = historyFilter === 'role' ? 'changement de rôle' : historyFilter === 'membership' ? 'arrivée/départ' : 'mouvement d\'accès';
        view.innerHTML = banner + `<div class="muted" style="padding:20px;">Aucun ${what} sur les 30 derniers jours.</div>`;
        return;
    }

    // Regroupe par jour (du plus récent au plus ancien).
    const groups = {};
    for (const en of all) {
        const day = en.at.slice(0, 10);
        (groups[day] || (groups[day] = [])).push(en);
    }
    const days = Object.keys(groups).sort().reverse();

    const body = days.map(day => {
        const rows = groups[day].map(en => {
            const icon = HIST_ICON[en.kind] || '•';
            const time = new Date(en.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            return `
                <div class="hist-row">
                    <div class="hist-icon">${icon}</div>
                    <div class="hist-body">
                        <div class="hist-line"><b>${esc(en.subject)}</b> ${esc(en.text)} <span class="chip">${esc(en.repo)}</span></div>
                        <div class="hist-meta">${time}${en.actor ? ' · par ' + esc(en.actor) : ''}</div>
                    </div>
                </div>`;
        }).join('');
        return `<div class="hist-day"><div class="hist-day-label">${formatDay(day)}</div>${rows}</div>`;
    }).join('');

    view.innerHTML = banner + `<div class="hist-timeline">${body}</div>`;
}

function formatDay(day) {
    const d = new Date(day + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ───── Export CSV ─────────────────────────────────────────────────────
function exportCsv() {
    if (!lastModel) return;
    const rows = [['repo', 'personne', 'username', 'role', 'niveau', 'origine', 'expire_le', 'etat']];
    for (const r of lastModel.repos) {
        for (const m of r.members) {
            rows.push([
                r.name, m.name, m.username, m.role, m.access_level,
                m.inherited ? 'hérité' : 'direct',
                m.expires_at ? m.expires_at.slice(0, 10) : '', m.state || ''
            ]);
        }
    }
    const csv = rows.map(r => r.map(cell => {
        const s = String(cell ?? '');
        return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (currentWorkspace.name || 'workspace').replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `acces-roles-${safe}-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✓ Export CSV téléchargé');
}
