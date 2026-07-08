// [hub] Extrait de hub.js — metrics/dora.js (portée globale, script classique)
        // ───── Calcul DORA (carte 1) ───────────────────────────────────────
        // Seuils 2024 DORA Accelerate (simplifiés)
        function doraLevel(metricKey, value) {
            if (value == null || !isFinite(value)) return null;
            const T = {
                df:  { elite: 7,    high: 1,      med: 0.25 },   // deploys/SEMAINE : >=7, >=1, >=0.25 (aligné insights.js)
                lt:  { elite: 1,    high: 24,     med: 168 },    // heures : <=1h, <=1j, <=1sem (aligné insights.js)
                cfr: { elite: 5,    high: 10,     med: 15 },     // % : <=5, <=10, <=15
                mttr:{ elite: 1,    high: 24,     med: 168 }     // heures : <1h, <1j, <1sem
            };
            const t = T[metricKey];
            if (!t) return null;
            if (metricKey === 'df') {
                if (value >= t.elite) return 'Elite';
                if (value >= t.high) return 'High';
                if (value >= t.med)  return 'Medium';
                return 'Low';
            }
            // pour lt, cfr, mttr : plus c'est petit, mieux c'est
            if (value <= t.elite) return 'Elite';
            if (value <= t.high)  return 'High';
            if (value <= t.med)   return 'Medium';
            return 'Low';
        }
        const LEVEL_RANK = { 'Elite': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
        const WORST_LEVEL = (levels) => {
            const valid = levels.filter(l => l);
            if (valid.length === 0) return null;
            return valid.reduce((worst, l) =>
                LEVEL_RANK[l] < LEVEL_RANK[worst] ? l : worst, valid[0]);
        };

        // Aligné sur insights.js (computeDORA "maison") : même dédup SHA, mêmes médianes,
        // même CFR multi-fenêtres pondérées, même MTTR scan-forward. Source unique de vérité
        // pour la carte synthèse DORA ET le lead time du drilldown (qui lit syn.dora.lt).
        async function computeDORA(repo, pipelines, mrs) {
            const now = Date.now();
            const d30 = new Date(now);
            d30.setDate(d30.getDate() - 30);

            // Branches "production" pour CFR et MTTR : main/master + default_branch
            const defaultBranch = repo.default_branch || null;
            const prodBranches = new Set(['main', 'master']);
            if (defaultBranch) prodBranches.add(defaultBranch);

            const pipelines30 = (pipelines || []).filter(p => new Date(p.created_at) >= d30);

            // ── Deployment Frequency (déploiements/SEMAINE) ──
            // Tous les success toutes branches, dédupés par SHA (1 commit = 1 déploiement).
            const successByCommit = {};
            pipelines30.forEach(p => {
                if (p.status !== 'success' || !p.sha) return;
                const existing = successByCommit[p.sha];
                if (!existing || new Date(p.created_at) > new Date(existing.created_at)) {
                    successByCommit[p.sha] = p;
                }
            });
            const successPipelines = Object.values(successByCommit);
            pipelines30.forEach(p => { if (p.status === 'success' && !p.sha) successPipelines.push(p); });
            const df = parseFloat(((successPipelines.length / 30) * 7).toFixed(2));

            // ── Lead Time for Changes (first_commit_at → merged_at, médiane, heures) ──
            const mergedMRs = (mrs || []).filter(mr =>
                mr.state === 'merged' && mr.merged_at && new Date(mr.merged_at) >= d30);
            let lt = null;
            if (mergedMRs.length > 0) {
                const leadTimes = mergedMRs
                    .filter(mr => mr.first_commit_at || mr.created_at)
                    .map(mr => (new Date(mr.merged_at) - new Date(mr.first_commit_at || mr.created_at)) / 3600000)
                    .filter(v => v > 0 && v < 8760); // exclut > 1 an (erreurs de données)
                if (leadTimes.length > 0) {
                    leadTimes.sort((a, b) => a - b);
                    const mid = Math.floor(leadTimes.length / 2);
                    lt = leadTimes.length % 2 === 0
                        ? parseFloat(((leadTimes[mid - 1] + leadTimes[mid]) / 2).toFixed(1))
                        : parseFloat(leadTimes[mid].toFixed(1));
                }
            }

            // ── Change Failure Rate (multi-fenêtres pondérées, branches prod, min 5) ──
            const prodPipelines30cfr = pipelines30.filter(p => prodBranches.has(p.ref));
            const totalP = prodPipelines30cfr.length;
            const cfrInsufficient = totalP > 0 && totalP < 5;
            let cfr = null, cfr30 = null, cfr10 = null, cfr5 = null;
            if (totalP >= 5) {
                // CFR 30j (J0-9=2x, J10-19=1.5x, J20-29=1x)
                let w30f = 0, w30t = 0;
                prodPipelines30cfr.forEach(p => {
                    const age = (now - new Date(p.created_at).getTime()) / 86400000;
                    const w = age <= 10 ? 2 : age <= 20 ? 1.5 : 1;
                    w30t += w; if (p.status === 'failed') w30f += w;
                });
                cfr30 = parseFloat(((w30f / w30t) * 100).toFixed(1));

                // CFR 10j (J0-4=2x, J5-9=1.5x)
                const p10 = prodPipelines30cfr.filter(p => (now - new Date(p.created_at).getTime()) / 86400000 <= 10);
                if (p10.length >= 3) {
                    let w10f = 0, w10t = 0;
                    p10.forEach(p => {
                        const age = (now - new Date(p.created_at).getTime()) / 86400000;
                        const w = age <= 5 ? 2 : 1.5;
                        w10t += w; if (p.status === 'failed') w10f += w;
                    });
                    cfr10 = parseFloat(((w10f / w10t) * 100).toFixed(1));
                }

                // CFR 5j (J0-2=2x, J3-4=1.5x)
                const p5 = prodPipelines30cfr.filter(p => (now - new Date(p.created_at).getTime()) / 86400000 <= 5);
                if (p5.length >= 2) {
                    let w5f = 0, w5t = 0;
                    p5.forEach(p => {
                        const age = (now - new Date(p.created_at).getTime()) / 86400000;
                        const w = age <= 2 ? 2 : 1.5;
                        w5t += w; if (p.status === 'failed') w5f += w;
                    });
                    cfr5 = parseFloat(((w5f / w5t) * 100).toFixed(1));
                }

                // Score final pondéré : 5j=50%, 10j=30%, 30j=20%
                let totalWeight = 0.2, weightedCfr = cfr30 * 0.2;
                if (cfr10 !== null) { weightedCfr += cfr10 * 0.3; totalWeight += 0.3; }
                if (cfr5  !== null) { weightedCfr += cfr5  * 0.5; totalWeight += 0.5; }
                cfr = parseFloat((weightedCfr / totalWeight).toFixed(1));
            }

            // ── Time to Restore Service (failed → prochain success même ref, médiane, cap 7j, min 5) ──
            const MTTR_CAP_HOURS = 24 * 7;
            const prodPipelines30 = pipelines30
                .filter(p => prodBranches.has(p.ref))
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            let mttr = null;
            const mttrInsufficient = prodPipelines30.length > 0 && prodPipelines30.length < 5;
            if (prodPipelines30.length >= 5) {
                const restoreTimes = [];
                for (let i = 0; i < prodPipelines30.length - 1; i++) {
                    const p = prodPipelines30[i];
                    if (p.status !== 'failed') continue;
                    const next = prodPipelines30.slice(i + 1).find(n => n.ref === p.ref && n.status === 'success');
                    if (next) {
                        const hours = (new Date(next.created_at) - new Date(p.created_at)) / 3600000;
                        if (hours > 0 && hours <= MTTR_CAP_HOURS) restoreTimes.push(hours);
                    }
                }
                if (restoreTimes.length > 0) {
                    restoreTimes.sort((a, b) => a - b);
                    const mid = Math.floor(restoreTimes.length / 2);
                    mttr = restoreTimes.length % 2 === 0
                        ? parseFloat(((restoreTimes[mid - 1] + restoreTimes[mid]) / 2).toFixed(1))
                        : parseFloat(restoreTimes[mid].toFixed(1));
                }
            }

            const levels = {
                df:   doraLevel('df', df),
                lt:   doraLevel('lt', lt),
                cfr:  doraLevel('cfr', cfr),
                mttr: doraLevel('mttr', mttr)
            };
            const globalLevel = WORST_LEVEL([levels.df, levels.lt, levels.cfr, levels.mttr]) || 'Low';
            const eliteCount = Object.values(levels).filter(l => l === 'Elite').length;
            const validCount = Object.values(levels).filter(l => l).length;

            return { df, lt, cfr, mttr, levels, globalLevel, eliteCount, validCount, cfrInsufficient, mttrInsufficient };
        }
