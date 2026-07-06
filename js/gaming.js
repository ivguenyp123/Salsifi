        // ══════════════════════════════════════════════════════════════════
        //  CONFIGURATION
        // ══════════════════════════════════════════════════════════════════

        let GITLAB_URL = null;
        let projectId = null;
        let token = null;

        // ── Helpers fetch ──────────────────────────────────────────────────
        // Wrapper avec retry simple sur 429.
        async function fetchGitLab(endpoint) {
            try {
                const r = await window.Salsifi.gitlabFetch(GITLAB_URL, token, endpoint);
                return r.ok ? r.json() : null;
            } catch { return null; }
        }

        // Pagination automatique avec garde-fou 50 pages (5000 résultats max).
        async function fetchAll(endpoint) {
            return window.Salsifi.gitlabPaginate(GITLAB_URL, token, endpoint);
        }

        // POST pour /ci/lint (parse YAML côté serveur).
        async function postGitLab(endpoint, body) {
            try {
                let r = await fetch(`${GITLAB_URL}/api/v4${endpoint}`, {
                    method: 'POST',
                    headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (r.status === 429) {
                    const retryAfter = parseInt(r.headers.get('Retry-After')) || 2;
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    r = await fetch(`${GITLAB_URL}/api/v4${endpoint}`, {
                        method: 'POST',
                        headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                }
                if (!r.ok) return null;
                return r.json();
            } catch { return null; }
        }

        // Échappement HTML pour tout contenu issu de l'API injecté via innerHTML.
        function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }

        // Stats collectées depuis GitLab
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
            const authRaw = localStorage.getItem('devops_hub_workspaces');
            if (authRaw) {
                try {
                    const auth = JSON.parse(authRaw);
                    token = auth.token;
                    GITLAB_URL = auth.gitlabUrl;
                } catch { /* fallback ci-dessous */ }
            }
            // Fallback ancien format (sessionStorage)
            if (!token) token = sessionStorage.getItem('gitlab_token');
            if (!GITLAB_URL) GITLAB_URL = sessionStorage.getItem('gitlab_base_url');

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

        async function loadAllStats() {
            // On récupère d'abord le projet pour avoir `default_branch`, lu ensuite
            // par les loaders qui en ont besoin (pipelines, branches, repo files,
            // protection settings).
            const project = await fetchGitLab(`/projects/${projectId}`);
            const defaultBranch = project?.default_branch || null;
            try {
                await Promise.all([
                    loadPipelineStats(defaultBranch),
                    loadMRStats(),
                    loadBranchStats(defaultBranch),
                    loadTagsStats(),
                    loadRepoFiles(defaultBranch),
                    loadProtectionSettings(defaultBranch),
                    loadContributorStats(),
                    loadFeatureFlagsStats(),
                    loadCommitGap()
                ]);
            } catch (e) {
                console.error('Erreur chargement stats:', e);
            }
        }

        async function loadPipelineStats(defaultBranch) {
            const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const since30dMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
            const since15dMs = Date.now() - 15 * 24 * 60 * 60 * 1000;
            const since7dMs  = Date.now() - 7  * 24 * 60 * 60 * 1000;

            const pipelines = await fetchAll(`/projects/${projectId}/pipelines?updated_after=${since30d}`);
            if (!pipelines.length) return;

            // Stats de base — utilise created_at pour la fenêtre 30j (updated_after peut
            // remonter des pipelines anciens relancés).
            const pipelines30 = pipelines.filter(p => new Date(p.created_at).getTime() >= since30dMs);
            const successful = pipelines30.filter(p => p.status === 'success');
            const failed = pipelines30.filter(p => p.status === 'failed');
            stats.successRate = pipelines30.length > 0
                ? Math.round((successful.length / pipelines30.length) * 100)
                : 0;

            // Pipelines cette semaine (fenêtre 7j sur created_at, pas updated_at).
            // Dedupe par SHA pour ne pas gonfler weeklyDeploys quand un commit
            // déclenche plusieurs pipelines.
            const weeklyPipelines = pipelines.filter(p => new Date(p.created_at).getTime() >= since7dMs);
            const weeklySuccessBySha = {};
            weeklyPipelines.forEach(p => {
                if (p.status === 'success' && p.sha) weeklySuccessBySha[p.sha] = true;
            });
            stats.weeklyDeploys = Object.keys(weeklySuccessBySha).length
                + weeklyPipelines.filter(p => p.status === 'success' && !p.sha).length;
            stats.noFailedWeek = weeklyPipelines.filter(p => p.status === 'failed').length === 0;

            // Durée moyenne — 20 plus récents success en parallèle (au lieu de séquentiel).
            const sampleForDuration = successful.slice(0, 20);
            const details = await Promise.all(
                sampleForDuration.map(p => fetchGitLab(`/projects/${projectId}/pipelines/${p.id}`))
            );
            const durations = details.filter(d => d?.duration).map(d => d.duration);
            if (durations.length > 0) {
                stats.avgPipelineTime = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
            }

            // Max failed streak — tri en place dans une copie pour éviter de muter `pipelines`.
            const byRecency = [...pipelines30].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            let maxStreak = 0, currentStreak = 0;
            for (const p of byRecency) {
                if (p.status === 'failed') {
                    currentStreak++;
                    maxStreak = Math.max(maxStreak, currentStreak);
                } else {
                    currentStreak = 0;
                }
            }
            stats.maxFailedStreak = maxStreak;
            stats.pipelineResilience = maxStreak <= 1;

            // MTTR : séquences failed → success sur la MÊME ref, sur les branches "prod"
            // (main, master, + default_branch). Cap à 7j pour ne pas pourrir la médiane
            // avec des pipelines abandonnés. Médiane (plus robuste que la moyenne).
            const MTTR_CAP_HOURS = 24 * 7;
            const prodBranches = new Set(['main', 'master']);
            if (defaultBranch) prodBranches.add(defaultBranch);
            const prodPipelinesByRef = {};
            pipelines30
                .filter(p => prodBranches.has(p.ref))
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                .forEach(p => {
                    if (!prodPipelinesByRef[p.ref]) prodPipelinesByRef[p.ref] = [];
                    prodPipelinesByRef[p.ref].push(p);
                });
            const recoveryTimes = [];
            for (const ref in prodPipelinesByRef) {
                const list = prodPipelinesByRef[ref];
                for (let i = 0; i < list.length - 1; i++) {
                    if (list[i].status !== 'failed') continue;
                    const next = list.slice(i + 1).find(n => n.status === 'success');
                    if (next) {
                        const hours = (new Date(next.created_at) - new Date(list[i].created_at)) / 3600000;
                        if (hours > 0 && hours <= MTTR_CAP_HOURS) recoveryTimes.push(hours);
                    }
                }
            }
            if (recoveryTimes.length > 0) {
                recoveryTimes.sort((a, b) => a - b);
                const mid = Math.floor(recoveryTimes.length / 2);
                stats.mttr = recoveryTimes.length % 2 === 0
                    ? (recoveryTimes[mid - 1] + recoveryTimes[mid]) / 2
                    : recoveryTimes[mid];
            }

            // Deploys from main (avec default_branch ajouté).
            const mainPipelines = pipelines30.filter(p => prodBranches.has(p.ref));
            stats.deploysFromMain = mainPipelines.filter(p => p.status === 'success').length;
            stats.totalDeploys = successful.length;

            // trendUp : DF des 15 derniers jours vs DF des 15 jours précédents (J-30 à J-15).
            // Strict +10% pour éviter le bruit. Compte par SHA dédupé.
            const recentShas = new Set();
            const previousShas = new Set();
            pipelines30.forEach(p => {
                if (p.status !== 'success' || !p.sha) return;
                const ms = new Date(p.created_at).getTime();
                if (ms >= since15dMs) recentShas.add(p.sha);
                else if (ms >= since30dMs) previousShas.add(p.sha);
            });
            // Évite la division par zéro : si l'antérieur est nul mais le récent ≥1,
            // c'est une vraie amélioration.
            stats.trendUp = previousShas.size === 0
                ? recentShas.size >= 1
                : recentShas.size > previousShas.size * 1.1;
        }

        async function loadMRStats() {
            const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const mrs = await fetchAll(`/projects/${projectId}/merge_requests?state=merged&updated_after=${since30d}`);
            if (!mrs.length) return;

            // Limite à 30 dernières MRs mergées pour rester raisonnable côté N+1.
            // Auparavant 30 × 4 fetches séquentiels = ~120 appels en série. Maintenant
            // tous en parallèle via Promise.all.
            const sample = mrs.slice(0, 30);
            const enriched = await Promise.all(sample.map(async (mr) => {
                const [detail, changes, approvals, notes] = await Promise.all([
                    fetchGitLab(`/projects/${projectId}/merge_requests/${mr.iid}`),
                    fetchGitLab(`/projects/${projectId}/merge_requests/${mr.iid}/changes`),
                    fetchGitLab(`/projects/${projectId}/merge_requests/${mr.iid}/approvals`),
                    fetchAll(`/projects/${projectId}/merge_requests/${mr.iid}/notes?sort=asc&order_by=created_at`)
                ]);
                return { mr, detail, changes, approvals, notes };
            }));

            let withApproval = 0;
            let totalSize = 0;
            let sizeCount = 0;
            let totalFiles = 0;
            let filesCount = 0;
            let totalComments = 0;
            const reviewTimes = []; // heures, premier commentaire non-system d'un autre user → merged_at
            const cycleTimes = [];   // jours, created_at → merged_at
            const reviewers = new Set();

            for (const e of enriched) {
                const { mr, detail, changes, approvals, notes } = e;
                // Taille (nombre de lignes ajoutées+supprimées si on peut le calculer)
                if (detail?.changes_count) {
                    totalSize += parseInt(detail.changes_count) || 0;
                    sizeCount++;
                }
                if (changes?.changes?.length) {
                    totalFiles += changes.changes.length;
                    filesCount++;
                }
                if (approvals?.approved_by?.length > 0) {
                    withApproval++;
                    approvals.approved_by.forEach(a => {
                        const id = a.user?.id || a.user?.username;
                        if (id) reviewers.add(id);
                    });
                }
                if (Array.isArray(notes)) {
                    const userNotes = notes.filter(n => !n.system);
                    totalComments += userNotes.length;
                    // Premier commentaire non-system d'un autre user que l'auteur de la MR.
                    // C'est notre proxy "début de review réelle".
                    const authorId = mr.author?.id;
                    const firstReview = userNotes.find(n =>
                        n.author?.id && n.author.id !== authorId
                    );
                    if (firstReview && mr.merged_at) {
                        const reviewStart = new Date(firstReview.created_at);
                        const merged = new Date(mr.merged_at);
                        const hours = (merged - reviewStart) / 3600000;
                        if (hours > 0 && hours < 24 * 30) reviewTimes.push(hours);
                    }
                }
                if (mr.created_at && mr.merged_at) {
                    const days = (new Date(mr.merged_at) - new Date(mr.created_at)) / 86400000;
                    if (days >= 0) cycleTimes.push(days);
                }
            }

            stats.reviewedMRRate = mrs.length > 0 ? Math.round((withApproval / mrs.length) * 100) : 0;
            stats.avgMRSize = sizeCount > 0 ? Math.round(totalSize / sizeCount) : null;
            stats.avgMRFiles = filesCount > 0 ? totalFiles / filesCount : null;
            stats.avgCommentsPerMR = mrs.length > 0 ? totalComments / mrs.length : 0;
            stats.distinctReviewers = reviewers.size;
            stats.avgMRCycleTime = cycleTimes.length > 0
                ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
                : null;
            // avgReviewTime : médiane (plus robuste que la moyenne).
            if (reviewTimes.length > 0) {
                reviewTimes.sort((a, b) => a - b);
                const mid = Math.floor(reviewTimes.length / 2);
                stats.avgReviewTime = reviewTimes.length % 2 === 0
                    ? (reviewTimes[mid - 1] + reviewTimes[mid]) / 2
                    : reviewTimes[mid];
            }
            stats.mrWithoutApproval = mrs.length - withApproval;

            // MRs zombies (ouvertes > 7 jours).
            const openMrs = await fetchAll(`/projects/${projectId}/merge_requests?state=opened`);
            const sevenDaysAgo = Date.now() - 7 * 86400000;
            stats.zombieMRs = openMrs.filter(mr => new Date(mr.created_at).getTime() < sevenDaysAgo).length;
        }

        async function loadBranchStats(defaultBranch) {
            const branches = await fetchAll(`/projects/${projectId}/repository/branches`);
            if (!branches.length) return;

            const now = Date.now();
            const thirtyDaysAgo = now - 30 * 86400000;
            // Branches durables exclues du décompte stale, aligné avec hub.js / repo-analyzer.
            const protectedNames = new Set(['main', 'master', 'develop', 'dev']);
            if (defaultBranch) protectedNames.add(defaultBranch);

            stats.staleBranches = branches.filter(b => {
                if (protectedNames.has(b.name)) return false;
                const lastActivity = new Date(b.commit?.committed_date || b.commit?.created_at);
                return lastActivity.getTime() < thirtyDaysAgo;
            }).length;

            // mergedBranchesNotDeleted : vraie détection croisée.
            // On regarde les MRs mergées récemment, dont la source_branch existe encore.
            // C'est imparfait (la source_branch peut être réutilisée) mais bien plus fiable
            // que b.merged qui n'est pas un champ standard.
            const since30dIso = new Date(thirtyDaysAgo).toISOString();
            const mergedMRs = await fetchAll(`/projects/${projectId}/merge_requests?state=merged&updated_after=${since30dIso}`);
            const branchNames = new Set(branches.map(b => b.name));
            const protectedSet = protectedNames;
            const orphanedSources = new Set();
            mergedMRs.forEach(mr => {
                if (!mr.source_branch) return;
                if (protectedSet.has(mr.source_branch)) return;
                if (branchNames.has(mr.source_branch)) orphanedSources.add(mr.source_branch);
            });
            stats.mergedBranchesNotDeleted = orphanedSources.size;
        }

        async function loadTagsStats() {
            const tags = await fetchAll(`/projects/${projectId}/repository/tags`);
            if (!tags.length) return;

            // Semver strict : major.minor.patch + optionnel prerelease/build (PEP 440 simplifié).
            // Refuse `1.2.3foo` ou `v1.0` qui passaient avant.
            const semverPattern = /^v?\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
            stats.hasSemverTags = tags.some(t => semverPattern.test(t.name));

            const oneMonthAgo = Date.now() - 30 * 86400000;
            stats.taggedReleasesMonth = tags.filter(t => {
                const tagDate = new Date(t.commit?.committed_date || t.commit?.created_at);
                return tagDate.getTime() >= oneMonthAgo;
            }).length;
        }

        async function loadRepoFiles(defaultBranch) {
            // Tree récursif pour détecter les fichiers en sous-dossier (rare pour README,
            // .gitignore etc. mais utile si la racine est elle-même un sous-dossier
            // ou si on cherche des fichiers .lock dans monorepo).
            const files = await fetchAll(`/projects/${projectId}/repository/tree?recursive=true`);
            if (!files.length) return;

            const fileNamesAtRoot = files
                .filter(f => !f.path.includes('/'))
                .map(f => f.name.toLowerCase());
            const allPaths = files.map(f => (f.path || '').toLowerCase());

            stats.hasCiFile = fileNamesAtRoot.includes('.gitlab-ci.yml');
            stats.ciVersioned = stats.hasCiFile;
            stats.hasReadme = fileNamesAtRoot.some(f => f.startsWith('readme'));
            stats.hasGitignore = fileNamesAtRoot.includes('.gitignore');
            stats.hasChangelog = fileNamesAtRoot.some(f => f.includes('changelog'));
            stats.hasLockFile = allPaths.some(p => {
                const name = p.split('/').pop();
                return [
                    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
                    'poetry.lock', 'pipfile.lock', 'composer.lock', 'gemfile.lock'
                ].includes(name);
            });

            // Si .gitlab-ci.yml présent, on demande à GitLab de le parser via /ci/lint.
            // C'est plus fiable qu'un parsing YAML maison côté client (yaml multiline,
            // includes/extends, anchors, etc. gérés par le moteur GitLab).
            if (stats.hasCiFile) {
                await loadPipelineConfig(defaultBranch);
            }
        }

        // Parse `.gitlab-ci.yml` via l'endpoint /ci/lint qui retourne les jobs
        // résolus côté serveur (avec includes/extends expandus).
        async function loadPipelineConfig(defaultBranch) {
            const ref = defaultBranch || 'main';
            // 1. Récupérer le contenu brut du fichier
            const fileData = await fetchGitLab(
                `/projects/${projectId}/repository/files/${encodeURIComponent('.gitlab-ci.yml')}?ref=${encodeURIComponent(ref)}`
            );
            if (!fileData?.content) return;
            let yamlContent;
            try {
                yamlContent = atob(fileData.content);
            } catch { return; }

            // 2. Demander à GitLab de parser+linter
            const lintResult = await postGitLab(`/projects/${projectId}/ci/lint`, {
                content: yamlContent
            });
            // Selon la version GitLab, le retour expose `merged_yaml` (string) ou `jobs` (array).
            if (!lintResult) return;
            // Stages : la prop `stages` du résultat lint (ou présents dans le merged_yaml).
            // Le format de l'API a évolué entre versions ; on regarde plusieurs sources.
            let stages = lintResult.stages;
            let jobs = lintResult.jobs;
            // Fallback : si /ci/lint ne retourne pas la structure parsée, on tente
            // une heuristique très conservative sur le YAML brut.
            if (!stages && !jobs && yamlContent) {
                stages = extractStagesFromYaml(yamlContent);
                jobs = extractJobsFromYaml(yamlContent);
            }
            if (Array.isArray(stages)) {
                stats.pipelineStages = stages.length;
            } else if (Array.isArray(jobs)) {
                stats.pipelineStages = new Set(jobs.map(j => j.stage).filter(Boolean)).size;
            }
            // Détection des stages/jobs sur le nom (mots-clés FR/EN classiques).
            const allNames = [];
            if (Array.isArray(stages)) allNames.push(...stages);
            if (Array.isArray(jobs)) allNames.push(...jobs.map(j => j.name).filter(Boolean));
            const lower = allNames.map(n => String(n).toLowerCase());
            stats.hasTestStage   = lower.some(n => /test|spec|unit|integration|qa/.test(n));
            stats.hasDeployStage = lower.some(n => /deploy|release|publish|push/.test(n));
            stats.hasRollbackJob = lower.some(n => /rollback|revert/.test(n));
            // Environment separation : présence d'au moins 2 environnements distincts
            // dans les jobs (production + staging/dev/qa par exemple).
            const envNames = new Set();
            if (Array.isArray(jobs)) {
                jobs.forEach(j => {
                    if (j.environment) {
                        const envName = typeof j.environment === 'string'
                            ? j.environment
                            : j.environment.name;
                        if (envName) envNames.add(String(envName).toLowerCase());
                    }
                });
            }
            // Fallback : recherche `environment:` dans le YAML brut si l'API ne retourne pas
            // le champ environment dans les jobs.
            if (envNames.size === 0 && yamlContent) {
                const matches = yamlContent.match(/environment:\s*(?:name:\s*)?["']?([\w-${}.]+)["']?/gi) || [];
                matches.forEach(m => {
                    const v = m.replace(/environment:\s*(?:name:\s*)?["']?/i, '').replace(/["']?$/, '').trim();
                    if (v) envNames.add(v.toLowerCase());
                });
            }
            stats.hasEnvSeparation = envNames.size >= 2;
        }

        // Heuristiques YAML très conservatives, utilisées uniquement si /ci/lint
        // ne retourne pas la structure parsée. Ne pas se reposer dessus pour des
        // YAML complexes (includes, anchors) — /ci/lint reste la source de vérité.
        function extractStagesFromYaml(yaml) {
            const m = yaml.match(/^stages:\s*\n((?:\s*-\s*[\w-]+\s*\n?)+)/m);
            if (!m) return null;
            return [...m[1].matchAll(/-\s*([\w-]+)/g)].map(x => x[1]);
        }
        function extractJobsFromYaml(yaml) {
            // Top-level keys qui ressemblent à des jobs : pas en `.hidden` et pas dans
            // la liste des mots-clés réservés.
            const reserved = new Set([
                'stages', 'image', 'services', 'variables', 'before_script', 'after_script',
                'cache', 'workflow', 'include', 'default', 'pages'
            ]);
            const matches = [...yaml.matchAll(/^([a-zA-Z][\w-]*):\s*$/gm)];
            const jobs = [];
            matches.forEach(m => {
                const name = m[1];
                if (reserved.has(name) || name.startsWith('.')) return;
                // Cherche le stage du job dans les lignes suivantes (jusqu'à la prochaine
                // top-level key).
                const start = m.index + m[0].length;
                const next = yaml.slice(start).match(/^[a-zA-Z][\w-]*:\s*$/m);
                const block = next ? yaml.slice(start, start + next.index) : yaml.slice(start);
                const stageMatch = block.match(/^\s+stage:\s*["']?([\w-]+)["']?/m);
                jobs.push({ name, stage: stageMatch ? stageMatch[1] : null });
            });
            return jobs;
        }

        async function loadProtectionSettings(defaultBranch) {
            const protected_ = await fetchAll(`/projects/${projectId}/protected_branches`);
            // Branche principale considérée : default_branch si dispo, sinon main/master.
            const target = defaultBranch || 'main';
            const mainBranch = protected_.find(b => b.name === target)
                || protected_.find(b => b.name === 'main' || b.name === 'master');
            stats.protectedBranches = !!mainBranch;
            stats.forcePushBlocked = mainBranch ? !mainBranch.allow_force_push : false;

            const rules = await fetchAll(`/projects/${projectId}/approval_rules`);
            if (rules.length > 0) {
                const mainRule = rules.find(r => r.rule_type === 'any_approver') || rules[0];
                stats.approvalRulesOk = (mainRule?.approvals_required || 0) >= 2;
            }

            const project = await fetchGitLab(`/projects/${projectId}`);
            stats.resetApprovalsOnPush = project?.reset_approvals_on_push || false;
        }

        async function loadContributorStats() {
            const contributors = await fetchAll(`/projects/${projectId}/repository/contributors`);
            if (!contributors.length) return;

            stats.activeContributors = contributors.length;
            const totalCommits = contributors.reduce((sum, c) => sum + c.commits, 0);
            const top = [...contributors].sort((a, b) => b.commits - a.commits)[0];
            stats.topContributorShare = totalCommits > 0
                ? Math.round((top.commits / totalCommits) * 100)
                : 100;
        }

        // Gap max entre commits sur les 30 derniers jours, en jours.
        async function loadCommitGap() {
            const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
            const commits = await fetchAll(`/projects/${projectId}/repository/commits?since=${since30d}`);
            if (commits.length < 2) {
                // Pas assez de commits pour calculer un gap.
                // Si 1 seul commit dans les 30j, on considère le gap = 30j.
                stats.maxCommitGap = commits.length === 1 ? 30 : null;
                return;
            }
            // Commits triés du plus récent au plus ancien dans la réponse API.
            const dates = commits
                .map(c => new Date(c.created_at || c.committed_date).getTime())
                .filter(t => !isNaN(t))
                .sort((a, b) => a - b); // chrono croissant
            let maxGap = 0;
            for (let i = 1; i < dates.length; i++) {
                const gap = (dates[i] - dates[i - 1]) / 86400000;
                if (gap > maxGap) maxGap = gap;
            }
            stats.maxCommitGap = Math.round(maxGap * 10) / 10;
        }

        async function loadFeatureFlagsStats() {
            // Endpoint Premium+, peut retourner 403/404 sur CE → fetchGitLab renvoie null
            // et on garde les valeurs par défaut (hasFeatureFlags=false).
            const flags = await fetchGitLab(`/projects/${projectId}/feature_flags`);
            if (Array.isArray(flags)) {
                stats.hasFeatureFlags = flags.length > 0;
                stats.featureFlagsCount = flags.length;
            }
        }


        // ══════════════════════════════════════════════════════════════════
        //  AFFICHAGE
        // ══════════════════════════════════════════════════════════════════

        function renderBadges() {
            // Charger l'historique des badges déjà débloqués
            const storageKey = `devops_badges_v2_${projectId}`;
            const previouslyUnlocked = JSON.parse(localStorage.getItem(storageKey) || '[]');

            // Évaluer l'état actuel de chaque badge
            const currentlyUnlocked = [];
            const badgeStates = BADGES.map(b => {
                const isUnlocked = b.check();
                const wasUnlocked = previouslyUnlocked.includes(b.id);
                const isLost = wasUnlocked && !isUnlocked;
                if (isUnlocked) currentlyUnlocked.push(b.id);
                return { badge: b, isUnlocked, isLost, wasUnlocked };
            });

            // Sauvegarder les badges débloqués (inclure les anciens pour track les perdus)
            const allUnlocked = [...new Set([...previouslyUnlocked, ...currentlyUnlocked])];
            localStorage.setItem(storageKey, JSON.stringify(allUnlocked));

            // Grouper par catégorie
            for (const cat of Object.keys(CATEGORIES)) {
                CATEGORIES[cat].badges = badgeStates.filter(s => s.badge.category === cat);
            }

            let html = '';

            for (const [catId, cat] of Object.entries(CATEGORIES)) {
                const catBadges = cat.badges;
                const unlocked = catBadges.filter(s => s.isUnlocked).length;
                const lost = catBadges.filter(s => s.isLost).length;
                const total = catBadges.length;
                const percent = total > 0 ? Math.round((unlocked / total) * 100) : 0;

                let progressColor = 'red';
                if (percent >= 70) progressColor = 'green';
                else if (percent >= 40) progressColor = 'yellow';

                html += `
                    <div class="category-section" data-category="${catId}">
                        <div class="category-header">
                            <div class="category-icon">${cat.icon}</div>
                            <div class="category-info">
                                <div class="category-name">${escapeHtml(cat.name)}</div>
                                <div class="category-desc">${escapeHtml(cat.desc)}</div>
                            </div>
                            <div class="category-progress">
                                <div class="category-progress-bar">
                                    <div class="category-progress-fill ${progressColor}" style="width: ${percent}%"></div>
                                </div>
                                <span class="category-count">${unlocked}/${total}</span>
                            </div>
                        </div>
                        <div class="badges-grid">
                `;

                for (const state of catBadges) {
                    const badge = state.badge;
                    let cssClass = 'locked';
                    let statusHtml = '';
                    let xpClass = 'neutral';
                    let xpPrefix = '+';

                    if (state.isUnlocked) {
                        cssClass = 'unlocked';
                        statusHtml = '<div class="badge-status">✓ DÉBLOQUÉ</div>';
                        xpClass = 'positive';
                    } else if (state.isLost) {
                        cssClass = 'lost';
                        statusHtml = '<div class="badge-status">📉 PERDU</div>';
                        xpClass = 'negative';
                        xpPrefix = '-';
                    }

                    let tipHtml = '';
                    if (!state.isUnlocked && badge.tip) {
                        const tipClass = state.isLost ? 'badge-tip lost-tip' : 'badge-tip';
                        const tipText = state.isLost ? `Pour le récupérer : ${badge.tip}` : `💡 ${badge.tip}`;
                        tipHtml = `<div class="${tipClass}">${escapeHtml(tipText)}</div>`;
                    }

                    html += `
                        <div class="badge-card ${cssClass}" data-state="${cssClass}">
                            ${statusHtml}
                            <div class="badge-content">
                                <div class="badge-icon-wrap">${badge.icon}</div>
                                <div class="badge-details">
                                    <div class="badge-name">${escapeHtml(badge.name)}</div>
                                    <div class="badge-criteria">${escapeHtml(badge.criteria)}</div>
                                    <div class="badge-metrics">
                                        <span class="badge-metric current">📊 ${escapeHtml(badge.value())}</span>
                                        <span class="badge-metric target">🎯 ${escapeHtml(badge.target)}</span>
                                    </div>
                                    ${tipHtml}
                                    <div class="badge-xp ${xpClass}">${xpPrefix}${badge.xp} XP</div>
                                </div>
                            </div>
                        </div>
                    `;
                }

                html += '</div></div>';
            }

            document.getElementById('badgesContainer').innerHTML = html;
        }

        function updateSummary() {
            const storageKey = `devops_badges_v2_${projectId}`;
            const previouslyUnlocked = JSON.parse(localStorage.getItem(storageKey) || '[]');

            let totalXP = 0;
            let unlockedCount = 0;
            let lostCount = 0;

            for (const badge of BADGES) {
                const isUnlocked = badge.check();
                const wasUnlocked = previouslyUnlocked.includes(badge.id);

                if (isUnlocked) {
                    totalXP += badge.xp;
                    unlockedCount++;
                } else if (wasUnlocked) {
                    lostCount++;
                }
            }

            const total = BADGES.length;
            const percent = Math.round((unlockedCount / total) * 100);

            document.getElementById('totalXP').textContent = totalXP.toLocaleString();
            document.getElementById('badgesRatio').textContent = `${unlockedCount}/${total}`;
            document.getElementById('progressPercent').textContent = percent + '%';
            document.getElementById('progressFill').style.width = percent + '%';

            // Filtres counts
            document.getElementById('filterAll').textContent = total;
            document.getElementById('filterUnlocked').textContent = unlockedCount;
            document.getElementById('filterLocked').textContent = total - unlockedCount - lostCount;
            document.getElementById('filterLost').textContent = lostCount;

            // Lost box
            if (lostCount > 0) {
                document.getElementById('lostStatBox').style.display = 'block';
                document.getElementById('badgesLost').textContent = lostCount;
            }
        }

        function setupFilters() {
            const buttons = document.querySelectorAll('.filter-btn');
            buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    buttons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    const filter = btn.dataset.filter;
                    const cards = document.querySelectorAll('.badge-card');
                    const categories = document.querySelectorAll('.category-section');

                    cards.forEach(card => {
                        const state = card.dataset.state;
                        if (filter === 'all') {
                            card.classList.remove('hidden');
                        } else if (filter === state) {
                            card.classList.remove('hidden');
                        } else {
                            card.classList.add('hidden');
                        }
                    });

                    // Hide empty categories
                    categories.forEach(cat => {
                        const visibleCards = cat.querySelectorAll('.badge-card:not(.hidden)');
                        if (visibleCards.length === 0) {
                            cat.classList.add('hidden');
                        } else {
                            cat.classList.remove('hidden');
                        }
                    });
                });
            });
        }

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
