// [hub] Extrait de hub.js — config/directions.js (portée globale, script classique)
        // ============ DATA DES 4 DIRECTIONS ============
        const DIRECTIONS = {
            measure: {
                eyebrow: 'CHEMIN 1 / 4',
                title: 'Mesurer & Progresser',
                tagline: 'Où on en est. Où on va.',
                cssClass: 'dir-measure',
                modulesTitle: 'Tes outils de pilotage',
                deeperTitle: '💡 Pour aller plus loin',
                // Ornement : courbe ascendante + axes (métaphore tableau de bord)
                ornament: `<svg viewBox="0 0 600 600" fill="none">
                    <path d="M50 500 L550 500" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
                    <path d="M50 500 L50 80" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
                    <path d="M50 480 Q150 470 200 420 T320 320 T440 180 T550 100" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                    <circle cx="200" cy="420" r="8" fill="currentColor"/>
                    <circle cx="320" cy="320" r="8" fill="currentColor"/>
                    <circle cx="440" cy="180" r="8" fill="currentColor"/>
                    <circle cx="550" cy="100" r="10" fill="currentColor"/>
                    <line x1="50" y1="200" x2="550" y2="200" stroke="currentColor" stroke-width="0.5" stroke-dasharray="4 6" opacity="0.3"/>
                    <line x1="50" y1="350" x2="550" y2="350" stroke="currentColor" stroke-width="0.5" stroke-dasharray="4 6" opacity="0.3"/>
                </svg>`,
                stats: [
                    { label: 'DORA', key: 'dora' },
                    { label: 'Maturité globale', key: 'maturity' },
                    { label: 'XP gagné (mois)', key: 'xp' },
                    { label: 'Bus factor', key: 'busFactor' }
                ],
                modules: [
                    { icon: '📊', name: 'DORA Insights', desc: 'Tes 4 chiffres clés du delivery : DF, LTC, CFR, MTTR.' },
                    { icon: '📋', name: 'DevOps Assessment', desc: 'Score de maturité sur 8 axes, radar et historique.' },
                    { icon: '🏆', name: 'Achievements', desc: '13 badges, niveau Rookie → DevOps God, motivation par jeu.' },
                    { icon: '🚌', name: 'Bus Factor', desc: 'Identifier les zones de code maîtrisées par une seule personne.' },
                    { icon: '📅', name: 'Daily Report', desc: 'Synthèse quotidienne pour standups et conseils personnalisés.' },
                    { icon: '📄', name: 'Générateur de rapport', desc: 'Composer un rapport HTML téléchargeable à partir de blocs, sur données réelles.' }
                ]
            },
            deliver: {
                eyebrow: 'CHEMIN 2 / 4',
                title: 'Livrer & Déployer',
                tagline: 'Du code en prod, sans friction.',
                cssClass: 'dir-deliver',
                modulesTitle: 'Tes outils de delivery',
                deeperTitle: '🚀 Aller plus vite',
                // Ornement : flèches diagonales en cascade (métaphore mouvement / pipeline)
                ornament: `<svg viewBox="0 0 600 600" fill="none">
                    <g stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">
                        <path d="M80 480 L380 180" opacity="0.25"/>
                        <path d="M340 220 L380 180 L340 140" opacity="0.25"/>
                        <path d="M120 500 L420 200" opacity="0.5"/>
                        <path d="M380 240 L420 200 L380 160" opacity="0.5"/>
                        <path d="M160 520 L460 220" stroke-width="4" opacity="1"/>
                        <path d="M420 260 L460 220 L420 180" stroke-width="4" opacity="1"/>
                    </g>
                    <circle cx="100" cy="500" r="6" fill="currentColor" opacity="0.3"/>
                    <circle cx="140" cy="510" r="6" fill="currentColor" opacity="0.6"/>
                    <circle cx="180" cy="520" r="8" fill="currentColor"/>
                </svg>`,
                stats: [
                    { label: 'Deploys (30j)', key: 'deploys30' },
                    { label: 'Feature flags', key: 'featureFlags' },
                    { label: 'MRs en attente', key: 'mrsOpen' },
                    { label: 'Pipeline status', key: 'pipelineStatus' }
                ],
                modules: [
                    { icon: '⚙️', name: 'Pipeline Generator', desc: 'Génère ton .gitlab-ci.yml en wizard. Pousse, lance, suis les logs.' },
                    { icon: '🚩', name: 'Feature Flag Manager', desc: 'Cycle de vie complet : création, audit, decommission, RBAC.' },
                    { icon: '📝', name: 'Release Notes', desc: 'Génère les notes de version automatiquement par tag Git.' }
                ]
            },
            inspect: {
                eyebrow: 'CHEMIN 3 / 4',
                title: 'Inspecter & Sécuriser',
                tagline: 'Garder ses repos sains.',
                cssClass: 'dir-inspect',
                modulesTitle: 'Tes outils d\'inspection',
                deeperTitle: '🔬 Creuser davantage',
                // Ornement : cibles concentriques (métaphore vigilance / scan)
                ornament: `<svg viewBox="0 0 600 600" fill="none">
                    <g stroke="currentColor" fill="none">
                        <circle cx="300" cy="300" r="240" stroke-width="1.5" opacity="0.3"/>
                        <circle cx="300" cy="300" r="180" stroke-width="1.5" opacity="0.4"/>
                        <circle cx="300" cy="300" r="120" stroke-width="2" opacity="0.6"/>
                        <circle cx="300" cy="300" r="60" stroke-width="2.5" opacity="0.85"/>
                    </g>
                    <circle cx="300" cy="300" r="14" fill="currentColor"/>
                    <line x1="300" y1="40" x2="300" y2="100" stroke="currentColor" stroke-width="2" opacity="0.5"/>
                    <line x1="300" y1="500" x2="300" y2="560" stroke="currentColor" stroke-width="2" opacity="0.5"/>
                    <line x1="40" y1="300" x2="100" y2="300" stroke="currentColor" stroke-width="2" opacity="0.5"/>
                    <line x1="500" y1="300" x2="560" y2="300" stroke="currentColor" stroke-width="2" opacity="0.5"/>
                </svg>`,
                stats: [
                    { label: 'Note sécurité', key: 'securityScore' },
                    { label: 'Poids du repo', key: 'repoSize' },
                    { label: 'Branches obsolètes', key: 'staleBranches' },
                    { label: 'MRs zombies', key: 'zombieMRs' }
                ],
                modules: [
                    { icon: '🔬', name: 'Repo Analyzer', desc: 'État global du repo : branches, commits, contributeurs, langages.' },
                    { icon: '🛡️', name: 'Security Scanner', desc: 'Conformité CIS GitLab : branch protection, approvals, lock files, secrets. Note A→F.' },
                    { icon: '🥗', name: 'Repo Diet', desc: 'Détecte fichiers binaires, archives, logs. Génère un .gitignore.' },
                    { icon: '🌳', name: 'Branch Monitor', desc: 'Détecte et nettoie les branches obsolètes : âge, statut mergé, branches protégées.' },
                    { icon: '🔑', name: 'Secrets Scanner', desc: 'Scanne les secrets exposés dans TOUS tes repos accessibles. Fichier, ligne, type, ref CIS — preview censurée.' },
                    { icon: '🧪', name: 'Secret Scanner Test', desc: 'Banc d\'essai. Blast Radius d\'un IOC (package compromis) : où il était, s\'il a tourné, ce qu\'il pouvait atteindre. Read-only, avec timeline.' }
                ]
            },
            collab: {
                eyebrow: 'CHEMIN 4 / 4',
                title: 'Collaborer & Améliorer',
                tagline: 'Travailler ensemble, mieux.',
                cssClass: 'dir-collab',
                modulesTitle: 'Tes outils de collaboration',
                deeperTitle: '🤝 Continuer ensemble',
                // Ornement : cercles imbriqués (métaphore relations / communauté)
                ornament: `<svg viewBox="0 0 600 600" fill="none">
                    <g stroke="currentColor" stroke-width="2" fill="none">
                        <circle cx="220" cy="240" r="120" opacity="0.5"/>
                        <circle cx="380" cy="240" r="120" opacity="0.5"/>
                        <circle cx="300" cy="380" r="120" opacity="0.5"/>
                    </g>
                    <g fill="currentColor">
                        <circle cx="220" cy="240" r="14" opacity="0.85"/>
                        <circle cx="380" cy="240" r="14" opacity="0.85"/>
                        <circle cx="300" cy="380" r="14" opacity="0.85"/>
                        <circle cx="300" cy="240" r="8" opacity="0.5"/>
                        <circle cx="260" cy="310" r="8" opacity="0.5"/>
                        <circle cx="340" cy="310" r="8" opacity="0.5"/>
                    </g>
                </svg>`,
                stats: [
                    { label: 'MRs mergées (sem.)', key: 'mrsMergedWeek' },
                    { label: 'Reviewers actifs', key: 'reviewersActive' },
                    { label: 'Contributeurs actifs', key: 'contributorsActive' },
                    { label: 'Lead time MR', key: 'leadTimeMR' }
                ],
                modules: [
                    { icon: '🤖', name: 'MR Reviewer AI', desc: 'Analyse IA des MRs : qualité, risques, couverture, suggestions.' },
                    { icon: '🔄', name: 'Auto Retro', desc: 'Génère une rétro à partir des données GitLab. User stories Jira incluses.' },
                    { icon: '🎯', name: 'Smart Estimate', desc: 'Estime la charge d\'une feature à partir de l\'historique des MRs.' }
                ]
            }
        };
