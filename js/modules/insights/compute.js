/* insights · compute.js — logique pure (calculs, helpers). */

function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }

// ════════════════════════════════════════════════════════════
//  LOAD ALL DATA
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
