// [hub] Extrait de hub.js — suggestions/engine.js (portée globale, script classique)
        function pickSuggestions(syn, history) {
            const all = SUGGESTION_RULES
                .map(rule => rule.evaluate(syn, history))
                .filter(s => s != null)
                .sort((a, b) => b.severity - a.severity);

            // Humeur de l'accueil pilotée par la sévérité max réelle des alertes.
            // (les règles positives ont une sévérité basse → serein ; une alerte
            //  grave → tendu). Reflet visuel direct de l'état des repos.
            const maxSeverity = all.length ? all[0].severity : 0;
            setHubMood(maxSeverity);

            // Diversité : max 2 du même tag
            const picked = [];
            const tagCount = {};
            for (const s of all) {
                tagCount[s.tag] = tagCount[s.tag] || 0;
                if (tagCount[s.tag] >= 2) continue;
                picked.push(s);
                tagCount[s.tag]++;
                if (picked.length === 3) break;
            }

            // Fallback générique si moins de 3
            if (picked.length < 3) {
                const generic = [
                    { tag: 'measure', tagLabel: 'Mesurer', direction: 'measure', text: 'Lance une évaluation de maturité DevOps pour cartographier les 8 axes de ta squad.', cta: 'Faire l\'évaluation', severity: 0 },
                    { tag: 'deliver', tagLabel: 'Livrer', direction: 'deliver', text: 'Génère ton pipeline GitLab CI en quelques clics, prêt pour la production.', cta: 'Pipeline Generator', severity: 0 },
                    { tag: 'collab', tagLabel: 'Collaborer', direction: 'collab', text: 'Lance une rétro automatique pour ton dernier sprint, basée sur tes données GitLab.', cta: 'Démarrer la rétro', severity: 0 }
                ];
                for (const g of generic) {
                    if (picked.length >= 3) break;
                    if ((tagCount[g.tag] || 0) >= 2) continue;
                    if (picked.some(p => p.tag === g.tag && p.text === g.text)) continue;
                    picked.push(g);
                    tagCount[g.tag] = (tagCount[g.tag] || 0) + 1;
                }
            }

            return picked.slice(0, 3);
        }
