// ════════════════════════════════════════════════════════════
//  CONFIG & STATE
// ════════════════════════════════════════════════════════════
let GITLAB_URL = null;
let token = null;
let projectId = null;
let _charts = {};
let _doraState = {};

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════
function init() {
    // Nouveau format hub : localStorage 'devops_hub_workspaces' (JSON) + 'hub_selected_repo_id'
    // Auth centralisee (devops_hub_workspaces + fallback sessionStorage legacy)
    const _auth = window.Salsifi.loadAuth({ redirect: false });
    if (_auth) { token = _auth.token; GITLAB_URL = _auth.gitlabUrl; }

    // Project ID : nouveau format puis ancien
    const selectedRepoId = localStorage.getItem('hub_selected_repo_id');
    projectId = selectedRepoId || sessionStorage.getItem('gitlab_project_id');

    if (!token || !GITLAB_URL) {
        showError('Token ou URL GitLab manquant. Retourne au hub pour te connecter.');
        return;
    }
    if (!projectId) {
        showError('Aucun projet sélectionné. Retourne au hub pour choisir un projet.');
        return;
    }

    // Tenter de retrouver le nom du projet depuis le cache des repos du hub
    let projectName = sessionStorage.getItem('gitlab_project');
    if (!projectName && _auth) {
        try {
            const cacheKey = 'hub_cache_repos_' + (_auth.username || '');
            const cacheRaw = localStorage.getItem(cacheKey);
            if (cacheRaw) {
                const cache = JSON.parse(cacheRaw);
                const found = cache.repos && cache.repos.find(r => String(r.id) === String(projectId));
                if (found) projectName = found.name;
            }
        } catch { /* ignore */ }
    }
    document.getElementById('projectName').textContent = projectName || `Projet #${projectId}`;

    // Bouton export branché en event delegation (plus de onclick inline).
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportReport);
    loadData();
}

function showError(msg) {
    document.getElementById('loadingContainer').style.display = 'none';
    document.getElementById('errorContainer').innerHTML =
        `<div class="error-message">❌ ${msg}</div>`;
}

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
function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }

// ════════════════════════════════════════════════════════════
//  LOAD ALL DATA
// ════════════════════════════════════════════════════════════
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

        // Render
        _doraState = renderDoraCards(doraValues);
        renderGlobalScore(_doraState);
        renderEvolutionChart(pipelines30, mergeRequests);
        generateQuickWins(_doraState, doraValues, pipelines30, mergeRequests, branches, contributors);

    } catch (err) {
        console.error(err);
        showError(`Erreur de chargement : ${err.message}`);
    }
}

