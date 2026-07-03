// ═══════════════════════════════════════════════════
// DORA WORKSPACE - Calcul des 4 métriques DORA
// ═══════════════════════════════════════════════════

let GITLAB_URL = null, token = null, currentWorkspace = null;
let lastResults = null;   // derniers résultats repo (pour re-render après réorg sans refetch)

// Hub de retour (mockup V2), aligné sur gouvernance-repo.
const HUB_URL = 'hub-mockup-v2_1.html';

document.addEventListener('DOMContentLoaded', () => {
    // Flèche retour → hub V2 (pattern data-hub-link comme les autres modules).
    document.querySelectorAll('[data-hub-link]').forEach(a => { a.href = HUB_URL; });
    init();
    // Écouteurs période / refresh
    document.getElementById('periodSelect').addEventListener('change', onPeriodChange);
    document.getElementById('refreshBtn').addEventListener('click', loadDoraData);
    document.getElementById('periodFrom').addEventListener('change', loadDoraData);
    document.getElementById('periodTo').addEventListener('change', loadDoraData);
    // Écouteurs organisation des squads
    document.getElementById('organizeBtn').addEventListener('click', toggleOrganizePanel);
    document.getElementById('closeOrganizeBtn').addEventListener('click', toggleOrganizePanel);
    document.getElementById('addSquadBtn').addEventListener('click', onAddSquad);
    document.getElementById('newSquadName').addEventListener('keydown', e => { if (e.key === 'Enter') onAddSquad(); });
    // Écouteurs export / import JSON
    document.getElementById('exportBtn').addEventListener('click', exportWorkspaceJson);
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importInput').click());
    document.getElementById('importInput').addEventListener('change', handleImportJson);
});

function onPeriodChange() {
    const select = document.getElementById('periodSelect');
    const customInputs = document.getElementById('customPeriodInputs');
    if (select.value === 'custom') {
        customInputs.style.display = 'inline';
        // Pré-remplir avec les 30 derniers jours par défaut
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        const fromInput = document.getElementById('periodFrom');
        const toInput = document.getElementById('periodTo');
        if (!fromInput.value) fromInput.value = thirtyDaysAgo.toISOString().split('T')[0];
        if (!toInput.value) toInput.value = today.toISOString().split('T')[0];
        loadDoraData();
    } else {
        customInputs.style.display = 'none';
        loadDoraData();
    }
}

// Résout la période effective selon le select et les date inputs.
// Retourne { since, until, days } en ISO + nombre de jours pour les calculs de DF.
function getPeriod() {
    const select = document.getElementById('periodSelect');
    if (select.value === 'custom') {
        const from = document.getElementById('periodFrom').value;
        const to = document.getElementById('periodTo').value;
        if (!from || !to) return null;
        const fromDate = new Date(from);
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999); // inclusif sur la journée de fin
        const days = Math.max(1, Math.ceil((toDate - fromDate) / 86400000));
        return { since: fromDate.toISOString(), until: toDate.toISOString(), days };
    }
    const days = parseInt(select.value);
    return { since: daysAgoISO(days), until: new Date().toISOString(), days };
}

// Liste des branches considérées comme "production" pour ce repo.
// Source : workspace (champ optionnel currentWorkspace.prodBranches) +
// default_branch du repo + fallback hardcodé.
function resolveProdBranches(defaultBranch) {
    const fromWorkspace = Array.isArray(currentWorkspace.prodBranches) ? currentWorkspace.prodBranches : [];
    const hardcoded = ['main', 'master', 'production', 'prod'];
    const set = new Set([...fromWorkspace, ...hardcoded]);
    if (defaultBranch) set.add(defaultBranch);
    return Array.from(set);
}

async function init() {
    // Auth : toujours via localStorage (pattern hub/gouvernance/workspace-setup).
    const gws = localStorage.getItem('devops_hub_workspaces');
    if (!gws) { return showError('Non connecté. Ouvre le hub et connecte-toi d\'abord. <br><a href="' + HUB_URL + '" style="color:#a78bfa;">← Retour au hub</a>'); }
    const cfg = JSON.parse(gws);
    GITLAB_URL = cfg.gitlabUrl;
    token = cfg.token;
    if (!token || !GITLAB_URL) { return showError('Configuration GitLab incomplète (token ou URL manquant).'); }

    // DORA = vue workspace uniquement (agrégation multi-repos).
    // Pas de mode mono-repo. Sans workspace actif : message (pas de redirection,
    // qui planterait en file:// avec "unique security origins").
    const wsJson = sessionStorage.getItem('current_workspace');
    if (!wsJson) {
        return showError(
            'Aucune tribu sélectionnée. Ouvre ce module depuis le hub : ' +
            'choisis une tribu (workspace) puis clique sur DORA. ' +
            '<br><a href="' + HUB_URL + '" style="color:#a78bfa;">← Retour au hub</a>'
        );
    }
    currentWorkspace = JSON.parse(wsJson);

    if (!currentWorkspace.repositories?.length) {
        return showError('Ce workspace ne contient aucun repo.');
    }
    document.getElementById('workspaceName').textContent =
        `🗂️ ${currentWorkspace.name} (${currentWorkspace.repositories.length} repos)`;
    await loadDoraData();
}

