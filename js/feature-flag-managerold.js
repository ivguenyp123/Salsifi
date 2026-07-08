
        // ══════════════════════════════════════════════════════════════════
        // CHARTS & DASHBOARD VISUAL RENDERING (v5)
        // ══════════════════════════════════════════════════════════════════

        function renderDashboardCharts() {
            renderDonut();
            renderHealthScore();
            renderAgeChart();
            renderTimelineChart();
        }

        function renderDonut() {
            const groups = {
                'ROLLOUT': { color: '#a78bfa', label: 'Rollout' },
                'STABILISATION': { color: '#60a5fa', label: 'Stabilisation' },
                'CLEANUP': { color: '#34d399', label: 'Cleanup' },
                'DETTE': { color: '#fbbf24', label: 'Dette' },
                'CRITIQUE': { color: '#f87171', label: 'Critique' },
                'OPS': { color: '#6b7280', label: 'Ops' }
            };
            const counts = {};
            Object.keys(groups).forEach(k => counts[k] = 0);
            currentFlags.forEach(f => { if (counts[f.status] !== undefined) counts[f.status]++; });
            const total = currentFlags.length || 1;
            const r = 38, cx = 50, cy = 50, circ = 2 * Math.PI * r;
            let offset = circ * 0.25; // start at top
            let arcs = '';
            let legendHtml = '';
            Object.entries(groups).forEach(([status, cfg]) => {
                const cnt = counts[status];
                if (cnt === 0) return;
                const frac = cnt / total;
                const dash = frac * circ;
                arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${cfg.color}" stroke-width="13" stroke-dasharray="${dash.toFixed(1)} ${(circ - dash).toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" stroke-linecap="round"/>`;
                offset -= dash;
                legendHtml += `<div class="legend-row"><div class="legend-label"><div class="legend-dot" style="background:${cfg.color};"></div>${cfg.label}</div><div class="legend-val">${cnt}</div></div>`;
            });
            const center = total > 0 ? `<text x="${cx}" y="${cy+4}" text-anchor="middle" fill="white" font-size="16" font-weight="800">${total}</text><text x="${cx}" y="${cy+16}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="8">flags</text>` : '';
            const svg = document.getElementById('donut-svg');
            if (svg) svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="13"/>${arcs}${center}`;
            const legend = document.getElementById('donut-legend');
            if (legend) legend.innerHTML = legendHtml || '<span style="font-size:12px;color:var(--text3);">Aucun flag</span>';
        }

        function renderHealthScore() {
            const total = currentFlags.length;
            if (total === 0) return;
            const critical = currentFlags.filter(f => f.status === 'CRITIQUE').length;
            const dette = currentFlags.filter(f => f.status === 'DETTE').length;
            const rollout = currentFlags.filter(f => f.status === 'ROLLOUT').length;
            const score = Math.max(0, Math.round(100 - (critical * 25) - (dette * 10) - Math.max(0, total - 10) * 5));
            const color = score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : '#f87171';
            const circ = 2 * Math.PI * 30;
            const dash = (score / 100) * circ;
            const ring = document.getElementById('health-ring');
            if (ring) { ring.setAttribute('stroke', color); ring.setAttribute('stroke-dasharray', `${dash.toFixed(1)} ${(circ - dash).toFixed(1)}`); }
            const scoreText = document.getElementById('health-score-text');
            if (scoreText) { scoreText.textContent = score; scoreText.setAttribute('fill', color); }
            const items = document.getElementById('health-items');
            if (items) items.innerHTML = `
                <div class="health-item"><span class="health-item-label">Flags en dette</span><span class="health-item-val" style="color:${dette>0?'#fbbf24':'#34d399'};">${dette} ${dette>0?'⚠':'✓'}</span></div>
                <div class="health-item"><span class="health-item-label">Critiques bloquants</span><span class="health-item-val" style="color:${critical>0?'#f87171':'#34d399'};">${critical} ${critical>0?'🚨':'✓'}</span></div>
                <div class="health-item"><span class="health-item-label">En rollout actif</span><span class="health-item-val" style="color:#a78bfa;">${rollout}</span></div>
                <div class="health-item"><span class="health-item-label">Total flags</span><span class="health-item-val" style="color:${total>10?'#f87171':'#60a5fa'};">${total}/10</span></div>
            `;
            renderHealthHistory(score);
        }

        function renderAgeChart() {
            const container = document.getElementById('age-chart-container');
            if (!container) return;
            const sorted = [...currentFlags].filter(f => !f.isOpsFlag).sort((a, b) => b.ageInDays - a.ageInDays).slice(0, 10);
            if (sorted.length === 0) { container.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:20px;">Aucun flag de feature</div>'; return; }
            const maxAge = sorted[0].ageInDays || 1;
            const ageColor = d => d > 60 ? '#f87171' : d > 30 ? '#fbbf24' : d > 14 ? '#34d399' : '#60a5fa';
            container.innerHTML = sorted.map(f => `
                <div class="age-row">
                    <div class="age-name" title="${f.name}">${f.name.replace(/^(enable|disable)-/, '')}</div>
                    <div class="age-bar-wrap"><div class="age-bar" style="width:${Math.round(f.ageInDays/maxAge*100)}%;background:${ageColor(f.ageInDays)};">${f.ageInDays > 18 ? f.ageInDays+'j' : ''}</div></div>
                    <div class="age-days" style="color:${ageColor(f.ageInDays)};">${f.ageInDays}j</div>
                </div>
            `).join('');
        }

        // ══════════════════════════════════════════════════════════════════
        // TIMELINE — vraies données GitLab + audit log
        // ══════════════════════════════════════════════════════════════════

        function computeTimelineData() {
            const now = new Date();
            const WEEKS = 8;

            // Bucket boundaries — chaque semaine = [startMs, endMs]
            const buckets = [];
            const labels  = [];
            for (let w = WEEKS - 1; w >= 0; w--) {
                const endMs   = now.getTime() - w * 7 * 86400000;
                const startMs = endMs - 7 * 86400000;
                buckets.push({ startMs, endMs });
                labels.push(w === 0 ? 'S-1' : 'S-' + (w + 1));
            }

            // CRÉATIONS — depuis created_at des flags actifs
            const creates = buckets.map(() => 0);
            currentFlags.forEach(function(f) {
                const t = new Date(f.created_at).getTime();
                buckets.forEach(function(b, i) {
                    if (t >= b.startMs && t < b.endMs) creates[i]++;
                });
            });

            // SUPPRESSIONS — depuis audit events GitLab (si chargés via l'onglet Historique)
            const deletes = buckets.map(() => 0);
            try {
                if (AUDIT_EVENTS_CACHE && AUDIT_EVENTS_CACHE.byFlag) {
                    AUDIT_EVENTS_CACHE.byFlag.forEach(function(list) {
                        list.forEach(function(ev) {
                            const act = classifyAuditAction(ev);
                            if (act.key !== 'delete') return;
                            const t = new Date(ev.created_at).getTime();
                            buckets.forEach(function(b, i) {
                                if (t >= b.startMs && t < b.endMs) deletes[i]++;
                            });
                        });
                    });
                }
            } catch(e) {}

            // Déterminer si on a de vraies données ou seulement du vide
            const totalCreates = creates.reduce(function(a,b){ return a+b; }, 0);
            const totalDeletes = deletes.reduce(function(a,b){ return a+b; }, 0);
            const hasRealData  = totalCreates > 0 || totalDeletes > 0;

            return { labels, creates, deletes, hasRealData, totalCreates, totalDeletes };
        }

        let timelineChartInstance = null;

        function renderTimelineChart() {
            const data = computeTimelineData();

            // ── Canvas 2D renderer (pas de CDN) ──────────────────────────
            const canvas = document.getElementById('timelineChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const W = canvas.parentElement ? canvas.parentElement.offsetWidth || 320 : 320;
            const H = 150;
            canvas.width = W; canvas.height = H;

            const creates = data.creates;
            const deletes = data.deletes;
            const labels  = data.labels;
            const n = labels.length;
            const maxVal = Math.max(...creates, ...deletes, 1);
            const padL=8, padR=8, padT=10, padB=24;
            const chartW = W - padL - padR;
            const chartH = H - padT - padB;
            const groupW = chartW / n;
            const barW   = groupW * 0.3;
            const gap    = groupW * 0.04;

            ctx.clearRect(0, 0, W, H);

            // Grid lines
            const gridSteps = Math.min(maxVal, 5);
            for (let i = 0; i <= gridSteps; i++) {
                const y = padT + chartH - (i / gridSteps) * chartH;
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                ctx.lineWidth = 1;
                ctx.moveTo(padL, y); ctx.lineTo(W - padR, y);
                ctx.stroke();
                // Y axis value
                if (i > 0) {
                    ctx.fillStyle = 'rgba(255,255,255,0.3)';
                    ctx.font = '8px system-ui';
                    ctx.textAlign = 'right';
                    ctx.fillText(Math.round(i * maxVal / gridSteps), padL + 10, y + 3);
                }
            }

            function rr(x, y, w, h, r) {
                if (h <= 0) return;
                if (h < r) r = h;
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + r);
                ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
            }

            for (let i = 0; i < n; i++) {
                const x = padL + i * groupW;

                // Barre créations (violet)
                const ch = (creates[i] / maxVal) * chartH;
                ctx.fillStyle = creates[i] > 0 ? 'rgba(124,92,252,0.75)' : 'rgba(124,92,252,0.15)';
                rr(x + groupW / 2 - barW - gap / 2, padT + chartH - ch, barW, Math.max(ch, 2), 3);
                ctx.fill();

                // Barre suppressions (vert)
                const dh = (deletes[i] / maxVal) * chartH;
                ctx.fillStyle = deletes[i] > 0 ? 'rgba(110,231,183,0.65)' : 'rgba(110,231,183,0.12)';
                rr(x + groupW / 2 + gap / 2, padT + chartH - dh, barW, Math.max(dh, 2), 3);
                ctx.fill();

                // Valeurs au-dessus des barres
                if (creates[i] > 0) {
                    ctx.fillStyle = 'rgba(167,139,250,0.9)';
                    ctx.font = 'bold 9px system-ui';
                    ctx.textAlign = 'center';
                    ctx.fillText(creates[i], x + groupW / 2 - barW / 2 - gap / 2, padT + chartH - ch - 3);
                }
                if (deletes[i] > 0) {
                    ctx.fillStyle = 'rgba(110,231,183,0.9)';
                    ctx.font = 'bold 9px system-ui';
                    ctx.textAlign = 'center';
                    ctx.fillText(deletes[i], x + groupW / 2 + barW / 2 + gap / 2, padT + chartH - dh - 3);
                }

                // Label semaine
                ctx.fillStyle = 'rgba(255,255,255,0.45)';
                ctx.font = '9px system-ui';
                ctx.textAlign = 'center';
                ctx.fillText(labels[i], x + groupW / 2, H - 6);
            }

            // Badge "données partielles" si suppressions = 0
            if (!data.hasRealData || data.totalDeletes === 0) {
                const note = data.hasRealData
                    ? 'Suppressions : aucune détectée dans l\'historique local'
                    : 'Chargez plus de flags pour alimenter la timeline';
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.font = '9px system-ui';
                ctx.textAlign = 'right';
                ctx.fillText(note, W - padR, padT + 8);
            }

            // Totaux sous le graphe
            updateTimelineTotals(data);
        }

        function updateTimelineTotals(data) {
            // Met à jour les badges légende sous le graphe
            const legendEl = document.getElementById('timeline-legend');
            if (!legendEl) return;
            const last4c = data.creates.slice(-4).reduce(function(a,b){ return a+b; }, 0);
            const last4d = data.deletes.slice(-4).reduce(function(a,b){ return a+b; }, 0);
            legendEl.innerHTML =
                '<span style="display:flex;align-items:center;gap:5px;">' +
                '<span style="width:9px;height:9px;border-radius:2px;background:rgba(124,92,252,0.75);display:inline-block;"></span>' +
                'Créations <strong style="color:#a78bfa;margin-left:3px;">' + data.totalCreates + '</strong>' +
                '<span style="color:var(--ov-3);font-size:10px;margin-left:2px;">(4 sem: ' + last4c + ')</span>' +
                '</span>' +
                '<span style="display:flex;align-items:center;gap:5px;">' +
                '<span style="width:9px;height:9px;border-radius:2px;background:rgba(110,231,183,0.65);display:inline-block;"></span>' +
                'Suppressions <strong style="color:#6ee7b7;margin-left:3px;">' + data.totalDeletes + '</strong>' +
                '<span style="color:var(--ov-3);font-size:10px;margin-left:2px;">(4 sem: ' + last4d + ')</span>' +
                '</span>';
        }



        // ══════════════════════════════════════════════════════════════════
        // CONFIGURATION
        // ══════════════════════════════════════════════════════════════════
        let GITLAB_URL = null;
        let projectId = null;
        let token = null;
        let currentFlags = [];
        let wizardStep = 1;
        let wizardType = null; // 'flag' or 'ops'

        // ══════════════════════════════════════════════════════════════════
        // HELPERS — fetch avec retry 429 + escapeHtml
        // Alignés sur workspace-hub / gouvernance-repo / dora-workspace / repo-analyzer.
        // ══════════════════════════════════════════════════════════════════
        async function fetchGitLab(endpoint, init = {}) {
            const url = `${GITLAB_URL}/api/v4${endpoint}`;
            const headers = { 'PRIVATE-TOKEN': token, ...(init.headers || {}) };
            try {
                let r = await fetch(url, { ...init, headers });
                if (r.status === 429) {
                    const retryAfter = parseInt(r.headers.get('Retry-After')) || 2;
                    console.warn(`[fetchGitLab] 429 sur ${endpoint}, retry dans ${retryAfter}s`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    r = await fetch(url, { ...init, headers });
                }
                return r;
            } catch (e) {
                console.error(`[fetchGitLab] erreur sur ${endpoint}:`, e);
                throw e;
            }
        }

        // Pagination automatique (garde-fou 50 pages = 5000 résultats max).
        async function fetchAllGitLab(endpoint) {
            const all = [];
            let page = 1;
            const sep = endpoint.includes('?') ? '&' : '?';
            while (page <= 50) {
                const r = await fetchGitLab(`${endpoint}${sep}page=${page}&per_page=100`);
                if (!r.ok) {
                    if (page === 1) throw new Error(`API ${endpoint} → ${r.status}`);
                    break;
                }
                const batch = await r.json();
                if (!Array.isArray(batch) || batch.length === 0) break;
                all.push(...batch);
                if (batch.length < 100) break;
                page++;
            }
            return all;
        }

        // Échappement HTML — utilisé partout où on injecte une valeur dynamique
        // via innerHTML / template string. NB : redéfini plus bas localement pour
        // compatibilité avec un usage existant ; les deux fonctions retournent
        // le même résultat.
        function escapeAttr(t) {
            if (t === null || t === undefined) return '';
            return String(t)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // ══════════════════════════════════════════════════════════════════
        // INITIALISATION
        // ══════════════════════════════════════════════════════════════════
        async function init() {
            token = sessionStorage.getItem('gitlab_token');
            GITLAB_URL = sessionStorage.getItem('gitlab_base_url');
            projectId = sessionStorage.getItem('gitlab_project_id');

            // Fallback nouveau format hub : localStorage devops_hub_workspaces
            if (!token || !GITLAB_URL) {
                const authRaw = localStorage.getItem('devops_hub_workspaces');
                if (authRaw) {
                    try {
                        const auth = JSON.parse(authRaw);
                        token = token || auth.token;
                        GITLAB_URL = GITLAB_URL || auth.gitlabUrl;
                    } catch {}
                }
            }
            if (!projectId) {
                projectId = localStorage.getItem('hub_selected_repo_id');
            }

            // Guard strict : projectId numérique requis pour cibler le bon projet.
            // Sans ça, tous les fetches partent sur /projects/null/... et échouent
            // silencieusement.
            if (!token || !GITLAB_URL || !projectId) {
                window.location.href = 'login.html';
                return;
            }

            document.getElementById('projectName').textContent = sessionStorage.getItem('gitlab_project') || 'Projet';

            // Tab navigation
            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', () => switchTab(tab.dataset.tab));
            });

            // Checklist items
            document.querySelectorAll('.checklist-item').forEach(item => {
                item.addEventListener('click', () => toggleChecklistItem(item));
            });

            // Wizard options
            document.querySelectorAll('.wizard-option').forEach(option => {
                option.addEventListener('click', () => selectWizardOption(option));
            });

            // Listeners pour les boutons du wizard (anciennement onclick inline)
            attachStaticListeners();

            // Load flags
            await loadFeatureFlags();

            // Pré-charge des audit events GitLab en arrière-plan, sans bloquer
            // le rendu initial. Ça alimente :
            //   1. La timeline du dashboard (créations / suppressions sur 8 sem.)
            //   2. Le calcul de `daysAtFullRollout` (fallback updated_at sinon)
            // Si l'utilisateur ouvre Historique avant la fin, il déclenche
            // simplement un rechargement (cf. loadAuditHistory).
            (async () => {
                try {
                    await fetchFeatureFlagAuditEvents();
                    // Re-render dashboard pour intégrer les events dans daysAtFullRollout
                    // et timeline. Pas critique si ça n'arrive pas (les fallbacks
                    // restent valables).
                    if (currentFlags.length > 0) {
                        currentFlags = currentFlags.map(f => analyzeFlag(f));
                        renderDashboard();
                    }
                } catch (e) {
                    // Silencieux : l'API peut être indisponible (Premium-only),
                    // on continue avec les fallbacks.
                    console.warn('[audit events] pré-chargement échoué, fallbacks utilisés');
                }
            })();
        }

        // Listeners statiques branchés une seule fois sur les éléments du DOM
        // (anciennement disséminés en onclick inline dans le HTML).
        function attachStaticListeners() {
            // Wizard buttons
            document.getElementById('btn-continue-checklist')?.addEventListener('click', wizardNext);
            document.getElementById('btn-to-form')?.addEventListener('click', wizardNext);
            document.getElementById('btn-generate')?.addEventListener('click', generateFiles);

            // Wizard back buttons (toutes les étapes)
            document.querySelectorAll('[data-wizard-action="back"]').forEach(b =>
                b.addEventListener('click', wizardBack));

            // Detect client file path (bouton dans #client-file-config)
            document.getElementById('btn-detect-client-file')?.addEventListener('click', detectExistingClientFile);

            // Cleanup modal close buttons + nav buttons (data-action / data-cw-* attrs)
            document.querySelectorAll('[data-action="cleanup-close"]').forEach(b =>
                b.addEventListener('click', closeCleanupModal));
            document.querySelectorAll('[data-cw-goto]').forEach(b =>
                b.addEventListener('click', () => cwGoTo(parseInt(b.dataset.cwGoto, 10))));
            document.querySelectorAll('[data-cw-toggle]').forEach(b =>
                b.addEventListener('click', () => cwToggleAction(b.dataset.cwToggle === 'true')));

            // Flags toolbar : filter chips + search (data-status sur les chips)
            document.querySelectorAll('.filter-chip').forEach(chip =>
                chip.addEventListener('click', () => setFlagFilter(chip)));
            document.getElementById('flagSearch')?.addEventListener('input', filterFlags);

            // Regroupement par famille
            document.getElementById('family-filter')?.addEventListener('change', (e) => setFamilyFilter(e.target.value));
            document.getElementById('grouped-view-toggle')?.addEventListener('change', (e) => toggleGroupedView(e.target.checked));

            // Flag table sortable headers
            document.querySelectorAll('.sortable-th').forEach(th =>
                th.addEventListener('click', () => sortFlags(th.dataset.col)));

            // History tab controls
            document.getElementById('history-search')?.addEventListener('input', filterAuditHistory);
            document.getElementById('history-filter-env')?.addEventListener('change', filterAuditHistory);
            document.getElementById('history-filter-status')?.addEventListener('change', filterAuditHistory);
            document.getElementById('history-reload')?.addEventListener('click', loadAuditHistory);

            // Reset wizard (bouton "Nouveau flag")
            document.getElementById('btn-reset-wizard')?.addEventListener('click', resetWizard);

            // Client file path + sync toggle (anciennement dans un 2e DOMContentLoaded)
            setupClientFileListeners();
        }

        // ══════════════════════════════════════════════════════════════════
        // TABS
        // ══════════════════════════════════════════════════════════════════
        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            
            document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
            document.getElementById(`panel-${tabName}`).classList.add('active');
        }

        // ══════════════════════════════════════════════════════════════════
        // STATUT PRODUCTION
        //   inProd       : le flag a-t-il une stratégie scopée 'production' ?
        //                  (donnée SÛRE — état courant des strategies)
        //   prodSinceDays : depuis combien de jours en prod ? (ESTIMATION via
        //                  audit events ; null si l'audit log est muet/indispo —
        //                  on n'invente pas de date pour éviter une fausse précision)
        // Distinct de ageInDays (création) : un flag peut exister depuis 116j mais
        // n'être en prod que depuis 12j, ce qui change tout pour le cleanup.
        // ══════════════════════════════════════════════════════════════════
        const PROD_SCOPE = 'production';
        function analyzeProdStatus(flag, now) {
            // 1) En prod ? — présence du scope 'production' dans les strategies
            let inProd = false;
            (flag.strategies || []).forEach(function(s){
                (s.scopes || []).forEach(function(sc){
                    if (sc.environment_scope === PROD_SCOPE) inProd = true;
                });
            });
            if (!inProd) return { inProd: false, prodSinceDays: null, prodSinceEstimated: false };

            // 2) Depuis quand ? — plus ancien audit event mentionnant 'production'
            //    dans son message, en repartant du dernier event qui l'aurait retiré.
            let prodSince = null, estimated = false;
            try {
                const events = AUDIT_EVENTS_CACHE?.byFlag?.get?.(flag.name);
                if (Array.isArray(events) && events.length) {
                    // events triés desc (récent -> ancien). On parcourt du plus récent
                    // au plus ancien et on garde la date de l'event 'prod' la plus
                    // ancienne d'une séquence continue (on s'arrête si un event retire
                    // explicitement la prod).
                    const mentionsProd = (ev) => {
                        const msg = (ev.details && (ev.details.custom_message || ev.details.change || '')) + '';
                        return /\bproduction\b/i.test(msg);
                    };
                    const removesProd = (ev) => {
                        const msg = (ev.details && (ev.details.custom_message || '')) + '';
                        return /\b(removed?|deleted?|disabled?).*production\b/i.test(msg);
                    };
                    // du plus ancien au plus récent
                    const asc = events.slice().reverse();
                    for (const ev of asc) {
                        const t = new Date(ev.created_at);
                        if (isNaN(t)) continue;
                        if (removesProd(ev)) { prodSince = null; continue; } // prod retirée puis re-mise : on repart
                        if (mentionsProd(ev) && !prodSince) { prodSince = t; estimated = true; }
                    }
                }
            } catch { /* audit muet : on laissera prodSince null */ }

            const prodSinceDays = prodSince
                ? Math.floor((now - prodSince) / (1000 * 60 * 60 * 24))
                : null;
            return { inProd: true, prodSinceDays, prodSinceEstimated: estimated };
        }

        // ══════════════════════════════════════════════════════════════════
        // ANALYSE DES FLAGS (selon la doc de Dan)
        // ══════════════════════════════════════════════════════════════════
        function analyzeFlag(flag) {
            const now = new Date();
            const createdAt = new Date(flag.created_at);
            const ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
            const prodStatus = analyzeProdStatus(flag, now);
            
            // Déterminer le rollout percentage
            let rolloutPercent = 0;
            if (flag.strategies && flag.strategies.length > 0) {
                for (const strategy of flag.strategies) {
                    if (strategy.name === 'default' || strategy.name === 'gradualRolloutUserId') {
                        if (strategy.parameters && strategy.parameters.percentage) {
                            rolloutPercent = Math.max(rolloutPercent, parseInt(strategy.parameters.percentage));
                        } else if (strategy.name === 'default') {
                            rolloutPercent = 100;
                        }
                    }
                }
            }
            if (flag.active) rolloutPercent = Math.max(rolloutPercent, 100);

            // Type de flag
            const isOpsFlag = flag.name.startsWith('disable-');

            // Estimation du temps à 100% rollout. Sources, par priorité :
            //   1. Audit events GitLab (préchargés via fetchFeatureFlagAuditEvents) :
            //      on cherche le dernier event qui a fait passer le rollout à 100%.
            //   2. Fallback : `updated_at` du flag. Imparfait — saute si on modifie
            //      la description après le passage à 100% — mais c'est ce qu'on
            //      a sans audit log.
            const updatedAt = new Date(flag.updated_at || flag.created_at);
            let fullRolloutSince = updatedAt;
            try {
                const events = AUDIT_EVENTS_CACHE?.byFlag?.get?.(flag.name);
                if (Array.isArray(events) && events.length > 0) {
                    // Events triés desc par date. On cherche le plus ancien event
                    // postérieur au dernier passage à 100% — concrètement le
                    // premier event chronologique qui a mis le flag à plein.
                    // Heuristique simple : on prend l'event "update" le plus
                    // ancien dans la séquence depuis le dernier "create"/"reset".
                    const updates = events.filter(ev => classifyAuditAction(ev).key === 'update');
                    if (updates.length > 0) {
                        const oldestUpdate = updates[updates.length - 1];
                        const t = new Date(oldestUpdate.created_at);
                        if (!isNaN(t) && t < fullRolloutSince) fullRolloutSince = t;
                    }
                }
            } catch { /* fallback silencieux sur updated_at */ }
            const daysAtFullRollout = rolloutPercent === 100
                ? Math.floor((now - fullRolloutSince) / (1000 * 60 * 60 * 24))
                : 0;

            // ══════════════════════════════════════════════════════════════
            // BASE DE DETTE — depuis quand le flag est-il une dette potentielle ?
            //   La dette technique d'une FF naît quand elle vit EN PROD, pas à sa
            //   création. Beaucoup d'équipes ne sont pas en trunk-based : une FF
            //   peut vivre 80j en intégration/UAT avant la prod — ce n'est PAS de
            //   la dette tant qu'elle n'est pas en prod.
            //   Priorité des sources, de la plus juste à la plus dégradée :
            //     1. prodSinceDays    — durée réelle en production (estimée, audit)
            //     2. daysAtFullRollout— à défaut, durée à 100% MAIS seulement si le
            //                           flag a un scope 'production' (sinon ce 100%
            //                           est en UAT/intégration et n'est PAS de la dette)
            //     3. ageInDays        — uniquement si scope prod sans autre signal
            //   Si le flag n'est PAS en prod du tout : pas de base de dette (null),
            //   il ne pourra pas être classé DETTE/CRITIQUE — quel que soit son âge.
            //   Les seuils DETTE/CRITIQUE se basent sur CETTE valeur, plus sur l'âge
            //   de création. ROLLOUT/STABILISATION restent inchangés.
            let debtDays;
            if (prodStatus.prodSinceDays != null) {
                debtDays = prodStatus.prodSinceDays;          // 1. durée en prod connue
            } else if (prodStatus.inProd) {
                // en prod mais durée inconnue (audit muet) : on estime via le 100%, sinon l'âge
                debtDays = daysAtFullRollout > 0 ? daysAtFullRollout : ageInDays;
            } else {
                debtDays = null;                              // pas en prod → pas de dette
            }

            // ══════════════════════════════════════════════════════════════
            // LOGIQUE DE LA DOC DE DAN
            // ══════════════════════════════════════════════════════════════

            // OPS FLAG - Pas de limite de temps (Section 1)
            // "tant que la dépendance existe"
            if (isOpsFlag) {
                return {
                    ...flag,
                    ageInDays,
                    ...prodStatus,
                    rolloutPercent,
                    daysAtFullRollout,
                    status: 'OPS',
                    icon: '⚙️',
                    message: 'Kill switch permanent - OK',
                    action: null,
                    priority: 0,
                    color: 'ops',
                    isOpsFlag: true
                };
            }

            // EN ROLLOUT - Pas encore à 100%
            // "5% → 25% → 50% → 100% (3-7 jours)"
            if (rolloutPercent < 100) {
                return {
                    ...flag,
                    ageInDays,
                    ...prodStatus,
                    rolloutPercent,
                    daysAtFullRollout,
                    status: 'ROLLOUT',
                    icon: '🚀',
                    message: `En déploiement (${rolloutPercent}%)`,
                    action: 'Continuer rollout progressif',
                    priority: 0,
                    color: 'rollout',
                    isOpsFlag: false
                };
            }

            // À 100% MAIS < 2 SEMAINES - Stabilisation
            // "2 semaines de stabilité à 100% avant cleanup"
            if (daysAtFullRollout < 14) {
                const remaining = 14 - daysAtFullRollout;
                return {
                    ...flag,
                    ageInDays,
                    ...prodStatus,
                    rolloutPercent,
                    daysAtFullRollout,
                    status: 'STABILISATION',
                    icon: '🔄',
                    message: `100% depuis ${daysAtFullRollout}j - Stabilisation`,
                    action: `Attendre encore ${remaining} jours avant cleanup`,
                    priority: 1,
                    color: 'stabilisation',
                    isOpsFlag: false
                };
            }

            // À 100% MAIS PAS EN PROD — équipe non-TBD : flag stabilisé en
            // intégration/UAT, en attente de fenêtre de déploiement prod.
            // Ce n'est PAS de la dette tant que ce n'est pas en prod, quel que
            // soit l'âge. On le signale comme "prêt à promouvoir", pas comme dette.
            if (debtDays == null) {
                return {
                    ...flag,
                    ageInDays,
                    ...prodStatus,
                    rolloutPercent,
                    daysAtFullRollout,
                    debtDays,
                    status: 'STABILISATION',
                    icon: '🟦',
                    message: `100% hors prod (${daysAtFullRollout}j) - en attente de promotion`,
                    action: 'Promouvoir en production ou clôturer si abandonné',
                    priority: 1,
                    color: 'stabilisation',
                    isOpsFlag: false
                };
            }

            // À 100% ET ≥ 2 SEMAINES ET < 1 MOIS - Prêt pour cleanup
            // "OBLIGATOIREMENT supprimé 2 semaines après stabilisation"
            if (debtDays <= 30) {
                return {
                    ...flag,
                    ageInDays,
                    ...prodStatus,
                    rolloutPercent,
                    daysAtFullRollout,
                    status: 'CLEANUP',
                    icon: '✅',
                    message: `100% depuis ${daysAtFullRollout}j - Prêt`,
                    action: '⚡ Cleanup MAINTENANT',
                    priority: 2,
                    color: 'cleanup',
                    isOpsFlag: false
                };
            }

            // > 1 MOIS - DETTE TECHNIQUE
            // "UN FLAG QUI RESTE ACTIF > 1 MOIS EST UNE DETTE TECHNIQUE"
            if (debtDays <= 60) {
                return {
                    ...flag,
                    ageInDays,
                    ...prodStatus,
                    rolloutPercent,
                    daysAtFullRollout,
                    debtDays,
                    status: 'DETTE',
                    icon: '⚠️',
                    message: `${debtDays} jours en prod - DETTE TECHNIQUE`,
                    action: 'Justification écrite OU suppression immédiate',
                    priority: 3,
                    color: 'dette',
                    isOpsFlag: false
                };
            }

            // > 2 MOIS - CRITIQUE
            // "FREEZE nouvelles features, on nettoie d'abord"
            return {
                ...flag,
                ageInDays,
                ...prodStatus,
                rolloutPercent,
                daysAtFullRollout,
                debtDays,
                status: 'CRITIQUE',
                icon: '💀',
                message: `${debtDays} jours en prod - CRITIQUE`,
                action: '🚨 FREEZE features - Cleanup OBLIGATOIRE',
                priority: 4,
                color: 'critical',
                isOpsFlag: false
            };
        }

        // ══════════════════════════════════════════════════════════════════
        // CHARGEMENT DES FLAGS
        // ══════════════════════════════════════════════════════════════════
        async function loadFeatureFlags() {
            try {
                // Auparavant un seul fetch sans per_page → 20 flags max retournés
                // par défaut. Maintenant paginé pour récupérer la totalité, avec
                // retry 429 intégré via fetchGitLab.
                const r = await fetchGitLab(`/projects/${projectId}/feature_flags?per_page=100`);
                if (!r.ok) {
                    if (r.status === 403) { showNoAccess(); return; }
                    throw new Error(`API error: ${r.status}`);
                }
                // Si le premier page indique qu'il y en a plus, on pagine.
                let flags = await r.json();
                if (Array.isArray(flags) && flags.length === 100) {
                    // Probablement tronqué — relancer en paginé complet.
                    flags = await fetchAllGitLab(`/projects/${projectId}/feature_flags`);
                }

                currentFlags = flags.map(analyzeFlag);

                renderDashboard();
                renderCleanupPanel();

            } catch (error) {
                console.error('Erreur chargement flags:', error);
                showError(error.message);
            }
        }

        function showNoAccess() {
            document.getElementById('alerts-container').innerHTML = `
                <div class="alert alert-warning">
                    <div class="alert-icon">🔒</div>
                    <div class="alert-content">
                        <div class="alert-title">Accès Feature Flags non disponible</div>
                        <div class="alert-text">
                            Les Feature Flags GitLab nécessitent un accès spécifique.<br>
                            Contactez votre administrateur GitLab ou utilisez le mode simulation.
                        </div>
                    </div>
                </div>
                <button class="btn btn-secondary" id="btn-load-demo">🎭 Charger données de démo</button>
            `;
            document.getElementById('btn-load-demo')?.addEventListener('click', loadDemoData);
        }

        function loadDemoData() {
            // Données de démo pour illustrer les différents statuts
            const demoFlags = [
                { name: 'enable-apple-pay', created_at: daysAgo(21), updated_at: daysAgo(7), active: true, strategies: [{ name: 'default' }] },
                { name: 'enable-new-dashboard', created_at: daysAgo(18), updated_at: daysAgo(5), active: true, strategies: [{ name: 'default' }] },
                { name: 'enable-instant-transfer', created_at: daysAgo(5), updated_at: daysAgo(2), active: true, strategies: [{ name: 'gradualRolloutUserId', parameters: { percentage: '25' } }] },
                { name: 'enable-old-scoring', created_at: daysAgo(45), updated_at: daysAgo(30), active: true, strategies: [{ name: 'default' }] },
                { name: 'test-legacy-feature', created_at: daysAgo(68), updated_at: daysAgo(60), active: true, strategies: [{ name: 'default' }] },
                { name: 'disable-external-api', created_at: daysAgo(120), updated_at: daysAgo(90), active: true, strategies: [{ name: 'default' }] },
                { name: 'disable-ocr-service', created_at: daysAgo(200), updated_at: daysAgo(150), active: true, strategies: [{ name: 'default' }] },
            ];

            currentFlags = demoFlags.map(analyzeFlag);
            renderDashboard();
            renderCleanupPanel();
        }

        function daysAgo(days) {
            const d = new Date();
            d.setDate(d.getDate() - days);
            return d.toISOString();
        }

        function showError(message) {
            document.getElementById('alerts-container').innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <p>Erreur: ${escapeAttr(message)}</p>
                    <button class="btn btn-secondary" id="btn-load-demo-err" style="margin-top: 20px;">🎭 Charger données de démo</button>
                </div>
            `;
            document.getElementById('btn-load-demo-err')?.addEventListener('click', loadDemoData);
        }

        // ══════════════════════════════════════════════════════════════════
        // RENDER DASHBOARD
        // ══════════════════════════════════════════════════════════════════
        function renderDashboard() {
            // Le set de flags a (potentiellement) changé : on invalide le cache
            // des familles et on repeuple le dropdown de filtre par famille.
            _familyCache = null;
            populateFamilyFilter();

            // Stats
            const featureFlags = currentFlags.filter(f => !f.isOpsFlag);
            const opsFlags = currentFlags.filter(f => f.isOpsFlag);
            const toCleanup = currentFlags.filter(f => f.priority >= 2 && !f.isOpsFlag);
            const critical = currentFlags.filter(f => f.priority >= 4);

            // KPIs updated by updateKPIs() via renderAllCharts()

            // Alerts
            let alertsHtml = '';
            if (critical.length > 0) {
                alertsHtml += `
                    <div class="alert alert-danger">
                        <div class="alert-icon">🚨</div>
                        <div class="alert-content">
                            <div class="alert-title">FLAGS CRITIQUES - Action immédiate requise</div>
                            <div class="alert-text">${critical.length} flag(s) ont plus de 2 mois. Selon la doc : FREEZE nouvelles features jusqu'au cleanup.</div>
                        </div>
                    </div>
                `;
            }
            if (featureFlags.length > 10) {
                alertsHtml += `
                    <div class="alert alert-danger">
                        <div class="alert-icon">⛔</div>
                        <div class="alert-content">
                            <div class="alert-title">QUOTA DÉPASSÉ - Max 10 feature flags</div>
                            <div class="alert-text">Vous avez ${featureFlags.length} feature flags. Nettoyez avant d'en créer de nouveaux.</div>
                        </div>
                    </div>
                `;
            }
            document.getElementById('alerts-container').innerHTML = alertsHtml;

            // Group flags by status
            const groups = {
                critical: currentFlags.filter(f => f.status === 'CRITIQUE'),
                dette: currentFlags.filter(f => f.status === 'DETTE'),
                cleanup: currentFlags.filter(f => f.status === 'CLEANUP'),
                stabilisation: currentFlags.filter(f => f.status === 'STABILISATION'),
                rollout: currentFlags.filter(f => f.status === 'ROLLOUT'),
                ops: currentFlags.filter(f => f.status === 'OPS')
            };

            let html = '';


            // Inject CTA shortcut if critical flags
            (function() {
                var ctaEl = document.getElementById('dashboard-flags-cta');
                if (!ctaEl) return;
                var critCount = currentFlags.filter(function(f){ return f.status === 'CRITIQUE'; }).length;
                var detteCount = currentFlags.filter(function(f){ return f.status === 'DETTE'; }).length;
                if (critCount > 0 || detteCount > 0) {
                    ctaEl.style.display = 'flex';
                    ctaEl.innerHTML =
                        '<span style="flex:1;font-size:13px;">' +
                        (critCount > 0 ? '<strong style="color:#fca5a5;">' + critCount + ' flag(s) critique(s)</strong> ' : '') +
                        (detteCount > 0 ? '<span style="color:#fcd34d;">' + detteCount + ' flag(s) en dette</span>' : '') +
                        ' — action requise</span>' +
                        '<button id="cta-goto-flags" style="padding:8px 16px;background:var(--ov-15);border:1px solid var(--ov-3);border-radius:9px;color:white;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">Voir les flags →</button>';
                    ctaEl.querySelector('#cta-goto-flags')?.addEventListener('click', goToFlagsTab);
                } else {
                    ctaEl.style.display = 'none';
                }
            })();

            // Update KPIs, charts, flags table
            renderAllCharts(groups);
        }

        function renderFlagGroup(title, colorClass, flags) {
            // Note : `renderFlagGroup` n'est plus appelée par renderDashboard (qui
            // passe par `renderFlagsTable` maintenant), mais on la garde au cas où
            // un autre call site la réutiliserait. Refactorée pour utiliser des
            // data-attributes échappés (anciennement onclick inline avec apostrophes
            // littérales — fragile sur noms de flag avec caractères spéciaux).
            const flagsHtml = flags.map(f => `
                <div class="flag-item">
                    <div class="flag-icon">${f.icon}</div>
                    <div class="flag-info">
                        <div class="flag-name">${escapeAttr(f.name)}</div>
                        <div class="flag-meta">${escapeAttr(f.message)}</div>
                        ${f.action ? `<div class="flag-action">${escapeAttr(f.action)}</div>` : ''}
                    </div>
                    <div class="flag-stats">
                        <div class="flag-age">${f.ageInDays}j</div>
                        <div class="flag-rollout">${f.rolloutPercent}%</div>
                    </div>
                    <div class="flag-actions">
                        <div class="ff-toggle" data-active="${f.active !== false}" data-flag-name="${escapeAttr(f.name)}" data-action="quick-toggle">
                            <span class="ff-toggle-seg seg-off">OFF</span>
                            <span class="ff-toggle-seg seg-on">ON</span>
                        </div>
                        ${f.priority >= 2 && !f.isOpsFlag ? `<button class="btn-small primary" data-flag-name="${escapeAttr(f.name)}" data-action="open-cleanup">🧹 Clean</button>` : ''}
                    </div>
                </div>
            `).join('');

            return `
                <div class="flag-group">
                    <div class="flag-group-header ${escapeAttr(colorClass)}">
                        ${escapeAttr(title)}
                        <span class="flag-group-count">${flags.length}</span>
                    </div>
                    <div class="flag-group-content">
                        ${flagsHtml}
                    </div>
                </div>
            `;
        }

        // Le hook v5 monkey-patch a été retiré : `renderAllCharts()` appelé en fin
        // de `renderDashboard()` couvre déjà tous les charts. L'ancien hook ajoutait
        // un second appel à `renderDashboardCharts` via setTimeout, qui re-rendait
        // les 4 mêmes charts 60ms plus tard (flash visuel + travail inutile).

        // ══════════════════════════════════════════════════════════════════
        // RENDER CLEANUP PANEL
        // ══════════════════════════════════════════════════════════════════
        function renderCleanupPanel() {
            const toCleanup = currentFlags.filter(f => f.priority >= 2 && !f.isOpsFlag);

            if (toCleanup.length === 0) {
                document.getElementById('cleanup-container').innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">✨</div>
                        <p>Aucun flag à nettoyer pour le moment</p>
                    </div>
                `;
                return;
            }

            // Sort by priority (highest first)
            toCleanup.sort((a, b) => b.priority - a.priority);

            let html = '';
            toCleanup.forEach(flag => {
                html += `
                    <div class="flag-item" style="background: rgba(${flag.priority >= 4 ? '239, 68, 68' : flag.priority >= 3 ? '251, 191, 36' : '52, 211, 153'}, 0.15); margin-bottom: 15px;">
                        <div class="flag-icon">${flag.icon}</div>
                        <div class="flag-info">
                            <div class="flag-name">${escapeAttr(flag.name)}</div>
                            <div class="flag-meta">${escapeAttr(flag.message)}</div>
                            <div class="flag-action">${escapeAttr(flag.action)}</div>
                        </div>
                        <div class="flag-stats">
                            <div class="flag-age">${flag.ageInDays} jours</div>
                            <div class="flag-rollout">${flag.rolloutPercent}%</div>
                        </div>
                        <div class="flag-actions">
                            <button class="btn-small primary" data-flag-name="${escapeAttr(flag.name)}" data-action="open-cleanup">🧹 Cleanup</button>
                        </div>
                    </div>
                `;
            });

            const container = document.getElementById('cleanup-container');
            container.innerHTML = html;
            // Event delegation : un seul listener au lieu de N onclick inline.
            container.querySelectorAll('[data-action="open-cleanup"]').forEach(b => {
                b.addEventListener('click', () => openCleanupModal(b.dataset.flagName));
            });
        }

        // ══════════════════════════════════════════════════════════════════
        // CLEANUP MODAL
        // ══════════════════════════════════════════════════════════════════
        let currentCleanupFlag = null;
        let currentCleanupFlagData = null;

        function openCleanupModal(flagName) {
            currentCleanupFlag = flagName;
            currentCleanupFlagData = currentFlags.find(function(f){ return f.name === flagName; });
            var f = currentCleanupFlagData;
            document.getElementById('modal-flag-name').textContent = flagName;
            var isActive = f ? f.active !== false : false;
            var statusColor = isActive ? '#6ee7b7' : '#fca5a5';
            var statusText  = isActive ? 'ON' : 'OFF';
            var grid = document.getElementById('cw-status-grid');
            if (grid && f) {
                var ageColor = f.ageInDays > 30 ? '#fbbf24' : '#93c5fd';
                grid.innerHTML =
                    '<div class="cw-status-card"><div class="cw-sc-val" style="color:' + statusColor + ';">' + statusText + '</div><div class="cw-sc-lbl">État actuel</div></div>' +
                    '<div class="cw-status-card"><div class="cw-sc-val" style="color:' + ageColor + ';">' + f.ageInDays + 'j</div><div class="cw-sc-lbl">Âge</div></div>' +
                    '<div class="cw-status-card"><div class="cw-sc-val" style="color:#a78bfa;">' + f.rolloutPercent + '%</div><div class="cw-sc-lbl">Rollout</div></div>';
            }
            var btnOff = document.getElementById('cw-btn-deactivate');
            var btnOn  = document.getElementById('cw-btn-activate');
            if (btnOff) { btnOff.classList.toggle('selected', isActive);  btnOff.disabled = !isActive; }
            if (btnOn)  { btnOn.classList.toggle('selected', !isActive); btnOn.disabled = isActive; }
            var proj = sessionStorage.getItem('gitlab_project');
            var gl = document.getElementById('btn-view-gitlab');
            if (gl) gl.href = GITLAB_URL + '/' + proj + '/-/feature_flags';
            document.querySelectorAll('#cleanup-checklist .checklist-item').forEach(function(i){ i.classList.remove('checked'); });
            var ar = document.getElementById('modal-api-result');
            if (ar) ar.style.display = 'none';
            cwUpdateChecklistStatus();
            cwGoTo(1);
            document.getElementById('cleanup-modal').showModal();
        }

        function closeCleanupModal() {
            var dlg = document.getElementById('cleanup-modal');
            if (dlg && dlg.open) dlg.close();
            currentCleanupFlag = null;
            currentCleanupFlagData = null;
        }

        // ══════════════════════════════════════════════════════════════════
        // WIZARD
        // ══════════════════════════════════════════════════════════════════
        function selectWizardOption(option) {
            document.querySelectorAll('.wizard-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');

            const result = option.dataset.result;
            const value = option.dataset.value;

            setTimeout(() => {
                showWizardResult(result, value);
            }, 300);
        }

        function showWizardResult(result, value) {
            let html = '';

            if (result === 'flag') {
                wizardType = 'flag';
                html = `
                    <div class="wizard-result success">
                        <h3>✅ OUI - Feature Flag approprié</h3>
                        <p>Une nouvelle feature métier est un cas d'usage valide pour un feature flag.</p>
                        <p style="margin-top: 10px;"><strong>Rappel :</strong> Durée de vie max 4 semaines, cleanup obligatoire.</p>
                    </div>
                `;
                document.getElementById('btn-continue-checklist').style.display = 'inline-flex';
            } else if (result === 'ops') {
                wizardType = 'ops';
                html = `
                    <div class="wizard-result warning">
                        <h3>⚠️ OUI - Ops Flag (avec validation)</h3>
                        <p>Un kill switch nécessite la validation du <strong>Tech Lead + PO</strong>.</p>
                        <p style="margin-top: 10px;"><strong>Rappel :</strong> Maximum 5 Ops Flags par application.</p>
                    </div>
                `;
                document.getElementById('btn-continue-checklist').style.display = 'inline-flex';
            } else if (result === 'no-env') {
                wizardType = null;
                html = `
                    <div class="wizard-result failure">
                        <h3>❌ NON - Utilise une variable d'environnement</h3>
                        <p>La configuration technique n'est pas une "feature" à activer/désactiver.</p>
                        <p style="margin-top: 10px;"><strong>Solution :</strong> <code>REDIS_CACHE_ENABLED=true</code> dans ton fichier .env ou ConfigMap Kubernetes.</p>
                    </div>
                `;
                document.getElementById('btn-continue-checklist').style.display = 'none';
            } else if (result === 'no-iam') {
                wizardType = null;
                html = `
                    <div class="wizard-result failure">
                        <h3>❌ NON - Utilise le système IAM/RBAC</h3>
                        <p>Les permissions doivent être gérées par un système d'autorisation centralisé.</p>
                        <p style="margin-top: 10px;"><strong>Solution :</strong> Configurer les rôles et permissions dans votre système IAM.</p>
                    </div>
                `;
                document.getElementById('btn-continue-checklist').style.display = 'none';
            } else if (result === 'no-db') {
                wizardType = null;
                html = `
                    <div class="wizard-result failure">
                        <h3>❌ NON - Utilise la base de données / CMS</h3>
                        <p>Les règles métier et le contenu doivent être gérés en base de données.</p>
                        <p style="margin-top: 10px;"><strong>Solution :</strong> Table de configuration en BDD ou back-office dédié.</p>
                    </div>
                `;
                document.getElementById('btn-continue-checklist').style.display = 'none';
            } else if (result === 'no-ab') {
                wizardType = null;
                html = `
                    <div class="wizard-result failure">
                        <h3>❌ NON - Utilise un outil d'A/B testing</h3>
                        <p>L'A/B testing nécessite des analytics, du tracking, de la répartition statistique.</p>
                        <p style="margin-top: 10px;"><strong>Solution :</strong> Optimizely, Google Optimize, ou LaunchDarkly Experiments.</p>
                    </div>
                `;
                document.getElementById('btn-continue-checklist').style.display = 'none';
            }

            document.getElementById('wizard-result-container').innerHTML = html;
            wizardStep = 2;
            updateWizardStep();
        }

        function wizardNext() {
            wizardStep++;
            updateWizardStep();
        }

        function wizardBack() {
            wizardStep--;
            updateWizardStep();
        }

        function updateWizardStep() {
            document.querySelectorAll('.wizard-step').forEach((step, index) => {
                step.classList.toggle('active', index === wizardStep - 1);
            });
        }

        function resetWizard() {
            wizardStep = 1;
            wizardType = null;
            document.querySelectorAll('.wizard-option').forEach(o => o.classList.remove('selected'));
            document.querySelectorAll('.checklist-item').forEach(i => i.classList.remove('checked'));
            document.getElementById('generated-files').style.display = 'none';
            document.getElementById('btn-to-form').disabled = true;
            updateChecklistStatus();
            updateWizardStep();
        }

        // ══════════════════════════════════════════════════════════════════
        // CHECKLIST
        // ══════════════════════════════════════════════════════════════════
        function toggleChecklistItem(item) {
            item.classList.toggle('checked');
            updateChecklistStatus();
            cwUpdateChecklistStatus();
        }

        function updateChecklistStatus() {
            const items = document.querySelectorAll('#creation-checklist .checklist-item');
            const checked = document.querySelectorAll('#creation-checklist .checklist-item.checked');
            const total = items.length;
            const count = checked.length;

            const status = document.getElementById('checklist-status');
            const btn = document.getElementById('btn-to-form');

            if (count === total) {
                status.className = 'checklist-status complete';
                status.textContent = `✅ ${count}/${total} critères validés - Tu peux créer le flag`;
                btn.disabled = false;
            } else {
                status.className = 'checklist-status incomplete';
                status.textContent = `❌ ${count}/${total} critères validés - Complète la checklist`;
                btn.disabled = true;
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // GESTION DU FICHIER CLIENT FEATURE FLAGS
        // ══════════════════════════════════════════════════════════════════
        
        // Chemins par défaut selon la stack
        const DEFAULT_PATHS = {
            angular: 'src/app/core/feature-flags.ts',
            react: 'src/lib/featureFlags.ts',
            java: 'src/main/java/com/lcl/config/FeatureFlags.java',
            python: 'src/config/feature_flags.py'
        };
        
        // État du fichier client
        let clientFileExists = false;
        let existingFlags = [];
        let existingFileContent = '';
        
        // Mettre à jour le chemin par défaut quand on change la stack.
        // Auparavant attaché via un second DOMContentLoaded — maintenant appelé
        // depuis init() pour éviter une race condition avec le bootstrap principal.
        function setupClientFileListeners() {
            const stackSelect = document.getElementById('client-file-stack');
            const pathInput = document.getElementById('client-file-path');

            if (stackSelect && pathInput) {
                // Set initial path
                pathInput.value = DEFAULT_PATHS[stackSelect.value];

                stackSelect.addEventListener('change', () => {
                    pathInput.value = DEFAULT_PATHS[stackSelect.value];
                    clientFileExists = false;
                    existingFlags = [];
                    document.getElementById('client-file-status').innerHTML = '';
                });
            }

            // Toggle visibility of config based on checkbox
            const syncCheckbox = document.getElementById('sync-client-file');
            const configDiv = document.getElementById('client-file-config');
            if (syncCheckbox && configDiv) {
                syncCheckbox.addEventListener('change', () => {
                    configDiv.style.display = syncCheckbox.checked ? 'block' : 'none';
                });
            }
        }
        
        // Détecter si le fichier client existe déjà dans le repo
        async function detectExistingClientFile() {
            const filePath = document.getElementById('client-file-path').value.trim();
            const statusDiv = document.getElementById('client-file-status');
            
            if (!filePath) {
                statusDiv.innerHTML = '<span style="color: #f87171;">❌ Chemin requis</span>';
                return;
            }
            
            statusDiv.innerHTML = '<span style="color: #fbbf24;">🔍 Recherche en cours...</span>';
            
            try {
                // API GitLab pour récupérer un fichier
                const response = await fetch(
                    `${GITLAB_URL}/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}?ref=main`,
                    { headers: { 'PRIVATE-TOKEN': token } }
                );
                
                if (response.ok) {
                    const data = await response.json();
                    existingFileContent = atob(data.content);
                    clientFileExists = true;
                    
                    // Extraire les flags existants du fichier
                    existingFlags = extractFlagsFromContent(existingFileContent);
                    
                    statusDiv.innerHTML = `
                        <span style="color: #34d399;">✅ Fichier trouvé !</span><br>
                        <span style="opacity: 0.7;">${existingFlags.length} flag(s) existant(s) : ${existingFlags.join(', ') || 'aucun'}</span>
                    `;
                } else if (response.status === 404) {
                    clientFileExists = false;
                    existingFlags = [];
                    existingFileContent = '';
                    
                    statusDiv.innerHTML = `
                        <span style="color: #fbbf24;">📄 Fichier non trouvé</span><br>
                        <span style="opacity: 0.7;">Un nouveau fichier complet sera créé avec le client Unleash</span>
                    `;
                } else {
                    throw new Error(`Erreur API: ${response.status}`);
                }
            } catch (error) {
                statusDiv.innerHTML = `<span style="color: #f87171;">❌ Erreur: ${error.message}</span>`;
            }
        }
        
        // Extraire les noms de flags du contenu existant
        function extractFlagsFromContent(content) {
            const flags = [];
            
            // Pattern pour TypeScript/JavaScript : type FeatureFlags = 'flag1' | 'flag2'
            const tsMatch = content.match(/type\s+FeatureFlags\s*=\s*([\s\S]*?);/);
            if (tsMatch) {
                const matches = tsMatch[1].match(/'([^']+)'/g);
                if (matches) {
                    matches.forEach(m => flags.push(m.replace(/'/g, '')));
                }
            }
            
            // Pattern pour Java : enum avec valeurs
            const javaMatch = content.match(/enum\s+FeatureFlags\s*\{([\s\S]*?)\}/);
            if (javaMatch) {
                const matches = javaMatch[1].match(/(\w+)\s*\(/g);
                if (matches) {
                    matches.forEach(m => flags.push(m.replace(/\s*\(/, '')));
                }
            }
            
            // Pattern pour Python : liste ou enum
            const pyMatch = content.match(/FEATURE_FLAGS\s*=\s*\[([\s\S]*?)\]/);
            if (pyMatch) {
                const matches = pyMatch[1].match(/'([^']+)'/g);
                if (matches) {
                    matches.forEach(m => flags.push(m.replace(/'/g, '')));
                }
            }
            
            return flags;
        }
        
        // Générer le contenu complet du fichier client (premier flag)
        function generateFullClientFile(stack, flagName, projectPath) {
            const unleashUrl = `${GITLAB_URL}/api/v4/feature_flags/unleash/${projectId}`;
            
            if (stack === 'angular' || stack === 'react') {
                return `// ═══════════════════════════════════════════════════════════════
// Feature Flags Client - AUTO-GENERATED by DevOps Hub
// Dernière mise à jour: ${new Date().toISOString().split('T')[0]}
// ═══════════════════════════════════════════════════════════════

import { UnleashClient } from 'unleash-proxy-client';

// Configuration Unleash (GitLab Feature Flags)
const unleash = new UnleashClient({
    url: '${unleashUrl}',
    clientKey: process.env.GITLAB_FF_INSTANCE_ID || 'YOUR_INSTANCE_ID',
    appName: '${projectPath || 'my-app'}',
    environment: process.env.NODE_ENV || 'development',
    refreshInterval: 120, // Rafraîchit toutes les 120 secondes
});

// Démarrer le client
unleash.start();

// ═══════════════════════════════════════════════════════════════
// TYPES DES FEATURE FLAGS
// Mis à jour automatiquement par le DevOps Hub
// ═══════════════════════════════════════════════════════════════
type FeatureFlags =
    | '${flagName}';

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Vérifie si un feature flag est activé
 * @param flagName - Le nom du flag à vérifier
 * @returns true si le flag est activé, false sinon
 */
export const isFeatureEnabled = (flagName: FeatureFlags): boolean => {
    return unleash.isEnabled(flagName);
};

/**
 * Vérifie si un feature flag est activé (avec contexte utilisateur)
 * @param flagName - Le nom du flag à vérifier
 * @param userId - L'ID de l'utilisateur pour le ciblage
 * @returns true si le flag est activé pour cet utilisateur
 */
export const isFeatureEnabledForUser = (flagName: FeatureFlags, userId: string): boolean => {
    return unleash.isEnabled(flagName, { userId });
};

// Event listeners pour le debug
unleash.on('ready', () => {
    console.log('✅ Feature Flags client prêt');
});

unleash.on('error', (error: Error) => {
    console.error('❌ Feature Flags erreur:', error);
});

unleash.on('update', () => {
    console.log('🔄 Feature Flags mis à jour');
});

export default unleash;

// ═══════════════════════════════════════════════════════════════
// EXEMPLE D'UTILISATION
// ═══════════════════════════════════════════════════════════════
/*
import { isFeatureEnabled } from './feature-flags';

if (isFeatureEnabled('${flagName}')) {
    // Nouveau comportement
} else {
    // Ancien comportement
}
*/
`;
            } else if (stack === 'java') {
                const className = flagName.split('-').map((w, i) => 
                    i === 0 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
                ).join('_').toUpperCase();
                
                return `package com.lcl.config;

// ═══════════════════════════════════════════════════════════════
// Feature Flags - AUTO-GENERATED by DevOps Hub
// Dernière mise à jour: ${new Date().toISOString().split('T')[0]}
// ═══════════════════════════════════════════════════════════════

import io.getunleash.Unleash;
import io.getunleash.UnleashContext;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Enum des Feature Flags disponibles.
 * Mis à jour automatiquement par le DevOps Hub.
 */
public enum FeatureFlags {
    ${className}("${flagName}");

    private final String key;

    FeatureFlags(String key) {
        this.key = key;
    }

    public String getKey() {
        return key;
    }
}

/**
 * Service pour vérifier les Feature Flags.
 */
@Component
class FeatureFlagService {

    @Autowired
    private Unleash unleash;

    /**
     * Vérifie si un feature flag est activé.
     */
    public boolean isEnabled(FeatureFlags flag) {
        return unleash.isEnabled(flag.getKey());
    }

    /**
     * Vérifie si un feature flag est activé pour un utilisateur.
     */
    public boolean isEnabledForUser(FeatureFlags flag, String userId) {
        UnleashContext context = UnleashContext.builder()
            .userId(userId)
            .build();
        return unleash.isEnabled(flag.getKey(), context);
    }
}

// ═══════════════════════════════════════════════════════════════
// EXEMPLE D'UTILISATION
// ═══════════════════════════════════════════════════════════════
/*
@Autowired
private FeatureFlagService featureFlags;

if (featureFlags.isEnabled(FeatureFlags.${className})) {
    // Nouveau comportement
} else {
    // Ancien comportement
}
*/
`;
            } else if (stack === 'python') {
                return `# ═══════════════════════════════════════════════════════════════
# Feature Flags Client - AUTO-GENERATED by DevOps Hub
# Dernière mise à jour: ${new Date().toISOString().split('T')[0]}
# ═══════════════════════════════════════════════════════════════

import os
from UnleashClient import UnleashClient
from typing import Literal

# Configuration Unleash (GitLab Feature Flags)
unleash_client = UnleashClient(
    url="${unleashUrl}",
    app_name="${projectPath || 'my-app'}",
    instance_id=os.environ.get('GITLAB_FF_INSTANCE_ID', 'YOUR_INSTANCE_ID'),
    refresh_interval=120,
)

# Démarrer le client
unleash_client.initialize_client()

# ═══════════════════════════════════════════════════════════════
# TYPES DES FEATURE FLAGS
# Mis à jour automatiquement par le DevOps Hub
# ═══════════════════════════════════════════════════════════════
FeatureFlags = Literal[
    '${flagName}',
]

FEATURE_FLAGS = [
    '${flagName}',
]

# ═══════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════

def is_feature_enabled(flag_name: FeatureFlags) -> bool:
    """Vérifie si un feature flag est activé."""
    return unleash_client.is_enabled(flag_name)


def is_feature_enabled_for_user(flag_name: FeatureFlags, user_id: str) -> bool:
    """Vérifie si un feature flag est activé pour un utilisateur."""
    context = {'userId': user_id}
    return unleash_client.is_enabled(flag_name, context)


# ═══════════════════════════════════════════════════════════════
# EXEMPLE D'UTILISATION
# ═══════════════════════════════════════════════════════════════
# from config.feature_flags import is_feature_enabled
#
# if is_feature_enabled('${flagName}'):
#     # Nouveau comportement
# else:
#     # Ancien comportement
`;
            }
            
            return '';
        }
        
        // Mettre à jour le fichier existant avec le nouveau flag
        function updateExistingClientFile(content, stack, newFlagName) {
            if (stack === 'angular' || stack === 'react') {
                // Ajouter le nouveau flag au type FeatureFlags
                const typeRegex = /(type\s+FeatureFlags\s*=[\s\S]*?)(\s*;)/;
                const match = content.match(typeRegex);
                if (match) {
                    const newType = match[1] + `\n    | '${newFlagName}'` + match[2];
                    content = content.replace(typeRegex, newType);
                }
                
                // Mettre à jour la date
                content = content.replace(
                    /Dernière mise à jour: \d{4}-\d{2}-\d{2}/,
                    `Dernière mise à jour: ${new Date().toISOString().split('T')[0]}`
                );
                
            } else if (stack === 'java') {
                // Ajouter le nouveau flag à l'enum
                const enumName = newFlagName.split('-').map((w, i) => 
                    i === 0 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
                ).join('_').toUpperCase();
                
                const enumRegex = /(public enum FeatureFlags \{[\s\S]*?)(\s*;[\s\S]*?private final String key)/;
                const match = content.match(enumRegex);
                if (match) {
                    const newEnum = match[1] + `,\n    ${enumName}("${newFlagName}")` + match[2];
                    content = content.replace(enumRegex, newEnum);
                }
                
            } else if (stack === 'python') {
                // Ajouter au Literal
                const literalRegex = /(FeatureFlags = Literal\[[\s\S]*?)(\s*\])/;
                const match = content.match(literalRegex);
                if (match) {
                    const newLiteral = match[1] + `\n    '${newFlagName}',` + match[2];
                    content = content.replace(literalRegex, newLiteral);
                }
                
                // Ajouter à la liste
                const listRegex = /(FEATURE_FLAGS = \[[\s\S]*?)(\s*\])/;
                const listMatch = content.match(listRegex);
                if (listMatch) {
                    const newList = listMatch[1] + `\n    '${newFlagName}',` + listMatch[2];
                    content = content.replace(listRegex, newList);
                }
            }
            
            return content;
        }
        
        // Créer une MR avec le fichier mis à jour
        async function createClientFileMR(filePath, content, flagName, isNewFile) {
            const branchName = `feature/add-flag-${flagName}-${Date.now()}`;
            const commitMessage = isNewFile 
                ? `feat(feature-flags): initialize client with ${flagName}`
                : `feat(feature-flags): add ${flagName} to FeatureFlags type`;
            
            try {
                // 1. Créer la branche
                await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/repository/branches`, {
                    method: 'POST',
                    headers: {
                        'PRIVATE-TOKEN': token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        branch: branchName,
                        ref: 'main'
                    })
                });
                
                // 2. Créer/Mettre à jour le fichier
                const fileAction = isNewFile ? 'create' : 'update';
                const fileResponse = await fetch(
                    `${GITLAB_URL}/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}`,
                    {
                        method: isNewFile ? 'POST' : 'PUT',
                        headers: {
                            'PRIVATE-TOKEN': token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            branch: branchName,
                            content: content,
                            commit_message: commitMessage
                        })
                    }
                );
                
                if (!fileResponse.ok) {
                    const error = await fileResponse.json();
                    throw new Error(error.message || 'Erreur création fichier');
                }
                
                // 3. Créer la MR
                const mrResponse = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/merge_requests`, {
                    method: 'POST',
                    headers: {
                        'PRIVATE-TOKEN': token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        source_branch: branchName,
                        target_branch: 'main',
                        title: `🚩 ${isNewFile ? 'Init' : 'Add'} Feature Flag: ${flagName}`,
                        description: `## 🚩 Feature Flag: \`${flagName}\`

