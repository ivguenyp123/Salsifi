/* insights · data.js — I/O (auth, fetch). */

// ════════════════════════════════════════════════════════════
//  API
// ════════════════════════════════════════════════════════════
// Wrapper fetch avec retry simple sur 429 (rate-limit GitLab).
// Aligné sur le pattern hub-mockup-v2_1 (auth + repo picker partagés).

async function api(endpoint, params = {}) {
    const url = new URL(`${GITLAB_URL}/api/v4${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    let res = await fetch(url, { headers: { 'PRIVATE-TOKEN': token } });
    if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After')) || 2;
        console.warn(`[api] 429 sur ${endpoint}, retry dans ${retryAfter}s`);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        res = await fetch(url, { headers: { 'PRIVATE-TOKEN': token } });
    }
    if (!res.ok) throw new Error(`API ${endpoint} → ${res.status}`);
    return res.json();
}

// ════════════════════════════════════════════════════════════
//  API PAGINÉE — récupère toutes les pages
// ════════════════════════════════════════════════════════════

async function apiAll(endpoint, params = {}) {
    let results = [];
    let page = 1;
    const perPage = 100;
    while (page <= 50) { // garde-fou : 50 pages × 100 = 5000 résultats max
        const url = new URL(`${GITLAB_URL}/api/v4${endpoint}`);
        url.searchParams.set('per_page', perPage);
        url.searchParams.set('page', page);
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
        let res = await fetch(url, { headers: { 'PRIVATE-TOKEN': token } });
        if (res.status === 429) {
            const retryAfter = parseInt(res.headers.get('Retry-After')) || 2;
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            res = await fetch(url, { headers: { 'PRIVATE-TOKEN': token } });
        }
        if (!res.ok) {
            if (page === 1) throw new Error(`API ${endpoint} → ${res.status}`);
            break;
        }
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        results = results.concat(data);
        if (data.length < perPage) break;
        page++;
    }
    return results;
}

// Échappement HTML systématique pour les valeurs venant de l'API ou de sessionStorage.

async function loadData() {
    try {
        const now = new Date();
        const d30 = new Date(now);
        d30.setDate(d30.getDate() - 30);
        const since = d30.toISOString();

        // Fetch en parallèle. On récupère aussi le projet pour lire `default_branch`.
        const [pipelines, mergeRequests, branches, contributors, project] = await Promise.all([
            apiAll(`/projects/${projectId}/pipelines`, { updated_after: since }).catch(() => []),
            apiAll(`/projects/${projectId}/merge_requests`, { state: 'all', updated_after: since }).catch(() => []),
            apiAll(`/projects/${projectId}/repository/branches`).catch(() => []),
            apiAll(`/projects/${projectId}/repository/contributors`).catch(() => []),
            api(`/projects/${projectId}`).catch(() => null)
        ]);

        // Branche principale du repo (peut être autre chose que main/master selon l'équipe).
        // Utilisée pour CFR et MTTR, qui se basent sur les "vraies" livraisons prod.
        const defaultBranch = project?.default_branch || null;

        // Pipelines réellement créés dans la fenêtre 30j (updated_after≠created_after côté API)
        const pipelines30 = pipelines.filter(p => new Date(p.created_at) >= d30);

        // Enrichir les MRs mergées récentes avec changes_count via /:iid/changes (fix bigMRs).
        // Limité aux 20 dernières MRs mergées pour rester raisonnable en N+1.
        const recentMerged = mergeRequests
            .filter(m => m.state === 'merged' && m.merged_at)
            .sort((a, b) => new Date(b.merged_at) - new Date(a.merged_at))
            .slice(0, 20);
        const changesDetails = await Promise.all(
            recentMerged.map(mr =>
                api(`/projects/${projectId}/merge_requests/${mr.iid}/changes`)
                    .then(d => ({ iid: mr.iid, files: d?.changes?.length || 0 }))
                    .catch(() => ({ iid: mr.iid, files: 0 }))
            )
        );
        const filesByIid = Object.fromEntries(changesDetails.map(c => [c.iid, c.files]));
        // On replace `changes_count` (peu fiable) par `files_count` calculé.
        mergeRequests.forEach(mr => {
            if (filesByIid[mr.iid] !== undefined) mr.files_count = filesByIid[mr.iid];
        });

        document.getElementById('loadingContainer').style.display = 'none';
        document.getElementById('dashboardContent').style.display = 'block';
        document.getElementById('exportBtn').style.display = 'block';

        // Calcul DORA maison
        const doraValues = computeDORA(pipelines30, mergeRequests, pipelines, now, defaultBranch);

        // Données repo pour le diagnostic « chez toi, concrètement » du coach
        // (les Quick Wins ont été repliés dans le Coach Salsi, plus travaillés).
        _doraRepo = { raw: doraValues, pipelines30, mergeRequests, branches, contributors };

        // Render
        _doraState = renderDoraCards(doraValues);
        const scoreInfo = renderGlobalScore(_doraState);
        renderDoraCompanion(doraValues, _doraState, scoreInfo);
        renderEvolutionChart(pipelines30, mergeRequests);

    } catch (err) {
        console.error(err);
        showError(`Erreur de chargement : ${err.message}`);
    }
}