async function fetchGitLab(endpoint) {
    try {
        let r = await fetch(`${GITLAB_URL}/api/v4${endpoint}`, { headers: { 'PRIVATE-TOKEN': token } });
        // Retry simple sur rate-limit 429, aligné sur workspace-hub / gouvernance-repo.
        if (r.status === 429) {
            const retryAfter = parseInt(r.headers.get('Retry-After')) || 2;
            console.warn(`[fetchGitLab] 429 sur ${endpoint}, retry dans ${retryAfter}s`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            r = await fetch(`${GITLAB_URL}/api/v4${endpoint}`, { headers: { 'PRIVATE-TOKEN': token } });
        }
        if (!r.ok) return null;
        return r.json();
    } catch { return null; }
}

async function fetchAll(endpoint) {
    let all = [], page = 1;
    while (true) {
        const url = `${endpoint}&page=${page}`;
        const batch = await fetchGitLab(url);
        if (!batch || !batch.length) break;
        all = all.concat(batch);
        if (batch.length < 100) break;
        page++;
    }
    return all;
}

function daysAgoISO(d) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString(); }

// Vraie médiane : moyenne des deux centraux pour les tableaux pairs.
// Mutation du tableau (sort en place) acceptée — l'appelant nous le passe pour ce calcul.
function median(arr) {
    if (!arr || arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

function doraLevel(metric, val) {
    if (val === null || val === undefined) return { level:'N/A', cls:'na' };
    if (metric === 'df') {
        if (val >= 7)    return { level:'Elite',  cls:'elite' };
        if (val >= 1)    return { level:'High',   cls:'high' };
        if (val >= 0.25) return { level:'Medium', cls:'medium' };
        return { level:'Low', cls:'low' };
    }
    if (metric === 'lt' || metric === 'mttr') {
        if (val <= 1)    return { level:'Elite',  cls:'elite' };
        if (val <= 24)   return { level:'High',   cls:'high' };
        if (val <= 168)  return { level:'Medium', cls:'medium' };
        return { level:'Low', cls:'low' };
    }
    if (metric === 'cfr') {
        if (val <= 5)    return { level:'Elite',  cls:'elite' };
        if (val <= 10)   return { level:'High',   cls:'high' };
        if (val <= 15)   return { level:'Medium', cls:'medium' };
        return { level:'Low', cls:'low' };
    }
    return { level:'N/A', cls:'na' };
}

async function loadDoraData() {
    const period = getPeriod();
    if (!period) {
        // Période custom incomplète : on attend que l'utilisateur saisisse les deux dates
        return;
    }
    const { since, until, days } = period;

    document.getElementById('loadingContainer').style.display = 'block';
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('errorContainer').style.display = 'none';

    const repos = currentWorkspace.repositories;

    // Parallélisation par repo. Le retry 429 de fetchGitLab nous protège
    // d'une cascade de rate-limit ; un workspace lourd peut quand même
    // générer un pic, surveiller la console.
    const results = await Promise.all(repos.map(repo => computeRepoMetrics(repo, since, until, days)));

    lastResults = results;       // cache pour re-render après réorg squads
    renderResults(results);
    renderHeatmap(results, days);
    renderRepoTable(results, days);
    // Tendances : recalcul par tranches temporelles (asynchrone, peut être long).
    renderTrends().catch(e => console.warn('Tendances indisponibles:', e));
}

async function computeRepoMetrics(repo, since, until, days) {
    try {
        // Pré-requis : connaître la default branch pour la liste des branches "prod".
        const project = await fetchGitLab(`/projects/${repo.id}`);
        const defaultBranch = project?.default_branch || repo.defaultBranch || 'main';
        const prodBranches = resolveProdBranches(defaultBranch);

        // Pipelines (pour DF, CFR, MTTR) et MRs (pour Lead Time) en parallèle.
        const [pipelines, mrs] = await Promise.all([
            fetchAll(`/projects/${repo.id}/pipelines?per_page=100&created_after=${since}&created_before=${until}`),
            fetchAll(`/projects/${repo.id}/merge_requests?state=merged&per_page=100&updated_after=${since}`)
        ]);

        let df = 0, cfr = 0, lt = null, mttr = null;
        let usedFallback = false;
        // Volumes bruts nécessaires à l'agrégation pondérée squad/tribu.
        let deployCount = 0;   // nb de déploiements (pipelines success dédupliqués)
        let failCount = 0;     // nb d'échecs (pipelines failed dédupliqués)
        let totalPipeCount = 0;// nb total de pipelines dédupliqués (base CFR)
        let ltEventCount = 0;  // nb de MR mergées retenues (poids du Lead Time)
        let mttrEventCount = 0;// nb d'incidents récupérés (poids du MTTR)

        if (pipelines && pipelines.length > 0) {
            const prod = pipelines.filter(p => prodBranches.includes(p.ref));
            // Si pas de pipelines sur les branches prod, fallback sur tous les pipelines.
            // Le drapeau usedFallback est exposé dans le résultat pour affichage UI.
            usedFallback = prod.length === 0;
            const sample = prod.length > 0 ? prod : pipelines;

            // Dedup par SHA : garder le pipeline le plus récent par commit.
            // Évite de gonfler DF/CFR quand un pipeline est relancé plusieurs fois
            // sur le même commit (CI flaky, re-runs manuels).
            const sortedDesc = [...sample].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            const seen = new Set();
            const dedupedSample = [];
            for (const p of sortedDesc) {
                if (!seen.has(p.sha)) {
                    seen.add(p.sha);
                    dedupedSample.push(p);
                }
            }

            const totalPipes = dedupedSample.length;
            const succ = dedupedSample.filter(p => p.status === 'success').length;
            const fail = dedupedSample.filter(p => p.status === 'failed').length;
            df = parseFloat(((succ / days) * 7).toFixed(2));
            cfr = totalPipes > 0 ? parseFloat(((fail / totalPipes) * 100).toFixed(1)) : 0;

            deployCount = succ;
            failCount = fail;
            totalPipeCount = totalPipes;

            // MTTR : pour chaque failed, trouver le prochain success sur la même branche.
            // Pas de dedup ici : on veut chaque incident (la dedup tuerait les failed consécutifs).
            const mttrSource = prod.length > 0 ? prod : pipelines;
            const sortedAsc = [...mttrSource].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            const recov = [];
            for (let i = 0; i < sortedAsc.length - 1; i++) {
                if (sortedAsc[i].status === 'failed') {
                    const nextOK = sortedAsc.slice(i + 1).find(p => p.ref === sortedAsc[i].ref && p.status === 'success');
                    if (nextOK) {
                        const dur = (new Date(nextOK.created_at) - new Date(sortedAsc[i].created_at)) / 3600000;
                        if (dur > 0) recov.push(dur);
                    }
                }
            }
            mttrEventCount = recov.length;
            const mttrMedian = median(recov);
            if (mttrMedian !== null) mttr = parseFloat(mttrMedian.toFixed(1));
        }

        // Lead Time : médiane (merged_at - first_commit_at) sur les MRs effectivement
        // mergées dans la période.
        if (mrs && mrs.length > 0) {
            const merged = mrs.filter(m => m.merged_at && new Date(m.merged_at) >= new Date(since));
            if (merged.length) {
                const times = merged.map(m => {
                    const start = m.first_commit_at || m.created_at;
                    return (new Date(m.merged_at) - new Date(start)) / 3600000;
                }).filter(v => v > 0);
                ltEventCount = times.length;
                const ltMedian = median(times);
                if (ltMedian !== null) lt = parseFloat(ltMedian.toFixed(1));
            }
        }

        return {
            id: repo.id,
            name: repo.name,
            url: repo.url,
            df, cfr, lt, mttr,
            // Volumes bruts pour pondération
            deployCount, failCount, totalPipeCount, ltEventCount, mttrEventCount,
            usedFallback,
            defaultBranch,
            dfLevel: doraLevel('df', df),
            cfrLevel: doraLevel('cfr', cfr),
            ltLevel: doraLevel('lt', lt),
            mttrLevel: doraLevel('mttr', mttr)
        };
    } catch (e) {
        console.error(`Erreur sur ${repo.name}:`, e);
        return { id: repo.id, name: repo.name, error: e.message };
    }
}

// ═══════════════════════════════════════════════════════════
// MODÈLE SQUAD + AGRÉGATION PONDÉRÉE (repo → squad → tribu)
// ═══════════════════════════════════════════════════════════

// Construit la liste des squads à partir du workspace.
// currentWorkspace.squads (optionnel) = [{ id, name, repoIds: [...] }, ...].
// Tout repo non rattaché tombe dans une squad virtuelle "Non assignée".
// Rétrocompatible : un workspace sans .squads => tout dans "Non assignée".
function resolveSquads(repoResults) {
    const byId = new Map(repoResults.map(r => [String(r.id), r]));
    const squads = [];
    const assigned = new Set();

    const declared = Array.isArray(currentWorkspace.squads) ? currentWorkspace.squads : [];
    for (const sq of declared) {
        const ids = Array.isArray(sq.repoIds) ? sq.repoIds.map(String) : [];
        const repos = [];
        for (const id of ids) {
            if (byId.has(id)) { repos.push(byId.get(id)); assigned.add(id); }
        }
        squads.push({ id: sq.id || sq.name, name: sq.name || 'Squad', repos });
    }

    // Reliquat : repos non déclarés dans une squad
    const orphans = repoResults.filter(r => !assigned.has(String(r.id)));
    if (orphans.length) {
        squads.push({ id: '__unassigned__', name: 'Non assignée', repos: orphans });
    }
    return squads;
}

// Moyenne pondérée robuste : ignore les valeurs null et les poids nuls.
// Retourne null si aucune contribution valide (=> affichage N/A).
function weightedAvg(pairs) {
    let num = 0, den = 0;
    for (const [val, w] of pairs) {
        if (val === null || val === undefined || !isFinite(val)) continue;
        const weight = (w && w > 0) ? w : 0;
        if (weight === 0) continue;
        num += val * weight;
        den += weight;
    }
    return den > 0 ? num / den : null;
}

// Agrège une liste de "unités" (repos pour une squad, squads pour la tribu).
// Chaque unité expose : df, cfr, lt, mttr + volumes
// (deployCount, failCount, totalPipeCount, ltEventCount, mttrEventCount).
//   - DF  : SOMME des déploiements ramenée par semaine => additive, pas moyennée.
//   - CFR : pondéré par le total de pipelines (échecs/total agrégés).
//   - LT  : moyenne pondérée par le nb de MR mergées.
//   - MTTR: moyenne pondérée par le nb d'incidents.
function aggregateUnits(units, days) {
    let deployCount = 0, failCount = 0, totalPipeCount = 0, ltEventCount = 0, mttrEventCount = 0;
    for (const u of units) {
        deployCount    += u.deployCount    || 0;
        failCount      += u.failCount      || 0;
        totalPipeCount += u.totalPipeCount || 0;
        ltEventCount   += u.ltEventCount   || 0;
        mttrEventCount += u.mttrEventCount || 0;
    }

    // DF additive : total déploiements sur la période, ramené par semaine.
    const df = days > 0 ? parseFloat(((deployCount / days) * 7).toFixed(2)) : 0;

    // CFR pondéré : échecs agrégés / pipelines agrégés.
    const cfr = totalPipeCount > 0
        ? parseFloat(((failCount / totalPipeCount) * 100).toFixed(1))
        : 0;

    // LT pondéré par le volume de MR de chaque unité.
    const ltRaw = weightedAvg(units.map(u => [u.lt, u.ltEventCount]));
    const lt = ltRaw !== null ? parseFloat(ltRaw.toFixed(1)) : null;

    // MTTR pondéré par le volume d'incidents de chaque unité.
    const mttrRaw = weightedAvg(units.map(u => [u.mttr, u.mttrEventCount]));
    const mttr = mttrRaw !== null ? parseFloat(mttrRaw.toFixed(1)) : null;

    return {
        df, cfr, lt, mttr,
        deployCount, failCount, totalPipeCount, ltEventCount, mttrEventCount,
        dfLevel:   doraLevel('df', df),
        cfrLevel:  doraLevel('cfr', cfr),
        ltLevel:   doraLevel('lt', lt),
        mttrLevel: doraLevel('mttr', mttr)
    };
}

// Pire niveau parmi les 4 métriques (pour un badge "niveau global").
function worstLevel(agg) {
    const levels = [agg.dfLevel, agg.ltLevel, agg.cfrLevel, agg.mttrLevel].filter(l => l.cls !== 'na');
    const order = { elite: 4, high: 3, medium: 2, low: 1 };
    return levels.reduce((w, c) => order[c.cls] < order[w.cls] ? c : w, { cls: 'elite', level: 'Elite' });
}

// Construit l'arbre complet tribu → squads → repos avec métriques agrégées.
function buildTribeTree(repoResults, days) {
    const valid = repoResults.filter(r => !r.error && r.df !== undefined);

    const squads = resolveSquads(valid).map(sq => {
        const agg = aggregateUnits(sq.repos, days);
        return { ...sq, agg, worst: worstLevel(agg) };
    });

    // Tribu = agrégation des repos de toutes les squads (équivaut à agréger
    // tous les repos valides ; on repart des repos pour rester exact).
    const allRepos = squads.flatMap(sq => sq.repos);
    const tribeAgg = aggregateUnits(allRepos, days);

    return {
        tribe: { agg: tribeAgg, worst: worstLevel(tribeAgg) },
        squads,
        repoCount: allRepos.length,
        squadCount: squads.length
    };
}


// ═══════════════════════════════════════════════════════════
// GRAPHES SVG MAISON (vanilla, zéro dépendance, marche en file://)
// ═══════════════════════════════════════════════════════════

const SERIES_COLORS = {
    df:   '#2dd4bf',  // deliver / cyan-vert
    lt:   '#7c5cff',  // measure / violet
    cfr:  '#fb923c',  // inspect / orange
    mttr: '#f472b6'   // collab / rose
};

// Graphe multi-courbes avec axes + grille.
// series = [{ key, label, points:[number|null,...] }], labels = [tag,...]
function svgLineChart(series, labels, opts = {}) {
    const W = opts.width || 900, H = opts.height || 280;
    const m = { top: 16, right: 16, bottom: 28, left: 40 };
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;

    // Échelle Y commune normalisée 0..max (chaque série rapportée à son propre max
    // n'aurait pas de sens si superposée ; on met une échelle 0..maxGlobal).
    const allVals = series.flatMap(s => s.points.filter(v => v !== null && v !== undefined && isFinite(v)));
    const maxV = allVals.length ? Math.max(...allVals) : 1;
    const niceMax = maxV <= 0 ? 1 : maxV * 1.15;
    const n = labels.length;
    const x = i => m.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = v => m.top + ih - (v / niceMax) * ih;

    // Grille horizontale (4 lignes) + labels Y
    let grid = '';
    for (let g = 0; g <= 4; g++) {
        const gv = (niceMax / 4) * g;
        const gy = y(gv);
        grid += `<line x1="${m.left}" y1="${gy.toFixed(1)}" x2="${m.left + iw}" y2="${gy.toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`;
        grid += `<text x="${m.left - 8}" y="${(gy + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="rgba(184,174,216,0.7)">${gv >= 100 ? Math.round(gv) : gv.toFixed(gv < 10 ? 1 : 0)}</text>`;
    }

    // Labels X (on en affiche max ~8 pour pas surcharger)
    let xlabels = '';
    const step = Math.ceil(n / 8) || 1;
    labels.forEach((lab, i) => {
        if (i % step === 0 || i === n - 1) {
            xlabels += `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="rgba(184,174,216,0.7)">${escapeHtml(lab)}</text>`;
        }
    });

    // Courbes
    let lines = '';
    series.forEach(s => {
        const color = SERIES_COLORS[s.key] || '#7c5cff';
        const pts = s.points.map((v, i) => (v === null || v === undefined || !isFinite(v)) ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean);
        if (pts.length >= 2) {
            lines += `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(' ')}"/>`;
        }
        // points
        s.points.forEach((v, i) => {
            if (v !== null && v !== undefined && isFinite(v)) {
                lines += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${color}"/>`;
            }
        });
    });

    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" style="width:100%;height:auto;display:block;">
        ${grid}${lines}${xlabels}
    </svg>`;
}

// Flèche de tendance (compare dernier vs premier point valide).
function trendBadge(series, better) {
    const valid = series.filter(v => v !== null && v !== undefined && isFinite(v));
    if (valid.length < 2) return '<span class="trend-flat">—</span>';
    const first = valid[0], cur = valid[valid.length - 1];
    if (first === 0) return '<span class="trend-flat">—</span>';
    const deltaPct = ((cur - first) / Math.abs(first)) * 100;
    if (Math.abs(deltaPct) < 1) return '<span class="trend-flat">→ stable</span>';
    const improving = better === 'up' ? deltaPct > 0 : deltaPct < 0;
    const arrow = deltaPct > 0 ? '▲' : '▼';
    return `<span class="${improving ? 'trend-good' : 'trend-bad'}">${arrow} ${Math.abs(deltaPct).toFixed(0)}%</span>`;
}

function renderResults(results) {
    document.getElementById('loadingContainer').style.display = 'none';
    const main = document.getElementById('mainContent');
    if (!main) return;
    main.style.display = 'block';

    const period = getPeriod();
    const days = period ? period.days : 30;
    const invalidCount = results.filter(r => r.error || r.df === undefined).length;

    const tree = buildTribeTree(results, days);
    const t = tree.tribe.agg;

    // En-tête tribu : nom + compteurs + niveau global
    document.getElementById('workspaceName').innerHTML =
        `🗂️ ${escapeHtml(currentWorkspace.name)} · ${tree.squadCount} squad(s) · ${tree.repoCount} repo(s)`
        + ` · <span class="level-badge ${tree.tribe.worst.cls}">${tree.tribe.worst.level}</span>`;

    // ── 4 grandes cartes TRIBU (pondéré) ──
    // La tendance sera injectée par renderTrends() une fois les segments calculés.
    const bigCard = (key, val, unit, lvl, label) => `
        <div class="summary-card">
            <div class="summary-label">${label}</div>
            <div class="summary-value">${val}${unit} ${lvl.cls !== 'na' ? `<span class="level-badge ${lvl.cls}">${lvl.level}</span>` : ''}</div>
            <div class="summary-trend" id="trend-${key}"></div>
        </div>`;

    document.getElementById('summaryCards').innerHTML =
        bigCard('df',   t.df, '/sem', t.dfLevel, 'Deploy Frequency') +
        bigCard('lt',   t.lt !== null ? t.lt : 'N/A', t.lt !== null ? 'h' : '', t.ltLevel, 'Lead Time') +
        bigCard('cfr',  t.cfr, '%', t.cfrLevel, 'Change Failure Rate') +
        bigCard('mttr', t.mttr !== null ? t.mttr : 'N/A', t.mttr !== null ? 'h' : '', t.mttrLevel, 'MTTR');

    // ── Cartes par squad (détail) ──
    const squadCardsHtml = tree.squads.map(sq => {
        const a = sq.agg;
        const metric = (lbl, val, unit, lvl) => `
            <div class="sq-metric">
                <div class="sq-metric-label">${lbl}</div>
                <div class="sq-metric-val">${val}${unit}</div>
                ${lvl.cls !== 'na' ? `<span class="level-badge ${lvl.cls}">${lvl.level}</span>` : ''}
            </div>`;
        return `<div class="squad-card">
            <div class="squad-card-head">
                <span class="squad-card-name">🗂️ ${escapeHtml(sq.name)}</span>
                <span class="squad-card-meta">${sq.repos.length} repo${sq.repos.length > 1 ? 's' : ''} · <span class="level-badge ${sq.worst.cls}">${sq.worst.level}</span></span>
            </div>
            <div class="squad-card-grid">
                ${metric('Deploy Freq', a.df, '/sem', a.dfLevel)}
                ${metric('Lead Time', a.lt !== null ? a.lt : 'N/A', a.lt !== null ? 'h' : '', a.ltLevel)}
                ${metric('CFR', a.cfr, '%', a.cfrLevel)}
                ${metric('MTTR', a.mttr !== null ? a.mttr : 'N/A', a.mttr !== null ? 'h' : '', a.mttrLevel)}
            </div>
        </div>`;
    }).join('');
    const noteHtml = invalidCount ? `<div class="squad-note">${invalidCount} repo(s) sans données sur la période.</div>` : '';
    document.getElementById('squadCards').innerHTML = squadCardsHtml + noteHtml;
}

// ═══════════════════════════════════════════════════════════
// PERSISTANCE (storage + JSON exportable)
// Source de vérité durable = JSON exporté. Storage = cache de confort
// (peut être vidé par la politique navigateur, d'où l'export/import).
// ═══════════════════════════════════════════════════════════

const WS_STORAGE_KEY = 'devops_hub_workspaces';

// Sauvegarde le workspace courant (avec ses squads) dans localStorage ET session.
function persistWorkspace() {
    try {
        sessionStorage.setItem('current_workspace', JSON.stringify(currentWorkspace));
    } catch (e) { /* session pleine/bloquée : on continue */ }
    try {
        const raw = localStorage.getItem(WS_STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (data && Array.isArray(data.workspaces)) {
                const idx = data.workspaces.findIndex(w => w.id === currentWorkspace.id);
                if (idx >= 0) {
                    data.workspaces[idx] = currentWorkspace;
                    localStorage.setItem(WS_STORAGE_KEY, JSON.stringify(data));
                }
            }
        }
    } catch (e) { /* storage vidé/bloqué : le JSON export reste le filet de sécurité */ }
}

function toast(msg, type = 'ok') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show ' + type;
    setTimeout(() => { el.className = 'toast'; }, 2600);
}

// ───── Export / Import JSON (squads incluses dans le workspace) ─────
function exportWorkspaceJson() {
    try {
        const blob = new Blob([JSON.stringify(currentWorkspace, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safe = (currentWorkspace.name || 'workspace').replace(/[^a-z0-9_-]+/gi, '_');
        a.href = url;
        a.download = `dora-tribu-${safe}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('✓ Tribu exportée en JSON');
    } catch (e) {
        toast('Échec export : ' + e.message, 'error');
    }
}

function handleImportJson(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        let parsed;
        try { parsed = JSON.parse(e.target.result); }
        catch (err) { toast('JSON invalide : ' + err.message, 'error'); return; }
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.repositories)) {
            toast('Fichier workspace invalide (champ repositories manquant).', 'error');
            return;
        }
        // On garde l'id courant (on ré-importe DANS la tribu ouverte) mais on
        // récupère repos + squads du fichier.
        currentWorkspace.repositories = parsed.repositories;
        currentWorkspace.squads = Array.isArray(parsed.squads) ? parsed.squads : [];
        if (parsed.name) currentWorkspace.name = parsed.name;
        persistWorkspace();
        toast('✓ Tribu importée — rechargement des métriques');
        loadDoraData();
    };
    reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════════
