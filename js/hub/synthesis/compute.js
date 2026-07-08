// [hub] Extrait de hub.js — synthesis/compute.js (portée globale, script classique)
        const FETCH_CONCURRENCY = 8;

        // Helper : limiter la concurrence sur N promises
        async function runWithConcurrency(tasks, max) {
            const results = [];
            const executing = [];
            for (const task of tasks) {
                const p = Promise.resolve().then(task);
                results.push(p);
                if (max <= tasks.length) {
                    const e = p.then(() => executing.splice(executing.indexOf(e), 1));
                    executing.push(e);
                    if (executing.length >= max) await Promise.race(executing);
                }
            }
            return Promise.allSettled(results);
        }

        // Helper : fetch JSON safe (null si erreur)
        async function gl(endpoint) {
            try {
                const r = await fetchGitLab(endpoint);
                if (!r.ok) return null;
                return await r.json();
            } catch { return null; }
        }

        // ───── Orchestration : load tout en parallèle ──────────────────────
        async function computeSynthesis(repo) {
            const branch = repo.default_branch || 'main';
            const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
            const since60 = new Date(Date.now() - 60 * 86400000).toISOString();

            // Fetches en parallèle
            const [pipelines, mrs, branches, ciFile, protectedBranches, projectDetails, tagsCount, busFactor, approvals] = await Promise.all([
                gl(`/projects/${repo.id}/pipelines?per_page=100&updated_after=${since60}`),
                gl(`/projects/${repo.id}/merge_requests?state=merged&per_page=100&updated_after=${since30}`),
                gl(`/projects/${repo.id}/repository/branches?per_page=100`),
                fetchGitLab(`/projects/${repo.id}/repository/files/.gitlab-ci.yml?ref=${encodeURIComponent(branch)}`)
                    .then(r => r.ok).catch(() => false),
                gl(`/projects/${repo.id}/protected_branches`),
                gl(`/projects/${repo.id}`),
                gl(`/projects/${repo.id}/repository/tags?per_page=20`).then(t => Array.isArray(t) ? t.length : 0).catch(() => 0),
                computeBusFactor(repo),
                // Réglages d'approbation MR : endpoint dédié (souvent absents de /projects/:id).
                // gl() renvoie null si 403/404 → traité strictement (non crédité) côté maturité.
                gl(`/projects/${repo.id}/approvals`)
            ]);

            // Calculs en parallèle (lightweight)
            const dora = await computeDORA(repo, pipelines, mrs);
            const deploys = await computeDeploys(repo, pipelines);
            const maturity = await computeMaturity(repo, pipelines, mrs, branches, ciFile, protectedBranches, projectDetails, tagsCount, approvals);

            return { dora, deploys, maturity, busFactor, tags: tagsCount };
        }

        // ───── Hook : appelé à chaque changement de repo ───────────────────
        let synthesisAbortToken = 0; // pour ignorer les résultats obsolètes
        async function onRepoChange() {
            if (!currentRepo) return;
            const myToken = ++synthesisAbortToken;

            // Affiche cache si dispo (instant)
            const cached = readSynCache(currentRepo.id);
            const cachedHistory = readSynHistory(currentRepo.id);
            if (cached) {
                renderSynthesis(cached);
                renderSuggestions(pickSuggestions(cached, cachedHistory));
            } else {
                setSkeleton();
                setSuggestionsSkeleton();
            }

            // Calcule fresh en background
            try {
                const syn = await computeSynthesis(currentRepo);
                if (myToken !== synthesisAbortToken) return; // user a changé de repo entre-temps
                writeSynCache(currentRepo.id, syn);
                pushSynHistory(currentRepo.id, syn);
                renderSynthesis(syn);
                renderSuggestions(pickSuggestions(syn, readSynHistory(currentRepo.id)));
            } catch (e) {
                console.error('Synthesis compute failed:', e);
                if (myToken !== synthesisAbortToken) return;
                ['Dora', 'Deploy', 'Matu', 'Bus'].forEach(k => setCardError(k));
                renderSuggestions([]);
            }
        }
