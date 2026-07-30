/* smart-estimate · render.js — rendu DOM. */

        function setStep(text) {
            document.getElementById('loadingStep').textContent = text;
        }

        // ══════════════════════════════════════════════════════════════════
        // DATA FETCHING
        // ══════════════════════════════════════════════════════════════════

        function findSimilarFeatures(desc) {
            const words = extractKeywords(desc);
            const scored = analysisData.mrs.map(mr => {
                if (!mr.analysis) return { ...mr, similarityScore: 0 };
                let score = 0;
                const txt = (mr.title + ' ' + (mr.description || '')).toLowerCase();
                const matched = words.filter(w => txt.includes(w));
                score += Math.min(50, matched.length * 10);
                const age = (Date.now() - new Date(mr.merged_at)) / (1000 * 60 * 60 * 24);
                if (age < 30) score += 20; else if (age < 60) score += 10; else if (age < 90) score += 5;
                score += calculateStructureScore(desc, mr.analysis);
                return { ...mr, similarityScore: Math.min(100, score) };
            });
            return scored.filter(m => m.similarityScore > 15).sort((a, b) => b.similarityScore - a.similarityScore).slice(0, 12);
        }


        function extractKeywords(t) {
            const stop = ['le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'pour', 'avec', 'dans', 'sur', 'par', 'the', 'a', 'an', 'and', 'or', 'for', 'with', 'in', 'on', 'by', 'to', 'of'];
            return t.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüç0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stop.includes(w));
        }


        function displayResults(est, similar) {
            // Main estimate
            document.getElementById('sampleSize').textContent = analysisData.mrs.length;
            document.getElementById('mainEstimate').textContent = est.estimate;
            document.getElementById('rangeMin').textContent = est.min;
            document.getElementById('rangeMax').textContent = est.max;
            document.getElementById('confidenceValue').textContent = est.confidence + '%';
            document.getElementById('confidenceLabel').textContent = est.confidenceLabel;
            
            const circle = document.getElementById('confidenceCircle');
            circle.className = 'confidence-circle ' + (est.confidence >= 75 ? 'confidence-high' : est.confidence >= 50 ? 'confidence-medium' : 'confidence-low');

            // Stats
            document.getElementById('statsGrid').innerHTML = est.factors.map(f => `
                <div class="stat-card">
                    <div class="stat-icon">${f.icon}</div>
                    <div class="stat-value">${f.value}</div>
                    <div class="stat-label">${f.label}</div>
                </div>
            `).join('');

            // Warnings
            if (est.warnings.length > 0) {
                document.getElementById('warningsCard').classList.add('active');
                document.getElementById('warningsList').innerHTML = est.warnings.map(w => `
                    <div class="warning-item"><span>⚠️</span><span>${w}</span></div>
                `).join('');
            }

            // Similar MRs
            document.getElementById('similarCount').textContent = similar.length;
            document.getElementById('similarTableBody').innerHTML = similar.slice(0, 6).map(m => `
                <tr>
                    <td><span class="match-badge ${m.similarityScore >= 60 ? 'match-high' : m.similarityScore >= 40 ? 'match-medium' : 'match-low'}">${m.similarityScore}%</span></td>
                    <td class="mr-title-cell" title="${m.title}">${truncate(m.title, 30)}</td>
                    <td>${m.analysis.filesChanged}</td>
                    <td class="days-cell">${m.analysis.durationDays}j</td>
                </tr>
            `).join('');

            // Breakdown
            document.getElementById('breakdownList').innerHTML = est.breakdown.map(b => `
                <div class="breakdown-item">
                    <div class="breakdown-icon">${b.icon}</div>
                    <div class="breakdown-info">
                        <div class="breakdown-phase">${b.phase}</div>
                        <div class="breakdown-desc">${b.desc}</div>
                    </div>
                    <div class="breakdown-bar"><div class="breakdown-bar-fill" style="width: ${b.pct}%"></div></div>
                    <div class="breakdown-days">${b.days}j</div>
                </div>
            `).join('');

            // Chart
            const maxD = Math.max(...similar.map(m => m.analysis.durationDays), est.estimate);
            document.getElementById('historyChart').innerHTML = similar.slice(0, 10).map(m => `
                <div class="chart-bar-wrapper">
                    <div class="chart-bar" style="height: ${(m.analysis.durationDays / maxD) * 140}px" title="${m.title}: ${m.analysis.durationDays}j"></div>
                    <div class="chart-label">#${m.iid}</div>
                </div>
            `).join('') + `
                <div class="chart-bar-wrapper">
                    <div class="chart-bar current" style="height: ${(est.estimate / maxD) * 140}px" title="Votre estimation: ${est.estimate}j"></div>
                    <div class="chart-label" style="color: #6ee7b7; font-weight: 600;">Vous</div>
                </div>
            `;

            // Recommendations
            document.getElementById('recoList').innerHTML = est.tips.map(t => `
                <div class="reco-item"><span>✓</span><span>${t}</span></div>
            `).join('');

            // Show results
            document.getElementById('resultsSection').classList.add('active');
            window.currentEstimation = est;
        }

        // ══════════════════════════════════════════════════════════════════
        // EXPORTS
        // ══════════════════════════════════════════════════════════════════

        function exportToJira() {
            const e = window.currentEstimation, d = document.getElementById('featureDescription').value;
            const csv = `Summary,Story Points,Original Estimate\n"${d.split('\n')[0].substring(0, 50)}",${Math.ceil(e.estimate)},${e.estimate}d`;
            const blob = new Blob([csv], { type: 'text/csv' }), url = URL.createObjectURL(blob), a = document.createElement('a');
            a.href = url; a.download = 'estimation.csv'; a.click();
        }


        function exportToMarkdown() {
            const e = window.currentEstimation, d = document.getElementById('featureDescription').value;
            const md = `## 🎯 Estimation\n**Feature:** ${d.split('\n')[0]}\n**Durée:** ${e.estimate}j (${e.min}-${e.max}j)\n**Confiance:** ${e.confidence}%\n\n### Décomposition\n${e.breakdown.map(b => `- ${b.phase}: ${b.days}j`).join('\n')}`;
            navigator.clipboard.writeText(md).then(() => alert('✅ Copié !'));
        }


        function truncate(s, m) { return s && s.length > m ? s.substring(0, m) + '...' : s || ''; }

        // ── Exposition des handlers pour les onclick inline du HTML ──
        // (garantit la résolution en file:// / scope fermé)
        window.analyzeFeature = analyzeFeature;
        window.exportToJira = exportToJira;
        window.exportToMarkdown = exportToMarkdown;
        window.shareEstimate = shareEstimate;
