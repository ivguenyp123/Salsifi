/* gouvernance-repo · index.js — bootstrap : DOMContentLoaded + expositions window.* (chargé en dernier).
 * Portée globale du script classique (module déballé de son IIFE). */

'use strict';


  // ── Init : auth lue du hub, puis démarrage auto (le clic sur le service = le déclencheur) ──
  document.addEventListener('DOMContentLoaded', () => {
    const raw = localStorage.getItem('devops_hub_workspaces');
    if (!raw) { window.location.href = 'login.html'; return; }
    let g;
    try { g = JSON.parse(raw); } catch { window.location.href = 'login.html'; return; }
    GITLAB_URL = g.gitlabUrl; token = g.token; username = g.username || '';
    if (!token || !GITLAB_URL) { window.location.href = 'login.html'; return; }

    // Mode mono-repo depuis le hub (?repo=<id>).
    const rid = new URLSearchParams(location.search).get('repo');
    monoRepoId = rid && /^\d+$/.test(rid) ? rid : null;

    // Mode workspace (carte « Gouvernance Workspace » du hub → ?scope=workspace).
    // On force le mode dès que le scope est demandé : ainsi, si le workspace est
    // introuvable, on scanne 0 repo (message d'erreur) — JAMAIS "tous les repos".
    if (!monoRepoId && new URLSearchParams(location.search).get('scope') === 'workspace') {
      workspaceMode = true;
      try {
        const ws = JSON.parse(sessionStorage.getItem('current_workspace') || 'null');
        if (ws && Array.isArray(ws.repositories)) {
          workspaceRepos = ws.repositories;
          workspaceName = ws.name || 'workspace';
        }
      } catch { /* current_workspace illisible → workspaceRepos reste vide */ }
    }

    document.querySelectorAll('[data-hub-link]').forEach(a => { a.href = HUB_URL; });
    const pill = document.getElementById('userPill');
    if (pill) pill.textContent = username ? `👤 ${username}` : '🔓 connecté';

    // En mode mono-repo, on affiche le repo ciblé dans le pill/badge dès l'init.
    if (monoRepoId) {
      fetchGL(`/projects/${monoRepoId}`).then(p => {
        if (p && p.path_with_namespace) {
          const wb = document.getElementById('userPill');
          if (wb) wb.textContent = `📦 ${p.path_with_namespace}`;
        }
      }).catch(() => {});
    } else if (workspaceMode) {
      const wb = document.getElementById('userPill');
      if (wb) wb.textContent = `🗂️ ${workspaceName} (${workspaceRepos.length} repos)`;
    }

    // Pas de scan auto au chargement : on choisit un mode puis on lance.
    show('enumSection', false);
    const grid = document.getElementById('findingsGrid');
    if (grid) {
      show('resultsSection', true);
      const bar = document.getElementById('summaryBar'); if (bar) bar.style.display = 'none';
      const exp = document.getElementById('exportRow'); if (exp) exp.style.display = 'none';
      if (workspaceMode && !workspaceRepos.length) {
        grid.innerHTML = `<div class="state-box"><div class="icon">🗂️</div><h3>Aucun repo de workspace à analyser</h3><p>Ouvre ce module depuis le hub : choisis une tribu (workspace) puis clique sur Gouvernance Workspace. <br><a href="${HUB_URL}" style="color:#a78bfa;">← Retour au hub</a></p></div>`;
      } else {
        const scope = monoRepoId ? 'ce repo' : (workspaceMode ? `les ${workspaceRepos.length} repos du workspace « ${workspaceName} »` : 'tous tes repos');
        grid.innerHTML = `<div class="state-box"><div class="icon">🛡️</div><h3>Choisis tes vérifications</h3><p>Analyse de <strong>${scope}</strong> — 🌊 Surface · 🕳️ Historique · 📦 Supply-chain · 🛡️ CIS.<br>Clique <strong>▶️ Vérifier</strong> pour choisir un ou plusieurs contrôles et tout lancer d'un coup, ou utilise le mode-bar pour un scan isolé.</p></div>`;
        // Popup d'entrée : « tu veux vérifier quoi ? » (multi-sélection, puis tout lancer)
        openLaunchModal();
      }
    }
  });


  // ══════════════════════════════════════════════════════════════════════
  // ORCHESTRATION : énumère → scanne → affiche (automatique)
  // ══════════════════════════════════════════════════════════════════════
  async function run() {
    if (running) return;
    running = true; aborted = false; results = []; liveCount = 0;
    resetMrPanel();

    show('resultsSection', false);
    show('scanSection', false);
    document.getElementById('findingsGrid').innerHTML = '';
    show('enumSection', true);
    const enumCount = document.getElementById('enumCount');

    let done = 0, total = 0, totalFindings = 0, reposAffected = 0;
    try {
      // 1) Énumération
      const repos = await listAccessibleRepos(n => { enumCount.textContent = `${fmt(n)} repos accessibles…`; });
      show('enumSection', false);

      if (aborted) { showToast('Interrompu.', 'info'); return; }
      if (!repos.length) {
        document.getElementById('findingsGrid').innerHTML =
          `<div class="state-box"><div class="icon">⚠️</div><h3>Aucun repo accessible</h3><p>Le token ne voit aucun projet, ou l'API a renvoyé une erreur.</p></div>`;
        show('resultsSection', true);
        return;
      }

      // 2) Scan (concurrence limitée, abortable, rendu live)
      show('scanSection', true);
      total = repos.length;
      let idx = 0;
      const CONC = 3;

      const setProg = (label) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressText').textContent = `${fmt(done)} / ${fmt(total)} repos`;
        document.getElementById('progressSub').textContent = label || '';
        document.getElementById('liveStat').textContent = `🔑 ${fmt(totalFindings)} secret(s) · ${fmt(reposAffected)} repo(s)`;
      };
      setProg('Démarrage…');

      async function worker() {
        while (idx < repos.length && !aborted) {
          const repo = repos[idx++];
          try {
            setProg(repo.path);
            const res = await scanSecrets(repo, (d, t) => setProg(`${repo.path} (${d}/${t} fichiers)`));
            done++;
            results.push({ repo, res });
            if (res.findings.length) { reposAffected++; totalFindings += res.findings.length; appendFindingCard(repo, res); }
          } catch (e) {
            console.warn('Repo ignoré (erreur):', repo.path, e);
            done++; // on n'abandonne jamais tout le run pour un repo
          }
          setProg(repo.path);
        }
      }
      await Promise.all(Array.from({ length: CONC }, () => worker()));

      show('scanSection', false);
      finishScan(done, total, totalFindings, reposAffected);
    } catch (e) {
      console.error('Scan interrompu par une erreur:', e);
      show('enumSection', false);
      show('scanSection', false);
      finishScan(done, total, totalFindings, reposAffected); // résultats partiels
      showToast('Erreur pendant le scan — résultats partiels affichés.', 'error');
    } finally {
      running = false;
    }
  }


  function stopScan() { aborted = true; showToast('Scan interrompu — résultats partiels affichés.', 'info'); }

  function rescan() { if (!running) run(); }


  async function runHistory(maxRepos) {
    if (running) return;
    running = true; aborted = false; results = []; liveCount = 0;
    resetMrPanel();
    apiCalls = 0; throttles = 0; commitsProcessed = 0; runStart = Date.now();

    show('resultsSection', false);
    show('scanSection', false);
    document.getElementById('findingsGrid').innerHTML = '';
    show('enumSection', true);
    const enumCount = document.getElementById('enumCount');

    let done = 0, total = 0, totalFindings = 0, reposAffected = 0;
    try {
      const repos = await listAccessibleRepos(n => { enumCount.textContent = `${fmt(n)} repos (limite ${fmt(maxRepos)})…`; }, maxRepos);
      show('enumSection', false);
      if (aborted) { showToast('Interrompu.', 'info'); return; }
      if (!repos.length) {
        document.getElementById('findingsGrid').innerHTML =
          `<div class="state-box"><div class="icon">⚠️</div><h3>Aucun repo accessible</h3></div>`;
        show('resultsSection', true); return;
      }

      show('scanSection', true);
      show('histStats', true);
      total = repos.length;
      let idx = 0;
      let sinceSave = 0;
      const histState = loadHistState();
      const CONC = 2; // repos en parallèle (chaque repo parallélise déjà ses commits)

      const tick = (label) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressText').textContent = `${fmt(done)} / ${fmt(total)} repos · historique`;
        document.getElementById('progressSub').textContent = label || '';
        document.getElementById('liveStat').textContent = `🔑 ${fmt(totalFindings)} secret(s)`;
        updateHistInstr(done, total, totalFindings, reposAffected);
      };
      tick('Démarrage…');

      async function worker() {
        while (idx < repos.length && !aborted) {
          const repo = repos[idx++];
          try {
            tick(repo.path);
            const prev = histState[repo.id];
            const res = await scanHistory(repo, () => tick(repo.path), prev);
            done++;
            results.push({ repo, res });
            // curseur + findings cumulés persistés (findings stockés seulement si présents)
            histState[repo.id] = res.findings.length
              ? { since: res.since, findings: res.findings }
              : { since: res.since };
            if (++sinceSave >= 10) { sinceSave = 0; saveHistState(histState); }
            if (res.findings.length) { reposAffected++; totalFindings += res.findings.length; appendFindingCard(repo, res); }
          } catch (e) {
            console.warn('Repo ignoré (erreur):', repo.path, e); done++;
          }
          tick(repo.path);
        }
      }
      await Promise.all(Array.from({ length: CONC }, () => worker()));
      saveHistState(histState); // flush final (reprise complète au prochain run)

      show('scanSection', false);
      const extra = `· ${fmt(commitsProcessed)} commits · ${fmt(apiCalls)} appels API · ${fmt(throttles)} throttles · ${fmtDur((Date.now() - runStart) / 1000)}`;
      finishScan(done, total, totalFindings, reposAffected, extra);
    } catch (e) {
      console.error('Scan historique interrompu:', e);
      show('enumSection', false); show('scanSection', false);
      finishScan(done, total, totalFindings, reposAffected, '· run interrompu');
      showToast('Erreur pendant le scan — résultats partiels affichés.', 'error');
    } finally {
      running = false;
    }
  }


  async function runSupply() {
    if (running) return;
    running = true; aborted = false; results = []; liveCount = 0;
    resetMrPanel();

    show('resultsSection', false);
    show('scanSection', false);
    show('histStats', false);
    document.getElementById('findingsGrid').innerHTML = '';
    show('enumSection', true);
    const enumCount = document.getElementById('enumCount');

    let done = 0, total = 0, totalFindings = 0, reposAffected = 0;
    try {
      const repos = await listAccessibleRepos(n => { enumCount.textContent = `${fmt(n)} repos accessibles…`; });
      show('enumSection', false);
      if (aborted) { showToast('Interrompu.', 'info'); return; }
      if (!repos.length) {
        document.getElementById('findingsGrid').innerHTML =
          `<div class="state-box"><div class="icon">⚠️</div><h3>Aucun repo accessible</h3></div>`;
        show('resultsSection', true); return;
      }

      show('scanSection', true);
      total = repos.length;
      let idx = 0;
      const CONC = 3;
      const setProg = (label) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressText').textContent = `${fmt(done)} / ${fmt(total)} repos · supply-chain`;
        document.getElementById('progressSub').textContent = label || '';
        document.getElementById('liveStat').textContent = `📦 ${fmt(totalFindings)} alerte(s) · ${fmt(reposAffected)} repo(s)`;
      };
      setProg('Démarrage…');

      async function worker() {
        while (idx < repos.length && !aborted) {
          const repo = repos[idx++];
          try {
            setProg(repo.path);
            const res = await scanSupplyChain(repo, (d, t) => setProg(`${repo.path} (${d}/${t} fichiers)`));
            done++;
            results.push({ repo, res });
            if (res.findings.length) { reposAffected++; totalFindings += res.findings.length; appendFindingCard(repo, res); }
          } catch (e) {
            console.warn('Repo ignoré (erreur):', repo.path, e); done++;
          }
          setProg(repo.path);
        }
      }
      await Promise.all(Array.from({ length: CONC }, () => worker()));

      show('scanSection', false);
      finishScan(done, total, totalFindings, reposAffected);
    } catch (e) {
      console.error('Scan supply-chain interrompu:', e);
      show('enumSection', false); show('scanSection', false);
      finishScan(done, total, totalFindings, reposAffected);
      showToast('Erreur pendant le scan — résultats partiels affichés.', 'error');
    } finally {
      running = false;
    }
  }


  function startScan() {
    if (running) { showToast('Un scan est déjà en cours.', 'info'); return; }
    if (mode === 'history') {
      const v = parseInt((document.getElementById('histCount') || {}).value, 10);
      runHistory(Number.isFinite(v) && v > 0 ? v : null); // vide / 0 → tous les repos
    } else if (mode === 'supply') {
      runSupply();
    } else if (mode === 'cis') {
      runCIS();
    } else {
      run();
    }
  }

  function launchSelected() {
    if (running || mrCreating) { showToast('Un scan est déjà en cours.', 'info'); return; }
    const checks = [];
    if (document.getElementById('lc-surface').checked) checks.push('surface');
    if (document.getElementById('lc-history').checked) checks.push('history');
    if (document.getElementById('lc-supply').checked) checks.push('supply');
    if (document.getElementById('lc-cis').checked) checks.push('cis');
    if (!checks.length) { showToast('Choisis au moins une vérification.', 'error'); return; }
    const opts = {
      mr: document.getElementById('lc-mr').checked,
      report: document.getElementById('lc-report').checked,
    };
    closeLaunchModal();
    runSelectedChecks(checks, opts);
  }


  async function runSelectedChecks(checks, opts) {
    opts = opts || {};
    const wantMR = opts.mr !== false;
    autoMR = false;
    aborted = false;
    const order = ['surface', 'history', 'supply', 'cis'].filter(c => checks.includes(c));

    // Flux guidé : on masque tout et on n'affiche que le loader propre.
    orchestrating = true;
    document.getElementById('resultsSection').style.display = 'none';
    show('enumSection', false); show('scanSection', false);
    const loader = document.getElementById('orchLoader'); if (loader) loader.style.display = 'flex';
    orchSetPhase(order, 0);

    try {
      for (let i = 0; i < order.length; i++) {
        const c = order[i];
        if (aborted) break;
        orchSetPhase(order, i);
        if (c === 'surface') { setMode('surface'); await run(); }
        else if (c === 'history') {
          setMode('history');
          const v = parseInt((document.getElementById('histCount') || {}).value, 10);
          await runHistory(Number.isFinite(v) && v > 0 ? v : null);
        } else if (c === 'supply') { setMode('supply'); await runSupply(); }
        else if (c === 'cis') { setMode('cis'); await runCIS(); }
        // MR de CE scan, résultats encore intacts (le scan suivant n'a pas démarré).
        if (wantMR && !aborted) {
          aborted = false;
          orchSetPhase(order, i, 'création des MR');
          try { if (c === 'cis') await createCISMRs(); else await createReportMRs(); }
          catch (e) { console.warn('Création MR échouée pour', c, e); }
        }
      }
    } finally {
      autoMR = true;                      // retour au défaut
      orchestrating = false;              // on ré-autorise l'affichage des sections
      const l = document.getElementById('orchLoader'); if (l) l.style.display = 'none';
      resetMrPanel();                     // le panneau MR transitoire n'apparaît pas dans la vue finale
    }

    // Une seule vue finale : tous les résultats consolidés PAR REPO, priorisés.
    renderConsolidated();
    if (opts.report !== false && (scannedSecrets || scannedSupply || scannedCIS)) {
      exportReport();                     // le même contenu, en fichier téléchargeable
    }
    showToast('✅ Vérification terminée', 'success');
  }


  function runCIS() {
    return runGeneric({
      label: 'CIS',
      liveNoun: n => `🛡️ score moyen ${n}`,
      scanOne: (repo) => scanCIS(repo),
      finish: finishScanCIS,
    });
  }


  // Boucle générique d'énumération + workers concurrents (calquée sur runSupply).
  // Utilisée par le mode CIS. scanOne(repo) → res ; finish(...) → rendu final.
  async function runGeneric({ label, scanOne, finish }) {
    if (running) return;
    running = true; aborted = false; results = []; liveCount = 0;
    resetMrPanel();
    apiCalls = 0; throttles = 0; runStart = Date.now();

    show('resultsSection', false);
    show('scanSection', false);
    show('histStats', false);
    document.getElementById('findingsGrid').innerHTML = '';
    show('enumSection', true);
    const enumCount = document.getElementById('enumCount');

    let done = 0, total = 0;
    try {
      const repos = await listAccessibleRepos(n => { enumCount.textContent = `${fmt(n)} repos accessibles…`; });
      show('enumSection', false);
      if (aborted) { showToast('Interrompu.', 'info'); return; }
      if (!repos.length) {
        document.getElementById('findingsGrid').innerHTML =
          `<div class="state-box"><div class="icon">⚠️</div><h3>Aucun repo accessible</h3></div>`;
        show('resultsSection', true); return;
      }

      show('scanSection', true);
      total = repos.length;
      let idx = 0;
      const CONC = 3;
      const setProg = (lbl) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        const avg = results.length ? Math.round(results.reduce((s, r) => s + (r.res.score ?? 0), 0) / results.length) : 0;
        const nc = results.filter(r => r.res.status === 'nonconform').length;
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressText').textContent = `${fmt(done)} / ${fmt(total)} repos · ${label}`;
        document.getElementById('progressSub').textContent = lbl || '';
        document.getElementById('liveStat').textContent = `🛡️ moy. ${avg}/100 · ${fmt(nc)} non conforme(s)`;
      };
      setProg('Démarrage…');

      async function worker() {
        while (idx < repos.length && !aborted) {
          const repo = repos[idx++];
          try {
            setProg(repo.path);
            const res = await scanOne(repo);
            done++;
            results.push({ repo, res });
            appendCISCard(repo, res);
          } catch (e) {
            console.warn('Repo ignoré (erreur):', repo.path, e); done++;
          }
          setProg(repo.path);
        }
      }
      await Promise.all(Array.from({ length: CONC }, () => worker()));

      show('scanSection', false);
      const extra = `· ${fmt(apiCalls)} appels API · ${fmt(throttles)} throttles · ${fmtDur((Date.now() - runStart) / 1000)}`;
      finish(done, total, extra);
    } catch (e) {
      console.error(`Scan ${label} interrompu:`, e);
      show('enumSection', false); show('scanSection', false);
      finish(done, total, '· run interrompu');
      showToast('Erreur pendant le scan — résultats partiels affichés.', 'error');
    } finally {
      running = false;
    }
  }



  window.rescan = rescan;

  window.setMode = setMode;

  window.startScan = startScan;

  window.resetHistory = resetHistory;

  window.filterByType = filterByType;

  window.filterCIS = filterCIS;

  window.toggleCard = toggleCard;

  window.exportExcel = exportExcel;

  window.exportJson = exportJson;

  window.exportMarkdown = exportMarkdown;

  window.exportReport = exportReport;

  window.showInfo = showInfo;

  window.closeInfo = closeInfo;

  window.openLaunchModal = openLaunchModal;

  window.closeLaunchModal = closeLaunchModal;

  window.toggleAllChecks = toggleAllChecks;

  window.launchSelected = launchSelected;