// ════════════════════════════════════════════════════════════
//  CALCUL DORA MAISON
// ════════════════════════════════════════════════════════════
function computeDORA(pipelines30, mergeRequests, allPipelines, nowRef, defaultBranch) {
    const now = nowRef || new Date();
    const d30 = new Date(now);
    d30.setDate(d30.getDate() - 30);

    // Branches considérées "production" pour CFR et MTTR :
    // - main / master (universel)
    // - + default_branch du projet si différent (ex : `production`, `release`)
    const prodBranches = new Set(['main', 'master']);
    if (defaultBranch) prodBranches.add(defaultBranch);

    // ── Deployment Frequency ──
    // Contrainte courante GitLab : pas toujours de tag d'environnement fiable sur les pipelines.
    // On prend TOUS les pipelines success comme proxy de la fréquence de déploiement,
    // déduplé par SHA (un commit qui déclenche 3 pipelines compte 1 fois).
    const successByCommit = {};
    pipelines30.forEach(p => {
        if (p.status !== 'success' || !p.sha) return;
        const existing = successByCommit[p.sha];
        if (!existing || new Date(p.created_at) > new Date(existing.created_at)) {
            successByCommit[p.sha] = p;
        }
    });
    const successPipelines = Object.values(successByCommit);
    // + pipelines success sans SHA (cas rare, on les garde pour ne pas perdre de signal)
    pipelines30.forEach(p => {
        if (p.status === 'success' && !p.sha) successPipelines.push(p);
    });

    const df = parseFloat(((successPipelines.length / 30) * 7).toFixed(2));

    // ── Lead Time for Changes ──
    // first_commit_at → merged_at sur MRs mergées dans les 30j
    const mergedMRs = mergeRequests.filter(mr =>
        mr.state === 'merged' &&
        mr.merged_at &&
        new Date(mr.merged_at) >= d30
    );

    let lt = null;
    if (mergedMRs.length > 0) {
        const leadTimes = mergedMRs
            .filter(mr => mr.first_commit_at || mr.created_at)
            .map(mr => {
                const start = new Date(mr.first_commit_at || mr.created_at);
                const end   = new Date(mr.merged_at);
                return (end - start) / 3600000; // → heures
            })
            .filter(v => v > 0 && v < 8760); // exclut les temps > 1 an (erreurs de données)

        if (leadTimes.length > 0) {
            // Médiane (plus robuste que la moyenne pour le lead time)
            leadTimes.sort((a, b) => a - b);
            const mid = Math.floor(leadTimes.length / 2);
            if (leadTimes.length % 2 === 0) {
                lt = parseFloat(((leadTimes[mid - 1] + leadTimes[mid]) / 2).toFixed(1));
            } else {
                lt = parseFloat(leadTimes[mid].toFixed(1));
            }
        }
    }

    // ── Change Failure Rate multi-fenêtres pondérées ──
    // Limité aux branches "production" (main/master + default_branch), minimum 5 pipelines.
    // Pas de dedupe SHA ici : chaque tentative est une chance de production.
    const prodPipelines30cfr = pipelines30.filter(p => prodBranches.has(p.ref));
    const totalP = prodPipelines30cfr.length;
    const cfrInsufficient = totalP > 0 && totalP < 5;
    const failedP = prodPipelines30cfr.filter(p => p.status === 'failed').length;

    let cfr = null;
    let cfrTrend = null;
    let cfr30 = null, cfr10 = null, cfr5 = null;

    if (totalP >= 5) {
        const nowMs = now.getTime();

        // ── CFR 30j pondéré (J0-9=2x, J10-19=1.5x, J20-29=1x) ──
        let w30f = 0, w30t = 0;
        prodPipelines30cfr.forEach(p => {
            const age = (nowMs - new Date(p.created_at).getTime()) / 86400000;
            const w = age <= 10 ? 2 : age <= 20 ? 1.5 : 1;
            w30t += w;
            if (p.status === 'failed') w30f += w;
        });
        cfr30 = parseFloat(((w30f / w30t) * 100).toFixed(1));

        // ── CFR 10j pondéré (J0-4=2x, J5-9=1.5x) ──
        const p10 = prodPipelines30cfr.filter(p => (nowMs - new Date(p.created_at).getTime()) / 86400000 <= 10);
        if (p10.length >= 3) {
            let w10f = 0, w10t = 0;
            p10.forEach(p => {
                const age = (nowMs - new Date(p.created_at).getTime()) / 86400000;
                const w = age <= 5 ? 2 : 1.5;
                w10t += w;
                if (p.status === 'failed') w10f += w;
            });
            cfr10 = parseFloat(((w10f / w10t) * 100).toFixed(1));
        }

        // ── CFR 5j pondéré (J0-2=2x, J3-4=1.5x) ──
        const p5 = prodPipelines30cfr.filter(p => (nowMs - new Date(p.created_at).getTime()) / 86400000 <= 5);
        if (p5.length >= 2) {
            let w5f = 0, w5t = 0;
            p5.forEach(p => {
                const age = (nowMs - new Date(p.created_at).getTime()) / 86400000;
                const w = age <= 2 ? 2 : 1.5;
                w5t += w;
                if (p.status === 'failed') w5f += w;
            });
            cfr5 = parseFloat(((w5f / w5t) * 100).toFixed(1));
        }

        // ── Score final pondéré : 5j=50%, 10j=30%, 30j=20% ──
        let totalWeight = 0.2;
        let weightedCfr = cfr30 * 0.2;
        if (cfr10 !== null) { weightedCfr += cfr10 * 0.3; totalWeight += 0.3; }
        if (cfr5  !== null) { weightedCfr += cfr5  * 0.5; totalWeight += 0.5; }
        cfr = parseFloat((weightedCfr / totalWeight).toFixed(1));

        // ── Tendance : direction 5j vs 30j ──
        if (cfr5 !== null) {
            if (cfr5 < cfr30 - 5)      cfrTrend = 'down';
            else if (cfr5 > cfr30 + 5) cfrTrend = 'up';
            else                        cfrTrend = 'stable';
        } else if (cfr10 !== null) {
            if (cfr10 < cfr30 - 5)      cfrTrend = 'down';
            else if (cfr10 > cfr30 + 5) cfrTrend = 'up';
            else                         cfrTrend = 'stable';
        }
    }

    // ── Time to Restore Service ──
    // Séquences failed → success sur branches prod uniquement.
    // Cap à 7j : un pipeline cassé une semaine est de toute façon hors-norme
    // et pourrirait la médiane. On le considère comme "non récupéré sur la fenêtre".
    const MTTR_CAP_HOURS = 24 * 7;
    const prodPipelines30 = [...pipelines30]
        .filter(p => prodBranches.has(p.ref))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    let mttr = null;
    const mttrInsufficient = prodPipelines30.length > 0 && prodPipelines30.length < 5;
    if (prodPipelines30.length >= 5) {
        const restoreTimes = [];
        for (let i = 0; i < prodPipelines30.length - 1; i++) {
            const p = prodPipelines30[i];
            if (p.status !== 'failed') continue;
            // Un incident = une SÉRIE de failed jusqu'au prochain success. On ne démarre
            // le chrono qu'à la première panne : si le dernier pipeline de la même ref
            // était déjà failed, on est encore dans le même incident (déjà comptabilisé)
            // — sinon F1,F2,S produisait 2 échantillons et biaisait la médiane vers le bas.
            const prevSameRef = prodPipelines30.slice(0, i).reverse().find(n => n.ref === p.ref);
            if (prevSameRef && prevSameRef.status === 'failed') continue;
            const next = prodPipelines30.slice(i + 1).find(n => n.ref === p.ref && n.status === 'success');
            if (next) {
                const hours = (new Date(next.created_at) - new Date(p.created_at)) / 3600000;
                if (hours > 0 && hours <= MTTR_CAP_HOURS) restoreTimes.push(hours);
                // Si > 7j : ignoré (ni compté comme valeur extrême ni comme non-récupéré).
            }
        }
        if (restoreTimes.length > 0) {
            restoreTimes.sort((a, b) => a - b);
            const mid = Math.floor(restoreTimes.length / 2);
            if (restoreTimes.length % 2 === 0) {
                mttr = parseFloat(((restoreTimes[mid - 1] + restoreTimes[mid]) / 2).toFixed(1));
            } else {
                mttr = parseFloat(restoreTimes[mid].toFixed(1));
            }
        }
    }

    return {
        df, lt, cfr, cfr30, cfr10, cfr5, cfrTrend, mttr,
        successPipelines, mergedMRs, failedP, totalP,
        cfrInsufficient, mttrInsufficient,
        prodPipelines30Length: prodPipelines30.length,
        prodBranches: Array.from(prodBranches),
        defaultBranch
    };
}

