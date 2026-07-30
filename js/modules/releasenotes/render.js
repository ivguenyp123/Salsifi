/* releasenotes · render.js — rendu DOM. */

        function runWithConcurrency(tasks, limit) { return window.Salsifi.runWithConcurrency(tasks, limit); }

        // escapeHtml est défini plus bas (préservé du code original).
        // escapeAttr ajouté pour les attributs HTML (data-*, href, value).

        function goBack() {
            window.location.href = 'hub.html';
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
