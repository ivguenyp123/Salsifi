/* releasenotes · compute.js — logique pure (calculs, helpers). */

        function escapeAttr(v) { return window.Salsifi.escapeAttr(v); }

        // ══════════════════════════════════════════════════════════════════
        //  EVENT DELEGATION — remplace tous les onclick inline (HTML + JS)
        // ══════════════════════════════════════════════════════════════════


        function parseCommitType(message) {
            const match = message.match(/^(feat|fix|chore|docs|refactor|test|style|perf|ci|build|revert)/i);
            return match ? match[1].toLowerCase() : 'other';
        }


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