// ════════════════════════════════════════════════════════════
//  DORA LEVELS
// ════════════════════════════════════════════════════════════
function doraLevel(metric, value) {
    if (value === null || value === undefined) return { level: 'N/A', cls: '', pct: 0, gap: null };

    if (metric === 'df') {
        // déploiements/semaine
        if (value >= 7)   return { level: 'Elite',  cls: 'elite',  pct: 100, gap: null };
        if (value >= 1)   return { level: 'High',   cls: 'high',   pct: 70,  gap: `+${(7 - value).toFixed(1)} deploy/sem pour Elite` };
        if (value >= 0.25)return { level: 'Medium', cls: 'medium', pct: 40,  gap: `+${(7 - value).toFixed(1)} deploy/sem pour Elite` };
        return              { level: 'Low',    cls: 'low',    pct: 15,  gap: `+${(7 - value).toFixed(1)} deploy/sem pour Elite` };
    }
    if (metric === 'lt') {
        // heures — seuils DORA Accelerate 2024 alignés sur hub.html
        // Elite < 1 jour, High < 1 semaine, Medium < 1 mois
        if (value <= 24)  return { level: 'Elite',  cls: 'elite',  pct: 100, gap: null };
        if (value <= 168) return { level: 'High',   cls: 'high',   pct: 70,  gap: `Encore ${(value - 24).toFixed(0)}h à gagner pour Elite` };
        if (value <= 720) return { level: 'Medium', cls: 'medium', pct: 40,  gap: `${(value - 24).toFixed(0)}h à réduire pour Elite` };
        return              { level: 'Low',    cls: 'low',    pct: 15,  gap: `${(value - 24).toFixed(0)}h à réduire pour Elite` };
    }
    if (metric === 'cfr') {
        // %
        if (value <= 5)   return { level: 'Elite',  cls: 'elite',  pct: 100, gap: null };
        if (value <= 10)  return { level: 'High',   cls: 'high',   pct: 65,  gap: `Encore ${(value - 5).toFixed(0)}% à réduire pour Elite` };
        if (value <= 15)  return { level: 'Medium', cls: 'medium', pct: 35,  gap: `${(value - 5).toFixed(0)}% à réduire pour Elite` };
        return              { level: 'Low',    cls: 'low',    pct: 15,  gap: `${(value - 5).toFixed(0)}% à réduire pour Elite` };
    }
    if (metric === 'mttr') {
        // heures
        if (value <= 1)   return { level: 'Elite',  cls: 'elite',  pct: 100, gap: null };
        if (value <= 24)  return { level: 'High',   cls: 'high',   pct: 70,  gap: `Encore ${(value - 1).toFixed(0)}h à gagner pour Elite` };
        if (value <= 168) return { level: 'Medium', cls: 'medium', pct: 40,  gap: `${(value - 1).toFixed(0)}h à réduire pour Elite` };
        return              { level: 'Low',    cls: 'low',    pct: 15,  gap: `${(value - 1).toFixed(0)}h à réduire pour Elite` };
    }
    return { level: 'N/A', cls: '', pct: 0, gap: null };
}

// ════════════════════════════════════════════════════════════
//  RENDER DORA CARDS
// ════════════════════════════════════════════════════════════
function renderDoraCards(v) {
    const state = {};

    function renderCard(id, metric, value, displayVal, naReason, trendHtml) {
        const lvl = doraLevel(metric, value);
        state[metric] = value;
        state[metric + 'Level'] = lvl;

        const valEl  = document.getElementById(id);
        const badgeEl= document.getElementById(id + '-badge');
        const progEl = document.getElementById(id + '-progress');
        const actEl  = document.getElementById(id + '-action');

        valEl.innerHTML = displayVal + (trendHtml || '');

        if (lvl.level === 'N/A') {
            badgeEl.innerHTML = naReason
                ? `<div class="na-reason">${naReason}</div>`
                : '<span class="dora-badge">N/A</span>';
            if (progEl) progEl.innerHTML = '';
            if (actEl) actEl.classList.remove('show');
            return;
        }
        const icons = { Elite: '🟢', High: '🔵', Medium: '🟡', Low: '🔴' };
        badgeEl.innerHTML = `<span class="dora-badge ${lvl.cls}">${icons[lvl.level]} ${lvl.level}</span>`;

        if (lvl.gap) {
            progEl.innerHTML = `
                <div class="elite-bar"><div class="elite-fill ${lvl.cls}" style="width:${lvl.pct}%"></div></div>
                <div class="elite-msg"><strong>${lvl.gap}</strong></div>`;
            if (actEl) actEl.classList.add('show');
        } else {
            progEl.innerHTML = `
                <div class="elite-bar"><div class="elite-fill elite" style="width:100%"></div></div>
                <div class="elite-msg">🏆 <strong>Niveau Elite atteint !</strong></div>`;
            if (actEl) actEl.classList.remove('show');
        }
    }

    // DF — affichage /sem
    const dfDisplay = v.df !== null ? `${v.df}/sem` : 'N/A';
    renderCard('deployFrequency', 'df', v.df, dfDisplay);

    // LT — affichage heures ou jours
    let ltDisplay = 'N/A';
    if (v.lt !== null) {
        ltDisplay = v.lt >= 24 ? `${(v.lt / 24).toFixed(1)}j` : `${v.lt}h`;
    }
    renderCard('leadTime', 'lt', v.lt, ltDisplay);

    // CFR
    const cfrDisplay = v.cfr !== null ? `${v.cfr}%` : 'N/A';

    // ── Tendance récente (honnête, sans écraser le badge) ──
    // Le badge, le % de la carte, le résumé DORA et les quick-wins reflètent TOUS le même
    // CFR de la fenêtre (v.cfr). Avant, un « plancher de tendance » gonflait en silence le
    // badge/niveau (badge Elite sur un chiffre affiché à 12 %, et 3 valeurs différentes
    // entre la carte, le résumé DORA et les quick-wins). Si la fenêtre récente (5j) est à
    // un meilleur niveau DORA, on l'annonce désormais EXPLICITEMENT à côté du badge.
    let cfrRecentNote = '';
    if (v.cfr !== null && v.cfr5 !== null) {
        const order = { 'low': 0, 'medium': 1, 'high': 2, 'elite': 3 };
        const lvl5 = doraLevel('cfr', v.cfr5);
        const lvlFinal = doraLevel('cfr', v.cfr);
        if (order[lvl5.cls] > order[lvlFinal.cls]) {
            cfrRecentNote = ` <span style="color:#6ee7b7;font-size:12px">· tendance 5j : ${lvl5.level}</span>`;
        }
    }

    const cfrWindows = v.cfr !== null ? `
        <div style="display:flex;gap:10px;margin-top:8px;margin-bottom:4px">
            <div style="flex:1;background:rgba(255,255,255,0.08);border-radius:8px;padding:6px 10px;text-align:center">
                <div style="font-size:10px;opacity:0.6;margin-bottom:2px">30j</div>
                <div style="font-size:14px;font-weight:700;color:#fca5a5">${v.cfr30 !== null ? v.cfr30+'%' : 'N/A'}</div>
            </div>
            <div style="flex:1;background:rgba(255,255,255,0.08);border-radius:8px;padding:6px 10px;text-align:center">
                <div style="font-size:10px;opacity:0.6;margin-bottom:2px">10j</div>
                <div style="font-size:14px;font-weight:700;color:#fca5a5">${v.cfr10 !== null ? v.cfr10+'%' : '—'}</div>
            </div>
            <div style="flex:1;background:rgba(255,255,255,0.08);border-radius:8px;padding:6px 10px;text-align:center">
                <div style="font-size:10px;opacity:0.6;margin-bottom:2px">5j</div>
                <div style="font-size:14px;font-weight:700;color:#fca5a5">${v.cfr5 !== null ? v.cfr5+'%' : '—'}</div>
            </div>
        </div>` : '';
    const cfrTrendHtml = (v.cfrTrend === 'down'   ? ' <span style="color:#6ee7b7;font-size:13px">↘️ en amélioration</span>'
                        : v.cfrTrend === 'up'     ? ' <span style="color:#fca5a5;font-size:13px">↗️ en dégradation</span>'
                        : v.cfrTrend === 'stable' ? ' <span style="opacity:0.5;font-size:13px">→ stable</span>'
                        : '') + cfrRecentNote + cfrWindows;
    const cfrNaReason = v.cfr === null
        ? (v.cfrInsufficient
            ? `⚠️ Pas assez de livraisons sur main/master (${v.totalP} pipeline${v.totalP > 1 ? 's' : ''})`
            : '⚪ Aucun pipeline sur main/master')
        : null;
    renderCard('failureRate', 'cfr', v.cfr, cfrDisplay, cfrNaReason, cfrTrendHtml);

    // MTTR
    const mttrDisplay = v.mttr !== null ? (v.mttr >= 24 ? `${(v.mttr / 24).toFixed(1)}j` : `${v.mttr}h`) : '—';
    const mttrNaReason = v.mttr === null
        ? (v.mttrInsufficient
            ? `⚠️ Pas assez de livraisons sur main/master (${v.prodPipelines30Length || 0} pipeline${(v.prodPipelines30Length || 0) > 1 ? 's' : ''})`
            : (v.totalP === 0
                ? '⚪ Aucun pipeline sur 30j'
                : '✅ Aucun échec pipeline détecté sur 30j'))
        : null;
    renderCard('restoreTime', 'mttr', v.mttr, mttrDisplay, mttrNaReason);

    // Stocker des flags supplémentaires pour le score global
    state._mttrMissing = v.mttr === null;
    state._mttrInsufficient = v.mttrInsufficient;
    state._dfMissing = v.df === null;
    state._ltMissing = v.lt === null;
    state._cfrMissing = v.cfr === null;

    return state;
}

