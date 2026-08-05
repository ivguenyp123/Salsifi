/* smart-estimate · index.js — entrée & câblage (chargé en dernier). */

        let selectedPeriod = 180;

        let analysisData = { mrs: [], patterns: {}, stats: {} };

        // ══════════════════════════════════════════════════════════════════
        // INIT
        // ══════════════════════════════════════════════════════════════════
        document.addEventListener('DOMContentLoaded', () => {
            const auth = loadAuth();
            if (!auth) { window.location.href = 'login.html'; return; }

            const repoId = new URLSearchParams(location.search).get('repo');
            if (!repoId) { window.location.href = HUB_URL; return; }

            GITLAB_URL = auth.gitlabUrl;
            GITLAB_TOKEN = auth.token;
            projectId = repoId;
            projectName = `Repo #${repoId}`;

            // Lien retour (init léger : le vrai nom est résolu dans analyzeFeature)
            document.querySelectorAll('[data-hub-link]').forEach(a => { var _f = new URLSearchParams(location.search).get('from'); a.href = _f ? HUB_URL + '?chemin=' + encodeURIComponent(_f) : HUB_URL; });
            document.getElementById('projectName').textContent = projectName;

            // Period buttons
            document.querySelectorAll('.period-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    selectedPeriod = parseInt(btn.dataset.value);
                });
            });
        });

        // ══════════════════════════════════════════════════════════════════
        // ANALYSIS
        // ══════════════════════════════════════════════════════════════════
