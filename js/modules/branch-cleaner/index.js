/* branch-cleaner · index.js — entrée & câblage (chargé en dernier). */

        const STORAGE_KEY = 'devops_hub_workspaces';

        const HUB_URL = 'hub.html'; // mockup V2 = hub ; seul endroit à changer


        async function init() {
            const auth = loadAuth();
            if (!auth) { window.location.href = 'login.html'; return; }

            const repoId = new URLSearchParams(location.search).get('repo');
            if (!repoId) { window.location.href = HUB_URL; return; }

            token = auth.token;
            GITLAB_URL = auth.gitlabUrl;
            projectId = repoId;
            projectName = `Repo #${repoId}`;

            // Lien retour (init léger : le vrai nom est résolu dans loadBranches)
            document.querySelectorAll('[data-hub-link]').forEach(a => { a.href = HUB_URL; });
            document.getElementById('projectName').textContent = projectName;

            // Event listeners pour les filtres
            document.getElementById('ageFilter').addEventListener('change', applyFilters);
            document.getElementById('statusFilter').addEventListener('change', applyFilters);
            document.getElementById('searchFilter').addEventListener('input', debounce(applyFilters, 300));

            // Event delegation centralisée pour tous les data-action.
            attachEventDelegation();

            await loadBranches();
        }


        function attachEventDelegation() {
            document.body.addEventListener('click', (e) => {
                const el = e.target.closest('[data-action]');
                if (!el) return;
                const action = el.dataset.action;
                switch (action) {
                    case 'load-branches':       loadBranches(); break;
                    case 'select-merged':       selectMerged(); break;
                    case 'toggle-select-all':   toggleSelectAll(); break;
                    case 'show-delete-modal':   showDeleteModal(); break;
                    case 'hide-delete-modal':   hideDeleteModal(); break;
                    case 'delete-branches':     deleteBranches(); break;
                    case 'prev-page':           prevPage(); break;
                    case 'next-page':           nextPage(); break;
                    case 'toggle-branch':       toggleBranch(el.dataset.branch); break;
                }
            });
        }


        function restoreDeleteModal() {
            const modal = document.querySelector('#deleteModal .modal');
            if (!modal) return;
            modal.innerHTML = `
                <h2>⚠️ Confirmation</h2>
                <p id="deleteModalText">Êtes-vous sûr de vouloir supprimer X branches ?</p>
                <div id="deleteProgress" style="display: none;">
                    <div class="progress-container">
                        <div class="progress-bar">
                            <div class="progress-fill" id="progressFill" style="width: 0%"></div>
                        </div>
                        <div class="progress-text" id="progressText">0 / 0 branches supprimées</div>
                    </div>
                </div>
                <div class="modal-actions" id="deleteModalActions">
                    <button class="btn btn-secondary" data-action="hide-delete-modal">Annuler</button>
                    <button class="btn btn-primary" data-action="delete-branches">🗑️ Confirmer la suppression</button>
                </div>
            `;
        }

        // ══════════════════════════════════════════════════════════════════
        //  START
        // ══════════════════════════════════════════════════════════════════

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
