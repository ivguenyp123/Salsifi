// [hub] Extrait de hub.js — metrics/bus-factor.js (portée globale, script classique)
        // ───── Calcul Bus Factor (carte 4) ─────────────────────────────────
        // Bus factor = nb de personnes nécessaires pour couvrir 80% des commits récents
        function busFactorFromCommits(commits) {
            if (!commits || commits.length === 0) return null;
            const byAuthor = {};
            commits.forEach(c => {
                const a = c.author_email || c.author_name || 'unknown';
                byAuthor[a] = (byAuthor[a] || 0) + 1;
            });
            const sorted = Object.values(byAuthor).sort((a, b) => b - a);
            const total = commits.length;
            const threshold = total * 0.8;
            let acc = 0, count = 0;
            for (const n of sorted) {
                acc += n;
                count++;
                if (acc >= threshold) {
                    // Bus factor "fin" : on retire la fraction qui dépasse
                    const overshoot = (acc - threshold) / n;
                    return Math.max(1, count - overshoot);
                }
            }
            return count;
        }

        async function computeBusFactor(repo) {
            const branch = repo.default_branch || 'main';
            // 200 derniers commits actuels + 200 précédents pour la tendance
            const [recent, older] = await Promise.all([
                gl(`/projects/${repo.id}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=100&page=1`),
                gl(`/projects/${repo.id}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=100&page=2`)
            ]);
            const allRecent = [...(recent || []), ...(older || [])];
            if (allRecent.length === 0) return { bf: null, delta: null };

            const half = Math.floor(allRecent.length / 2);
            const bfRecent = busFactorFromCommits(allRecent.slice(0, Math.max(half, 50)));
            const bfPrev = allRecent.length > 100
                ? busFactorFromCommits(allRecent.slice(half))
                : null;

            const delta = (bfPrev != null && bfPrev > 0)
                ? ((bfRecent - bfPrev) / bfPrev) * 100
                : null;

            return { bf: bfRecent, delta };
        }
