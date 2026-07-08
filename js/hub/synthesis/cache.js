// [hub] Extrait de hub.js — synthesis/cache.js (portée globale, script classique)
        const SYN_CACHE_PREFIX = 'hub_syn_';
        const SYN_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
        // ───── Cache par repo ──────────────────────────────────────────────
        function readSynCache(repoId) {
            try {
                const raw = localStorage.getItem(SYN_CACHE_PREFIX + repoId);
                if (!raw) return null;
                const data = JSON.parse(raw);
                if (Date.now() - data.ts > SYN_CACHE_TTL_MS) return null;
                return data.syn;
            } catch { return null; }
        }
        function writeSynCache(repoId, syn) {
            try {
                localStorage.setItem(SYN_CACHE_PREFIX + repoId,
                    JSON.stringify({ ts: Date.now(), syn }));
            } catch (e) { console.warn('Syn cache write failed:', e); }
        }

        const SYN_HISTORY_PREFIX = 'hub_syn_hist_';
        const SYN_HISTORY_MAX = 30;

        // ───── Historique des évaluations ──────────────────────────────────
        function readSynHistory(repoId) {
            try {
                const raw = localStorage.getItem(SYN_HISTORY_PREFIX + repoId);
                return raw ? JSON.parse(raw) : [];
            } catch { return []; }
        }
        function pushSynHistory(repoId, syn) {
            try {
                const hist = readSynHistory(repoId);
                hist.push({ ts: Date.now(), syn });
                const trimmed = hist.slice(-SYN_HISTORY_MAX);
                localStorage.setItem(SYN_HISTORY_PREFIX + repoId, JSON.stringify(trimmed));
            } catch (e) { console.warn('History write failed:', e); }
        }
        function findEntryNearDaysAgo(history, daysAgo) {
            if (!history || history.length === 0) return null;
            const target = Date.now() - daysAgo * 86400000;
            let closest = null;
            let closestDiff = Infinity;
            for (const e of history) {
                const diff = Math.abs(e.ts - target);
                if (diff < closestDiff) {
                    closestDiff = diff;
                    closest = e;
                }
            }
            return closestDiff < 3 * 86400000 ? closest : null;
        }
