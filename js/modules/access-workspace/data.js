/* access-workspace · data.js — I/O (auth, fetch). */

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
