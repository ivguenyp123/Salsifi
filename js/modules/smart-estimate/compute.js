/* smart-estimate · compute.js — logique pure (calculs, helpers). */

        async function analyzeFeature() {
            const description = document.getElementById('featureDescription').value.trim();
            if (!description) return alert('Décrivez la feature à estimer');

            document.getElementById('configSection').style.display = 'none';
            document.getElementById('loadingSection').classList.add('active');
            document.getElementById('resultsSection').classList.remove('active');

            try {
                analysisData = { mrs: [], patterns: {}, stats: {} };

                // Mode mono-repo : résoudre le vrai nom du repo (affichage)
                if (/^Repo #/.test(projectName)) {
                    try {
                        const pr = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}`, { headers: { 'PRIVATE-TOKEN': GITLAB_TOKEN } });
                        if (pr.ok) {
                            const p = await pr.json();
                            if (p.name) {
                                projectName = p.name;
                                document.getElementById('projectName').textContent = p.name;
                            }
                        }
                    } catch { /* non bloquant */ }
                }

                setStep('Récupération des MRs mergées...');
                const since = new Date(Date.now() - selectedPeriod * 24 * 60 * 60 * 1000).toISOString();
                analysisData.mrs = await fetchAllMergedMRs(since);

                if (analysisData.mrs.length < 3) {
                    throw new Error(`Pas assez d'historique (${analysisData.mrs.length} MRs). Minimum 3 requis.`);
                }

                setStep(`Analyse de ${analysisData.mrs.length} MRs...`);
                await analyzeMRChanges();

                if (analysisData.mrs.length < 3) {
                    throw new Error(`Données insuffisantes après analyse (${analysisData.mrs.length} MRs exploitables).`);
                }

                setStep('Détection des patterns...');
                detectPatterns();

                setStep('Calcul de l\'estimation...');
                const similar = findSimilarFeatures(description);
                const estimation = calculateEstimation(description, similar);

                document.getElementById('loadingSection').classList.remove('active');
                displayResults(estimation, similar);

            } catch (err) {
                console.error(err);
                document.getElementById('loadingSection').classList.remove('active');
                document.getElementById('configSection').style.display = 'block';
                alert('Erreur: ' + err.message);
            }
        }


        async function analyzeMRChanges() {
            const batch = 10, mrs = analysisData.mrs.slice(0, 100);
            for (let i = 0; i < mrs.length; i += batch) {
                await Promise.all(mrs.slice(i, i + batch).map(async (mr) => {
                    try {
                        const r = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/merge_requests/${mr.iid}/changes`, {
                            headers: { 'PRIVATE-TOKEN': GITLAB_TOKEN }
                        });
                        const c = await r.json();
                        const files = c.changes || [];
                        mr.analysis = analyzeFiles(files);
                        mr.analysis.filesChanged = files.length;
                        const created = new Date(mr.created_at), merged = new Date(mr.merged_at);
                        mr.analysis.durationDays = calculateWorkingDays(created, merged);
                        mr.analysis.type = detectMRType(mr, files);
                    } catch (e) { mr.analysis = null; }
                }));
            }
            analysisData.mrs = analysisData.mrs.filter(mr => mr.analysis && mr.analysis.durationDays > 0 && mr.analysis.durationDays < 30);
        }


        function analyzeFiles(files) {
            const a = { additions: 0, deletions: 0, totalChanges: 0, fileTypes: {}, layers: { controller: 0, service: 0, repository: 0, model: 0, test: 0, ui: 0, config: 0, other: 0 } };
            files.forEach(f => {
                const path = f.new_path || f.old_path || '', diff = f.diff || '';
                const adds = (diff.match(/^\+[^+]/gm) || []).length, dels = (diff.match(/^-[^-]/gm) || []).length;
                a.additions += adds; a.deletions += dels; a.totalChanges += adds + dels;
                const ext = path.split('.').pop().toLowerCase();
                a.fileTypes[ext] = (a.fileTypes[ext] || 0) + 1;
                const p = path.toLowerCase();
                if (/controller|handler|resource/i.test(p)) a.layers.controller++;
                else if (/service/i.test(p) && !/test/i.test(p)) a.layers.service++;
                else if (/repository|repo|dao/i.test(p)) a.layers.repository++;
                else if (/model|entity|domain/i.test(p)) a.layers.model++;
                else if (/test|spec/i.test(p)) a.layers.test++;
                else if (/component|\.vue|\.tsx|\.jsx|page/i.test(p)) a.layers.ui++;
                else if (/config|properties|ya?ml/i.test(p)) a.layers.config++;
                else a.layers.other++;
            });
            return a;
        }


        function detectMRType(mr, files) {
            const t = (mr.title || '').toLowerCase(), l = (mr.labels || []).map(x => x.toLowerCase());
            if (l.some(x => /bug|fix/i.test(x)) || /^fix|bug|hotfix/i.test(t)) return 'bugfix';
            if (l.some(x => /refactor/i.test(x)) || /refactor|clean/i.test(t)) return 'refactoring';
            if (/migrat/i.test(t)) return 'migration';
            if (/batch|job|cron/i.test(t)) return 'batch';
            if (/dashboard|page|ecran/i.test(t)) return 'ui-page';
            if (/form|modal|component/i.test(t)) return 'ui-component';
            if (/api|endpoint|rest|crud/i.test(t)) return 'api-crud';
            return 'feature';
        }


        function calculateWorkingDays(start, end) {
            let c = 0; const cur = new Date(start);
            while (cur <= end) { if (cur.getDay() !== 0 && cur.getDay() !== 6) c++; cur.setDate(cur.getDate() + 1); }
            return Math.max(0.5, c - 1);
        }

        // ══════════════════════════════════════════════════════════════════
        // PATTERN DETECTION
        // ══════════════════════════════════════════════════════════════════

        function detectPatterns() {
            const p = { byType: {}, avgByType: {} };
            analysisData.mrs.forEach(mr => {
                if (!mr.analysis) return;
                const t = mr.analysis.type;
                if (!p.byType[t]) p.byType[t] = [];
                p.byType[t].push(mr);
            });
            Object.keys(p.byType).forEach(t => {
                const d = p.byType[t].map(m => m.analysis.durationDays);
                p.avgByType[t] = d.reduce((a, b) => a + b, 0) / d.length;
            });
            analysisData.patterns = p;
            const all = analysisData.mrs.map(m => m.analysis.durationDays).sort((a, b) => a - b);
            analysisData.stats = {
                totalMRs: analysisData.mrs.length,
                avgDuration: all.reduce((a, b) => a + b, 0) / all.length,
                medianDuration: all[Math.floor(all.length / 2)],
                p25: all[Math.floor(all.length * 0.25)],
                p75: all[Math.floor(all.length * 0.75)]
            };
        }

        // ══════════════════════════════════════════════════════════════════
        // SIMILARITY
        // ══════════════════════════════════════════════════════════════════

        function calculateStructureScore(desc, analysis) {
            const d = desc.toLowerCase(); let s = 0;
            if (/api|endpoint|controller/i.test(d) && analysis.layers.controller > 0) s += 8;
            if (/service|business/i.test(d) && analysis.layers.service > 0) s += 8;
            if (/test/i.test(d) && analysis.layers.test > 0) s += 8;
            if (/ui|component|formulaire/i.test(d) && analysis.layers.ui > 0) s += 8;
            return Math.min(30, s);
        }

        // ══════════════════════════════════════════════════════════════════
        // ESTIMATION
        // ══════════════════════════════════════════════════════════════════

        function calculateEstimation(desc, similar) {
            const result = { estimate: 0, min: 0, max: 0, confidence: 0, confidenceLabel: '', factors: [], breakdown: [], warnings: [], tips: [] };

            // Weighted average from similar MRs
            if (similar.length > 0) {
                let ws = 0, wt = 0;
                similar.forEach(m => { const w = m.similarityScore / 100; ws += m.analysis.durationDays * w; wt += w; });
                result.estimate = wt > 0 ? ws / wt : analysisData.stats.medianDuration;
            } else {
                result.estimate = analysisData.stats.medianDuration;
            }
            result.estimate = Math.round(result.estimate * 10) / 10;

            // Confidence
            let conf = 30;
            if (similar.length >= 8) conf += 30; else if (similar.length >= 5) conf += 20; else if (similar.length >= 3) conf += 10;
            const avgSim = similar.length > 0 ? similar.reduce((s, m) => s + m.similarityScore, 0) / similar.length : 0;
            conf += avgSim * 0.35;
            result.confidence = Math.min(95, Math.round(conf));
            result.confidenceLabel = result.confidence >= 75 ? 'Élevée' : result.confidence >= 50 ? 'Moyenne' : 'Faible';

            // Range
            if (similar.length > 2) {
                const d = similar.map(m => m.analysis.durationDays).sort((a, b) => a - b);
                result.min = Math.round(d[Math.floor(d.length * 0.2)] * 10) / 10;
                result.max = Math.round(d[Math.ceil(d.length * 0.8) - 1] * 10) / 10;
            } else {
                result.min = Math.round(result.estimate * 0.6 * 10) / 10;
                result.max = Math.round(result.estimate * 1.5 * 10) / 10;
            }

            // Factors
            const avgF = similar.length > 0 ? similar.reduce((s, m) => s + m.analysis.filesChanged, 0) / similar.length : 8;
            const avgL = similar.length > 0 ? similar.reduce((s, m) => s + m.analysis.totalChanges, 0) / similar.length : 300;
            result.factors = [
                { icon: '📁', label: 'Fichiers', value: Math.round(avgF) },
                { icon: '📝', label: 'Lignes', value: Math.round(avgL) },
                { icon: '🔗', label: 'MRs similaires', value: similar.length },
                { icon: '📊', label: 'Base historique', value: analysisData.mrs.length }
            ];

            // Breakdown
            const total = result.estimate;
            result.breakdown = [
                { icon: '📐', phase: 'Conception', desc: 'Design & specs', days: Math.round(total * 0.15 * 10) / 10, pct: 15 },
                { icon: '💻', phase: 'Développement', desc: 'Code & implémentation', days: Math.round(total * 0.5 * 10) / 10, pct: 50 },
                { icon: '✅', phase: 'Tests', desc: 'Tests & validation', days: Math.round(total * 0.2 * 10) / 10, pct: 20 },
                { icon: '🔍', phase: 'Review', desc: 'Review & corrections', days: Math.round(total * 0.15 * 10) / 10, pct: 15 }
            ];

            // Warnings
            if (similar.length < 3) result.warnings.push('Peu de MRs similaires - estimation moins fiable');
            if (result.max > result.estimate * 2) result.warnings.push('Grande variabilité historique - prévoyez un buffer');
            if (avgF > 20) result.warnings.push('Feature complexe - envisagez de découper');

            // Tips
            result.tips.push('Estimation basée sur l\'historique réel de votre équipe');
            result.tips.push('Utilisez l\'intervalle pour communiquer avec les stakeholders');
            if (result.estimate > 5) result.tips.push('Feature conséquente - découpez en plusieurs MRs');

            return result;
        }

        // ══════════════════════════════════════════════════════════════════
        // DISPLAY
        // ══════════════════════════════════════════════════════════════════

        function shareEstimate() {
            const e = window.currentEstimation;
            navigator.clipboard.writeText(`🎯 Estimation: ${e.estimate}j (${e.min}-${e.max}j) - Confiance ${e.confidence}%`).then(() => alert('✅ Copié !'));
        }

