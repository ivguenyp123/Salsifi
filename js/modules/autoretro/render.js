/* autoretro · render.js — rendu DOM. */

        function runWithConcurrency(tasks, limit) { return window.Salsifi.runWithConcurrency(tasks, limit); }


        function showToast(message, type = 'success') {
            let toast = document.getElementById('autoretro-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'autoretro-toast';
                toast.style.cssText = `
                    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
                    padding: 14px 24px; border-radius: 10px; color: white; font-weight: 600;
                    font-size: 14px; z-index: 10000; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
                    opacity: 0; transition: opacity .25s ease; pointer-events: none;
                    max-width: 90vw; text-align: center;
                `;
                document.body.appendChild(toast);
            }
            const bg = type === 'error' ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                     : type === 'info'  ? 'linear-gradient(135deg,#3b82f6,#2563eb)'
                     : 'linear-gradient(135deg,#10b981,#059669)';
            toast.style.background = bg;
            toast.textContent = message;
            toast.style.opacity = '1';
            clearTimeout(toast._timeout);
            toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
        }


        function showModal(title, contentHtml) {
            // Modal simple injecté à la volée (avant : alert() avec 10 lignes
            // illisibles). Fermé par overlay click, Escape, ou bouton ×.
            const existing = document.getElementById('autoretro-modal');
            if (existing) existing.remove();
            const modal = document.createElement('div');
            modal.id = 'autoretro-modal';
            modal.style.cssText = `
                position: fixed; inset: 0; background: rgba(0,0,0,0.7);
                display: flex; align-items: center; justify-content: center;
                z-index: 9999; padding: 20px;
            `;
            modal.innerHTML = `
                <div style="background: linear-gradient(135deg,#1a1a2e,#16213e); border: 2px solid #667eea;
                            border-radius: 16px; padding: 24px; max-width: 600px; width: 100%;
                            max-height: 80vh; overflow-y: auto; color: white; font-family: -apple-system,sans-serif;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="margin:0; font-size: 18px;">${escapeHtml(title)}</h3>
                        <button data-action="close-modal" style="background: none; border: none; color: white;
                                font-size: 28px; cursor: pointer; line-height: 1;">×</button>
                    </div>
                    <div style="font-size: 13px; line-height: 1.6;">${contentHtml}</div>
                </div>
            `;
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
            document.body.appendChild(modal);
        }


        function closeModal() {
            const m = document.getElementById('autoretro-modal');
            if (m) m.remove();
        }

        // ══════════════════════════════════════════════════════════════════
        //  EVENT DELEGATION — remplace les onclick inline (HTML + JS).
        // ══════════════════════════════════════════════════════════════════


        async function loadMilestones() {
            if (!projectId) return;
            const ms = await fetchGitLab(`/projects/${projectId}/milestones?state=active`);
            if (!ms) return;
            const sel = document.getElementById('milestoneSelect');
            // escapeHtml sur le titre — avant : titre injecté direct dans
            // l'option, vulnérable si un milestone s'appelle '<...>'.
            for (const m of ms) {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.title;
                sel.appendChild(opt);
            }
        }


        function showResults() {
            const s = calculateStats();
            document.getElementById('statsGrid').innerHTML = `
                <div class="stat-card good"><div class="stat-icon">🚀</div><div class="stat-value">${s.mergedMRs}</div><div class="stat-label">MRs Mergées</div></div>
                <div class="stat-card ${s.pipelineSuccess > 80 ? 'good' : s.pipelineSuccess > 60 ? 'warning' : 'bad'}"><div class="stat-icon">✅</div><div class="stat-value">${s.pipelineSuccess}%</div><div class="stat-label">Pipelines OK</div></div>
                <div class="stat-card ${s.avgReviewTime < 24 ? 'good' : s.avgReviewTime < 48 ? 'warning' : 'bad'}"><div class="stat-icon">⏱️</div><div class="stat-value">${s.avgReviewTime}h</div><div class="stat-label">Review Time</div></div>
                <div class="stat-card"><div class="stat-icon">📝</div><div class="stat-value">${s.totalCommits}</div><div class="stat-label">Commits</div></div>
                <div class="stat-card"><div class="stat-icon">🟢</div><div class="stat-value">${s.deployedToProd}</div><div class="stat-label">Déployé PROD</div></div>
                <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-value">${s.activeContributors}</div><div class="stat-label">Contributeurs</div></div>`;

            // Helper local pour générer une "feature tag" échappée — les titres
            // de commit viennent de GitLab et sont du texte libre (peuvent
            // contenir `<`, `>`, etc.).
            const renderFeatures = (list) => list.slice(0, 5)
                .map(d => `<div class="feature-tag">${escapeHtml(truncate(d.feature, 35))}</div>`)
                .join('') || '<div class="feature-tag" style="opacity:0.5">Aucun</div>';

            document.getElementById('deploymentsPipeline').innerHTML = `
                <div class="env-column"><div class="env-header dev"><span>🔧</span> DEV <span class="env-count">${s.deployedToDev}</span></div><div class="env-features">${renderFeatures(retroData.deployments.dev)}</div></div>
                <div class="env-arrow">→</div>
                <div class="env-column"><div class="env-header uat"><span>🧪</span> UAT <span class="env-count">${s.deployedToUat}</span></div><div class="env-features">${renderFeatures(retroData.deployments.uat)}</div></div>
                <div class="env-arrow">→</div>
                <div class="env-column"><div class="env-header prod"><span>🌟</span> PROD <span class="env-count">${s.deployedToProd}</span></div><div class="env-features">${renderFeatures(retroData.deployments.prod)}</div></div>`;

            const ww = [];
            if (s.mergedMRs > 0) ww.push({ icon: '🚀', text: `<strong>${s.mergedMRs} MRs</strong> mergées` });
            if (s.pipelineSuccess >= 80) ww.push({ icon: '✅', text: `<strong>${s.pipelineSuccess}%</strong> pipelines OK` });
            if (s.avgReviewTime <= 24) ww.push({ icon: '⚡', text: `Review time <strong>${s.avgReviewTime}h</strong>` });
            if (s.deployedToProd > 0) ww.push({ icon: '🎉', text: `<strong>${s.deployedToProd}</strong> déploiements PROD` });
            // Le texte est construit en JS contrôlé (pas de données externes) →
            // safe à injecter en HTML.
            document.getElementById('wentWellList').innerHTML = ww.length ? ww.map(w => `<div class="highlight-item good"><span class="icon">${w.icon}</span><div>${w.text}</div></div>`).join('') : '<div class="highlight-item good"><span class="icon">📊</span><div>Données insuffisantes</div></div>';

            const pp = [], failedPipelines = retroData.pipelines.filter(p => p.status === 'failed').length;
            if (failedPipelines > 5) pp.push({ icon: '💥', text: `<strong>${failedPipelines}</strong> pipelines en échec` });
            if (s.avgReviewTime > 48) pp.push({ icon: '🐌', text: `Review time <strong>${s.avgReviewTime}h</strong>` });
            if (s.openedIssues > s.closedIssues) pp.push({ icon: '📈', text: `<strong>${s.openedIssues - s.closedIssues}</strong> issues de plus ouvertes` });
            document.getElementById('painPointsList').innerHTML = pp.length ? pp.map(p => `<div class="highlight-item bad"><span class="icon">${p.icon}</span><div>${p.text}</div></div>`).join('') : '<div class="highlight-item good"><span class="icon">🎉</span><div><strong>Aucun problème majeur !</strong></div></div>';

            // Top contributeurs — nom complet vient de Git (auteur libre) → escapeHtml.
            const tc = Object.entries(retroData.contributors).sort((a,b) => b[1].commits - a[1].commits).slice(0,5);
            document.getElementById('contributorsGrid').innerHTML = tc.length
                ? tc.map(([n,d],i) => {
                    const firstName = String(n).split(' ')[0] || '?';
                    const initial = String(n).charAt(0).toUpperCase();
                    return `<div class="contributor-card"><div class="contributor-avatar">${escapeHtml(initial)}</div><div class="contributor-name">${escapeHtml(firstName)}</div><div class="contributor-stats">${d.commits} commits</div>${i===0?'<span class="contributor-badge">🥇 MVP</span>':''}</div>`;
                }).join('')
                : '<div style="opacity:0.6">Aucun contributeur</div>';

            const actions = [];
            if (s.avgReviewTime > 24) actions.push({ p: 'high', t: 'Réduire le temps de review' });
            if (failedPipelines > 5) actions.push({ p: 'high', t: `Analyser les ${failedPipelines} pipelines KO` });
            if (s.openedIssues > s.closedIssues) actions.push({ p: 'medium', t: 'Sprint de stabilisation' });
            actions.push({ p: 'low', t: `Féliciter l'équipe pour ${s.mergedMRs} MRs ! 🎉` });
            // Textes construits en JS contrôlé → safe.
            document.getElementById('actionsList').innerHTML = actions.map(a => `<div class="action-item"><span class="action-priority ${a.p}">${a.p.toUpperCase()}</span><div>${a.t}</div></div>`).join('');

            document.getElementById('resultsSection').classList.add('active');
            document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });

            // V2: Render new sections
            renderDORA();
            renderAlerts();
            renderUserStories();
        }


        function truncate(str, max) { return str && str.length > max ? str.substring(0, max) + '...' : str || ''; }

        function downloadHTML() {
            if (!retroData) { showToast('Génère d\'abord la rétro', 'info'); return; }
            const b = new Blob([generateReportHTML()], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(b);
            const a = document.createElement('a');
            a.href = url;
            a.download = `retro-${new Date().toISOString().split('T')[0]}.html`;
            a.click();
            URL.revokeObjectURL(url);
        }

        // Avant : window.open('') puis w.document.write(...) — pattern déprécié,
        // crash si pop-up bloqué (w = null), et document.write est obsolète.
        // Maintenant : Blob → URL.createObjectURL → window.open(url) qui charge
        // le HTML proprement comme une page autonome.

        function openFullReport() {
            if (!retroData) { showToast('Génère d\'abord la rétro', 'info'); return; }
            const b = new Blob([generateReportHTML()], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(b);
            const w = window.open(url, '_blank');
            if (!w) {
                // Pop-up bloqué — on libère l'URL et on signale.
                URL.revokeObjectURL(url);
                showToast('Pop-up bloqué — autorisez-les pour ce site', 'error');
                return;
            }
            // Libérer l'URL après ouverture (avec un délai pour laisser le
            // navigateur charger). 60s = large marge sur les gros rapports.
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        }

        function renderDORA() {
            const colors = { elite: '#10b981', high: '#3b82f6', medium: '#f59e0b', low: '#ef4444' };
            const badgeColors = { elite: 'linear-gradient(135deg, #10b981, #059669)', high: 'linear-gradient(135deg, #3b82f6, #2563eb)', medium: 'linear-gradient(135deg, #f59e0b, #d97706)', low: 'linear-gradient(135deg, #ef4444, #dc2626)' };
            
            document.getElementById('doraBadge').textContent = doraMetrics.level.toUpperCase();
            document.getElementById('doraBadge').style.background = badgeColors[doraMetrics.level];
            
            document.getElementById('doraMetrics').innerHTML = `
                <div style="text-align: center; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 12px;">
                    <div style="font-family: 'Press Start 2P', cursive; font-size: 1.2em; color: ${doraMetrics.leadTime !== 'N/A' && parseFloat(doraMetrics.leadTime) < 7 ? '#10b981' : '#f59e0b'};">${doraMetrics.leadTime}${doraMetrics.leadTime !== 'N/A' ? 'j' : ''}</div>
                    <div style="font-size: 10px; opacity: 0.7; margin-top: 5px;">LEAD TIME</div>
                </div>
                <div style="text-align: center; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 12px;">
                    <div style="font-family: 'Press Start 2P', cursive; font-size: 1.2em; color: ${parseFloat(doraMetrics.deployFreq) >= 0.14 ? '#10b981' : '#f59e0b'};">${doraMetrics.deployFreq}/j</div>
                    <div style="font-size: 10px; opacity: 0.7; margin-top: 5px;">DEPLOY FREQ</div>
                </div>
                <div style="text-align: center; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 12px;">
                    <div style="font-family: 'Press Start 2P', cursive; font-size: 1.2em; color: ${doraMetrics.changeFailureRate === null ? '#94a3b8' : doraMetrics.changeFailureRate <= 5 ? '#10b981' : doraMetrics.changeFailureRate <= 10 ? '#f59e0b' : '#ef4444'};">${doraMetrics.changeFailureRate === null ? 'n/a' : doraMetrics.changeFailureRate + '%'}</div>
                    <div style="font-size: 10px; opacity: 0.7; margin-top: 5px;">FAILURE RATE</div>
                </div>
                <div style="text-align: center; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 12px;">
                    <div style="font-family: 'Press Start 2P', cursive; font-size: 1.2em; color: #a5b4fc;">N/A</div>
                    <div style="font-size: 10px; opacity: 0.7; margin-top: 5px;">MTTR</div>
                </div>`;
        }


        function renderAlerts() {
            document.getElementById('alertsCount').textContent = alerts.length;
            if (alerts.length === 0) {
                document.getElementById('alertsList').innerHTML = '<div style="text-align: center; opacity: 0.7; padding: 20px;">🎉 Aucune alerte détectée !</div>';
                return;
            }

            const typeColors = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
            // escapeHtml sur tous les champs textuels (description et action
            // peuvent contenir le nom du top contributor — texte libre Git).
            document.getElementById('alertsList').innerHTML = alerts.map(a => `
                <div style="background: rgba(0,0,0,0.3); border-radius: 12px; padding: 15px; border-left: 4px solid ${typeColors[a.type]};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 700;">${a.icon} ${escapeHtml(a.title)}</span>
                        <span style="font-size: 9px; padding: 3px 8px; border-radius: 10px; background: var(--ov-1);">${escapeHtml(a.type.toUpperCase())}</span>
                    </div>
                    <div style="font-size: 12px; opacity: 0.8; margin-bottom: 8px;">${escapeHtml(a.description)}</div>
                    <div style="font-size: 11px; color: #00f5ff;">💡 ${escapeHtml(a.action)}</div>
                </div>
            `).join('');
        }


        function renderUserStories() {
            if (generatedUS.length === 0) {
                document.getElementById('usList').innerHTML = '<div style="text-align: center; opacity: 0.7; padding: 20px;">Aucune US générée</div>';
                return;
            }

            const typeColors = { urgent: 'rgba(239,68,68,0.3)', 'tech-debt': 'rgba(245,158,11,0.3)', process: 'rgba(59,130,246,0.3)', quality: 'rgba(16,185,129,0.3)' };
            // escapeHtml sur title/description/type — title contient le template
            // codé, description vient de l'alert (donc potentiellement nom de
            // contributeur). Boutons via data-action au lieu de onclick inline.
            document.getElementById('usList').innerHTML = generatedUS.map((us, i) => `
                <div style="background: rgba(0,0,0,0.4); border-radius: 12px; padding: 18px; border: 2px solid var(--ov-1);">
                    <span style="font-size: 10px; padding: 4px 10px; border-radius: 20px; font-weight: 700; background: ${typeColors[us.type]};">${escapeHtml(us.type.toUpperCase())}</span>
                    <div style="font-weight: 700; font-size: 13px; margin: 10px 0;">${escapeHtml(us.title)}</div>
                    <div style="font-size: 11px; opacity: 0.7; margin-bottom: 12px;">${escapeHtml(us.description)}</div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-family: 'Press Start 2P', cursive; font-size: 9px; color: #ffd93d;">⭐ ${us.points} pts</span>
                        <span style="font-size: 10px; padding: 3px 8px; border-radius: 4px; background: var(--ov-1);">📊 ${escapeHtml(us.priority)}</span>
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 12px;">
                        <button data-action="copy-us" data-index="${i}" style="flex: 1; padding: 8px; border-radius: 6px; font-size: 10px; cursor: pointer; border: 1px solid var(--ov-2); background: var(--ov-05); color: white;">📋 Copier</button>
                        <button data-action="show-us-detail" data-index="${i}" style="flex: 1; padding: 8px; border-radius: 6px; font-size: 10px; cursor: pointer; border: 1px solid var(--ov-2); background: var(--ov-05); color: white;">👁️ Détail</button>
                    </div>
                </div>
            `).join('');
        }

        // ══════════════════════════════════════════════════════════════════
        // V2: FONCTIONS D'EXPORT
        // ══════════════════════════════════════════════════════════════════

        function copyUS(index) {
            const us = generatedUS[index];
            if (!us) return;
            navigator.clipboard.writeText(formatUSMarkdown(us))
                .then(() => showToast('✅ US copiée !'))
                .catch(() => showToast('Erreur clipboard — copie manuelle requise', 'error'));
        }


        function showUSDetail(index) {
            const us = generatedUS[index];
            if (!us) return;
            // Avant : alert() de 10 lignes illisible et bloquant.
            // Maintenant : vrai modal avec rendu HTML structuré.
            const criteriaHtml = us.criteria.map(c => `<li>${escapeHtml(c)}</li>`).join('');
            const actionsHtml = us.actions.map((a, i) => `<li>${escapeHtml(a)}</li>`).join('');
            const html = `
                <div style="margin-bottom: 14px; opacity: 0.85;">${escapeHtml(us.description)}</div>
                <div style="display: flex; gap: 16px; margin-bottom: 16px; font-size: 12px;">
                    <span>⭐ <strong>${us.points} pts</strong></span>
                    <span>📊 <strong>${escapeHtml(us.priority)}</strong></span>
                    <span>🏷️ <strong>${escapeHtml(us.type)}</strong></span>
                </div>
                <h4 style="margin: 16px 0 8px; color: #00f5ff;">✅ Critères d'acceptation</h4>
                <ul style="margin-left: 20px;">${criteriaHtml}</ul>
                <h4 style="margin: 16px 0 8px; color: #ffd93d;">💡 Actions suggérées</h4>
                <ol style="margin-left: 20px;">${actionsHtml}</ol>
            `;
            showModal(us.title, html);
        }


        function exportAllUSTeams() {
            if (generatedUS.length === 0) {
                showToast('Aucune US à exporter', 'info');
                return;
            }
            const text = generatedUS.map(us => formatUSMarkdown(us)).join('\n---\n\n');
            navigator.clipboard.writeText(text)
                .then(() => showToast(`✅ ${generatedUS.length} US copiées pour Teams !`))
                .catch(() => showToast('Erreur clipboard', 'error'));
        }


        function exportAllUSJira() {
            if (generatedUS.length === 0) {
                showToast('Aucune US à exporter', 'info');
                return;
            }
            const headers = ['Summary', 'Description', 'Issue Type', 'Priority', 'Labels', 'Story Points'];
            const rows = generatedUS.map(us => [
                us.title,
                `${us.description}\\n\\nCritères:\\n${us.criteria.map(c => '- ' + c).join('\\n')}`,
                'Story', us.priority, `${us.type},devops,auto-retro`, us.points
            ]);
            const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `retro-us-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            showToast(`✅ ${generatedUS.length} US exportées en CSV`);
        }


        function exportToTeams() {
            if (!retroData) {
                showToast('Génère d\'abord la rétro', 'info');
                return;
            }
            const s = calculateStats();
            const from = retroData.period.from.toLocaleDateString('fr-FR');
            const to = retroData.period.to.toLocaleDateString('fr-FR');
            const text = `# 🎭 Rétro Sprint - ${from} → ${to}

## 📊 Métriques clés
| Métrique | Valeur |
|----------|--------|
| MRs Mergées | ${s.mergedMRs} |
| MRs Ouvertes | ${retroData.mergeRequestsOpen?.length || 0} |
| Pipeline Success | ${s.pipelineSuccess}% |
| Review Time | ${s.avgReviewTime}h |

## 📈 DORA (${doraMetrics.level.toUpperCase()})
- Lead Time: ${doraMetrics.leadTime}j
- Deploy Freq: ${doraMetrics.deployFreq}/j
- Failure Rate: ${doraMetrics.changeFailureRate === null ? 'échantillon insuffisant' : doraMetrics.changeFailureRate + '%'}

## 🚨 Alertes (${alerts.length})
${alerts.map(a => `- ${a.icon} **${a.title}**: ${a.description}`).join('\n')}

## 📋 Actions
${generatedUS.slice(0, 5).map(us => `- [ ] ${us.title} (${us.points} pts)`).join('\n')}

---
*DevOps Hub V2*`;
            navigator.clipboard.writeText(text)
                .then(() => showToast('✅ Rapport copié pour Teams !'))
                .catch(() => showToast('Erreur clipboard', 'error'));
        }
