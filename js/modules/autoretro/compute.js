/* autoretro · compute.js — logique pure (calculs, helpers). */

        function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }


        function escapeAttr(v) { return window.Salsifi.escapeAttr(v); }

        // ══════════════════════════════════════════════════════════════════
        //  TOAST + MODAL — remplacement des alert() bloquants
        // ══════════════════════════════════════════════════════════════════


        async function generateRetro() {
            document.getElementById('generateBtn').disabled = true;
            const overlay = document.getElementById('scanningOverlay');
            const progressBar = document.getElementById('scanningProgress');
            const scanText = document.getElementById('scanningText');
            const scanDetails = document.getElementById('scanningDetails');
            overlay.classList.add('active');

            retroData = {
                commits: [], mergeRequests: [], mergeRequestsOpen: [], issues: [], pipelines: [],
                branches: [], deployments: { dev: [], uat: [], prod: [] },
                contributors: {}, codeAnalysis: { securityIssues: [], debugCode: [], badMessages: [] },
                period: { days: selectedDays, from: new Date(Date.now() - selectedDays * 24 * 60 * 60 * 1000), to: new Date() }
            };
            alerts = []; generatedUS = [];
            const since = retroData.period.from.toISOString();

            try {
                // ── PHASE 1 : 6 fetches principaux en PARALLÈLE ─────────────────────
                // Avant : 6 fetches séquentiels = ~2-3s.
                // Maintenant : Promise.all = ~400ms (le plus lent).
                scanText.textContent = '🔍 Scan GitLab...';
                scanDetails.textContent = 'Commits, MRs, issues, pipelines, environnements';
                progressBar.style.width = '20%';

                const [commits, mergedMRs, openMRs, issues, pipelines, envs] = await Promise.all([
                    fetchGitLab(`/projects/${projectId}/repository/commits?since=${since}&per_page=100`),
                    fetchGitLab(`/projects/${projectId}/merge_requests?state=merged&updated_after=${since}&per_page=100`),
                    fetchGitLab(`/projects/${projectId}/merge_requests?state=opened&per_page=100`),
                    fetchGitLab(`/projects/${projectId}/issues?updated_after=${since}&per_page=100`),
                    fetchGitLab(`/projects/${projectId}/pipelines?updated_after=${since}&per_page=100`),
                    fetchGitLab(`/projects/${projectId}/environments?per_page=20`)
                ]);

                if (commits) retroData.commits = commits;
                if (mergedMRs) retroData.mergeRequests = mergedMRs;
                if (openMRs) retroData.mergeRequestsOpen = openMRs;
                if (issues) retroData.issues = issues;
                if (pipelines) retroData.pipelines = pipelines;

                progressBar.style.width = '60%';

                // ── PHASE 2 : deployments par environnement (PARALLÉLISÉ à 8) ───────
                // Avant : boucle for...await séquentielle = N × ~300ms.
                // Sur LCL avec 10 environnements : ~3s → maintenant ~500ms.
                if (envs && envs.length > 0) {
                    scanText.textContent = '🚀 Déploiements...';
                    scanDetails.textContent = `${envs.length} environnement(s) à analyser`;

                    const periodStart = retroData.period.from;
                    const envTasks = envs.map(env => async () => {
                        const deps = await fetchGitLab(`/projects/${projectId}/environments/${env.id}/deployments?per_page=20`);
                        if (!deps) return null;
                        const recent = deps
                            .filter(d => new Date(d.created_at) >= periodStart)
                            .map(d => ({
                                feature: d.deployable?.commit?.title || 'Deploy',
                                date: new Date(d.created_at)
                            }));
                        return { name: env.name.toLowerCase(), recent };
                    });
                    const envResults = await runWithConcurrency(envTasks, ENV_CONCURRENCY);

                    // Classification par environnement.
                    // ⚠️ Heuristique sur le nom — sur LCL workflow custom
                    // (recette, preprod, integration, homolog), tout finit en "dev".
                    // Cf. vigilance dans la doc.
                    for (const r of envResults) {
                        if (r.status !== 'fulfilled' || !r.value) continue;
                        const { name, recent } = r.value;
                        if (name.includes('prod')) retroData.deployments.prod.push(...recent);
                        else if (name.includes('uat') || name.includes('staging')) retroData.deployments.uat.push(...recent);
                        else retroData.deployments.dev.push(...recent);
                    }
                }

                progressBar.style.width = '85%';

                // ── PHASE 3 : analyse contributeurs + alertes + US + DORA (sync) ────
                scanText.textContent = '👥 Analyse contributeurs...';
                retroData.commits.forEach(c => {
                    if (!retroData.contributors[c.author_name]) retroData.contributors[c.author_name] = { commits: 0, mrs: 0 };
                    retroData.contributors[c.author_name].commits++;
                });
                retroData.mergeRequests.filter(mr => mr.state === 'merged').forEach(mr => {
                    const a = mr.author?.name;
                    if (a) {
                        if (!retroData.contributors[a]) retroData.contributors[a] = { commits: 0, mrs: 0 };
                        retroData.contributors[a].mrs++;
                    }
                });

                scanText.textContent = '🚨 Génération des alertes...';
                progressBar.style.width = '95%';
                analyzeCommitMessages();
                generateAlerts();
                generateUserStories();
                computeDORA();

                progressBar.style.width = '100%';
                await new Promise(r => setTimeout(r, 500));
                showResults();
            } catch (e) {
                console.error('Erreur generateRetro:', e);
                showToast('Erreur lors du scan — voir console', 'error');
            } finally {
                overlay.classList.remove('active');
                document.getElementById('generateBtn').disabled = false;
            }
        }


        function calculateStats() {
            const mergedMRs = retroData.mergeRequests.filter(mr => mr.state === 'merged').length;
            const successPipelines = retroData.pipelines.filter(p => p.status === 'success').length;
            const pipelineSuccess = retroData.pipelines.length ? Math.round((successPipelines / retroData.pipelines.length) * 100) : 0;
            const closedIssues = retroData.issues.filter(i => i.state === 'closed').length;
            const openedIssues = retroData.issues.filter(i => i.state === 'opened').length;
            let totalReviewTime = 0, reviewCount = 0;
            retroData.mergeRequests.filter(mr => mr.state === 'merged' && mr.merged_at).forEach(mr => {
                const h = (new Date(mr.merged_at) - new Date(mr.created_at)) / 3600000;
                if (h > 0 && h < 720) { totalReviewTime += h; reviewCount++; }
            });
            return { mergedMRs, pipelineSuccess, totalCommits: retroData.commits.length, avgReviewTime: reviewCount ? Math.round(totalReviewTime / reviewCount) : 0, closedIssues, openedIssues, activeContributors: Object.keys(retroData.contributors).length, deployedToDev: retroData.deployments.dev.length, deployedToUat: retroData.deployments.uat.length, deployedToProd: retroData.deployments.prod.length };
        }


        function regenerate() { document.getElementById('resultsSection').classList.remove('active'); generateRetro(); }


        function generateReportHTML() {
            const s = calculateStats();
            const from = retroData.period.from.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
            const to = retroData.period.to.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
            const tc = Object.entries(retroData.contributors).sort((a,b) => b[1].commits - a[1].commits).slice(0,5);
            
            // Points de friction
            const failedPipelines = retroData.pipelines.filter(p => p.status === 'failed').length;
            let frictionHtml = '';
            if (failedPipelines > 5) frictionHtml += `<div class="it b">💥 <strong>${failedPipelines}</strong> pipelines en échec</div>`;
            if (s.avgReviewTime > 48) frictionHtml += `<div class="it b">🐌 Review time <strong>${s.avgReviewTime}h</strong></div>`;
            if (s.openedIssues > s.closedIssues) frictionHtml += `<div class="it b">📈 <strong>${s.openedIssues - s.closedIssues}</strong> issues de plus ouvertes</div>`;
            if (!frictionHtml) frictionHtml = '<div class="it g">🎉 <strong>Aucun problème majeur !</strong></div>';
            
            return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>🕹️ RETRO SPRINT - ${from} → ${to}</title>
    <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, sans-serif; 
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); 
            color: #fff; 
            min-height: 100vh;
            line-height: 1.6;
        }
        .container { max-width: 950px; margin: 0 auto; padding: 40px 20px; }
        
        /* Header Arcade */
        .header { 
            text-align: center; 
            padding: 50px 40px; 
            background: linear-gradient(135deg, #667eea, #764ba2); 
            border-radius: 20px; 
            margin-bottom: 35px;
            border: 3px solid #00f5ff;
            box-shadow: 0 0 30px rgba(0,245,255,0.3), inset 0 0 60px rgba(0,0,0,0.3);
            position: relative;
            overflow: hidden;
        }
        .header::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: repeating-linear-gradient(
                0deg,
                transparent,
                transparent 2px,
                rgba(0,0,0,0.1) 2px,
                rgba(0,0,0,0.1) 4px
            );
            pointer-events: none;
        }
        .header h1 { 
            font-family: 'Press Start 2P', cursive; 
            font-size: 1.8em; 
            margin-bottom: 15px;
            text-shadow: 0 0 10px #fff, 0 0 20px #00f5ff, 0 0 30px #00f5ff;
            position: relative;
        }
        .header .date { 
            font-size: 1.1em; 
            opacity: 0.9;
            background: rgba(0,0,0,0.3);
            display: inline-block;
            padding: 8px 20px;
            border-radius: 20px;
        }
        
        /* High Scores Grid */
        .scores { 
            display: grid; 
            grid-template-columns: repeat(3, 1fr); 
            gap: 15px; 
            margin-bottom: 35px; 
        }
        .score-box { 
            background: rgba(0,0,0,0.4); 
            border-radius: 12px; 
            padding: 25px 20px; 
            text-align: center;
            border: 2px solid var(--ov-1);
            transition: all 0.3s;
        }
        .score-box:hover {
            border-color: #00f5ff;
            box-shadow: 0 0 20px rgba(0,245,255,0.3);
        }
        .score-box .value { 
            font-family: 'Press Start 2P', cursive; 
            font-size: 2em; 
            color: #00f5ff;
            text-shadow: 0 0 10px #00f5ff;
            margin-bottom: 10px;
        }
        .score-box .label { 
            color: var(--ov-7); 
            font-size: 0.85em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .score-box.highlight .value { color: #ffd93d; text-shadow: 0 0 10px #ffd93d; }
        .score-box.success .value { color: #00f5ff; }
        .score-box.danger .value { color: #ff6b6b; text-shadow: 0 0 10px #ff6b6b; }
        
        /* Sections */
        .section { 
            background: rgba(0,0,0,0.3); 
            border-radius: 16px; 
            padding: 25px 30px; 
            margin-bottom: 25px;
            border: 2px solid var(--ov-1);
        }
        .section h2 { 
            font-family: 'Press Start 2P', cursive; 
            font-size: 0.9em; 
            margin-bottom: 20px;
            color: #00f5ff;
            text-shadow: 0 0 5px #00f5ff;
        }
        
        /* Items */
        .it { 
            padding: 14px 18px; 
            background: var(--ov-05); 
            border-radius: 8px; 
            margin-bottom: 10px;
            border-left: 4px solid transparent;
        }
        .it.g { border-left-color: #00f5ff; background: linear-gradient(90deg, rgba(0,245,255,0.1), transparent); }
        .it.b { border-left-color: #ff6b6b; background: linear-gradient(90deg, rgba(255,107,107,0.1), transparent); }
        
        /* Contributors - Leaderboard */
        .leaderboard { display: flex; gap: 15px; flex-wrap: wrap; justify-content: center; }
        .player { 
            text-align: center; 
            padding: 20px; 
            background: rgba(0,0,0,0.4); 
            border-radius: 12px; 
            min-width: 120px;
            border: 2px solid var(--ov-1);
        }
        .player:first-child { border-color: #ffd93d; box-shadow: 0 0 15px rgba(255,217,61,0.3); }
        .player .avatar { 
            width: 55px; 
            height: 55px; 
            background: linear-gradient(135deg, #667eea, #764ba2); 
            border-radius: 50%; 
            margin: 0 auto 12px;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-weight: 700;
            font-size: 1.3em;
            border: 3px solid var(--ov-3);
        }
        .player:first-child .avatar { border-color: #ffd93d; }
        .player .name { font-weight: 700; margin-bottom: 5px; }
        .player .stats { font-size: 0.85em; opacity: 0.7; }
        .player .badge {
            display: inline-block;
            margin-top: 8px;
            padding: 4px 10px;
            background: linear-gradient(135deg, #ffd93d, #f59e0b);
            border-radius: 10px;
            font-family: 'Press Start 2P', cursive;
            font-size: 6px;
            color: #000;
        }
        
        /* Footer */
        .footer { 
            text-align: center; 
            padding: 30px; 
            color: var(--ov-5); 
            font-size: 0.85em;
        }
        .footer .brand {
            font-family: 'Press Start 2P', cursive;
            font-size: 0.7em;
            color: #667eea;
            margin-top: 10px;
        }
        
        @media print {
            body { background: #1a1a2e; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🕹️ RETRO SPRINT</h1>
            <div class="date">📅 ${from} → ${to}</div>
        </div>
        
        <div class="scores">
            <div class="score-box highlight"><div class="value">${s.mergedMRs}</div><div class="label">MRs Mergées</div></div>
            <div class="score-box ${s.pipelineSuccess >= 80 ? 'success' : s.pipelineSuccess >= 60 ? '' : 'danger'}"><div class="value">${s.pipelineSuccess}%</div><div class="label">Pipelines OK</div></div>
            <div class="score-box ${s.avgReviewTime <= 24 ? 'success' : s.avgReviewTime <= 48 ? '' : 'danger'}"><div class="value">${s.avgReviewTime}h</div><div class="label">Review Time</div></div>
            <div class="score-box"><div class="value">${s.totalCommits}</div><div class="label">Commits</div></div>
            <div class="score-box ${s.deployedToProd > 0 ? 'success' : ''}"><div class="value">${s.deployedToProd}</div><div class="label">Déployé PROD</div></div>
            <div class="score-box"><div class="value">${s.activeContributors}</div><div class="label">Contributeurs</div></div>
        </div>
        
        <div class="section">
            <h2>🌟 CE QUI A MARCHÉ</h2>
            ${s.mergedMRs > 0 ? `<div class="it g">🚀 <strong>${s.mergedMRs} MRs</strong> mergées avec succès</div>` : ''}
            ${s.pipelineSuccess >= 80 ? `<div class="it g">✅ <strong>${s.pipelineSuccess}%</strong> de pipelines OK</div>` : ''}
            ${s.avgReviewTime <= 24 ? `<div class="it g">⚡ Review time rapide : <strong>${s.avgReviewTime}h</strong></div>` : ''}
            ${s.deployedToProd > 0 ? `<div class="it g">🎉 <strong>${s.deployedToProd}</strong> déploiements en PROD</div>` : ''}
        </div>
        
        <div class="section">
            <h2>🔥 POINTS DE FRICTION</h2>
            ${frictionHtml}
        </div>
        
        <div class="section">
            <h2>🏆 LEADERBOARD</h2>
            <div class="leaderboard">
                ${tc.map(([n,d], i) => {
                    const initial = escapeHtml(String(n).charAt(0).toUpperCase());
                    const firstName = escapeHtml(String(n).split(' ')[0] || '?');
                    return `
                    <div class="player">
                        <div class="avatar">${initial}</div>
                        <div class="name">${firstName}</div>
                        <div class="stats">${d.commits} commits</div>
                        ${i === 0 ? '<div class="badge">🥇 MVP</div>' : ''}
                    </div>
                `;}).join('')}
            </div>
        </div>
        
        <div class="footer">
            Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}
            <div class="brand">DEVOPS HUB</div>
        </div>
    </div>
</body>
</html>`;
        }

        // ══════════════════════════════════════════════════════════════════
        // V2: ANALYSE DES MESSAGES DE COMMIT
        // ══════════════════════════════════════════════════════════════════

        function analyzeCommitMessages() {
            const badPatterns = [/^fix$/i, /^update$/i, /^wip$/i, /^test$/i, /^commit$/i, /^changes?$/i, /^\.+$/, /^[a-f0-9]{7,40}$/];
            retroData.commits.forEach(c => {
                const msg = c.title || c.message || '';
                if (badPatterns.some(p => p.test(msg.trim())) || msg.length < 5) {
                    retroData.codeAnalysis.badMessages.push({ sha: c.short_id, message: msg, author: c.author_name });
                }
            });
        }

        // ══════════════════════════════════════════════════════════════════
        // V2: GÉNÉRATION DES ALERTES (FOCALISÉ SPRINT)
        // ══════════════════════════════════════════════════════════════════

        function generateAlerts() {
            const mergedMRs = retroData.mergeRequests || [];
            const pipelines = retroData.pipelines || [];
            const commits = retroData.commits || [];
            const contributors = Object.entries(retroData.contributors);
            const periodStart = retroData.period.from;

            // 1. MRs créées pendant la période (pour comparer créées vs mergées)
            const mrsCreatedDuringPeriod = retroData.mergeRequestsOpen.filter(mr => new Date(mr.created_at) >= periodStart);
            const totalMRsCreated = mrsCreatedDuringPeriod.length + mergedMRs.length; // créées encore ouvertes + créées et déjà mergées
            
            // Vélocité : plus de MRs créées que mergées = backlog qui grossit
            if (totalMRsCreated > mergedMRs.length * 1.5 && totalMRsCreated > 5) {
                alerts.push({ 
                    type: 'warning', icon: '📈', 
                    title: 'Vélocité en baisse', 
                    description: `${totalMRsCreated} MRs créées vs ${mergedMRs.length} mergées sur la période`, 
                    action: 'Prioriser les reviews', 
                    category: 'velocity' 
                });
            }

            // 2. Pipeline fail rate sur la période
            const failedPipelines = pipelines.filter(p => p.status === 'failed');
            const pipelineFailRate = pipelines.length ? Math.round((failedPipelines.length / pipelines.length) * 100) : 0;
            if (pipelineFailRate > 30) {
                alerts.push({ 
                    type: 'critical', icon: '🔴', 
                    title: `${pipelineFailRate}% pipelines KO`, 
                    description: `${failedPipelines.length}/${pipelines.length} en échec sur la période`, 
                    action: 'Analyser les causes récurrentes', 
                    category: 'pipeline' 
                });
            } else if (pipelineFailRate > 15) {
                alerts.push({ 
                    type: 'warning', icon: '🟠', 
                    title: `${pipelineFailRate}% pipelines KO`, 
                    description: `${failedPipelines.length}/${pipelines.length} en échec`, 
                    action: 'Surveiller la tendance', 
                    category: 'pipeline' 
                });
            }

            // 3. Review time trop long sur la période
            let totalReviewTime = 0, reviewCount = 0;
            mergedMRs.forEach(mr => {
                if (mr.merged_at && mr.created_at) {
                    const hours = (new Date(mr.merged_at) - new Date(mr.created_at)) / (1000*60*60);
                    if (hours > 0 && hours < 720) { totalReviewTime += hours; reviewCount++; }
                }
            });
            const avgReviewTime = reviewCount ? Math.round(totalReviewTime / reviewCount) : 0;
            if (avgReviewTime > 72) {
                alerts.push({ 
                    type: 'critical', icon: '🐌', 
                    title: `Review time: ${avgReviewTime}h`, 
                    description: 'Les MRs mettent plus de 3 jours à être mergées', 
                    action: 'Planifier des créneaux review fixes', 
                    category: 'review' 
                });
            } else if (avgReviewTime > 48) {
                alerts.push({ 
                    type: 'warning', icon: '⏱️', 
                    title: `Review time: ${avgReviewTime}h`, 
                    description: 'Les MRs mettent plus de 2 jours à être mergées', 
                    action: 'Améliorer le flux de review', 
                    category: 'review' 
                });
            }

            // 4. Bus factor sur la période
            if (contributors.length > 0 && commits.length > 10) {
                const sorted = contributors.sort((a, b) => b[1].commits - a[1].commits);
                const topContributor = sorted[0];
                const topPercent = Math.round((topContributor[1].commits / commits.length) * 100);
                // Nom de contributeur Git (texte libre) → escapeHtml.
                // Les autres descriptions d'alertes ne contiennent que des données
                // numériques contrôlées → safe.
                const safeName = escapeHtml(topContributor[0]);
                if (topPercent > 70) {
                    alerts.push({
                        type: 'critical', icon: '🚌',
                        title: 'Bus factor critique',
                        description: `${safeName} = ${topPercent}% des commits du sprint`,
                        action: 'Répartir la charge, pair programming',
                        category: 'team'
                    });
                } else if (topPercent > 50) {
                    alerts.push({
                        type: 'warning', icon: '🚌',
                        title: 'Bus factor élevé',
                        description: `${safeName} = ${topPercent}% des commits du sprint`,
                        action: 'Encourager la participation',
                        category: 'team'
                    });
                }
            }

            // 5. Commits mal formés sur la période
            const badPercent = commits.length ? Math.round((retroData.codeAnalysis.badMessages.length / commits.length) * 100) : 0;
            if (badPercent > 30 && commits.length > 10) {
                alerts.push({ 
                    type: 'warning', icon: '📝', 
                    title: `${badPercent}% commits mal formés`, 
                    description: `${retroData.codeAnalysis.badMessages.length} messages génériques ou vides`, 
                    action: 'Adopter Conventional Commits', 
                    category: 'process' 
                });
            }

            // 6. Self-merge sur la période (pas de review)
            const selfMergeMRs = mergedMRs.filter(mr => mr.author?.id === mr.merged_by?.id && mr.upvotes === 0);
            const selfMergePercent = mergedMRs.length ? Math.round((selfMergeMRs.length / mergedMRs.length) * 100) : 0;
            if (selfMergePercent > 40 && mergedMRs.length > 5) {
                alerts.push({ 
                    type: 'warning', icon: '🔓', 
                    title: `${selfMergePercent}% self-merge`, 
                    description: `${selfMergeMRs.length} MRs mergées sans review`, 
                    action: 'Activer les approvals obligatoires', 
                    category: 'process' 
                });
            }

            // 7. Pas de deploy prod sur la période
            if (retroData.deployments.prod.length === 0 && selectedDays >= 14) {
                alerts.push({ 
                    type: 'warning', icon: '🚢', 
                    title: 'Aucun deploy prod', 
                    description: `Pas de déploiement production sur ${selectedDays} jours`, 
                    action: 'Identifier les blocages de livraison', 
                    category: 'deploy' 
                });
            }

            // 8. Peu de commits (équipe peu active)
            const expectedCommits = selectedDays * 2; // ~2 commits/jour minimum
            if (commits.length < expectedCommits && commits.length < 10) {
                alerts.push({ 
                    type: 'info', icon: '📉', 
                    title: 'Activité faible', 
                    description: `Seulement ${commits.length} commits sur ${selectedDays} jours`, 
                    action: 'Vérifier les blocages ou congés', 
                    category: 'team' 
                });
            }

            // 9. Beaucoup de MRs sans merge (travail en cours)
            if (mrsCreatedDuringPeriod.length > mergedMRs.length && mrsCreatedDuringPeriod.length > 5) {
                alerts.push({ 
                    type: 'info', icon: '🔄', 
                    title: `${mrsCreatedDuringPeriod.length} MRs encore ouvertes`, 
                    description: 'MRs créées pendant le sprint pas encore mergées', 
                    action: 'Prioriser pour le prochain sprint', 
                    category: 'velocity' 
                });
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // V2: GÉNÉRATION DES USER STORIES (FOCALISÉ SPRINT)
        // ══════════════════════════════════════════════════════════════════

        // Lookup table US par catégorie d'alerte. Avant : chaîne fragile
        // `alert.title.includes('Vélocité')` / `.includes('pipelines KO')` /
        // etc. — un simple renommage de title cassait le mapping silencieusement.
        // Maintenant : mapping sur `alert.category` (champ explicite, présent
        // dans chaque alert poussée par generateAlerts).
        //
        // Note : certaines catégories ont plusieurs variantes selon le contexte
        // (vélocité avec/sans MRs encore ouvertes, process pour commits/self-merge).
        // Une fonction-builder permet de discriminer en lisant `alert.title`
        // SEULEMENT pour ce qui doit varier dans le template (ex: criteria).

        function generateUserStories() {
            alerts.forEach(alert => {
                const builder = US_TEMPLATES[alert.category];
                if (!builder) return;  // alert.category inconnue → on skip
                const us = builder(alert);
                if (us) {
                    us.description = alert.description;  // réinjecté de manière uniforme
                    generatedUS.push(us);
                }
            });
        }

        // ══════════════════════════════════════════════════════════════════
        // V2: MÉTRIQUES DORA
        // ══════════════════════════════════════════════════════════════════

        /*
         * DORA de la rétro.
         *
         * La PRÉSENTATION reste celle de l'écran — lead time en jours, fréquence par jour.
         * Mais le NIVEAU est noté sur le barème commun (js/common/dora-standard.js), après
         * conversion vers les unités de référence : heures et déploiements par semaine.
         *
         * Avant, cet écran avait ses propres seuils, bien plus permissifs — Elite à moins
         * d'un jour de lead time et 15 % d'échec, là où la référence DORA place Elite à
         * une heure et 5 %. Le même dépôt ressortait donc Elite ici et High ailleurs.
         *
         * La fréquence s'appuie sur les VRAIS déploiements d'environnement, pas sur un
         * proxy de pipelines : c'est la meilleure source disponible, on la garde.
         */
        function computeDORA() {
            const D = window.Salsifi.dora;
            const mergedMRs = retroData.mergeRequests || [];
            const pipelines = retroData.pipelines || [];

            // ── Lead time : MÉDIANE, comme DORA. Une moyenne se fait emporter par une
            //    seule MR restée ouverte trois semaines.
            const leadDays = mergedMRs
                .filter(mr => mr.merged_at && (mr.first_commit_at || mr.created_at))
                .map(mr => (new Date(mr.merged_at) - new Date(mr.first_commit_at || mr.created_at)) / 86400000)
                .filter(d => d > 0 && d < 365);
            const ltDays = D.median(leadDays);
            const leadTime = ltDays === null ? 'N/A' : ltDays.toFixed(1);

            // ── Fréquence de déploiement : vrais déploiements en production.
            const deployFreq = selectedDays > 0
                ? (retroData.deployments.prod.length / selectedDays).toFixed(2)
                : '0';

            // ── Taux d'échec. En-deçà de MIN_SAMPLE, un taux n'est que du bruit.
            const enough = pipelines.length >= D.MIN_SAMPLE;
            const failed = pipelines.filter(p => p.status === 'failed').length;
            const changeFailureRate = enough ? Math.round((failed / pipelines.length) * 100) : null;

            // ── Niveau : barème commun, dans les unités de référence.
            const levels = [
                D.level('df', parseFloat(deployFreq) * 7),          // par jour → par semaine
                D.level('lt', ltDays === null ? null : ltDays * 24), // jours → heures
                D.level('cfr', changeFailureRate)
            ];
            const level = (D.worstLevel(levels) || 'Low').toLowerCase();

            doraMetrics = { leadTime, deployFreq, changeFailureRate, level };
        }

        // ══════════════════════════════════════════════════════════════════
        // V2: AFFICHAGE DES NOUVELLES SECTIONS
        // ══════════════════════════════════════════════════════════════════

        function formatUSMarkdown(us) {
            return `## ${us.title}

**En tant que** équipe de développement
**Je veux** corriger ce problème
**Afin de** améliorer notre performance

### 📝 Description
${us.description}

### ✅ Critères d'acceptation
${us.criteria.map(c => `- [ ] ${c}`).join('\n')}

### 💡 Actions suggérées
${us.actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}

### 🏷️ Métadonnées
- **Story Points:** ${us.points}
- **Priority:** ${us.priority}
- **Type:** ${us.type}
`;
        }