// ════════════════════════════════════════════════════════════
//  SCORE GLOBAL — CORRIGÉ avec gestion correcte du MTTR
// ════════════════════════════════════════════════════════════
function renderGlobalScore(state) {
    const levels = { elite: 100, high: 70, medium: 40, low: 15 };

    const allMetrics = [
        { key: 'df',   label: '🚀 Deploy Freq',  lvl: state.dfLevel,   missing: state._dfMissing   },
        { key: 'lt',   label: '⚡ Lead Time',     lvl: state.ltLevel,   missing: state._ltMissing   },
        { key: 'cfr',  label: '🔧 CFR',           lvl: state.cfrLevel,  missing: state._cfrMissing  },
        { key: 'mttr', label: '⏱️ TTRS',          lvl: state.mttrLevel, missing: state._mttrMissing }
    ];

    const validScores = allMetrics.filter(s => s.lvl && s.lvl.cls);
    const missingMetrics = allMetrics.filter(s => s.missing);

    // Si aucune métrique disponible
    if (validScores.length === 0) {
        document.getElementById('scoreCircle').style.borderColor = '#6b7280';
        document.getElementById('scoreValue').textContent = '—';
        document.getElementById('scoreLevelTitle').textContent = '⚪ Score indisponible';
        document.getElementById('scoreDesc').textContent = 'Aucune donnée suffisante pour calculer un score DORA. Vérifiez vos pipelines et merge requests sur 30 jours.';
        document.getElementById('scoreBreakdown').innerHTML = '';
        return;
    }

    let avg = Math.round(validScores.reduce((s, m) => s + (levels[m.lvl.cls] || 0), 0) / validScores.length);

    // ── PÉNALITÉ MTTR ──
    // Si MTTR est manquant, le score est plafonné à 75 et le niveau "Elite" est interdit
    const mttrIsMissing = state._mttrMissing;
    const penaltyApplied = mttrIsMissing && validScores.length >= 1;
    let finalCls = '';
    let penaltyMessage = '';

    if (penaltyApplied) {
        avg = Math.min(avg, 75);
        const rawCls = avg >= 85 ? 'elite' : avg >= 60 ? 'high' : avg >= 35 ? 'medium' : 'low';
        // Rétrograder d'un cran si Elite
        if (rawCls === 'elite') {
            finalCls = 'high';
            penaltyMessage = '⚠️ Score plafonné à High : les données MTTR sont insuffisantes pour évaluer la résilience. Configurez vos pipelines main/master pour collecter cette métrique.';
        } else {
            finalCls = rawCls;
            penaltyMessage = '⚠️ Score potentiellement surévalué : données MTTR manquantes.';
        }
    } else {
        finalCls = avg >= 85 ? 'elite' : avg >= 60 ? 'high' : avg >= 35 ? 'medium' : 'low';
    }

    // ── PÉNALITÉ AUTRES MÉTRIQUES ──
    // Si plus d'une métrique manquante, score plafonné à 50
    if (missingMetrics.length >= 2) {
        avg = Math.min(avg, 50);
        finalCls = avg >= 60 ? 'high' : avg >= 35 ? 'medium' : 'low';
        if (penaltyMessage) penaltyMessage += ' ';
        penaltyMessage += `⚠️ ${missingMetrics.length} métriques manquantes sur 4 — score limité.`;
    }

    const circle = document.getElementById('scoreCircle');
    const scoreColors = { elite: '#10b981', high: '#3b82f6', medium: '#f59e0b', low: '#ef4444' };
    circle.style.borderColor = scoreColors[finalCls] || '#6b7280';
    document.getElementById('scoreValue').textContent = avg;

    const titles = {
        elite: '🏆 Elite Performer',
        high: '✅ High Performer',
        medium: '📈 Medium Performer',
        low: '⚠️ Low Performer'
    };
    const descs = {
        elite: 'Votre équipe délivre avec excellence. Continuez à surveiller la stabilité.',
        high: 'Bonne performance. Quelques optimisations pour atteindre le niveau Elite.',
        medium: 'Marge de progression significative. Les Quick Wins ci-dessous vous guident.',
        low: 'Des améliorations urgentes sont nécessaires. Commencez par les actions critiques.'
    };

    let titleHtml = titles[finalCls] || '—';
    if (penaltyApplied) {
        titleHtml += ' <span style="background:rgba(239,68,68,0.2);color:#fca5a5;padding:2px 8px;border-radius:8px;font-size:11px;margin-left:8px">⚠️ MTTR manquant</span>';
    }

    document.getElementById('scoreLevelTitle').innerHTML = titleHtml;
    document.getElementById('scoreDesc').textContent = penaltyMessage || descs[finalCls] || '';

    // ── Breakdown avec TOUTES les métriques (y compris les manquantes) ──
    const breakdownHtml = allMetrics.map(m => {
        const lvl = m.lvl;
        const pct = lvl && lvl.cls ? (levels[lvl.cls] || 0) : 0;
        const color = lvl && lvl.cls ? scoreColors[lvl.cls] : '#6b7280';
        const levelName = lvl && lvl.level ? lvl.level : 'N/A';
        const missingBadge = m.missing ? ' <span style="font-size:10px;opacity:0.6">(données insuffisantes)</span>' : '';

        return `<div class="score-row">
            <span class="score-row-label">${m.label}${missingBadge}</span>
            <div class="score-row-bar"><div class="score-row-fill" style="width:${m.missing ? 0 : pct}%;height:100%;border-radius:3px;background:${color}"></div></div>
            <span class="score-row-val" style="color:${color}">${levelName}</span>
        </div>`;
    }).join('');
    document.getElementById('scoreBreakdown').innerHTML = breakdownHtml;
}

