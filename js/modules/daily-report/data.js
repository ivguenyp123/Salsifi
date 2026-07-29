/* daily-report · data.js — I/O GitLab (couche données). */

        async function fetchGitLab(endpoint, init = {}) {
            return window.Salsifi.gitlabFetch(GITLAB_URL, TOKEN, endpoint, init);
        }


        function runWithConcurrency(tasks, limit) { return window.Salsifi.runWithConcurrency(tasks, limit); }


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
                if (!Array.isArray(data)) return [];
                // On filtre sur merged_at (et pas updated_at) : une MR mergée hier mais
                // commentée aujourd'hui ne doit PAS compter comme mergée « aujourd'hui ».
                const a = new Date(after), b = new Date(before);
                return data.filter(mr => mr.merged_at && new Date(mr.merged_at) >= a && new Date(mr.merged_at) <= b);
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
                // Borne HAUTE ajoutée (`before`) : sans elle, sur une date passée on
                // remontait tout jusqu'à aujourd'hui. Pour les issues fermées on affine
                // ensuite sur closed_at (une issue fermée hier mais commentée aujourd'hui
                // ne doit pas compter comme fermée « ce jour »).
                const prefix = state === 'closed' ? 'updated' : 'created';
                const data = await gitlabFetch(`/projects/${PROJECT_ID}/issues?state=${state}&per_page=50&${prefix}_after=${after}&${prefix}_before=${before}`);
                if (!Array.isArray(data)) return [];
                if (state === 'closed') {
                    const a = new Date(after), b = new Date(before);
                    return data.filter(i => i.closed_at && new Date(i.closed_at) >= a && new Date(i.closed_at) <= b);
                }
                return data;
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
        
