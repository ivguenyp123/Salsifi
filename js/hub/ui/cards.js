// [hub] Extrait de hub.js — ui/cards.js (portée globale, script classique)
        // ───── Rendu des cartes ────────────────────────────────────────────
        function setSkeleton() {
            ['Dora', 'Deploy', 'Matu', 'Bus'].forEach(k => {
                const card = document.getElementById(`syn${k}Card`);
                card.removeAttribute('data-loaded');
                document.getElementById(`syn${k}Value`).innerHTML = '<span class="syn-skeleton"></span>';
                document.getElementById(`syn${k}Meta`).innerHTML = '&nbsp;';
            });
        }
        function setCard(key, valueHtml, metaHtml) {
            document.getElementById(`syn${key}Value`).innerHTML = valueHtml;
            document.getElementById(`syn${key}Meta`).innerHTML = metaHtml;
            document.getElementById(`syn${key}Card`).setAttribute('data-loaded', 'true');
        }
        function setCardError(key, label = '⚠️ Erreur') {
            setCard(key, '—', `<span class="warn">${label}</span>`);
        }

        // ───── Helpers de format ───────────────────────────────────────────
        const trendArrow = (delta) => {
            if (delta == null || !isFinite(delta)) return '<span class="neutral">·</span>';
            if (delta > 1) return '<span class="up">▲</span>';
            if (delta < -1) return '<span class="down">▼</span>';
            return '<span class="neutral">·</span>';
        };
        const fmtDelta = (delta) => {
            if (delta == null || !isFinite(delta)) return '';
            const sign = delta > 0 ? '+' : '';
            return `${sign}${delta.toFixed(0)}%`;
        };

        // ───── Rendu final ─────────────────────────────────────────────────
        function renderSynthesis(syn) {
            // Carte 1 : DORA
            if (syn.dora && syn.dora.globalLevel) {
                setCard('Dora',
                    syn.dora.globalLevel,
                    `<span class="up">▲</span> ${syn.dora.eliteCount}/${syn.dora.validCount} en Elite`);
            } else {
                setCardError('Dora', 'Pas assez de données');
            }

            // Carte 2 : Deploys
            if (syn.deploys && syn.deploys.currentPerDay != null) {
                const v = syn.deploys.currentPerDay;
                const valFmt = v >= 10 ? v.toFixed(0) : v.toFixed(1);
                const delta = syn.deploys.delta;
                let meta = '';
                if (delta == null) {
                    meta = '<span class="neutral">·</span> Pas de comparaison';
                } else {
                    meta = `${trendArrow(delta)} ${fmtDelta(delta)} vs 30j précédents`;
                }
                setCard('Deploy', valFmt, meta);
            } else {
                setCardError('Deploy', 'Pas de pipelines');
            }

            // Carte 3 : Maturité
            if (syn.maturity && syn.maturity.score8 != null) {
                const s = syn.maturity.score8;
                setCard('Matu',
                    `${s.toFixed(1)}<span class="syn-value-suffix">/8</span>`,
                    syn.maturity.weakest
                        ? `${syn.maturity.weakest} = axe faible`
                        : '');
            } else {
                setCardError('Matu', 'Données insuffisantes');
            }

            // Carte 4 : Bus Factor
            if (syn.busFactor && syn.busFactor.bf != null) {
                const bf = syn.busFactor.bf;
                const bfFmt = bf.toFixed(1);
                let metaText, metaCls;
                if (bf < 1.5) {
                    metaText = 'Risque concentration';
                    metaCls = 'down';
                } else if (bf < 2.5) {
                    metaText = 'À surveiller';
                    metaCls = 'warn';
                } else {
                    metaText = 'Bonne distribution';
                    metaCls = 'up';
                }
                setCard('Bus', bfFmt,
                    `<span class="${metaCls}">${metaCls === 'up' ? '▲' : metaCls === 'down' ? '▼' : '·'}</span> ${metaText}`);
            } else {
                setCardError('Bus', 'Pas de commits');
            }

            // Animation d'arrivée : les valeurs numériques grimpent depuis 0.
            // Non-intrusif : relit ce que les cartes viennent de poser, n'anime
            // que le numérique (DORA = "Elite" texte → laissé tel quel).
            animateSynValues();

            // État de tendance par carte (signaux discrets, signifiants).
            applyCardTrends(syn);
        }

        // ───── État de tendance par carte ──────────────────────────────────
        // good = au top / en hausse · warn = dégradé / en baisse · neutral = stable
        function setCardTrend(key, state) {
            const card = document.getElementById(`syn${key}Card`);
            if (!card) return;
            card.classList.remove('syn-good', 'syn-warn');
            if (state === 'good') card.classList.add('syn-good');
            else if (state === 'warn') card.classList.add('syn-warn');
        }
        function applyCardTrends(syn) {
            // DORA : proportion Elite. Tout Elite → good ; un niveau bas → warn.
            if (syn.dora && syn.dora.globalLevel) {
                if (syn.dora.globalLevel === 'Elite') setCardTrend('Dora', 'good');
                else if (syn.dora.globalLevel === 'Low') setCardTrend('Dora', 'warn');
                else setCardTrend('Dora', 'neutral');
            } else setCardTrend('Dora', 'neutral');

            // Deploys : delta vs 30j précédents.
            if (syn.deploys && syn.deploys.delta != null) {
                if (syn.deploys.delta > 10) setCardTrend('Deploy', 'good');
                else if (syn.deploys.delta < -10) setCardTrend('Deploy', 'warn');
                else setCardTrend('Deploy', 'neutral');
            } else setCardTrend('Deploy', 'neutral');

            // Maturité : score8 comparé à l'historique 7j si dispo, sinon niveau absolu.
            if (syn.maturity && syn.maturity.score8 != null) {
                const s = syn.maturity.score8;
                let state = 'neutral';
                try {
                    const hist = (typeof currentRepo !== 'undefined' && currentRepo)
                        ? readSynHistory(currentRepo.id) : null;
                    const prev = hist ? findEntryNearDaysAgo(hist, 7) : null;
                    const sPrev = prev && prev.syn.maturity ? prev.syn.maturity.score8 : null;
                    if (sPrev != null && s - sPrev >= 0.3) state = 'good';
                    else if (sPrev != null && s - sPrev <= -0.3) state = 'warn';
                    else if (s >= 6.5) state = 'good';      // fort dans l'absolu
                    else if (s < 4) state = 'warn';         // faible dans l'absolu
                } catch {
                    if (s >= 6.5) state = 'good'; else if (s < 4) state = 'warn';
                }
                setCardTrend('Matu', state);
            } else setCardTrend('Matu', 'neutral');

            // Bus factor : delta + niveau absolu (concentration = risque).
            if (syn.busFactor && syn.busFactor.bf != null) {
                const bf = syn.busFactor.bf;
                if (bf < 1.5) setCardTrend('Bus', 'warn');        // concentration critique
                else if (bf >= 2.5) setCardTrend('Bus', 'good');  // bien réparti
                else setCardTrend('Bus', 'neutral');
            } else setCardTrend('Bus', 'neutral');
        }

        // ───── Animation des compteurs à l'arrivée ─────────────────────────
        // Helper réutilisable : anime un élément DOM dont le contenu commence
        // par un nombre (gère décimales + suffixe HTML type "/8").
        function animateCountEl(el, dur = 750) {
            if (!el) return;
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            const html = el.innerHTML;
            const m = html.match(/^(\d+(?:[.,]\d+)?)(.*)$/s);
            if (!m) return;                       // pas numérique → on saute
            const target = parseFloat(m[1].replace(',', '.'));
            const suffix = m[2] || '';
            const dec = ((m[1].split(/[.,]/)[1]) || '').length;
            const t0 = performance.now();
            function step(t) {
                const k = Math.min((t - t0) / dur, 1);
                const eased = 1 - Math.pow(1 - k, 3);
                el.innerHTML = (target * eased).toFixed(dec) + suffix;
                if (k < 1) requestAnimationFrame(step);
                else el.innerHTML = target.toFixed(dec) + suffix;
            }
            requestAnimationFrame(step);
        }

        let _synAnimDone = false;
        function animateSynValues() {
            ['Deploy', 'Matu', 'Bus'].forEach(key => {
                animateCountEl(document.getElementById(`syn${key}Value`));
            });
        }
