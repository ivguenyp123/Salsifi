// [hub] Extrait de hub.js — ui/suggestions-view.js (portée globale, script classique)
        function setSuggestionsSkeleton() {
            const container = document.getElementById('suggestionsContainer');
            container.innerHTML = `
                <div class="sugg-card sugg-skeleton"><div class="sugg-skel-tag"></div><div class="sugg-skel-text"></div><div class="sugg-skel-text"></div><div class="sugg-skel-cta"></div></div>
                <div class="sugg-card sugg-skeleton"><div class="sugg-skel-tag"></div><div class="sugg-skel-text"></div><div class="sugg-skel-text"></div><div class="sugg-skel-cta"></div></div>
                <div class="sugg-card sugg-skeleton"><div class="sugg-skel-tag"></div><div class="sugg-skel-text"></div><div class="sugg-skel-text"></div><div class="sugg-skel-cta"></div></div>
            `;
        }

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  SUGGESTIONS DU JOUR — moteur de règles + historique             ║
        // ╚══════════════════════════════════════════════════════════════════╝

        // ───── Rendu ───────────────────────────────────────────────────────
        function renderSuggestions(suggestions) {
            const container = document.getElementById('suggestionsContainer');
            if (!suggestions || suggestions.length === 0) {
                container.innerHTML = '<div class="sugg-card" style="grid-column: 1/-1;"><div class="sugg-text">Aucune suggestion disponible.</div></div>';
                return;
            }
            container.innerHTML = suggestions.map(s => `
                <div class="sugg-card" data-loaded="true" data-direction="${escapeHtml(s.direction)}">
                    <span class="sugg-tag ${escapeHtml(s.tag)}">${escapeHtml(s.tagLabel)}</span>
                    <div class="sugg-text">${s.text}</div>
                    <div class="sugg-cta">${escapeHtml(s.cta)} <span class="arrow">→</span></div>
                </div>
            `).join('');
        }

        // Click delegation sur le container
        document.getElementById('suggestionsContainer').addEventListener('click', e => {
            const card = e.target.closest('.sugg-card[data-direction]');
            if (!card) return;
            const dir = card.dataset.direction;
            if (dir) openDrilldown(dir);
        });

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  POUR ALLER PLUS LOIN — pool d'entrées par chemin + sélection    ║
        // ╚══════════════════════════════════════════════════════════════════╝
        //
        // Chaque entrée :
        //   { id, text, workshop?, context? }
        //   - workshop : id de l'atelier vers lequel pointer (mapping vers les 205 actions)
        //   - context : fonction (syn) → boolean. Si true, entrée marquée "Pour toi" + remontée
        //
        // Affichage : max 5 entrées par défaut (contextuelles en haut), le reste via "Voir plus"
