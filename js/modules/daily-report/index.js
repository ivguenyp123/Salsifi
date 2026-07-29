/* daily-report · index.js — entrée & câblage : init, actions, orchestration (chargé en dernier). */

        function init() {
            // Nouveau format hub : localStorage 'devops_hub_workspaces' (JSON) + 'hub_selected_repo_id'
            // Auth centralisee (devops_hub_workspaces + fallback sessionStorage legacy)
            const _auth = window.Salsifi.loadAuth({ redirect: false });
            if (_auth) { TOKEN = _auth.token; GITLAB_URL = _auth.gitlabUrl; }

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

        // Wrapper DOMContentLoaded explicite (avant : init() direct en fin de
        // fichier — fragile si le script est déplacé en haut avec defer).
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