// UI ORGANISATION DES SQUADS
// ═══════════════════════════════════════════════════════════

function ensureSquadsArray() {
    if (!Array.isArray(currentWorkspace.squads)) currentWorkspace.squads = [];
    return currentWorkspace.squads;
}

function toggleOrganizePanel() {
    const panel = document.getElementById('organizePanel');
    const open = panel.style.display === 'none' || !panel.style.display;
    panel.style.display = open ? 'block' : 'none';
    if (open) { renderCreateRepos(); renderSquadEditor(); }
}

// Liste des repos à cocher dans le formulaire de création.
// Un repo déjà dans une squad est indiqué (et décochable d'ici puisqu'un
// repo n'appartient qu'à une squad : le cocher ici le déplacera).
function renderCreateRepos() {
    const root = document.getElementById('createReposList');
    if (!root) return;
    const repos = currentWorkspace.repositories || [];
    const squads = ensureSquadsArray();
    const repoSquad = {};
    squads.forEach(s => (s.repoIds || []).forEach(rid => { repoSquad[String(rid)] = s.name; }));

    root.innerHTML = repos.map(r => {
        const rid = String(r.id);
        const taken = repoSquad[rid];
        const hint = taken ? `<span class="create-repo-taken">déjà dans « ${escapeHtml(taken)} »</span>` : '';
        return `<label class="create-repo">
            <input type="checkbox" class="create-repo-cb" value="${escapeHtml(rid)}">
            <span class="create-repo-name">📦 ${escapeHtml(r.name)}</span>
            ${hint}
        </label>`;
    }).join('');
}

