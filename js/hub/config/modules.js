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

        // Modules RÉSERVÉS : grisés + non cliquables (pas de self-service par les équipes).
        // Le Secrets Scanner balaie TOUS les repos accessibles → lancé par la plateforme, pas en libre accès.
        const MODULE_DISABLED = {
            'Secrets Scanner': "Réservé à la plateforme — pas en libre accès pour les équipes."
        };

        // Markup d'une carte module (partagé drawer + grille expert), gère l'état réservé.
        function moduleCardHtml(m) {
            const esc = window.escapeHtml || (s => s);
            const reason = MODULE_DISABLED[m.name];
            return `
                <div class="dd-module${reason ? ' is-disabled' : ''}" data-module-name="${esc(m.name)}"${reason ? ` title="${esc(reason)}"` : ''}>
                    <div class="dd-module-icon">${m.icon}</div>
                    <div class="dd-module-name">${m.name}${reason ? ' <span class="dd-module-lock">🔒 réservé</span>' : ''}</div>
                    <div class="dd-module-desc">${m.desc}</div>
                </div>`;
        }
