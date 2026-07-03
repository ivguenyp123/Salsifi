        // ══════════════════════════════════════════════════════════════════
        //  CONFIG
        // ══════════════════════════════════════════════════════════════════

        let gitlabBaseUrl = '';
        let projectId = '';
        let projectName = '';
        let token = '';
        let defaultBranch = 'main';
        let defaultBranchDetected = false;  // True une fois getDefaultBranch() OK

        let allTags = [];
        let existingReleases = [];
        let selectedTag = null;
        let currentMarkdown = '';
        let currentTab = 'markdown';  // 'edit' | 'markdown' | 'rendered' — pour viewExistingRelease

        // Concurrence pour les push de masse — generateAllMissing.
        // 8 sur les writes API : raisonnable, GitLab encaisse sans problème.
        // Aligné sur l'écosystème (autoretro, daily-report, etc.).
        const PUSH_CONCURRENCY = 8;

        // ══════════════════════════════════════════════════════════════════
        //  HELPERS — fetchGitLab (retry 429), runWithConcurrency, escapeAttr
        //  Alignés sur l'écosystème.
        // ══════════════════════════════════════════════════════════════════

        async function fetchGitLab(endpoint, init = {}) {
            return window.Salsifi.gitlabFetch(gitlabBaseUrl, token, endpoint, init);
        }

        function runWithConcurrency(tasks, limit) { return window.Salsifi.runWithConcurrency(tasks, limit); }

        // escapeHtml est défini plus bas (préservé du code original).
        // escapeAttr ajouté pour les attributs HTML (data-*, href, value).
        function escapeAttr(v) { return window.Salsifi.escapeAttr(v); }

        // ══════════════════════════════════════════════════════════════════
        //  EVENT DELEGATION — remplace tous les onclick inline (HTML + JS)
        // ══════════════════════════════════════════════════════════════════

        const ACTION_HANDLERS = {
            'go-back':              () => goBack(),
            'refresh-all':          () => refreshAll(),
            'generate-all-missing': () => generateAllMissing(),
            'close-modal':          () => closeModal(),
            'download-markdown':    () => downloadMarkdown(),
            'push-to-gitlab':       () => pushToGitLab(),
            'open-push-modal':      () => openPushModal(),
            'select-tag':           (e, el) => selectTag(el.dataset.tagName),
            'view-existing':        (e, el) => viewExistingRelease(el.dataset.tagName),
            'switch-tab':           (e, el) => switchPreviewTab(el.dataset.tab, el),
            'modal-overlay-click':  (e, el) => { if (e.target === el) closeModal(); }
        };

        function attachEventDelegation() {
            document.body.addEventListener('click', (e) => {
                const el = e.target.closest('[data-action]');
                if (!el) return;
                const handler = ACTION_HANDLERS[el.dataset.action];
                if (handler) handler(e, el);
            });
            // Fermeture du modal via Escape (avant : seulement × ou Annuler).
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeModal();
            });
            // Listener "input" sur l'éditeur via delegation (avant : oninput inline).
            document.body.addEventListener('input', (e) => {
                if (e.target.id === 'markdownEditor') updateMarkdownFromEditor();
            });
        }

        // ══════════════════════════════════════════════════════════════════
        //  INIT
        // ══════════════════════════════════════════════════════════════════

        document.addEventListener('DOMContentLoaded', () => {
            // Nouveau format hub v2 : localStorage 'devops_hub_workspaces' (JSON)
            // + 'hub_selected_repo_id' + cache 'hub_cache_repos_<username>' pour le nom.
            // Fallback ancien format sessionStorage pour rétro-compat.
            // Pattern aligné sur bus-factor.js.
            let workspaces = null;
            const authRaw = localStorage.getItem('devops_hub_workspaces');
            if (authRaw) {
                try {
                    workspaces = JSON.parse(authRaw);
                    token = workspaces.token || '';
                    gitlabBaseUrl = workspaces.gitlabUrl || '';
                } catch { /* fallback ci-dessous */ }
            }
            // Fallback ancien format
            if (!token) token = sessionStorage.getItem('gitlab_token') || '';
            if (!gitlabBaseUrl) gitlabBaseUrl = sessionStorage.getItem('gitlab_base_url') || '';

            // Project ID : nouveau format (sélection hub) puis ancien
            projectId = localStorage.getItem('hub_selected_repo_id')
                     || sessionStorage.getItem('gitlab_project_id')
                     || '';

            // Nom du projet : sessionStorage en priorité (vient peut-être de la page précédente),
            // sinon on essaie le cache repos du hub.
            projectName = sessionStorage.getItem('gitlab_project') || '';
            if (!projectName && workspaces) {
                try {
                    const cacheKey = 'hub_cache_repos_' + (workspaces.username || '');
                    const cacheRaw = localStorage.getItem(cacheKey);
                    if (cacheRaw) {
                        const cache = JSON.parse(cacheRaw);
                        const found = cache.repos && cache.repos.find(r => String(r.id) === String(projectId));
                        if (found) projectName = found.name;
                    }
                } catch { /* ignore */ }
            }
            if (!projectName) projectName = projectId ? `Projet #${projectId}` : 'Projet';

            document.getElementById('projectName').textContent = projectName;

            // Guard strict — sinon on retourne à l'auth.
            if (!token || !projectId || !gitlabBaseUrl) {
                window.location.href = 'login.html';
                return;
            }

            attachEventDelegation();
            loadAll();
        });

        function goBack() {
            window.location.href = 'hub-mockup-v2_1.html';
        }

        async function loadAll() {
            await getDefaultBranch();
            await Promise.all([loadTags(), loadExistingReleases()]);
            renderTags();
        }

        async function refreshAll() {
            await loadAll();
            showToast('Données actualisées');
        }

        // ══════════════════════════════════════════════════════════════════
        //  API CALLS
        // ══════════════════════════════════════════════════════════════════

        async function getDefaultBranch() {
            try {
                const r = await fetchGitLab(`/projects/${projectId}`);
                if (r.ok) {
                    const project = await r.json();
                    defaultBranch = project.default_branch || 'main';
                    defaultBranchDetected = true;
                    const branchEl = document.getElementById('storageBranch');
                    if (branchEl) branchEl.textContent = defaultBranch;
                } else {
                    // Si la détection échoue, on garde 'main' mais on flag
                    // l'utilisateur — sinon tous les fetches ?ref=main et
                    // tous les pushes ciblent une branche peut-être inexistante.
                    console.warn('[getDefaultBranch] HTTP', r.status, '— fallback "main"');
                }
            } catch (e) {
                console.error('Erreur récupération branche:', e);
            }
        }

        async function loadTags() {
            try {
                const r = await fetchGitLab(`/projects/${projectId}/repository/tags?per_page=100`);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                allTags = await r.json();
            } catch (e) {
                console.error('Erreur tags:', e);
                allTags = [];
            }
        }

        async function loadExistingReleases() {
            try {
                const r = await fetchGitLab(`/projects/${projectId}/repository/tree?path=releases&ref=${encodeURIComponent(defaultBranch)}&per_page=100`);
                if (r.ok) {
                    const files = await r.json();
                    existingReleases = files
                        .filter(f => f.type === 'blob' && f.name.endsWith('.md'))
                        .map(f => f.name.replace('.md', ''));
                } else {
                    // 404 normal si le dossier `releases/` n'existe pas encore.
                    existingReleases = [];
                }
            } catch (e) {
                console.error('Erreur releases:', e);
                existingReleases = [];
            }
        }

        async function loadCommitsBetweenTags(fromTag, toTag) {
            try {
                let endpoint;
                if (fromTag) {
                    endpoint = `/projects/${projectId}/repository/compare?from=${encodeURIComponent(fromTag)}&to=${encodeURIComponent(toTag)}`;
                } else {
                    // Pas de fromTag : on prend les 50 derniers commits accessibles
                    // depuis ce tag. Limitation acceptée — cf. vigilance dans la doc.
                    endpoint = `/projects/${projectId}/repository/commits?ref_name=${encodeURIComponent(toTag)}&per_page=50`;
                }
                const r = await fetchGitLab(endpoint);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const data = await r.json();
                return fromTag ? data.commits : data;
            } catch (e) {
                console.error('Erreur commits:', e);
                return [];
            }
        }

        // loadMRsForCommits retiré : il retournait [] sans rien faire (code mort).
        // Si on veut un jour enrichir les notes avec les MRs liées, voir
        // GitLab API `/repository/commits/:sha/merge_requests`.

        // ══════════════════════════════════════════════════════════════════
        //  RENDER TAGS
        // ══════════════════════════════════════════════════════════════════
        
        function renderTags() {
            const container = document.getElementById('tagsList');
            
            if (allTags.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">🏷️</div>
                        <h3>Aucun tag</h3>
                        <p>Ce projet n'a pas encore de tags</p>
                    </div>
                `;
                return;
            }
            
            const missingCount = allTags.filter(t => !existingReleases.includes(t.name)).length;
            document.getElementById('totalTags').textContent = allTags.length;
            document.getElementById('missingCount').textContent = missingCount;
            
            if (missingCount > 0) {
                document.getElementById('generateAllBtn').style.display = 'flex';
            }
            
            container.innerHTML = allTags.map(tag => {
                const hasRelease = existingReleases.includes(tag.name);
                const date = new Date(tag.commit.created_at).toLocaleDateString('fr-FR');
                const isActive = selectedTag?.name === tag.name;
                // escapeAttr sur data-tag-name (passé au handler) — un nom de tag
                // peut contenir des apostrophes/quotes (Git accepte presque tout).
                // escapeHtml sur le nom affiché.
                return `
                    <div class="tag-item ${hasRelease ? 'has-release' : 'no-release'} ${isActive ? 'active' : ''}"
                         data-action="select-tag" data-tag-name="${escapeAttr(tag.name)}">
                        <div class="tag-info">
                            <div class="tag-name">
                                🏷️ ${escapeHtml(tag.name)}
                            </div>
                            <div class="tag-date">${date} • ${escapeHtml(tag.commit.short_id)}</div>
                        </div>
                        <span class="tag-status ${hasRelease ? 'exists' : 'missing'}">
                            ${hasRelease ? '✓ Publiée' : '⚠ Manquante'}
                        </span>
                    </div>
                `;
            }).join('');
        }

        // ══════════════════════════════════════════════════════════════════
        //  SELECT TAG & GENERATE
        // ══════════════════════════════════════════════════════════════════
        
        async function selectTag(tagName) {
            selectedTag = allTags.find(t => t.name === tagName);
            if (!selectedTag) return;

            // Active state via data-tag-name (avant : textContent.includes ⇒
            // bug si `v1.0` et `v1.0-rc1` coexistent — les deux matchaient).
            document.querySelectorAll('.tag-item').forEach(el => {
                el.classList.toggle('active', el.dataset.tagName === tagName);
            });

            const content = document.getElementById('content');
            content.innerHTML = `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>Analyse des commits...</p>
                </div>
            `;

            // Trouver le tag précédent
            const tagIndex = allTags.findIndex(t => t.name === tagName);
            const previousTag = tagIndex < allTags.length - 1 ? allTags[tagIndex + 1].name : null;

            // Charger les commits
            const commits = await loadCommitsBetweenTags(previousTag, tagName);

            // Générer le markdown
            currentMarkdown = generateMarkdown(tagName, commits, selectedTag.commit.created_at);

            // Reset du tab actif au défaut "markdown" pour un nouveau tag.
            currentTab = 'markdown';

            // Render
            renderTagContent(tagName, commits, previousTag);
        }

        function renderTagContent(tagName, commits, previousTag) {
            const hasRelease = existingReleases.includes(tagName);

            const content = document.getElementById('content');
            // escapeHtml sur tagName et previousTag (texte libre Git via les
            // tags). escapeAttr sur data-tag-name (passé en attribut).
            content.innerHTML = `
                <div class="content-header">
                    <div class="content-title">📋 ${escapeHtml(tagName)}</div>
                    <div class="content-actions">
                        ${hasRelease ? `
                            <button class="btn" data-action="view-existing" data-tag-name="${escapeAttr(tagName)}">
                                <span>👁️</span> Voir existante
                            </button>
                        ` : ''}
                        <button class="btn primary" data-action="open-push-modal">
                            <span>📤</span> ${hasRelease ? 'Mettre à jour' : 'Publier'}
                        </button>
                    </div>
                </div>

                <div class="commits-section">
                    <div class="section-title">
                        📝 Commits ${previousTag ? `depuis ${escapeHtml(previousTag)}` : '(premiers commits)'}
                        <span class="section-count">${commits.length}</span>
                    </div>
                    <div class="commits-list">
                        ${commits.length === 0 ? '<p style="opacity: 0.6; padding: 10px;">Aucun commit trouvé</p>' :
                            commits.map(c => renderCommitItem(c)).join('')}
                    </div>
                </div>

                <div class="preview-section">
                    <div class="preview-header">
                        <div class="preview-tabs">
                            <button class="preview-tab" data-action="switch-tab" data-tab="edit">✏️ Éditer</button>
                            <button class="preview-tab active" data-action="switch-tab" data-tab="markdown">Markdown</button>
                            <button class="preview-tab" data-action="switch-tab" data-tab="rendered">Aperçu</button>
                        </div>
                    </div>
                    <div class="preview-content">
                        <pre class="preview-markdown">${escapeHtml(currentMarkdown)}</pre>
                    </div>
                </div>
            `;
        }

        function renderCommitItem(commit) {
            const type = parseCommitType(commit.title);
            const message = commit.title.replace(/^(feat|fix|chore|docs|refactor|test|style|perf|ci|build|revert)(\(.+?\))?:\s*/i, '');
            const date = new Date(commit.created_at).toLocaleDateString('fr-FR');

            // escapeHtml partout — message + author_name + short_id sont du
            // texte libre Git.
            return `
                <div class="commit-item">
                    <span class="commit-type ${type}">${type}</span>
                    <div class="commit-content">
                        <div class="commit-message">${escapeHtml(message)}</div>
                        <div class="commit-meta">
                            <span>${escapeHtml(commit.author_name)}</span>
                            <span>${date}</span>
                            <span>${escapeHtml(commit.short_id)}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        function switchPreviewTab(tab, btn) {
            document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            currentTab = tab;  // Mémorisé pour viewExistingRelease.

            const content = document.querySelector('.preview-content');
            if (!content) return;

            if (tab === 'edit') {
                // Editor textarea : event delegation 'input' sur #markdownEditor
                // (avant : oninput inline). Cf. attachEventDelegation().
                content.innerHTML = `
                    <textarea class="editor-textarea" id="markdownEditor"
                        placeholder="Éditez les release notes...">${escapeHtml(currentMarkdown)}</textarea>
                    <div class="editor-hint">
                        💡 Modifiez librement le contenu. Les changements sont sauvegardés automatiquement.
                    </div>
                `;
                document.getElementById('markdownEditor').focus();
            } else if (tab === 'markdown') {
                content.innerHTML = `<pre class="preview-markdown">${escapeHtml(currentMarkdown)}</pre>`;
            } else {
                content.innerHTML = `<div class="preview-rendered">${renderMarkdownToHtml(currentMarkdown)}</div>`;
            }
        }

        function updateMarkdownFromEditor() {
            const editor = document.getElementById('markdownEditor');
            if (editor) {
                currentMarkdown = editor.value;
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  COMMIT PARSING
        // ══════════════════════════════════════════════════════════════════
        
        function parseCommitType(message) {
            const match = message.match(/^(feat|fix|chore|docs|refactor|test|style|perf|ci|build|revert)/i);
            return match ? match[1].toLowerCase() : 'other';
        }

        function categorizeCommits(commits) {
            const categories = {
                feat: [],
                fix: [],
                docs: [],
                refactor: [],
                chore: [],
                test: [],
                other: []
            };
            
            commits.forEach(commit => {
                const type = parseCommitType(commit.title);
                if (categories[type]) {
                    categories[type].push(commit);
                } else {
                    categories.other.push(commit);
                }
            });
            
            return categories;
        }

        // ══════════════════════════════════════════════════════════════════
        //  MARKDOWN GENERATION
        // ══════════════════════════════════════════════════════════════════
        
        function generateMarkdown(tagName, commits, date) {
            const categories = categorizeCommits(commits);
            const formattedDate = new Date(date).toLocaleDateString('fr-FR', { 
                year: 'numeric', month: 'long', day: 'numeric' 
            });
            
            let md = `# ${tagName}\n\n`;
            md += `📅 **Date:** ${formattedDate}\n\n`;
            
            // Features
            if (categories.feat.length > 0) {
                md += `## ✨ Nouveautés\n\n`;
                categories.feat.forEach(c => {
                    const msg = c.title.replace(/^feat(\(.+?\))?:\s*/i, '');
                    md += `- ${msg} (${c.short_id})\n`;
                });
                md += '\n';
            }
            
            // Fixes
            if (categories.fix.length > 0) {
                md += `## 🐛 Corrections\n\n`;
                categories.fix.forEach(c => {
                    const msg = c.title.replace(/^fix(\(.+?\))?:\s*/i, '');
                    md += `- ${msg} (${c.short_id})\n`;
                });
                md += '\n';
            }
            
            // Refactor
            if (categories.refactor.length > 0) {
                md += `## ♻️ Refactoring\n\n`;
                categories.refactor.forEach(c => {
                    const msg = c.title.replace(/^refactor(\(.+?\))?:\s*/i, '');
                    md += `- ${msg} (${c.short_id})\n`;
                });
                md += '\n';
            }
            
            // Docs
            if (categories.docs.length > 0) {
                md += `## 📚 Documentation\n\n`;
                categories.docs.forEach(c => {
                    const msg = c.title.replace(/^docs(\(.+?\))?:\s*/i, '');
                    md += `- ${msg} (${c.short_id})\n`;
                });
                md += '\n';
            }
            
            // Chore & Other
            const misc = [...categories.chore, ...categories.test, ...categories.other];
            if (misc.length > 0) {
                md += `## 🔧 Autres\n\n`;
                misc.forEach(c => {
                    const msg = c.title.replace(/^(chore|test|style|perf|ci|build)(\(.+?\))?:\s*/i, '');
                    md += `- ${msg} (${c.short_id})\n`;
                });
                md += '\n';
            }
            
            // Contributors
            const authors = [...new Set(commits.map(c => c.author_name))];
            if (authors.length > 0) {
                md += `## 👥 Contributeurs\n\n`;
                md += authors.join(', ') + '\n\n';
            }
            
            md += `---\n*Généré par DevOps Hub*\n`;
            
            return md;
        }

        // ══════════════════════════════════════════════════════════════════
        //  PUSH TO GITLAB
        // ══════════════════════════════════════════════════════════════════
        
        function openPushModal() {
            if (!selectedTag) return;
            
            document.getElementById('modalTag').textContent = selectedTag.name;
            document.getElementById('modalFile').textContent = selectedTag.name;
            document.getElementById('modalBranch').textContent = defaultBranch;
            document.getElementById('modalPreviewContent').textContent = currentMarkdown;
            document.getElementById('pushModal').classList.add('show');
        }

        function closeModal() {
            document.getElementById('pushModal').classList.remove('show');
        }

        function downloadMarkdown() {
            const blob = new Blob([currentMarkdown], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${selectedTag.name}.md`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Fichier téléchargé');
        }

        async function pushToGitLab() {
            if (!selectedTag) return;

            const filePath = `releases/${selectedTag.name}.md`;
            const commitMessage = `docs: add release notes for ${selectedTag.name}`;
            const exists = existingReleases.includes(selectedTag.name);

            try {
                const r = await fetchGitLab(
                    `/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}`,
                    {
                        method: exists ? 'PUT' : 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            branch: defaultBranch,
                            content: currentMarkdown,
                            commit_message: commitMessage
                        })
                    }
                );

                if (!r.ok) {
                    let msg = `HTTP ${r.status}`;
                    try {
                        const body = await r.json();
                        msg = body.message || body.error || msg;
                    } catch { /* body non-JSON */ }
                    throw new Error(msg);
                }

                closeModal();
                showToast(`✅ Release notes ${exists ? 'mises à jour' : 'publiées'} !`);

                // Refresh
                await loadExistingReleases();
                renderTags();
            } catch (e) {
                console.error('Erreur push:', e);
                showToast(`Erreur: ${e.message}`, true);
            }
        }

        async function generateAllMissing() {
            const missing = allTags.filter(t => !existingReleases.includes(t.name));

            if (missing.length === 0) {
                showToast('Toutes les releases sont déjà générées');
                return;
            }

            if (!confirm(`Générer et pusher ${missing.length} release notes manquantes ?`)) {
                return;
            }

            // Avant : for...await séquentiel = ~30s sur 50 tags.
            // Maintenant : runWithConcurrency à 8 = ~5s (PUSH_CONCURRENCY).
            // On collecte les tags qui ont échoué pour les afficher (avant :
            // "5 erreurs" sans dire lesquelles).
            const failedTags = [];
            const tasks = missing.map(tag => async () => {
                const previousTag = allTags[allTags.indexOf(tag) + 1]?.name || null;
                try {
                    const commits = await loadCommitsBetweenTags(previousTag, tag.name);
                    const markdown = generateMarkdown(tag.name, commits, tag.commit.created_at);
                    const filePath = `releases/${tag.name}.md`;
                    const r = await fetchGitLab(
                        `/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                branch: defaultBranch,
                                content: markdown,
                                commit_message: `docs: add release notes for ${tag.name}`
                            })
                        }
                    );
                    if (!r.ok) {
                        failedTags.push(tag.name);
                        return false;
                    }
                    return true;
                } catch (e) {
                    failedTags.push(tag.name);
                    return false;
                }
            });

            const results = await runWithConcurrency(tasks, PUSH_CONCURRENCY);
            const success = results.filter(r => r.status === 'fulfilled' && r.value === true).length;

            if (failedTags.length === 0) {
                showToast(`✅ ${success} releases générées`);
            } else {
                // Log la liste des échecs en console pour debug. Toast résumé.
                console.warn('[generateAllMissing] Échecs:', failedTags);
                showToast(`${success} OK, ${failedTags.length} échecs (voir console)`, true);
            }

            await loadExistingReleases();
            renderTags();
        }

        async function viewExistingRelease(tagName) {
            try {
                const filePath = `releases/${tagName}.md`;
                const r = await fetchGitLab(
                    `/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(defaultBranch)}`
                );
                if (!r.ok) {
                    showToast(`Erreur lecture release (HTTP ${r.status})`, true);
                    return;
                }
                currentMarkdown = await r.text();

                // Re-render selon le tab actif (avant : remplaçait toujours par
                // <pre> markdown même si l'utilisateur était sur "Aperçu").
                const activeTabBtn = document.querySelector('.preview-tab.active');
                if (activeTabBtn) {
                    switchPreviewTab(currentTab, activeTabBtn);
                }
            } catch (e) {
                console.error('Erreur lecture release:', e);
                showToast('Erreur lecture release', true);
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  UTILS
        // ══════════════════════════════════════════════════════════════════
        
        function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }

        // Markdown → HTML simpliste avec sanitization en amont.
        //
        // ⚠️ XSS critique avant le fix : un commit avec `<script>` dans son
        // titre arrivait dans currentMarkdown via generateMarkdown puis dans
        // le rendu HTML "Aperçu" sans aucun filtre. Exploitable.
        //
        // Solution : escapeHtml d'ABORD, puis appliquer les regex sur le texte
        // déjà échappé. Les marqueurs markdown (`#`, `*`, `-`, `` ` ``) ne
        // sont pas modifiés par escapeHtml, donc les regex matchent toujours.
        // Le contenu capturé ($1) est déjà échappé → safe à injecter dans
        // <h1>$1</h1>, <strong>$1</strong>, etc.
        //
        // Limitations connues (acceptées) :
        // - Pas de liens, code blocks, tables, blockquotes, images
        // - `(<li>.*<\/li>\n?)+` regroupe par packs — OK pour notre format
        // - Acceptable comme APERÇU. Pas un renderer markdown production.
        function renderMarkdownToHtml(md) {
            let html = escapeHtml(md);  // ⭐ étape critique : échappement EN AMONT

            // Headers (les `#` ne sont pas affectés par escapeHtml)
            html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
            html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
            html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

            // Bold (les `*` ne sont pas affectés par escapeHtml)
            html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

            // Lists
            html = html.replace(/^- (.*$)/gm, '<li>$1</li>');
            html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

            // Code inline (les backticks ne sont pas affectés par escapeHtml)
            html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

            // Line breaks (paragraphes simples)
            html = html.replace(/\n\n/g, '<br><br>');

            return html;
        }

        function showToast(message, isError = false) {
            const toast = document.getElementById('toast');
            const icon = document.getElementById('toastIcon');
            const msg = document.getElementById('toastMessage');
            
            icon.textContent = isError ? '❌' : '✅';
            msg.textContent = message;
            toast.classList.toggle('error', isError);
            toast.classList.add('show');
            
            setTimeout(() => toast.classList.remove('show'), 3000);
        }