function onAddSquad() {
    const input = document.getElementById('newSquadName');
    const name = input.value.trim();
    if (!name) { toast('Donne un nom à la squad.', 'error'); return; }

    // Repos cochés dans le formulaire de création
    const checked = Array.from(document.querySelectorAll('.create-repo-cb:checked')).map(cb => cb.value);

    const squads = ensureSquadsArray();
    // Un repo n'appartient qu'à une squad : on le retire d'éventuelles autres.
    if (checked.length) {
        squads.forEach(s => { s.repoIds = (s.repoIds || []).filter(rid => !checked.includes(String(rid))); });
    }
    const id = 'sq_' + Date.now().toString(36);
    squads.push({ id, name, repoIds: checked });

    input.value = '';
    persistWorkspace();
    renderCreateRepos();
    renderSquadEditor();
    rerenderFromCache();
    toast(`✓ Squad « ${name} » créée avec ${checked.length} repo${checked.length > 1 ? 's' : ''}`);
}

function deleteSquad(id) {
    const squads = ensureSquadsArray();
    const i = squads.findIndex(s => (s.id || s.name) === id);
    if (i >= 0) {
        const name = squads[i].name;
        squads.splice(i, 1);
        persistWorkspace();
        renderCreateRepos();
        renderSquadEditor();
        rerenderFromCache();
        toast(`Squad « ${name} » supprimée (repos → Non assignée)`);
    }
}