// ════════════════════════════════════════════════════════════
//  EVOLUTION CHART
// ════════════════════════════════════════════════════════════
function renderEvolutionChart(pipelines30, mergeRequests) {
    const now = new Date();

    const labels = [], dfData = [], ltData = [];

    // 30 jours, tous les jours (anciennement 1j/2). Chart.js gère sans souci
    // l'affichage condensé pour 30 points et la lisibilité reste bonne.
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }));

        const dayP = pipelines30.filter(p => p.created_at && p.created_at.startsWith(dateStr));
        dfData.push(dayP.filter(p => p.status === 'success').length);

        const dayMRs = mergeRequests.filter(mr =>
            mr.state === 'merged' && mr.merged_at && mr.merged_at.startsWith(dateStr)
        );
        if (dayMRs.length > 0) {
            const ltValues = dayMRs.map(mr => {
                return (new Date(mr.merged_at) - new Date(mr.first_commit_at || mr.created_at)) / 3600000;
            }).filter(v => v > 0 && v < 8760);
            if (ltValues.length > 0) {
                ltValues.sort((a, b) => a - b);
                const mid = Math.floor(ltValues.length / 2);
                if (ltValues.length % 2 === 0) {
                    ltData.push(parseFloat(((ltValues[mid - 1] + ltValues[mid]) / 2).toFixed(1)));
                } else {
                    ltData.push(parseFloat(ltValues[mid].toFixed(1)));
                }
            } else {
                ltData.push(null);
            }
        } else {
            ltData.push(null);
        }
    }

    if (_charts.evolution) _charts.evolution.destroy();
    const ctx = document.getElementById('evolutionChart').getContext('2d');
    _charts.evolution = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Déploiements/jour',
                    data: dfData,
                    borderColor: '#a5b4fc',
                    backgroundColor: 'rgba(165,180,252,0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y',
                    spanGaps: true
                },
                {
                    label: 'Lead Time (h)',
                    data: ltData,
                    borderColor: '#6ee7b7',
                    backgroundColor: 'rgba(110,231,183,0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1',
                    spanGaps: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: 'white', font: { size: 12 } } }
            },
            scales: {
                x: {
                    ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.08)' }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Déploiements', color: 'rgba(255,255,255,0.6)' },
                    ticks: { color: 'rgba(255,255,255,0.6)' },
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    min: 0
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Lead Time (h)', color: 'rgba(255,255,255,0.6)' },
                    ticks: { color: 'rgba(255,255,255,0.6)' },
                    grid: { drawOnChartArea: false },
                    min: 0
                }
            }
        }
    });
}

