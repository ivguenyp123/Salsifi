// [hub] Extrait de hub.js — ui/mood.js (portée globale, script classique)
        // ───── Sélection top 3 avec diversité forcée ───────────────────────
        // ───── Humeur ambiante de l'accueil ────────────────────────────────
        // Mappe la sévérité max des suggestions sur l'ambiance du fond.
        // Valeurs d'alpha calibrées dans la démo (validées).
        function setHubMood(maxSeverity) {
            const root = document.documentElement;
            let m1, m2, m3, m4;
            if (maxSeverity >= 8) {
                // Tendu : une alerte grave (sécu qui chute, déploiements en chute, bus factor critique…)
                m1 = 'rgba(251,146,60,.46)'; m2 = 'rgba(248,113,113,.36)';
                m3 = 'rgba(251,191,36,.22)'; m4 = 'rgba(251,146,60,.20)';
            } else if (maxSeverity >= 1) {
                // Neutre : des choses à regarder, rien d'alarmant
                m1 = 'rgba(124,92,255,.42)'; m2 = 'rgba(45,212,191,.28)';
                m3 = 'rgba(251,146,60,.14)'; m4 = 'rgba(244,114,182,.22)';
            } else {
                // Serein : que du positif (Elite, maturité forte…)
                m1 = 'rgba(52,211,153,.50)'; m2 = 'rgba(45,212,191,.40)';
                m3 = 'rgba(124,92,255,.18)'; m4 = 'rgba(52,211,153,.18)';
            }
            root.style.setProperty('--mood-1', m1);
            root.style.setProperty('--mood-2', m2);
            root.style.setProperty('--mood-3', m3);
            root.style.setProperty('--mood-4', m4);
        }

        // ───── Humeur ambiante d'un chemin ──────────────────────────────────
        // Combine la TEINTE du chemin (identité couleur) avec l'INTENSITÉ selon
        // la sévérité max des règles DE CE chemin. Un chemin au calme = teinte
        // douce ; un chemin en alerte = même teinte mais plus saturée/chaude.
        const PATH_RGB = {
            measure: '124,92,255',
            deliver: '45,212,191',
            inspect: '251,146,60',
            collab:  '244,114,182'
        };
        function pathMaxSeverity(tag, syn, history) {
            if (!syn) return 0;
            let max = 0;
            for (const rule of SUGGESTION_RULES) {
                const s = rule.evaluate(syn, history);
                if (s && s.tag === tag && s.severity > max) max = s.severity;
            }
            return max;
        }
        function setPathMood(tag, syn, history) {
            const root = document.documentElement;
            const rgb = PATH_RGB[tag];
            if (!rgb) return;
            const sev = pathMaxSeverity(tag, syn, history);
            // L'intensité de la teinte du chemin monte avec la sévérité.
            // calm: teinte douce ; alerte: teinte forte + nappe chaude d'alerte.
            let aMain, alert;
            if (sev >= 8)      { aMain = .40; alert = 'rgba(248,113,113,.22)'; }   // alerte forte
            else if (sev >= 1) { aMain = .30; alert = `rgba(${rgb},.14)`; }        // à surveiller
            else               { aMain = .22; alert = `rgba(${rgb},.10)`; }        // calme

            root.style.setProperty('--mood-1', `rgba(${rgb},${aMain})`);
            root.style.setProperty('--mood-2', `rgba(${rgb},${(aMain*0.7).toFixed(2)})`);
            root.style.setProperty('--mood-3', alert);
            root.style.setProperty('--mood-4', `rgba(${rgb},${(aMain*0.5).toFixed(2)})`);
        }

        // Restaure l'humeur globale de l'accueil (sévérité max toutes règles confondues)
        function restoreHomeMood() {
            try {
                if (typeof currentRepo !== 'undefined' && currentRepo) {
                    const syn = readSynCache(currentRepo.id);
                    const history = readSynHistory(currentRepo.id);
                    if (syn) {
                        const all = SUGGESTION_RULES.map(r => r.evaluate(syn, history)).filter(Boolean);
                        const max = all.length ? Math.max(...all.map(s => s.severity)) : 0;
                        setHubMood(max);
                        return;
                    }
                }
            } catch {}
            setHubMood(1); // défaut neutre
        }
