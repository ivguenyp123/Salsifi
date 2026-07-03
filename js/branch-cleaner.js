        // ══════════════════════════════════════════════════════════════════
        //  VARIABLES
        // ══════════════════════════════════════════════════════════════════

        let GITLAB_URL = null;
        let projectId = null;
        let token = null;
        let projectName = '';

        let allBranches = [];
        let filteredBranches = [];
        let selectedBranches = new Set();
        let mergedBranches = new Set();
        let protectedBranches = new Set();

        // Pagination
        const ITEMS_PER_PAGE = 50;
        let currentPage = 1;

        // ══════════════════════════════════════════════════════════════════
        //  HELPERS — fetch GitLab avec retry 429, pagination, escapeHtml.
        //  Alignés sur l'écosystème (insights, gaming, feature-flag-manager,
        //  mr-reviewer, auto-rebase, conflict-radar, bus-factor).
        // ══════════════════════════════════════════════════════════════════

        async function fetchGitLab(endpoint, init = {}) {
            return window.Salsifi.gitlabFetch(GITLAB_URL, token, endpoint, init);
        }

        // Pagination automatique avec garde-fou 50 pages (5000 résultats max).
        // Avant : `while (hasMore)` sans cap → boucle infinie possible si
        // l'API renvoyait une réponse bizarre.
        async function fetchAllGitLab(endpoint) {
            const all = [];
            let page = 1;
            const sep = endpoint.includes('?') ? '&' : '?';
            while (page <= 50) {
                const r = await fetchGitLab(`${endpoint}${sep}page=${page}&per_page=100`);
                if (!r.ok) {
                    if (page === 1) throw new Error(`API ${endpoint} → ${r.status}`);
                    break;
                }
                const batch = await r.json();
                if (!Array.isArray(batch) || batch.length === 0) break;
                all.push(...batch);
                if (batch.length < 100) break;
                page++;
            }
            return all;
        }

        function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }

        // Échappe les caractères dangereux pour un usage dans un attribut HTML.
        // (escapeHtml suffit pour le contenu textuel mais pour data-attributes
        // on veut aussi neutraliser " et ').
        function escapeAttr(v) { return window.Salsifi.escapeAttr(v); }

        // ══════════════════════════════════════════════════════════════════
        //  INIT
        // ══════════════════════════════════════════════════════════════════

        // ── AUTH + REPO — modèle plateforme (aligné DevOps Hub) ──
        const STORAGE_KEY = 'devops_hub_workspaces';
        const HUB_URL = 'hub-mockup-v2_1.html'; // mockup V2 = hub ; seul endroit à changer

        function loadAuth() {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            try {
                const data = JSON.parse(raw);
                if (!data.gitlabUrl || !data.token) return null;
                return data;
            } catch { return null; }
        }

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

        function debounce(func, wait) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        }

        // ══════════════════════════════════════════════════════════════════
        //  LOAD BRANCHES
        // ══════════════════════════════════════════════════════════════════

        async function loadBranches() {
            const content = document.getElementById('branchListContent');
            content.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">Chargement des branches...</div>
                </div>
            `;

            try {
                // 0. Nom réel du repo (mode mono-repo : on n'avait que l'id)
                if (/^Repo #/.test(projectName)) {
                    try {
                        const pr = await fetchGitLab(`/projects/${projectId}`);
                        if (pr.ok) {
                            const p = await pr.json();
                            if (p.name) {
                                projectName = p.name;
                                document.getElementById('projectName').textContent = p.name;
                            }
                        }
                    } catch { /* non bloquant */ }
                }

                // 1. Récupérer toutes les branches (pagination via helper).
                allBranches = await fetchAllGitLab(`/projects/${projectId}/repository/branches`);

                content.innerHTML = `
                    <div class="loading-container">
                        <div class="loading-spinner"></div>
                        <div class="loading-text">${allBranches.length} branches trouvées — Récupération des branches protégées...</div>
                    </div>
                `;

                // 2. Branches protégées (page unique, généralement < 10)
                protectedBranches = new Set();
                try {
                    const r = await fetchGitLab(`/projects/${projectId}/protected_branches?per_page=100`);
                    if (r.ok) {
                        const protectedList = await r.json();
                        protectedList.forEach(b => protectedBranches.add(b.name));
                    }
                } catch (e) {
                    console.warn('Could not fetch protected branches:', e);
                }

                // 3. Branches mergées via MRs.
                //
                // ⚠️ Important : on pagine COMPLÈTEMENT les MRs mergées (avant : juste
                // les 100 dernières → les anciennes branches mergées historiquement
                // apparaissaient comme "non mergées" et l'utilisateur hésitait à les
                // supprimer. Bug fonctionnel majeur).
                //
                // Coût : peut prendre plusieurs secondes sur un projet à grand historique
                // (5000 MRs = 50 pages × ~300ms = ~15s). Le retry 429 absorbe les
                // saturations. Cap à 5000 MRs (50 pages) — au-delà, on tronque mais
                // l'utilisateur a toujours plus d'info que les 100 d'avant.
                content.innerHTML = `
                    <div class="loading-container">
                        <div class="loading-spinner"></div>
                        <div class="loading-text">Récupération de l'historique complet des MRs mergées...</div>
                    </div>
                `;

                mergedBranches = new Set();
                try {
                    const mrs = await fetchAllGitLab(`/projects/${projectId}/merge_requests?state=merged`);
                    mrs.forEach(mr => mergedBranches.add(mr.source_branch));
                } catch (e) {
                    console.warn('Could not fetch all merged MRs:', e);
                }

                // 4. Enrichir les données : ageDays, isMerged, isProtected, authorName
                const now = new Date();
                allBranches = allBranches.map(branch => {
                    const commitDate = new Date(branch.commit?.committed_date || branch.commit?.created_at);
                    const ageDays = Math.floor((now - commitDate) / (1000 * 60 * 60 * 24));

                    return {
                        ...branch,
                        ageDays,
                        isMerged: mergedBranches.has(branch.name),
                        isProtected: protectedBranches.has(branch.name) || branch.protected,
                        authorName: branch.commit?.author_name || 'Unknown'
                    };
                });

                // Trier par âge décroissant
                allBranches.sort((a, b) => b.ageDays - a.ageDays);

                updateStats();
                applyFilters();

            } catch (error) {
                console.error('Erreur:', error);
                content.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">❌</div>
                        <div class="empty-state-text">Erreur lors du chargement : ${escapeHtml(error.message)}</div>
                    </div>
                `;
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  STATS
        // ══════════════════════════════════════════════════════════════════

        function updateStats() {
            // Note : `totalBranches` affiche le nb de branches CANDIDATES à la
            // suppression (= hors protégées). C'est cohérent avec les filtres
            // qui excluent aussi les protégées, mais l'UI dit "Total branches"
            // → un peu trompeur si le projet a 5 branches protégées sur 50,
            // l'utilisateur voit "45" et pas "50". Acceptable parce que ce
            // module est focalisé sur le nettoyage.
            const total = allBranches.filter(b => !b.isProtected).length;
            const critical = allBranches.filter(b => !b.isProtected && b.ageDays > 90).length;
            const stale = allBranches.filter(b => !b.isProtected && b.ageDays > 30 && b.ageDays <= 90).length;
            const recent = allBranches.filter(b => !b.isProtected && b.ageDays <= 30).length;

            document.getElementById('totalBranches').textContent = total;
            document.getElementById('criticalBranches').textContent = critical;
            document.getElementById('staleBranches').textContent = stale;
            document.getElementById('recentBranches').textContent = recent;
        }

        // ══════════════════════════════════════════════════════════════════
        //  FILTERS
        // ══════════════════════════════════════════════════════════════════

        function applyFilters() {
            const ageMin = parseInt(document.getElementById('ageFilter').value);
            const statusFilter = document.getElementById('statusFilter').value;
            const search = document.getElementById('searchFilter').value.toLowerCase();

            filteredBranches = allBranches.filter(branch => {
                // Exclure les branches protégées
                if (branch.isProtected) return false;

                // Filtre âge
                if (branch.ageDays < ageMin) return false;

                // Filtre statut
                if (statusFilter === 'merged' && !branch.isMerged) return false;
                if (statusFilter === 'unmerged' && branch.isMerged) return false;

                // Filtre recherche
                if (search && !branch.name.toLowerCase().includes(search)) return false;

                return true;
            });

            // Reset pagination
            currentPage = 1;
            selectedBranches.clear();
            updateSelectAllCheckbox();
            updateSelectionInfo();

            renderBranchList();
        }

        // ══════════════════════════════════════════════════════════════════
        //  RENDER
        // ══════════════════════════════════════════════════════════════════

        function renderBranchList() {
            const content = document.getElementById('branchListContent');

            if (filteredBranches.length === 0) {
                content.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🎉</div>
                        <div class="empty-state-text">Aucune branche ne correspond aux filtres</div>
                    </div>
                `;
                document.getElementById('pagination').style.display = 'none';
                document.getElementById('filteredCount').textContent = '0';
                return;
            }

            // Pagination
            const totalPages = Math.ceil(filteredBranches.length / ITEMS_PER_PAGE);
            const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
            const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, filteredBranches.length);
            const pageBranches = filteredBranches.slice(startIdx, endIdx);

            document.getElementById('filteredCount').textContent = filteredBranches.length;

            let html = '';
            pageBranches.forEach(branch => {
                const isSelected = selectedBranches.has(branch.name);
                const ageClass = branch.ageDays > 90 ? 'critical' :
                                 branch.ageDays > 60 ? 'warning' :
                                 branch.ageDays > 30 ? 'old' : 'recent';
                const statusClass = branch.isMerged ? 'merged' : 'unmerged';
                const statusText = branch.isMerged ? '🔀 mergée' : '⚠️ non mergée';

                // Event delegation : data-action + data-branch (échappé pour attr).
                // Avant : onclick="toggleBranch('${branch.name}')" cassait sur les
                // noms de branche avec apostrophe (Git accepte presque tout).
                html += `
                    <div class="branch-item ${isSelected ? 'selected' : ''}" data-action="toggle-branch" data-branch="${escapeAttr(branch.name)}">
                        <div class="checkbox-custom ${isSelected ? 'checked' : ''}"></div>
                        <div class="branch-name">${escapeHtml(branch.name)}</div>
                        <div class="branch-meta">
                            <div class="branch-author">👤 ${escapeHtml(branch.authorName)}</div>
                            <div class="branch-age ${ageClass}">${branch.ageDays} jours</div>
                            <div class="branch-status ${statusClass}">${statusText}</div>
                        </div>
                    </div>
                `;
            });

            content.innerHTML = html;

            // Pagination
            const pagination = document.getElementById('pagination');
            if (totalPages > 1) {
                pagination.style.display = 'flex';
                document.getElementById('pageInfo').textContent = `Page ${currentPage}/${totalPages}`;
                document.getElementById('prevBtn').disabled = currentPage === 1;
                document.getElementById('nextBtn').disabled = currentPage === totalPages;
            } else {
                pagination.style.display = 'none';
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  SELECTION
        // ══════════════════════════════════════════════════════════════════

        function toggleBranch(branchName) {
            if (selectedBranches.has(branchName)) {
                selectedBranches.delete(branchName);
            } else {
                selectedBranches.add(branchName);
            }
            updateSelectAllCheckbox();
            updateSelectionInfo();
            renderBranchList();
        }

        function toggleSelectAll() {
            const allSelected = filteredBranches.every(b => selectedBranches.has(b.name));
            
            if (allSelected) {
                // Désélectionner tout
                filteredBranches.forEach(b => selectedBranches.delete(b.name));
            } else {
                // Sélectionner tout
                filteredBranches.forEach(b => selectedBranches.add(b.name));
            }

            updateSelectAllCheckbox();
            updateSelectionInfo();
            renderBranchList();
        }

        function selectMerged() {
            filteredBranches.forEach(b => {
                if (b.isMerged) {
                    selectedBranches.add(b.name);
                }
            });
            updateSelectAllCheckbox();
            updateSelectionInfo();
            renderBranchList();
        }

        function updateSelectAllCheckbox() {
            const checkbox = document.getElementById('selectAllCheckbox');
            const allSelected = filteredBranches.length > 0 && 
                               filteredBranches.every(b => selectedBranches.has(b.name));
            
            if (allSelected) {
                checkbox.classList.add('checked');
            } else {
                checkbox.classList.remove('checked');
            }
        }

        function updateSelectionInfo() {
            const count = selectedBranches.size;
            document.getElementById('selectedCount').textContent = count;
            document.getElementById('deleteBtn').disabled = count === 0;

            // Compter les non-mergées
            const unmergedCount = [...selectedBranches].filter(name => {
                const branch = allBranches.find(b => b.name === name);
                return branch && !branch.isMerged;
            }).length;

            const warningBadge = document.getElementById('unmergedWarning');
            if (unmergedCount > 0) {
                warningBadge.style.display = 'inline-flex';
                document.getElementById('unmergedCount').textContent = unmergedCount;
            } else {
                warningBadge.style.display = 'none';
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  PAGINATION
        // ══════════════════════════════════════════════════════════════════

        function prevPage() {
            if (currentPage > 1) {
                currentPage--;
                renderBranchList();
            }
        }

        function nextPage() {
            const totalPages = Math.ceil(filteredBranches.length / ITEMS_PER_PAGE);
            if (currentPage < totalPages) {
                currentPage++;
                renderBranchList();
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  DELETE
        // ══════════════════════════════════════════════════════════════════

        function showDeleteModal() {
            const count = selectedBranches.size;
            const unmergedCount = [...selectedBranches].filter(name => {
                const branch = allBranches.find(b => b.name === name);
                return branch && !branch.isMerged;
            }).length;

            let text = `Êtes-vous sûr de vouloir supprimer <strong>${count}</strong> branches ?`;
            if (unmergedCount > 0) {
                text += `<br><br>⚠️ <strong>${unmergedCount}</strong> branches ne sont pas mergées et leur code sera perdu !`;
            }

            document.getElementById('deleteModalText').innerHTML = text;
            document.getElementById('deleteProgress').style.display = 'none';
            document.getElementById('deleteModalActions').style.display = 'flex';
            document.getElementById('deleteModal').classList.add('show');
        }

        function hideDeleteModal() {
            document.getElementById('deleteModal').classList.remove('show');
        }

        async function deleteBranches() {
            const branchesToDelete = [...selectedBranches];
            const total = branchesToDelete.length;
            if (total === 0) return;

            // Afficher la progression
            document.getElementById('deleteModalActions').style.display = 'none';
            document.getElementById('deleteProgress').style.display = 'block';
            document.getElementById('progressText').textContent = `Suppression de ${total} branches en cours...`;

            // Suppression en parallèle. DELETE est destructif mais idempotent
            // côté GitLab (re-supprimer une branche déjà supprimée renvoie 404).
            // Promise.allSettled : on tolère les échecs individuels sans tuer la
            // série. Sur 200 branches : ~3-5s au lieu de ~60s en séquentiel.
            //
            // Note : Promise.all pourrait stresser GitLab sur de très gros volumes.
            // En pratique sur LCL, 200 DELETE en parallèle passent. Le retry 429
            // dans fetchGitLab absorbe les saturations éventuelles.
            let progressDone = 0;
            const updateProgress = () => {
                progressDone++;
                const pct = Math.round((progressDone / total) * 100);
                document.getElementById('progressFill').style.width = pct + '%';
                document.getElementById('progressText').textContent = `${progressDone} / ${total} traitées...`;
            };

            const results = await Promise.allSettled(branchesToDelete.map(async (branchName) => {
                try {
                    const r = await fetchGitLab(
                        `/projects/${projectId}/repository/branches/${encodeURIComponent(branchName)}`,
                        { method: 'DELETE' }
                    );
                    if (r.ok || r.status === 204) {
                        updateProgress();
                        return { name: branchName, ok: true };
                    }
                    // Parser le message d'erreur GitLab pour l'afficher proprement
                    let msg = `HTTP ${r.status}`;
                    try {
                        const body = await r.json();
                        msg = body.message || body.error || msg;
                    } catch { /* body non-JSON */ }
                    updateProgress();
                    return { name: branchName, ok: false, error: msg };
                } catch (e) {
                    updateProgress();
                    return { name: branchName, ok: false, error: e.message };
                }
            }));

            // Agrégation des résultats
            const successes = [];
            const errors = [];
            results.forEach(r => {
                if (r.status === 'fulfilled') {
                    if (r.value.ok) {
                        successes.push(r.value.name);
                    } else {
                        errors.push({ name: r.value.name, error: r.value.error });
                    }
                } else {
                    errors.push({ name: '?', error: String(r.reason) });
                }
            });

            // Retirer les branches supprimées avec succès de la sélection.
            successes.forEach(name => selectedBranches.delete(name));

            // Afficher le résumé final dans le MODAL (avant : alert() bloquant
            // et illisible si > 5 erreurs). On reste dans le contexte modal pour
            // que l'utilisateur lise calmement avant de fermer.
            renderDeleteSummary(successes.length, errors);
        }

        // Résumé de suppression rendu dans le modal — remplace l'ancien alert().
        // Affiche le nombre de succès + liste lisible des erreurs avec message GitLab.
        function renderDeleteSummary(successCount, errors) {
            const modal = document.querySelector('#deleteModal .modal');
            if (!modal) return;

            const errorsHtml = errors.length > 0
                ? `
                    <div style="margin-top: 20px; text-align: left; max-height: 240px; overflow-y: auto; padding: 12px; background: rgba(239, 68, 68, 0.12); border-radius: 10px;">
                        <div style="font-weight: 600; margin-bottom: 10px;">❌ ${errors.length} erreur(s) :</div>
                        ${errors.map(e => `
                            <div style="font-family: 'Monaco', monospace; font-size: 12px; margin-bottom: 6px; opacity: 0.9;">
                                <span style="color: #fca5a5;">${escapeHtml(e.name)}</span> : ${escapeHtml(e.error)}
                            </div>
                        `).join('')}
                    </div>
                `
                : '';

            modal.innerHTML = `
                <h2>${errors.length === 0 ? '✅' : '⚠️'} Suppression terminée</h2>
                <p>
                    <strong>${successCount}</strong> branche(s) supprimée(s) avec succès.
                    ${errors.length > 0 ? `<br><br><strong>${errors.length}</strong> erreur(s) — détails ci-dessous.` : ''}
                </p>
                ${errorsHtml}
                <div class="modal-actions" style="margin-top: 24px;">
                    <button class="btn btn-secondary" data-action="hide-delete-modal-and-reload">Fermer et rafraîchir</button>
                </div>
            `;

            // Ajout local : ce bouton n'existe pas dans ACTION_HANDLERS de base
            // (généré dynamiquement ici). On le câble directement.
            modal.querySelector('[data-action="hide-delete-modal-and-reload"]')?.addEventListener('click', () => {
                hideDeleteModal();
                // Reconstruire le modal initial pour la prochaine ouverture.
                restoreDeleteModal();
                loadBranches();
            });
        }

        // Restaure la structure initiale du modal après affichage du résumé,
        // pour que la prochaine confirmation de suppression réutilise les bons
        // éléments (#deleteModalText, #deleteProgress, #deleteModalActions).
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