function renameSquad(id, newName) {
    const squads = ensureSquadsArray();
    const sq = squads.find(s => (s.id || s.name) === id);
    if (sq && newName.trim()) { sq.name = newName.trim(); persistWorkspace(); rerenderFromCache(); }
}

// Déplace un repo vers une squad (ou "" = retirer / Non assignée).
function assignRepoToSquad(repoId, squadId) {
    const squads = ensureSquadsArray();
    // Retirer le repo de toutes les squads d'abord
    squads.forEach(s => { s.repoIds = (s.repoIds || []).filter(rid => String(rid) !== String(repoId)); });
    // Ajouter à la cible si définie
    if (squadId) {
        const sq = squads.find(s => (s.id || s.name) === squadId);
        if (sq) { sq.repoIds = sq.repoIds || []; sq.repoIds.push(repoId); }
    }
    persistWorkspace();
    renderCreateRepos();
    renderSquadEditor();
    rerenderFromCache();
}

function renderSquadEditor() {
    const root = document.getElementById('squadEditor');
    if (!root) return;
    const repos = currentWorkspace.repositories || [];
    const squads = ensureSquadsArray();

    // Map repoId -> squadId courant
    const repoSquad = {};
    squads.forEach(s => (s.repoIds || []).forEach(rid => { repoSquad[String(rid)] = (s.id || s.name); }));

    // Bloc squads existantes (avec compteur)
    const squadsHtml = squads.length
        ? squads.map(s => {
            const sid = s.id || s.name;
            const count = (s.repoIds || []).length;
            return `<div class="squad-chip">
                <input class="squad-chip-name" value="${escapeHtml(s.name)}" data-squad-rename="${escapeHtml(sid)}">
                <span class="squad-chip-count">${count} repo${count > 1 ? 's' : ''}</span>
                <button class="squad-chip-del" data-squad-del="${escapeHtml(sid)}" title="Supprimer la squad">✕</button>
            </div>`;
        }).join('')
        : `<div class="squad-empty">Aucune squad. Crée-en une ci-dessus, puis range les repos.</div>`;

    // Liste des repos avec une case à cocher par squad.
    // Un repo = au plus une squad : cocher une case décoche les autres.
    const reposHtml = repos.map(r => {
        const rid = String(r.id);
        const current = repoSquad[rid] || '';
        const boxes = squads.length
            ? squads.map(s => {
                const sid = s.id || s.name;
                const checked = current === sid ? 'checked' : '';
                return `<label class="assign-box">
                    <input type="checkbox" data-assign-repo="${escapeHtml(rid)}" data-assign-squad="${escapeHtml(sid)}" ${checked}>
                    ${escapeHtml(s.name)}
                </label>`;
            }).join('')
            : `<span class="assign-hint">Crée d'abord une squad ci-dessus</span>`;
        return `<div class="assign-row">
            <span class="assign-repo">📦 ${escapeHtml(r.name)}</span>
            <div class="assign-boxes">${boxes}</div>
        </div>`;
    }).join('');

    root.innerHTML = `
        <div class="squad-chips">${squadsHtml}</div>
        <div class="assign-list">${reposHtml}</div>
    `;

    // Wiring
    root.querySelectorAll('[data-squad-del]').forEach(b =>
        b.addEventListener('click', () => deleteSquad(b.getAttribute('data-squad-del'))));
    root.querySelectorAll('[data-squad-rename]').forEach(inp =>
        inp.addEventListener('change', () => renameSquad(inp.getAttribute('data-squad-rename'), inp.value)));
    // Cocher une case = affecter à cette squad ; décocher = retirer (Non assignée).
    root.querySelectorAll('[data-assign-repo]').forEach(cb =>
        cb.addEventListener('change', () => {
            const repoId = cb.getAttribute('data-assign-repo');
            const squadId = cb.checked ? cb.getAttribute('data-assign-squad') : '';
            assignRepoToSquad(repoId, squadId);
        }));
}

