// [hub] Extrait de hub.js — metrics/maturity.js (portée globale, script classique)
        // ───── Calcul Maturité (carte 3 — data only synthèse) ──────────────
        async function computeMaturity(repo, pipelines, mrs, branches, ciFile, protectedBranches, projectDetails, tagsCount, approvals) {
            // 7 axes data ramenés à un score 0-100 chacun, puis converti en /8 (sécurité comprise)
            const branch = repo.default_branch || 'main';
            // Scoring CONTINU : interpole linéairement entre les paliers au lieu de
            // claquer 30/60/100. Mêmes ancres (excellent→100, ok→60, plancher→30) donc
            // les seuils de badges/achievements qui lisent score8 restent valides ;
            // on remplit juste le continuum pour discriminer deux repos proches.
            const lerp = (x, x0, x1, y0, y1) => y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
            const score = (v, thresholds) => {
                // thresholds = [excellent, ok] — "plus grand = mieux"
                if (v == null) return null;
                const [exc, ok] = thresholds;
                if (v >= exc) return 100;                       // au-delà d'excellent → plafonne à 100
                if (v >= ok)  return lerp(v, ok, exc, 60, 100); // entre ok et excellent → 60..100
                if (v >= 0)   return lerp(v, 0, ok, 30, 60);    // entre 0 et ok → 30..60
                return 30;
            };
            const scoreInv = (v, thresholds) => {
                // thresholds = [excellent, ok] — "plus petit = mieux"
                if (v == null) return null;
                const [exc, ok] = thresholds;
                if (v <= exc) return 100;                        // sous excellent → 100
                if (v <= ok)  return lerp(v, exc, ok, 100, 60);  // entre excellent et ok → 100..60
                // au-delà de ok : on descend de 60 vers 30, plancher atteint à 3× le seuil ok
                const floorAt = ok * 3;
                if (v < floorAt) return lerp(v, ok, floorAt, 60, 30);
                return 30;
            };
            const avg = arr => {
                const v = arr.filter(x => x != null);
                return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length;
            };

            const since30 = Date.now() - 30 * 86400000;
            const mainPipes = (pipelines || []).filter(p =>
                p.ref === branch && new Date(p.created_at).getTime() >= since30);
            const successCount = mainPipes.filter(p => p.status === 'success').length;
            const successRate = mainPipes.length > 0
                ? (successCount / mainPipes.length) * 100 : null;

            // Axe Delivery (D)
            const dfPerDay = successCount / 30;
            const axeDelivery = avg([
                score(dfPerDay, [1, 0.14]),                     // D01 deploys/jour
                score(successRate, [90, 70]),                    // D02 pipeline ok
                score(tagsCount, [5, 1])                         // D04 releases tagées
            ]);

            // Axe Qualité (Q) — basé sur MRs récentes (mergées sur 30j)
            const recentMerged = (mrs || []).filter(mr =>
                mr.state === 'merged' && mr.merged_at &&
                new Date(mr.merged_at).getTime() >= since30);
            const reviewTimes = recentMerged.map(mr =>
                (new Date(mr.merged_at) - new Date(mr.created_at)) / 86400000);
            const avgReview = reviewTimes.length > 0
                ? reviewTimes.reduce((a, b) => a + b, 0) / reviewTimes.length : null;
            const axeQuality = avg([
                scoreInv(avgReview, [2, 7])                      // Q01 review time
            ]);

            // Axe Stabilité (S)
            const failed = mainPipes.filter(p => p.status === 'failed').length;
            const failRate = mainPipes.length > 0 ? (failed / mainPipes.length) * 100 : null;
            const axeStability = avg([
                scoreInv(failRate, [5, 15])                      // S01 fail rate
            ]);

            // Axe Hygiène (H)
            const allBranches = branches || [];
            const staleBranches = allBranches.filter(b => {
                if (b.name === branch) return false;
                if (!b.commit || !b.commit.committed_date) return false;
                return (Date.now() - new Date(b.commit.committed_date)) / 86400000 > 30;
            }).length;
            const mergedBranches = allBranches.filter(b => b.merged === true && b.name !== branch).length;
            const axeHygiene = avg([
                scoreInv(staleBranches, [5, 20]),                // H01 stale branches
                ciFile ? 100 : 30                                 // H04/P05 CI file
            ]);

            // Axe Résilience (R) — capacité à se remettre d'un échec.
            // Signal honnête depuis les pipelines : après un 'failed', le pipeline
            // suivant (chronologique) repasse-t-il en 'success' ? Un repo résilient
            // ne reste pas cassé longtemps. On regarde la séquence sur main.
            let axeResilience = null;
            if (mainPipes.length >= 4) {
                // tri chronologique ascendant
                const seq = [...mainPipes]
                    .filter(p => p.created_at)
                    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                let failures = 0, recovered = 0;
                for (let i = 0; i < seq.length - 1; i++) {
                    if (seq[i].status === 'failed') {
                        failures++;
                        // cherche le prochain pipeline conclusif
                        for (let j = i + 1; j < seq.length; j++) {
                            if (seq[j].status === 'success') { recovered++; break; }
                            if (seq[j].status === 'failed') break; // reste cassé
                        }
                    }
                }
                if (failures > 0) {
                    const recoveryRate = (recovered / failures) * 100;  // % d'échecs suivis d'une reprise
                    axeResilience = avg([
                        score(recoveryRate, [90, 50])                 // R01 taux de récupération
                    ]);
                } else {
                    // aucun échec sur la période → résilience non éprouvée mais saine
                    axeResilience = avg([score(100, [90, 50])]);
                }
            }

            // Axe Pratiques (P)
            const axePractices = avg([
                ciFile ? 100 : 30                                 // P05
            ]);

            // Axe Culture (C) — pratiques de collaboration, mesurées via les MRs mergées.
            // Deux signaux honnêtes côté GitLab :
            //  1. Ratio de MRs reviewées (≥1 approbation OU discussions) avant merge
            //     → une culture saine ne merge pas à l'aveugle.
            //  2. Diversité des auteurs de MR (anti-silo, lié au bus factor).
            let axeCulture = null;
            if (recentMerged.length >= 3) {
                // 1. Review ratio : approbations ou commentaires (selon ce que l'API expose)
                const reviewed = recentMerged.filter(mr =>
                    (mr.upvotes && mr.upvotes > 0) ||
                    (mr.user_notes_count && mr.user_notes_count > 0)
                ).length;
                const reviewRatio = (reviewed / recentMerged.length) * 100;

                // 2. Diversité des auteurs de MR
                const authors = new Set(
                    recentMerged.map(mr => mr.author && mr.author.id).filter(Boolean)
                );
                const authorCount = authors.size;

                axeCulture = avg([
                    score(reviewRatio, [80, 40]),                    // C01 MRs reviewées
                    score(authorCount, [4, 1])                       // C02 diversité auteurs
                ]);
            }

            // Axe Sécurité (X) — booléens stricts (absent = non crédité)
            const pb = protectedBranches || [];
            const defProtected = pb.find(p => p.name === branch);
            const sec1 = defProtected ? 100 : 30;
            const sec2 = defProtected && defProtected.allow_force_push === false ? 100 : 30;
            // Réglages d'approbation : priorité à l'endpoint dédié /approvals (ap),
            // fallback sur /projects/:id (pd) au cas où, strict sinon (non vérifiable = 30).
            const ap = approvals || {};
            const pd = projectDetails || {};
            const pick = (k) => (ap[k] !== undefined ? ap[k] : pd[k]); // /approvals prioritaire
            const sec3 = pick('merge_requests_author_approval') === false ? 100 : 30;
            const sec4 = pick('merge_requests_disable_committers_approval') === true ? 100 : 30;
            const sec5 = pick('reset_approvals_on_push') === true ? 100 : 30;
            const axeSecurity = avg([sec1, sec2, sec3, sec4, sec5]);

            // Récap par axe (8 axes)
            const axes = {
                'Delivery':    axeDelivery,
                'Qualité':     axeQuality,
                'Stabilité':   axeStability,
                'Hygiène':     axeHygiene,
                'Résilience':  axeResilience,
                'Pratiques':   axePractices,
                'Culture':     axeCulture,
                'Sécurité':    axeSecurity
            };

            // Score global : moyenne des axes non-null, ramenée sur 8
            const validAxes = Object.entries(axes).filter(([_, v]) => v != null);
            if (validAxes.length === 0) {
                return { score8: null, axes, weakest: null, staleBranches, mergedBranches };
            }
            const meanScore = validAxes.reduce((s, [_, v]) => s + v, 0) / validAxes.length;
            const score8 = (meanScore / 100) * 8;

            // Axe le plus faible
            const sorted = [...validAxes].sort((a, b) => a[1] - b[1]);
            const weakest = sorted[0][0];

            return { score8, axes, weakest, staleBranches, mergedBranches };
        }