### Changements
${isNewFile 
    ? `- ✨ Création du fichier client Feature Flags
- 📄 Fichier: \`${filePath}\`
- 🔧 Configuration Unleash incluse
- 📝 Types TypeSafe pour les flags`
    : `- ➕ Ajout du flag \`${flagName}\` au type \`FeatureFlags\`
- 📄 Fichier: \`${filePath}\``
}

### Généré automatiquement par le DevOps Hub 🤖

---
⚠️ **Rappel**: Ce flag doit être nettoyé dans **4 semaines maximum**.
`,
                        remove_source_branch: true
                    })
                });
                
                if (mrResponse.ok) {
                    const mrData = await mrResponse.json();
                    return {
                        success: true,
                        mrUrl: mrData.web_url,
                        mrIid: mrData.iid
                    };
                } else {
                    const error = await mrResponse.json();
                    throw new Error(error.message || 'Erreur création MR');
                }
                
            } catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // GÉNÉRATION DE FICHIERS
        // ══════════════════════════════════════════════════════════════════
        async function generateFiles() {
            const flagName = document.getElementById('flag-name').value.trim();
            const description = document.getElementById('flag-description').value.trim();
            const type = document.getElementById('flag-type').value;
            const owner = document.getElementById('flag-owner').value.trim();
            const issue = document.getElementById('flag-issue').value.trim();
            const createInGitLab = document.getElementById('create-in-gitlab').checked;

            if (!flagName || !description || !owner) {
                alert('Remplis tous les champs obligatoires (*)');
                return;
            }

            // Validate name format
            if (!flagName.match(/^(enable|disable)-[a-z0-9-]+$/)) {
                alert('Le nom doit commencer par "enable-" ou "disable-" et être en kebab-case (ex: enable-ma-feature)');
                return;
            }

            const btn = document.getElementById('btn-generate');
            btn.disabled = true;
            btn.textContent = '⏳ Création en cours...';

            // Get selected environments
            const scopes = [];
            if (document.getElementById('env-dev').checked) {
                scopes.push({ environment_scope: 'dev' });
            }
            if (document.getElementById('env-staging').checked) {
                scopes.push({ environment_scope: 'staging' });
            }
            if (document.getElementById('env-prod').checked) {
                scopes.push({ environment_scope: 'production' });
            }
            if (scopes.length === 0) {
                scopes.push({ environment_scope: '*' }); // All environments
            }

            // ══════════════════════════════════════════════════════════════
            // APPEL API GITLAB - Créer le Feature Flag
            // POST /projects/:id/feature_flags
            // ══════════════════════════════════════════════════════════════
            let apiSuccess = false;
            let apiError = null;

            if (createInGitLab) {
                try {
                    const response = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/feature_flags`, {
                        method: 'POST',
                        headers: {
                            'PRIVATE-TOKEN': token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            name: flagName,
                            description: description,
                            version: 'new_version_flag',
                            active: false, // OFF par défaut (selon la doc)
                            strategies: [
                                {
                                    name: 'default',
                                    parameters: {},
                                    scopes: scopes
                                }
                            ]
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        apiSuccess = true;
                        document.getElementById('api-result').innerHTML = `
                            <div class="alert alert-success">
                                <div class="alert-icon">✅</div>
                                <div class="alert-content">
                                    <div class="alert-title">Flag créé dans GitLab !</div>
                                    <div class="alert-text">
                                        <strong>${flagName}</strong> a été créé avec succès (OFF par défaut).<br>
                                        <a href="${GITLAB_URL}/${sessionStorage.getItem('gitlab_project')}/-/feature_flags" target="_blank" style="color: #34d399;">
                                            → Voir dans GitLab
                                        </a>
                                    </div>
                                </div>
                            </div>
                        `;
                    } else {
                        const errorData = await response.json();
                        apiError = errorData.message || errorData.error || `Erreur ${response.status}`;
                        
                        // Check if flag already exists
                        if (response.status === 400 && apiError.includes('already exists')) {
                            document.getElementById('api-result').innerHTML = `
                                <div class="alert alert-warning">
                                    <div class="alert-icon">⚠️</div>
                                    <div class="alert-content">
                                        <div class="alert-title">Flag déjà existant</div>
                                        <div class="alert-text">
                                            Le flag <strong>${flagName}</strong> existe déjà dans GitLab.<br>
                                            Les fichiers sont générés ci-dessous pour référence.
                                        </div>
                                    </div>
                                </div>
                            `;
                        } else {
                            document.getElementById('api-result').innerHTML = `
                                <div class="alert alert-danger">
                                    <div class="alert-icon">❌</div>
                                    <div class="alert-content">
                                        <div class="alert-title">Erreur création GitLab</div>
                                        <div class="alert-text">
                                            ${apiError}<br>
                                            Les fichiers sont générés ci-dessous, tu peux créer le flag manuellement.
                                        </div>
                                    </div>
                                </div>
                            `;
                        }
                    }
                } catch (error) {
                    apiError = error.message;
                    document.getElementById('api-result').innerHTML = `
                        <div class="alert alert-danger">
                            <div class="alert-icon">❌</div>
                            <div class="alert-content">
                                <div class="alert-title">Erreur réseau</div>
                                <div class="alert-text">
                                    ${error.message}<br>
                                    Les fichiers sont générés ci-dessous, tu peux créer le flag manuellement.
                                </div>
                            </div>
                        </div>
                    `;
                }
                document.getElementById('api-result').style.display = 'block';
            }

            // ══════════════════════════════════════════════════════════════
            // GÉNÉRATION DES FICHIERS
            // ══════════════════════════════════════════════════════════════
            const today = new Date().toISOString().split('T')[0];
            const removalDate = new Date();
            removalDate.setDate(removalDate.getDate() + 28);
            const expectedRemoval = removalDate.toISOString().split('T')[0];

            const envList = scopes.map(s => s.environment_scope).join(', ');

            // Generate files
            const files = [];

            // 1. GitLab YAML (documentation)
            files.push({
                name: `.gitlab/feature-flags/${flagName}.yml`,
                icon: '📄',
                language: 'yaml',
                content: `# ═══════════════════════════════════════════════════════════════
# Feature Flag: ${flagName}
# Documentation et tracking (ce fichier est optionnel)
# ═══════════════════════════════════════════════════════════════
---
name: ${flagName}
description: ${description}
type: ${type}
default_enabled: false
owner: ${owner}
created_at: ${today}
expected_removal: ${expectedRemoval}
environments: [${envList}]
${issue ? `rollout_issue_url: ${issue}` : '# rollout_issue_url: '}

# ═══════════════════════════════════════════════════════════════
# RAPPELS (selon la doc)
# ═══════════════════════════════════════════════════════════════
# - Durée de vie MAX : 4 semaines
# - Cleanup OBLIGATOIRE 2 semaines après 100%
# - Flag > 1 mois = DETTE TECHNIQUE
# ═══════════════════════════════════════════════════════════════
`
            });

            // 2. Java/Spring (if selected)
            if (document.getElementById('stack-java').checked) {
                files.push({
                    name: 'Snippet Java - Service',
                    icon: '☕',
                    language: 'java',
                    content: `// ═══════════════════════════════════════════════════════════════
// Utilisation du flag "${flagName}"
// ═══════════════════════════════════════════════════════════════

@Service
public class MonService {

    @Autowired
    private Unleash unleash;

    public ResultType maMethode(RequestType request) {
        if (unleash.isEnabled("${flagName}")) {
            // 🆕 Nouveau comportement (flag ON)
            return nouveauTraitement(request);
        } else {
            // ✅ Ancien comportement (flag OFF) - DOIT FONCTIONNER
            return ancienTraitement(request);
        }
    }
    
    // ───────────────────────────────────────────────────────────────
    // Avec contexte utilisateur (pour ciblage/rollout progressif)
    // ───────────────────────────────────────────────────────────────
    public ResultType maMethodeAvecContexte(RequestType request, User user) {
        UnleashContext context = UnleashContext.builder()
            .userId(user.getId())
            .sessionId(request.getSessionId())
            .addProperty("region", user.getRegion())
            .build();
            
        if (unleash.isEnabled("${flagName}", context)) {
            return nouveauTraitement(request);
        } else {
            return ancienTraitement(request);
        }
    }
}
`
                });
            }

            // 3. Python (if selected)
            if (document.getElementById('stack-python').checked) {
                files.push({
                    name: 'Snippet Python - Endpoint',
                    icon: '🐍',
                    language: 'python',
                    content: `# ═══════════════════════════════════════════════════════════════
# Utilisation du flag "${flagName}"
# ═══════════════════════════════════════════════════════════════

from config.unleash_config import is_enabled

@app.route('/api/ma-route', methods=['POST'])
def ma_route():
    if is_enabled('${flagName}'):
        # 🆕 Nouveau comportement (flag ON)
        return nouveau_traitement()
    else:
        # ✅ Ancien comportement (flag OFF) - DOIT FONCTIONNER
        return ancien_traitement()


# ───────────────────────────────────────────────────────────────
# Avec contexte utilisateur (pour ciblage/rollout progressif)
# ───────────────────────────────────────────────────────────────
@app.route('/api/ma-route-v2', methods=['POST'])
def ma_route_v2():
    context = {
        'userId': current_user.id,
        'sessionId': session.get('id'),
        'properties': {
            'region': current_user.region,
        }
    }
    
    if is_enabled('${flagName}', context):
        return nouveau_traitement()
    else:
        return ancien_traitement()
`
                });
            }

            // 4. Angular (if selected)
            if (document.getElementById('stack-angular').checked) {
                files.push({
                    name: 'Snippet Angular - Component',
                    icon: '🅰️',
                    language: 'typescript',
                    content: `// ═══════════════════════════════════════════════════════════════
// Utilisation du flag "${flagName}"
// ═══════════════════════════════════════════════════════════════

import { Component, OnInit, OnDestroy } from '@angular/core';
import { unleash } from './config/unleash.config';

@Component({
    selector: 'app-mon-component',
    template: \`
        <div *ngIf="showNewFeature">
            <!-- 🆕 Nouveau comportement -->
            <app-new-feature></app-new-feature>
        </div>
        <div *ngIf="!showNewFeature">
            <!-- ✅ Ancien comportement -->
            <app-legacy-feature></app-legacy-feature>
        </div>
    \`
})
export class MonComponent implements OnInit, OnDestroy {
    showNewFeature = false;
    private updateHandler: () => void;

    ngOnInit() {
        // Vérifier l'état initial
        this.showNewFeature = unleash.isEnabled('${flagName}');
        
        // Écouter les changements en temps réel
        this.updateHandler = () => {
            this.showNewFeature = unleash.isEnabled('${flagName}');
        };
        unleash.on('update', this.updateHandler);
    }
    
    ngOnDestroy() {
        // Cleanup listener
        unleash.off('update', this.updateHandler);
    }
}
`
                });
            }

            // 5. Tests Cucumber
            files.push({
                name: 'Tests Cucumber',
                icon: '🥒',
                language: 'gherkin',
                content: `# ═══════════════════════════════════════════════════════════════
# Tests pour le flag "${flagName}"
# Owner: ${owner}
# Created: ${today}
# ═══════════════════════════════════════════════════════════════

@flag-off @legacy @regression
Feature: ${description} - Flag OFF (legacy)
    En tant qu'utilisateur
    Quand le flag "${flagName}" est désactivé
    Je dois avoir le comportement legacy

    Scenario: Comportement legacy quand le flag est désactivé
        Given the feature "${flagName}" is disabled
        And je suis un utilisateur connecté
        When je fais l'action concernée
        Then le comportement legacy est appliqué
        And aucune erreur n'est retournée

# ───────────────────────────────────────────────────────────────

@flag-on @new-feature
Feature: ${description} - Flag ON (nouvelle feature)
    En tant qu'utilisateur
    Quand le flag "${flagName}" est activé
    Je dois avoir le nouveau comportement

    Scenario: Nouveau comportement quand le flag est activé
        Given the feature "${flagName}" is enabled
        And je suis un utilisateur connecté
        When je fais l'action concernée
        Then le nouveau comportement est appliqué
        And aucune erreur n'est retournée

    Scenario: Rollout progressif - utilisateur dans le pourcentage
        Given the feature "${flagName}" is enabled for 50% of users
        And je suis un utilisateur dans le groupe de rollout
        When je fais l'action concernée
        Then le nouveau comportement est appliqué

# ═══════════════════════════════════════════════════════════════
# RAPPEL CLEANUP (Section 11 de la doc)
# ═══════════════════════════════════════════════════════════════
# Quand tu supprimes le flag du code :
#
# 1. ❌ SUPPRIMER ce fichier @flag-off (comportement legacy)
# 2. ♻️ TRANSFORMER @flag-on :
#    - Retirer @flag-on @new-feature
#    - Ajouter @regression ou @smoke
#    - Supprimer "Given the feature X is enabled"
# 3. 🗑️ Supprimer les step definitions du flag si plus utilisées
#
# Code cleanup + Test cleanup = Même MR. TOUJOURS.
# ═══════════════════════════════════════════════════════════════
`
            });

            // Variable pour le rendu des fichiers
            let filesHtml = '';

            // Store files for download (sera mis à jour après sync client)
            window.generatedFiles = files;

            // Reset button initial state
            btn.disabled = false;
            btn.textContent = '🚀 Créer et générer';

            // Refresh dashboard if flag was created
            if (apiSuccess) {
                setTimeout(() => loadFeatureFlags(), 1000);
            }

            // ══════════════════════════════════════════════════════════════
            // SYNCHRONISATION DU FICHIER CLIENT (MR automatique)
            // ══════════════════════════════════════════════════════════════
            const syncClientFile = document.getElementById('sync-client-file').checked;
            
            if (syncClientFile) {
                const clientFilePath = document.getElementById('client-file-path').value.trim();
                const clientStack = document.getElementById('client-file-stack').value;
                
                if (clientFilePath) {
                    btn.textContent = '📄 Création MR fichier client...';
                    
                    let newContent;
                    let isNewFile = !clientFileExists;
                    
                    if (isNewFile) {
                        // Premier flag : créer le fichier complet
                        newContent = generateFullClientFile(clientStack, flagName, sessionStorage.getItem('gitlab_project'));
                    } else {
                        // Fichier existe : mettre à jour le type
                        newContent = updateExistingClientFile(existingFileContent, clientStack, flagName);
                    }
                    
                    if (newContent) {
                        const mrResult = await createClientFileMR(clientFilePath, newContent, flagName, isNewFile);
                        
                        if (mrResult.success) {
                            // Ajouter un fichier "MR créée" dans la liste
                            files.push({
                                name: '🔀 Merge Request créée',
                                icon: '✅',
                                language: 'text',
                                content: `MR créée avec succès !

Titre: 🚩 ${isNewFile ? 'Init' : 'Add'} Feature Flag: ${flagName}
URL: ${mrResult.mrUrl}

${isNewFile 
    ? `Le fichier client complet a été créé avec :
- Configuration Unleash
- Type FeatureFlags avec '${flagName}'
- Helper functions (isFeatureEnabled)
- Exemples d'utilisation`
    : `Le flag '${flagName}' a été ajouté au type FeatureFlags.
Flags existants: ${existingFlags.join(', ')}`
}

⚠️ N'oublie pas de merger cette MR avant d'utiliser le flag dans ton code !`
                            });
                            
                            // Afficher le lien vers la MR
                            document.getElementById('api-result').innerHTML += `
                                <div class="alert alert-success" style="margin-top: 15px;">
                                    <div class="alert-icon">🔀</div>
                                    <div class="alert-content">
                                        <div class="alert-title">MR créée pour le fichier client !</div>
                                        <div class="alert-text">
                                            ${isNewFile ? 'Fichier client initialisé' : 'Type FeatureFlags mis à jour'}<br>
                                            <a href="${mrResult.mrUrl}" target="_blank" style="color: #34d399; font-weight: bold;">
                                                → Voir la MR #${mrResult.mrIid}
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            `;
                        } else {
                            document.getElementById('api-result').innerHTML += `
                                <div class="alert alert-warning" style="margin-top: 15px;">
                                    <div class="alert-icon">⚠️</div>
                                    <div class="alert-content">
                                        <div class="alert-title">MR non créée</div>
                                        <div class="alert-text">
                                            ${mrResult.error}<br>
                                            Le contenu du fichier est disponible ci-dessous pour copie manuelle.
                                        </div>
                                    </div>
                                </div>
                            `;
                            
                            // Ajouter le fichier généré pour copie manuelle
                            files.push({
                                name: `📄 ${clientFilePath}`,
                                icon: isNewFile ? '✨' : '📝',
                                language: clientStack === 'java' ? 'java' : clientStack === 'python' ? 'python' : 'typescript',
                                content: newContent
                            });
                        }
                    }
                }
            }

            // Re-render files list with potential new files
            filesHtml = '';
            files.forEach((file, index) => {
                filesHtml += `
                    <div class="file-card" id="file-${index}">
                        <div class="file-card-header" onclick="toggleFileCard(${index})">
                            <div class="file-card-title">
                                <span>${file.icon}</span>
                                <span>${file.name}</span>
                            </div>
                            <div class="file-card-actions">
                                <button class="btn-small" onclick="event.stopPropagation(); copyFileContent(${index})">📋 Copier</button>
                            </div>
                        </div>
                        <div class="file-card-content">
                            <pre class="code-block">${escapeHtml(file.content)}</pre>
                        </div>
                    </div>
                `;
            });
            document.getElementById('files-list').innerHTML = filesHtml;
            document.getElementById('generated-files').style.display = 'block';
            
            // Update stored files for download
            window.generatedFiles = files;
        }

        function toggleFileCard(index) {
            document.getElementById(`file-${index}`).classList.toggle('open');
        }

        function copyFileContent(index) {
            const content = window.generatedFiles[index].content;
            navigator.clipboard.writeText(content).then(() => {
                alert('Copié !');
            });
        }

        // downloadAll (ZIP) retiré : la fonction était un stub `alert("à venir")`.
        // Si le besoin remonte un jour, utiliser JSZip (CDN) pour construire un
        // ZIP côté client à partir de `window.generatedFiles`.

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // ══════════════════════════════════════════════════════════════════
        // RBAC & APPROVALS — DÉSACTIVÉ POUR LE BAC À SABLE
        // ══════════════════════════════════════════════════════════════════
        // Le RBAC reposait sur un `currentUserRole: 'ADMIN'` hardcodé sans lien
        // avec un vrai JWT/session. Les approbations étaient stockées uniquement
        // en localStorage côté client (donc contournables). Tant que LCL n'a pas
        // câblé un vrai système d'auth pour ce module, on retire ces fonctionnalités
        // pour éviter de laisser croire qu'elles sont en service.
        //
        // À réactiver : remettre RBAC_CONFIG avec un appel /user GitLab pour
        // résoudre currentUserRole, brancher un backend pour les approbations
        // (table BDD ou GitLab issues comme transport), restaurer les tabs HTML.
        // ══════════════════════════════════════════════════════════════════

        // `logAudit` est conservé en stub (no-op) : plusieurs handlers de toggle
        // l'appellent encore. La vraie source d'audit est GitLab via /audit_events
        // (cf. fetchFeatureFlagAuditEvents plus bas). Garder ce stub évite de devoir
        // toucher à tous les call sites.
        function logAudit() { /* no-op : audit GitLab natif utilisé à la place */ }

        // ══════════════════════════════════════════════════════════════════
        // HISTORIQUE — source de vérité : GitLab /audit_events (Premium)
        //   + état courant de chaque FF depuis currentFlags
        // ══════════════════════════════════════════════════════════════════

        const AUDIT_EVENTS_CACHE = {
            byFlag: null,        // Map<flagName, Event[]>  (events triés desc par date)
            total: 0,
            fetchedAt: null,
            error: null
        };

        // Fetch paginé des audit events, filtré sur Operations::FeatureFlag
        async function fetchFeatureFlagAuditEvents() {
            const MAX_PAGES = 5;
            const PER_PAGE = 100;
            const all = [];

            for (let page = 1; page <= MAX_PAGES; page++) {
                const url = `${GITLAB_URL}/api/v4/projects/${projectId}/audit_events?per_page=${PER_PAGE}&page=${page}`;
                const res = await fetch(url, { headers: { 'PRIVATE-TOKEN': token } });

                if (!res.ok) {
                    if (res.status === 403) {
                        throw new Error('Accès refusé aux audit events (nécessite rôle Maintainer/Owner + GitLab Premium sur le projet).');
                    }
                    if (res.status === 404) {
                        throw new Error('Endpoint audit_events indisponible sur ce projet.');
                    }
                    throw new Error(`Audit events API : HTTP ${res.status}`);
                }

                const batch = await res.json();
                all.push(...batch);
                if (batch.length < PER_PAGE) break;
            }

            return all.filter(ev =>
                ev && ev.details && ev.details.target_type === 'Operations::FeatureFlag'
            );
        }

        function groupAuditEventsByFlag(events) {
            const map = new Map();
            events.forEach(ev => {
                const name = ev.details && ev.details.target_details;
                if (!name) return;
                if (!map.has(name)) map.set(name, []);
                map.get(name).push(ev);
            });
            map.forEach(list => list.sort((a, b) =>
                new Date(b.created_at) - new Date(a.created_at)
            ));
            return map;
        }

        async function loadAuditHistory() {
            const container = document.getElementById('history-list');
            const meta = document.getElementById('history-meta');
            if (!container) return;

            container.innerHTML = `
                <div class="empty-state"><div class="loading-spinner"></div>
                <p style="margin-top:16px;">Chargement depuis GitLab audit events…</p></div>`;
            if (meta) meta.textContent = '';

            try {
                const events = await fetchFeatureFlagAuditEvents();
                AUDIT_EVENTS_CACHE.byFlag = groupAuditEventsByFlag(events);
                AUDIT_EVENTS_CACHE.total = events.length;
                AUDIT_EVENTS_CACHE.fetchedAt = new Date();
                AUDIT_EVENTS_CACHE.error = null;

                if (meta) {
                    const n = events.length;
                    meta.textContent = `${n} événement${n > 1 ? 's' : ''} GitLab · chargé à ${AUDIT_EVENTS_CACHE.fetchedAt.toLocaleTimeString('fr-FR')}`;
                }
                renderFlagHistoryList();
            } catch (err) {
                AUDIT_EVENTS_CACHE.byFlag = null;
                AUDIT_EVENTS_CACHE.error = err.message;
                // Fallback doux : on rend quand même la liste des flags sans events
                renderFlagHistoryList();
                if (meta) {
                    meta.innerHTML = `<span style="color:var(--yellow);">⚠️ ${escapeHtml(err.message)} — affichage limité aux dates created_at / updated_at.</span>`;
                }
            }
        }
        
        function renderFlagHistoryList() {
            const container = document.getElementById('history-list');
            if (!container) return;

            populateEnvFilter();

            const search      = (document.getElementById('history-search')?.value || '').toLowerCase().trim();
            const envFilter   = document.getElementById('history-filter-env')?.value    || '';
            const statusFilter= document.getElementById('history-filter-status')?.value || '';

            // 1) Flags actuels (depuis currentFlags)
            const rows = [];
            const seen = new Set();

            (currentFlags || []).forEach(f => {
                seen.add(f.name);
                const envs = extractEnvironmentsFromFlag(f);
                rows.push({
                    name: f.name,
                    exists: true,
                    active: !!f.active,
                    envs: envs.length ? envs : ['*'],
                    events: (AUDIT_EVENTS_CACHE.byFlag && AUDIT_EVENTS_CACHE.byFlag.get(f.name)) || [],
                    created_at: f.created_at,
                    updated_at: f.updated_at
                });
            });

            // 2) Flags supprimés (présents dans l'audit mais plus dans currentFlags)
            if (AUDIT_EVENTS_CACHE.byFlag) {
                AUDIT_EVENTS_CACHE.byFlag.forEach((events, name) => {
                    if (seen.has(name)) return;
                    rows.push({
                        name,
                        exists: false,
                        active: false,
                        envs: [],
                        events,
                        created_at: null,
                        updated_at: events[0] && events[0].created_at
                    });
                });
            }

            // Filtres
            const filtered = rows.filter(r => {
                if (search && !r.name.toLowerCase().includes(search)) return false;
                if (envFilter && !r.envs.includes(envFilter)) return false;
                if (statusFilter === 'active'   && !(r.exists && r.active))   return false;
                if (statusFilter === 'inactive' && !(r.exists && !r.active)) return false;
                if (statusFilter === 'deleted'  && r.exists)                  return false;
                return true;
            });

            // Tri : dernière activité décroissante
            filtered.sort((a, b) => {
                const ta = new Date(a.updated_at || a.created_at || 0).getTime();
                const tb = new Date(b.updated_at || b.created_at || 0).getTime();
                return tb - ta;
            });

            if (filtered.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center;padding:40px 20px;color:var(--text3);">
                        <div style="font-size:48px;margin-bottom:12px;">📜</div>
                        <p>Aucun flag correspondant</p>
                    </div>`;
                return;
            }

            container.innerHTML = filtered.map(renderFlagHistoryRow).join('');
        }

        function renderFlagHistoryRow(r) {
            const envBadges = r.envs.length
                ? r.envs.map(e => `<span class="ff-env-badge ${envBadgeClass(e)}">${escapeHtml(e)}</span>`).join('')
                : '<span class="ff-env-badge all" style="opacity:0.5;">—</span>';

            let statusPill;
            if (!r.exists) {
                statusPill = `<span class="ff-status-pill deleted">Supprimé</span>`;
            } else {
                statusPill = `<span class="ff-status-pill ${r.active ? 'active' : 'inactive'}">${r.active ? 'Actif' : 'Inactif'}</span>`;
            }

            const count = r.events.length;
            const countLabel = count === 0 ? 'pas d\'événement' : `${count} événement${count > 1 ? 's' : ''}`;

            // Construction du corps (events)
            let eventsHtml;
            if (count === 0) {
                // Fallback : created_at / updated_at de l'API feature_flags
                const fb = [];
                if (r.created_at) fb.push({
                    cls: 'create', label: '➕ Création (fallback)',
                    when: r.created_at, detail: 'Aucun audit event trouvé — date depuis l\'API feature_flags. Auteur indisponible.'
                });
                if (r.updated_at && r.updated_at !== r.created_at) fb.push({
                    cls: 'update', label: '✏️ Dernière modification (fallback)',
                    when: r.updated_at, detail: 'Auteur indisponible (hors audit events Premium).'
                });
                if (fb.length === 0) {
                    eventsHtml = '<div class="ff-history-empty-events">Aucun événement disponible pour ce flag.</div>';
                } else {
                    eventsHtml = `<div class="ff-event-list">${fb.map(f => `
                        <div class="ff-event ${f.cls}">
                            <div class="ff-event-head">
                                <span class="ff-event-action">${f.label}</span>
                                <span class="ff-event-when">${escapeHtml(formatDateTime(f.when))}</span>
                            </div>
                            <div class="ff-event-detail">${escapeHtml(f.detail)}</div>
                        </div>`).join('')}</div>`;
                }
            } else {
                eventsHtml = `<div class="ff-event-list">${r.events.map(ev => {
                    const act    = classifyAuditAction(ev);
                    const author = ev.author_name || (ev.details && ev.details.author_name) || 'inconnu';
                    const msg    = (ev.details && ev.details.custom_message) || '';
                    return `
                        <div class="ff-event ${act.key}">
                            <div class="ff-event-head">
                                <span class="ff-event-action">${act.emoji} ${act.label}</span>
                                <span class="ff-event-when">${escapeHtml(formatDateTime(ev.created_at))}</span>
                            </div>
                            <span class="ff-event-who">👤 ${escapeHtml(author)}</span>
                            ${msg ? `<div class="ff-event-detail">${escapeHtml(msg)}</div>` : ''}
                        </div>`;
                }).join('')}</div>`;
            }

            return `
                <div class="ff-history-row">
                    <div class="ff-history-head" onclick="toggleFlagHistoryRow(this)">
                        <span class="ff-history-caret">▶</span>
                        <span class="ff-history-name">${escapeHtml(r.name)}</span>
                        <span class="ff-history-envs">${envBadges}</span>
                        ${statusPill}
                        <span class="ff-event-count">${countLabel}</span>
                    </div>
                    <div class="ff-history-body">${eventsHtml}</div>
                </div>`;
        }

        function toggleFlagHistoryRow(headEl) {
            const row = headEl.closest('.ff-history-row');
            if (row) row.classList.toggle('open');
        }

        function filterAuditHistory() {
            renderFlagHistoryList();
        }

        // Helpers spécifiques à l'historique
        function extractEnvironmentsFromFlag(flag) {
            const scopes = new Set();
            (flag.strategies || []).forEach(s => {
                (s.scopes || []).forEach(sc => {
                    if (sc && sc.environment_scope) scopes.add(sc.environment_scope);
                });
            });
            return Array.from(scopes);
        }

        function populateEnvFilter() {
            const sel = document.getElementById('history-filter-env');
            if (!sel) return;
            // Collecte tous les scopes présents dans currentFlags (source de vérité, pareil que l'onglet Flags)
            const set = new Set();
            (currentFlags || []).forEach(f => {
                extractEnvironmentsFromFlag(f).forEach(e => set.add(e));
            });
            // Tri par ordre de risque (du plus tech vers la prod), puis alphabétique pour les inconnus
            const ORDER = ['integration', 'demo', 'master', 'uat', 'pilote', 'production', '*'];
            const rank = v => {
                const i = ORDER.indexOf((v || '').toLowerCase());
                return i === -1 ? 999 : i;
            };
            const scopes = Array.from(set).sort((a, b) => {
                const ra = rank(a), rb = rank(b);
                if (ra !== rb) return ra - rb;
                return String(a).localeCompare(String(b));
            });
            // Si la liste actuelle a déjà exactement les mêmes options, on ne reconstruit pas (sinon on écrase la sélection)
            const existing = Array.from(sel.options).slice(1).map(o => o.value);
            const same = existing.length === scopes.length && existing.every((v, i) => v === scopes[i]);
            if (same) return;
            const current = sel.value;
            sel.innerHTML = '<option value="">Tous environnements</option>'
                + scopes.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
            // Restaure la sélection si encore valide
            if (scopes.includes(current)) sel.value = current;
        }

        function envBadgeClass(env) {
            const e = (env || '').toLowerCase().trim();
            // Mapping explicite LCL (ordre du plus "live" au plus tech)
            if (e === 'production' || e === 'prod')      return 'prod';
            if (e === 'pilote'     || e === 'pilot')     return 'pilote';
            if (e === 'uat')                              return 'uat';
            if (e === 'master')                           return 'master';
            if (e === 'demo')                             return 'demo';
            if (e === 'integration' || e === 'integ')     return 'integration';
            if (e === '*' || e === 'all')                 return 'all';
            // Fallbacks historiques (autres projets GitLab qu'on pourrait croiser)
            if (e.includes('prod'))                       return 'prod';
            if (e.includes('stag') || e === 'preprod')    return 'staging';
            if (e.includes('dev')  || e.includes('test')) return 'dev';
            return '';
        }

        function classifyAuditAction(ev) {
            const raw = (ev && ev.details && (ev.details.custom_message || ev.details.change || '')) || '';
            const m = raw.toLowerCase();
            if (m.includes('created')   || m.includes('créé'))      return { key: 'create',  emoji: '➕', label: 'Création' };
            if (m.includes('destroyed') || m.includes('deleted')
                || m.includes('supprim'))                           return { key: 'delete',  emoji: '🗑️', label: 'Suppression' };
            if (m.includes('enabled')   || m.includes('activ'))     return { key: 'enable',  emoji: '🟢', label: 'Activation' };
            if (m.includes('disabled')  || m.includes('désactiv'))  return { key: 'disable', emoji: '🟡', label: 'Désactivation' };
            return { key: 'update', emoji: '✏️', label: 'Modification' };
        }

        function formatDateTime(iso) {
            try {
                const d = new Date(iso);
                if (isNaN(d.getTime())) return String(iso || '');
                return d.toLocaleString('fr-FR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
            } catch { return String(iso || ''); }
        }
        


        // ══════════════════════════════════════════════════════════════════
        // SCORE SANTÉ HISTORIQUE
        // ══════════════════════════════════════════════════════════════════

        function getHealthStorageKey() {
            return 'ff_health_history_' + (projectId || 'default');
        }

        function saveHealthScore(score) {
            try {
                var key = getHealthStorageKey();
                var history = JSON.parse(localStorage.getItem(key) || '[]');
                var now = Date.now();
                // Ne sauvegarder qu'une fois par heure max
                var last = history[history.length - 1];
                if (last && (now - last.t) < 3600000) {
                    // Mettre à jour le dernier point si même heure
                    last.s = score;
                } else {
                    history.push({ t: now, s: score });
                }
                // Garder 30 jours max (720 entrées si toutes les heures)
                var cutoff = now - 30 * 24 * 3600000;
                history = history.filter(function(e) { return e.t >= cutoff; });
                localStorage.setItem(key, JSON.stringify(history));
            } catch(e) {}
        }

        function loadHealthHistory() {
            try {
                var key = getHealthStorageKey();
                return JSON.parse(localStorage.getItem(key) || '[]');
            } catch(e) { return []; }
        }

        function computeHealthTrend(history) {
            if (history.length < 2) return null;
            var now = Date.now();
            var week7 = now - 7 * 24 * 3600000;
            // Score actuel (dernier point)
            var current = history[history.length - 1].s;
            // Score il y a 7 jours (premier point >= 7j ago)
            var old7 = null;
            for (var i = 0; i < history.length; i++) {
                if (history[i].t >= week7) { break; }
                old7 = history[i].s;
            }
            if (old7 === null && history.length > 1) old7 = history[0].s;
            return old7 !== null ? current - old7 : null;
        }

        function drawHealthSparkline(history, currentScore) {
            var canvas = document.getElementById('health-sparkline');
            if (!canvas || history.length < 2) return;
            var ctx = canvas.getContext('2d');
            var W = canvas.width = canvas.parentElement.offsetWidth || 200;
            var H = canvas.height = 44;
            ctx.clearRect(0, 0, W, H);

            // Agréger par jour pour lisibilité
            var now = Date.now();
            var days = 30;
            var buckets = [];
            for (var d = days - 1; d >= 0; d--) {
                var dayStart = now - (d + 1) * 86400000;
                var dayEnd   = now - d * 86400000;
                var pts = history.filter(function(e) { return e.t >= dayStart && e.t < dayEnd; });
                if (pts.length > 0) {
                    var avg = Math.round(pts.reduce(function(a,b){ return a + b.s; }, 0) / pts.length);
                    buckets.push({ day: days - d, score: avg });
                }
            }
            // Ajouter le point actuel
            buckets.push({ day: days + 1, score: currentScore });
            if (buckets.length < 2) return;

            var minS = Math.min.apply(null, buckets.map(function(b){ return b.s; }));
            var maxS = Math.max.apply(null, buckets.map(function(b){ return b.s; }));
            if (maxS === minS) { maxS = minS + 10; minS = Math.max(0, minS - 10); }

            var pad = 4;
            var n = buckets.length;

            function px(i) { return pad + (i / (n - 1)) * (W - pad * 2); }
            function py(s) { return H - pad - ((s - minS) / (maxS - minS)) * (H - pad * 2); }

            // Fill gradient
            ctx.beginPath();
            ctx.moveTo(px(0), py(buckets[0].score));
            for (var i = 1; i < n; i++) ctx.lineTo(px(i), py(buckets[i].score));
            ctx.lineTo(px(n - 1), H);
            ctx.lineTo(px(0), H);
            ctx.closePath();
            var grad = ctx.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, 'rgba(124,92,252,0.35)');
            grad.addColorStop(1, 'rgba(124,92,252,0.02)');
            ctx.fillStyle = grad;
            ctx.fill();

            // Line
            ctx.beginPath();
            ctx.moveTo(px(0), py(buckets[0].score));
            for (var j = 1; j < n; j++) ctx.lineTo(px(j), py(buckets[j].score));
            ctx.strokeStyle = 'rgba(167,139,250,0.8)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Last dot
            var lx = px(n - 1), ly = py(currentScore);
            ctx.beginPath();
            ctx.arc(lx, ly, 3, 0, Math.PI * 2);
            var dotColor = currentScore >= 80 ? '#6ee7b7' : currentScore >= 60 ? '#fcd34d' : '#fca5a5';
            ctx.fillStyle = dotColor;
            ctx.fill();
        }

        function renderHealthHistory(score) {
            saveHealthScore(score);
            var history = loadHealthHistory();
            var trend = computeHealthTrend(history);
            var trendEl = document.getElementById('health-trend');
            if (trendEl) {
                if (trend === null) {
                    trendEl.innerHTML = '<span style="color:var(--text3);font-size:11px;">Première mesure</span>';
                } else if (trend > 0) {
                    trendEl.innerHTML = '<span style="color:#6ee7b7;font-size:12px;font-weight:700;">↑ +' + trend + ' pts</span> <span style="color:var(--text3);font-size:10px;">vs 7j</span>';
                } else if (trend < 0) {
                    trendEl.innerHTML = '<span style="color:#fca5a5;font-size:12px;font-weight:700;">↓ ' + trend + ' pts</span> <span style="color:var(--text3);font-size:10px;">vs 7j</span>';
                } else {
                    trendEl.innerHTML = '<span style="color:var(--text3);font-size:12px;">→ stable</span> <span style="color:var(--text3);font-size:10px;">vs 7j</span>';
                }
            }
            // Sparkline
            setTimeout(function() { drawHealthSparkline(history, score); }, 50);
        }

        function goToFlagsTab() { var t = document.querySelector('[data-tab="flags"]'); if(t) t.click(); }

        // CLEANUP WIZARD

        // CLEANUP WIZARD
        function cwGoTo(step) {
            document.querySelectorAll('.cw-panel').forEach((p, i) => {
                p.classList.toggle('active', i + 1 === step);
            });
            document.querySelectorAll('.cw-step').forEach((dot, i) => {
                dot.classList.remove('active', 'done');
                if (i + 1 < step) dot.classList.add('done');
                if (i + 1 === step) dot.classList.add('active');
            });
        }

        async function cwToggleAction(activate) {
            if (!currentCleanupFlag) return;
            const flag = currentFlags.find(f => f.name === currentCleanupFlag);
            document.getElementById('cw-btn-deactivate').classList.toggle('selected', !activate);
            document.getElementById('cw-btn-activate').classList.toggle('selected', activate);
            if (flag && hasProdScope(flag)) {
                const dlg = document.getElementById('cleanup-modal');
                if (dlg && dlg.open) dlg.close();
                _pendingToggle = { flagName: currentCleanupFlag, activate, toggleEl: { closest: () => null } };
                showProdConfirm(currentCleanupFlag, activate, flag);
                window._cwPendingAction = { flagName: currentCleanupFlag, activate };
                const origConfirm = confirmProdToggle;
                window.confirmProdToggle = async function() {
                    window.confirmProdToggle = origConfirm;
                    const pcm = document.getElementById('pcm-dialog');
                    if (pcm) { pcm.close(); pcm.remove(); }
                    if (!window._cwPendingAction) return;
                    const { flagName, activate } = window._cwPendingAction;
                    window._cwPendingAction = null;
                    _pendingToggle = null;
                    const dlg2 = document.getElementById('cleanup-modal');
                    if (dlg2 && !dlg2.open) dlg2.showModal();
                    cwGoTo(2);
                    await cwExecuteToggle(flagName, activate);
                };
            } else {
                await cwExecuteToggle(currentCleanupFlag, activate);
            }
        }

        async function cwExecuteToggle(flagName, activate) {
            const resultEl = document.getElementById('modal-api-result');
            resultEl.style.display = 'block';
            resultEl.innerHTML = '<div class="alert alert-info"><div class="alert-icon">⏳</div><div class="alert-content"><div class="alert-title">En cours...</div></div></div>';
            try {
                const response = await fetch(GITLAB_URL + '/api/v4/projects/' + projectId + '/feature_flags/' + encodeURIComponent(flagName), {
                    method: 'PUT',
                    headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ active: activate })
                });
                if (!response.ok) throw new Error((await response.json()).message || 'Erreur ' + response.status);
                logAudit('UPDATE', flagName, { active: !activate }, { active: activate },
                    (activate ? 'Activation' : 'Desactivation') + ' via wizard PO');
                const icon = activate ? '🟢' : '⏸️';
                const word = activate ? 'activé' : 'désactivé';
                const state = activate ? 'ON' : 'OFF';
                resultEl.innerHTML = '<div class="alert alert-success"><div class="alert-icon">' + icon + '</div><div class="alert-content"><div class="alert-title">Flag ' + word + ' avec succès</div><div class="alert-text"><strong>' + flagName + '</strong> est maintenant <strong>' + state + '</strong>.</div></div></div>';
                setTimeout(function() { cwGoTo(3); setTimeout(function() { loadFeatureFlags(); }, 500); }, 1200);
            } catch (err) {
                resultEl.innerHTML = '<div class="alert alert-danger"><div class="alert-icon">❌</div><div class="alert-content"><div class="alert-title">Erreur</div><div class="alert-text">' + err.message + '</div></div></div>';
            }
        }

        function cwUpdateChecklistStatus() {
            const items = document.querySelectorAll('#cleanup-checklist .checklist-item');
            const checked = document.querySelectorAll('#cleanup-checklist .checklist-item.checked');
            const el = document.getElementById('cw-checklist-status');
            if (!el) return;
            el.textContent = checked.length + '/' + items.length + ' étapes complétées';
            el.classList.toggle('complete', checked.length === items.length);
        }

        // ══════════════════════════════════════════════════════════════════
        // UPDATE KPIs
        // ══════════════════════════════════════════════════════════════════
        function updateKPIs() {
            const featureFlags = currentFlags.filter(f => !f.isOpsFlag);
            const critique     = currentFlags.filter(f => f.status === 'CRITIQUE');
            const dette        = currentFlags.filter(f => f.status === 'DETTE');
            const rollout      = currentFlags.filter(f => f.status === 'ROLLOUT');
            const toClean      = currentFlags.filter(f => f.priority >= 2 && !f.isOpsFlag);

            function set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

            set('kpi-total',    featureFlags.length + '/10');
            set('kpi-rollout',  rollout.length);
            set('kpi-dette',    dette.length);
            set('kpi-critique', critique.length);

            const critSub = document.getElementById('kpi-critique-sub');
            if (critSub) critSub.textContent = critique.length > 0 ? '⚠ Action requise' : 'Aucun';

            const detteSub = document.getElementById('kpi-dette-sub');
            if (detteSub) detteSub.textContent = dette.length > 0 ? dette.length + ' à traiter' : 'Aucun';

            const totalSub = document.getElementById('kpi-total-sub');
            if (totalSub) {
                const rem = 10 - featureFlags.length;
                totalSub.textContent = rem > 0 ? rem + ' slots disponibles' : '⚠ Quota atteint';
            }

            // Badges tabs
            const cb = document.getElementById('cleanup-badge');
            if (cb) { cb.textContent = toClean.length; cb.style.display = toClean.length > 0 ? 'inline-block' : 'none'; }
            const fb = document.getElementById('flags-badge');
            if (fb) fb.textContent = currentFlags.length;

            // Header
            const syncDot   = document.getElementById('syncDot');
            const syncLabel = document.getElementById('syncLabel');
            if (syncDot)   syncDot.style.display = 'inline-block';
            if (syncLabel) syncLabel.textContent  = 'Sync auto';

            // GitLab link
            const btnGitlab = document.getElementById('btnViewGitlab');
            if (btnGitlab && GITLAB_URL) {
                btnGitlab.href = `${GITLAB_URL}/${sessionStorage.getItem('gitlab_project')}/-/feature_flags`;
            }
        }



        // ══════════════════════════════════════════════════════════════════
        // FLAGS TABLE — sort + render
        // ══════════════════════════════════════════════════════════════════
        let _flagFilter  = '';
        let _flagSortCol = 'age';
        let _flagSortDir = 'desc'; // 'asc' | 'desc'

        // ── Regroupement par famille (clustering souple) ──────────────────
        let _flagFamily  = '';     // famille sélectionnée dans le dropdown ('' = toutes)
        let _flagGrouped = false;  // mode "vue groupée" (accordéon par famille)
        let _familyCache = null;   // résultat de computeFlagGroups, recalculé au load
        let _collapsedFamilies = new Set(); // labels de familles repliées

        const STATUS_ORDER = { CRITIQUE:0, DETTE:1, CLEANUP:2, STABILISATION:3, ROLLOUT:4, OPS:5 };

        // ══════════════════════════════════════════════════════════════════
        // AUTO-GROUPING — clustering par tokens communs (zéro nom hardcodé)
        // Matching SOUPLE : on cherche les sous-séquences de tokens partagées,
        // pas seulement les préfixes. Ex: "enable_blocking_legal_representant"
        // et "enable_legal_representant_profile_100" partagent "legal_representant"
        // même si ce n'est pas en tête de nom.
        // ══════════════════════════════════════════════════════════════════

        // Tokens "vides" qui ne servent pas à identifier une famille
        const _FAMILY_STOPWORDS = new Set(['enable','disable','not','no','is','the','a','to','of','with','on','off','v1','v2','v3']);

        function tokenizeFlag(name) {
            return String(name || '')
                .toLowerCase()
                .split(/[_\-\s]+/)
                .filter(Boolean);
        }

        // Tokens significatifs : on retire les mots-outils (enable/disable/...) AVANT
        // de chercher les racines, sinon "enable_legal_representant" (3 tokens) bat
        // "legal_representant" (2 tokens) au tri "plus spécifique" et casse le regroupement.
        function meaningfulTokens(name) {
            return tokenizeFlag(name).filter(t => !_FAMILY_STOPWORDS.has(t));
        }

        // Toutes les sous-séquences CONTIGUËS de tokens (n-grammes), longueur >= minLen
        function tokenNgrams(tokens, minLen) {
            const out = [];
            const n = tokens.length;
            for (let len = Math.min(n, 5); len >= minLen; len--) {
                for (let i = 0; i + len <= n; i++) {
                    out.push(tokens.slice(i, i + len).join(' '));
                }
            }
            return out;
        }

        function prettyFamilyLabel(key) {
            return key.split(' ').join('_');
        }

        // Renvoie [{ label, key, flags:[...] }, ...] trié par taille décroissante.
        // minGroupSize : nb mini de flags pour former une famille (défaut 2)
        // minTokens    : longueur mini d'un n-gramme pour être une racine (défaut 2)
        // Mots mono-token trop génériques pour être une racine de famille à eux seuls.
        // (on les autorise seulement dans une racine de >= 2 tokens)
        const _FAMILY_GENERIC = new Set(['tile','page','profile','display','redirection','operations','template','mail','last','new','old','default','test','flag','feature','user','users']);

        function computeFlagGroups(flags, opts) {
            opts = opts || {};
            const minGroupSize = opts.minGroupSize || 2;
            const minTokens    = opts.minTokens    || 1;  // 1 token OK si distinctif

            // Une racine mono-token n'est valable que si elle est distinctive :
            // au moins 4 caractères ET pas dans la liste des mots génériques.
            function rootIsValid(key) {
                const toks = key.split(' ');
                if (toks.length >= 2) return true;
                const t = toks[0];
                return t.length >= 4 && !_FAMILY_GENERIC.has(t);
            }

            // 1) index : ngram -> set de noms de flags qui le contiennent
            const byNgram = new Map(); // key -> { tokens:int, names:Set }
            const flagTokens = new Map();
            flags.forEach(f => {
                const toks = meaningfulTokens(f.name);
                flagTokens.set(f.name, toks);
                const seen = new Set(); // un ngram compté 1x par flag même s'il apparait 2x
                tokenNgrams(toks, minTokens).forEach(ng => {
                    if (seen.has(ng)) return;
                    seen.add(ng);
                    if (!byNgram.has(ng)) byNgram.set(ng, { tokens: ng.split(' ').length, names: new Set() });
                    byNgram.get(ng).names.add(f.name);
                });
            });

            // 2) candidats : ngrams partagés par >= minGroupSize flags ET racine valide
            let candidates = [...byNgram.entries()]
                .filter(([key, v]) => v.names.size >= minGroupSize && rootIsValid(key))
                .map(([key, v]) => ({ key, tokens: v.tokens, names: v.names }));

            // 3) on classe les racines par SCORE DE COUVERTURE = membres × longueur.
            //    Une racine courte qui ratisse large (ex: "predica", 3 flags) peut ainsi
            //    battre une racine longue qui n'en capte que 2 ("predica product tile").
            //    À score égal, on préfère la racine la plus spécifique (plus de tokens),
            //    puis le plus de membres, puis l'ordre alpha (déterminisme).
            candidates.sort((a, b) => {
                const sa = a.names.size * a.tokens;
                const sb = b.names.size * b.tokens;
                return (sb - sa) || (b.tokens - a.tokens) || (b.names.size - a.names.size) || a.key.localeCompare(b.key);
            });

            // 4) assignation gloutonne : chaque flag rejoint sa racine la plus spécifique
            const byName = new Map(flags.map(f => [f.name, f]));
            const assigned = new Set();
            const groups = [];
            candidates.forEach(c => {
                const members = [...c.names].filter(n => !assigned.has(n));
                if (members.length >= minGroupSize) {
                    members.forEach(n => assigned.add(n));
                    groups.push({
                        label: prettyFamilyLabel(c.key),
                        key: c.key,
                        flags: members.map(n => byName.get(n)).filter(Boolean)
                    });
                }
            });

            // 5) DEUXIÈME PASSAGE — rattachement des orphelins.
            //    Un flag isolé peut partager une racine (>= minTokens tokens) avec une
            //    famille existante sans avoir été capté par la racine la plus dense.
            //    Ex : "blocking_legal_representant" partage "legal_representant" avec la
            //    famille "legal_representant_profile" -> on le rattache.
            //    On rattache au meilleur match (racine commune la plus longue).
            let orphans = flags.filter(f => !assigned.has(f.name));
            orphans.forEach(f => {
                const fToks = new Set(meaningfulTokens(f.name));
                let best = null, bestOverlap = 0;
                groups.forEach(g => {
                    const gToks = g.key.split(' ');
                    // tokens de la racine de la famille présents dans le flag
                    const common = gToks.filter(t => fToks.has(t));
                    let overlap = common.length;
                    // un overlap d'1 seul token doit être distinctif (>=4 car, non générique)
                    if (overlap === 1 && !rootIsValid(common[0])) overlap = 0;
                    if (overlap >= 1 && overlap > bestOverlap) {
                        bestOverlap = overlap; best = g;
                    }
                });
                if (best) { best.flags.push(byName.get(f.name)); assigned.add(f.name); }
            });

            // 6) orphelins restants
            orphans = flags.filter(f => !assigned.has(f.name));
            if (orphans.length) {
                groups.push({ label: '∅ Isolés', key: '__orphans__', flags: orphans });
            }

            // les labels de famille reflètent la racine commune ; on garde le label
            // de la racine d'origine (le plus parlant) même après rattachement.

            // tri d'affichage : grosses familles d'abord, orphelins toujours en dernier
            groups.sort((a, b) => {
                if (a.key === '__orphans__') return 1;
                if (b.key === '__orphans__') return -1;
                return b.flags.length - a.flags.length || a.label.localeCompare(b.label);
            });

            return groups;
        }

        // Retourne (et met en cache) les familles pour le set courant de flags
        function getFlagFamilies() {
            if (!_familyCache) _familyCache = computeFlagGroups(currentFlags);
            return _familyCache;
        }

        // Map nom de flag -> label de famille (pour filtrer en mode plat)
        function familyOfFlag(name) {
            const fams = getFlagFamilies();
            for (const g of fams) {
                if (g.flags.some(f => f.name === name)) return g.label;
            }
            return '∅ Isolés';
        }

        // Remplit le <select id="family-filter"> avec les familles détectées
        function populateFamilyFilter() {
            const sel = document.getElementById('family-filter');
            if (!sel) return;
            const fams = getFlagFamilies();
            const prev = _flagFamily;
            let html = '<option value="">Toutes les familles</option>';
            fams.forEach(g => {
                const isOrph = g.key === '__orphans__';
                const lbl = isOrph ? 'Isolés' : g.label;
                html += '<option value="' + escapeAttr(g.label) + '">' +
                        escapeHtml(lbl) + ' (' + g.flags.length + ')</option>';
            });
            sel.innerHTML = html;
            // restaure la sélection si elle existe toujours
            if (prev && fams.some(g => g.label === prev)) sel.value = prev;
            else _flagFamily = '';
        }

        function setFamilyFilter(val) {
            _flagFamily = val || '';
            renderFlagsTable();
        }

        function toggleGroupedView(on) {
            _flagGrouped = !!on;
            renderFlagsTable();
        }

        function toggleFamilyCollapse(label) {
            if (_collapsedFamilies.has(label)) _collapsedFamilies.delete(label);
            else _collapsedFamilies.add(label);
            renderFlagsTable();
        }

        function sortFlags(col) {
            if (_flagSortCol === col) {
                _flagSortDir = _flagSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                _flagSortCol = col;
                _flagSortDir = col === 'name' ? 'asc' : 'desc';
            }
            // Update sort icons
            ['name','status','rollout','age'].forEach(function(c) {
                var el = document.getElementById('sort-icon-' + c);
                if (!el) return;
                if (c === _flagSortCol) {
                    el.textContent = _flagSortDir === 'asc' ? '↑' : '↓';
                    el.style.color = 'rgba(255,255,255,0.9)';
                } else {
                    el.textContent = '↕';
                    el.style.color = 'rgba(255,255,255,0.25)';
                }
            });
            renderFlagsTable();
        }

        function setFlagFilter(el) {
            document.querySelectorAll('.filter-chip').forEach(function(c){ c.classList.remove('active'); });
            el.classList.add('active');
            _flagFilter = el.dataset.status || '';
            renderFlagsTable();
        }

        function filterFlags() { renderFlagsTable(); }

        function renderFlagsTable() {
            var tbody = document.getElementById('flagsTableBody');
            if (!tbody) return;

            var q = '';
            var searchEl = document.getElementById('flagSearch');
            if (searchEl) q = searchEl.value.toLowerCase();

            var SC = {ROLLOUT:'status-rollout',STABILISATION:'status-stabilisation',CLEANUP:'status-cleanup',DETTE:'status-dette',CRITIQUE:'status-critique',OPS:'status-ops'};
            var SL = {ROLLOUT:'En rollout',STABILISATION:'Stabilisation',CLEANUP:'Cleanup',DETTE:'Dette',CRITIQUE:'Critique',OPS:'Ops'};
            var SB = {ROLLOUT:'#a78bfa',STABILISATION:'#60a5fa',CLEANUP:'#34d399',DETTE:'#fbbf24',CRITIQUE:'#f87171',OPS:'#6b7280'};
            var SI = {ROLLOUT:'rgba(167,139,250,0.18)',STABILISATION:'rgba(96,165,250,0.18)',CLEANUP:'rgba(52,211,153,0.18)',DETTE:'rgba(251,191,36,0.18)',CRITIQUE:'rgba(248,113,113,0.18)',OPS:'rgba(156,163,175,0.12)'};

            function ac(d) { return d > 60 ? '#f87171' : d > 30 ? '#fbbf24' : d > 14 ? '#34d399' : '#93c5fd'; }

            // Filter
            var flags = currentFlags.slice();
            if (_flagFilter) flags = flags.filter(function(f){ return f.status === _flagFilter; });
            if (q) flags = flags.filter(function(f){ return f.name.toLowerCase().indexOf(q) !== -1; });
            if (_flagFamily) flags = flags.filter(function(f){ return familyOfFlag(f.name) === _flagFamily; });

            // Sort
            var dir = _flagSortDir === 'asc' ? 1 : -1;
            flags.sort(function(a, b) {
                switch (_flagSortCol) {
                    case 'name':    return dir * a.name.localeCompare(b.name);
                    case 'status':  return dir * ((STATUS_ORDER[a.status]||9) - (STATUS_ORDER[b.status]||9));
                    case 'rollout': return dir * (a.rolloutPercent - b.rolloutPercent);
                    case 'age':     return dir * (a.ageInDays - b.ageInDays);
                    default:        return 0;
                }
            });

            // Update count info
            var countEl = document.getElementById('flags-count-info');
            if (countEl) {
                countEl.textContent = flags.length + ' flag' + (flags.length > 1 ? 's' : '') +
                    (currentFlags.length !== flags.length ? ' sur ' + currentFlags.length + ' au total' : ' au total');
            }

            if (flags.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:36px;color:var(--ov-35);">Aucun flag correspondant</td></tr>';
                return;
            }

            function envBadges(flag) {
                var scopes = [];
                (flag.strategies || []).forEach(function(s){ (s.scopes || []).forEach(function(sc){ scopes.push(sc.environment_scope || '*'); }); });
                var envs = scopes.filter(function(v,i,a){ return a.indexOf(v) === i; });
                if (!envs.length || envs.indexOf('*') !== -1) return '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--ov-12);margin-right:3px;">*</span>';
                return envs.map(function(e){
                    // 'production' mis en évidence (vert) — c'est l'info la plus importante
                    var isProd = e === 'production';
                    var bg = isProd ? 'rgba(52,211,153,0.22)' : cssVar('--chart-grid','rgba(255,255,255,0.12)');
                    var col = isProd ? '#34d399' : 'inherit';
                    var wt  = isProd ? 'font-weight:700;' : '';
                    return '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:' + bg + ';color:' + col + ';' + wt + 'margin-right:3px;">' + escapeAttr(e) + '</span>';
                }).join('');
            }

            // Cellule âge : DEUX durées distinctes et étiquetées
            //   • total = âge depuis la création de la FF (existe-t-elle depuis longtemps ?)
            //   • prod  = depuis combien de temps en production (le signal de dette réel)
            // L'écart entre les deux = temps passé en intégration/UAT avant la prod.
            function ageCell(f) {
                var ageC = ac(f.ageInDays);
                var total = '<div style="display:flex;align-items:center;gap:5px;">' +
                    '<span style="font-size:9px;color:var(--ov-4);width:30px;">total</span>' +
                    '<span class="age-chip" style="background:' + ageC + '22;color:' + ageC + ';">' + f.ageInDays + 'j</span></div>';

                var prodLine;
                if (!f.inProd) {
                    prodLine = '<div style="display:flex;align-items:center;gap:5px;margin-top:3px;">' +
                        '<span style="font-size:9px;color:var(--ov-4);width:30px;">prod</span>' +
                        '<span style="font-size:10px;color:var(--ov-35);">hors prod</span></div>';
                } else if (f.prodSinceDays != null) {
                    var pc = ac(f.prodSinceDays);
                    prodLine = '<div style="display:flex;align-items:center;gap:5px;margin-top:3px;" title="Estimation depuis les audit events GitLab">' +
                        '<span style="font-size:9px;color:var(--ov-4);width:30px;">prod</span>' +
                        '<span class="age-chip" style="background:' + pc + '22;color:' + pc + ';">~' + f.prodSinceDays + 'j</span></div>';
                } else {
                    prodLine = '<div style="display:flex;align-items:center;gap:5px;margin-top:3px;" title="En production (durée non déterminable depuis l\'audit log)">' +
                        '<span style="font-size:9px;color:var(--ov-4);width:30px;">prod</span>' +
                        '<span style="font-size:10px;color:#34d399;font-weight:600;">✓ en prod</span></div>';
                }
                return total + prodLine;
            }

            // Rendu d'une ligne de flag (réutilisé en mode plat ET groupé)
            function renderFlagRow(f) {
                var isActive = f.active !== false;
                var statusClass = SC[f.status] || '';
                var statusLabel = SL[f.status] || f.status;
                var barColor    = SB[f.status] || '#888';
                var iconBg      = SI[f.status] || 'rgba(255,255,255,0.1)';
                var safeName    = escapeAttr(f.name);
                var safeMsg     = escapeAttr(f.message);

                var actionBtn = '';
                if (f.priority >= 4) {
                    actionBtn = '<button class="action-btn urgent" data-flag-name="' + safeName + '" data-action="open-cleanup">🧹 Cleanup</button>';
                } else if (f.status === 'CLEANUP') {
                    actionBtn = '<button class="action-btn ok" data-flag-name="' + safeName + '" data-action="open-cleanup">✅ Cleanup</button>';
                } else {
                    actionBtn = '<button class="action-btn" data-flag-name="' + safeName + '" data-action="open-cleanup">Voir</button>';
                }

                return '<tr>' +
                    '<td><div class="flag-name-cell">' +
                        '<div class="flag-type-icon" style="background:' + iconBg + ';">' + f.icon + '</div>' +
                        '<div><div class="flag-name-text">' + safeName + '</div>' +
                        '<div class="flag-name-sub">' + safeMsg + '</div></div>' +
                    '</div></td>' +
                    '<td><span class="status-badge ' + statusClass + '">' + statusLabel + '</span></td>' +
                    '<td><div style="display:flex;align-items:center;gap:7px;">' +
                        '<div class="rollout-bar-wrap"><div class="rollout-bar" style="width:' + f.rolloutPercent + '%;background:' + barColor + ';"></div></div>' +
                        '<span style="font-size:11px;font-weight:700;color:' + barColor + ';">' + f.rolloutPercent + '%</span>' +
                    '</div></td>' +
                    '<td>' + ageCell(f) + '</td>' +
                    '<td>' + envBadges(f) + '</td>' +
                    '<td style="text-align:center;">' +
                        '<div style="display:flex;align-items:center;justify-content:center;gap:8px;">' +
                            '<div class="ff-toggle" data-active="' + isActive + '" data-flag-name="' + safeName + '" data-action="quick-toggle">' +
                                '<span class="ff-toggle-seg seg-off">OFF</span>' +
                                '<span class="ff-toggle-seg seg-on">ON</span>' +
                            '</div>' +
                            actionBtn +
                        '</div>' +
                    '</td>' +
                '</tr>';
            }

            if (_flagGrouped) {
                // ── MODE GROUPÉ : accordéon par famille ──────────────────
                // On regroupe les flags DÉJÀ filtrés/triés par famille.
                var famMap = new Map(); // label -> [flags]
                flags.forEach(function(f) {
                    var lbl = familyOfFlag(f.name);
                    if (!famMap.has(lbl)) famMap.set(lbl, []);
                    famMap.get(lbl).push(f);
                });
                // ordre : grosses familles d'abord, "Isolés" en dernier
                var famEntries = [...famMap.entries()].sort(function(a, b){
                    if (a[0] === '∅ Isolés') return 1;
                    if (b[0] === '∅ Isolés') return -1;
                    return b[1].length - a[1].length || a[0].localeCompare(b[0]);
                });

                var html = '';
                famEntries.forEach(function(entry){
                    var label = entry[0], members = entry[1];
                    var isOrph = label === '∅ Isolés';
                    var collapsed = _collapsedFamilies.has(label);
                    var dispLabel = isOrph ? 'Isolés' : label;
                    var caret = collapsed ? '▸' : '▾';
                    html += '<tr class="family-header-row" data-family="' + escapeAttr(label) + '" data-action="toggle-family" style="cursor:pointer;">' +
                        '<td colspan="6" style="background:rgba(124,92,252,0.10);border-top:1px solid rgba(124,92,252,0.25);padding:9px 14px;">' +
                            '<span style="font-size:13px;font-weight:800;color:#c4b5fd;">' + caret + ' ' + escapeHtml(dispLabel) + '</span>' +
                            '<span style="font-size:11px;color:var(--ov-45);margin-left:8px;">' + members.length + ' flag' + (members.length>1?'s':'') + '</span>' +
                        '</td>' +
                    '</tr>';
                    if (!collapsed) html += members.map(renderFlagRow).join('');
                });
                tbody.innerHTML = html;
            } else {
                // ── MODE PLAT ────────────────────────────────────────────
                tbody.innerHTML = flags.map(renderFlagRow).join('');
            }

            // Event delegation : un seul listener au niveau du tbody plutôt que N
            // listeners par ligne, et plus de fragilité sur apostrophes dans les noms.
            // On clone-replace pour éviter d'empiler les listeners si renderFlagsTable
            // est ré-appelée.
            const fresh = tbody.cloneNode(true);
            tbody.parentNode.replaceChild(fresh, tbody);
            fresh.addEventListener('click', (e) => {
                const target = e.target.closest('[data-action]');
                if (!target) return;
                if (target.dataset.action === 'toggle-family') {
                    toggleFamilyCollapse(target.dataset.family);
                    return;
                }
                const flagName = target.dataset.flagName;
                if (!flagName) return;
                if (target.dataset.action === 'open-cleanup') openCleanupModal(flagName);
                else if (target.dataset.action === 'quick-toggle') quickToggle(flagName, target);
            });
        }

        // CSS for sortable headers
        (function() {
            var style = document.createElement('style');
            style.textContent =
                '.sortable-th { cursor:pointer; transition: color 0.2s; }' +
                '.sortable-th:hover { color: white; }' +
                '.sort-icon { font-size:10px; color:var(--ov-25); margin-left:4px; transition: color 0.2s; }';
            document.head.appendChild(style);
        })();




        // ══════════════════════════════════════════════════════════════════
        // QUICK TOGGLE — toggle ON/OFF directement depuis la liste
        // ══════════════════════════════════════════════════════════════════
        let _pendingToggle = null; // { flagName, activate, toggleEl }

        function hasProdScope(flag) {
            const scopes = (flag.strategies || []).flatMap(s => s.scopes || []);
            return scopes.some(s => s.environment_scope === 'production' || s.environment_scope === 'prod' || s.environment_scope === '*');
        }

        function quickToggle(flagName, pillEl) {
            const flag = currentFlags.find(f => f.name === flagName);
            if (!flag) return;
            const currentActive = pillEl.dataset.active === 'true';
            const activate = !currentActive; // toggle

            if (hasProdScope(flag) || !flag.strategies || flag.strategies.length === 0) {
                _pendingToggle = { flagName, activate, toggleEl: pillEl };
                showProdConfirm(flagName, activate, flag);
            } else {
                doToggleFlag(flagName, activate, pillEl);
            }
        }

        function showProdConfirm(flagName, activate, flag) {
            const existing = document.getElementById('pcm-dialog');
            if (existing) { existing.close(); existing.remove(); }

            const confirmClass = activate ? 'on' : 'off';
            const confirmText  = activate ? '✅ Oui, activer' : '🔴 Oui, désactiver';
            const emoji = activate ? '🟢' : '🔴';
            const title = activate ? 'Activer en production ?' : 'Désactiver en production ?';
            const sub   = activate
                ? 'Cette feature sera visible par tous les utilisateurs en production immédiatement.'
                : 'Cette feature sera masquée pour tous les utilisateurs en production immédiatement.';

            const dlg = document.createElement('dialog');
            dlg.id = 'pcm-dialog';
            dlg.className = 'pcm-dialog';
            dlg.innerHTML = `
                <div class="pcm-inner">
                    <span class="pcm-emoji">${emoji}</span>
                    <div class="pcm-title">${title}</div>
                    <div class="pcm-sub">${sub}</div>
                    <span class="pcm-flag">${flagName}</span>
                    <div class="pcm-warn">
                        <span class="pcm-warn-icon">⚠️</span>
                        <span>Ce flag est actif en <strong>production</strong>. L'action prend effet <strong>immédiatement</strong> pour tous les utilisateurs réels.</span>
                    </div>
                    <div class="pcm-btns">
                        <button class="pcm-cancel" onclick="cancelProdConfirm()">Annuler</button>
                        <button class="pcm-confirm ${confirmClass}" onclick="confirmProdToggle()">${confirmText}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(dlg);
            dlg.showModal();
        }

        function cancelProdConfirm() {
            const dlg = document.getElementById('pcm-dialog'); if (dlg) { dlg.close(); dlg.remove(); }
            _pendingToggle = null;
        }

        function confirmProdToggle() {
            const dlg = document.getElementById('pcm-dialog'); if (dlg) { dlg.close(); dlg.remove(); }
            if (!_pendingToggle) return;
            const { flagName, activate, toggleEl } = _pendingToggle;
            _pendingToggle = null;
            doToggleFlag(flagName, activate, toggleEl);
        }

        async function doToggleFlag(flagName, activate, pillEl) {
            pillEl.classList.add('busy');

            try {
                const response = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/feature_flags/${encodeURIComponent(flagName)}`, {
                    method: 'PUT',
                    headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ active: activate })
                });

                if (response.ok) {
                    // Mise à jour visuelle immédiate
                    pillEl.dataset.active = activate;
                    pillEl.classList.remove('busy');
                    logAudit('UPDATE', flagName,
                        { active: !activate }, { active: activate },
                        `Toggle ${activate ? 'ON' : 'OFF'} via interface PO`
                    );
                    setTimeout(() => loadFeatureFlags(), 1000);
                } else {
                    throw new Error((await response.json()).message || `Erreur ${response.status}`);
                }
            } catch (err) {
                pillEl.classList.remove('busy');
                // Afficher erreur sous le flag group
                const errDiv = document.createElement('div');
                errDiv.style.cssText = 'background:rgba(248,113,113,0.15);border:1px solid rgba(248,113,113,0.4);border-radius:10px;padding:10px 14px;font-size:12px;color:#fca5a5;margin:8px 0;';
                errDiv.textContent = '❌ Erreur : ' + err.message;
                pillEl.closest('.flag-item')?.after(errDiv);
                setTimeout(() => errDiv.remove(), 5000);
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // MASTER RENDER
        // ══════════════════════════════════════════════════════════════════
        function renderAllCharts(/* groups */) {
            // `groups` n'est pas utilisé : renderDonut recalcule les counts à partir
            // de `currentFlags` directement. On laisse la signature vide pour
            // éviter de transporter un paramètre inutile.
            updateKPIs();
            renderDonut();
            renderHealthScore();
            renderAgeChart();
            renderFlagsTable();
            if (window.renderTimelineChart) renderTimelineChart();
        }

        // ══════════════════════════════════════════════════════════════════
        // INIT
        // ══════════════════════════════════════════════════════════════════
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