// ════════════════════════════════════════════════════════════
//  QUICK WINS — branchés sur les résultats réels
// ════════════════════════════════════════════════════════════
function generateQuickWins(state, raw, pipelines30, mergeRequests, branches, contributors) {
    const wins = [];
    const pp   = Array.isArray(pipelines30) ? pipelines30 : [];
    const mrs  = Array.isArray(mergeRequests) ? mergeRequests : [];
    const br   = Array.isArray(branches) ? branches : [];
    const contrib = Array.isArray(contributors) ? contributors : [];
    const now  = Date.now();

    const dfLvl  = state.dfLevel  || { cls: '' };
    const ltLvl  = state.ltLevel  || { cls: '' };
    const cfrLvl = state.cfrLevel || { cls: '' };
    const mttrLvl = state.mttrLevel || { cls: '' };

    const failedPipelines = pp.filter(p => p.status === 'failed');
    const openMRs         = mrs.filter(m => m.state === 'opened');
    const staleMRs        = openMRs.filter(m => (now - new Date(m.created_at).getTime()) / 86400000 > 3);
    const mergedMRs       = mrs.filter(m => m.state === 'merged');
    // Branches durables exclues du décompte stale : aligné avec hub.js / repo-analyzer.
    const staleBranches   = br.filter(b => {
        if (['main','master','develop','dev'].includes(b.name)) return false;
        return b.commit && b.commit.committed_date && (now - new Date(b.commit.committed_date).getTime()) / 86400000 > 30;
    });
    // bigMRs : utilise `files_count` rempli par /:iid/changes (cf. loadData).
    // Si la donnée n'a pas pu être enrichie (ex : fetch en échec), on retombe sur
    // changes_count qui peut être 0 → la quick win ne se déclenche simplement pas.
    const bigMRs = mergedMRs.filter(m => (m.files_count ?? m.changes_count ?? 0) > 10);

    // ── DEPLOY FREQUENCY ──
    if (dfLvl.cls !== 'elite') {
        if (failedPipelines.length > 0) {
            wins.push({ priority: 'critical', dora: 'df', icon: '🔴',
                text: `${failedPipelines.length} pipeline${failedPipelines.length > 1 ? 's' : ''} en échec bloquent vos déploiements — les corriger est l'action la plus rapide pour remonter la DF.`,
                link: 'Pipelines', linkUrl: 'pipeline-generator.html' });
        }
        if (raw.df !== null && raw.df < 1) {
            wins.push({ priority: 'urgent', dora: 'df', icon: '🔁',
                text: `Moins d'1 déploiement/semaine (${raw.df}/sem). Objectif immédiat : déployer chaque sprint. Découpez les features pour livrer plus souvent.`,
                link: '', linkUrl: '' });
        }
        if (raw.df !== null && raw.df >= 1 && raw.df < 7) {
            wins.push({ priority: 'important', dora: 'df', icon: '📦',
                text: `${raw.df} deploy/sem (niveau High). Pour passer Elite (≥7/sem), automatisez les checks pré-merge et réduisez les approbations manuelles bloquantes.`,
                link: 'Gouvernance Repo', linkUrl: 'gouvernance-repo.html' });
        }
        // Fallback si aucune action spécifique n'a été générée
        if (wins.filter(w => w.dora === 'df').length === 0) {
            wins.push({ priority: 'important', dora: 'df', icon: '📊',
                text: `Votre fréquence de déploiement est au niveau ${dfLvl.level}. Analysez votre pipeline pour identifier les opportunités d'automatisation.`,
                link: 'Pipelines', linkUrl: 'pipeline-generator.html' });
        }
    }

    // ── LEAD TIME ──
    if (ltLvl.cls !== 'elite') {
        if (staleMRs.length > 0) {
            wins.push({ priority: 'critical', dora: 'lt', icon: '⏳',
                text: `${staleMRs.length} MR ouvertes depuis 3+ jours sans review — chaque jour de blocage s'ajoute directement à votre Lead Time (actuellement ${raw.lt !== null ? (raw.lt >= 24 ? (raw.lt/24).toFixed(1)+'j' : raw.lt+'h') : 'N/A'}).`,
                link: 'Branch Cleaner', linkUrl: 'branch-cleaner.html' });
        }
        if (bigMRs.length > mergedMRs.length * 0.3) {
            wins.push({ priority: 'urgent', dora: 'lt', icon: '✂️',
                text: `${bigMRs.length} MR mergées avec 10+ fichiers (${mergedMRs.length > 0 ? Math.round(bigMRs.length / mergedMRs.length * 100) : 0}% du total). Les grosses MR allongent les reviews : découpez en MR atomiques.`,
                link: '', linkUrl: '' });
        }
        if (staleBranches.length > 5) {
            wins.push({ priority: 'important', dora: 'lt', icon: '🌿',
                text: `${staleBranches.length} branches inactives depuis 30+ jours. Elles signalent du travail non livré : activez la suppression auto après merge.`,
                link: 'Branch Cleaner', linkUrl: 'branch-cleaner.html' });
        }
        if (raw.lt !== null && raw.lt > 168) {
            wins.push({ priority: 'critical', dora: 'lt', icon: '🚨',
                text: `Lead Time médian à ${(raw.lt/24).toFixed(1)} jours (niveau Low). Cible immédiate : passer sous 7 jours. Identifiez les étapes manuelles dans votre workflow.`,
                link: '', linkUrl: '' });
        }
        if (wins.filter(w => w.dora === 'lt').length === 0) {
            wins.push({ priority: 'important', dora: 'lt', icon: '⏱️',
                text: `Votre Lead Time est au niveau ${ltLvl.level}. Révisez votre processus de review et de merge pour accélérer la livraison.`,
                link: '', linkUrl: '' });
        }
    }

    // ── CHANGE FAILURE RATE ──
    if (cfrLvl.cls !== 'elite') {
        if (raw.cfr !== null && raw.cfr > 15) {
            wins.push({ priority: 'critical', dora: 'cfr', icon: '🛑',
                text: `${raw.cfr}% de vos pipelines échouent (${raw.failedP}/${raw.totalP}). Au-delà de 15% vous êtes Low. Ajoutez des tests automatisés pour attraper les régressions avant le push.`,
                link: '', linkUrl: '' });
        }
        if (raw.cfr !== null && raw.cfr >= 5 && raw.cfr <= 15) {
            wins.push({ priority: 'important', dora: 'cfr', icon: '🧪',
                text: `CFR à ${raw.cfr}% (niveau Medium/High). Pour passer Elite (<5%) : ajoutez du linting, des tests d'intégration et des quality gates bloquants dans le pipeline.`,
                link: '', linkUrl: '' });
        }
        if (wins.filter(w => w.dora === 'cfr').length === 0) {
            wins.push({ priority: 'important', dora: 'cfr', icon: '🔍',
                text: `Votre CFR est au niveau ${cfrLvl.level}. Renforcez la qualité avec des tests automatisés dans votre CI.`,
                link: '', linkUrl: '' });
        }
    }

    // ── MTTR ──
    if (mttrLvl.cls !== 'elite') {
        const failedOld = failedPipelines.filter(p => {
            if (p.ref !== 'main' && p.ref !== 'master') return false;
            const age = (now - new Date(p.created_at).getTime()) / 86400000;
            if (age <= 1) return false;
            const laterSuccess = pp.find(n =>
                n.ref === p.ref &&
                n.status === 'success' &&
                new Date(n.created_at) > new Date(p.created_at)
            );
            return !laterSuccess;
        });
        if (failedOld.length > 0) {
            wins.push({ priority: 'critical', dora: 'mttr', icon: '🔧',
                text: `${failedOld.length} pipeline${failedOld.length > 1 ? 's' : ''} cassé${failedOld.length > 1 ? 's' : ''} depuis plus de 24h sans correction — chaque heure allonge votre TTRS.`,
                link: '', linkUrl: '' });
        }
        if (raw.mttr !== null && raw.mttr > 24) {
            wins.push({ priority: 'urgent', dora: 'mttr', icon: '⏱️',
                text: `TTRS médian à ${raw.mttr >= 24 ? (raw.mttr/24).toFixed(1)+'j' : raw.mttr+'h'} (${mttrLvl.level}). Automatisez la détection et le rollback pour réduire le temps de recovery.`,
                link: '', linkUrl: '' });
        }
        if (contrib.length <= 1) {
            wins.push({ priority: 'urgent', dora: 'mttr', icon: '🚌',
                text: `1 seul contributeur actif — bus factor critique. En cas d'incident, le temps de restore dépend d'une seule personne.`,
                link: 'Hub', linkUrl: 'hub.html' });
        }
        if (wins.filter(w => w.dora === 'mttr').length === 0) {
            wins.push({ priority: 'important', dora: 'mttr', icon: '🩹',
                text: `Votre TTRS est au niveau ${mttrLvl.level}. Mettez en place des alertes et des procédures de rollback automatisées.`,
                link: '', linkUrl: '' });
        }
    }

    // ── CROSS-DORA ──
    const crossWins = [];

    // Elite DF + CFR dégradé = on livre vite mais on casse
    if (dfLvl.cls === 'elite' && (cfrLvl.cls === 'low' || cfrLvl.cls === 'medium')) {
        crossWins.push({ icon: '⚠️',
            text: `Deploy fréquent (Elite) + CFR élevé (${cfrLvl.level}) = vous livrez vite mais vous cassez souvent. Priorité : quality gates avant le déploiement prod.`,
            tags: ['🚀 Deploy Freq', '🔧 CFR'] });
    }
    // LT Low + CFR élevé = problème systémique
    if (ltLvl.cls === 'low' && (cfrLvl.cls === 'low' || cfrLvl.cls === 'medium')) {
        crossWins.push({ icon: '🔥',
            text: `Lead Time bas (${ltLvl.level}) + CFR élevé (${cfrLvl.level}) : livraison lente ET instable. C'est le signal d'une dette technique ou de processus à adresser en priorité.`,
            tags: ['⚡ Lead Time', '🔧 CFR'] });
    }
    // 3/4 Elite → focus sur le dernier
    const scored = [
        { lvl: dfLvl,   name: '🚀 Deploy Freq' },
        { lvl: ltLvl,   name: '⚡ Lead Time' },
        { lvl: cfrLvl,  name: '🔧 CFR' },
        { lvl: mttrLvl, name: '⏱️ TTRS' }
    ];
    const eliteCount = scored.filter(s => s.lvl && s.lvl.cls === 'elite').length;
    if (eliteCount === 3) {
        const missing = scored.find(s => s.lvl && s.lvl.cls !== 'elite');
        if (missing) {
            crossWins.push({ icon: '🏆',
                text: `3/4 métriques en Elite ! Concentrez tout sur ${missing.name} (actuellement ${missing.lvl.level}) — vous êtes à une optimisation d'un score Elite global.`,
                tags: [`🎯 ${missing.name}`] });
        }
    }

    renderQuickWins(wins, crossWins);
}

