/* maturity · data.js — I/O GitLab + auth + export/import état + métriques. */



// ============================================
// HELPERS — fetchGitLab (retry 429), runWithConcurrency, escapeHtml
// ============================================

async function fetchGitLab(endpoint, init = {}) {
            return window.Salsifi.gitlabFetch(GITLAB_URL, GITLAB_TOKEN, endpoint, init);
        }


function runWithConcurrency(tasks, limit) { return window.Salsifi.runWithConcurrency(tasks, limit); }


// Wrapper qui parse JSON ou renvoie null sur erreur. Préserve le comportement
// "tolérant" du code initial (tous les callers font `data || []`).
async function glFetch(endpoint) {
    try {
        const r = await fetchGitLab(endpoint);
        if (!r.ok) return null;
        return r.json();
    } catch (e) {
        console.error('GitLab API error:', e);
        return null;
    }
}


// Wrapper RAW (pour pom.xml et autres fichiers texte).
// Avant : glFetch utilisait toujours .json() → le check `typeof === 'string'`
// dans le Maven analyzer ne pouvait JAMAIS être vrai → code mort silencieux.
async function glFetchRaw(endpoint) {
    try {
        const r = await fetchGitLab(endpoint);
        if (!r.ok) return null;
        return r.text();
    } catch (e) {
        console.error('GitLab API raw error:', e);
        return null;
    }
}


// ============================================
// GUARD STRICT — appelé AU CHARGEMENT (pas après le quiz comme avant !)
// ============================================

function initAuth() {
    // Nouveau format hub : localStorage 'devops_hub_workspaces' (JSON) + 'hub_selected_repo_id'
    // Auth centralisee (devops_hub_workspaces + fallback sessionStorage legacy)
    const _auth = window.Salsifi.loadAuth({ redirect: false });
    if (_auth) { GITLAB_TOKEN = _auth.token; GITLAB_URL = _auth.gitlabUrl; }

    // Project ID : nouveau format puis ancien
    const selectedRepoId = localStorage.getItem('hub_selected_repo_id');
    PROJECT_ID = selectedRepoId || sessionStorage.getItem('gitlab_project_id');

    // Guard strict — check immédiat au chargement
    // (au lieu d'attendre la fin du quiz comme dans la version d'origine).
    if (!GITLAB_TOKEN || !GITLAB_URL || !PROJECT_ID) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}


