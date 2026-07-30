/* repo-analyzer · data.js — I/O GitLab (auth, fetch). */

        function loadAuth() {
            return window.Salsifi.loadAuth({ redirect: false });
        }

        // Transport GitLab commun : retry automatique sur rate-limit HTTP 429.

        async function fetchGitLab(endpoint) {
            return window.Salsifi.gitlabFetch(GITLAB_URL, token, endpoint);
        }


        async function jsonArray(res) { try { const j = await res.json(); return Array.isArray(j) ? j : []; } catch { return []; } }

        async function fetchBranches() { try { const res = await fetchGitLab(`/projects/${projectId}/repository/branches?per_page=100`); analysisData.branches = await jsonArray(res); } catch(e){} }

        async function fetchContributors() { try { const res = await fetchGitLab(`/projects/${projectId}/repository/contributors?per_page=100`); analysisData.contributors = await jsonArray(res); } catch(e){} }

        async function fetchCommits() { const since = new Date(Date.now() - 90 * 86400000).toISOString(); try { const res = await fetchGitLab(`/projects/${projectId}/repository/commits?per_page=100&since=${since}`); analysisData.commits = await jsonArray(res); } catch(e){} }

        async function fetchMergeRequests() { try { const res = await fetchGitLab(`/projects/${projectId}/merge_requests?state=all&per_page=100`); analysisData.mergeRequests = await jsonArray(res); } catch(e){} }

        async function fetchProject() { try { const res = await fetchGitLab(`/projects/${projectId}`); analysisData.project = await res.json(); } catch(e){} }

        async function fetchProtectedBranches() { try { const res = await fetchGitLab(`/projects/${projectId}/protected_branches`); analysisData.protectedBranches = await jsonArray(res); } catch(e){} }

        async function fetchRepoTree() {
            // Arbre RÉCURSIF (paginé, cap 20 pages = 2000 entrées) : sans `recursive`, on ne
            // voyait que la racine — CODEOWNERS/templates MR (souvent sous .gitlab/) étaient
            // manqués → faux quick-wins « à créer ». Les détections racine restent basées sur
            // les seules entrées de premier niveau (voir `repoFiles`).
            try {
                const all = [];
                for (let page = 1; page <= 20; page++) {
                    const res = await fetchGitLab(`/projects/${projectId}/repository/tree?recursive=true&per_page=100&page=${page}`);
                    const batch = await jsonArray(res);
                    if (!batch.length) break;
                    all.push(...batch);
                    if (batch.length < 100) break;
                }
                analysisData.repoTree = all;
            } catch(e){}
        }

        async function fetchLabels() { try { const res = await fetchGitLab(`/projects/${projectId}/labels?per_page=100`); analysisData.labels = await jsonArray(res); } catch(e){} }

        async function fetchPipelines() { try { const res = await fetchGitLab(`/projects/${projectId}/pipelines?per_page=100`); analysisData.pipelines = await jsonArray(res); } catch(e){} }

        async function fetchFailedJobs() { try { const res = await fetchGitLab(`/projects/${projectId}/jobs?scope[]=failed&per_page=100`); analysisData.failedJobs = await jsonArray(res); } catch(e){} }

        async function fetchDeployments() { try { const res = await fetchGitLab(`/projects/${projectId}/deployments?per_page=100`); analysisData.deployments = await jsonArray(res); } catch(e){} }