function renderQuickWins(wins, crossWins) {
    const cols = [
        { id: 'df',   icon: '🚀', name: 'Deploy Frequency', color: '#a5b4fc', state: _doraState.dfLevel  },
        { id: 'lt',   icon: '⚡', name: 'Lead Time',         color: '#6ee7b7', state: _doraState.ltLevel  },
        { id: 'cfr',  icon: '🔧', name: 'Change Failure Rate',color: '#fca5a5', state: _doraState.cfrLevel },
        { id: 'mttr', icon: '⏱️', name: 'MTTR',              color: '#fcd34d', state: _doraState.mttrLevel }
    ];

    const valueMap = {
        df:   _doraState.df   !== null ? `${_doraState.df}/sem` : 'N/A',
        lt:   _doraState.lt   !== null ? (_doraState.lt >= 24 ? `${(_doraState.lt/24).toFixed(1)}j` : `${_doraState.lt}h`) : 'N/A',
        cfr:  _doraState.cfr  !== null ? `${_doraState.cfr}%` : 'N/A',
        mttr: _doraState.mttr !== null ? (_doraState.mttr >= 24 ? `${(_doraState.mttr/24).toFixed(1)}j` : `${_doraState.mttr}h`) : 'N/A'
    };

    const icons = { Elite: '🟢', High: '🔵', Medium: '🟡', Low: '🔴' };

    const gridEl = document.getElementById('qwGrid');
    gridEl.innerHTML = cols.map(col => {
        const lvl = col.state || { level: 'N/A', cls: '', pct: 0, gap: null };
        const colWins = wins.filter(w => w.dora === col.id);

        const gapHtml = lvl.gap
            ? `<div class="qw-col-gap"><strong>${lvl.gap}</strong></div>`
            : lvl.cls === 'elite'
                ? `<div class="qw-col-gap" style="color:#6ee7b7"><strong>🏆 Elite atteint</strong></div>`
                : '';

        const itemsHtml = colWins.length === 0
            ? (lvl.cls === 'elite'
                ? `<div class="qw-empty-col"><div class="qw-trophy">🏆</div>Aucune action requise<br><strong>Continuez comme ça !</strong></div>`
                : `<div class="qw-empty-col">Aucune action détectée</div>`)
            : colWins.map(w =>
                `<div class="qw-item ${w.priority}">
                    <div class="qw-text">${w.icon} ${w.text}</div>
                    ${w.link ? `<a class="qw-link" href="${w.linkUrl}">→ ${w.link}</a>` : ''}
                </div>`
              ).join('');

        return `<div class="qw-column" style="border-top-color:${col.color}">
            <div class="qw-col-header">
                <div class="qw-col-icon-name">
                    <span class="qw-col-icon">${col.icon}</span>
                    <span class="qw-col-name">${col.name}</span>
                </div>
                <div class="qw-col-value" style="color:${col.color}">${valueMap[col.id]}</div>
                <span class="qw-col-badge ${lvl.cls}">${icons[lvl.level] || ''} ${lvl.level}</span>
                <div class="qw-col-bar"><div class="qw-col-bar-fill ${lvl.cls}" style="width:${lvl.pct}%"></div></div>
                ${gapHtml}
            </div>
            <div class="qw-items">${itemsHtml}</div>
        </div>`;
    }).join('');

    const crossEl = document.getElementById('qwCross');
    if (crossWins && crossWins.length > 0) {
        crossEl.innerHTML = `<div class="qw-cross">
            <div class="qw-cross-title">🔗 Croisements inter-DORA</div>
            ${crossWins.map(w =>
                `<div class="qw-cross-item">
                    <div class="qw-cross-icon">${w.icon}</div>
                    <div>
                        <div>${w.text}</div>
                        <div class="qw-cross-tags">${(w.tags || []).map(t => `<span class="qw-cross-tag">${t}</span>`).join('')}</div>
                    </div>
                </div>`
            ).join('')}
        </div>`;
    } else {
        crossEl.innerHTML = '';
    }
}