// Re-render du dashboard à partir du cache (sans refetch GitLab).
function rerenderFromCache() {
    if (!lastResults) return;
    const period = getPeriod();
    const days = period ? period.days : 30;
    renderResults(lastResults);
    renderHeatmap(lastResults, days);
    renderRepoTable(lastResults, days);
}

function levelColor(cls) {
    switch (cls) {
        case 'elite':  return '#1d9e75';
        case 'high':   return '#7c5cff';
        case 'medium': return '#fb923c';
        case 'low':    return '#e24b4a';
        default:       return '#5f5e5a';
    }
}

// Couleur de fond translucide pour les cellules de heatmap.
function levelCellBg(cls) {
    switch (cls) {
        case 'elite':  return 'rgba(45,212,191,0.55)';
        case 'high':   return 'rgba(124,92,255,0.55)';
        case 'medium': return 'rgba(251,146,60,0.55)';
        case 'low':    return 'rgba(239,68,68,0.6)';
        default:       return 'rgba(255,255,255,0.06)';
    }
}

function renderHeatmap(results, days) {
    const root = document.getElementById('heatmapContainer');
    if (!root) return;
    const tree = buildTribeTree(results, days);

    const cell = (lvl, val, unit) => `
        <div class="hm-cell" style="background:${levelCellBg(lvl.cls)};" title="${lvl.level}">
            <span class="hm-val">${val}${unit}</span>
            <span class="hm-lvl">${lvl.level}</span>
        </div>`;

    const rows = tree.squads.map(sq => {
        const a = sq.agg;
        return `<div class="hm-row">
            <div class="hm-label">🗂️ ${escapeHtml(sq.name)} <span style="opacity:0.5;">(${sq.repos.length})</span></div>
            ${cell(a.dfLevel, a.df, '/sem')}
            ${cell(a.ltLevel, a.lt !== null ? a.lt : 'N/A', a.lt !== null ? 'h' : '')}
            ${cell(a.cfrLevel, a.cfr, '%')}
            ${cell(a.mttrLevel, a.mttr !== null ? a.mttr : 'N/A', a.mttr !== null ? 'h' : '')}
        </div>`;
    }).join('');

    root.innerHTML = `
        <div class="hm-row hm-head">
            <div class="hm-label"></div>
            <div class="hm-col-head">Deploy Freq</div>
            <div class="hm-col-head">Lead Time</div>
            <div class="hm-col-head">CFR</div>
            <div class="hm-col-head">MTTR</div>
        </div>
        ${rows}
    `;
}

