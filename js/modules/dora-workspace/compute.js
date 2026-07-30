/* dora-workspace · compute.js — logique pure (calculs, helpers). */

function daysAgoISO(d) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString(); }

// Vraie médiane : moyenne des deux centraux pour les tableaux pairs.
// Mutation du tableau (sort en place) acceptée — l'appelant nous le passe pour ce calcul.

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

            // MTTR : un incident = une série de failed jusqu'au prochain success sur la
            // même branche. On ne démarre le chrono qu'à la PREMIÈRE panne d'une série :
            // compter chaque failed consécutif (F1,F2,S) créerait plusieurs échantillons
            // pour un seul incident et biaiserait la médiane vers le bas.
            const mttrSource = prod.length > 0 ? prod : pipelines;
            const sortedAsc = [...mttrSource].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            const recov = [];
            for (let i = 0; i < sortedAsc.length - 1; i++) {
                if (sortedAsc[i].status === 'failed') {
                    const prevSameRef = sortedAsc.slice(0, i).reverse().find(p => p.ref === sortedAsc[i].ref);
                    if (prevSameRef && prevSameRef.status === 'failed') continue;
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

function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }

