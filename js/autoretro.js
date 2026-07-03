        // ══════════════════════════════════════════════════════════════════
        //  CONFIGURATION
        // ══════════════════════════════════════════════════════════════════

        let GITLAB_URL = null, token = null, projectId = null, selectedDays = 21, retroData = null;
        const HUB_URL = 'hub-mockup-v2_1.html'; // mockup V2 = hub
        let alerts = [], generatedUS = [], doraMetrics = {};

        // Concurrence pour les fetches d'environnements. 8 simultanés cohérent
        // avec l'écosystème (daily-report, conflict-radar, bus-factor).
        const ENV_CONCURRENCY = 8;

        // ══════════════════════════════════════════════════════════════════
        //  HELPERS — fetchGitLab (retry 429), runWithConcurrency, escapeHtml.
        //  Alignés sur l'écosystème.
        // ══════════════════════════════════════════════════════════════════

        async function fetchGitLab(endpoint) {
            try {
                const url = `${GITLAB_URL}/api/v4${endpoint}`;
                const headers = { 'PRIVATE-TOKEN': token };
                let r = await fetch(url, { headers });
                if (r.status === 429) {
                    const retryAfter = parseInt(r.headers.get('Retry-After')) || 2;
                    console.warn(`[fetchGitLab] 429 sur ${endpoint}, retry dans ${retryAfter}s`);
                    await new Promise(res => setTimeout(res, retryAfter * 1000));
                    r = await fetch(url, { headers });
                }
                return r.ok ? r.json() : null;
            } catch (e) {
                console.error('GitLab API error:', e);
                return null;
            }
        }

        async function runWithConcurrency(tasks, limit) {
            const results = [];
            const executing = new Set();
            for (const task of tasks) {
                const p = Promise.resolve().then(task);
                results.push(p);
                executing.add(p);
                const clean = () => executing.delete(p);
                p.then(clean, clean);
                if (executing.size >= limit) await Promise.race(executing);
            }
            return Promise.allSettled(results);
        }

        function escapeHtml(text) {
            if (text === null || text === undefined) return '';
            const div = document.createElement('div');
            div.textContent = String(text);
            return div.innerHTML;
        }

        function escapeAttr(text) {
            if (text === null || text === undefined) return '';
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // ══════════════════════════════════════════════════════════════════
        //  TOAST + MODAL — remplacement des alert() bloquants
        // ══════════════════════════════════════════════════════════════════

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

        const ACTION_HANDLERS = {
            'generate-retro':       () => generateRetro(),
            'regenerate':           () => regenerate(),
            'export-teams':         () => exportToTeams(),
            'download-html':        () => downloadHTML(),
            'open-full-report':     () => openFullReport(),
            'export-all-us-teams':  () => exportAllUSTeams(),
            'export-all-us-jira':   () => exportAllUSJira(),
            'copy-us':              (e, el) => copyUS(parseInt(el.dataset.index, 10)),
            'show-us-detail':       (e, el) => showUSDetail(parseInt(el.dataset.index, 10)),
            'close-modal':          () => closeModal()
        };

        function attachEventDelegation() {
            document.body.addEventListener('click', (e) => {
                const el = e.target.closest('[data-action]');
                if (!el) return;
                const handler = ACTION_HANDLERS[el.dataset.action];
                if (handler) handler(e, el);
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeModal();
            });
        }

        // ══════════════════════════════════════════════════════════════════
        //  INITIALISATION
        // ══════════════════════════════════════════════════════════════════

        document.addEventListener('DOMContentLoaded', () => {
            // Boutons période
            document.querySelectorAll('.period-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    selectedDays = parseInt(btn.dataset.days);
                });
            });

            // Auth modèle plateforme (localStorage devops_hub_workspaces) + repo via ?repo=
            const auth = (() => {
                try {
                    const raw = localStorage.getItem('devops_hub_workspaces');
                    if (!raw) return null;
                    const d = JSON.parse(raw);
                    return (d.gitlabUrl && d.token) ? d : null;
                } catch { return null; }
            })();
            if (!auth) { window.location.href = 'login.html'; return; }

            const repoId = new URLSearchParams(location.search).get('repo');
            if (!repoId) { window.location.href = HUB_URL; return; }

            token = auth.token;
            GITLAB_URL = auth.gitlabUrl;
            projectId = repoId;

            // Lien retour vers le hub
            document.querySelectorAll('[data-hub-link]').forEach(a => { a.href = HUB_URL; });

            attachEventDelegation();
            loadMilestones();
        });

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

        function truncate(str, max) { return str && str.length > max ? str.substring(0, max) + '...' : str || ''; }
        function regenerate() { document.getElementById('resultsSection').classList.remove('active'); generateRetro(); }

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
            border: 2px solid rgba(255,255,255,0.1);
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
            color: rgba(255,255,255,0.7); 
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
            border: 2px solid rgba(255,255,255,0.1);
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
            background: rgba(255,255,255,0.05); 
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
            border: 2px solid rgba(255,255,255,0.1);
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
            border: 3px solid rgba(255,255,255,0.3);
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
            color: rgba(255,255,255,0.5); 
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
        const US_TEMPLATES = {
            velocity: (alert) => {
                // Deux sous-cas : "Vélocité en baisse" vs "MRs encore ouvertes"
                if (alert.title.startsWith('Vélocité')) {
                    return {
                        type: 'process', title: '[PROCESS] Améliorer la vélocité de merge',
                        criteria: ['Ratio créées/mergées < 1.2', 'Review time < 24h', 'Daily standup review'],
                        actions: ['Limiter WIP à 2 MRs/dev', 'Review en priorité le matin', 'Pair review pour les grosses MRs'],
                        points: 3, priority: 'High'
                    };
                }
                // "MRs encore ouvertes"
                return {
                    type: 'process', title: '[SPRINT] Finaliser les MRs en cours',
                    criteria: ['Toutes les MRs du sprint mergées ou explicitement reportées', 'Backlog sprint à 0'],
                    actions: ['Review prioritaire des MRs en cours', 'Décider: merge ou report', 'Communiquer en rétro'],
                    points: 2, priority: 'High'
                };
            },
            pipeline: (alert) => ({
                type: 'quality', title: '[QUALITY] Stabiliser les pipelines',
                criteria: ['Taux succès > 85%', 'Temps fix < 2h', 'Alerting en place'],
                actions: ['Analyser les 3 jobs qui fail le plus', 'Ajouter pre-commit hooks', 'Tests locaux avant push'],
                points: 5, priority: alert.type === 'critical' ? 'Highest' : 'High'
            }),
            review: (alert) => ({
                type: 'process', title: '[PROCESS] Réduire le temps de review',
                criteria: ['Review time < 24h', 'Aucune MR > 48h sans review', 'SLA review défini'],
                actions: ['Créneaux review fixes (10h, 14h)', 'Notif Slack pour MRs > 24h', 'Rotation reviewer de la semaine'],
                points: 3, priority: alert.type === 'critical' ? 'Highest' : 'High'
            }),
            team: (alert) => {
                // Deux sous-cas : "Bus factor" vs "Activité faible"
                if (alert.title.toLowerCase().includes('bus factor')) {
                    return {
                        type: 'tech-debt', title: '[TEAM] Répartir la charge de travail',
                        criteria: ['Aucun dev > 40% commits', 'Min 3 contributeurs actifs', 'Pair prog 2x/sem'],
                        actions: ['Rotation des tâches', 'Sessions pair programming', 'Onboarding sur zones critiques'],
                        points: 5, priority: alert.type === 'critical' ? 'Highest' : 'High'
                    };
                }
                // "Activité faible"
                return {
                    type: 'tech-debt', title: '[TEAM] Investiguer la baisse d\'activité',
                    criteria: ['Comprendre les causes', 'Plan d\'action défini', 'Suivi hebdo'],
                    actions: ['1:1 avec l\'équipe', 'Identifier les blocages', 'Réajuster la charge si besoin'],
                    points: 2, priority: 'Medium'
                };
            },
            process: (alert) => {
                // Deux sous-cas : "commits mal formés" vs "self-merge"
                if (alert.title.toLowerCase().includes('commits mal formés')) {
                    return {
                        type: 'process', title: '[PROCESS] Améliorer les messages de commit',
                        criteria: ['80% Conventional Commits', 'Aucun message < 10 chars', 'Ref issue dans 50% commits'],
                        actions: ['Installer commitlint + husky', 'Template commit dans IDE', 'Rappel en daily'],
                        points: 2, priority: 'Medium'
                    };
                }
                // "self-merge"
                return {
                    type: 'process', title: '[PROCESS] Renforcer les code reviews',
                    criteria: ['0% self-merge', 'Min 1 approval obligatoire', 'CODEOWNERS actif'],
                    actions: ['Activer merge request approvals', 'Configurer CODEOWNERS', 'Sensibiliser l\'équipe'],
                    points: 2, priority: 'High'
                };
            },
            deploy: (alert) => ({
                type: 'urgent', title: '[DELIVERY] Débloquer les déploiements prod',
                criteria: ['Min 1 deploy prod/sprint', 'Process deploy documenté', 'Rollback testé'],
                actions: ['Identifier le blocage', 'Planifier une release', 'Automatiser le déploiement'],
                points: 3, priority: 'High'
            })
        };

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
        function computeDORA() {
            const mergedMRs = retroData.mergeRequests || [];
            const pipelines = retroData.pipelines || [];
            
            // Lead Time
            let totalLeadTime = 0, ltCount = 0;
            mergedMRs.forEach(mr => {
                if (mr.merged_at && mr.created_at) {
                    const days = (new Date(mr.merged_at) - new Date(mr.created_at)) / (1000*60*60*24);
                    if (days > 0 && days < 30) { totalLeadTime += days; ltCount++; }
                }
            });
            const leadTime = ltCount ? (totalLeadTime / ltCount).toFixed(1) : 'N/A';
            
            // Deploy Frequency
            const deployFreq = selectedDays > 0 ? (retroData.deployments.prod.length / selectedDays).toFixed(2) : '0';
            
            // Change Failure Rate
            const failedPipelines = pipelines.filter(p => p.status === 'failed').length;
            const changeFailureRate = pipelines.length ? Math.round((failedPipelines / pipelines.length) * 100) : 0;
            
            // Level
            let level = 'low';
            if (leadTime !== 'N/A' && parseFloat(leadTime) < 1 && parseFloat(deployFreq) >= 1 && changeFailureRate < 15) level = 'elite';
            else if (leadTime !== 'N/A' && parseFloat(leadTime) < 7 && parseFloat(deployFreq) >= 0.14 && changeFailureRate < 30) level = 'high';
            else if (leadTime !== 'N/A' && parseFloat(leadTime) < 30 && changeFailureRate < 45) level = 'medium';
            
            doraMetrics = { leadTime, deployFreq, changeFailureRate, level };
        }

        // ══════════════════════════════════════════════════════════════════
        // V2: AFFICHAGE DES NOUVELLES SECTIONS
        // ══════════════════════════════════════════════════════════════════
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
                    <div style="font-family: 'Press Start 2P', cursive; font-size: 1.2em; color: ${doraMetrics.changeFailureRate < 15 ? '#10b981' : doraMetrics.changeFailureRate < 30 ? '#f59e0b' : '#ef4444'};">${doraMetrics.changeFailureRate}%</div>
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
                        <span style="font-size: 9px; padding: 3px 8px; border-radius: 10px; background: rgba(255,255,255,0.1);">${escapeHtml(a.type.toUpperCase())}</span>
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
                <div style="background: rgba(0,0,0,0.4); border-radius: 12px; padding: 18px; border: 2px solid rgba(255,255,255,0.1);">
                    <span style="font-size: 10px; padding: 4px 10px; border-radius: 20px; font-weight: 700; background: ${typeColors[us.type]};">${escapeHtml(us.type.toUpperCase())}</span>
                    <div style="font-weight: 700; font-size: 13px; margin: 10px 0;">${escapeHtml(us.title)}</div>
                    <div style="font-size: 11px; opacity: 0.7; margin-bottom: 12px;">${escapeHtml(us.description)}</div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-family: 'Press Start 2P', cursive; font-size: 9px; color: #ffd93d;">⭐ ${us.points} pts</span>
                        <span style="font-size: 10px; padding: 3px 8px; border-radius: 4px; background: rgba(255,255,255,0.1);">📊 ${escapeHtml(us.priority)}</span>
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 12px;">
                        <button data-action="copy-us" data-index="${i}" style="flex: 1; padding: 8px; border-radius: 6px; font-size: 10px; cursor: pointer; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: white;">📋 Copier</button>
                        <button data-action="show-us-detail" data-index="${i}" style="flex: 1; padding: 8px; border-radius: 6px; font-size: 10px; cursor: pointer; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: white;">👁️ Détail</button>
                    </div>
                </div>
            `).join('');
        }

        // ══════════════════════════════════════════════════════════════════
        // V2: FONCTIONS D'EXPORT
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
- Failure Rate: ${doraMetrics.changeFailureRate}%

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
