// [hub] Extrait de hub.js — drilldown/stats.js (portée globale, script classique)
        const DD_CACHE_PREFIX = 'hub_dd_';
        const DD_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

        function readDrilldownCache(repoId, key) {
            try {
                const raw = localStorage.getItem(`${DD_CACHE_PREFIX}${repoId}_${key}`);
                if (!raw) return null;
                const data = JSON.parse(raw);
                if (Date.now() - data.ts > DD_CACHE_TTL_MS) return null;
                return data.values;
            } catch { return null; }
        }
        function writeDrilldownCache(repoId, key, values) {
            try {
                localStorage.setItem(`${DD_CACHE_PREFIX}${repoId}_${key}`,
                    JSON.stringify({ ts: Date.now(), values }));
            } catch (e) { console.warn('DD cache write failed:', e); }
        }

        // ───── BADGES ──────────────────────────────────────────────────────
        const HUB_BADGES = [
            { id: 'fast_pipeline',   icon: '⚡', name: 'Fast Pipeline',        xp: 100, condition: (s) => s.dora && (s.dora.levels.df === 'Elite' || s.dora.levels.df === 'High') },
            { id: 'stable_build',    icon: '✅', name: 'Stable Build',         xp: 150, condition: (s) => s.dora && s.dora.cfr != null && s.dora.cfr <= 10 },
            { id: 'frequent_deploy', icon: '📦', name: 'Frequent Deploy',      xp: 100, condition: (s) => s.deploys && s.deploys.currentPerDay >= 0.7 }, // ~5/sem
            { id: 'dora_elite',      icon: '🚀', name: 'DORA Elite',           xp: 250, condition: (s) => s.dora && s.dora.eliteCount === 4 },
            { id: 'branch_guardian', icon: '🛡️', name: 'Branch Guardian',     xp: 100, condition: (s) => s.maturity && s.maturity.axes && s.maturity.axes['Sécurité'] >= 60 },
            { id: 'fast_review',     icon: '👀', name: 'Fast Review',          xp: 100, condition: (s) => s.dora && s.dora.lt != null && s.dora.lt < 48 }, // < 2j
            { id: 'high_maturity',   icon: '🎯', name: 'High Maturity',        xp: 200, condition: (s) => s.maturity && s.maturity.score8 != null && s.maturity.score8 >= 6 },
            { id: 'good_distribution', icon: '🤝', name: 'Good Distribution', xp: 150, condition: (s) => s.busFactor && s.busFactor.bf != null && s.busFactor.bf >= 3 },
            { id: 'versioning',      icon: '🏷️', name: 'Semantic Versioning', xp: 75,  condition: (s) => s.tags && s.tags >= 5 },
            { id: 'mttr_low',        icon: '⏱️', name: 'Quick Recovery',     xp: 100, condition: (s) => s.dora && s.dora.mttr != null && s.dora.mttr < 24 }
        ];

        function evaluateBadges(syn) {
            return HUB_BADGES.filter(b => {
                try { return b.condition(syn); } catch { return false; }
            });
        }

        function xpFromBadges(badges) {
            return badges.reduce((sum, b) => sum + b.xp, 0);
        }

        // ───── Helpers de format ───────────────────────────────────────────
        function fmtMB(bytes) {
            if (bytes == null) return null;
            const mb = bytes / (1024 * 1024);
            if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
            if (mb < 1000) return `${mb.toFixed(0)} MB`;
            return `${(mb / 1024).toFixed(1)} GB`;
        }
        function fmtHours(h) {
            if (h == null) return null;
            if (h < 1) return `${(h * 60).toFixed(0)} min`;
            if (h < 24) return `${h.toFixed(1)} h`;
            return `${(h / 24).toFixed(1)} j`;
        }
        function gradeFromScore(score) {
            // 0-100 → A+ … F
            if (score == null) return null;
            if (score >= 95) return 'A+';
            if (score >= 85) return 'A';
            if (score >= 75) return 'B+';
            if (score >= 65) return 'B';
            if (score >= 55) return 'C+';
            if (score >= 45) return 'C';
            if (score >= 35) return 'D';
            return 'F';
        }

        // ───── Compute par chemin ──────────────────────────────────────────
        async function computeDrilldownStats(key, repo) {
            // On part de la synthesis bar déjà calculée si dispo
            const syn = readSynCache(repo.id);

            switch (key) {
                case 'measure':  return computeStats_measure(repo, syn);
                case 'deliver':  return computeStats_deliver(repo, syn);
                case 'inspect':  return computeStats_inspect(repo, syn);
                case 'collab':   return computeStats_collab(repo, syn);
                default: return {};
            }
        }

        // ───── MESURER ─────────────────────────────────────────────────────
        async function computeStats_measure(repo, syn) {
            if (!syn) syn = await computeSynthesis(repo);
            const history = readSynHistory(repo.id);
            const badges = evaluateBadges(syn);
            const xp = xpFromBadges(badges);

            // DORA
            let doraStat = null;
            if (syn.dora && syn.dora.globalLevel) {
                const eliteCount = syn.dora.eliteCount;
                const validCount = syn.dora.validCount;
                const meta = syn.dora.globalLevel === 'Elite'
                    ? `${eliteCount}/${validCount} — top 1% mondial`
                    : `${eliteCount}/${validCount} en Elite`;
                doraStat = { value: syn.dora.globalLevel, meta };
            }

            // Maturité globale + tendance trimestre
            let matuStat = null;
            if (syn.maturity && syn.maturity.score8 != null) {
                const cur = syn.maturity.score8;
                const valHtml = `${cur.toFixed(1)}<span class="suffix">/8</span>`;
                const prev = findEntryNearDaysAgo(history, 90);
                let meta;
                if (prev && prev.syn.maturity && prev.syn.maturity.score8 != null) {
                    const delta = cur - prev.syn.maturity.score8;
                    const arrow = delta > 0.1 ? '<span class="up">▲</span>' : delta < -0.1 ? '<span class="down">▼</span>' : '<span class="neutral">·</span>';
                    const sign = delta > 0 ? '+' : '';
                    meta = `${arrow} ${sign}${delta.toFixed(1)} vs trimestre dernier`;
                } else {
                    meta = `<span class="neutral">·</span> Historique en construction`;
                }
                matuStat = { value: valHtml, meta };
            }

            // XP / badges
            const xpStat = {
                value: String(xp),
                meta: `${badges.length} badge${badges.length > 1 ? 's' : ''} débloqué${badges.length > 1 ? 's' : ''}`
            };

            // Bus factor
            let bfStat = null;
            if (syn.busFactor && syn.busFactor.bf != null) {
                const bf = syn.busFactor.bf;
                let meta;
                if (bf < 1.5) meta = '<span class="down">▼</span> Risque concentration';
                else if (bf < 2.5) meta = '<span class="warn">·</span> À surveiller';
                else meta = '<span class="up">▲</span> Bonne distribution';
                bfStat = { value: bf.toFixed(1), meta };
            }

            return { dora: doraStat, maturity: matuStat, xp: xpStat, busFactor: bfStat };
        }

        // ───── LIVRER ──────────────────────────────────────────────────────
        async function computeStats_deliver(repo, syn) {
            if (!syn) syn = await computeSynthesis(repo);
            const branch = repo.default_branch || 'main';
            const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

            // Feature flags : endpoint dédié GitLab (peut renvoyer 404 si non activé)
            const [mrsOpen, featureFlags, latestPipeline] = await Promise.all([
                gl(`/projects/${repo.id}/merge_requests?state=opened&per_page=100&order_by=created_at`),
                gl(`/projects/${repo.id}/feature_flags`),
                gl(`/projects/${repo.id}/pipelines?ref=${encodeURIComponent(branch)}&per_page=1`)
            ]);

            // Deploys (30j) — depuis syn
            let deploysStat = null;
            if (syn.deploys && syn.deploys.currentPerDay != null) {
                const total = Math.round(syn.deploys.currentPerDay * 30);
                const perDay = syn.deploys.currentPerDay;
                deploysStat = {
                    value: String(total),
                    meta: `~${perDay >= 10 ? perDay.toFixed(0) : perDay.toFixed(1)}/jour en moyenne`
                };
            }

            // Feature flags
            let ffStat = null;
            if (Array.isArray(featureFlags)) {
                const active = featureFlags.filter(f => f.active === true || f.active === undefined).length;
                const oldFlags = featureFlags.filter(f => {
                    if (!f.created_at) return false;
                    const age = (Date.now() - new Date(f.created_at)) / 86400000;
                    return age > 60;
                }).length;
                ffStat = {
                    value: String(active),
                    meta: oldFlags > 0
                        ? `<span class="warn">▲</span> ${oldFlags} flag${oldFlags > 1 ? 's' : ''} > 60 jours`
                        : '<span class="up">✓</span> Tous récents'
                };
            } else {
                // Feature flags pas activés sur GitLab CE/instance
                ffStat = { value: '—', meta: '<span class="neutral">·</span> Non disponible' };
            }

            // MRs en attente
            let mrStat = null;
            if (Array.isArray(mrsOpen)) {
                const count = mrsOpen.length;
                if (count === 0) {
                    mrStat = { value: '0', meta: '<span class="up">✓</span> Aucune MR en attente' };
                } else {
                    const oldest = mrsOpen.reduce((max, m) =>
                        new Date(m.created_at) < new Date(max.created_at) ? m : max, mrsOpen[0]);
                    const ageMs = Date.now() - new Date(oldest.created_at);
                    const ageH = ageMs / 3600000;
                    const ageFmt = ageH < 1 ? `${Math.round(ageH * 60)} min`
                        : ageH < 24 ? `${Math.round(ageH)}h`
                        : `${Math.round(ageH / 24)}j`;
                    mrStat = {
                        value: String(count),
                        meta: `Plus vieille : ${ageFmt}`
                    };
                }
            }

            // Pipeline status
            let pipeStat = null;
            if (Array.isArray(latestPipeline) && latestPipeline.length > 0) {
                const last = latestPipeline[0];
                const status = last.status;
                let valHtml, meta;
                if (status === 'success') {
                    valHtml = '<span class="up">✓ Vert</span>';
                    meta = `Dernier pipeline sur <strong>${branch}</strong>`;
                } else if (status === 'failed') {
                    valHtml = '<span class="down">✗ Rouge</span>';
                    meta = `<span class="down">▼</span> Pipeline en échec`;
                } else if (status === 'running' || status === 'pending') {
                    valHtml = '<span class="warn">⏳ En cours</span>';
                    meta = `Pipeline en exécution`;
                } else {
                    valHtml = status;
                    meta = `Statut : ${status}`;
                }
                pipeStat = { value: valHtml, meta };
            }

            return { deploys30: deploysStat, featureFlags: ffStat, mrsOpen: mrStat, pipelineStatus: pipeStat };
        }

        // ───── INSPECTER ───────────────────────────────────────────────────
        async function computeStats_inspect(repo, syn) {
            if (!syn) syn = await computeSynthesis(repo);

            // Pour la taille du repo et les MRs ouvertes
            const [projectFull, mrsOpen] = await Promise.all([
                gl(`/projects/${repo.id}?statistics=true`),
                gl(`/projects/${repo.id}/merge_requests?state=opened&per_page=100`)
            ]);

            // Note sécurité — depuis l'axe Sécurité de syn.maturity
            let secStat = null;
            if (syn.maturity && syn.maturity.axes && syn.maturity.axes['Sécurité'] != null) {
                const secScore = syn.maturity.axes['Sécurité'];
                const grade = gradeFromScore(secScore);
                const isGood = secScore >= 70;
                secStat = {
                    value: grade,
                    meta: isGood
                        ? '<span class="up">✓</span> Bonne hygiène sécurité'
                        : `<span class="warn">⚠</span> ${secScore < 50 ? 'À renforcer' : 'Marges de progrès'}`
                };
            }

            // Poids du repo
            let sizeStat = null;
            if (projectFull && projectFull.statistics) {
                const bytes = projectFull.statistics.repository_size || 0;
                const lfs = projectFull.statistics.lfs_objects_size || 0;
                const total = bytes + lfs;
                const mb = total / (1024 * 1024);
                const meta = mb > 500
                    ? `<span class="warn">▲</span> Diet conseillé`
                    : mb > 100
                    ? `<span class="neutral">·</span> Acceptable`
                    : `<span class="up">✓</span> Léger`;
                sizeStat = { value: fmtMB(total), meta };
            }

            // Branches obsolètes — réutilise le calcul de syn.maturity (source unique,
            // évite un 2e fetch de /repository/branches et toute divergence de seuil).
            let stStat = null;
            if (syn.maturity && syn.maturity.staleBranches != null) {
                const stale = syn.maturity.staleBranches;
                const merged = syn.maturity.mergedBranches || 0;
                stStat = {
                    value: String(stale),
                    meta: stale === 0
                        ? '<span class="up">✓</span> Repo propre'
                        : merged > 0
                        ? `${merged} déjà mergée${merged > 1 ? 's' : ''} à nettoyer`
                        : 'Cleanup recommandé'
                };
            }

            // MRs zombies — ouvertes ET inactives depuis > 7j (updated_at, pas created_at :
            // une vieille MR activement mise à jour n'est pas un zombie).
            let zombieStat = null;
            if (Array.isArray(mrsOpen)) {
                const zombies = mrsOpen.filter(mr => {
                    const ref = mr.updated_at || mr.created_at;
                    const age = (Date.now() - new Date(ref)) / 86400000;
                    return age > 7;
                }).length;
                zombieStat = {
                    value: String(zombies),
                    meta: zombies === 0
                        ? '<span class="up">✓</span> Aucune MR en sommeil'
                        : `Sur ${mrsOpen.length} MR${mrsOpen.length > 1 ? 's' : ''} ouverte${mrsOpen.length > 1 ? 's' : ''}`
                };
            }

            return { securityScore: secStat, repoSize: sizeStat, staleBranches: stStat, zombieMRs: zombieStat };
        }

        // ───── COLLABORER ──────────────────────────────────────────────────
        async function computeStats_collab(repo, syn) {
            if (!syn) syn = await computeSynthesis(repo);
            const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
            const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

            // Fetches dédiés
            const [mrsMerged7, contributors] = await Promise.all([
                gl(`/projects/${repo.id}/merge_requests?state=merged&per_page=100&updated_after=${since7}`),
                gl(`/projects/${repo.id}/repository/contributors`)
            ]);

            // MRs mergées cette semaine
            let mrWeekStat = null;
            if (Array.isArray(mrsMerged7)) {
                const count = mrsMerged7.length;
                let meta;
                if (count === 0) {
                    meta = '<span class="neutral">·</span> Aucune mergée cette semaine';
                } else {
                    // Lead time moyen depuis syn.dora
                    const lt = syn.dora && syn.dora.lt;
                    meta = lt != null
                        ? `Lead time moyen : ${fmtHours(lt)}`
                        : `Sur les 7 derniers jours`;
                }
                mrWeekStat = { value: String(count), meta };
            }

            // Reviewers actifs (uniques sur les MRs mergées 30j)
            let reviewersStat = null;
            const mrs30 = await gl(`/projects/${repo.id}/merge_requests?state=merged&per_page=100&updated_after=${since30}`);
            if (Array.isArray(mrs30)) {
                const reviewersSet = new Set();
                mrs30.forEach(mr => {
                    if (mr.reviewers && Array.isArray(mr.reviewers)) {
                        mr.reviewers.forEach(r => reviewersSet.add(r.id));
                    }
                    if (mr.assignees && Array.isArray(mr.assignees)) {
                        mr.assignees.forEach(a => reviewersSet.add(a.id));
                    }
                });
                const count = reviewersSet.size;
                reviewersStat = {
                    value: String(count),
                    meta: count === 0 ? '<span class="neutral">·</span> Pas de reviewers détectés' :
                          count >= 3 ? '<span class="up">✓</span> Bonne diversité' :
                          '<span class="warn">·</span> Diversité limitée'
                };
            }

            // Contributeurs actifs (commits sur 30j)
            let contribStat = null;
            if (Array.isArray(contributors)) {
                // GitLab renvoie les contributeurs all-time, on filtre approximativement par commits récents
                const sorted = contributors.sort((a, b) => b.commits - a.commits);
                const totalActive = sorted.filter(c => c.commits >= 3).length;
                const total = sorted.length;
                contribStat = {
                    value: total > 0 ? `${totalActive}/${total}` : '—',
                    meta: total === 0 ? '<span class="warn">·</span> Aucun commit récent' :
                          totalActive === total ? '<span class="up">✓</span> Tous actifs' :
                          `${total - totalActive} peu actifs`
                };
            }

            // Lead time MR (déjà calculé dans syn.dora)
            let leadStat = null;
            if (syn.dora && syn.dora.lt != null) {
                const lt = syn.dora.lt;
                let meta;
                if (lt < 24) meta = '<span class="up">▲</span> Très rapide';
                else if (lt < 72) meta = '<span class="up">·</span> Sous 3 jours';
                else if (lt < 168) meta = '<span class="warn">·</span> Sous 7 jours';
                else meta = '<span class="down">▼</span> Au-delà d\'une semaine';
                leadStat = { value: fmtHours(lt), meta };
            }

            return { mrsMergedWeek: mrWeekStat, reviewersActive: reviewersStat, contributorsActive: contribStat, leadTimeMR: leadStat };
        }

        // ═══════════════════════════════════════════════════════════════
        // AJOUT WORKSPACE — strictement additif, fonctions préfixées ws*
        // Lit localStorage.devops_hub_workspaces en lecture seule pour le
        // dropdown / la vue. N'écrit QU'À l'import explicite, sans toucher
        // à .token, .gitlabUrl, .username — only à .workspaces.
        // ═══════════════════════════════════════════════════════════════