// ════════════════════════════════════════════════════════════
//  EXPORT RAPPORT
// ════════════════════════════════════════════════════════════
function exportReport() {
    const projectName = document.getElementById('projectName').textContent;
    const safeProjectName = escapeHtml(projectName);
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Les .textContent / innerText retournent du texte brut, pas de HTML.
    const df  = document.getElementById('deployFrequency').textContent;
    const lt  = document.getElementById('leadTime').textContent;
    const cfr = document.getElementById('failureRate').textContent;
    const mttr = document.getElementById('restoreTime').textContent;

    function getBadge(elId) {
        const el = document.getElementById(elId);
        if (!el) return 'N/A';
        const badge = el.querySelector('.dora-badge');
        return badge ? badge.textContent.trim() : 'N/A';
    }
    const dfBadge   = getBadge('deployFrequency-badge');
    const ltBadge   = getBadge('leadTime-badge');
    const cfrBadge  = getBadge('failureRate-badge');
    const mttrBadge = getBadge('restoreTime-badge');

    // Score : .innerText évite les balises HTML du badge "MTTR manquant"
    // sans utiliser de regex fragile sur du innerHTML.
    const scoreValue = document.getElementById('scoreValue').textContent;
    const scoreLevel = document.getElementById('scoreLevelTitle').innerText.trim();

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Rapport DORA — ${safeProjectName} — ${dateStr}</title>
<style>
* { margin:0;padding:0;box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
       background:linear-gradient(135deg,#1e1b4b,#312e81,#4c1d95);
       min-height:100vh;color:white;padding:40px; }
.container { max-width:900px;margin:0 auto; }
.header { text-align:center;padding:40px;background:rgba(255,255,255,0.1);border-radius:24px;
          border:1px solid rgba(255,255,255,0.2);margin-bottom:40px; }
.header h1 { font-size:32px;font-weight:800;margin-bottom:8px; }
.header p { opacity:0.7;font-size:15px; }
.project { display:inline-block;padding:10px 20px;background:rgba(255,255,255,0.15);
           border-radius:12px;font-size:16px;font-weight:600;margin-top:16px; }
.section-title { font-size:20px;font-weight:700;margin:30px 0 16px;
                 padding-bottom:10px;border-bottom:2px solid rgba(255,255,255,0.2); }
.score-global { text-align:center;padding:30px;background:rgba(255,255,255,0.1);border-radius:20px;
                border:1px solid rgba(255,255,255,0.2);margin-bottom:30px; }
.score-value { font-size:64px;font-weight:800; }
.score-level { font-size:20px;font-weight:700;margin-top:8px; }
.dora-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:30px; }
.dora-card { background:rgba(255,255,255,0.1);border-radius:16px;padding:24px;
             border:1px solid rgba(255,255,255,0.2); }
.dora-name { font-size:13px;font-weight:600;opacity:0.8;margin-bottom:8px; }
.dora-val { font-size:36px;font-weight:800;margin-bottom:8px; }
.dora-badge { display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600; }
.method-note { background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);
               border-radius:12px;padding:16px;font-size:12px;opacity:0.75;margin-top:20px;line-height:1.7; }
.footer { text-align:center;margin-top:40px;opacity:0.5;font-size:13px; }
</style></head><body><div class="container">
<div class="header">
  <div style="font-size:56px;margin-bottom:16px">📊</div>
  <h1>Rapport DORA Metrics</h1>
  <p>Performance DevOps</p>
  <div class="project">📦 ${safeProjectName}</div>
  <p style="margin-top:12px;font-size:13px;opacity:0.6">Généré le ${dateStr} à ${timeStr}</p>
</div>
<div class="score-global">
  <div class="score-value">${scoreValue}/100</div>
  <div class="score-level">${escapeHtml(scoreLevel)}</div>
</div>
<div class="section-title">🎯 Les 4 métriques DORA</div>
<div class="dora-grid">
  <div class="dora-card">
    <div class="dora-name">🚀 Deploy Frequency</div>
    <div class="dora-val" style="color:#a5b4fc">${df}</div>
    <span class="dora-badge" style="background:rgba(165,180,252,0.2);color:#a5b4fc">${dfBadge}</span>
  </div>
  <div class="dora-card">
    <div class="dora-name">⚡ Lead Time for Changes</div>
    <div class="dora-val" style="color:#6ee7b7">${lt}</div>
    <span class="dora-badge" style="background:rgba(110,231,183,0.2);color:#6ee7b7">${ltBadge}</span>
  </div>
  <div class="dora-card">
    <div class="dora-name">🔧 Change Failure Rate</div>
    <div class="dora-val" style="color:#fca5a5">${cfr}</div>
    <span class="dora-badge" style="background:rgba(252,165,165,0.2);color:#fca5a5">${cfrBadge}</span>
  </div>
  <div class="dora-card">
    <div class="dora-name">⏱️ Time to Restore Service</div>
    <div class="dora-val" style="color:#fcd34d">${mttr}</div>
    <span class="dora-badge" style="background:rgba(252,211,77,0.2);color:#fcd34d">${mttrBadge}</span>
  </div>
</div>
<div class="method-note">
  <strong>Méthode de calcul</strong><br>
  DF : pipelines success sur env prod / 30j × 7<br>
  Lead Time : médiane first_commit_at → merged_at des MRs<br>
  CFR : pipelines failed / total pipelines × 100 (fenêtres pondérées 5j/10j/30j)<br>
  TTRS : médiane durée pipeline failed → success suivant sur branche prod<br><br>
  <strong>⚠️ Note sur le score global :</strong> si MTTR est manquant, le score est plafonné à 75/100 maximum. Toute métrique absente réduit la fiabilité du score.
</div>
<div class="footer">DevOps Hub © ${now.getFullYear()}</div>
</div></body></html>`;

    try {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `DORA-${projectName.replace(/[^a-zA-Z0-9]/g,'-')}-${now.toISOString().split('T')[0]}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        alert('Erreur lors de l\'export : ' + e.message);
    }
}

// ════════════════════════════════════════════════════════════
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}