// Tableau détaillé : squad → repos.
function renderRepoTable(results, days) {
    const tbody = document.getElementById('reposTableBody');
    if (!tbody) return;
    const tree = buildTribeTree(results, days);
    const invalidCount = results.filter(r => r.error || r.df === undefined).length;

    tbody.innerHTML = tree.squads.map(sq => {
        const a = sq.agg;
        const squadRow = `<tr class="squad-row">
            <td><strong>🗂️ ${escapeHtml(sq.name)}</strong> <span style="opacity:0.5;">(${sq.repos.length})</span></td>
            <td>${a.df}/sem <span class="level-badge ${a.dfLevel.cls}">${a.dfLevel.level}</span></td>
            <td>${a.lt !== null ? a.lt+'h' : 'N/A'} ${a.ltLevel.cls !== 'na' ? `<span class="level-badge ${a.ltLevel.cls}">${a.ltLevel.level}</span>` : ''}</td>
            <td>${a.cfr}% <span class="level-badge ${a.cfrLevel.cls}">${a.cfrLevel.level}</span></td>
            <td>${a.mttr !== null ? a.mttr+'h' : 'N/A'} ${a.mttrLevel.cls !== 'na' ? `<span class="level-badge ${a.mttrLevel.cls}">${a.mttrLevel.level}</span>` : ''}</td>
            <td><span class="level-badge ${sq.worst.cls}">${sq.worst.level}</span></td>
        </tr>`;
        const repoRows = sq.repos.map(r => {
            const worst = worstLevel(r);
            const fallbackBadge = r.usedFallback ? ` <span title="Calcul sur tous pipelines (pas de branche prod détectée)" style="cursor:help;">⚠️</span>` : '';
            return `<tr class="repo-row">
                <td style="padding-left:32px;opacity:0.85;">↳ ${escapeHtml(r.name)}${fallbackBadge}</td>
                <td>${r.df}/sem <span class="level-badge ${r.dfLevel.cls}">${r.dfLevel.level}</span></td>
                <td>${r.lt !== null ? r.lt+'h' : 'N/A'} ${r.ltLevel.cls !== 'na' ? `<span class="level-badge ${r.ltLevel.cls}">${r.ltLevel.level}</span>` : ''}</td>
                <td>${r.cfr}% <span class="level-badge ${r.cfrLevel.cls}">${r.cfrLevel.level}</span></td>
                <td>${r.mttr !== null ? r.mttr+'h' : 'N/A'} ${r.mttrLevel.cls !== 'na' ? `<span class="level-badge ${r.mttrLevel.cls}">${r.mttrLevel.level}</span>` : ''}</td>
                <td><span class="level-badge ${worst.cls}">${worst.level}</span></td>
            </tr>`;
        }).join('');
        return squadRow + repoRows;
    }).join('') + (invalidCount ? `<tr><td colspan="6" style="opacity:0.5;">${invalidCount} repo(s) sans données.</td></tr>` : '');
}

