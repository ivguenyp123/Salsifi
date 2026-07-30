/* gaming · index.js — entrée & câblage (chargé en dernier). */

        let stats = {
            // Delivery
            avgPipelineTime: null,
            successRate: 0,
            weeklyDeploys: 0,
            hasCiFile: false,
            hasSemverTags: false,
            taggedReleasesMonth: 0,
            deploysFromMain: 0,
            totalDeploys: 0,
            maxFailedStreak: 0,
            mttr: null, // Mean Time To Recovery en heures
            // Qualité & MRs
            reviewedMRRate: 0,
            avgReviewTime: null, // en heures
            avgMRSize: null,
            avgMRFiles: null,
            mrWithoutApproval: 0,
            avgCommentsPerMR: 0,
            approvalRulesOk: false,
            resetApprovalsOnPush: false,
            // Stabilité
            pipelineResilience: true, // max 1 échec consécutif
            noFailedWeek: false,
            trendUp: false,
            // Hygiène Repo
            staleBranches: 0,
            hasLockFile: false,
            hasReadme: false,
            hasGitignore: false,
            hasChangelog: false,
            protectedBranches: false,
            forcePushBlocked: false,
            zombieMRs: 0,
            avgMRCycleTime: null, // jours
            mergedBranchesNotDeleted: 0,
            // Résilience
            activeContributors: 0,
            topContributorShare: 100,
            distinctReviewers: 0,
            maxCommitGap: null, // jours
            // Pratiques DevOps
            hasFeatureFlags: false,
            featureFlagsCount: 0,
            ciVersioned: false, // .gitlab-ci.yml versionné
            pipelineStages: 0,
            hasTestStage: false,
            hasDeployStage: false,
            hasEnvSeparation: false,
            hasRollbackJob: false,
        };

        // ══════════════════════════════════════════════════════════════════
        //  DÉFINITION DES BADGES (47 badges, 6 catégories)
        // ══════════════════════════════════════════════════════════════════


        const BADGES = [
            // ──────────────────────────────────────────────────────────────
            // 🚀 DELIVERY (12 badges)
            // ──────────────────────────────────────────────────────────────
            {
                id: 'frequent_deploy',
                category: 'delivery',
                icon: '📦',
                name: 'Frequent Deploy',
                criteria: '≥ 5 pipelines réussis / semaine',
                tip: 'Découpez vos features en plus petits morceaux pour déployer plus souvent.',
                check: () => stats.weeklyDeploys >= 5,
                value: () => stats.weeklyDeploys + ' / semaine',
                target: '≥ 5',
                xp: 100
            },
            {
                id: 'high_frequency_deploy',
                category: 'delivery',
                icon: '🚀',
                name: 'High Frequency Deploy',
                criteria: '≥ 10 pipelines réussis / semaine',
                tip: 'Les équipes DORA Elite déploient plusieurs fois par jour.',
                check: () => stats.weeklyDeploys >= 10,
                value: () => stats.weeklyDeploys + ' / semaine',
                target: '≥ 10',
                xp: 150
            },
            {
                id: 'fast_pipeline',
                category: 'delivery',
                icon: '⚡',
                name: 'Fast Pipeline',
                criteria: 'Durée moyenne pipeline < 10 min',
                tip: 'Parallélisez vos jobs et utilisez le cache GitLab.',
                check: () => stats.avgPipelineTime !== null && stats.avgPipelineTime < 600,
                value: () => stats.avgPipelineTime !== null ? formatDuration(stats.avgPipelineTime) : 'N/A',
                target: '< 10 min',
                xp: 100
            },
            {
                id: 'very_fast_pipeline',
                category: 'delivery',
                icon: '⚡⚡',
                name: 'Very Fast Pipeline',
                criteria: 'Durée moyenne pipeline < 5 min',
                tip: 'Optimisez le cache, réduisez les dépendances, utilisez des images légères.',
                check: () => stats.avgPipelineTime !== null && stats.avgPipelineTime < 300,
                value: () => stats.avgPipelineTime !== null ? formatDuration(stats.avgPipelineTime) : 'N/A',
                target: '< 5 min',
                xp: 150
            },
            {
                id: 'pipeline_as_code',
                category: 'delivery',
                icon: '📝',
                name: 'Pipeline as Code',
                criteria: '.gitlab-ci.yml présent',
                tip: 'Créez un fichier .gitlab-ci.yml à la racine du repo.',
                check: () => stats.hasCiFile,
                value: () => stats.hasCiFile ? '✓ Présent' : '✗ Absent',
                target: 'Présent',
                xp: 50
            },
            {
                id: 'green_pipeline',
                category: 'delivery',
                icon: '✅',
                name: 'Green Pipeline',
                criteria: 'Taux de succès > 90%',
                tip: 'Corrigez les tests flaky et améliorez la qualité du code.',
                check: () => stats.successRate > 90,
                value: () => stats.successRate + '%',
                target: '> 90%',
                xp: 150
            },
            {
                id: 'high_stability',
                category: 'delivery',
                icon: '🟢',
                name: 'High Stability',
                criteria: 'Taux de succès > 95%',
                tip: 'Éliminez tous les tests instables et automatisez les rollbacks.',
                check: () => stats.successRate > 95,
                value: () => stats.successRate + '%',
                target: '> 95%',
                xp: 200
            },
            {
                id: 'recovery_master',
                category: 'delivery',
                icon: '🔄',
                name: 'Recovery Master',
                criteria: 'MTTR < 2h (temps moyen de recovery)',
                tip: 'Mettez en place des alertes et des runbooks pour réagir vite.',
                check: () => stats.mttr !== null && stats.mttr < 2,
                value: () => stats.mttr !== null ? stats.mttr.toFixed(1) + 'h' : 'N/A',
                target: '< 2h',
                xp: 200
            },
            {
                id: 'no_failed_streak',
                category: 'delivery',
                icon: '📉',
                name: 'No Failed Streak',
                criteria: 'Max 1 pipeline failed consécutif',
                tip: 'Réagissez vite aux échecs pour éviter les séries de fails.',
                check: () => stats.maxFailedStreak <= 1,
                value: () => stats.maxFailedStreak + ' consécutifs max',
                target: '≤ 1',
                xp: 150
            },
            {
                id: 'deploy_from_main',
                category: 'delivery',
                icon: '🎯',
                name: 'Deploy from Main',
                criteria: '100% des déploiements via main',
                tip: 'Ne déployez jamais depuis une branche feature.',
                check: () => stats.totalDeploys > 0 && stats.deploysFromMain === stats.totalDeploys,
                value: () => stats.totalDeploys > 0 ? Math.round((stats.deploysFromMain / stats.totalDeploys) * 100) + '%' : 'N/A',
                target: '100%',
                xp: 100
            },
            {
                id: 'tagged_releases',
                category: 'delivery',
                icon: '🏷️',
                name: 'Tagged Releases',
                criteria: '≥ 1 release taguée / mois',
                tip: 'Créez un tag Git pour chaque release.',
                check: () => stats.taggedReleasesMonth >= 1,
                value: () => stats.taggedReleasesMonth + ' / mois',
                target: '≥ 1',
                xp: 75
            },
            {
                id: 'semver',
                category: 'delivery',
                icon: '🔢',
                name: 'Semver',
                criteria: 'Tags suivent semver (vX.Y.Z)',
                tip: 'Utilisez des tags comme v1.0.0, v1.1.0, v2.0.0.',
                check: () => stats.hasSemverTags,
                value: () => stats.hasSemverTags ? '✓ Conforme' : '✗ Non conforme',
                target: 'vX.Y.Z',
                xp: 75
            },

            // ──────────────────────────────────────────────────────────────
            // 🔒 QUALITÉ & MERGE REQUESTS (10 badges)
            // ──────────────────────────────────────────────────────────────
            {
                id: 'code_review_champion',
                category: 'quality',
                icon: '👀',
                name: 'Code Review Champion',
                criteria: '≥ 80% des MR avec approbation',
                tip: 'Demandez toujours une review avant de merger.',
                check: () => stats.reviewedMRRate >= 80,
                value: () => stats.reviewedMRRate + '%',
                target: '≥ 80%',
                xp: 150
            },
            {
                id: 'review_speed',
                category: 'quality',
                icon: '⏱️',
                name: 'Review Speed',
                criteria: 'Temps moyen de review < 2 jours',
                tip: 'Réservez du temps quotidien pour les reviews.',
                check: () => stats.avgReviewTime !== null && stats.avgReviewTime < 48,
                value: () => stats.avgReviewTime !== null ? (stats.avgReviewTime / 24).toFixed(1) + ' jours' : 'N/A',
                target: '< 2 jours',
                xp: 100
            },
            {
                id: 'very_fast_review',
                category: 'quality',
                icon: '⚡',
                name: 'Very Fast Review',
                criteria: 'Temps de review < 1 jour',
                tip: 'Priorisez les reviews dès leur arrivée.',
                check: () => stats.avgReviewTime !== null && stats.avgReviewTime < 24,
                value: () => stats.avgReviewTime !== null ? (stats.avgReviewTime / 24).toFixed(1) + ' jours' : 'N/A',
                target: '< 1 jour',
                xp: 150
            },
            {
                id: 'approval_rules',
                category: 'quality',
                icon: '🔐',
                name: 'Approval Rules',
                criteria: '2 approbateurs requis, author exclu',
                tip: 'Settings → Merge requests → Approval rules.',
                check: () => stats.approvalRulesOk,
                value: () => stats.approvalRulesOk ? '✓ Configuré' : '✗ Non configuré',
                target: 'Activé',
                xp: 100
            },
            {
                id: 'reset_approvals',
                category: 'quality',
                icon: '🔁',
                name: 'Reset Approvals',
                criteria: 'Approvals invalidées après push',
                tip: 'Settings → Merge requests → Remove all approvals on push.',
                check: () => stats.resetApprovalsOnPush,
                value: () => stats.resetApprovalsOnPush ? '✓ Activé' : '✗ Désactivé',
                target: 'Activé',
                xp: 100
            },
            {
                id: 'small_mr',
                category: 'quality',
                icon: '✂️',
                name: 'Small MR',
                criteria: 'Taille moyenne MR < 200 lignes',
                tip: 'Découpez vos changements en MR atomiques.',
                check: () => stats.avgMRSize !== null && stats.avgMRSize < 200,
                value: () => stats.avgMRSize !== null ? stats.avgMRSize + ' lignes' : 'N/A',
                target: '< 200',
                xp: 100
            },
            {
                id: 'tiny_mr',
                category: 'quality',
                icon: '🧩',
                name: 'Tiny MR',
                criteria: 'Taille moyenne MR < 50 lignes',
                tip: 'Les micro-MR sont reviewées en quelques minutes.',
                check: () => stats.avgMRSize !== null && stats.avgMRSize < 50,
                value: () => stats.avgMRSize !== null ? stats.avgMRSize + ' lignes' : 'N/A',
                target: '< 50',
                xp: 150
            },
            {
                id: 'low_mr_files',
                category: 'quality',
                icon: '📄',
                name: 'Low MR Files',
                criteria: '< 10 fichiers modifiés par MR',
                tip: 'Moins de fichiers = review plus ciblée.',
                check: () => stats.avgMRFiles !== null && stats.avgMRFiles < 10,
                value: () => stats.avgMRFiles !== null ? stats.avgMRFiles.toFixed(1) + ' fichiers' : 'N/A',
                target: '< 10',
                xp: 75
            },
            {
                id: 'no_merge_without_approval',
                category: 'quality',
                icon: '🛡️',
                name: 'No Merge Without Approval',
                criteria: '0 MR mergées sans approval',
                tip: 'Bloquez les merges sans approbation.',
                check: () => stats.mrWithoutApproval === 0,
                value: () => stats.mrWithoutApproval + ' sans approval',
                target: '0',
                xp: 150
            },
            {
                id: 'constructive_reviews',
                category: 'quality',
                icon: '💬',
                name: 'Constructive Reviews',
                criteria: '> 3 commentaires / MR',
                tip: 'Encouragez les discussions constructives sur le code.',
                check: () => stats.avgCommentsPerMR > 3,
                value: () => stats.avgCommentsPerMR.toFixed(1) + ' / MR',
                target: '> 3',
                xp: 100
            },

            // ──────────────────────────────────────────────────────────────
            // ⚙️ STABILITÉ & PIPELINES (5 badges)
            // ──────────────────────────────────────────────────────────────
            {
                id: 'stable_build',
                category: 'stability',
                icon: '✅',
                name: 'Stable Build',
                criteria: 'Taux de succès > 90%',
                tip: 'Identifiez et corrigez les tests flaky.',
                check: () => stats.successRate > 90,
                value: () => stats.successRate + '%',
                target: '> 90%',
                xp: 150
            },
            {
                id: 'pipeline_resilient',
                category: 'stability',
                icon: '🛡️',
                name: 'Pipeline Resilient',
                criteria: 'Échecs isolés (max 1 consécutif)',
                tip: 'Réagissez vite aux premiers signes de problème.',
                check: () => stats.pipelineResilience,
                value: () => stats.maxFailedStreak + ' échecs consécutifs max',
                target: '≤ 1',
                xp: 100
            },
            {
                id: 'quick_fix',
                category: 'stability',
                icon: '🔧',
                name: 'Quick Fix',
                criteria: 'MTTR < 2h',
                tip: 'Préparez des runbooks pour les incidents courants.',
                check: () => stats.mttr !== null && stats.mttr < 2,
                value: () => stats.mttr !== null ? stats.mttr.toFixed(1) + 'h' : 'N/A',
                target: '< 2h',
                xp: 200
            },
            {
                id: 'no_pipeline_red',
                category: 'stability',
                icon: '🚦',
                name: 'No Pipeline Red',
                criteria: 'Aucun pipeline failed sur la semaine',
                tip: 'Maintenez un taux de succès parfait cette semaine.',
                check: () => stats.noFailedWeek,
                value: () => stats.noFailedWeek ? '✓ 0 échec' : '✗ Échecs détectés',
                target: '0 échec',
                xp: 100
            },
            {
                id: 'trend_up',
                category: 'stability',
                icon: '📈',
                name: 'Trend Up',
                criteria: 'Taux succès en hausse sur 1 mois',
                tip: 'Améliorez continuellement votre CI/CD.',
                check: () => stats.trendUp,
                value: () => stats.trendUp ? '✓ En hausse' : '✗ Stagnant/Baisse',
                target: 'Hausse',
                xp: 75
            },

            // ──────────────────────────────────────────────────────────────
            // 🧹 HYGIÈNE & REPOSITORY (9 badges)
            // ──────────────────────────────────────────────────────────────
            {
                id: 'clean_repo',
                category: 'hygiene',
                icon: '🧹',
                name: 'Clean Repo',
                criteria: '0 branches inactives > 30 jours',
                tip: 'Supprimez les branches déjà mergées.',
                check: () => stats.staleBranches === 0,
                value: () => stats.staleBranches + ' branches stale',
                target: '0',
                xp: 75
            },
            {
                id: 'stale_branch_hunter',
                category: 'hygiene',
                icon: '🌿',
                name: 'Stale Branch Hunter',
                criteria: '< 5 branches inactives',
                tip: 'Nettoyez régulièrement vos branches.',
                check: () => stats.staleBranches < 5,
                value: () => stats.staleBranches + ' branches',
                target: '< 5',
                xp: 50
            },
            {
                id: 'lock_files_present',
                category: 'hygiene',
                icon: '🔒',
                name: 'Lock Files Present',
                criteria: 'package-lock / yarn.lock / poetry.lock présent',
                tip: 'Committez vos fichiers de lock pour garantir la reproductibilité.',
                check: () => stats.hasLockFile,
                value: () => stats.hasLockFile ? '✓ Présent' : '✗ Absent',
                target: 'Présent',
                xp: 75
            },
            {
                id: 'essential_files',
                category: 'hygiene',
                icon: '📁',
                name: 'Essential Files',
                criteria: 'README + .gitignore + CHANGELOG présents',
                tip: 'Documentez votre projet avec les fichiers essentiels.',
                check: () => stats.hasReadme && stats.hasGitignore && stats.hasChangelog,
                value: () => {
                    const files = [];
                    if (stats.hasReadme) files.push('README');
                    if (stats.hasGitignore) files.push('.gitignore');
                    if (stats.hasChangelog) files.push('CHANGELOG');
                    return files.length + '/3 présents';
                },
                target: '3/3',
                xp: 100
            },
            {
                id: 'branch_protection',
                category: 'hygiene',
                icon: '🛡️',
                name: 'Branch Protection',
                criteria: 'Branche principale protégée',
                tip: 'Settings → Repository → Protected branches.',
                check: () => stats.protectedBranches,
                value: () => stats.protectedBranches ? '✓ Protégée' : '✗ Non protégée',
                target: 'Protégée',
                xp: 100
            },
            {
                id: 'force_push_blocked',
                category: 'hygiene',
                icon: '🚫',
                name: 'Force Push Blocked',
                criteria: 'Force push interdit sur main',
                tip: 'Désactivez allow_force_push sur la branche protégée.',
                check: () => stats.forcePushBlocked,
                value: () => stats.forcePushBlocked ? '✓ Bloqué' : '✗ Autorisé',
                target: 'Bloqué',
                xp: 100
            },
            {
                id: 'no_zombie_mrs',
                category: 'hygiene',
                icon: '🧟',
                name: 'No Zombie MRs',
                criteria: '0 MR ouvertes > 7 jours',
                tip: 'Fermez ou mergez vos MRs rapidement.',
                check: () => stats.zombieMRs === 0,
                value: () => stats.zombieMRs + ' MRs zombies',
                target: '0',
                xp: 100
            },
            {
                id: 'mr_cycle_time',
                category: 'hygiene',
                icon: '⏲️',
                name: 'MR Cycle Time',
                criteria: 'MR ouvertes < 3 jours en moyenne',
                tip: 'Réduisez le temps entre création et merge.',
                check: () => stats.avgMRCycleTime !== null && stats.avgMRCycleTime < 3,
                value: () => stats.avgMRCycleTime !== null ? stats.avgMRCycleTime.toFixed(1) + ' jours' : 'N/A',
                target: '< 3 jours',
                xp: 100
            },
            {
                id: 'merged_branches_cleaned',
                category: 'hygiene',
                icon: '🗑️',
                name: 'Merged Branches Cleaned',
                criteria: '< 3 branches mergées non supprimées',
                tip: 'Activez la suppression auto des branches après merge.',
                check: () => stats.mergedBranchesNotDeleted < 3,
                value: () => stats.mergedBranchesNotDeleted + ' à nettoyer',
                target: '< 3',
                xp: 75
            },

            // ──────────────────────────────────────────────────────────────
            // 🚌 RÉSILIENCE & CONNAISSANCES (4 badges)
            // ──────────────────────────────────────────────────────────────
            {
                id: 'bus_factor_safe',
                category: 'resilience',
                icon: '🚌',
                name: 'Bus Factor Safe',
                criteria: '≥ 3 contributeurs actifs',
                tip: 'Impliquez plus de développeurs dans le projet.',
                check: () => stats.activeContributors >= 3,
                value: () => stats.activeContributors + ' contributeurs',
                target: '≥ 3',
                xp: 100
            },
            {
                id: 'work_balanced',
                category: 'resilience',
                icon: '⚖️',
                name: 'Work Balanced',
                criteria: 'Top contributeur < 40% des commits',
                tip: 'Répartissez le travail entre les membres de l\'équipe.',
                check: () => stats.topContributorShare < 40,
                value: () => stats.topContributorShare + '% par le top',
                target: '< 40%',
                xp: 100
            },
            {
                id: 'reviewer_rotation',
                category: 'resilience',
                icon: '🔄',
                name: 'Reviewer Rotation',
                criteria: '≥ 3 reviewers distincts sur les MR',
                tip: 'Faites tourner les reviewers pour partager la connaissance.',
                check: () => stats.distinctReviewers >= 3,
                value: () => stats.distinctReviewers + ' reviewers',
                target: '≥ 3',
                xp: 100
            },
            {
                id: 'regular_activity',
                category: 'resilience',
                icon: '📅',
                name: 'Regular Activity',
                criteria: 'Gap max entre commits < 7 jours',
                tip: 'Maintenez une activité régulière sur le projet.',
                check: () => stats.maxCommitGap !== null && stats.maxCommitGap < 7,
                value: () => stats.maxCommitGap !== null ? stats.maxCommitGap + ' jours max' : 'N/A',
                target: '< 7 jours',
                xp: 75
            },

            // ──────────────────────────────────────────────────────────────
            // ⚡ PRATIQUES DEVOPS (7 badges)
            // ──────────────────────────────────────────────────────────────
            {
                id: 'feature_flags',
                category: 'practices',
                icon: '🚩',
                name: 'Feature Flags',
                criteria: 'Utilisation de feature flags',
                tip: 'Utilisez GitLab Feature Flags ou Unleash.',
                check: () => stats.hasFeatureFlags,
                value: () => stats.hasFeatureFlags ? stats.featureFlagsCount + ' flags' : '✗ Aucun',
                target: '≥ 1',
                xp: 100
            },
            {
                id: 'ci_versioned',
                category: 'practices',
                icon: '📝',
                name: 'CI Versioned',
                criteria: '.gitlab-ci.yml dans le repo',
                tip: 'Versionnez votre pipeline dans le repo.',
                check: () => stats.ciVersioned,
                value: () => stats.ciVersioned ? '✓ Versionné' : '✗ Non versionné',
                target: 'Versionné',
                xp: 75
            },
            {
                id: 'multi_stage_pipeline',
                category: 'practices',
                icon: '🔀',
                name: 'Multi-Stage Pipeline',
                criteria: '≥ 3 stages dans le pipeline',
                tip: 'Structurez votre pipeline : build, test, deploy.',
                check: () => stats.pipelineStages >= 3,
                value: () => stats.pipelineStages + ' stages',
                target: '≥ 3',
                xp: 75
            },
            {
                id: 'automated_tests',
                category: 'practices',
                icon: '🧪',
                name: 'Automated Tests',
                criteria: 'Stage de test dans le pipeline',
                tip: 'Ajoutez un job de test dans votre CI.',
                check: () => stats.hasTestStage,
                value: () => stats.hasTestStage ? '✓ Présent' : '✗ Absent',
                target: 'Présent',
                xp: 100
            },
            {
                id: 'automated_deploy',
                category: 'practices',
                icon: '🚀',
                name: 'Automated Deploy',
                criteria: 'Stage de deploy dans le pipeline',
                tip: 'Automatisez vos déploiements.',
                check: () => stats.hasDeployStage,
                value: () => stats.hasDeployStage ? '✓ Présent' : '✗ Absent',
                target: 'Présent',
                xp: 100
            },
            {
                id: 'env_separation',
                category: 'practices',
                icon: '🌍',
                name: 'Environment Separation',
                criteria: 'Variables d\'environnement par env',
                tip: 'Utilisez les environnements GitLab (dev, staging, prod).',
                check: () => stats.hasEnvSeparation,
                value: () => stats.hasEnvSeparation ? '✓ Séparés' : '✗ Non séparés',
                target: 'Séparés',
                xp: 75
            },
            {
                id: 'rollback_ready',
                category: 'practices',
                icon: '⏪',
                name: 'Rollback Ready',
                criteria: 'Job de rollback disponible',
                tip: 'Préparez un job pour revenir à la version précédente.',
                check: () => stats.hasRollbackJob,
                value: () => stats.hasRollbackJob ? '✓ Disponible' : '✗ Absent',
                target: 'Disponible',
                xp: 100
            },
        ];


        const CATEGORIES = {
            delivery: { 
                icon: '🚀', 
                name: 'Delivery', 
                desc: 'Fréquence, stabilité, vitesse',
                badges: [] 
            },
            quality: { 
                icon: '🔒', 
                name: 'Qualité & Merge Requests', 
                desc: 'Review, approbations, taille MR',
                badges: [] 
            },
            stability: { 
                icon: '⚙️', 
                name: 'Stabilité & Pipelines', 
                desc: 'Résilience, recovery, tendance',
                badges: [] 
            },
            hygiene: { 
                icon: '🧹', 
                name: 'Hygiène & Repository', 
                desc: 'Branches, fichiers, protection',
                badges: [] 
            },
            resilience: { 
                icon: '🚌', 
                name: 'Résilience & Connaissances', 
                desc: 'Bus factor, répartition, rotation',
                badges: [] 
            },
            practices: { 
                icon: '⚡', 
                name: 'Pratiques DevOps', 
                desc: 'Feature flags, CI/CD, automation',
                badges: [] 
            },
        };


        // ══════════════════════════════════════════════════════════════════
        //  INITIALISATION
        // ══════════════════════════════════════════════════════════════════


        async function init() {
            // Nouveau format hub : localStorage 'devops_hub_workspaces' (JSON) + 'hub_selected_repo_id'
            // Auth centralisee (devops_hub_workspaces + fallback sessionStorage legacy)
            const _auth = window.Salsifi.loadAuth({ redirect: false });
            if (_auth) { token = _auth.token; GITLAB_URL = _auth.gitlabUrl; }

            // Project ID : nouveau format puis ancien
            const selectedRepoId = localStorage.getItem('hub_selected_repo_id');
            projectId = selectedRepoId || sessionStorage.getItem('gitlab_project_id');

            if (!token || !GITLAB_URL) {
                window.location.href = 'login.html';
                return;
            }

            if (!projectId) {
                document.getElementById('badgesContainer').innerHTML = `
                    <div class="loading">
                        ⚠️ Aucun projet sélectionné.<br>
                        <a href="hub.html" style="color: var(--accent-light, #a78bfa);">Retour au Hub</a>
                    </div>
                `;
                return;
            }

            // Charger les données
            await loadAllStats();

            // Afficher
            renderBadges();
            updateSummary();
            setupFilters();

            // Update time
            document.getElementById('lastUpdate').textContent = 
                'Dernière analyse : ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }


        // ══════════════════════════════════════════════════════════════════
        //  CHARGEMENT DES DONNÉES GITLAB
        // ══════════════════════════════════════════════════════════════════


        const CAPABILITIES = [
            {
                id: 'golden-path', icon: '🛤️', name: 'Golden path de livraison standard',
                requires: ['pipeline_as_code', 'branch_protection', 'automated_tests', 'lock_files_present'],
                enables: 'Ton dépôt est prêt pour le pipeline de livraison standard : génération complète, déploiement de test, feature flags, release notes et un score DORA fiable.',
                modules: [
                    ['Pipeline Generator', 'pipeline-generator.html', 'générer le pipeline complet'],
                    ['Feature Flag Manager', 'feature-flag-manager.html', 'piloter les feature flags'],
                    ['Release Notes', 'release-notes.html', 'release notes automatiques'],
                    ['DORA Insights', 'insights.html', 'score DORA fiable'],
                ],
            },
            {
                id: 'controlled-delivery', icon: '🎛️', name: 'Livraison contrôlée', dependsOn: 'golden-path',
                requires: ['env_separation', 'rollback_ready', 'high_stability', 'approval_rules'],
                enables: 'Tu peux viser le déploiement progressif : canary, progressive delivery, vérification post-déploiement, rollback automatique.',
                modules: [
                    ['Pipeline Generator', 'pipeline-generator.html', 'ajouter canary & rollback au pipeline'],
                ],
            },
            {
                id: 'lifecycle', icon: '🧹', name: 'Cycle de vie du dépôt maîtrisé',
                requires: ['merged_branches_cleaned', 'no_zombie_mrs', 'essential_files', 'clean_repo'],
                enables: 'Base saine : moins de bruit, dépôt propre — le terrain idéal pour automatiser sans surprise.',
                modules: [
                    ['Branch Monitor', 'branch-cleaner.html', 'nettoyer les branches mergées'],
                    ['Repo Analyzer', 'repo-analyzer.html', 'analyser la santé du dépôt'],
                ],
            },
        ];

        const BADGE_BY_ID = {};
        BADGES.forEach(b => { BADGE_BY_ID[b.id] = b; });

        let capSelected = null;          // capacité dépliée (progressive disclosure)

        let _capUnlocked = new Set();     // dernier set de badges débloqués (pour re-render au clic)


        const SALSI_ALIAS = {
            stable_build: 'green_pipeline',       // successRate > 90
            quick_fix: 'recovery_master',         // mttr < 2h
            pipeline_resilient: 'no_failed_streak' // max 1 échec consécutif
        };

        const METRIC_LABELS = {
            successRate: 'taux de succès', weeklyDeploys: 'déploiements/sem', reviewedMRRate: 'MR relues',
            activeContributors: 'contributeurs actifs', distinctReviewers: 'relecteurs distincts',
            avgPipelineTime: 'durée pipeline', mttr: 'MTTR', staleBranches: 'branches mortes',
            zombieMRs: 'MR zombies', mergedBranchesNotDeleted: 'branches mergées non supprimées',
            maxFailedStreak: 'série d\'échecs', avgMRCycleTime: 'cycle MR', topContributorShare: 'part du top contributeur'
        };

        const BADGE_ELIGIBLE = {
            no_failed_streak: pipelinesObserved,
            pipeline_resilient: pipelinesObserved,
            no_merge_without_approval: mrsObserved,
            no_zombie_mrs: mrsObserved
        };

        function formatDuration(seconds) {
            if (seconds < 60) return seconds + 's';
            if (seconds < 3600) return Math.round(seconds / 60) + 'm';
            return Math.floor(seconds / 3600) + 'h' + Math.round((seconds % 3600) / 60) + 'm';
        }

        // GO!
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
