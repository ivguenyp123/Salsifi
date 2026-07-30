/* repo-analyzer · index.js — entrée & câblage : init, analyze, export (chargé en dernier). */

        async function init() {
            const auth = loadAuth();
            if (!auth) { window.location.href = 'login.html'; return; }

            const repoId = new URLSearchParams(location.search).get('repo');
            if (!repoId) { window.location.href = HUB_URL; return; }

            token = auth.token;
            GITLAB_URL = auth.gitlabUrl;
            projectId = repoId;

            // Lien retour vers le hub
            document.querySelectorAll('[data-hub-link]').forEach(a => { a.href = HUB_URL; });

            // Nom du repo (fetch léger avant l'analyse complète)
            try {
                const res = await fetchGitLab(`/projects/${projectId}`);
                if (!res.ok) throw new Error('Projet introuvable');
                const project = await res.json();
                document.getElementById('headerProjectName').textContent = project.name;
            } catch (e) {
                console.error('Erreur chargement du repo:', e);
                document.getElementById('headerProjectName').textContent = '⚠️ Repo introuvable';
                setTimeout(() => { window.location.href = HUB_URL; }, 2000);
                return;
            }

            await analyze();
        }


        async function analyze() {
            try {
                await Promise.all([
                    fetchBranches(), fetchContributors(), fetchCommits(), fetchMergeRequests(),
                    fetchProject(), fetchProtectedBranches(), fetchRepoTree(), fetchLabels(),
                    fetchPipelines(), fetchFailedJobs(), fetchDeployments()
                ]);
                detectFlow();
                generateQuickWins();
                const healthScore = calculateHealthScore();
                renderResults(healthScore);
            } catch (error) {
                document.getElementById('loadingSteps').textContent = '❌ Erreur: ' + error.message;
            }
        }

        // FETCH DATA
        // Sur un endpoint refusé (403 : pipelines désactivés, etc.) `gitlabFetch` renvoie
        // quand même la Response ; `res.json()` donne alors un objet {message}, pas un
        // tableau, et `|| []` ne protège pas (l'objet est truthy). On coerce donc en
        // tableau pour qu'un seul endpoint refusé ne fasse pas planter toute l'analyse.

        function exportReport() {
            alert("Pour exporter, utilisez l'impression du navigateur (Ctrl+P) et sauvegardez en PDF.");
        }


        init();
