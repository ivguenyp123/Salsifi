/* repo-analyzer · render.js — rendu DOM : dashboard, onglets, charts, quick wins. */

        function createDonut(data) {
            const total = data.reduce((s, d) => s + d.value, 0);
            if(total === 0) return '<div style="opacity:0.5;">Aucune donnée</div>';
            let offset = 0;
            const r = 40; const circ = 2 * Math.PI * r;
            let svg = `<svg width="100%" height="100%" viewBox="0 0 100 100" style="transform: rotate(-90deg); max-height:200px; flex:1;">`;
            svg += `<circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="14"></circle>`;
            let legend = `<div style="display:flex; flex-direction:column; gap:10px; margin-left:20px; flex:1;">`;
            
            data.forEach(d => {
                if(d.value === 0) return;
                const dash = `${(d.value/total)*circ} ${circ}`;
                const off = -offset;
                offset += (d.value/total)*circ;
                svg += `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${d.color}" stroke-width="14" stroke-dasharray="${dash}" stroke-dashoffset="${off}"></circle>`;
                legend += `<div style="display:flex; align-items:center; gap:8px; font-size:12px; font-weight:600;"><div style="width:12px; height:12px; border-radius:50%; background:${d.color};"></div>${d.label} (${d.value})</div>`;
            });
            svg += `</svg>`;
            return `<div style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; padding: 10px;">${svg}${legend}</div>`;
        }


        function createLineChart(series) {
            let max = 0;
            series.forEach(s => s.data.forEach(v => { if(v > max) max = v; }));
            if(max === 0) max = 1;
            
            let svg = `<svg width="100%" height="100%" viewBox="0 -10 300 120" preserveAspectRatio="none" style="overflow:visible;">`;
            svg += `<line x1="0" y1="100" x2="300" y2="100" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
            svg += `<line x1="0" y1="50" x2="300" y2="50" stroke="rgba(255,255,255,0.1)" stroke-width="1" stroke-dasharray="4 4"/>`;
            svg += `<line x1="0" y1="0" x2="300" y2="0" stroke="rgba(255,255,255,0.1)" stroke-width="1" stroke-dasharray="4 4"/>`;
            
            series.forEach(s => {
                const stepX = 300 / Math.max(1, (s.data.length - 1));
                const points = s.data.map((val, i) => `${i * stepX},${100 - (val/max)*100}`).join(' ');
                svg += `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
            });
            svg += `</svg>`;
            
            let legend = `<div style="display:flex; justify-content:center; gap:15px; margin-top:10px;">`;
            series.forEach(s => {
                legend += `<div style="display:flex; align-items:center; gap:6px; font-size:11px; font-weight:600;"><div style="width:12px; height:3px; background:${s.color};"></div>${s.label}</div>`;
            });
            legend += `</div>`;
            
            return `<div style="display:flex; flex-direction:column; height:100%; padding-top:15px;"><div style="flex:1; position:relative; padding:0 5px;">${svg}</div>${legend}</div>`;
        }


        function createBarChart(data) {
            let max = 0;
            data.forEach(d => { if(d.value > max) max = d.value; });
            if(max===0) max = 1;
            
            let html = '<div style="display:flex; flex-direction:column; gap:14px; width:100%;">';
            data.forEach(d => {
                const pct = (d.value / max) * 100;
                html += `
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600;">
                            <span>${d.label}</span><span>${d.value}</span>
                        </div>
                        <div style="width:100%; height:8px; background:rgba(0,0,0,0.2); border-radius:4px; overflow:hidden;">
                            <div style="width:${pct}%; height:100%; background:${d.color}; border-radius:4px; transition: width 1s ease;"></div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            return html;
        }


        function createVerticalBarChart(data) {
            let html = `<div style="display:flex; align-items:flex-end; justify-content:space-between; height:100%; gap:4px; padding-top:20px; padding-bottom:10px;">`;
            data.forEach(d => {
                html += `
                    <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; height:100%; justify-content:flex-end;" title="${d.label}: ${d.value}%">
                        <span style="font-size:9px; opacity:0.7;">${d.value}%</span>
                        <div style="width:100%; max-width:24px; height:${d.value}%; background:${d.color}; border-radius:4px 4px 0 0; min-height:2px; transition: height 1s ease;"></div>
                        <span style="font-size:9px; opacity:0.5; writing-mode:vertical-rl; transform:rotate(180deg); margin-top:5px;">${d.label}</span>
                    </div>
                `;
            });
            html += `</div>`;
            return html;
        }


        function renderOverviewCharts() {
            const now = new Date();
            
            // 1. Évolution Commits & MRs
            const dailyData = {};
            for(let i=29; i>=0; i--) {
                const d = new Date(now); d.setDate(d.getDate() - i);
                dailyData[d.toISOString().split('T')[0]] = { commits: 0, mrs: 0 };
            }
            analysisData.commits.forEach(c => {
                if(!c.committed_date) return;
                const k = c.committed_date.split('T')[0];
                if(dailyData[k]) dailyData[k].commits++;
            });
            analysisData.mergeRequests.forEach(m => {
                if(!m.created_at) return;
                const k = m.created_at.split('T')[0];
                if(dailyData[k]) dailyData[k].mrs++;
            });
            const dates = Object.keys(dailyData).sort();
            const commitsSeries = dates.map(k => dailyData[k].commits);
            const mrsSeries = dates.map(k => dailyData[k].mrs);
            
            document.getElementById('chartEvolution').innerHTML = createLineChart([
                { label: 'Commits', data: commitsSeries, color: '#4facfe' },
                { label: 'MRs créées', data: mrsSeries, color: '#f093fb' }
            ]);

            // 2. Distribution MRs
            const mrs = analysisData.mergeRequests;
            let opened = 0, merged = 0, closed = 0;
            mrs.forEach(m => {
                if(m.state === 'opened') opened++;
                else if(m.state === 'merged') merged++;
                else closed++;
            });
            document.getElementById('chartMRStatus').innerHTML = createDonut([
                { label: 'Ouvertes', value: opened, color: '#4facfe' },
                { label: 'Mergées', value: merged, color: '#38ef7d' },
                { label: 'Fermées', value: closed, color: '#f87171' }
            ]);

            // 3. Top Contributeurs
            const top = analysisData.contributors.slice(0, 5);
            document.getElementById('chartContributors').innerHTML = top.length ? createBarChart(
                top.map((c, i) => {
                    const colors = ['#667eea', '#764ba2', '#11998e', '#f5af19', '#f87171'];
                    return { label: c.name, value: c.commits, color: colors[i%colors.length] };
                })
            ) : '<div style="opacity:0.5;">Aucune donnée</div>';

            // 4. Pipeline Trend
            const pipeData = {};
            for(let i=13; i>=0; i--) {
                const d = new Date(now); d.setDate(d.getDate() - i);
                const k = d.toISOString().split('T')[0];
                pipeData[k] = { success: 0, total: 0, label: d.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'}) };
            }
            analysisData.pipelines.forEach(p => {
                const dStr = p.created_at || p.updated_at;
                if(!dStr) return;
                const k = dStr.split('T')[0];
                if(pipeData[k]) {
                    pipeData[k].total++;
                    if(p.status === 'success') pipeData[k].success++;
                }
            });
            const pipeSeries = Object.keys(pipeData).sort().map(k => {
                const day = pipeData[k];
                const rate = day.total > 0 ? Math.round((day.success / day.total)*100) : 0;
                const color = rate >= 80 ? '#38ef7d' : rate >= 50 ? '#f5af19' : '#f87171';
                return { label: day.label, value: rate, color: day.total === 0 ? 'rgba(255,255,255,0.05)' : color };
            });
            document.getElementById('chartPipelines').innerHTML = createVerticalBarChart(pipeSeries);

            // 5. Jobs/Modules instables
            const jobFailData = {};
            analysisData.failedJobs.forEach(j => {
                const n = j.name || 'inconnu';
                jobFailData[n] = (jobFailData[n] || 0) + 1;
            });
            const topFailed = Object.entries(jobFailData)
                .sort((a,b) => b[1]-a[1])
                .slice(0, 5)
                .map(([name, count]) => {
                    return { label: name, value: count, color: '#f87171' };
                });

            document.getElementById('chartFailedJobs').innerHTML = topFailed.length ? createBarChart(topFailed) : '<div style="opacity:0.5; text-align:center;">Aucun échec détecté 🎉</div>';

            // 6. Age des branches
            let activeB = 0, staleB = 0, deadB = 0;
            analysisData.branches.forEach(b => {
                const age = b.commit ? Math.floor((now - new Date(b.commit.committed_date))/86400000) : 0;
                if (age > 90) deadB++;
                else if (age > 30) staleB++;
                else activeB++;
            });
            document.getElementById('chartBranchesAge').innerHTML = createDonut([
                { label: 'Actives (<30j)', value: activeB, color: '#34d399' },
                { label: 'Inactives (30-90j)', value: staleB, color: '#fbbf24' },
                { label: 'Mortes (>90j)', value: deadB, color: '#f87171' }
            ]);
        }


        function renderResults(healthScore) {
            document.getElementById('loadingSection').style.display = 'none';
            document.getElementById('resultsSection').style.display = 'block';

            document.getElementById('repoName').textContent = analysisData.project?.name || 'Projet';
            document.getElementById('metaBranches').textContent = analysisData.branches.length;
            document.getElementById('metaContributors').textContent = analysisData.contributors.length;
            document.getElementById('metaCommits').textContent = analysisData.commits.length;
            document.getElementById('metaMRs').textContent = analysisData.mergeRequests.filter(m => m.state === 'opened').length;

            const lastCommitEl = document.getElementById('metaLastCommit');
            if (analysisData.commits && analysisData.commits.length > 0) {
                const lastCommit = analysisData.commits[0];
                const author = lastCommit.author_name || 'Inconnu';
                const daysSinceCommit = Math.floor((new Date() - new Date(lastCommit.committed_date)) / (1000 * 60 * 60 * 24));
                
                let daysText = "";
                if (daysSinceCommit === 0) { daysText = "Aujourd'hui"; lastCommitEl.style.color = '#34d399'; }
                else if (daysSinceCommit === 1) { daysText = "Hier"; lastCommitEl.style.color = '#34d399'; }
                else if (daysSinceCommit <= 7) { daysText = `${daysSinceCommit}j`; lastCommitEl.style.color = '#34d399'; }
                else if (daysSinceCommit <= 30) { daysText = `${daysSinceCommit}j`; lastCommitEl.style.color = '#fbbf24'; }
                else { daysText = `${daysSinceCommit}j`; lastCommitEl.style.color = '#f87171'; }
                
                lastCommitEl.innerHTML = `${daysText} <div style="font-size:10px; color:#fff; opacity:0.6; margin-top:2px;">par ${author}</div>`;
            } else {
                lastCommitEl.textContent = 'Aucun';
                lastCommitEl.style.color = '#6b7280';
            }

            const lastPipelineEl = document.getElementById('metaLastPipeline');
            if (analysisData.pipelines && analysisData.pipelines.length > 0) {
                const lastPipelineDate = new Date(analysisData.pipelines[0].created_at || analysisData.pipelines[0].updated_at);
                const daysSincePipeline = Math.floor((new Date() - lastPipelineDate) / (1000 * 60 * 60 * 24));
                if (daysSincePipeline === 0) { lastPipelineEl.textContent = "Aujourd'hui"; lastPipelineEl.style.color = '#34d399'; }
                else if (daysSincePipeline === 1) { lastPipelineEl.textContent = 'Hier'; lastPipelineEl.style.color = '#34d399'; }
                else if (daysSincePipeline <= 7) { lastPipelineEl.textContent = `${daysSincePipeline}j`; lastPipelineEl.style.color = '#34d399'; }
                else if (daysSincePipeline <= 30) { lastPipelineEl.textContent = `${daysSincePipeline}j`; lastPipelineEl.style.color = '#fbbf24'; }
                else { lastPipelineEl.textContent = `${daysSincePipeline}j`; lastPipelineEl.style.color = '#f87171'; }
            } else {
                lastPipelineEl.textContent = 'Aucune';
                lastPipelineEl.style.color = '#6b7280';
            }

            // Chaque widget est rendu de façon ISOLÉE : si l'un jette sur des
            // données inattendues, il ne doit pas empêcher les suivants de
            // s'afficher (avant, un renderer en échec sautait tous ceux d'après —
            // typiquement l'onglet Quick Wins, rendu en dernier, restait vide).
            [
                renderOverviewDashboard, renderHeatmap, renderOverviewCharts,
                renderBranches, renderContributors, renderBusFactor,
                renderMRs, renderMRStats, renderCICD, renderDeployments,
                renderQuickWins
            ].forEach(fn => {
                try { fn(); }
                catch (e) { console.warn('[repo-analyzer] widget « ' + (fn.name || '?') + ' » a échoué :', e); }
            });
        }


        function switchMainTab(name, btn) {
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.tab-nav-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('tab-' + name).classList.add('active');
            if (btn) btn.classList.add('active');
        }


        function renderOverviewDashboard() {
            const redFlags = [];
            const mainB = analysisData.branches.find(b => ['main', 'master'].includes(b.name.toLowerCase()));
            const isProtected = analysisData.protectedBranches.map(b=>b.name.toLowerCase()).includes(mainB?.name?.toLowerCase());
            
            if (mainB && !isProtected) redFlags.push({ type: 'critical', icon: '🛡️', title: 'Branche Main non protégée', desc: 'Risque critique de push direct en production.' });
            
            const bf = calculateBusFactor();
            if (bf.percentage >= 75) redFlags.push({ type: bf.percentage >= 90 ? 'critical' : 'warning', icon: '🚌', title: `Bus Factor critique (${bf.percentage}%)`, desc: `${bf.name} possède le monopole de la connaissance.` });
            
            const pipelines = analysisData.pipelines || [];
            if (pipelines.length > 0) {
                const succ = pipelines.filter(p => p.status === 'success').length;
                const rate = Math.round((succ / pipelines.length) * 100);
                if (rate < 60) redFlags.push({ type: 'critical', icon: '💥', title: `CI/CD instable (${rate}% succès)`, desc: 'Une grande partie des builds récents échoue.' });
            }

            const now = new Date();
            const deadB = analysisData.branches.filter(b => b.commit && Math.floor((now - new Date(b.commit.committed_date))/86400000) > 90 && !['main','master','develop'].includes(b.name.toLowerCase()));
            if (deadB.length >= 5) redFlags.push({ type: 'warning', icon: '💀', title: `${deadB.length} branches mortes détectées`, desc: 'Le repository est pollué par du vieux code (>90 jours).' });

            const rfSection = document.getElementById('redFlagsSection');
            const rfGrid = document.getElementById('redFlagsGrid');
            
            if (redFlags.length > 0) {
                rfGrid.innerHTML = redFlags.map(rf => `
                    <div class="rf-card ${rf.type}">
                        <div class="rf-icon">${rf.icon}</div>
                        <div>
                            <div class="rf-title">${rf.title}</div>
                            <div class="rf-desc">${rf.desc}</div>
                        </div>
                    </div>
                `).join('');
                rfSection.style.display = 'block';
            } else {
                rfGrid.innerHTML = `
                    <div class="rf-card success" style="grid-column: 1 / -1;">
                        <div class="rf-icon" style="background:transparent;">🎉</div>
                        <div>
                            <div class="rf-title" style="color: #10b981;">Aucune alerte critique !</div>
                            <div class="rf-desc">Les fondamentaux du projet sont au vert.</div>
                        </div>
                    </div>
                `;
                rfSection.style.display = 'block';
            }

            let ciScore = pipelines.length ? Math.round((pipelines.filter(p => p.status === 'success').length / pipelines.length) * 100) : 0;
            const mrScore = calculateMRScoreForDashboard();

            const renderBar = (label, score) => {
                const color = score >= 80 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171';
                return `
                    <div class="synth-bar-row">
                        <div class="synth-bar-header"><span>${label}</span><span style="color:${color}">${score}%</span></div>
                        <div class="synth-bar-bg"><div class="synth-bar-fill" style="width:${score}%; background: linear-gradient(90deg, transparent, ${color});"></div></div>
                    </div>
                `;
            };
            document.getElementById('healthBarsContainer').innerHTML = 
                renderBar('Fiabilité des Déploiements (CI/CD)', ciScore) + 
                renderBar('Fluidité des Code Reviews (MRs)', mrScore);

            const qwCounts = {
                critical: quickWins.filter(q => q.priority === 'critical').length,
                urgent: quickWins.filter(q => q.priority === 'urgent').length,
                important: quickWins.filter(q => q.priority === 'important').length,
                improvement: quickWins.filter(q => q.priority === 'improvement').length
            };
            const totalQw = quickWins.length;
            const donutContainer = document.getElementById('qwDonutContainer');
            const legendContainer = document.getElementById('qwDonutLegend');

            if (totalQw === 0) {
                donutContainer.innerHTML = '<div style="opacity:0.5; padding:20px;">Aucune action</div>';
                legendContainer.innerHTML = '';
            } else {
                let offset = 0;
                const r = 40; const circ = 2 * Math.PI * r;
                const makeArc = (val, color) => {
                    if (val === 0) return '';
                    const dash = `${(val/totalQw)*circ} ${circ}`;
                    const off = -offset;
                    offset += (val/totalQw)*circ;
                    return `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="14" stroke-dasharray="${dash}" stroke-dashoffset="${off}"></circle>`;
                };
                donutContainer.innerHTML = `
                    <div style="position:relative; width:120px; height:120px;">
                        <svg width="120" height="120" viewBox="0 0 100 100" style="transform: rotate(-90deg);">
                            <circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="14"></circle>
                            ${makeArc(qwCounts.critical, '#ef4444')}
                            ${makeArc(qwCounts.urgent, '#f97316')}
                            ${makeArc(qwCounts.important, '#eab308')}
                            ${makeArc(qwCounts.improvement, '#22c55e')}
                        </svg>
                        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
                            <span style="font-size:26px; font-weight:800;">${totalQw}</span>
                        </div>
                    </div>
                `;
                legendContainer.innerHTML = `
                    ${qwCounts.critical ? `<div class="donut-legend-item"><div class="donut-dot" style="background:#ef4444;"></div>Critiques (${qwCounts.critical})</div>` : ''}
                    ${qwCounts.urgent ? `<div class="donut-legend-item"><div class="donut-dot" style="background:#f97316;"></div>Urgentes (${qwCounts.urgent})</div>` : ''}
                    ${qwCounts.important ? `<div class="donut-legend-item"><div class="donut-dot" style="background:#eab308;"></div>Importantes (${qwCounts.important})</div>` : ''}
                    ${qwCounts.improvement ? `<div class="donut-legend-item"><div class="donut-dot" style="background:#22c55e;"></div>Améliorations (${qwCounts.improvement})</div>` : ''}
                `;
            }
        }


        function renderHeatmap() {
            const heatmapGrid = document.getElementById('heatmapGrid');
            const heatmapBadge = document.getElementById('heatmapBadge');
            const heatmapStats = document.getElementById('heatmapStats');
            
            const activityMap = {};
            const now = new Date();
            
            for (let i = 29; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(date.getDate() - i);
                const dateKey = date.toISOString().split('T')[0];
                activityMap[dateKey] = { commits: 0, mrs: 0 };
            }
            
            analysisData.commits.forEach(commit => {
                if (commit.committed_date) {
                    const dateKey = commit.committed_date.split('T')[0];
                    if (activityMap[dateKey]) activityMap[dateKey].commits++;
                }
            });
            
            analysisData.mergeRequests.forEach(mr => {
                if (mr.created_at) {
                    const dateKey = mr.created_at.split('T')[0];
                    if (activityMap[dateKey]) activityMap[dateKey].mrs++;
                }
            });
            
            let maxActivity = 0;
            Object.values(activityMap).forEach(day => {
                const total = day.commits + day.mrs;
                if (total > maxActivity) maxActivity = total;
            });
            
            const dates = Object.keys(activityMap).sort();
            let html = '';
            let totalCommits = 0;
            let totalMRs = 0;
            let activeDays = 0;
            
            dates.forEach(dateKey => {
                const day = activityMap[dateKey];
                const total = day.commits + day.mrs;
                totalCommits += day.commits;
                totalMRs += day.mrs;
                if (total > 0) activeDays++;
                
                let bgColor;
                if (total === 0 || maxActivity === 0) {
                    bgColor = 'rgba(255, 255, 255, 0.08)';
                } else {
                    const intensity = total / maxActivity;
                    if (intensity <= 0.25) bgColor = 'linear-gradient(135deg, #3b82f6, #60a5fa)';
                    else if (intensity <= 0.5) bgColor = 'linear-gradient(135deg, #8b5cf6, #a78bfa)';
                    else if (intensity <= 0.75) bgColor = 'linear-gradient(135deg, #d946ef, #e879f9)';
                    else bgColor = 'linear-gradient(135deg, #f43f5e, #fb7185)';
                }
                
                const date = new Date(dateKey);
                const dateStr = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
                const tooltip = `${dateStr}: ${day.commits} commits, ${day.mrs} MRs`;
                
                html += `<div class="heatmap-cell" style="background: ${bgColor};" data-tooltip="${tooltip}"></div>`;
            });
            
            if(heatmapGrid) heatmapGrid.innerHTML = html;
            if(heatmapStats) heatmapStats.textContent = `${totalCommits} commits • ${totalMRs} MRs • ${activeDays} jours actifs`;
            
            if(heatmapBadge) {
                const avgPerDay = (totalCommits + totalMRs) / 30;
                if (avgPerDay >= 2) { heatmapBadge.textContent = 'Très actif'; heatmapBadge.className = 'card-badge badge-good'; }
                else if (avgPerDay >= 0.5) { heatmapBadge.textContent = 'Actif'; heatmapBadge.className = 'card-badge badge-warning'; }
                else { heatmapBadge.textContent = 'Peu actif'; heatmapBadge.className = 'card-badge badge-bad'; }
            }
        }


        function renderBranches() {
            const list = document.getElementById('branchList');
            const now = new Date();
            list.innerHTML = analysisData.branches.slice(0, 30).map(b => {
                const age = b.commit ? Math.floor((now - new Date(b.commit.committed_date))/86400000) : 0;
                const status = age > 90 ? 'dead' : age > 30 ? 'stale' : 'active';
                return `<div class="branch-card"><div class="branch-card-header"><div class="branch-name">🌳 ${b.name}</div><div class="branch-status status-${status}">${status}</div></div><div class="branch-badges"><div class="branch-badge">🕐 ${age}j sans commit</div></div></div>`;
            }).join('');
        }


        function renderContributors() {
            const list = document.getElementById('contributorList');
            const periodEl = document.getElementById('contributorPeriod');
            const total = analysisData.contributors.reduce((s, c) => s + c.commits, 0);
            
            if (periodEl) {
                const projectCreated = analysisData.project?.created_at;
                const now = new Date();
                const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                
                if (projectCreated) {
                    periodEl.innerHTML = `📅 <strong>Période analysée :</strong> du ${formatDate(projectCreated)} au ${formatDate(now)}`;
                } else {
                    periodEl.innerHTML = `📅 <strong>Période analysée :</strong> jusqu'au ${formatDate(now)}`;
                }
            }

            list.innerHTML = analysisData.contributors.slice(0,5).map(c => {
                const pct = Math.round((c.commits/total)*100) || 0;
                return `<div class="contributor-item"><div class="contributor-avatar">👤</div><div class="contributor-info"><div class="contributor-name">${c.name}</div><div class="contributor-stats">${c.commits} commits • ${pct}%</div></div></div>`;
            }).join('');
        }


        function renderBusFactor() {
            const el = document.getElementById('busfactorDetail');
            const bf = calculateBusFactor();
            const color = bf.percentage >= 80 ? '#ef4444' : '#34d399';
            el.innerHTML = `<div class="busf-big"><div class="busf-number" style="color:${color};">${bf.percentage}%</div><div style="opacity:0.7;margin-top:10px;">${bf.name} centralise la connaissance</div></div>`;
        }


        function renderMRs() {
            const list = document.getElementById('mrList');
            const open = analysisData.mergeRequests.filter(m => m.state === 'opened');
            list.innerHTML = open.slice(0,8).map(mr => {
                const age = Math.floor((new Date() - new Date(mr.created_at))/86400000);
                return `<a href="${mr.web_url || '#'}" target="_blank" rel="noopener noreferrer" class="mr-item"><div class="mr-info"><div class="mr-title">!${mr.iid} - ${mr.title}</div><div class="mr-meta">⏳ Ouverte depuis ${age}j</div></div></a>`;
            }).join('') || '<div style="padding:20px;opacity:0.5;">Aucune MR ouverte</div>';
        }


        function renderMRStats() {
            const el = document.getElementById('mrStatsContent');
            const open = analysisData.mergeRequests.filter(m => m.state === 'opened').length;
            const merged = analysisData.mergeRequests.filter(m => m.state === 'merged').length;
            el.innerHTML = `<div class="mr-stats-grid"><div class="mr-stat-card"><div class="mr-stat-val">${open}</div><div style="font-size:10px;opacity:0.6;">OUVERTES</div></div><div class="mr-stat-card"><div class="mr-stat-val">${merged}</div><div style="font-size:10px;opacity:0.6;">MERGÉES</div></div></div>`;
        }


        function renderCICD() {
            const el = document.getElementById('cicdContent');
            const p = analysisData.pipelines;
            const failedJobs = analysisData.failedJobs || [];
            if(!p.length) {
                if (el) el.innerHTML = '<div style="text-align:center;padding:30px;opacity:0.5;">Aucun pipeline trouvé</div>';
                return;
            }
            const succ = p.filter(x=>x.status==='success').length;
            const fail = p.filter(x=>x.status==='failed').length;
            const running = p.filter(x=>x.status==='running').length;
            
            const jobCounts = {};
            failedJobs.forEach(j => { const n = j.name || 'inconnu'; jobCounts[n] = (jobCounts[n] || 0) + 1; });
            
            const sortedJobs = Object.entries(jobCounts).sort((a,b) => b[1]-a[1]);
            const maxCount = sortedJobs[0]?.[1] || 1;

            const jobsHtml = sortedJobs.length ? sortedJobs.map(([name, count]) => {
                const pct = Math.round(count / (failedJobs.length || 1) * 100);
                const color = pct >= 50 ? '#f87171' : pct >= 25 ? '#fbbf24' : '#4facfe';
                return `<div class="job-fail-row">
                    <span class="job-fail-name" title="${name}">${name}</span>
                    <div class="job-fail-bar-wrap"><div class="job-fail-bar" style="width:${Math.round(count/maxCount*100)}%;background:${color};"></div></div>
                    <span class="job-fail-pct" style="color:${color};">${pct}%</span>
                    <span class="job-fail-count">${count} échecs</span>
                </div>`;
            }).join('') : '<div style="font-size:12px;opacity:0.5;padding:8px 0;">Aucun job en échec récent 🎉</div>';

            if(el) el.innerHTML = `
                <div class="cicd-stats-row">
                    <div class="cicd-stat-card"><div class="cicd-stat-val" style="color:#34d399;">${succ}</div><div class="cicd-stat-lbl">✅ Succès</div></div>
                    <div class="cicd-stat-card"><div class="cicd-stat-val" style="color:#f87171;">${fail}</div><div class="cicd-stat-lbl">❌ Échecs</div></div>
                    <div class="cicd-stat-card"><div class="cicd-stat-val" style="color:#4facfe;">${running}</div><div class="cicd-stat-lbl">🔄 Running</div></div>
                </div>
                <div class="section-lbl">Classement des modules/jobs par instabilité (${failedJobs.length} échecs analysés)</div>
                <div>
                    ${jobsHtml}
                </div>
            `;
        }


        function renderDeployments() {
            const depEl = document.getElementById('deployContent');
            const deployments = analysisData.deployments || [];
            if (!deployments.length) {
                if(depEl) depEl.innerHTML = '<div style="text-align:center;padding:30px;opacity:0.5;">Aucun déploiement trouvé</div>';
                return;
            }
            if(depEl) depEl.innerHTML = `<div style="text-align:center;padding:30px;opacity:0.7;">${deployments.length} déploiements trouvés</div>`;
        }


        function filterQuickWins(pri) { currentFilter = pri; renderQuickWins(); }
        

        function renderQuickWins() {
            const list = document.getElementById('quickwinList');
            document.querySelectorAll('.quickwin-tab').forEach(t => t.classList.remove('active'));
            const tab = document.querySelector(`.quickwin-tab[data-priority="${currentFilter}"]`);
            if(tab) tab.classList.add('active');

            ['all','critical','urgent','important','improvement'].forEach(p => {
                const el = document.getElementById(p === 'all' ? 'qwAllCount' : `qw${p.charAt(0).toUpperCase() + p.slice(1)}Tab`);
                if(el) el.textContent = p === 'all' ? quickWins.length : quickWins.filter(q=>q.priority===p).length;
            });

            const filtered = currentFilter === 'all' ? quickWins : quickWins.filter(q => q.priority === currentFilter);
            if (filtered.length === 0) {
                list.innerHTML = `<div class="quickwin-empty"><div class="quickwin-empty-icon">🎉</div><div>Aucune action dans cette catégorie</div></div>`;
                return;
            }
            list.innerHTML = filtered.map(qw => `
                <div class="quickwin-item ${qw.priority}">
                    <div class="quickwin-header">
                        <div class="quickwin-header-left">
                            <div class="quickwin-icon">${qw.icon}</div>
                            <div class="quickwin-title-section"><div class="quickwin-title">${qw.title}</div><div class="quickwin-subtitle">${qw.subtitle}</div></div>
                        </div>
                        ${qw.time ? `<div class="quickwin-time">⏱️ ${qw.time}</div>` : ''}
                    </div>
                    <div class="quickwin-body">
                        <div class="quickwin-description">${qw.description}</div>
                        ${qw.impact ? `<div class="quickwin-impact">💡 ${qw.impact}</div>` : ''}
                        ${qw.targets && qw.targets.length > 0 ? `
                            <div class="quickwin-targets">
                                ${qw.targets.map(t => `<span class="quickwin-target">${t}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `).join('');
        }

        // Fonction d'export ajoutée pour éviter les erreurs si le bouton est activé
