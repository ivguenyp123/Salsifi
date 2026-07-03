        // ══════════════════════════════════════════════════════════════════
        //  CONFIGURATION
        // ══════════════════════════════════════════════════════════════════

        let GITLAB_URL = null;
        let TOKEN = null;
        let PROJECT_ID = null;
        let currentDate = new Date(); // Par défaut: aujourd'hui

        // Concurrence pour les fetches de détails (commit diffs, pipeline jobs,
        // MR notes, pipelines des 7 derniers jours pour les tendances).
        // Aligné sur conflict-radar / bus-factor / repo-diet.
        const DETAILS_CONCURRENCY = 8;

        // ══════════════════════════════════════════════════════════════════
        //  HELPERS — fetchGitLab (retry 429), runWithConcurrency, escapeHtml.
        //  Alignés sur l'écosystème.
        // ══════════════════════════════════════════════════════════════════

        async function fetchGitLab(endpoint, init = {}) {
            const url = `${GITLAB_URL}/api/v4${endpoint}`;
            const headers = { 'PRIVATE-TOKEN': TOKEN, ...(init.headers || {}) };
            let r = await fetch(url, { ...init, headers });
            if (r.status === 429) {
                const retryAfter = parseInt(r.headers.get('Retry-After')) || 2;
                console.warn(`[fetchGitLab] 429 sur ${endpoint}, retry dans ${retryAfter}s`);
                await new Promise(res => setTimeout(res, retryAfter * 1000));
                r = await fetch(url, { ...init, headers });
            }
            return r;
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

        // Échappement strict pour attributs HTML (href, data-*, etc.).
        // Plus restrictif qu'escapeHtml — neutralise aussi ' et ".
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
        //  INITIALISATION
        // ══════════════════════════════════════════════════════════════════

        function init() {
            // Nouveau format hub : localStorage 'devops_hub_workspaces' (JSON) + 'hub_selected_repo_id'
            const authRaw = localStorage.getItem('devops_hub_workspaces');
            if (authRaw) {
                try {
                    const auth = JSON.parse(authRaw);
                    TOKEN = auth.token;
                    GITLAB_URL = auth.gitlabUrl;
                } catch { /* fallback ci-dessous */ }
            }
            // Fallback ancien format (sessionStorage)
            if (!TOKEN) TOKEN = sessionStorage.getItem('gitlab_token');
            if (!GITLAB_URL) GITLAB_URL = sessionStorage.getItem('gitlab_base_url');

            // Project ID : nouveau format puis ancien
            const selectedRepoId = localStorage.getItem('hub_selected_repo_id');
            PROJECT_ID = selectedRepoId || sessionStorage.getItem('gitlab_project_id');

            // Guard strict — les 3 clés sont nécessaires.
            if (!TOKEN || !GITLAB_URL || !PROJECT_ID) {
                window.location.href = 'login.html';
                return;
            }

            attachEventDelegation();
            updateDateDisplay();
            loadReport();
        }

        // Event delegation centralisée (anciennement onclick inline dans le HTML).
        const ACTION_HANDLERS = {
            'prev-date':       () => changeDate(-1),
            'next-date':       () => changeDate(1),
            'go-today':        () => goToday(),
            'week-report':     (e, el) => generateWeekReport(el),
            'month-report':    (e, el) => generateMonthReport(el),
            'load-report':     () => loadReport()
        };

        function attachEventDelegation() {
            document.body.addEventListener('click', (e) => {
                const el = e.target.closest('[data-action]');
                if (!el) return;
                const handler = ACTION_HANDLERS[el.dataset.action];
                if (handler) handler(e, el);
            });
        }

        // ══════════════════════════════════════════════════════════════════
        //  NAVIGATION DATE
        // ══════════════════════════════════════════════════════════════════
        
        function formatDateDisplay(date) {
            const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
            const formatted = date.toLocaleDateString('fr-FR', options);
            return formatted.charAt(0).toUpperCase() + formatted.slice(1);
        }
        
        function formatDateISO(date) {
            return date.toISOString().split('T')[0];
        }
        
        function updateDateDisplay() {
            document.getElementById('report-date').textContent = formatDateDisplay(currentDate);
            document.getElementById('intro-title').textContent = `Rapport du ${formatDateDisplay(currentDate)}`;
        }
        
        function changeDate(delta) {
            currentDate.setDate(currentDate.getDate() + delta);
            updateDateDisplay();
            loadReport();
        }
        
        function goToday() {
            currentDate = new Date(); // Aujourd'hui
            updateDateDisplay();
            loadReport();
        }

        // ══════════════════════════════════════════════════════════════════
        //  CHARGEMENT DU RAPPORT
        // ══════════════════════════════════════════════════════════════════
        
        async function loadReport() {
            const btn = document.getElementById('btn-refresh');
            btn.classList.add('loading');
            btn.textContent = '⏳ Chargement...';
            
            // Reset stats
            document.querySelectorAll('.stat-card').forEach(c => c.classList.add('loading'));
            
            const dateStart = new Date(currentDate);
            dateStart.setHours(0, 0, 0, 0);
            const dateEnd = new Date(currentDate);
            dateEnd.setHours(23, 59, 59, 999);
            
            const after = dateStart.toISOString();
            const before = dateEnd.toISOString();
            
            try {
                // Charger en parallèle
                const [
                    pipelines,
                    mrsMerged,
                    mrsOpen,
                    tags,
                    deployments,
                    branches,
                    issuesClosed,
                    issuesOpened,
                    commits,
                    mrsClosed
                ] = await Promise.all([
                    fetchPipelines(after, before),
                    fetchMRsMerged(after, before),
                    fetchMRsOpen(),
                    fetchTags(after, before),
                    fetchDeployments(after, before),
                    fetchBranches(),
                    fetchIssues('closed', after, before),
                    fetchIssues('opened', after, before),
                    fetchCommits(after, before),
                    fetchMRsClosed(after, before)
                ]);
                
                // Stats globales
                updateStats(pipelines, mrsMerged, tags, deployments, commits);
                
                // Sections existantes
                renderFailedPipelines(pipelines.filter(p => p.status === 'failed'));
                renderDeployments(deployments);
                renderTags(tags);
                renderMRsMerged(mrsMerged);
                renderMRsOpen(mrsOpen);
                renderMRsClosed(mrsClosed);
                renderBranches(branches);
                renderIssues(issuesClosed, issuesOpened);
                renderTimeline(pipelines, mrsMerged, tags, deployments, commits);
                
                // Nouvelles sections
                renderLongPipelines(pipelines);
                renderRiskyBranches(branches);
                renderReverts(commits, mrsMerged);
                await renderCoverage(pipelines);
                await renderBugs(after, before, commits);
                await renderCodeQuality(commits, pipelines);
                await renderTests(pipelines);
                await renderSecurity();
                await renderReviews(mrsMerged, mrsOpen, after, before);
                await renderDailyTips(pipelines, commits, mrsMerged, mrsOpen, mrsClosed, branches, deployments, issuesOpened);
                await renderTrends(after, before, pipelines);
                
                document.getElementById('last-refresh').textContent = 
                    `Dernière actualisation : ${new Date().toLocaleTimeString('fr-FR')}`;
                
            } catch (error) {
                console.error('Erreur chargement rapport:', error);
                alert('Erreur lors du chargement des données: ' + error.message);
            } finally {
                btn.classList.remove('loading');
                btn.textContent = '🔄 Actualiser';
                document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('loading'));
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  APPELS API GITLAB
        // ══════════════════════════════════════════════════════════════════
        
        // Wrapper qui parse le JSON et lance une erreur sur non-OK.
        // Utilise fetchGitLab (retry 429 inclus). Conservé sous ce nom pour
        // limiter les changements dans tous les callers existants.
        async function gitlabFetch(endpoint) {
            const r = await fetchGitLab(endpoint);
            if (!r.ok) throw new Error(`API Error: ${r.status}`);
            return r.json();
        }
        
        async function fetchPipelines(after, before) {
            try {
                const data = await gitlabFetch(`/projects/${PROJECT_ID}/pipelines?per_page=100&updated_after=${after}&updated_before=${before}`);
                return Array.isArray(data) ? data : [];
            } catch (e) { console.error('fetchPipelines:', e); return []; }
        }
        
        async function fetchMRsMerged(after, before) {
            try {
                const data = await gitlabFetch(`/projects/${PROJECT_ID}/merge_requests?state=merged&per_page=100&updated_after=${after}&updated_before=${before}`);
                return Array.isArray(data) ? data : [];
            } catch (e) { console.error('fetchMRsMerged:', e); return []; }
        }
        
        async function fetchMRsOpen() {
            try {
                const data = await gitlabFetch(`/projects/${PROJECT_ID}/merge_requests?state=opened&per_page=50`);
                return Array.isArray(data) ? data : [];
            } catch (e) { console.error('fetchMRsOpen:', e); return []; }
        }
        
        async function fetchMRsClosed(after, before) {
            try {
                const data = await gitlabFetch(`/projects/${PROJECT_ID}/merge_requests?state=closed&per_page=100&updated_after=${after}&updated_before=${before}`);
                return Array.isArray(data) ? data : [];
            } catch (e) { console.error('fetchMRsClosed:', e); return []; }
        }
        
        async function fetchTags(after, before) {
            try {
                // GitLab API ne filtre pas les tags par date, on filtre côté client
                const data = await gitlabFetch(`/projects/${PROJECT_ID}/repository/tags?per_page=50`);
                if (!Array.isArray(data)) return [];
                
                const afterDate = new Date(after);
                const beforeDate = new Date(before);
                
                return data.filter(tag => {
                    if (!tag.commit || !tag.commit.created_at) return false;
                    const tagDate = new Date(tag.commit.created_at);
                    return tagDate >= afterDate && tagDate <= beforeDate;
                });
            } catch (e) { console.error('fetchTags:', e); return []; }
        }
        
        async function fetchDeployments(after, before) {
            try {
                const data = await gitlabFetch(`/projects/${PROJECT_ID}/deployments?per_page=50&updated_after=${after}&updated_before=${before}`);
                return Array.isArray(data) ? data : [];
            } catch (e) { console.error('fetchDeployments:', e); return []; }
        }
        
        async function fetchBranches() {
            try {
                const data = await gitlabFetch(`/projects/${PROJECT_ID}/repository/branches?per_page=100`);
                return Array.isArray(data) ? data : [];
            } catch (e) { console.error('fetchBranches:', e); return []; }
        }
        
        async function fetchIssues(state, after, before) {
            try {
                const field = state === 'closed' ? 'updated_after' : 'created_after';
                const data = await gitlabFetch(`/projects/${PROJECT_ID}/issues?state=${state}&per_page=50&${field}=${after}`);
                return Array.isArray(data) ? data : [];
            } catch (e) { console.error('fetchIssues:', e); return []; }
        }
        
        async function fetchCommits(after, before) {
            try {
                const data = await gitlabFetch(`/projects/${PROJECT_ID}/repository/commits?per_page=100&since=${after}&until=${before}`);
                return Array.isArray(data) ? data : [];
            } catch (e) { console.error('fetchCommits:', e); return []; }
        }

        // ══════════════════════════════════════════════════════════════════
        //  MISE À JOUR DES STATS
        // ══════════════════════════════════════════════════════════════════
        
        function updateStats(pipelines, mrs, tags, deployments, commits) {
            const success = pipelines.filter(p => p.status === 'success').length;
            const failed = pipelines.filter(p => p.status === 'failed').length;
            const total = pipelines.length;
            const successRate = total > 0 ? Math.round((success / total) * 100) : 0;
            
            document.getElementById('stat-mrs').textContent = mrs.length;
            document.getElementById('stat-pipelines').textContent = total;
            document.getElementById('stat-failed').textContent = failed;
            document.getElementById('stat-deploys').textContent = deployments.length || tags.length;
            document.getElementById('stat-success-rate').textContent = total > 0 ? `${successRate}%` : '-';
            document.getElementById('stat-commits').textContent = commits.length;
            
            document.getElementById('stat-bar-success').style.width = `${successRate}%`;
            document.getElementById('stat-bar-failed').style.width = `${100 - successRate}%`;
        }

        // ══════════════════════════════════════════════════════════════════
        //  RENDU DES SECTIONS
        // ══════════════════════════════════════════════════════════════════
        
        function renderFailedPipelines(pipelines) {
            const body = document.getElementById('body-failed-pipelines');
            const count = document.getElementById('count-failed-pipelines');
            count.textContent = pipelines.length;
            
            if (pipelines.length === 0) {
                body.innerHTML = `<div class="empty-state"><div class="icon">✨</div><p>Aucun pipeline en échec - belle journée !</p></div>`;
                return;
            }
            
            body.innerHTML = pipelines.slice(0, 5).map(p => `
                <div class="item">
                    <div class="item-icon">❌</div>
                    <div class="item-content">
                        <div class="item-title"><a href="${escapeAttr(p.web_url)}" target="_blank" rel="noopener noreferrer">#${p.id}</a> - ${escapeHtml(p.ref)}</div>
                        <div class="item-meta">Source: ${escapeHtml(p.source || 'push')}</div>
                    </div>
                    <div class="item-right">
                        <div class="item-time">${formatTime(p.updated_at)}</div>
                        <span class="item-badge badge-failed">failed</span>
                    </div>
                </div>
            `).join('');
            
            if (pipelines.length > 5) {
                body.innerHTML += `<div class="more-link">+ ${pipelines.length - 5} autres pipelines en échec</div>`;
            }
        }
        
        function renderDeployments(deployments) {
            const body = document.getElementById('body-deploys');
            const count = document.getElementById('count-deploys');
            count.textContent = deployments.length;
            
            if (deployments.length === 0) {
                body.innerHTML = `<div class="empty-state"><div class="icon">📦</div><p>Pas de déploiement ce jour</p></div>`;
                return;
            }
            
            body.innerHTML = deployments.slice(0, 5).map(d => `
                <div class="item">
                    <div class="item-icon">${d.status === 'success' ? '🟢' : '🟡'}</div>
                    <div class="item-content">
                        <div class="item-title">${escapeHtml(d.ref)} → ${escapeHtml(d.environment?.name || 'env')}</div>
                        <div class="item-meta">par ${escapeHtml(d.user?.name || 'auto')}</div>
                    </div>
                    <div class="item-right">
                        <div class="item-time">${formatTime(d.updated_at)}</div>
                        <span class="item-badge ${d.status === 'success' ? 'badge-success' : 'badge-info'}">${escapeHtml(d.status)}</span>
                    </div>
                </div>
            `).join('');
        }
        
        function renderTags(tags) {
            const body = document.getElementById('body-tags');
            const count = document.getElementById('count-tags');
            count.textContent = tags.length;
            
            if (tags.length === 0) {
                body.innerHTML = `<div class="empty-state"><div class="icon">🏷️</div><p>Pas de tag créé ce jour</p></div>`;
                return;
            }
            
            body.innerHTML = tags.slice(0, 5).map(t => `
                <div class="item">
                    <div class="item-icon">🏷️</div>
                    <div class="item-content">
                        <div class="item-title">${escapeHtml(t.name)}</div>
                        <div class="item-meta">${escapeHtml(t.message || t.commit?.title || '')}</div>
                    </div>
                    <div class="item-right">
                        <div class="item-time">${formatTime(t.commit?.created_at)}</div>
                        <span class="item-badge badge-success">release</span>
                    </div>
                </div>
            `).join('');
        }
        
        function renderMRsMerged(mrs) {
            const body = document.getElementById('body-mrs-merged');
            const count = document.getElementById('count-mrs-merged');
            count.textContent = mrs.length;
            
            if (mrs.length === 0) {
                body.innerHTML = `<div class="empty-state"><div class="icon">📝</div><p>Pas de MR mergée ce jour</p></div>`;
                return;
            }
            
            body.innerHTML = mrs.slice(0, 5).map(mr => `
                <div class="item">
                    <div class="item-icon">🔀</div>
                    <div class="item-content">
                        <div class="item-title"><a href="${escapeAttr(mr.web_url)}" target="_blank" rel="noopener noreferrer">!${mr.iid}</a> ${escapeHtml(truncate(mr.title, 50))}</div>
                        <div class="item-meta">par ${escapeHtml(mr.author?.name || '?')} → ${escapeHtml(mr.target_branch)}</div>
                    </div>
                    <div class="item-right">
                        <div class="item-time">${formatTime(mr.merged_at)}</div>
                    </div>
                </div>
            `).join('');
            
            if (mrs.length > 5) {
                body.innerHTML += `<div class="more-link">+ ${mrs.length - 5} autres MRs</div>`;
            }
        }
        
        function renderMRsOpen(mrs) {
            const body = document.getElementById('body-mrs-open');
            const count = document.getElementById('count-mrs-open');
            count.textContent = mrs.length;
            
            if (mrs.length === 0) {
                body.innerHTML = `<div class="empty-state"><div class="icon">🎉</div><p>Pas de MR en attente</p></div>`;
                return;
            }
            
            // Trier par âge
            mrs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            
            body.innerHTML = mrs.slice(0, 5).map(mr => {
                const age = daysSince(mr.created_at);
                let badgeClass = 'badge-info';
                if (age > 7) badgeClass = 'badge-failed';
                else if (age > 3) badgeClass = 'badge-warning';
                
                return `
                <div class="item">
                    <div class="item-icon">🕐</div>
                    <div class="item-content">
                        <div class="item-title"><a href="${escapeAttr(mr.web_url)}" target="_blank" rel="noopener noreferrer">!${mr.iid}</a> ${escapeHtml(truncate(mr.title, 45))}</div>
                        <div class="item-meta">par ${escapeHtml(mr.author?.name || '?')} - ${age}j d'attente</div>
                    </div>
                    <div class="item-right">
                        <span class="item-badge ${badgeClass}">${age}j</span>
                    </div>
                </div>
            `}).join('');
            
            if (mrs.length > 5) {
                body.innerHTML += `<div class="more-link">+ ${mrs.length - 5} autres MRs en attente</div>`;
            }
        }
        
        function renderMRsClosed(mrs) {
            const body = document.getElementById('body-mrs-closed');
            const count = document.getElementById('count-mrs-closed');
            count.textContent = mrs.length;
            
            if (mrs.length === 0) {
                body.innerHTML = `<div class="empty-state"><div class="icon">👍</div><p>Aucune MR refusée ce jour</p></div>`;
                return;
            }
            
            body.innerHTML = mrs.slice(0, 10).map(mr => {
                const closedDate = new Date(mr.updated_at);
                const timeStr = closedDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                
                return `
                <div class="item">
                    <div class="item-icon">❌</div>
                    <div class="item-content">
                        <div class="item-title"><a href="${escapeAttr(mr.web_url)}" target="_blank" rel="noopener noreferrer">!${mr.iid}</a> ${escapeHtml(truncate(mr.title, 45))}</div>
                        <div class="item-meta">par ${escapeHtml(mr.author?.name || '?')} - fermée à ${timeStr}</div>
                    </div>
                    <div class="item-right">
                        <span class="item-badge badge-failed">fermée</span>
                    </div>
                </div>
            `}).join('');
            
            if (mrs.length > 10) {
                body.innerHTML += `<div class="more-link">+ ${mrs.length - 10} autres MRs fermées</div>`;
            }
        }
        
        function renderBranches(branches) {
            const count = document.getElementById('count-branches');
            count.textContent = branches.length;
            
            const now = new Date();
            const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
            
            let active = 0, stale = 0, merged = 0;
            
            branches.forEach(b => {
                const lastCommit = new Date(b.commit?.committed_date || b.commit?.created_at);
                if (b.merged) {
                    merged++;
                } else if (lastCommit < thirtyDaysAgo) {
                    stale++;
                } else {
                    active++;
                }
            });
            
            document.getElementById('branches-active').textContent = active;
            document.getElementById('branches-stale').textContent = stale;
            document.getElementById('branches-merged').textContent = merged;
        }
        
        function renderIssues(closed, opened) {
            document.getElementById('issues-closed').textContent = closed.length;
            document.getElementById('issues-opened').textContent = opened.length;
            document.getElementById('count-issues').textContent = `+${opened.length} / -${closed.length}`;
        }
        
        function renderTimeline(pipelines, mrs, tags, deployments, commits) {
            const timeline = document.getElementById('body-timeline');
            
            // Construire les events
            const events = [];
            
            pipelines.forEach(p => {
                events.push({
                    time: new Date(p.updated_at),
                    type: p.status === 'failed' ? 'failed' : (p.status === 'success' ? 'success' : 'info'),
                    title: `Pipeline #${p.id} ${p.status}`,
                    desc: `${p.ref} - ${p.source || 'push'}`
                });
            });

            mrs.forEach(mr => {
                events.push({
                    time: new Date(mr.merged_at),
                    type: 'success',
                    title: `MR !${mr.iid} mergée`,
                    desc: truncate(mr.title, 60)
                });
            });

            tags.forEach(t => {
                events.push({
                    time: new Date(t.commit?.created_at),
                    type: 'info',
                    title: `🏷️ Tag ${t.name}`,
                    desc: t.message || ''
                });
            });

            deployments.forEach(d => {
                events.push({
                    time: new Date(d.updated_at),
                    type: 'deploy',
                    title: `🚀 Deploy ${d.ref}`,
                    desc: `→ ${d.environment?.name || 'env'}`
                });
            });

            // Trier par heure
            events.sort((a, b) => a.time - b.time);

            if (events.length === 0) {
                timeline.innerHTML = `<div class="empty-state"><div class="icon">📅</div><p>Pas d'activité ce jour</p></div>`;
                return;
            }

            // escapeHtml sur title/desc — ils contiennent des données dynamiques
            // (refs, titres MR, messages de tag, noms d'environnements).
            timeline.innerHTML = events.slice(0, 15).map(e => `
                <div class="timeline-item">
                    <div class="timeline-time">${e.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                    <div class="timeline-dot ${e.type}"></div>
                    <div class="timeline-content">
                        <div class="timeline-title">${escapeHtml(e.title)}</div>
                        <div class="timeline-desc">${escapeHtml(e.desc)}</div>
                    </div>
                </div>
            `).join('');
            
            if (events.length > 15) {
                timeline.innerHTML += `<div class="more-link">+ ${events.length - 15} autres événements</div>`;
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  NOUVELLES SECTIONS
        // ══════════════════════════════════════════════════════════════════

        function renderLongPipelines(pipelines) {
            const container = document.getElementById('body-long-pipelines');
            const countEl = document.getElementById('count-long-pipelines');
            
            // Filtrer pipelines > 15 minutes
            const longOnes = pipelines.filter(p => {
                if (!p.duration) return false;
                return p.duration > 900; // 15 minutes en secondes
            }).sort((a, b) => b.duration - a.duration);
            
            countEl.textContent = longOnes.length;
            
            if (longOnes.length === 0) {
                container.innerHTML = `<div class="empty-state"><div class="icon">⚡</div><p>Tous les pipelines sont rapides</p></div>`;
                return;
            }
            
            container.innerHTML = longOnes.slice(0, 5).map(p => {
                const minutes = Math.floor(p.duration / 60);
                const seconds = p.duration % 60;
                return `
                    <div class="item-row">
                        <div class="item-icon">${p.status === 'success' ? '✅' : p.status === 'failed' ? '❌' : '⏸️'}</div>
                        <div class="item-content">
                            <div class="item-title">Pipeline #${p.id}</div>
                            <div class="item-subtitle">${escapeHtml(p.ref)} • ${minutes}m ${seconds}s</div>
                        </div>
                        <span class="risk-badge medium">${minutes}+ min</span>
                    </div>
                `;
            }).join('');
        }

        function renderRiskyBranches(branches) {
            const container = document.getElementById('body-risky-branches');
            const countEl = document.getElementById('count-risky-branches');
            
            // Branches > 30 jours sans activité
            const risky = branches.filter(b => {
                if (b.name === 'main' || b.name === 'master' || b.name === 'develop') return false;
                const lastCommit = new Date(b.commit?.committed_date || b.commit?.created_at);
                const daysOld = Math.floor((new Date() - lastCommit) / (1000 * 60 * 60 * 24));
                return daysOld > 30;
            }).map(b => {
                const lastCommit = new Date(b.commit?.committed_date || b.commit?.created_at);
                const daysOld = Math.floor((new Date() - lastCommit) / (1000 * 60 * 60 * 24));
                return { ...b, daysOld };
            }).sort((a, b) => b.daysOld - a.daysOld);
            
            countEl.textContent = risky.length;
            
            if (risky.length === 0) {
                container.innerHTML = `<div class="empty-state"><div class="icon">✨</div><p>Toutes les branches sont à jour</p></div>`;
                return;
            }
            
            container.innerHTML = risky.slice(0, 5).map(b => {
                const risk = b.daysOld > 90 ? 'high' : b.daysOld > 60 ? 'medium' : 'low';
                return `
                    <div class="item-row">
                        <div class="item-icon">🌿</div>
                        <div class="item-content">
                            <div class="item-title">${escapeHtml(b.name)}</div>
                            <div class="item-subtitle">Dernière activité il y a ${b.daysOld} jours</div>
                        </div>
                        <span class="risk-badge ${risk}">${b.daysOld}j</span>
                    </div>
                `;
            }).join('');
        }

        function renderReverts(commits, mrs) {
            const container = document.getElementById('body-reverts');
            const countEl = document.getElementById('count-reverts');
            
            // Chercher les commits/MRs avec "revert" dans le titre
            const revertCommits = commits.filter(c => 
                c.title?.toLowerCase().includes('revert') || 
                c.message?.toLowerCase().includes('revert')
            );
            
            const revertMRs = mrs.filter(mr => 
                mr.title?.toLowerCase().includes('revert')
            );
            
            const total = revertCommits.length + revertMRs.length;
            countEl.textContent = total;
            
            if (total === 0) {
                container.innerHTML = `<div class="empty-state"><div class="icon">👍</div><p>Aucun revert ce jour</p></div>`;
                return;
            }
            
            let html = '';

            revertCommits.forEach(c => {
                html += `
                    <div class="item-row">
                        <div class="item-icon">🔁</div>
                        <div class="item-content">
                            <div class="item-title">${escapeHtml(truncate(c.title, 60))}</div>
                            <div class="item-subtitle">Commit par ${escapeHtml(c.author_name || 'unknown')}</div>
                        </div>
                    </div>
                `;
            });

            revertMRs.forEach(mr => {
                html += `
                    <div class="item-row">
                        <div class="item-icon">🔁</div>
                        <div class="item-content">
                            <div class="item-title">${escapeHtml(truncate(mr.title, 60))}</div>
                            <div class="item-subtitle">MR !${mr.iid} par ${escapeHtml(mr.author?.name || 'unknown')}</div>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;
        }

        async function renderCoverage(pipelines) {
            const container = document.getElementById('body-coverage');
            
            // Chercher les pipelines avec coverage
            const withCoverage = pipelines.filter(p => p.coverage !== null && p.coverage !== undefined);
            
            if (withCoverage.length === 0) {
                container.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>Pas de données de couverture disponibles</p></div>`;
                return;
            }
            
            // Prendre le plus récent
            const latest = withCoverage.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
            const coverage = parseFloat(latest.coverage).toFixed(1);
            
            let color = '#34d399'; // vert
            if (coverage < 50) color = '#f87171'; // rouge
            else if (coverage < 80) color = '#fbbf24'; // jaune
            
            container.innerHTML = `
                <div class="coverage-display">
                    <div class="coverage-main">
                        <div class="coverage-percent" style="color: ${color}">${coverage}%</div>
                        <div class="coverage-bar-container">
                            <div class="coverage-bar-fill" style="width: ${coverage}%; background: ${color};"></div>
                        </div>
                    </div>
                    <div class="coverage-trend">Pipeline #${latest.id} (${escapeHtml(latest.ref)})</div>
                </div>
            `;
        }

        async function renderBugs(after, before, commits) {
            const container = document.getElementById('body-bugs');
            const countEl = document.getElementById('count-bugs');
            
            let items = [];
            
            // 1. Issues labellisées "bug"
            try {
                const bugIssues = await gitlabFetch(`/projects/${PROJECT_ID}/issues?labels=bug&updated_after=${after}&updated_before=${before}&per_page=20`);
                bugIssues.forEach(issue => {
                    items.push({
                        type: 'issue',
                        icon: '🐛',
                        title: issue.title,
                        subtitle: `Issue #${issue.iid} • ${issue.state} • ${issue.author?.name || 'unknown'}`,
                        state: issue.state,
                        date: new Date(issue.updated_at)
                    });
                });
            } catch (e) {
                console.warn('Erreur récupération issues bug:', e);
            }

            // 2. Commits de fix
            const fixPatterns = /\b(fix|bugfix|hotfix|patch|correct|repair)\b/i;
            const fixCommits = commits.filter(c => fixPatterns.test(c.title) || fixPatterns.test(c.message || ''));

            fixCommits.forEach(c => {
                items.push({
                    type: 'commit',
                    icon: '🔧',
                    title: truncate(c.title, 55),
                    subtitle: `Commit • ${c.author_name || 'unknown'} • ${formatTime(c.created_at)}`,
                    date: new Date(c.created_at)
                });
            });

            // Trier par date
            items.sort((a, b) => b.date - a.date);

            countEl.textContent = items.length;

            if (items.length === 0) {
                container.innerHTML = `<div class="empty-state"><div class="icon">✨</div><p>Aucun bug signalé ce jour</p></div>`;
                return;
            }

            container.innerHTML = items.slice(0, 8).map(item => `
                <div class="item-row">
                    <div class="item-icon">${item.icon}</div>
                    <div class="item-content">
                        <div class="item-title">${escapeHtml(item.title)}</div>
                        <div class="item-subtitle">${escapeHtml(item.subtitle)}</div>
                    </div>
                    ${item.state ? `<span class="risk-badge ${item.state === 'closed' ? 'low' : 'medium'}">${escapeHtml(item.state)}</span>` : ''}
                </div>
            `).join('');
        }

        async function renderCodeQuality(commits, pipelines) {
            const container = document.getElementById('body-code-quality');
            const countEl = document.getElementById('count-code-quality');

            let items = [];

            // 1. TODO/FIXME/HACK/XXX dans les commits (synchrone)
            const debtPatterns = /\b(TODO|FIXME|HACK|XXX|KLUDGE|BUG)\b/i;
            const debtCommits = commits.filter(c =>
                debtPatterns.test(c.title) || debtPatterns.test(c.message || '')
            );

            debtCommits.forEach(c => {
                const match = (c.title + ' ' + (c.message || '')).match(debtPatterns);
                items.push({
                    type: 'debt',
                    icon: '📝',
                    title: truncate(c.title, 55),
                    subtitle: `${match ? match[0].toUpperCase() : 'TODO'} détecté • ${c.author_name || 'unknown'}`,
                    risk: 'medium'
                });
            });

            // 2. Gros commits (>10 fichiers modifiés = risque) — PARALLÉLISÉ.
            // Avant : for...await séquentiel sur 10 commits = ~3s.
            // Maintenant : runWithConcurrency à 8 = <1s.
            const commitsToCheck = commits.slice(0, 10);
            const diffTasks = commitsToCheck.map(c => async () => {
                try {
                    const diff = await gitlabFetch(`/projects/${PROJECT_ID}/repository/commits/${c.id}/diff`);
                    return { c, diff };
                } catch {
                    return null;
                }
            });
            const diffResults = await runWithConcurrency(diffTasks, DETAILS_CONCURRENCY);
            for (const r of diffResults) {
                if (r.status !== 'fulfilled' || !r.value) continue;
                const { c, diff } = r.value;
                if (diff.length > 10) {
                    items.push({
                        type: 'large',
                        icon: '📦',
                        title: truncate(c.title, 55),
                        subtitle: `${diff.length} fichiers modifiés • Commit volumineux`,
                        risk: diff.length > 20 ? 'high' : 'medium'
                    });
                }
            }

            // 3. Code quality jobs (sonar/lint/quality) — PARALLÉLISÉ aussi.
            const pipelinesToCheck = pipelines.filter(p => p.status === 'success').slice(0, 3);
            const jobTasks = pipelinesToCheck.map(p => async () => {
                try {
                    const jobs = await gitlabFetch(`/projects/${PROJECT_ID}/pipelines/${p.id}/jobs`);
                    return { p, jobs };
                } catch {
                    return null;
                }
            });
            const jobResults = await runWithConcurrency(jobTasks, DETAILS_CONCURRENCY);
            for (const r of jobResults) {
                if (r.status !== 'fulfilled' || !r.value) continue;
                const { p, jobs } = r.value;
                const qualityJob = jobs.find(j =>
                    j.name.toLowerCase().includes('quality') ||
                    j.name.toLowerCase().includes('sonar') ||
                    j.name.toLowerCase().includes('lint')
                );
                if (qualityJob && qualityJob.status === 'failed') {
                    items.push({
                        type: 'quality',
                        icon: '🔍',
                        title: `Job ${qualityJob.name} échoué`,
                        subtitle: `Pipeline #${p.id} • Vérifier les règles de qualité`,
                        risk: 'high'
                    });
                }
            }

            countEl.textContent = items.length;

            if (items.length === 0) {
                container.innerHTML = `<div class="empty-state"><div class="icon">👍</div><p>Aucun point d'attention détecté</p></div>`;
                return;
            }

            container.innerHTML = items.slice(0, 8).map(item => `
                <div class="item-row">
                    <div class="item-icon">${item.icon}</div>
                    <div class="item-content">
                        <div class="item-title">${escapeHtml(item.title)}</div>
                        <div class="item-subtitle">${escapeHtml(item.subtitle)}</div>
                    </div>
                    <span class="risk-badge ${item.risk}">${item.risk === 'high' ? '⚠️' : '📋'}</span>
                </div>
            `).join('');
        }

        async function renderTests(pipelines) {
            const container = document.getElementById('body-tests');
            const countEl = document.getElementById('count-tests');

            let testJobs = [];

            // Récupérer les jobs de test des 5 derniers pipelines — PARALLÉLISÉ.
            // Avant : for...await séquentiel = 5 × ~300ms = 1.5s.
            // Maintenant : runWithConcurrency à 8 = <500ms.
            const pipelinesToCheck = pipelines.slice(0, 5);
            const tasks = pipelinesToCheck.map(p => async () => {
                try {
                    const jobs = await gitlabFetch(`/projects/${PROJECT_ID}/pipelines/${p.id}/jobs`);
                    const tests = jobs.filter(j =>
                        j.name.toLowerCase().includes('test') ||
                        j.name.toLowerCase().includes('spec') ||
                        j.name.toLowerCase().includes('unit') ||
                        j.name.toLowerCase().includes('integration') ||
                        j.name.toLowerCase().includes('e2e')
                    );
                    return { p, tests };
                } catch (e) {
                    console.warn('Erreur récupération jobs:', e);
                    return null;
                }
            });
            const results = await runWithConcurrency(tasks, DETAILS_CONCURRENCY);
            for (const r of results) {
                if (r.status !== 'fulfilled' || !r.value) continue;
                const { p, tests } = r.value;
                tests.forEach(t => {
                    testJobs.push({
                        ...t,
                        pipelineId: p.id,
                        pipelineRef: p.ref
                    });
                });
            }

            countEl.textContent = testJobs.length;

            if (testJobs.length === 0) {
                container.innerHTML = `<div class="empty-state"><div class="icon">🔬</div><p>Aucun job de test détecté</p></div>`;
                return;
            }

            // Stats
            const passed = testJobs.filter(j => j.status === 'success').length;
            const failed = testJobs.filter(j => j.status === 'failed').length;
            const other = testJobs.length - passed - failed;

            let html = `
                <div class="summary-boxes">
                    <div class="summary-box green">
                        <div class="value">${passed}</div>
                        <div class="label">réussis</div>
                    </div>
                    <div class="summary-box red">
                        <div class="value">${failed}</div>
                        <div class="label">échoués</div>
                    </div>
                    <div class="summary-box yellow">
                        <div class="value">${other}</div>
                        <div class="label">autres</div>
                    </div>
                </div>
            `;

            // Liste des jobs échoués en priorité — escapeHtml sur nom et ref.
            const failedJobs = testJobs.filter(j => j.status === 'failed');
            if (failedJobs.length > 0) {
                html += failedJobs.slice(0, 5).map(j => `
                    <div class="item-row">
                        <div class="item-icon">❌</div>
                        <div class="item-content">
                            <div class="item-title">${escapeHtml(j.name)}</div>
                            <div class="item-subtitle">Pipeline #${j.pipelineId} (${escapeHtml(j.pipelineRef)}) • ${formatDuration(j.duration)}</div>
                        </div>
                        <span class="risk-badge high">failed</span>
                    </div>
                `).join('');
            }

            // Quelques jobs réussis
            const passedJobs = testJobs.filter(j => j.status === 'success');
            if (passedJobs.length > 0 && failedJobs.length < 5) {
                html += passedJobs.slice(0, 3).map(j => `
                    <div class="item-row">
                        <div class="item-icon">✅</div>
                        <div class="item-content">
                            <div class="item-title">${escapeHtml(j.name)}</div>
                            <div class="item-subtitle">Pipeline #${j.pipelineId} (${escapeHtml(j.pipelineRef)}) • ${formatDuration(j.duration)}</div>
                        </div>
                        <span class="risk-badge low">passed</span>
                    </div>
                `).join('');
            }

            container.innerHTML = html;
        }

        function formatDuration(seconds) {
            if (!seconds) return '-';
            if (seconds < 60) return `${seconds}s`;
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}m ${secs}s`;
        }

        async function renderSecurity() {
            const container = document.getElementById('body-security');
            const countEl = document.getElementById('count-security');
            
            try {
                // Tenter de récupérer les vulnérabilités (GitLab Ultimate)
                const vulns = await gitlabFetch(`/projects/${PROJECT_ID}/vulnerability_findings?per_page=10`);
                
                countEl.textContent = vulns.length;
                
                if (vulns.length === 0) {
                    container.innerHTML = `<div class="empty-state"><div class="icon">🛡️</div><p>Aucune alerte de sécurité</p></div>`;
                    return;
                }
                
                container.innerHTML = vulns.slice(0, 5).map(v => {
                    const severity = v.severity || 'unknown';
                    const risk = severity === 'critical' || severity === 'high' ? 'high' :
                                severity === 'medium' ? 'medium' : 'low';
                    return `
                        <div class="item-row">
                            <div class="item-icon">⚠️</div>
                            <div class="item-content">
                                <div class="item-title">${escapeHtml(truncate(v.name || v.title, 50))}</div>
                                <div class="item-subtitle">${escapeHtml(v.scanner?.name || 'Scanner')}</div>
                            </div>
                            <span class="risk-badge ${risk}">${escapeHtml(severity)}</span>
                        </div>
                    `;
                }).join('');
                
            } catch (e) {
                // API non disponible (pas GitLab Ultimate)
                container.innerHTML = `<div class="empty-state"><div class="icon">🔒</div><p>Scan de sécurité non configuré ou non disponible</p></div>`;
                countEl.textContent = '-';
            }
        }

        async function renderReviews(mrsMerged, mrsOpen, after, before) {
            const container = document.getElementById('body-reviews');
            const countEl = document.getElementById('count-reviews');

            // Récupérer les notes/commentaires sur les MRs — PARALLÉLISÉ.
            // Avant : for...await séquentiel sur 5 MRs = ~1.5s.
            // Maintenant : runWithConcurrency à 8 = <500ms.
            const allMRs = [...mrsMerged, ...mrsOpen];
            const mrsToCheck = allMRs.slice(0, 5);
            const afterDate = new Date(after);
            const beforeDate = new Date(before);

            const tasks = mrsToCheck.map(mr => async () => {
                try {
                    const notes = await gitlabFetch(`/projects/${PROJECT_ID}/merge_requests/${mr.iid}/notes?per_page=20`);
                    const todayNotes = notes.filter(n => {
                        const noteDate = new Date(n.created_at);
                        return noteDate >= afterDate && noteDate <= beforeDate && !n.system;
                    });
                    return { mr, notes: todayNotes };
                } catch (e) {
                    console.warn('Erreur notes MR:', e);
                    return null;
                }
            });
            const results = await runWithConcurrency(tasks, DETAILS_CONCURRENCY);

            let notesData = [];
            for (const r of results) {
                if (r.status !== 'fulfilled' || !r.value) continue;
                const { mr, notes } = r.value;
                notes.forEach(n => notesData.push({ ...n, mrTitle: mr.title, mrIid: mr.iid }));
            }
            const totalNotes = notesData.length;

            countEl.textContent = totalNotes;

            if (totalNotes === 0) {
                container.innerHTML = `<div class="empty-state"><div class="icon">💤</div><p>Pas de commentaires ce jour</p></div>`;
                return;
            }

            // Trier par date et afficher
            notesData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            // ⚠️ XSS critique ici : n.body est saisi librement par les développeurs
            // dans GitLab (markdown brut souvent avec du code, des <>, des & non
            // échappés). escapeHtml impératif sur le body + author name.
            container.innerHTML = notesData.slice(0, 5).map(n => `
                <div class="item-row">
                    <div class="item-icon">💬</div>
                    <div class="item-content">
                        <div class="item-title">${escapeHtml(truncate(n.body, 60))}</div>
                        <div class="item-subtitle">!${n.mrIid} • ${escapeHtml(n.author?.name || 'unknown')} • ${formatTime(n.created_at)}</div>
                    </div>
                </div>
            `).join('');
        }

        async function renderDailyTips(pipelines, commits, mrsMerged, mrsOpen, mrsClosed, branches, deploys, issuesOpened) {
            const container = document.getElementById('tips-list');
            const countEl = document.getElementById('count-daily-tips');
            
            const tips = [];
            
            // ════════════════════════════════════════════════════════════════
            // ANALYSE DES DONNÉES DU JOUR
            // ════════════════════════════════════════════════════════════════
            
            const failedPipelines = pipelines.filter(p => p.status === 'failed');
            const successPipelines = pipelines.filter(p => p.status === 'success');
            const allMRs = [...mrsMerged, ...mrsOpen];
            
            // 🔴 CRITICAL: Pipelines en échec
            if (failedPipelines.length > 0) {
                const branches = [...new Set(failedPipelines.map(p => p.ref))];
                tips.push({
                    type: 'critical',
                    icon: '🔴',
                    title: `${failedPipelines.length} pipeline${failedPipelines.length > 1 ? 's' : ''} en échec`,
                    detail: branches.length === 1 
                        ? `Sur la branche "${branches[0]}". À débloquer en priorité.`
                        : `Sur ${branches.length} branches différentes. À débloquer en priorité.`,
                    badge: 'Urgent'
                });
            }
            
            // 👀 WARNING: MRs mergées sans reviewer
            const mrsWithoutReview = mrsMerged.filter(mr => 
                (!mr.reviewers || mr.reviewers.length === 0) && 
                (!mr.assignees || mr.assignees.length <= 1)
            );
            if (mrsWithoutReview.length > 0) {
                tips.push({
                    type: 'warning',
                    icon: '👀',
                    title: `${mrsWithoutReview.length} MR${mrsWithoutReview.length > 1 ? 's' : ''} mergée${mrsWithoutReview.length > 1 ? 's' : ''} sans reviewer`,
                    detail: 'Une review par un pair aide à détecter les bugs et à partager la connaissance.',
                    badge: 'Qualité'
                });
            }
            
            // 📝 WARNING: MRs sans description
            const mrsWithoutDesc = mrsMerged.filter(mr => !mr.description || mr.description.trim().length < 20);
            if (mrsWithoutDesc.length > 0 && mrsMerged.length >= 2) {
                tips.push({
                    type: 'warning',
                    icon: '📝',
                    title: `${mrsWithoutDesc.length}/${mrsMerged.length} MR${mrsWithoutDesc.length > 1 ? 's' : ''} sans description`,
                    detail: 'Une description aide à comprendre le contexte et facilite les reviews.',
                    badge: 'Documentation'
                });
            }
            
            // 📐 WARNING: Commits non conventionnels
            const conventionalPattern = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?:\s/i;
            const nonConventional = commits.filter(c => !conventionalPattern.test(c.title));
            if (commits.length >= 3 && nonConventional.length > commits.length * 0.4) {
                tips.push({
                    type: 'warning',
                    icon: '📐',
                    title: `${nonConventional.length}/${commits.length} commits non conventionnels`,
                    detail: 'Format recommandé : "feat: ...", "fix: ...", "docs: ..." pour un historique clair.',
                    badge: 'Convention'
                });
            }
            
            // ⏳ WARNING: MRs ouvertes depuis longtemps
            const oldMRs = mrsOpen.filter(mr => {
                const age = (new Date() - new Date(mr.created_at)) / (1000 * 60 * 60 * 24);
                return age > 7;
            });
            if (oldMRs.length > 0) {
                const oldest = oldMRs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
                const age = Math.floor((new Date() - new Date(oldest.created_at)) / (1000 * 60 * 60 * 24));
                tips.push({
                    type: 'warning',
                    icon: '⏳',
                    title: `${oldMRs.length} MR${oldMRs.length > 1 ? 's' : ''} en attente depuis +7 jours`,
                    detail: `La plus ancienne (!${oldest.iid}) attend depuis ${age} jours. Risque de conflits.`,
                    badge: 'À traiter'
                });
            }
            
            // ⏱️ INFO: Pipelines longs
            const longPipelines = pipelines.filter(p => p.duration && p.duration > 900);
            if (longPipelines.length > 0) {
                const avgDuration = Math.round(longPipelines.reduce((sum, p) => sum + p.duration, 0) / longPipelines.length / 60);
                tips.push({
                    type: 'info',
                    icon: '⏱️',
                    title: `${longPipelines.length} pipeline${longPipelines.length > 1 ? 's' : ''} de plus de 15 minutes`,
                    detail: `Durée moyenne : ${avgDuration} min. Des optimisations sont peut-être possibles.`,
                    badge: 'Performance'
                });
            }
            
            // 🔄 WARNING: Reverts détectés
            const reverts = commits.filter(c => 
                c.title?.toLowerCase().includes('revert') || 
                c.message?.toLowerCase().includes('revert')
            );
            if (reverts.length > 0) {
                tips.push({
                    type: 'warning',
                    icon: '🔄',
                    title: `${reverts.length} revert${reverts.length > 1 ? 's' : ''} aujourd'hui`,
                    detail: 'Un revert peut indiquer un problème en prod ou une MR mergée trop vite.',
                    badge: 'Attention'
                });
            }
            
            // ❌ INFO: MRs fermées sans merge
            if (mrsClosed.length > 0) {
                tips.push({
                    type: 'info',
                    icon: '❌',
                    title: `${mrsClosed.length} MR${mrsClosed.length > 1 ? 's' : ''} fermée${mrsClosed.length > 1 ? 's' : ''} sans être mergée${mrsClosed.length > 1 ? 's' : ''}`,
                    detail: 'Abandon volontaire ou changement de stratégie ?',
                    badge: 'Info'
                });
            }
            
            // 🐛 INFO: Nouveaux bugs
            if (issuesOpened.length > 0) {
                const bugs = issuesOpened.filter(i => i.labels && i.labels.some(l => l.toLowerCase().includes('bug')));
                if (bugs.length > 0) {
                    tips.push({
                        type: 'warning',
                        icon: '🐛',
                        title: `${bugs.length} nouveau${bugs.length > 1 ? 'x' : ''} bug${bugs.length > 1 ? 's' : ''} ouvert${bugs.length > 1 ? 's' : ''}`,
                        detail: 'Planifiez du temps pour les corriger avant qu\'ils ne s\'accumulent.',
                        badge: 'Bugs'
                    });
                }
            }
            
            // 🚀 INFO: Pas de déploiement
            if (deploys.length === 0 && pipelines.length > 3) {
                tips.push({
                    type: 'info',
                    icon: '🚀',
                    title: 'Aucun déploiement aujourd\'hui',
                    detail: 'Des pipelines ont tourné mais pas de mise en prod. Normal ou blocage ?',
                    badge: 'Deploy'
                });
            }
            
            // ════════════════════════════════════════════════════════════════
            // MESSAGES POSITIFS (si peu de problèmes)
            // ════════════════════════════════════════════════════════════════
            
            // ✅ SUCCESS: Tous les pipelines OK
            if (failedPipelines.length === 0 && successPipelines.length > 0) {
                tips.push({
                    type: 'success',
                    icon: '✅',
                    title: `${successPipelines.length} pipeline${successPipelines.length > 1 ? 's' : ''} réussi${successPipelines.length > 1 ? 's' : ''}`,
                    detail: 'Aucun échec aujourd\'hui. Belle journée pour la CI !',
                    badge: 'Bravo'
                });
            }
            
            // 🎉 SUCCESS: Bonne journée de merge
            if (mrsMerged.length >= 3 && mrsWithoutReview.length === 0) {
                tips.push({
                    type: 'success',
                    icon: '🎉',
                    title: `${mrsMerged.length} MRs mergées avec review`,
                    detail: 'Toutes les MRs ont été reviewées. Excellent travail d\'équipe !',
                    badge: 'Top'
                });
            }
            
            // 😴 INFO: Journée calme
            if (commits.length === 0 && mrsMerged.length === 0 && pipelines.length === 0) {
                tips.push({
                    type: 'info',
                    icon: '😴',
                    title: 'Journée très calme',
                    detail: 'Peu d\'activité aujourd\'hui. Weekend ? Vacances ? 🏖️',
                    badge: 'Info'
                });
            }
            
            // 🔥 INFO: Grosse journée
            if (commits.length >= 20 || mrsMerged.length >= 5 || pipelines.length >= 15) {
                tips.push({
                    type: 'info',
                    icon: '🔥',
                    title: 'Journée bien remplie !',
                    detail: `${commits.length} commits, ${mrsMerged.length} MRs, ${pipelines.length} pipelines.`,
                    badge: 'Activité'
                });
            }
            
            // ════════════════════════════════════════════════════════════════
            // RENDU
            // ════════════════════════════════════════════════════════════════
            
            // Trier par priorité: critical > warning > info > success
            const priority = { critical: 0, warning: 1, info: 2, success: 3 };
            tips.sort((a, b) => priority[a.type] - priority[b.type]);
            
            // Limiter à 5 conseils max
            const displayTips = tips.slice(0, 5);
            
            countEl.textContent = displayTips.length;
            
            if (displayTips.length === 0) {
                container.innerHTML = `
                    <div class="tips-empty">
                        <div class="tips-empty-icon">🤷</div>
                        <div class="tips-empty-text">Pas assez de données pour générer des conseils.</div>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = displayTips.map(tip => `
                <div class="tip-card ${tip.type}">
                    <div class="tip-icon">${tip.icon}</div>
                    <div class="tip-content">
                        <div class="tip-title">${escapeHtml(tip.title)}</div>
                        <div class="tip-detail">${escapeHtml(tip.detail)}</div>
                    </div>
                    <span class="tip-badge">${escapeHtml(tip.badge)}</span>
                </div>
            `).join('');
        }
        
        function getScoreClass(score) {
            if (score >= 80) return 'good';
            if (score >= 50) return 'warning';
            return 'bad';
        }

        async function renderTrends(after, before, pipelinesToday) {
            const trendYesterday = document.getElementById('trend-yesterday');
            const trendWeek = document.getElementById('trend-week');
            const trendAvg = document.getElementById('trend-avg');

            try {
                // Calculer les dates
                const yesterday = new Date(currentDate);
                yesterday.setDate(yesterday.getDate() - 1);
                const lastWeek = new Date(currentDate);
                lastWeek.setDate(lastWeek.getDate() - 7);

                // Fetcher les pipelines d'hier ET semaine dernière ET les 7 derniers
                // jours pour la moyenne — TOUT EN PARALLÈLE.
                // Avant : 7 fetches séquentiels pour la moyenne + 2 pour la comparaison
                // = 9 fetches × ~300ms = ~3s. Et fetchPipelines(after, before) refetchait
                // les pipelines du jour qu'on avait DÉJÀ dans loadReport.
                // Maintenant : pipelinesToday passé en paramètre + Promise.all sur les
                // 8 jours historiques (hier inclus dans la moyenne sur 7j décalée) = ~500ms.
                const yesterdayStart = new Date(yesterday); yesterdayStart.setHours(0, 0, 0, 0);
                const yesterdayEnd = new Date(yesterday); yesterdayEnd.setHours(23, 59, 59, 999);
                const weekStart = new Date(lastWeek); weekStart.setHours(0, 0, 0, 0);
                const weekEnd = new Date(lastWeek); weekEnd.setHours(23, 59, 59, 999);

                // Les 7 derniers jours pour calculer la moyenne
                const sevenDays = [];
                for (let i = 1; i <= 7; i++) {
                    const d = new Date(currentDate);
                    d.setDate(d.getDate() - i);
                    const ds = new Date(d); ds.setHours(0, 0, 0, 0);
                    const de = new Date(d); de.setHours(23, 59, 59, 999);
                    sevenDays.push({ start: ds.toISOString(), end: de.toISOString() });
                }

                // runWithConcurrency à 8 — assez parallèle pour finir en <500ms,
                // assez prudent pour ne pas saturer GitLab.
                const sevenDayTasks = sevenDays.map(d => () => fetchPipelines(d.start, d.end));
                const sevenDayResults = await runWithConcurrency(sevenDayTasks, DETAILS_CONCURRENCY);
                const sevenDayCounts = sevenDayResults.map(r =>
                    r.status === 'fulfilled' ? r.value.length : 0
                );

                // Hier = premier élément (i=1) parmi les 7 jours. Réutilisable.
                const pipelinesYesterdayCount = sevenDayCounts[0];

                // Semaine dernière (J-7) = dernier élément (i=7) parmi les 7 jours.
                const pipelinesWeekCount = sevenDayCounts[6];

                // Calculer tendance vs hier
                const diffYesterday = pipelinesToday.length - pipelinesYesterdayCount;
                if (diffYesterday > 0) {
                    trendYesterday.textContent = `+${diffYesterday} pipelines`;
                    trendYesterday.className = 'trend-value positive';
                } else if (diffYesterday < 0) {
                    trendYesterday.textContent = `${diffYesterday} pipelines`;
                    trendYesterday.className = 'trend-value negative';
                } else {
                    trendYesterday.textContent = '= identique';
                    trendYesterday.className = 'trend-value neutral';
                }

                // Calculer tendance vs semaine dernière (même jour)
                const diffWeek = pipelinesToday.length - pipelinesWeekCount;
                if (diffWeek > 0) {
                    trendWeek.textContent = `+${diffWeek} pipelines`;
                    trendWeek.className = 'trend-value positive';
                } else if (diffWeek < 0) {
                    trendWeek.textContent = `${diffWeek} pipelines`;
                    trendWeek.className = 'trend-value negative';
                } else {
                    trendWeek.textContent = '= identique';
                    trendWeek.className = 'trend-value neutral';
                }

                // Moyenne sur les 7 derniers jours
                const total7days = sevenDayCounts.reduce((s, c) => s + c, 0);
                const avg = Math.round(total7days / 7);
                trendAvg.textContent = `${avg} pipelines/j`;
                trendAvg.className = 'trend-value neutral';

            } catch (e) {
                console.error('Erreur tendances:', e);
                trendYesterday.textContent = '-';
                trendWeek.textContent = '-';
                trendAvg.textContent = '-';
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  UTILITAIRES
        // ══════════════════════════════════════════════════════════════════
        
        function formatTime(dateStr) {
            if (!dateStr) return '-';
            const date = new Date(dateStr);
            return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }
        
        function truncate(str, max) {
            if (!str) return '';
            return str.length > max ? str.substring(0, max) + '...' : str;
        }
        
        function daysSince(dateStr) {
            const date = new Date(dateStr);
            const now = new Date();
            return Math.floor((now - date) / (1000 * 60 * 60 * 24));
        }

        // ══════════════════════════════════════════════════════════════════
        //  RAPPORT SEMAINE / MOIS
        // ══════════════════════════════════════════════════════════════════

        async function generateWeekReport(btn) {
            await generateStandaloneReport(7, 'Semaine', btn);
        }

        async function generateMonthReport(btn) {
            await generateStandaloneReport(30, 'Mois', btn);
        }

        async function generateStandaloneReport(days, label, btn) {
            // btn passé en paramètre (avant : event.target global → fragile).
            const originalText = btn ? btn.innerHTML : null;
            if (btn) {
                btn.innerHTML = '⏳ Génération...';
                btn.disabled = true;
            }
            
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days + 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            
            const after = startDate.toISOString();
            const before = endDate.toISOString();
            const startStr = startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
            const endStr = endDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
            const weekNum = Math.ceil(((endDate - new Date(endDate.getFullYear(),0,1)) / 86400000 + new Date(endDate.getFullYear(),0,1).getDay() + 1) / 7);
            const projectName = sessionStorage.getItem('gitlab_project') || PROJECT_ID || 'projet';
            
            try {
                // ── Fetch global data ──
                const [pipelines, mrsMerged, mrsOpen, mrsClosed, tags, deployments, branches, commits] = await Promise.all([
                    fetchPipelines(after, before),
                    fetchMRsMerged(after, before),
                    fetchMRsOpen(),
                    fetchMRsClosed(after, before),
                    fetchTags(after, before),
                    fetchDeployments(after, before),
                    fetchBranches(),
                    fetchCommits(after, before)
                ]);
                
                // ── Fetch day-by-day ──
                const dayNames = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
                const dailyPromises = [];
                for (let i = days - 1; i >= 0; i--) {
                    const d = new Date(); d.setDate(d.getDate() - i);
                    const ds = new Date(d); ds.setHours(0,0,0,0);
                    const de = new Date(d); de.setHours(23,59,59,999);
                    dailyPromises.push((async () => {
                        const [pip, mrM, mrC, com] = await Promise.all([
                            fetchPipelines(ds.toISOString(), de.toISOString()),
                            fetchMRsMerged(ds.toISOString(), de.toISOString()),
                            fetchMRsClosed(ds.toISOString(), de.toISOString()),
                            fetchCommits(ds.toISOString(), de.toISOString())
                        ]);
                        return {
                            label: dayNames[d.getDay()],
                            date: d.toLocaleDateString('fr-FR', {day:'numeric', month:'short'}),
                            success: pip.filter(p => p.status === 'success').length,
                            failed: pip.filter(p => p.status === 'failed').length,
                            total: pip.length,
                            mrsMerged: mrM.length,
                            mrsClosed: mrC.length,
                            commits: com.length
                        };
                    })());
                }
                const daily = await Promise.all(dailyPromises);
                
                // ── Build HTML ──
                const html = buildStandaloneHTML({
                    label, days, startStr, endStr, weekNum, projectName,
                    pipelines, mrsMerged, mrsOpen, mrsClosed, tags, deployments, branches, commits, daily
                });
                
                // ── Download ──
                const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `rapport-${label.toLowerCase()}_${projectName}_${startDate.toISOString().split('T')[0]}.html`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
            } catch (error) {
                console.error('Erreur génération rapport:', error);
                alert('Erreur lors de la génération: ' + error.message);
            } finally {
                if (btn) {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            }
        }
        
        // ══════════════════════════════════════════════════════════════════
        //  BUILD STANDALONE HTML REPORT
        // ══════════════════════════════════════════════════════════════════
        
        function buildStandaloneHTML(d) {
            const total = d.pipelines.length;
            const success = d.pipelines.filter(p => p.status === 'success').length;
            const failed = d.pipelines.filter(p => p.status === 'failed').length;
            const canceled = total - success - failed;
            const rate = total > 0 ? Math.round((success / total) * 100) : 0;
            
            // Health score
            let health = 100;
            if (rate < 80) health -= 20;
            if (rate < 60) health -= 15;
            const staleBranches = d.branches.filter(b => {
                const age = (Date.now() - new Date(b.commit?.committed_date || b.commit?.created_at).getTime()) / 86400000;
                return age > 90;
            }).length;
            if (staleBranches > 20) health -= 15;
            const oldMrs = d.mrsOpen.filter(mr => (Date.now() - new Date(mr.created_at).getTime()) / 86400000 > 7).length;
            if (oldMrs > 5) health -= 10;
            health = Math.max(0, Math.min(100, health));
            const hClass = health >= 80 ? 'good' : health >= 50 ? 'warning' : 'bad';
            const hText = health >= 80 ? 'Bonne santé' : health >= 50 ? 'À surveiller' : 'Critique';
            const hColor = health >= 80 ? '#34d399' : health >= 50 ? '#fbbf24' : '#f87171';
            const hBg = health >= 80 ? 'rgba(52,211,153,0.15)' : health >= 50 ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.15)';
            const hBorder = health >= 80 ? 'rgba(52,211,153,0.3)' : health >= 50 ? 'rgba(251,191,36,0.3)' : 'rgba(239,68,68,0.3)';
            
            // Charts data
            const maxPip = Math.max(...d.daily.map(x => x.total), 1);
            const maxCommits = Math.max(...d.daily.map(x => x.commits), 1);
            const maxMR = Math.max(...d.daily.map(x => Math.max(x.mrsMerged, x.mrsClosed, 1)), 1);
            
            // Failures grouped by branch
            const failedPipelines = d.pipelines.filter(p => p.status === 'failed');
            const failByRef = {};
            failedPipelines.forEach(p => {
                const ref = p.ref || 'unknown';
                if (!failByRef[ref]) failByRef[ref] = [];
                failByRef[ref].push(p);
            });
            const topFails = Object.entries(failByRef).sort((a,b) => b[1].length - a[1].length).slice(0, 8);
            
            // Stale MRs
            const staleMrs = d.mrsOpen
                .map(mr => ({...mr, ageDays: Math.floor((Date.now() - new Date(mr.created_at).getTime()) / 86400000)}))
                .filter(mr => mr.ageDays >= 2)
                .sort((a,b) => b.ageDays - a.ageDays)
                .slice(0, 5);
            
            // Best practices
            const avgPipPerDay = total / Math.max(d.days, 1);
            const speedScore = Math.min(100, Math.round(avgPipPerDay > 0 ? 90 : 50));
            const reviewScore = d.mrsOpen.length > 0 ? Math.max(0, Math.round(100 - (staleMrs.length / d.mrsOpen.length) * 100)) : 100;
            const branchScore = d.branches.length > 0 ? Math.max(0, Math.round(100 - (staleBranches / d.branches.length) * 200)) : 100;
            const failRateScore = Math.max(0, 100 - (total > 0 ? Math.round((failed / total) * 100) : 0));
            const practices = [
                {icon:'⚡', name:'Pipeline Speed', score: speedScore, detail: `${avgPipPerDay.toFixed(1)} pip/jour`},
                {icon:'✅', name:'Success Rate', score: rate, detail: `${success}/${total} success`},
                {icon:'👀', name:'Review Speed', score: reviewScore, detail: `${staleMrs.length} MRs > 48h`},
                {icon:'🌿', name:'Branch Hygiene', score: Math.max(0, Math.min(100, branchScore)), detail: `${staleBranches} stale > 90j`},
                {icon:'🔴', name:'Failure Rate', score: failRateScore, detail: `${failed} échecs`},
            ];
            const globalBP = Math.round(practices.reduce((s,p) => s + p.score, 0) / practices.length);
            const bpColor = globalBP >= 70 ? '#34d399' : globalBP >= 40 ? '#fbbf24' : '#f87171';
            
            function pClass(score) { return score >= 70 ? 'good' : score >= 40 ? 'warning' : 'bad'; }
            function pColor(score) { return score >= 70 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171'; }
            function pBg(score) { return score >= 70 ? 'linear-gradient(90deg,#10b981,#34d399)' : score >= 40 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#ef4444,#f87171)'; }
            function pBorderTop(score) { return score >= 70 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171'; }
            
            // Donut percentages
            const sP = total > 0 ? Math.round((success / total) * 100) : 0;
            const fP = total > 0 ? Math.round((failed / total) * 100) : 0;
            
            return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rapport ${escapeHtml(d.label)} — ${escapeHtml(d.projectName)} — ${escapeHtml(d.startStr)} → ${escapeHtml(d.endStr)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;color:white}
.container{max-width:1400px;margin:0 auto;padding:30px 20px}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:30px;padding:20px 30px;background:rgba(255,255,255,0.1);backdrop-filter:blur(20px);border-radius:20px;border:1px solid rgba(255,255,255,0.2)}
.header h1{font-size:28px;font-weight:700}
.header-right{display:flex;align-items:center;gap:15px}
.date-display{padding:10px 20px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);border-radius:10px;font-weight:600;font-size:15px}
.btn{padding:10px 20px;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;color:white;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3)}
.btn:hover{background:rgba(255,255,255,0.25)}

/* Exec Summary */
.exec{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:30px;margin-bottom:25px}
.exec-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:25px}
.exec-title{font-size:20px;font-weight:700}
.exec-sub{font-size:14px;opacity:0.7;margin-top:4px}
.health{display:flex;align-items:center;gap:12px;padding:12px 24px;border-radius:14px}
.health-score{font-size:36px;font-weight:800}
.health-label{font-size:13px;opacity:0.7}
.health-text{font-size:15px;font-weight:600}
.kpi-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:16px}
.kpi{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:20px 16px;text-align:center}
.kpi-icon{font-size:24px;margin-bottom:8px}
.kpi-value{font-size:32px;font-weight:800}
.kpi-label{font-size:12px;opacity:0.7;margin-top:4px}
.kpi-avg{font-size:11px;opacity:0.5;margin-top:6px}

/* Section */
.section{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:20px;margin-bottom:25px;overflow:hidden}
.section-header{padding:18px 25px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.05);border-bottom:1px solid rgba(255,255,255,0.1)}
.section-title{display:flex;align-items:center;gap:12px;font-size:16px;font-weight:700}
.section-body{padding:25px}

/* Charts */
.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:25px}
.chart-card{background:rgba(255,255,255,0.04);border-radius:14px;padding:20px}
.chart-title{font-size:14px;font-weight:600;margin-bottom:15px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.legend{display:inline-flex;align-items:center;gap:8px;font-size:11px;opacity:0.7;margin-left:auto}
.dot{width:10px;height:10px;border-radius:3px;display:inline-block}
.bar-chart{display:flex;align-items:flex-end;gap:8px;height:140px;padding-top:10px}
.bar-day{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end}
.bar-stack{width:100%;display:flex;flex-direction:column-reverse;gap:2px;border-radius:6px 6px 0 0;overflow:hidden}
.bar-seg{width:100%;border-radius:3px;min-height:2px}
.bar-lbl{font-size:10px;opacity:0.6;font-weight:600}
.bar-val{font-size:10px;font-weight:700;opacity:0.9}
.mr-bars{display:flex;gap:3px;align-items:flex-end}
.mr-bar{width:12px;border-radius:4px 4px 0 0;min-height:3px}

/* Donut */
.donut-wrap{display:flex;align-items:center;gap:30px}
.donut{width:120px;height:120px;border-radius:50%;position:relative;flex-shrink:0}
.donut-center{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center}
.donut-center .v{font-size:24px;font-weight:800}
.donut-center .l{font-size:10px;opacity:0.6}
.donut-legend{display:flex;flex-direction:column;gap:10px}
.dl-item{display:flex;align-items:center;gap:10px;font-size:13px}
.dl-item .d{width:12px;height:12px;border-radius:4px;flex-shrink:0}
.dl-item .n{font-weight:700;margin-left:auto}

/* Failures */
.fail-badge{padding:4px 12px;background:rgba(239,68,68,0.2);border-radius:20px;font-size:13px;font-weight:600;color:#fca5a5}
.fail-item{display:flex;align-items:center;gap:16px;padding:16px 20px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.15);border-radius:14px;margin-bottom:10px}
.fail-rank{width:32px;height:32px;background:rgba(239,68,68,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#fca5a5;flex-shrink:0}
.fail-content{flex:1;min-width:0}
.fail-title{font-weight:600;font-size:14px;margin-bottom:4px}
.fail-meta{font-size:12px;opacity:0.6}
.fail-count{padding:6px 14px;background:rgba(239,68,68,0.2);border-radius:10px;font-weight:800;font-size:16px;color:#fca5a5;flex-shrink:0}

/* MR Summary */
.mr-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px}
.mr-box{border-radius:14px;padding:20px;text-align:center}
.mr-box .val{font-size:36px;font-weight:800}
.mr-box .lbl{font-size:13px;opacity:0.7;margin-top:4px}
.mr-box .trend{font-size:12px;margin-top:6px}
.stale-item{display:flex;align-items:center;gap:14px;padding:12px 16px;background:rgba(255,255,255,0.05);border-radius:12px;margin-bottom:8px}
.stale-item .c{flex:1}
.stale-item .t{font-weight:600;font-size:14px}
.stale-item .t a{color:white;text-decoration:none}
.stale-item .t a:hover{text-decoration:underline}
.stale-item .m{font-size:12px;opacity:0.6}
.stale-badge{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600}

/* Practices */
.bp-global{display:flex;align-items:center;gap:12px}
.bp-score{font-size:28px;font-weight:800}
.practices{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
.bp-card{background:rgba(255,255,255,0.06);border-radius:14px;padding:20px;text-align:center;border-top:4px solid transparent}
.bp-icon{font-size:22px;margin-bottom:8px}
.bp-name{font-size:12px;opacity:0.7;margin-bottom:10px}
.bp-val{font-size:28px;font-weight:800}
.bp-bar{height:6px;border-radius:3px;background:rgba(255,255,255,0.1);margin-top:10px;overflow:hidden}
.bp-fill{height:100%;border-radius:3px}
.bp-spark{display:flex;align-items:flex-end;gap:3px;height:30px;margin-top:10px;justify-content:center}
.bp-spark-bar{width:8px;border-radius:2px;min-height:3px}
.bp-detail{font-size:11px;opacity:0.5;margin-top:8px}

.empty{text-align:center;padding:30px;opacity:0.6}
.empty .icon{font-size:40px;margin-bottom:10px}
.footer{text-align:center;padding:30px;opacity:0.5;font-size:13px}

@media print{
    body{background:white!important;color:#333!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .btn{display:none}
}
@media(max-width:1200px){.kpi-grid{grid-template-columns:repeat(3,1fr)}.chart-grid{grid-template-columns:1fr}.practices{grid-template-columns:repeat(3,1fr)}}
@media(max-width:768px){.kpi-grid{grid-template-columns:repeat(2,1fr)}.practices{grid-template-columns:repeat(2,1fr)}.mr-summary{grid-template-columns:1fr}.header{flex-direction:column;gap:15px}}
</style>
</head>
<body>
<div class="container">

<!-- HEADER -->
<div class="header">
    <h1>📊 Rapport ${escapeHtml(d.label)}</h1>
    <div class="header-right">
        <div class="date-display">${escapeHtml(d.startStr)} → ${escapeHtml(d.endStr)}</div>
        <button class="btn" onclick="window.print()">🖨️ Imprimer</button>
    </div>
</div>

<!-- 1. EXECUTIVE SUMMARY -->
<div class="exec">
    <div class="exec-head">
        <div>
            <div class="exec-title">Résumé ${d.days === 7 ? 'de la semaine' : 'du mois'}</div>
            <div class="exec-sub">${d.days === 7 ? 'Semaine ' + d.weekNum + ' — ' : ''}${escapeHtml(d.startStr)} au ${escapeHtml(d.endStr)} — ${escapeHtml(d.projectName)}</div>
        </div>
        <div class="health" style="background:${hBg};border:1px solid ${hBorder}">
            <div>
                <div class="health-score" style="color:${hColor}">${health}</div>
                <div class="health-label">Health Score</div>
            </div>
            <div>
                <div class="health-text" style="color:${hColor}">${hText}</div>
            </div>
        </div>
    </div>
    <div class="kpi-grid">
        ${[
            {icon:'✅', val:d.mrsMerged.length, label:'MRs mergées', color:'#34d399', avg:(d.mrsMerged.length/d.days).toFixed(1)},
            {icon:'🔵', val:total, label:'Pipelines', color:'#60a5fa', avg:(total/d.days).toFixed(1)},
            {icon:'🔴', val:failed, label:'Échecs', color:'#f87171', avg:(failed/d.days).toFixed(1)},
            {icon:'🚀', val:d.deployments.length, label:'Déploiements', color:'#a78bfa', avg:(d.deployments.length/d.days).toFixed(1)},
            {icon:'📈', val:rate+'%', label:'Taux succès', color:'#fbbf24', avg:''},
            {icon:'💻', val:d.commits.length, label:'Commits', color:'#fb923c', avg:(d.commits.length/d.days).toFixed(1)},
        ].map(k => `<div class="kpi"><div class="kpi-icon">${k.icon}</div><div class="kpi-value" style="color:${k.color}">${k.val}</div><div class="kpi-label">${k.label}</div>${k.avg ? `<div class="kpi-avg">${k.avg}/jour</div>` : ''}</div>`).join('')}
    </div>
</div>

<!-- 2. ÉVOLUTION JOUR PAR JOUR -->
<div class="section">
    <div class="section-header"><div class="section-title">📈 Évolution jour par jour</div></div>
    <div class="section-body">
        <div class="chart-grid">
            <div class="chart-card">
                <div class="chart-title">🔵 Pipelines (succès / échecs)</div>
                <div class="bar-chart">
                    ${d.daily.map(x => {
                        const sH = Math.round((x.success / maxPip) * 100);
                        const fH = Math.round((x.failed / maxPip) * 100);
                        return `<div class="bar-day"><div class="bar-val">${x.total}</div><div class="bar-stack"><div class="bar-seg" style="height:${sH}px;background:linear-gradient(180deg,#34d399,#10b981)"></div>${x.failed > 0 ? `<div class="bar-seg" style="height:${Math.max(fH,4)}px;background:linear-gradient(180deg,#f87171,#ef4444)"></div>` : ''}</div><div class="bar-lbl">${x.label}</div></div>`;
                    }).join('')}
                </div>
            </div>
            <div class="chart-card">
                <div class="chart-title">✅ Activité MRs <span class="legend"><span class="dot" style="background:#34d399"></span>Mergées <span class="dot" style="background:#f87171"></span>Refusées</span></div>
                <div class="bar-chart">
                    ${d.daily.map(x => {
                        const mH = Math.round((x.mrsMerged / maxMR) * 70);
                        const cH = Math.round((x.mrsClosed / maxMR) * 70);
                        return `<div class="bar-day"><div class="mr-bars"><div class="mr-bar" style="height:${Math.max(mH,3)}px;background:#34d399"></div><div class="mr-bar" style="height:${Math.max(cH,3)}px;background:#f87171"></div></div><div class="bar-lbl">${x.label}</div></div>`;
                    }).join('')}
                </div>
            </div>
            <div class="chart-card">
                <div class="chart-title">💻 Commits</div>
                <div class="bar-chart">
                    ${d.daily.map(x => {
                        const h = Math.round((x.commits / maxCommits) * 100);
                        return `<div class="bar-day"><div class="bar-val">${x.commits}</div><div class="bar-stack"><div class="bar-seg" style="height:${Math.max(h,3)}px;background:linear-gradient(180deg,#fb923c,#f97316)"></div></div><div class="bar-lbl">${x.label}</div></div>`;
                    }).join('')}
                </div>
            </div>
            <div class="chart-card">
                <div class="chart-title">📈 Répartition pipelines</div>
                <div class="donut-wrap">
                    <div class="donut" style="background:conic-gradient(#34d399 0% ${sP}%,#f87171 ${sP}% ${sP+fP}%,#9ca3af ${sP+fP}% 100%)"><div class="donut-center"><div class="v">${total}</div><div class="l">total</div></div></div>
                    <div class="donut-legend">
                        <div class="dl-item"><div class="d" style="background:#34d399"></div>Success<span class="n">${success}</span></div>
                        <div class="dl-item"><div class="d" style="background:#f87171"></div>Failed<span class="n">${failed}</span></div>
                        <div class="dl-item"><div class="d" style="background:#9ca3af"></div>Autres<span class="n">${canceled}</span></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- 3. TOP FAILURES -->
<div class="section">
    <div class="section-header">
        <div class="section-title">🔴 Top échecs ${d.days === 7 ? 'de la semaine' : 'du mois'}</div>
        <span class="fail-badge">${failed} échecs</span>
    </div>
    <div class="section-body">
        ${topFails.length === 0
            ? '<div class="empty"><div class="icon">✨</div><p>Aucun pipeline en échec — belle période !</p></div>'
            : topFails.map(([ref, pips], i) => `<div class="fail-item"><div class="fail-rank">${i+1}</div><div class="fail-content"><div class="fail-title">Pipeline failed sur ${escapeHtml(ref)}</div><div class="fail-meta">IDs: ${pips.slice(0,3).map(p => '#'+p.id).join(', ')}${pips.length > 3 ? '...' : ''}</div></div><div class="fail-count">${pips.length}×</div></div>`).join('')
        }
    </div>
</div>

<!-- 4. ACTIVITÉ MRs -->
<div class="section">
    <div class="section-header"><div class="section-title">✅ Activité Merge Requests</div></div>
    <div class="section-body">
        <div class="mr-summary">
            <div class="mr-box" style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.2)"><div class="val" style="color:#34d399">${d.mrsMerged.length}</div><div class="lbl">Mergées</div></div>
            <div class="mr-box" style="background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.2)"><div class="val" style="color:#60a5fa">${d.mrsOpen.length}</div><div class="lbl">En attente</div>${staleMrs.length > 0 ? `<div class="trend" style="color:#fbbf24">${staleMrs.length} > 48h ⚠️</div>` : ''}</div>
            <div class="mr-box" style="background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.2)"><div class="val" style="color:#f87171">${d.mrsClosed.length}</div><div class="lbl">Refusées</div></div>
        </div>
        ${staleMrs.length > 0 ? `
            <div style="font-size:14px;font-weight:600;margin-bottom:12px;opacity:0.8">⏳ MRs en attente les plus anciennes</div>
            ${staleMrs.map(mr => {
                const bdColor = mr.ageDays >= 5 ? '#f87171' : '#fbbf24';
                const bdBg = mr.ageDays >= 5 ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.2)';
                const bdTxt = mr.ageDays >= 5 ? '#fca5a5' : '#fcd34d';
                return `<div class="stale-item" style="border-left:3px solid ${bdColor}"><div class="c"><div class="t"><a href="${escapeAttr(mr.web_url)}" target="_blank" rel="noopener noreferrer">!${mr.iid} — ${escapeHtml(mr.title)}</a></div><div class="m">par @${escapeHtml(mr.author?.username || '?')} • ouvert il y a ${mr.ageDays} jours</div></div><span class="stale-badge" style="background:${bdBg};color:${bdTxt}">${mr.ageDays}j</span></div>`;
            }).join('')}
        ` : ''}
    </div>
</div>

<!-- 5. BEST PRACTICES -->
<div class="section">
    <div class="section-header">
        <div class="section-title">🏆 Best Practices — Score & Tendance</div>
        <div class="bp-global"><span style="font-size:13px;opacity:0.7">Score global</span><span class="bp-score" style="color:${bpColor}">${globalBP}%</span></div>
    </div>
    <div class="section-body">
        <div class="practices">
            ${practices.map(p => {
                const sparkData = d.daily.map(x => {
                    if (p.name === 'Success Rate') return x.total > 0 ? Math.round((x.success / x.total) * 100) : 0;
                    if (p.name === 'Pipeline Speed') return x.total;
                    if (p.name === 'Failure Rate') return x.failed;
                    return 50;
                });
                const sparkMax = Math.max(...sparkData, 1);
                const sparkBars = sparkData.map(v => {
                    const h = Math.max(3, Math.round((v / sparkMax) * 28));
                    const alpha = Math.round(60 + (v / sparkMax) * 40).toString(16).padStart(2, '0');
                    return `<div class="bp-spark-bar" style="height:${h}px;background:${pColor(p.score)}${alpha}"></div>`;
                }).join('');
                return `<div class="bp-card" style="border-top-color:${pBorderTop(p.score)}"><div class="bp-icon">${p.icon}</div><div class="bp-name">${escapeHtml(p.name)}</div><div class="bp-val" style="color:${pColor(p.score)}">${p.score}%</div><div class="bp-bar"><div class="bp-fill" style="width:${p.score}%;background:${pBg(p.score)}"></div></div><div class="bp-spark">${sparkBars}</div><div class="bp-detail">${escapeHtml(p.detail)}</div></div>`;
            }).join('')}
        </div>
    </div>
</div>

<!-- FOOTER -->
<div class="footer">
    DevOps Hub — Rapport généré le ${new Date().toLocaleString('fr-FR')}
</div>

</div>
</body>
</html>`;
        }

        // ══════════════════════════════════════════════════════════════════
        //  DÉMARRAGE
        // ══════════════════════════════════════════════════════════════════

        // Wrapper DOMContentLoaded explicite (avant : init() direct en fin de
        // fichier — fragile si le script est déplacé en haut avec defer).
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
