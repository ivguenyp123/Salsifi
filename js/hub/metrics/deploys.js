// [hub] Extrait de hub.js — metrics/deploys.js (portée globale, script classique)
        // ───── Calcul Deploys/jour + trend (carte 2) ───────────────────────
        async function computeDeploys(repo, pipelines) {
            const branch = repo.default_branch || 'main';
            const now = Date.now();
            const since30 = now - 30 * 86400000;
            const since60 = now - 60 * 86400000;

            const onMain = (pipelines || []).filter(p =>
                p.ref === branch && p.status === 'success');

            const current = onMain.filter(p => new Date(p.created_at).getTime() >= since30);
            const previous = onMain.filter(p => {
                const t = new Date(p.created_at).getTime();
                return t >= since60 && t < since30;
            });

            const currentPerDay = current.length / 30;
            const previousPerDay = previous.length / 30;
            const delta = previousPerDay > 0
                ? ((currentPerDay - previousPerDay) / previousPerDay) * 100
                : null;

            return { currentPerDay, previousPerDay, delta };
        }
