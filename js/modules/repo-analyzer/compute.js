/* repo-analyzer · compute.js — logique pure : flow, bus factor, score, quick wins. */

        function detectFlow() {
            const branchNames = analysisData.branches.map(b => b.name.toLowerCase());
            const hasDevelop = branchNames.includes('develop') || branchNames.includes('dev');
            if (hasDevelop) flowType = 'gitflow'; else flowType = 'featureBranching';
        }


        function calculateBusFactor() {
            if (analysisData.contributors.length === 0) return { name: '-', percentage: 0 };
            const totalCommits = analysisData.contributors.reduce((sum, c) => sum + c.commits, 0);
            if (totalCommits === 0) return { name: '-', percentage: 0 };
            const topContributor = [...analysisData.contributors].sort((a, b) => b.commits - a.commits)[0];
            return { name: topContributor.name, percentage: Math.round((topContributor.commits / totalCommits) * 100) };
        }


        function calculateHealthScore() {
            let score = 100;
            if (!analysisData.commits.length) score -= 40;
            const openMRs = analysisData.mergeRequests.filter(mr => mr.state === 'opened').length;
            if (openMRs >= 10) score -= 10;
            const bf = calculateBusFactor();
            if (bf.percentage >= 80) score -= 15;
            return Math.max(0, Math.min(100, score));
        }


        function generateQuickWins() {
            quickWins = [];
            const now = new Date();
            const projectUrl = analysisData.project?.web_url || '#';
            const openMRs = analysisData.mergeRequests.filter(mr => mr.state === 'opened');
            const mergedMRs = analysisData.mergeRequests.filter(mr => mr.state === 'merged');
            // repoFiles = entrées de PREMIER NIVEAU uniquement (l'arbre est récursif) :
            // les détections .gitlab-ci.yml / README / CONTRIBUTING / .gitignore visent la
            // racine et ne doivent pas matcher un fichier homonyme enfoui dans un sous-dossier.
            const repoFiles = analysisData.repoTree.filter(f => !String(f.path).includes('/')).map(f => f.name.toLowerCase());
            const protectedNames = analysisData.protectedBranches.map(b => b.name.toLowerCase());

            // ════════════════════════════════════════════════════════════════════
            //  🔴 CRITIQUE - Sécurité & Risques majeurs
            // ════════════════════════════════════════════════════════════════════

            // 1. Main non protégée
            const mainBranch = analysisData.branches.find(b => ['main', 'master'].includes(b.name.toLowerCase()));
            const isMainProtected = protectedNames.includes('main') || protectedNames.includes('master');
            if (mainBranch && !isMainProtected) {
                quickWins.push({
                    priority: 'critical',
                    icon: '🛡️',
                    title: 'Protéger la branche main',
                    subtitle: 'Sécurité critique',
                    description: 'La branche principale n\'est pas protégée. N\'importe qui peut push directement en production.',
                    impact: 'Évite les pushs directs et les erreurs humaines en prod',
                    time: '2 min',
                    targets: [],
                    actions: [
                        { label: '🔗 Ouvrir Settings', url: `${projectUrl}/-/settings/repository#protected-branches`, primary: true },
                        { label: '📖 Documentation', url: 'https://docs.gitlab.com/ee/user/project/protected_branches.html' }
                    ]
                });
            }

            // 2. Pas de CI/CD
            const hasPipelines = analysisData.pipelines.length > 0;
            const hasGitlabCI = repoFiles.includes('.gitlab-ci.yml');
            if (!hasPipelines && !hasGitlabCI) {
                quickWins.push({
                    priority: 'critical',
                    icon: '⚙️',
                    title: 'Configurer CI/CD',
                    subtitle: 'Automatisation manquante',
                    description: 'Aucun pipeline détecté. Les builds et tests ne sont pas automatisés.',
                    impact: 'Détection précoce des bugs, déploiements fiables',
                    time: '30 min',
                    targets: [],
                    actions: [
                        { label: '🚀 Pipeline Generator', url: 'pipeline-generator.html', primary: true },
                        { label: '📖 Guide CI/CD', url: 'https://docs.gitlab.com/ee/ci/quick_start/' }
                    ]
                });
            }

            // 3. Bus Factor critique (>90%)
            const busFactor = calculateBusFactor();
            if (busFactor.percentage >= 90) {
                quickWins.push({
                    priority: 'critical',
                    icon: '🚨',
                    title: 'Bus Factor critique',
                    subtitle: `${busFactor.name} = ${busFactor.percentage}% du code`,
                    description: 'Une seule personne concentre la majorité des connaissances. Risque majeur si cette personne part.',
                    impact: 'Continuité du projet, résilience équipe',
                    time: 'Long terme',
                    targets: [busFactor.name],
                    actions: [
                        { label: '👥 Planifier pair programming', primary: true },
                        { label: '📚 Documenter le code' }
                    ]
                });
            }

            // 4. MRs abandonnées (>30 jours)
            const abandonedMRs = openMRs.filter(mr => {
                const days = Math.floor((now - new Date(mr.created_at)) / (1000 * 60 * 60 * 24));
                return days > 30;
            });
            if (abandonedMRs.length > 0) {
                quickWins.push({
                    priority: 'critical',
                    icon: '💀',
                    title: `Closer ${abandonedMRs.length} MR(s) abandonnée(s)`,
                    subtitle: 'Ouvertes depuis >30 jours',
                    description: 'Ces MRs bloquent le flux et créent de la confusion. Décidez : merger, closer ou relancer.',
                    impact: 'Clarté du backlog, flux de travail sain',
                    time: `${abandonedMRs.length * 2} min`,
                    targets: abandonedMRs.slice(0, 5).map(mr => `!${mr.iid}`),
                    actions: abandonedMRs.slice(0, 3).map(mr => ({
                        label: `!${mr.iid}`,
                        url: mr.web_url,
                        primary: false
                    }))
                });
            }

            // 5. Branches mortes (>90 jours)
            const deadBranches = analysisData.branches.filter(b => {
                if (['main', 'master', 'develop', 'dev'].includes(b.name.toLowerCase())) return false;
                if (!b.commit?.committed_date) return false;
                const days = Math.floor((now - new Date(b.commit.committed_date)) / (1000 * 60 * 60 * 24));
                return days > 90;
            });
            if (deadBranches.length > 0) {
                quickWins.push({
                    priority: 'critical',
                    icon: '🗑️',
                    title: `Supprimer ${deadBranches.length} branche(s) morte(s)`,
                    subtitle: 'Inactives depuis >90 jours',
                    description: 'Ces branches polluent le repository et créent de la confusion.',
                    impact: 'Repository propre, navigation facilitée',
                    time: `${deadBranches.length} min`,
                    targets: deadBranches.slice(0, 5).map(b => b.name),
                    actions: [
                        { label: '🗑️ Script nettoyage', primary: true, copy: `git branch -d ${deadBranches.slice(0, 3).map(b => b.name).join(' ')}` }
                    ]
                });
            }

            // ════════════════════════════════════════════════════════════════════
            //  🟠 URGENT - Process & Qualité
            // ════════════════════════════════════════════════════════════════════

            // 6. MRs avec conflits
            const conflictMRs = openMRs.filter(mr => mr.has_conflicts === true);
            if (conflictMRs.length > 0) {
                quickWins.push({
                    priority: 'urgent',
                    icon: '⚔️',
                    title: `Résoudre ${conflictMRs.length} conflit(s)`,
                    subtitle: 'Merge bloqué',
                    description: 'Ces MRs ont des conflits et ne peuvent pas être mergées en l\'état.',
                    impact: 'Débloquer les merges, éviter les conflits en cascade',
                    time: `${conflictMRs.length * 10} min`,
                    targets: conflictMRs.slice(0, 5).map(mr => `!${mr.iid}`),
                    actions: conflictMRs.slice(0, 3).map(mr => ({
                        label: `Rebase !${mr.iid}`,
                        url: mr.web_url,
                        primary: false
                    }))
                });
            }

            // 7. MRs > 7 jours
            const oldMRs = openMRs.filter(mr => {
                const days = Math.floor((now - new Date(mr.created_at)) / (1000 * 60 * 60 * 24));
                return days > 7 && days <= 30;
            });
            if (oldMRs.length > 0) {
                quickWins.push({
                    priority: 'urgent',
                    icon: '⏰',
                    title: `Reviewer ${oldMRs.length} MR(s) en attente`,
                    subtitle: 'Ouvertes depuis >7 jours',
                    description: 'Ces MRs attendent depuis trop longtemps. Le feedback devient obsolète.',
                    impact: 'Feedback rapide, code frais, motivation équipe',
                    time: `${oldMRs.length * 15} min`,
                    targets: oldMRs.slice(0, 5).map(mr => `!${mr.iid}`),
                    actions: oldMRs.slice(0, 3).map(mr => ({
                        label: `!${mr.iid}`,
                        url: mr.web_url,
                        primary: false
                    }))
                });
            }

            // 8. MRs sans reviewer
            const noReviewerMRs = openMRs.filter(mr => !mr.reviewers || mr.reviewers.length === 0);
            if (noReviewerMRs.length > 0) {
                quickWins.push({
                    priority: 'urgent',
                    icon: '👁️',
                    title: `Assigner ${noReviewerMRs.length} reviewer(s)`,
                    subtitle: 'Pas de code review prévue',
                    description: 'Ces MRs n\'ont aucun reviewer assigné. Le code risque d\'être mergé sans validation.',
                    impact: 'Qualité code, partage de connaissances',
                    time: `${noReviewerMRs.length * 1} min`,
                    targets: noReviewerMRs.slice(0, 5).map(mr => `!${mr.iid}`),
                    actions: [
                        { label: '👥 Assigner reviewers', url: `${projectUrl}/-/merge_requests`, primary: true }
                    ]
                });
            }

            // 9. Branches stale (30-90 jours)
            const staleBranches = analysisData.branches.filter(b => {
                if (['main', 'master', 'develop', 'dev'].includes(b.name.toLowerCase())) return false;
                if (!b.commit?.committed_date) return false;
                const days = Math.floor((now - new Date(b.commit.committed_date)) / (1000 * 60 * 60 * 24));
                return days > 30 && days <= 90;
            });
            if (staleBranches.length > 0) {
                quickWins.push({
                    priority: 'urgent',
                    icon: '🧹',
                    title: `Nettoyer ${staleBranches.length} branche(s) stale`,
                    subtitle: 'Inactives depuis 30-90 jours',
                    description: 'Décidez pour chaque branche : finir le travail, merger ou supprimer.',
                    impact: 'Repository organisé',
                    time: `${staleBranches.length * 2} min`,
                    targets: staleBranches.slice(0, 5).map(b => b.name),
                    actions: []
                });
            }

            // 10. Pipeline en échec
            const failedPipelines = analysisData.pipelines.filter(p => p.status === 'failed');
            const recentFailed = failedPipelines.slice(0, 5);
            if (recentFailed.length > 0 && failedPipelines.length >= analysisData.pipelines.length * 0.3) {
                quickWins.push({
                    priority: 'urgent',
                    icon: '🔴',
                    title: 'Pipelines en échec',
                    subtitle: `${failedPipelines.length} échecs récents`,
                    description: 'Beaucoup de pipelines échouent. Investiguez les causes.',
                    impact: 'CI fiable, feedback rapide',
                    time: 'Variable',
                    targets: recentFailed.map(p => `#${p.id}`),
                    actions: [
                        { label: '📊 Voir pipelines', url: `${projectUrl}/-/pipelines`, primary: true }
                    ]
                });
            }

            // ════════════════════════════════════════════════════════════════════
            //  🟡 IMPORTANT - Organisation & Standards
            // ════════════════════════════════════════════════════════════════════

            // 11. Naming conventions
            const invalidBranches = analysisData.branches.filter(b => {
                const name = b.name.toLowerCase();
                if (['main', 'master', 'develop', 'dev'].includes(name)) return false;
                if (name.includes('renovate') || name.includes('dependabot')) return false;
                return !name.startsWith('feature/') &&
                       !name.startsWith('feat/') &&
                       !name.startsWith('feature_') &&
                       !name.startsWith('fix/') &&
                       !name.startsWith('bugfix/') &&
                       !name.startsWith('hotfix/') &&
                       !name.startsWith('release/') &&
                       !name.startsWith('chore/');
            });
            if (invalidBranches.length > 0) {
                quickWins.push({
                    priority: 'important',
                    icon: '🏷️',
                    title: `Renommer ${invalidBranches.length} branche(s)`,
                    subtitle: 'Naming convention non respectée',
                    description: 'Ces branches ne suivent pas la convention (feature/*, fix/*, etc.).',
                    impact: 'Consistance, lisibilité, automatisation',
                    time: `${invalidBranches.length * 2} min`,
                    targets: invalidBranches.slice(0, 5).map(b => b.name),
                    actions: []
                });
            }

            // 12. MRs sans description
            const noDescMRs = openMRs.filter(mr => !mr.description || mr.description.trim().length < 10);
            if (noDescMRs.length > 0) {
                quickWins.push({
                    priority: 'important',
                    icon: '📝',
                    title: `Documenter ${noDescMRs.length} MR(s)`,
                    subtitle: 'Description manquante',
                    description: 'Ces MRs n\'ont pas de description. Les reviewers manquent de contexte.',
                    impact: 'Reviews plus rapides et pertinentes',
                    time: `${noDescMRs.length * 3} min`,
                    targets: noDescMRs.slice(0, 5).map(mr => `!${mr.iid}`),
                    actions: []
                });
            }

            // 13. MRs sans labels
            const noLabelMRs = openMRs.filter(mr => !mr.labels || mr.labels.length === 0);
            if (noLabelMRs.length > 2 && analysisData.labels.length > 0) {
                quickWins.push({
                    priority: 'important',
                    icon: '🏷️',
                    title: `Labelliser ${noLabelMRs.length} MR(s)`,
                    subtitle: 'Pas de labels',
                    description: 'Utilisez les labels pour catégoriser et filtrer les MRs.',
                    impact: 'Organisation, priorisation, reporting',
                    time: `${noLabelMRs.length} min`,
                    targets: noLabelMRs.slice(0, 5).map(mr => `!${mr.iid}`),
                    actions: []
                });
            }

            // 14. Bus factor warning (70-90%)
            if (busFactor.percentage >= 70 && busFactor.percentage < 90) {
                quickWins.push({
                    priority: 'important',
                    icon: '👥',
                    title: 'Améliorer le Bus Factor',
                    subtitle: `${busFactor.name} = ${busFactor.percentage}%`,
                    description: 'La connaissance est trop concentrée. Planifiez du pair programming.',
                    impact: 'Résilience équipe, partage de connaissances',
                    time: 'Long terme',
                    targets: [busFactor.name],
                    actions: []
                });
            }

            // 15. Commits sans convention
            const conventionalPattern = /^(feat|fix|docs|style|refactor|test|chore|build|ci)(\(.+\))?:/;
            const nonConventional = analysisData.commits.filter(c => !conventionalPattern.test(c.title));
            if (nonConventional.length > analysisData.commits.length * 0.7 && analysisData.commits.length > 10) {
                quickWins.push({
                    priority: 'important',
                    icon: '📐',
                    title: 'Adopter Conventional Commits',
                    subtitle: `${nonConventional.length} commits non standards`,
                    description: 'Standardisez les messages avec feat:, fix:, docs:, etc.',
                    impact: 'Changelog auto, versioning sémantique',
                    time: '15 min setup',
                    targets: [],
                    actions: [
                        { label: '📖 Convention', url: 'https://www.conventionalcommits.org/', primary: true }
                    ]
                });
            }

            // 16. Trop de branches en parallèle
            const activeBranches = analysisData.branches.filter(b => {
                if (['main', 'master', 'develop', 'dev'].includes(b.name.toLowerCase())) return false;
                if (!b.commit?.committed_date) return false;
                const days = Math.floor((now - new Date(b.commit.committed_date)) / (1000 * 60 * 60 * 24));
                return days < 7;
            });
            if (activeBranches.length > 10) {
                quickWins.push({
                    priority: 'important',
                    icon: '🌳',
                    title: `${activeBranches.length} branches en parallèle`,
                    subtitle: 'Complexité élevée',
                    description: 'Beaucoup de travail en cours simultanément. Risque de conflits et confusion.',
                    impact: 'Moins de conflits, focus équipe',
                    time: 'Process',
                    targets: [],
                    actions: []
                });
            }

            // ════════════════════════════════════════════════════════════════════
            //  🟢 AMÉLIORATION - Best Practices
            // ════════════════════════════════════════════════════════════════════

            // 17. Pas de README
            const hasReadme = repoFiles.some(f => f.startsWith('readme'));
            if (!hasReadme) {
                quickWins.push({
                    priority: 'improvement',
                    icon: '📖',
                    title: 'Créer un README',
                    subtitle: 'Documentation manquante',
                    description: 'Un README aide les nouveaux arrivants à comprendre le projet.',
                    impact: 'Onboarding rapide, documentation vivante',
                    time: '30 min',
                    targets: [],
                    actions: [
                        { label: '📝 Créer README', url: `${projectUrl}/-/new/main?file_name=README.md`, primary: true }
                    ]
                });
            }

            // 18. Pas de CONTRIBUTING
            const hasContributing = repoFiles.some(f => f.startsWith('contributing'));
            if (!hasContributing && analysisData.contributors.length > 2) {
                quickWins.push({
                    priority: 'improvement',
                    icon: '🤝',
                    title: 'Créer CONTRIBUTING.md',
                    subtitle: 'Guidelines manquantes',
                    description: 'Documentez comment contribuer au projet (conventions, process).',
                    impact: 'Contributions de qualité, onboarding devs',
                    time: '20 min',
                    targets: [],
                    actions: [
                        { label: '📝 Créer', url: `${projectUrl}/-/new/main?file_name=CONTRIBUTING.md`, primary: true }
                    ]
                });
            }

            // 19. Pas de .gitignore
            const hasGitignore = repoFiles.includes('.gitignore');
            if (!hasGitignore) {
                quickWins.push({
                    priority: 'improvement',
                    icon: '🙈',
                    title: 'Ajouter .gitignore',
                    subtitle: 'Fichiers non filtrés',
                    description: 'Un .gitignore évite de committer les fichiers générés (node_modules, build, etc.).',
                    impact: 'Repository propre, moins de bruit',
                    time: '5 min',
                    targets: [],
                    actions: [
                        { label: '📝 Créer', url: `${projectUrl}/-/new/main?file_name=.gitignore`, primary: true },
                        { label: '🔍 Templates', url: 'https://github.com/github/gitignore' }
                    ]
                });
            }

            // 20. Pas de CODEOWNERS — GitLab le lit à la racine, dans docs/ ou dans .gitlab/
            const hasCodeowners = analysisData.repoTree.some(f =>
                /^(CODEOWNERS|docs\/CODEOWNERS|\.gitlab\/CODEOWNERS)$/i.test(f.path || ''));
            if (!hasCodeowners && analysisData.contributors.length > 3) {
                quickWins.push({
                    priority: 'improvement',
                    icon: '👑',
                    title: 'Créer CODEOWNERS',
                    subtitle: 'Review automatique',
                    description: 'Assignez automatiquement les reviewers par zone de code.',
                    impact: 'Reviews automatiques, responsabilités claires',
                    time: '15 min',
                    targets: [],
                    actions: [
                        { label: '📝 Créer', url: `${projectUrl}/-/new/main?file_name=CODEOWNERS`, primary: true }
                    ]
                });
            }

            // 21. Pas de MR templates
            const hasMRTemplate = analysisData.repoTree.some(f =>
                f.path?.includes('.gitlab/merge_request_templates') || f.name === 'merge_request_templates'
            );
            if (!hasMRTemplate && openMRs.length > 0) {
                quickWins.push({
                    priority: 'improvement',
                    icon: '📋',
                    title: 'Créer templates MR',
                    subtitle: 'Structure standardisée',
                    description: 'Les templates garantissent que toutes les MRs ont les infos nécessaires.',
                    impact: 'MRs bien documentées, reviews efficaces',
                    time: '15 min',
                    targets: [],
                    actions: [
                        { label: '📖 Guide', url: 'https://docs.gitlab.com/ee/user/project/description_templates.html', primary: true }
                    ]
                });
            }

            // 22. Pas de labels définis
            if (analysisData.labels.length === 0) {
                quickWins.push({
                    priority: 'improvement',
                    icon: '🏷️',
                    title: 'Définir des labels',
                    subtitle: 'Organisation MRs/Issues',
                    description: 'Les labels permettent de catégoriser et filtrer le travail.',
                    impact: 'Organisation, priorisation, reporting',
                    time: '10 min',
                    targets: [],
                    actions: [
                        { label: '➕ Créer labels', url: `${projectUrl}/-/labels`, primary: true }
                    ]
                });
            }

            // 23. Work-life balance
            const offHoursCommits = analysisData.commits.filter(c => {
                if (!c.committed_date) return false;
                const date = new Date(c.committed_date);
                const hour = date.getHours();
                const day = date.getDay();
                return day === 0 || day === 6 || hour < 7 || hour > 21;
            });
            if (offHoursCommits.length > analysisData.commits.length * 0.3 && analysisData.commits.length > 10) {
                quickWins.push({
                    priority: 'improvement',
                    icon: '⚖️',
                    title: 'Work-life balance',
                    subtitle: `${Math.round(offHoursCommits.length / analysisData.commits.length * 100)}% hors horaires`,
                    description: 'Beaucoup de commits le soir/weekend. Attention à l\'équilibre.',
                    impact: 'Bien-être équipe, productivité durable',
                    time: 'Culture',
                    targets: [],
                    actions: []
                });
            }

            // 24. Approvals non configurés
            const mergedWithoutApproval = mergedMRs.filter(mr => mr.upvotes === 0);
            if (mergedWithoutApproval.length > mergedMRs.length * 0.5 && mergedMRs.length > 5) {
                quickWins.push({
                    priority: 'improvement',
                    icon: '✅',
                    title: 'Activer les approvals',
                    subtitle: 'Review non obligatoire',
                    description: 'Beaucoup de MRs mergées sans approbation. Renforcez le process.',
                    impact: 'Qualité code garantie',
                    time: '5 min',
                    targets: [],
                    actions: [
                        { label: '⚙️ Settings', url: `${projectUrl}/-/settings/merge_requests`, primary: true }
                    ]
                });
            }

            // ════════════════════════════════════════════════════════════════════
            //  ✅ SUCCESS - Si tout va bien
            // ════════════════════════════════════════════════════════════════════

            if (quickWins.filter(q => q.priority === 'critical').length === 0) {
                const flowName = flowType === 'gitflow' ? 'GitFlow' : flowType === 'trunk' ? 'Trunk-based' : 'Feature Branching';
                quickWins.push({
                    priority: 'improvement',
                    icon: '🎉',
                    title: 'Bravo !',
                    subtitle: `${flowName} bien appliqué`,
                    description: 'Pas de problème critique détecté. Continuez comme ça !',
                    impact: '',
                    time: '',
                    targets: [],
                    actions: []
                });
            }

            // Trier par priorité
            const priorityOrder = { critical: 0, urgent: 1, important: 2, improvement: 3 };
            quickWins.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
        }


        function calculateMRScoreForDashboard() {
            const open = analysisData.mergeRequests.filter(m => m.state === 'opened');
            const merged = analysisData.mergeRequests.filter(m => m.state === 'merged');
            let score = 100;
            if (merged.length === 0 && open.length > 0) score -= 40; 
            if (open.length > 10) score -= 20;
            const old = open.filter(m => Math.floor((new Date() - new Date(m.created_at))/86400000) > 7);
            const veryOld = open.filter(m => Math.floor((new Date() - new Date(m.created_at))/86400000) > 30);
            score -= old.length * 5;
            score -= veryOld.length * 10;
            return Math.max(0, score);
        }

        // ==========================================
        // GÉNÉRATEURS DE GRAPHIQUES (SVG & HTML)
        // ==========================================

