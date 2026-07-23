/* feature-flag-manager · index.js — entrée & câblage (chargé en dernier). */


        async function init() {
            // Auth centralisee (devops_hub_workspaces + fallback sessionStorage legacy)
            const _auth = window.Salsifi.loadAuth({ redirect: false });
            if (_auth) { token = _auth.token; GITLAB_URL = _auth.gitlabUrl; }
            projectId = sessionStorage.getItem('gitlab_project_id') || localStorage.getItem('hub_selected_repo_id');

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
                    const events = await fetchFeatureFlagAuditEvents();
                    // Alimente le cache partagé — sans ça, analyzeFlag ne peut pas
                    // estimer prodSinceDays (le cache restait vide jusqu'à l'ouverture
                    // de l'onglet Historique).
                    AUDIT_EVENTS_CACHE.byFlag = groupAuditEventsByFlag(events);
                    AUDIT_EVENTS_CACHE.total = events.length;
                    AUDIT_EVENTS_CACHE.fetchedAt = new Date();
                    AUDIT_EVENTS_CACHE.error = null;
                    // Re-render dashboard pour intégrer les events dans daysAtFullRollout,
                    // prodSinceDays et timeline.
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

            // Rapport HTML groupé par environnement
            document.getElementById('btn-env-report')?.addEventListener('click', generateEnvReport);

            // Groupes manuels : mode Auto/Manuel + ouverture du gestionnaire
            document.getElementById('group-mode-select')?.addEventListener('change', (e) => setGroupMode(e.target.value));
            document.getElementById('btn-manage-groups')?.addEventListener('click', openGroupsModal);
            document.getElementById('grp-new-name')?.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { createGroup(this.value); this.value = ''; }
            });
            const groupsModal = document.getElementById('groups-modal');
            if (groupsModal) {
                groupsModal.addEventListener('click', function (e) {
                    const t = e.target.closest('[data-action]');
                    if (!t) return;
                    const a = t.dataset.action;
                    if (a === 'groups-close') closeGroupsModal();
                    else if (a === 'group-create') {
                        const inp = document.getElementById('grp-new-name');
                        createGroup(inp.value); inp.value = ''; inp.focus();
                    } else if (a === 'group-delete') deleteGroup(t.dataset.groupId);
                });
                groupsModal.addEventListener('change', function (e) {
                    const t = e.target;
                    if (t.dataset.action === 'group-toggle-flag') toggleFlagInGroup(t.dataset.groupId, t.dataset.flagName, t.checked);
                    else if (t.dataset.action === 'group-rename') renameGroup(t.dataset.groupId, t.value);
                });
                groupsModal.addEventListener('input', function (e) {
                    if (e.target.dataset.action === 'group-search') _grpSearchFilter(e.target.dataset.groupId, e.target.value);
                });
                // Clic sur le fond (backdrop) ferme le modal
                groupsModal.addEventListener('click', function (e) { if (e.target === groupsModal) closeGroupsModal(); });
            }

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
