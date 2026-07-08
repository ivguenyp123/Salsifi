// [hub] Extrait de hub.js — repo/repo-picker.js (portée globale, script classique)
        // ───── User pill + greeting ────────────────────────────────────────
        function renderUserInfo() {
            const name = auth.username || 'utilisateur';
            const initials = name
                .split(/[\s_.-]/)
                .filter(Boolean)
                .slice(0, 2)
                .map(p => p[0].toUpperCase())
                .join('') || '?';
            document.getElementById('userAvatar').textContent = initials;
            document.getElementById('userName').textContent = name;

            const firstName = name.split(/[\s_.-]/)[0];
            const capitalized = firstName.charAt(0).toUpperCase() + firstName.slice(1);
            document.getElementById('greetingTitle').innerHTML =
                `Bonjour ${escapeHtml(capitalized)} <span class="wave">👋</span>`;
        }

        // ───── Repos : fetch + cache ───────────────────────────────────────
        function getCacheKey() {
            return CACHE_KEY_PREFIX + auth.username;
        }

        function readCache() {
            try {
                const raw = localStorage.getItem(getCacheKey());
                if (!raw) return null;
                const data = JSON.parse(raw);
                if (Date.now() - data.ts > CACHE_TTL_MS) return null;
                return data.repos;
            } catch { return null; }
        }

        function writeCache(repos) {
            try {
                localStorage.setItem(getCacheKey(), JSON.stringify({
                    ts: Date.now(),
                    repos
                }));
            } catch (e) {
                console.warn('Cache write failed:', e);
            }
        }

        async function fetchReposPage(page) {
            // Une seule page à la fois (pattern aligné sur workspace-setup.html)
            const r = await fetchGitLab(`/projects?membership=true&order_by=last_activity_at&per_page=100&page=${page}`);
            if (!r.ok) {
                if (r.status === 401) {
                    // Token expiré ou invalide
                    localStorage.removeItem(STORAGE_KEY);
                    redirectToLogin();
                    return { repos: [], hasMore: false };
                }
                return { repos: [], hasMore: false };
            }
            const batch = await r.json();
            if (!Array.isArray(batch) || batch.length === 0) {
                return { repos: [], hasMore: false };
            }
            const repos = batch.map(p => ({
                id: p.id,
                name: p.name,
                path: p.path_with_namespace,
                web_url: p.web_url,
                default_branch: p.default_branch,
                last_activity_at: p.last_activity_at,
                description: p.description
            }));
            // Si on a reçu 100 projets, il y en a probablement plus
            return { repos, hasMore: batch.length === 100 };
        }

        // Charge TOUTES les pages de repos en boucle (garde-fou : 50 pages max = 5000 repos)
        async function fetchAllRepos(onProgress) {
            const MAX_PAGES = 50;
            let all = [];
            const seen = new Set();
            let page = 1;
            let more = true;
            while (more && page <= MAX_PAGES) {
                const { repos, hasMore } = await fetchReposPage(page);
                for (const r of repos) {
                    if (!seen.has(r.id)) { seen.add(r.id); all.push(r); }
                }
                more = hasMore;
                if (typeof onProgress === 'function') onProgress(all, more);
                page++;
            }
            return all;
        }

        async function loadRepos() {
            const cached = readCache();
            if (cached && cached.length > 0) {
                // Affichage immédiat depuis le cache, puis on recharge TOUT en arrière-plan
                allRepos = cached;
                hasMoreRepos = false;
                renderRepoList();
                applySelectedRepo();
                fetchAllRepos().then(all => {
                    if (all.length > 0) {
                        allRepos = all;
                        hasMoreRepos = false;
                        writeCache(allRepos);
                        const searchInput = document.getElementById('repoSearchInput');
                        renderRepoList(searchInput ? searchInput.value : '');
                    }
                }).catch(e => console.warn('Background full refresh failed:', e));
                return;
            }

            // Pas de cache : on charge TOUTES les pages, avec rendu progressif
            try {
                const all = await fetchAllRepos((partial) => {
                    // Affichage progressif au fil des pages chargées
                    allRepos = partial;
                    hasMoreRepos = false;
                    renderRepoList();
                    if (!currentRepo) applySelectedRepo();
                });
                allRepos = all;
                hasMoreRepos = false;
                writeCache(allRepos);
                renderRepoList();
                applySelectedRepo();
            } catch (e) {
                console.error('Repos load failed:', e);
                document.getElementById('repoList').innerHTML =
                    `<div class="repo-empty">⚠️ Impossible de charger les projets.<br><small>Vérifie ta connexion et ton token.</small></div>`;
            }
        }

        async function loadMoreRepos() {
            if (isLoadingMoreRepos || !hasMoreRepos) return;
            isLoadingMoreRepos = true;

            const btn = document.getElementById('repoLoadMoreBtn');
            if (btn) {
                btn.disabled = true;
                btn.textContent = '⏳ Chargement…';
            }

            try {
                const nextPage = currentRepoPage + 1;
                const { repos: fresh, hasMore } = await fetchReposPage(nextPage);
                if (fresh.length > 0) {
                    // Éviter les doublons (au cas où)
                    const existing = new Set(allRepos.map(r => r.id));
                    const toAdd = fresh.filter(r => !existing.has(r.id));
                    allRepos = [...allRepos, ...toAdd];
                    currentRepoPage = nextPage;
                    hasMoreRepos = hasMore;
                    writeCache(allRepos);
                } else {
                    hasMoreRepos = false;
                }
                // Préserver le filtre de recherche en cours s'il y en a un
                const searchInput = document.getElementById('repoSearchInput');
                renderRepoList(searchInput ? searchInput.value : '');
            } catch (e) {
                console.warn('Load more repos failed:', e);
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '⚠️ Erreur — réessayer';
                }
            } finally {
                isLoadingMoreRepos = false;
            }
        }

        // ───── Sélection d'un repo ─────────────────────────────────────────
        function applySelectedRepo() {
            if (allRepos.length === 0) return;
            const savedId = localStorage.getItem(SELECTED_REPO_KEY);
            const found = savedId ? allRepos.find(r => String(r.id) === savedId) : null;
            currentRepo = found || allRepos[0];
            renderRepoButton();
            // À ce point on aurait : onRepoChange() pour rafraîchir stats/synthesis
            onRepoChange();
        }

        function selectRepo(repoId) {
            const repo = allRepos.find(r => r.id === repoId);
            if (!repo) return;
            currentRepo = repo;
            localStorage.setItem(SELECTED_REPO_KEY, String(repoId));
            renderRepoButton();
            renderRepoList(); // re-render pour mettre à jour l'active state
            closeRepoPicker();
            onRepoChange();
        }

        function renderRepoButton() {
            const btn = document.getElementById('repoPickerBtn');
            const label = document.getElementById('repoPickerLabel');
            btn.disabled = false;
            if (currentRepo) {
                label.textContent = currentRepo.name;
                btn.title = currentRepo.path;
            } else {
                label.textContent = 'Aucun projet';
            }
        }

        function renderRepoList(filter = '') {
            const list = document.getElementById('repoList');
            const searchWrap = document.getElementById('repoSearchWrap');

            // Toggle search bar si > seuil
            searchWrap.style.display = allRepos.length > SEARCH_THRESHOLD ? '' : 'none';

            const q = filter.trim().toLowerCase();
            const filtered = q
                ? allRepos.filter(r =>
                    r.name.toLowerCase().includes(q) ||
                    (r.path || '').toLowerCase().includes(q))
                : allRepos;

            if (filtered.length === 0) {
                list.innerHTML = `<div class="repo-empty">${q ? 'Aucun résultat' : 'Aucun projet accessible'}</div>`;
                return;
            }

            list.innerHTML = filtered.map(r => {
                const active = currentRepo && r.id === currentRepo.id;
                return `<div class="repo-item ${active ? 'active' : ''}" data-repo-id="${r.id}">
                    <span class="repo-item-icon">📦</span>
                    <div class="repo-item-body">
                        <div class="repo-item-name">${escapeHtml(r.name)}</div>
                        <div class="repo-item-path">${escapeHtml(r.path || '')}</div>
                    </div>
                    <span class="repo-item-check" aria-label="sélectionné">✓</span>
                </div>`;
            }).join('');

            // Bouton "Charger plus" : seulement si pas de filtre actif et qu'il reste des pages
            if (hasMoreRepos && !q) {
                list.insertAdjacentHTML('beforeend',
                    `<button type="button" class="repo-load-more" id="repoLoadMoreBtn">📦 Charger plus de repositories</button>`
                );
            }
        }

        // ───── Dropdown UI ─────────────────────────────────────────────────
        function openRepoPicker() {
            const picker = document.getElementById('repoPicker');
            picker.classList.add('open');
            const input = document.getElementById('repoSearchInput');
            if (input.offsetParent) {
                setTimeout(() => input.focus(), 50);
            }
        }
        function closeRepoPicker() {
            document.getElementById('repoPicker').classList.remove('open');
            document.getElementById('repoSearchInput').value = '';
            renderRepoList('');
        }
        function toggleRepoPicker() {
            const isOpen = document.getElementById('repoPicker').classList.contains('open');
            if (isOpen) closeRepoPicker();
            else openRepoPicker();
        }

        // ───── Event listeners ─────────────────────────────────────────────
        function wireRepoPicker() {
            document.getElementById('repoPickerBtn').addEventListener('click', e => {
                e.stopPropagation();
                if (!document.getElementById('repoPickerBtn').disabled) toggleRepoPicker();
            });

            document.getElementById('repoList').addEventListener('click', e => {
                // Bouton "Charger plus" — déclenche le chargement de la page suivante
                if (e.target.closest('#repoLoadMoreBtn')) {
                    e.stopPropagation();
                    loadMoreRepos();
                    return;
                }
                const item = e.target.closest('.repo-item');
                if (!item) return;
                selectRepo(parseInt(item.dataset.repoId, 10));
            });

            document.getElementById('repoSearchInput').addEventListener('input', e => {
                renderRepoList(e.target.value);
            });

            // Click outside ferme
            document.addEventListener('click', e => {
                if (!e.target.closest('.repo-picker')) closeRepoPicker();
            });

            // Escape ferme aussi (en plus de fermer le drilldown)
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape') closeRepoPicker();
            });
        }

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  SYNTHESIS BAR — calculs des 4 cartes                            ║
        // ╚══════════════════════════════════════════════════════════════════╝
