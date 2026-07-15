// [hub] Extrait de hub.js — config/modules.js (portée globale, script classique)
        // ───── Mapping module → URL réelle ─────────────────────────────────
        // Modules câblés sur des pages réelles. Les autres : toast "À venir".
        const MODULE_URLS = {
            'DORA Insights': 'insights.html',
            'DevOps Assessment': 'maturity.html',
            'Achievements': 'gaming.html',
            'Bus Factor': 'bus-factor.html',
            'Daily Report': 'daily-report.html',
            'Générateur de rapport': 'report-builder.html',
            'Feature Flag Manager': 'feature-flag-manager.html',
            'Release Notes': 'release-notes.html',
            'Pipeline Generator': 'pipeline-generator.html',
            'Repo Analyzer': 'repo-analyzer.html',
            'Security Scanner': 'gouvernance-repo.html',
            'Repo Diet': 'repo-diet.html',
            'Branch Monitor': 'branch-cleaner.html',
            'MR Reviewer AI': 'mr-reviewer.html',
            'Auto Retro': 'autoretro.html',
            'Smart Estimate': 'smart-estimate.html',
            'Secrets Scanner': 'secrets-scanner.html'
            // Les autres seront ajoutés au fur et à mesure du portage
        };
        // Modules migrés au modèle plateforme : ils lisent le repo via ?repo=<id>
        // (auth en localStorage). Les autres pages suivront au portage.
        const MODULE_REPO_AWARE = new Set(['Pipeline Generator', 'Repo Analyzer', 'Security Scanner', 'Repo Diet', 'Branch Monitor', 'MR Reviewer AI', 'Auto Retro', 'Smart Estimate', 'Générateur de rapport']);

        // Modules DÉSACTIVÉS : grisés + non cliquables. La valeur (string) est la
        // raison affichée en title + toast. Deux cas :
        //  - réservé plateforme (Secrets Scanner : balaie TOUS les repos accessibles) ;
        //  - pas encore prêt (Générateur de rapport : en cours de finalisation).
        const MODULE_DISABLED = {
            'Secrets Scanner': "Réservé à la plateforme — pas en libre accès pour les équipes.",
            'Générateur de rapport': "Pas encore prêt — en cours de finalisation."
        };
        // Badge affiché sur la carte selon le motif (défaut : réservé).
        const MODULE_DISABLED_BADGE = {
            'Secrets Scanner': '🔒 réservé',
            'Générateur de rapport': '🚧 bientôt'
        };

        // Markup d'une carte module (partagé drawer + grille expert), gère l'état désactivé.
        function moduleCardHtml(m) {
            const esc = window.escapeHtml || (s => s);
            const reason = MODULE_DISABLED[m.name];
            const badge = MODULE_DISABLED_BADGE[m.name] || '🔒 réservé';
            return `
                <div class="dd-module${reason ? ' is-disabled' : ''}" data-module-name="${esc(m.name)}"${reason ? ` title="${esc(reason)}"` : ''}>
                    <div class="dd-module-icon">${m.icon}</div>
                    <div class="dd-module-name">${m.name}${reason ? ` <span class="dd-module-lock">${badge}</span>` : ''}</div>
                    <div class="dd-module-desc">${m.desc}</div>
                </div>`;
        }
