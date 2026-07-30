/* access-workspace · compute.js — logique pure (calculs, helpers). */

function daysAgoISO(d) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString(); }


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

    // Vue « par identité » (dédup username) pour le chemin d'attaque.
    const byUser = new Map();
    for (const p of pairs) {
        const cur = byUser.get(p.m.username) || { maxLevel: 0 };
        if (p.m.access_level > cur.maxLevel) cur.maxLevel = p.m.access_level;
        byUser.set(p.m.username, cur);
    }
    const distinctPeople = byUser.size;
    const distinctAdmins = [...byUser.values()].filter(x => x.maxLevel >= 40).length;
    const adminPeoplePct = distinctPeople ? Math.round((distinctAdmins / distinctPeople) * 100) : 0;
    const blockedAdmin = blocked.filter(p => p.m.access_level >= 40);

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

    return { total, inherited, noExpiry, blocked, blockedAdmin, ownersPairs, service, serviceHigh, serviceOwner, findings, pct,
        distinctOwners: new Set(ownersPairs.map(p => p.m.username)),
        distinctPeople, distinctAdmins, adminPeoplePct,
        errored: model.errored };
}

// Lecture « chemin d'attaque » — traduit les chiffres en risque concret.
// Réutilisée à l'écran ET dans le rapport téléchargé (mêmes phrases).

function parseAllowlistValue(str) {
    try {
        const j = JSON.parse(str);
        if (Array.isArray(j)) return { usernames: j, updatedBy: null, updatedAt: null };
        return { usernames: Array.isArray(j.usernames) ? j.usernames : [], updatedBy: j.updatedBy || null, updatedAt: j.updatedAt || null };
    } catch { return null; }
}

// Lit une variable projet GitLab (null si absente / non lisible).

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


function formatDay(day) {
    const d = new Date(day + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ───── Export CSV ─────────────────────────────────────────────────────