async function fetchAllMetrics(updateStep) {
    const pid = PROJECT_ID;

    const now = new Date();
    const since7d = new Date(now - 7 * 86400000);
    const since4w = new Date(now - 28 * 86400000);
    const since90d = new Date(now - 90 * 86400000);

    // ── PHASE A : projectDetails EN PREMIER pour avoir defaultBranch ────────
    // Avant : projectDetails fetché plus tard ; mainPipelines et staleBranches
    // filtraient sur 'main' || 'master' hardcodé. Sur un projet avec
    // default branch 'develop' / 'integration' / 'recette', tous ces calculs
    // étaient FAUX.
    // Maintenant : on récupère default_branch d'abord, on l'utilise partout.
    updateStep(1);
    const projectDetails = await glFetch(`/projects/${pid}`) || {};
    const defaultBranch = projectDetails.default_branch || 'main';

    // ── PHASE B : 11 fetches indépendants en PARALLÈLE ──────────────────────
    // Avant : ~20 fetches en série dans 7 sections séquentielles = ~7-8s.
    // Maintenant : Promise.all sur les indépendants = ~1-2s pour cette phase.
    updateStep(2);
    const [
        pipelines, mergedMRs, openMRs, branches, protectedBranches,
        approvalRules, tree, contributors, commits, variables, releases
    ] = await Promise.all([
        glFetch(`/projects/${pid}/pipelines?per_page=100&updated_after=${since90d.toISOString()}`),
        glFetch(`/projects/${pid}/merge_requests?state=merged&per_page=100&order_by=created_at&sort=desc&updated_after=${since90d.toISOString()}`),
        glFetch(`/projects/${pid}/merge_requests?state=opened&per_page=100`),
        glFetch(`/projects/${pid}/repository/branches?per_page=100`),
        glFetch(`/projects/${pid}/protected_branches`),
        glFetch(`/projects/${pid}/approval_rules`),
        glFetch(`/projects/${pid}/repository/tree?per_page=100`),
        glFetch(`/projects/${pid}/repository/contributors?per_page=100`),
        glFetch(`/projects/${pid}/repository/commits?per_page=100&since=${since90d.toISOString()}`),
        glFetch(`/projects/${pid}/variables`),
        glFetch(`/projects/${pid}/releases?per_page=20`)
    ]).then(arr => arr.map(x => x || []));

    // ── PHASE C : ANALYSE PIPELINES (synchrone après le fetch) ──────────────
    updateStep(3);
    const total = pipelines.length;
    const success = pipelines.filter(p => p.status === 'success').length;
    const failed = pipelines.filter(p => p.status === 'failed').length;
    const pipelineOkPct = total > 0 ? Math.round(success / total * 100) : 0;
    const pipelineOkScore = pipelineOkPct >= 90 ? 100 : pipelineOkPct >= 70 ? 70 : 40;

    const recent7d = pipelines.filter(p => new Date(p.created_at) > since7d && p.status === 'success');
    const deployFreq = (recent7d.length / 7).toFixed(1);
    const deployFreqScore = Math.min(100, Math.round(parseFloat(deployFreq) / 3 * 100));

    // Avant : `p.ref === 'main' || p.ref === 'master'` hardcodé.
    // Maintenant : on utilise la default branch détectée.
    const mainPipelines = pipelines.filter(p => p.ref === defaultBranch);
    const deployMainPct = total > 0 ? Math.round(mainPipelines.length / total * 100) : 0;
    const deployMainScore = deployMainPct >= 90 ? 100 : deployMainPct >= 70 ? 70 : 40;

    const failRate = total > 0 ? Math.round(failed / total * 100) : 0;
    const failRateScore = failRate <= 5 ? 100 : failRate <= 15 ? 70 : 40;

    const successPipelines = pipelines.filter(p => p.status === 'success' && p.duration);
    const avgDuration = successPipelines.length > 0
        ? Math.round(successPipelines.slice(0, 20).reduce((s, p) => s + (p.duration || 0), 0) / Math.min(20, successPipelines.length) / 60)
        : 0;
    const durationScore = avgDuration < 10 ? 100 : avgDuration < 20 ? 70 : 40;

    let maxStreak = 0, currentStreak = 0;
    pipelines.forEach(p => {
        if (p.status === 'failed') { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak); }
        else { currentStreak = 0; }
    });
    const failStreakScore = maxStreak <= 1 ? 100 : maxStreak <= 3 ? 70 : 40;

    const recentPipelines = pipelines.filter(p => new Date(p.created_at) > since7d);
    const olderPipelines = pipelines.filter(p => new Date(p.created_at) > since4w && new Date(p.created_at) <= since7d);
    const recentRate = recentPipelines.length > 0 ? recentPipelines.filter(p => p.status === 'success').length / recentPipelines.length : 0;
    const olderRate = olderPipelines.length > 0 ? olderPipelines.filter(p => p.status === 'success').length / olderPipelines.length : recentRate;
    const trendDiff = Math.round((recentRate - olderRate) * 100);
    const trendScore = trendDiff >= 0 ? 100 : trendDiff >= -5 ? 70 : 40;

    let recoveryTimes = [];
    for (let i = 0; i < pipelines.length - 1; i++) {
        if (pipelines[i].status === 'success' && pipelines[i + 1]?.status === 'failed') {
            const diff = (new Date(pipelines[i].created_at) - new Date(pipelines[i + 1].created_at)) / 3600000;
            if (diff > 0) recoveryTimes.push(diff);
        }
    }
    const avgRecovery = recoveryTimes.length > 0 ? Math.round(recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length) : 0;
    const recoveryScore = avgRecovery < 2 ? 100 : avgRecovery < 24 ? 60 : 30;

    // ── ANALYSE MR ──────────────────────────────────────────────────────────
    updateStep(4);
    let reviewTimes = [];
    mergedMRs.slice(0, 20).forEach(mr => {
        if (mr.created_at && mr.merged_at) {
            const days = (new Date(mr.merged_at) - new Date(mr.created_at)) / 86400000;
            reviewTimes.push(days);
        }
    });
    const avgReviewTime = reviewTimes.length > 0 ? reviewTimes.reduce((a, b) => a + b, 0) / reviewTimes.length : 0;
    const reviewTimeScore = avgReviewTime < 2 ? 100 : avgReviewTime < 7 ? 60 : 30;

    const avgDiscussions = mergedMRs.length > 0
        ? mergedMRs.slice(0, 20).reduce((s, mr) => s + (mr.user_notes_count || 0), 0) / Math.min(20, mergedMRs.length)
        : 0;
    const discussionsScore = avgDiscussions >= 3 ? 100 : avgDiscussions >= 1 ? 70 : 40;

    const zombieMRs = openMRs.filter(mr => (now - new Date(mr.created_at)) / 86400000 > 7).length;
    const zombieMRsScore = zombieMRs === 0 ? 100 : zombieMRs <= 3 ? 60 : 30;

    const noApprovalMRs = mergedMRs.filter(mr => (mr.user_notes_count || 0) === 0).length;
    const noApprovalPct = mergedMRs.length > 0 ? Math.round(noApprovalMRs / mergedMRs.length * 100) : 0;
    const noApprovalScore = noApprovalPct === 0 ? 100 : noApprovalPct <= 20 ? 70 : 40;

    const mergers = [...new Set(mergedMRs.slice(0, 20).map(mr => mr.merged_by?.id).filter(Boolean))];
    const reviewerDiversity = mergers.length;
    const reviewerDiversityScore = reviewerDiversity >= 3 ? 100 : reviewerDiversity >= 2 ? 60 : 30;

    // ── ANALYSE BRANCHES ────────────────────────────────────────────────────
    updateStep(5);
    // Avant : hardcoded 'main' || 'master'. Maintenant : defaultBranch.
    const staleBranches = branches.filter(b => {
        if (b.name === defaultBranch) return false;
        const lastCommit = new Date(b.commit?.committed_date || b.commit?.created_at || 0);
        return (now - lastCommit) / 86400000 > 30;
    }).length;
    const staleBranchesScore = staleBranches < 5 ? 100 : staleBranches < 20 ? 60 : 30;

    const mainProtected = protectedBranches.find(b => b.name === defaultBranch);
    const isProtected = !!mainProtected;
    const forcePushAllowed = mainProtected?.allow_force_push ?? true;
    const branchProtectionScore = isProtected && !forcePushAllowed ? 100 : isProtected ? 70 : 30;

    const minApprovers = approvalRules.length > 0 ? Math.max(...approvalRules.map(r => r.approvals_required || 0)) : 0;
    const approvalRulesScore = minApprovers >= 2 ? 100 : minApprovers >= 1 ? 60 : 30;

    // ── ANALYSE GOUVERNANCE ─────────────────────────────────────────────────
    // Avant : double fetch /projects/:id (ligne 860 + ligne 873 dans le code
    // original). Maintenant : on réutilise projectDetails fetché en Phase A.
    const authorCanApprove = !(projectDetails.merge_requests_author_approval === false);
    const committerCanApprove = !(projectDetails.merge_requests_disable_committers_approval === true);
    const resetOnPush = projectDetails.reset_approvals_on_push ?? false;

    // ── ANALYSE FICHIERS ────────────────────────────────────────────────────
    updateStep(6);
    const fileNames = tree.map(f => f.name.toLowerCase());
    const hasReadme = fileNames.some(f => f.startsWith('readme'));
    const hasGitignore = fileNames.includes('.gitignore');
    const hasChangelog = fileNames.some(f => f.includes('changelog'));
    const hasCi = fileNames.includes('.gitlab-ci.yml');
    const stdFilesCount = [hasReadme, hasGitignore, hasChangelog].filter(Boolean).length;
    const stdFilesScore = stdFilesCount === 3 ? 100 : stdFilesCount === 2 ? 70 : 40;

    const hasLockFile = fileNames.some(f =>
        f === 'package-lock.json' || f === 'yarn.lock' || f === 'pnpm-lock.yaml' ||
        f === 'poetry.lock' || f === 'pipfile.lock' || f === 'go.sum' || f === 'gradle.lockfile'
    );
    const lockFilesScore = hasLockFile ? 100 : 40;
    const ciVersionedScore = hasCi ? 100 : 30;

    // ── ANALYSE CONTRIBUTEURS ───────────────────────────────────────────────
    updateStep(7);
    const activeContributors = contributors.filter(c => c.commits > 0).length;
    const busFactorScore = activeContributors >= 3 ? 100 : activeContributors >= 2 ? 60 : 30;

    const totalCommits = contributors.reduce((s, c) => s + c.commits, 0);
    const topContributorCommits = contributors.length > 0 ? Math.max(...contributors.map(c => c.commits)) : 0;
    const concentrationPct = totalCommits > 0 ? Math.round(topContributorCommits / totalCommits * 100) : 0;
    const concentrationScore = concentrationPct < 40 ? 100 : concentrationPct < 60 ? 60 : 30;

    let maxGap = 0;
    for (let i = 0; i < commits.length - 1; i++) {
        const gap = (new Date(commits[i].created_at) - new Date(commits[i + 1].created_at)) / 86400000;
        maxGap = Math.max(maxGap, gap);
    }
    const regularityScore = maxGap < 7 ? 100 : maxGap < 14 ? 70 : 40;

    // ── ANALYSE FEATURE FLAGS + STAGES + MR SIZES + MAVEN ───────────────────
    updateStep(8);
    const flagVars = variables.filter(v =>
        v.key.toLowerCase().includes('flag') ||
        v.key.toLowerCase().includes('feature') ||
        v.key.toLowerCase().includes('toggle')
    );
    const featureFlagsScore = flagVars.length >= 3 ? 100 : flagVars.length >= 1 ? 60 : 30;
    const zombieFlags = flagVars.filter(v => !v.masked).length;
    const zombieFlagsScore = zombieFlags === 0 ? 100 : zombieFlags <= 3 ? 70 : 40;

    // Jobs + MR sizes + Maven en parallèle (3 fetches indépendants).
    const lastPipelineId = pipelines.length > 0 ? pipelines[0].id : null;
    const hasPom = fileNames.includes('pom.xml');

    const [jobs, mrSizes, pomContent] = await Promise.all([
        lastPipelineId ? glFetch(`/projects/${pid}/pipelines/${lastPipelineId}/jobs`) : Promise.resolve(null),
        // MR sizes : runWithConcurrency au lieu de Promise.all « brut » (20
        // fetches → si l'instance est saturée, on cape à 8 simultanés).
        (async () => {
            if (mergedMRs.length === 0) return [];
            const tasks = mergedMRs.slice(0, 20).map(mr => async () => {
                const changes = await glFetch(`/projects/${pid}/merge_requests/${mr.iid}/changes`);
                return changes?.changes?.length || 0;
            });
            const results = await runWithConcurrency(tasks, FETCH_CONCURRENCY);
            return results.map(r => r.status === 'fulfilled' ? r.value : 0);
        })(),
        // Maven : fetch RAW (avant : glFetch utilisait .json() → typeof
        // pomContent === 'string' était toujours faux → code mort).
        hasPom ? glFetchRaw(`/projects/${pid}/repository/files/pom.xml/raw?ref=${encodeURIComponent(defaultBranch)}`)
               : Promise.resolve(null)
    ]);

    let pipelineStagesScore = 50;
    if (jobs && jobs.length > 0) {
        const stages = [...new Set(jobs.map(j => j.stage.toLowerCase()))];
        const hasTest = stages.some(s => s.includes('test'));
        const hasLint = stages.some(s => s.includes('lint') || s.includes('quality'));
        const hasSecurity = stages.some(s => s.includes('secur') || s.includes('sast') || s.includes('scan'));
        const stageCount = [hasTest, hasLint, hasSecurity].filter(Boolean).length;
        pipelineStagesScore = stageCount >= 3 ? 100 : stageCount >= 2 ? 70 : 40;
    }

    const avgMRSize = mrSizes.length > 0
        ? Math.round(mrSizes.reduce((a, b) => a + b, 0) / mrSizes.length)
        : 0;
    const mrSizeScore = avgMRSize < 10 ? 100 : avgMRSize < 25 ? 60 : 30;

    const recentReleases = releases.filter(r => new Date(r.released_at || r.created_at) > since90d).length;
    const releasesScore = recentReleases >= 5 ? 100 : recentReleases >= 1 ? 60 : 30;

    // Maven check : maintenant fonctionnel (pomContent est une vraie string)
    let mavenScore = null;
    if (hasPom && typeof pomContent === 'string') {
        const snapshotCount = (pomContent.match(/SNAPSHOT/gi) || []).length;
        mavenScore = snapshotCount === 0 ? 100 : snapshotCount <= 2 ? 70 : 40;
    }

    GITLAB_DATA = {
        deploy_freq: { score: deployFreqScore, val: `${deployFreq}/jour`, rule: '≥ 3/jour' },
        pipeline_ok: { score: pipelineOkScore, val: `${pipelineOkPct}%`, rule: '≥ 90%' },
        deploy_main: { score: deployMainScore, val: `${deployMainPct}% via ${defaultBranch}`, rule: '≥ 90%' },
        releases: { score: releasesScore, val: `${recentReleases} en 3 mois`, rule: '≥ 5/trimestre' },
        pipeline_duration: { score: durationScore, val: `${avgDuration} min`, rule: '< 10 min' },
        review_time: { score: reviewTimeScore, val: `${avgReviewTime.toFixed(1)} jours`, rule: '< 2 jours' },
        approval_rules: { score: approvalRulesScore, val: `${minApprovers} approbateur(s)`, rule: '2+ approbateurs' },
        discussions_mr: { score: discussionsScore, val: `${avgDiscussions.toFixed(1)} /MR`, rule: '≥ 3/MR' },
        mr_size: { score: mrSizeScore, val: `${avgMRSize} fichiers/MR`, rule: '< 10 fichiers' },
        mr_no_approval: { score: noApprovalScore, val: `${noApprovalPct}% sans review`, rule: '0%' },
        fail_rate: { score: failRateScore, val: `${failRate}%`, rule: '< 5%' },
        trend: { score: trendScore, val: `${trendDiff >= 0 ? '+' : ''}${trendDiff}%`, rule: 'Stable' },
        recovery_time: { score: recoveryScore, val: `${avgRecovery}h`, rule: '< 2h' },
        fail_streak: { score: failStreakScore, val: `max ${maxStreak}`, rule: 'max 1' },
        stale_branches: { score: staleBranchesScore, val: `${staleBranches} branches`, rule: '< 5' },
        lock_files: { score: lockFilesScore, val: hasLockFile ? 'Présents' : 'Absents', rule: 'Présents' },
        branch_protection: { score: branchProtectionScore, val: isProtected ? (forcePushAllowed ? 'Protégée, force push ON' : 'Protégée, force push OFF') : 'Non protégée', rule: 'Force push OFF' },
        std_files: { score: stdFilesScore, val: [hasReadme ? 'README' : '', hasGitignore ? '.gitignore' : '', hasChangelog ? 'CHANGELOG' : ''].filter(Boolean).join(' + ') || 'Aucun', rule: 'README + .gitignore + CHANGELOG' },
        zombie_mrs: { score: zombieMRsScore, val: `${zombieMRs} MR > 7j`, rule: '0' },
        bus_factor: { score: busFactorScore, val: `${activeContributors} contributeurs`, rule: '≥ 3' },
        commit_concentration: { score: concentrationScore, val: `${concentrationPct}% par 1`, rule: '< 40%' },
        reviewer_diversity: { score: reviewerDiversityScore, val: `${reviewerDiversity} reviewers`, rule: '≥ 3' },
        commit_regularity: { score: regularityScore, val: `gap ${Math.round(maxGap)}j`, rule: '< 7j' },
        feature_flags: { score: featureFlagsScore, val: `${flagVars.length} flags`, rule: 'Gérés' },
        zombie_flags: { score: zombieFlagsScore, val: `${zombieFlags} suspects`, rule: '0' },
        maven_versions: { score: mavenScore, val: mavenScore === null ? 'Non applicable' : mavenScore === 100 ? '0 SNAPSHOT' : 'SNAPSHOT présents', rule: '0' },
        pipeline_stages: { score: pipelineStagesScore, val: pipelineStagesScore >= 100 ? 'test+lint+secu' : pipelineStagesScore >= 70 ? '2 stages' : 'incomplet', rule: 'test+lint+secu' },
        ci_versioned: { score: ciVersionedScore, val: hasCi ? 'Présent' : 'Absent', rule: 'Présent' },
        sec_branch_protected: { score: isProtected ? 100 : 30, val: isProtected ? 'Protégée' : 'Non protégée', rule: 'Protégée' },
        sec_force_push: { score: !forcePushAllowed ? 100 : 40, val: forcePushAllowed ? 'Autorisé' : 'Interdit', rule: 'Interdit' },
        sec_author_approval: { score: !authorCanApprove ? 100 : 40, val: authorCanApprove ? 'Autorisé' : 'Bloqué', rule: 'Bloqué' },
        sec_committer_approval: { score: !committerCanApprove ? 100 : 40, val: committerCanApprove ? 'Autorisé' : 'Bloqué', rule: 'Bloqué' },
        sec_reset_approvals: { score: resetOnPush ? 100 : 40, val: resetOnPush ? 'Activé' : 'Désactivé', rule: 'Activé' }
    };

    return GITLAB_DATA;
}


function exportMaturityState() {
    const squad = (document.getElementById('inSquad').value || '').trim();
    const tribu = (document.getElementById('inTribu').value || '').trim();
    const date  = document.getElementById('inDate').value || new Date().toISOString().split('T')[0];

    if (Object.keys(answers).length === 0) {
        alert('Rien à sauvegarder : aucune réponse pour le moment.');
        return;
    }

    const payload = {
        type: MATURITY_STATE_TYPE,
        version: MATURITY_STATE_VERSION,
        exportedAt: new Date().toISOString(),
        metadata: { squad, tribu, date },
        progress: { currentCatIdx },
        answers: { ...answers }
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);

    // Nom de fichier : maturite-<squad>-<date>.json (slugifié)
    const slug = (squad || 'squad')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'squad';
    const filename = `maturite-${slug}-${date}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') showToast(`💾 Sauvegardé : ${filename}`, 'success');
}


function importMaturityState(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    // Reset le file input pour permettre de réimporter le même fichier ensuite
    event.target.value = '';

    const reader = new FileReader();
    reader.onerror = () => alert('❌ Impossible de lire le fichier.');
    reader.onload = (e) => {
        let data;
        try {
            data = JSON.parse(e.target.result);
        } catch (err) {
            alert('❌ Fichier JSON invalide : ' + err.message);
            return;
        }

        // Validation du format
        if (!data || typeof data !== 'object') {
            alert('❌ Fichier invalide : structure inattendue.');
            return;
        }
        if (data.type !== MATURITY_STATE_TYPE) {
            alert(`❌ Ce fichier n'est pas une sauvegarde de maturité DevOps Hub (type attendu : "${MATURITY_STATE_TYPE}").`);
            return;
        }
        if (typeof data.version !== 'number' || data.version > MATURITY_STATE_VERSION) {
            alert(`❌ Version de fichier non supportée (${data.version}). Version max : ${MATURITY_STATE_VERSION}.`);
            return;
        }
        if (!data.answers || typeof data.answers !== 'object') {
            alert('❌ Fichier invalide : aucune réponse trouvée.');
            return;
        }

        // Restauration des métadonnées
        const meta = data.metadata || {};
        if (meta.squad) document.getElementById('inSquad').value = meta.squad;
        if (meta.tribu) document.getElementById('inTribu').value = meta.tribu;
        if (meta.date)  document.getElementById('inDate').value  = meta.date;

        // Restauration des réponses (on vide l'état actuel d'abord)
        Object.keys(answers).forEach(k => delete answers[k]);
        Object.entries(data.answers).forEach(([qid, val]) => { answers[qid] = val; });

        // Restauration de la progression — clampé sur la plage valide
        const restoredIdx = (data.progress && typeof data.progress.currentCatIdx === 'number')
            ? data.progress.currentCatIdx : 0;
        currentCatIdx = Math.max(0, Math.min(restoredIdx, quizCategories.length - 1));

        // Bascule sur l'écran quiz
        renderCategory();
        showScreen('s-quiz');

        const answeredCount = Object.keys(answers).length;
        if (typeof showToast === 'function') {
            showToast(`📂 Évaluation restaurée — ${answeredCount} réponse${answeredCount > 1 ? 's' : ''}`, 'success');
        }
    };
    reader.readAsText(file);
}


async function loadAccompagnement() {
    if (ACCOMPAGNEMENT_DATA) return ACCOMPAGNEMENT_DATA;
    ACCOMPAGNEMENT_DATA = ACCOMPAGNEMENT_INLINE;
    return ACCOMPAGNEMENT_DATA;
}
