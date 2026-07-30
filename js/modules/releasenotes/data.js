/* releasenotes · data.js — I/O (auth, fetch). */

        async function fetchGitLab(endpoint, init = {}) {
            return window.Salsifi.gitlabFetch(gitlabBaseUrl, token, endpoint, init);
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