// ═══════════════════════════════════════════════════════════
// GRAPHES DE TENDANCE (évolution dans le temps)
// Recalcul par tranches : on découpe la période globale en N segments
// et on calcule la tribu agrégée sur chaque segment → courbe.
// ═══════════════════════════════════════════════════════════

// Construit les bornes des segments (du plus ancien au plus récent).
function buildTrendSegments() {
    const period = getPeriod();
    if (!period) return [];
    const totalDays = period.days;
    const until = new Date(period.until);

    // Choix du nombre/taille de segments selon la durée totale.
    let segCount, segDays, label;
    if (totalDays <= 31)       { segCount = Math.min(totalDays, 6); segDays = Math.ceil(totalDays / segCount); label = 'd'; }
    else if (totalDays <= 100) { segCount = Math.ceil(totalDays / 14); segDays = 14; label = 'sem'; }
    else                       { segCount = Math.ceil(totalDays / 30); segDays = 30; label = 'mois'; }

    const segments = [];
    for (let i = segCount - 1; i >= 0; i--) {
        const segUntil = new Date(until); segUntil.setDate(segUntil.getDate() - (segDays * i));
        const segSince = new Date(segUntil); segSince.setDate(segSince.getDate() - segDays);
        segments.push({
            since: segSince.toISOString(),
            until: segUntil.toISOString(),
            days: segDays,
            tag: segUntil.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
        });
    }
    return segments;
}

async function renderTrends() {
    const grid = document.getElementById('trendsGrid');
    if (!grid) return;
    const segments = buildTrendSegments();
    if (!segments.length) { grid.innerHTML = '<div class="trend-loading">Période invalide.</div>'; return; }

    grid.innerHTML = '<div class="trend-loading">Calcul de l\'évolution sur ' + segments.length + ' périodes…</div>';

    const repos = currentWorkspace.repositories;
    const points = [];
    for (const seg of segments) {
        const repoRes = await Promise.all(
            repos.map(repo => computeRepoMetrics(repo, seg.since, seg.until, seg.days))
        );
        const tree = buildTribeTree(repoRes, seg.days);
        points.push({ tag: seg.tag, agg: tree.tribe.agg });
    }

    const labels = points.map(p => p.tag);
    const seriesDef = [
        { key: 'df',   label: 'Deploy Frequency',    unit: '/sem', better: 'up'   },
        { key: 'lt',   label: 'Lead Time',           unit: 'h',    better: 'down' },
        { key: 'cfr',  label: 'Change Failure Rate', unit: '%',    better: 'down' },
        { key: 'mttr', label: 'MTTR',                unit: 'h',    better: 'down' }
    ];

    // 4 petits graphes séparés, un par métrique.
    grid.innerHTML = seriesDef.map(s => {
        const series = [{ key: s.key, label: s.label, points: points.map(p => p.agg[s.key]) }];
        const trend = trendBadge(points.map(p => p.agg[s.key]), s.better);
        return `<div class="mini-trend">
            <div class="mini-trend-head">
                <span class="mini-trend-title">${s.label}</span>
                ${trend}
            </div>
            ${svgLineChart(series, labels, { width: 420, height: 150 })}
        </div>`;
    }).join('');

    // Injecte aussi la flèche de tendance dans chaque carte tribu.
    seriesDef.forEach(s => {
        const el = document.getElementById('trend-' + s.key);
        if (el) el.innerHTML = trendBadge(points.map(p => p.agg[s.key]), s.better);
    });
}

function openRepoHub(id) {
    const repo = currentWorkspace.repositories.find(r => r.id === id);
    if (!repo) return;
    // Le hub lit l'auth dans localStorage et sélectionne le repo via la clé
    // 'hub_selected_repo_id'. On l'écrit pour garantir la bonne sélection à
    // l'arrivée, et on passe aussi ?repo=<id> (que le hub pourra lire si migré).
    localStorage.setItem('hub_selected_repo_id', String(repo.id));
    window.location.href = `${HUB_URL}?repo=${encodeURIComponent(repo.id)}`;
}

function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }

function showError(msg) {
    document.getElementById('loadingContainer').style.display = 'none';
    const err = document.getElementById('errorContainer');
    err.style.display = 'block';
    err.innerHTML = `<div class="error-message">❌ ${msg}</div>`;
}