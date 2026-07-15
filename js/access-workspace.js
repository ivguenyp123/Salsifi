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
let lastModel = null;   // dernier modèle calculé (pour export / re-render)

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
}

async function init() {
    const _auth = window.Salsifi.loadAuth({ redirect: false });
    if (!_auth) {
        return showError('Non connecté. Ouvre le hub et connecte-toi d\'abord. <br><a href="' + HUB_URL + '" style="color:#a78bfa;">← Retour au hub</a>');
    }
    GITLAB_URL = _auth.gitlabUrl;
    token = _auth.token;

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
    renderReposView(model.repos, model.errored);
    renderPeopleTable(model.peopleList);
    renderAdmins(model.admins);
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
    let html = '';
    if (errored.length) {
        html += `<div class="repo-errors">⚠️ ${errored.length} repo(s) non lisibles (droits insuffisants ou introuvables) : ` +
            errored.map(r => esc(r.name)).join(', ') + '</div>';
    }
    html += repos.map(r => {
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
    document.getElementById('peopleTableBody').innerHTML = people.map(p => {
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
