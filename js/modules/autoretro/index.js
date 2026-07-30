/* autoretro · index.js — entrée & câblage (chargé en dernier). */

        const ACTION_HANDLERS = {
            'generate-retro':       () => generateRetro(),
            'regenerate':           () => regenerate(),
            'export-teams':         () => exportToTeams(),
            'download-html':        () => downloadHTML(),
            'open-full-report':     () => openFullReport(),
            'export-all-us-teams':  () => exportAllUSTeams(),
            'export-all-us-jira':   () => exportAllUSJira(),
            'copy-us':              (e, el) => copyUS(parseInt(el.dataset.index, 10)),
            'show-us-detail':       (e, el) => showUSDetail(parseInt(el.dataset.index, 10)),
            'close-modal':          () => closeModal()
        };


        function attachEventDelegation() {
            document.body.addEventListener('click', (e) => {
                const el = e.target.closest('[data-action]');
                if (!el) return;
                const handler = ACTION_HANDLERS[el.dataset.action];
                if (handler) handler(e, el);
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeModal();
            });
        }

        // ══════════════════════════════════════════════════════════════════
        //  INITIALISATION
        // ══════════════════════════════════════════════════════════════════

        document.addEventListener('DOMContentLoaded', () => {
            // Boutons période
            document.querySelectorAll('.period-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    selectedDays = parseInt(btn.dataset.days);
                });
            });

            // Auth modèle plateforme (localStorage devops_hub_workspaces) + repo via ?repo=
            const auth = window.Salsifi.loadAuth({ redirect: false });
            if (!auth) { window.location.href = 'login.html'; return; }

            const repoId = new URLSearchParams(location.search).get('repo');
            if (!repoId) { window.location.href = HUB_URL; return; }

            token = auth.token;
            GITLAB_URL = auth.gitlabUrl;
            projectId = repoId;

            // Lien retour vers le hub
            document.querySelectorAll('[data-hub-link]').forEach(a => { a.href = HUB_URL; });

            attachEventDelegation();
            loadMilestones();
        });


        const US_TEMPLATES = {
            velocity: (alert) => {
                // Deux sous-cas : "Vélocité en baisse" vs "MRs encore ouvertes"
                if (alert.title.startsWith('Vélocité')) {
                    return {
                        type: 'process', title: '[PROCESS] Améliorer la vélocité de merge',
                        criteria: ['Ratio créées/mergées < 1.2', 'Review time < 24h', 'Daily standup review'],
                        actions: ['Limiter WIP à 2 MRs/dev', 'Review en priorité le matin', 'Pair review pour les grosses MRs'],
                        points: 3, priority: 'High'
                    };
                }
                // "MRs encore ouvertes"
                return {
                    type: 'process', title: '[SPRINT] Finaliser les MRs en cours',
                    criteria: ['Toutes les MRs du sprint mergées ou explicitement reportées', 'Backlog sprint à 0'],
                    actions: ['Review prioritaire des MRs en cours', 'Décider: merge ou report', 'Communiquer en rétro'],
                    points: 2, priority: 'High'
                };
            },
            pipeline: (alert) => ({
                type: 'quality', title: '[QUALITY] Stabiliser les pipelines',
                criteria: ['Taux succès > 85%', 'Temps fix < 2h', 'Alerting en place'],
                actions: ['Analyser les 3 jobs qui fail le plus', 'Ajouter pre-commit hooks', 'Tests locaux avant push'],
                points: 5, priority: alert.type === 'critical' ? 'Highest' : 'High'
            }),
            review: (alert) => ({
                type: 'process', title: '[PROCESS] Réduire le temps de review',
                criteria: ['Review time < 24h', 'Aucune MR > 48h sans review', 'SLA review défini'],
                actions: ['Créneaux review fixes (10h, 14h)', 'Notif Slack pour MRs > 24h', 'Rotation reviewer de la semaine'],
                points: 3, priority: alert.type === 'critical' ? 'Highest' : 'High'
            }),
            team: (alert) => {
                // Deux sous-cas : "Bus factor" vs "Activité faible"
                if (alert.title.toLowerCase().includes('bus factor')) {
                    return {
                        type: 'tech-debt', title: '[TEAM] Répartir la charge de travail',
                        criteria: ['Aucun dev > 40% commits', 'Min 3 contributeurs actifs', 'Pair prog 2x/sem'],
                        actions: ['Rotation des tâches', 'Sessions pair programming', 'Onboarding sur zones critiques'],
                        points: 5, priority: alert.type === 'critical' ? 'Highest' : 'High'
                    };
                }
                // "Activité faible"
                return {
                    type: 'tech-debt', title: '[TEAM] Investiguer la baisse d\'activité',
                    criteria: ['Comprendre les causes', 'Plan d\'action défini', 'Suivi hebdo'],
                    actions: ['1:1 avec l\'équipe', 'Identifier les blocages', 'Réajuster la charge si besoin'],
                    points: 2, priority: 'Medium'
                };
            },
            process: (alert) => {
                // Deux sous-cas : "commits mal formés" vs "self-merge"
                if (alert.title.toLowerCase().includes('commits mal formés')) {
                    return {
                        type: 'process', title: '[PROCESS] Améliorer les messages de commit',
                        criteria: ['80% Conventional Commits', 'Aucun message < 10 chars', 'Ref issue dans 50% commits'],
                        actions: ['Installer commitlint + husky', 'Template commit dans IDE', 'Rappel en daily'],
                        points: 2, priority: 'Medium'
                    };
                }
                // "self-merge"
                return {
                    type: 'process', title: '[PROCESS] Renforcer les code reviews',
                    criteria: ['0% self-merge', 'Min 1 approval obligatoire', 'CODEOWNERS actif'],
                    actions: ['Activer merge request approvals', 'Configurer CODEOWNERS', 'Sensibiliser l\'équipe'],
                    points: 2, priority: 'High'
                };
            },
            deploy: (alert) => ({
                type: 'urgent', title: '[DELIVERY] Débloquer les déploiements prod',
                criteria: ['Min 1 deploy prod/sprint', 'Process deploy documenté', 'Rollback testé'],
                actions: ['Identifier le blocage', 'Planifier une release', 'Automatiser le déploiement'],
                points: 3, priority: 'High'
            })
        };

