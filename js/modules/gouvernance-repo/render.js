/* gouvernance-repo · render.js — rendu DOM : cards, charts, modals, filtres, toasts, download.
 * Portée globale du script classique (module déballé de son IIFE). */

'use strict';

  function updateHistInstr(reposDone, reposTotal, secrets, reposAffected) {
    const el = document.getElementById('histStats'); if (!el) return;
    const elapsed = (Date.now() - runStart) / 1000;
    const rate = elapsed > 0 ? commitsProcessed / elapsed : 0;
    // ETA : extrapolation grossière sur les repos restants au débit commits courant
    let eta = '—';
    if (reposDone > 0 && rate > 0) {
      const avgCommits = commitsProcessed / reposDone;
      const remaining = (reposTotal - reposDone) * avgCommits;
      eta = '≈ ' + fmtDur(remaining / rate);
    }
    el.innerHTML = [
      ['Repos', `${fmt(reposDone)} / ${fmt(reposTotal)}`],
      ['Commits scannés', fmt(commitsProcessed)],
      ['Débit', `${rate.toFixed(1)} commits/s`],
      ['Appels API', fmt(apiCalls)],
      ['429 (throttle)', fmt(throttles)],
      ['Écoulé', fmtDur(elapsed)],
      ['ETA (estim.)', eta],
      ['Secrets', `${fmt(secrets)} dans ${fmt(reposAffected)} repo(s)`],
    ].map(([k, v]) => `<div class="instr-cell"><div class="instr-k">${k}</div><div class="instr-v">${v}</div></div>`).join('');
  }


  // Ne sert plus qu'à porter la variable `mode` (lue par finishScan pour les
  // titres). La barre de modes a été retirée → tout est null-safe.
  function setMode(m) {
    mode = m;
    const tog = (id, on) => { const el = document.getElementById(id); if (el) el.classList.toggle('active', on); };
    tog('btnSurface', m === 'surface'); tog('btnHistory', m === 'history');
    tog('btnSupply', m === 'supply'); tog('btnCIS', m === 'cis');
    show('surfaceControls', m === 'surface');
    show('histControls', m === 'history');
    show('supplyControls', m === 'supply');
    show('cisControls', m === 'cis');
    if (monoRepoId) { const hc = document.getElementById('histCount'); if (hc && hc.closest('label')) hc.closest('label').style.display = 'none'; }
  }

  function openLaunchModal() {
    const el = document.getElementById('launchScope');
    if (el) el.textContent = 'Portée : ' + launchScopeLabel();
    const m = document.getElementById('launchModal');
    if (m) m.style.display = 'flex';
  }

  function closeLaunchModal() {
    const m = document.getElementById('launchModal');
    if (m) m.style.display = 'none';
  }

  function toggleAllChecks() {
    const ids = ['lc-surface', 'lc-history', 'lc-supply', 'lc-cis'];
    const allOn = ids.every(id => document.getElementById(id) && document.getElementById(id).checked);
    ids.forEach(id => { const c = document.getElementById(id); if (c) c.checked = !allOn; });
  }

  function orchSetPhase(order, i, extra) {
    const el = document.getElementById('orchTitle'); const sub = document.getElementById('orchSub'); const steps = document.getElementById('orchSteps');
    if (el) el.textContent = 'Analyse de sécurité en cours…';
    if (sub) sub.textContent = i < order.length ? `${CHECK_LABEL[order[i]]} — étape ${i + 1}/${order.length}${extra ? ' · ' + extra : ''}` : 'Consolidation…';
    if (steps) steps.innerHTML = order.map((c, k) =>
      `<span class="orch-step ${k < i ? 'done' : (k === i ? 'active' : '')}">${k < i ? '✓' : (k === i ? '⏳' : '○')} ${CHECK_LABEL[c]}</span>`).join('');
  }


  function cardHTML(repo, findings, scanned) {
    const id = 'r' + repo.id;
    const branch = repo.defaultBranch && repo.defaultBranch !== 'HEAD' ? repo.defaultBranch : 'HEAD';
    const isSupply = findings.some(f => f.kind === 'supply');
    const isHist = findings.some(f => f.commit);
    const rows = findings.map(f => {
      const encFile = f.file.split('/').map(encodeURIComponent).join('/');
      const ref = f.commit ? f.commit : branch;
      const link = findingUrl(repo, f);
      const loc = f.line ? `<span class="f-line">:${f.line}</span>` : '';
      const commitChip = f.commit ? `<span class="commit-tag">@${escH(f.commit)}</span>` : '';
      const fileInner = `${escH(f.file)}${loc}`;
      const fileCell = link
        ? `<a href="${link}" target="_blank" rel="noopener" class="f-file">${fileInner}</a>`
        : `<span class="f-file">${fileInner}</span>`;
      const icon = f.severity === 'orange' ? '🟠' : (f.kind === 'supply' ? '🔴' : '🔑');
      const valClass = f.severity === 'orange' ? 'val-warn' : 'val-ko';
      const chip = f.tag ? f.tag : ('CIS ' + f.cis);
      return `<div class="diag-row"><span class="icon">${icon}</span><span class="label">${fileCell}${commitChip}</span><span class="${valClass}">${escH(f.type)}</span><span class="cis-tag">${escH(chip)}</span><code class="f-prev">${escH(f.preview)}</code></div>`;
    }).join('');
    const headIcon = isSupply ? '📦' : '🔑';
    const noun = isSupply ? 'alerte(s)' : 'secret(s)';
    const secTitle = isSupply ? '📦 Alertes supply-chain' : '🔑 Secrets détectés';
    const note = isSupply
      ? `⚠️ <strong>À corriger :</strong> épingler les versions (exactes ou par digest), retirer/auditer les hooks d'install non vérifiés, pinner les images CI/Docker (tag ou <code>@sha256</code>), bannir <code>curl|bash</code>.`
      : `⚠️ <strong>Action immédiate :</strong> (1) roter chaque secret côté service, (2) retirer du fichier, (3) purger l'historique Git (<code>git filter-repo</code>).`;
    return `<div class="repo-card critical">
      <div class="repo-header" onclick="toggleCard('${id}')">
        <div class="repo-icon">${headIcon}</div>
        <div class="repo-meta"><div class="repo-name">${escH(repo.name)}</div><div class="repo-path">${escH(repo.path)}</div></div>
        <div class="repo-checks"><span class="check-pill check-ko">${findings.length} ${noun}</span><span class="check-pill">${scanned} ${isHist ? 'commits' : 'fichier(s)'}</span></div>
        <span class="chevron">▾</span>
      </div>
      <div class="diagnostic" id="${id}">
        <div class="diag-section">
          <div class="diag-section-header red"><span>${secTitle}</span><span style="font-size:11px;opacity:0.7;">${findings.length} occurrence(s)</span></div>
          <div class="diag-body">${rows}
            <div class="diag-note">${note}</div>
          </div>
        </div>
      </div></div>`;
  }


  // Rendu live pendant le scan (ajout au fil de l'eau, plafonné)
  function appendFindingCard(repo, res) {
    if (liveCount >= RENDER_CAP) return;
    document.getElementById('findingsGrid').insertAdjacentHTML('beforeend', cardHTML(repo, res.findings, res.scanned));
    liveCount++;
  }


  // Rendu filtré (depuis les pastilles de catégorie). type=null → tout. Plafonné pour rester fluide.
  function renderFindings(type) {
    const grid = document.getElementById('findingsGrid');
    let html = '', shown = 0, matched = 0;
    for (const { repo, res } of affected()) {
      const fs = type ? res.findings.filter(f => f.type === type) : res.findings;
      if (!fs.length) continue;
      matched++;
      if (shown < RENDER_CAP) { html += cardHTML(repo, fs, res.scanned); shown++; }
    }
    if (matched > RENDER_CAP) {
      html += `<div class="state-box" style="padding:22px;"><p>Affichage limité à ${fmt(RENDER_CAP)} repos sur ${fmt(matched)}. Utilise <strong>📊 Export Excel</strong> pour la liste complète, ou filtre par catégorie.</p></div>`;
    }
    grid.innerHTML = matched ? html
      : `<div class="state-box"><div class="icon">🔎</div><h3>Aucun repo pour ce filtre</h3></div>`;
  }


  function filterByType(t) {
    t = t || null;
    currentTypeFilter = (t === currentTypeFilter) ? null : t;
    document.querySelectorAll('#summaryBar .type-pill').forEach(p => {
      p.classList.toggle('active', (p.dataset.type || '') === (currentTypeFilter || ''));
    });
    renderFindings(currentTypeFilter);
    document.getElementById('findingsGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }


  function finishScan(done, total, totalFindings, reposAffected, extraSub) {
    const isSupply = mode === 'supply';
    // Accumulation pour le rapport : on ajoute les findings du scan courant
    // dans la Map de la famille (secrets/supply), dédoublonnés par clé stricte.
    const target = isSupply ? reportSupply : reportSecrets;
    if (isSupply) scannedSupply = true; else scannedSecrets = true;
    for (const { repo, res } of results) {
      const ns = repo.path.split('/').slice(0, -1).join('/') || '—';
      const branch = repo.defaultBranch && repo.defaultBranch !== 'HEAD' ? repo.defaultBranch : 'HEAD';
      for (const f of res.findings) {
        // Clé stricte : un seul champ qui diffère = finding distinct (rien n'est caché à tort).
        const key = [repo.path, f.file, f.line || '', f.type, f.preview].join('|');
        if (target.has(key)) continue; // vrai doublon (ex. vu en Surface ET Historique) : on garde 1 fois
        const ref = f.commit ? f.commit : branch;
        const link = findingUrl(repo, f);
        target.set(key, { Repo: repo.path, Namespace: ns, Fichier: f.file, Ligne: f.line || '', Type: f.type, 'Catégorie': f.tag || ('CIS ' + f.cis), 'Aperçu': f.preview, Lien: link });
      }
    }
    const noun = isSupply ? 'alertes' : 'secrets';
    const title = isSupply ? 'Scan supply-chain' : (mode === 'history' ? 'Scan secrets (historique)' : 'Scan secrets');
    const byType = {};
    for (const { res } of results) for (const f of res.findings) byType[f.type] = (byType[f.type] || 0) + 1;
    const types = Object.keys(byType).sort((a, b) => byType[b] - byType[a]);
    const bar = document.getElementById('summaryBar');
    const partial = aborted ? ' (partiel)' : '';
    const circleColor = totalFindings === 0 ? 'var(--ok)' : 'var(--err)';
    bar.style.display = 'grid';
    bar.innerHTML = `
      <div class="score-circle" style="background:radial-gradient(circle at 30% 30%, ${circleColor}, rgba(0,0,0,0.2));"><div class="num">${fmt(totalFindings)}</div><div class="denom">${noun}</div></div>
      <div class="score-info">
        <div class="score-title">${title}${partial}</div>
        <div class="score-sub">${fmt(done)} / ${fmt(total)} repos scannés · ${fmt(reposAffected)} repo(s) touché(s) ${extraSub || ''}</div>
        <div class="type-pills">${types.length
          ? `<span class="type-pill all active" data-type="" onclick="filterByType('')">Tous <b>${fmt(totalFindings)}</b></span>` + types.map(t => `<span class="type-pill" data-type="${escH(t)}" onclick="filterByType('${String(t).replace(/'/g, "\\'")}')">${escH(t)} <b>${byType[t]}</b></span>`).join('')
          : `<span class="type-pill green">Aucune alerte ✅</span>`}</div>
      </div>`;
    currentTypeFilter = null;
    document.getElementById('exportRow').style.display = totalFindings ? 'flex' : 'none';
    if (!totalFindings) document.getElementById('findingsGrid').innerHTML =
      `<div class="state-box"><div class="icon">✅</div><h3>Aucune ${isSupply ? 'alerte' : 'fuite'} détectée</h3><p>${fmt(done)} repos scannés, ${fmt(results.reduce((s, r) => s + r.res.scanned, 0))} fichiers inspectés.</p></div>`;
    else renderFindings(null);
    show('resultsSection', true);
    renderCharts(byType, totalFindings, reposAffected, done);
    showToast(totalFindings === 0 ? `✅ Rien sur ${fmt(done)} repo(s)` : `⚠️ ${fmt(totalFindings)} ${noun} dans ${fmt(reposAffected)} repo(s)`, totalFindings === 0 ? 'success' : 'error');

    // ── Création auto des MR de rapport pour chaque repo touché ──
    // Asynchrone (ne bloque pas l'affichage). aborted a pu être mis par un Stop
    // pendant le scan : on le remet à false pour ce nouveau geste (la création
    // a son propre garde-fou forbidden). Une MR = proposition, jamais mergée.
    if (totalFindings > 0 && autoMR) {
      aborted = false;
      createReportMRs();
    }
  }


  function renderCharts(byType, totalFindings, reposAffected, reposScanned) {
    const panel = document.getElementById('chartsPanel');
    if (typeof Chart === 'undefined' || !totalFindings) { if (panel) panel.style.display = 'none'; return; }
    panel.style.display = 'grid';
    _charts.forEach(c => { try { c.destroy(); } catch {} });
    _charts = [];

    Chart.defaults.color = '#b8aed8';
    Chart.defaults.font.family = "'Manrope',sans-serif";
    Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';

    const shortPath = p => { const parts = String(p).split('/'); return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p; };

    // 1) Top 15 repos (barres horizontales)
    const top = affected().map(r => ({ path: r.repo.path, n: r.res.findings.length }))
      .sort((a, b) => b.n - a.n).slice(0, 15);
    _charts.push(new Chart(document.getElementById('chartTopRepos'), {
      type: 'bar',
      data: { labels: top.map(t => shortPath(t.path)), datasets: [{ data: top.map(t => t.n), backgroundColor: 'rgba(248,113,113,0.7)', borderColor: '#f87171', borderWidth: 1, borderRadius: 6 }] },
      options: {
        indexAxis: 'y', maintainAspectRatio: false, responsive: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => top[items[0].dataIndex].path } } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { ticks: { font: { size: 11 } } } }
      }
    }));

    // 2) Répartition par type (donut cliquable → filtre)
    const types = Object.keys(byType).sort((a, b) => byType[b] - byType[a]);
    const typesChart = new Chart(document.getElementById('chartTypes'), {
      type: 'doughnut',
      data: { labels: types, datasets: [{ data: types.map(t => byType[t]), backgroundColor: types.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]), borderColor: 'rgba(15,10,31,0.6)', borderWidth: 2 }] },
      options: {
        maintainAspectRatio: false, responsive: true, cutout: '60%',
        plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } },
        onClick: (e, els) => { if (els.length) filterByType(types[els[0].index]); }
      }
    });
    _charts.push(typesChart);

    // 3) Couverture : touchés vs propres, total au centre
    const clean = Math.max(0, reposScanned - reposAffected);
    _charts.push(new Chart(document.getElementById('chartCoverage'), {
      type: 'doughnut',
      data: { labels: ['Repos touchés', 'Repos propres'], datasets: [{ data: [reposAffected, clean], backgroundColor: ['#f87171', '#34d399'], borderColor: 'rgba(15,10,31,0.6)', borderWidth: 2 }] },
      options: { maintainAspectRatio: false, responsive: true, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } },
      plugins: [{
        id: 'centerTotal',
        afterDraw(chart) {
          const { ctx, chartArea: { left, right, top, bottom } } = chart;
          const x = (left + right) / 2, y = (top + bottom) / 2;
          ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#f5f1ff'; ctx.font = "800 26px 'Bricolage Grotesque',sans-serif";
          ctx.fillText(fmt(totalFindings), x, y - 8);
          ctx.fillStyle = '#b8aed8'; ctx.font = "600 11px 'Manrope',sans-serif";
          ctx.fillText('secrets', x, y + 14);
          ctx.restore();
        }
      }]
    }));
  }


  function _consRow(icon, file, line, link, type, preview, tag, valClass) {
    const loc = line ? ':' + line : '';
    const fileCell = link
      ? `<a href="${link}" target="_blank" rel="noopener" class="f-file">${escH(file)}${loc}</a>`
      : `<span class="f-file">${escH(file)}${loc}</span>`;
    return `<div class="diag-row"><span class="icon">${icon}</span><span class="label">${fileCell}</span><span class="${valClass}">${escH(type)}</span><span class="cis-tag">${escH(tag)}</span><code class="f-prev">${escH(preview)}</code></div>`;
  }

  function _consSection(title, rows) {
    return `<div class="diag-section"><div class="diag-section-header red"><span>${title}</span></div><div class="diag-body">${rows}</div></div>`;
  }


  function renderConsolidated() {
    const model = buildConsolidated();
    const t = model.totals;

    // Barre de synthèse
    const bar = document.getElementById('summaryBar');
    if (bar) {
      bar.style.display = 'grid';
      const ring = t.repos ? 'var(--err)' : 'var(--ok)';
      bar.innerHTML = `
        <div class="score-circle" style="background:radial-gradient(circle at 30% 30%, ${ring}, rgba(0,0,0,0.2));"><div class="num">${fmt(t.repos)}</div><div class="denom">repos à traiter</div></div>
        <div class="score-info">
          <div class="score-title">Résultats consolidés${aborted ? ' (partiel)' : ''}</div>
          <div class="score-sub">🔑 ${fmt(t.secrets)} secrets · 📦 ${fmt(t.supply)} alertes supply-chain · 🛡️ ${fmt(t.cisGaps)} écarts CIS · ${fmt(t.cisRepos)} repos audités CIS</div>
          <div class="type-pills"><span class="type-pill all active">Classés du plus risqué au moins risqué ↓</span></div>
        </div>`;
    }

    // Grille : un bloc par repo, trié par risque.
    const grid = document.getElementById('findingsGrid');
    if (!grid) return;
    if (!model.rows.length) {
      grid.innerHTML = `<div class="state-box"><div class="icon">✅</div><h3>Aucun problème détecté</h3><p>Rien à signaler sur le périmètre scanné.</p></div>`;
      return;
    }
    grid.innerHTML = model.rows.map((r, i) => {
      const id = 'cons' + i;
      const secRows = r.secrets.map(s => _consRow('🔑', s.Fichier, s.Ligne, s.Lien, s.Type, s['Aperçu'], s['Catégorie'], 'val-ko')).join('');
      const supRows = r.supply.map(s => { const red = severityForType(s.Type) === 'red'; return _consRow(red ? '🔴' : '🟠', s.Fichier, s.Ligne, s.Lien, s.Type, s['Aperçu'], s['Catégorie'], red ? 'val-ko' : 'val-warn'); }).join('');
      const cisRows = r.cis ? r.cis.gaps.map(g => `<div class="diag-row"><span class="icon">🛡️</span><span class="label">${escH(g.label)}</span><span class="val-ko">${escH(g.detail)}</span><span class="cis-tag">CIS ${escH(g.cis)}</span></div>`).join('') : '';
      const pills = [];
      if (r.secrets.length) pills.push(`<span class="check-pill check-ko">🔑 ${fmt(r.secrets.length)}</span>`);
      if (r.supply.length) pills.push(`<span class="check-pill">📦 ${fmt(r.supply.length)}</span>`);
      if (r.cisGaps) pills.push(`<span class="check-pill">🛡️ ${fmt(r.cisGaps)}${r.cis ? ' · score ' + r.cis.Score : ''}</span>`);
      const repoName = r.path.split('/').pop();
      return `<div class="repo-card critical">
        <div class="repo-header" onclick="toggleCard('${id}')">
          <div class="cons-rank">#${i + 1}</div>
          <div class="repo-meta"><div class="repo-name">${escH(repoName)}</div><div class="repo-path">${escH(r.path)}</div></div>
          <div class="repo-checks">${pills.join('')}<span class="cons-risk" title="Score de risque combiné">risque ${fmt(r.risk)}</span></div>
          <span class="chevron">▾</span>
        </div>
        <div class="diagnostic" id="${id}">
          ${secRows ? _consSection('🔑 Secrets exposés', secRows) : ''}
          ${supRows ? _consSection('📦 Supply-chain', supRows) : ''}
          ${cisRows ? _consSection('🛡️ Conformité CIS', cisRows) : ''}
        </div>
      </div>`;
    }).join('');

    const cp = document.getElementById('chartsPanel'); if (cp) cp.style.display = 'none';
    document.getElementById('exportRow').style.display = 'flex';
    show('resultsSection', true);
  }


  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }


  // ── Helpers ──
  function show(id, on) {
    // En flux guidé, les sections transitoires restent masquées : seul le
    // loader unique est visible jusqu'à l'affichage final des résultats.
    if (orchestrating && (id === 'enumSection' || id === 'scanSection' || id === 'resultsSection')) return;
    const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none';
  }

  function toggleCard(id) { const c = document.getElementById(id)?.closest('.repo-card'); if (c) c.classList.toggle('expanded'); }

  function escH(t) { if (t == null) return ''; const d = document.createElement('div'); d.textContent = String(t); return d.innerHTML; }

  function showToast(msg, type = 'info', duration = 4500) {
    const t = document.getElementById('fixToast'); if (!t) return;
    t.textContent = msg; t.className = `fix-toast show ${type}`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), duration);
  }

  function showInfo() { show('infoModal', true); }

  function closeInfo() { show('infoModal', false); }

  function cisCardHTML(repo, res) {
    const id = 'c' + repo.id;
    // Ring coloré par SCORE (priorisation visuelle), indépendant du verdict.
    const ring = res.score >= 80 ? 'var(--ok)' : res.score >= 50 ? '#fbbf24' : 'var(--err)';
    const conform = res.status === 'conform';
    const rows = res.checks.map(c => {
      const cls = c.state === 'ok' ? 'val-ok' : c.state === 'ko' ? 'val-ko' : 'val-warn';
      return `<div class="diag-row"><span class="icon">${cisStateIcon(c.state)}</span><span class="label">${escH(c.label)}${c.fixable && c.state === 'ko' ? ' <span class="fix-chip">corrigeable</span>' : ''}</span><span class="${cls}">${escH(c.detail)}</span><span class="cis-tag">CIS ${escH(c.cis)}</span></div>`;
    }).join('');
    const gaps = res.checks.filter(c => c.state === 'ko').length;
    const unverif = res.unverifiable ? `<span class="check-pill">${res.unverifiable} non vérifiable(s)</span>` : '';
    const verdict = conform
      ? `<span class="check-pill check-ok">✅ Conforme</span>`
      : `<span class="check-pill check-ko">🔴 Non conforme · ${gaps} écart(s)</span>`;
    const mrBtn = res.mrUrl ? `<a class="card-mr-link" href="${res.mrUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="MR de conformité">🔀 MR</a>` : '';
    return `<div class="repo-card ${conform ? 'conform' : 'nonconform'}">
      <div class="repo-header" onclick="toggleCard('${id}')">
        <div class="cis-score" style="border-color:${ring};color:${ring};">${res.score}</div>
        <div class="repo-meta"><div class="repo-name">${escH(repo.name)}</div><div class="repo-path">${escH(repo.path)}</div></div>
        <div class="repo-checks">${verdict}${unverif}</div>
        ${mrBtn}
        <span class="chevron">▾</span>
      </div>
      <div class="diagnostic" id="${id}">
        <div class="diag-section"><div class="diag-body">${rows}</div></div>
      </div></div>`;
  }

  function appendCISCard(repo, res) {
    if (liveCount >= RENDER_CAP) return;
    document.getElementById('findingsGrid').insertAdjacentHTML('beforeend', cisCardHTML(repo, res));
    liveCount++;
  }


  // Injecte (ou met à jour) le bouton « Voir la MR » dans l'en-tête de la carte
  // CIS du repo, une fois la MR connue. Appelé depuis createCISMRs.
  function attachMRLinkToCard(repoId, url, label) {
    if (!url) return;
    const card = document.getElementById('c' + repoId);
    if (!card) return; // carte hors RENDER_CAP : pas grave, le panneau récap a le lien
    const header = card.querySelector('.repo-header');
    if (!header) return;
    let btn = header.querySelector('.card-mr-link');
    const html = `<a class="card-mr-link" href="${url}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="${escH(label)}">🔀 MR</a>`;
    if (btn) { btn.outerHTML = html; }
    else {
      // inséré juste avant le chevron
      const chevron = header.querySelector('.chevron');
      if (chevron) chevron.insertAdjacentHTML('beforebegin', html);
      else header.insertAdjacentHTML('beforeend', html);
    }
  }


  function finishScanCIS(done, total, extraSub) {
    scannedCIS = true;
    // Accumulation CIS pour le rapport (1 entrée par repo, le dernier scan gagne).
    for (const { repo, res } of results) {
      reportCIS.set(repo.path, {
        Repo: repo.path, Score: res.score, Status: res.status, url: repo.url,
        gaps: (res.checks || []).filter(c => c.state === 'ko').map(c => ({ cis: c.cis, label: c.label, detail: c.detail }))
      });
    }
    const enriched = results.map(r => r.res);
    const avg = enriched.length ? Math.round(enriched.reduce((s, r) => s + r.score, 0) / enriched.length) : 100;
    const nonconform = enriched.filter(r => r.status === 'nonconform').length;
    const conform = enriched.filter(r => r.status === 'conform').length;
    const totalUnverif = enriched.reduce((s, r) => s + r.unverifiable, 0);

    const bar = document.getElementById('summaryBar');
    const partial = aborted ? ' (partiel)' : '';
    // Cercle : VERDICT global. Tout conforme → vert. Au moins un écart → rouge.
    // Le score moyen reste affiché comme indicateur de priorité.
    const ringColor = nonconform === 0 ? 'var(--ok)' : 'var(--err)';
    bar.style.display = 'grid';
    bar.innerHTML = `
      <div class="score-circle" style="background:radial-gradient(circle at 30% 30%, ${ringColor}, rgba(0,0,0,0.2));"><div class="num">${fmt(nonconform)}</div><div class="denom">à traiter</div></div>
      <div class="score-info">
        <div class="score-title">Conformité CIS GitLab${partial}</div>
        <div class="score-sub">${fmt(done)} / ${fmt(total)} repos · 🔴 ${fmt(nonconform)} non conforme(s) · ✅ ${fmt(conform)} conforme(s) · score moyen ${avg}/100 ${extraSub || ''}${totalUnverif ? ` · 🔒 ${fmt(totalUnverif)} check(s) non vérifiable(s)` : ''}</div>
        <div class="type-pills">
          <span class="type-pill all ${cisFilter === 'all' ? 'active' : ''}" onclick="filterCIS('all')">Tous <b>${fmt(enriched.length)}</b></span>
          <span class="type-pill" onclick="filterCIS('nonconform')">🔴 Non conformes <b>${fmt(nonconform)}</b></span>
          <span class="type-pill green" onclick="filterCIS('conform')">✅ Conformes <b>${fmt(conform)}</b></span>
        </div>
      </div>`;
    document.getElementById('exportRow').style.display = 'flex';
    renderCIS('all');
    show('resultsSection', true);
    const panel = document.getElementById('chartsPanel'); if (panel) panel.style.display = 'none';
    showToast(nonconform ? `⚠️ ${fmt(nonconform)} repo(s) non conforme(s) à traiter` : `✅ Tous conformes (${fmt(conform)} repos)`, nonconform ? 'error' : 'success');

    // MR pour tout repo ayant au moins un écart CIS (check ko), quel que soit le score.
    const withGaps = enriched.filter(r => r.checks.some(c => c.state === 'ko')).length;
    if (withGaps > 0 && autoMR) { aborted = false; createCISMRs(); }
  }

  function renderCIS(filter) {
    cisFilter = filter || 'all';
    const grid = document.getElementById('findingsGrid');
    const list = results.map(r => r.res);
    const filtered = cisFilter === 'all' ? list : list.filter(r => r.status === cisFilter);
    document.querySelectorAll('#summaryBar .type-pill').forEach(p => p.classList.remove('active'));
    let html = '', shown = 0;
    for (const res of filtered) {
      if (shown >= RENDER_CAP) break;
      const repo = results.find(r => r.res === res).repo;
      html += cisCardHTML(repo, res); shown++;
    }
    if (filtered.length > RENDER_CAP) html += `<div class="state-box" style="padding:22px;"><p>Affichage limité à ${fmt(RENDER_CAP)} repos sur ${fmt(filtered.length)}. Utilise l'export pour la liste complète.</p></div>`;
    grid.innerHTML = filtered.length ? html : `<div class="state-box"><div class="icon">🛡️</div><h3>Aucun repo dans cette catégorie</h3></div>`;
  }

  function filterCIS(f) { renderCIS(f); document.getElementById('findingsGrid').scrollIntoView({ behavior: 'smooth', block: 'start' }); }


  // Orchestrateur : lance les MR sur tous les repos touchés, concurrence limitée,
  // abortable, panneau de résultats live. Appelé en fin de run.
  async function createReportMRs() {
    const aff = affected();
    if (!aff.length || mrCreating) return;
    mrCreating = true;
    try {

    const panel = ensureMrPanel();
    const counts = { created: 0, exists: 0, forbidden: 0, error: 0 };
    let done = 0; const totalRepos = aff.length;
    let forbiddenSeen = false;

    const renderMr = (label) => {
      panel.innerHTML = `
        <div class="mr-head">
          <div class="mr-title">🔀 Création des MR de rapport</div>
          <div class="mr-prog">${fmt(done)} / ${fmt(totalRepos)} repos</div>
        </div>
        <div class="mr-stats">
          <span class="mr-pill ok">✅ ${fmt(counts.created)} créées</span>
          <span class="mr-pill">⏭️ ${fmt(counts.exists)} déjà là</span>
          ${counts.forbidden ? `<span class="mr-pill ko">🔒 ${fmt(counts.forbidden)} refus (token)</span>` : ''}
          ${counts.error ? `<span class="mr-pill ko">❌ ${fmt(counts.error)} échecs</span>` : ''}
        </div>
        ${label ? `<div class="mr-sub">${escH(label)}</div>` : ''}
        <div class="mr-list" id="mrList"></div>`;
    };
    renderMr('Démarrage…');

    const listEl = () => document.getElementById('mrList');
    const addRow = (r) => {
      const el = listEl(); if (!el) return;
      const icon = r.status === 'created' ? '✅' : r.status === 'exists' ? '⏭️' : r.status === 'forbidden' ? '🔒' : '❌';
      const txt = r.status === 'created' ? 'MR créée' : r.status === 'exists' ? 'MR déjà ouverte' : r.status === 'forbidden' ? 'refusé (token sans droit d\'écriture)' : `échec (${escH(r.detail || '')})`;
      const link = r.url ? `<a href="${r.url}" target="_blank" rel="noopener" class="mr-link">ouvrir ↗</a>` : '';
      el.insertAdjacentHTML('beforeend', `<div class="mr-row"><span class="mr-ic">${icon}</span><span class="mr-repo" title="${escH(r.repo.path)}">${escH(r.repo.path)}</span><span class="mr-stat">${txt}</span>${link}</div>`);
    };

    let idx = 0;
    async function worker() {
      while (idx < aff.length && !aborted) {
        const { repo, res } = aff[idx++];
        renderMr(repo.path);
        let r;
        try { r = await createReportMR(repo, res); }
        catch (e) { r = { repo, status: 'error', detail: 'exception' }; }
        counts[r.status] = (counts[r.status] || 0) + 1;
        done++;
        if (r.status === 'forbidden') forbiddenSeen = true;
        addRow(r);
        renderMr(repo.path);
        // Token read-only : inutile d'insister sur des centaines de repos.
        if (forbiddenSeen && counts.forbidden >= 3) { aborted = true; }
      }
    }
    await Promise.all(Array.from({ length: MR_CONC }, () => worker()));

    renderMr('');
    if (forbiddenSeen) {
      showToast('🔒 Token sans droit d\'écriture — aucune MR créée. Utilise un PAT avec scope « api ».', 'error', 7000);
    } else {
      showToast(`🔀 ${fmt(counts.created)} MR créée(s)${counts.exists ? `, ${fmt(counts.exists)} déjà présente(s)` : ''}${counts.error ? `, ${fmt(counts.error)} échec(s)` : ''}.`, counts.created ? 'success' : 'info', 6000);
    }
    } finally { mrCreating = false; }
  }


  // Orchestrateur MR CIS : tout repo ayant au moins un écart CIS (check ko).
  async function createCISMRs() {
    const crit = results.filter(r => r.res.checks.some(c => c.state === 'ko'));
    if (!crit.length || mrCreating) return;
    mrCreating = true;
    try {
    const panel = ensureMrPanel();
    const counts = { created: 0, exists: 0, forbidden: 0, error: 0 };
    let done = 0; const totalRepos = crit.length; let forbiddenSeen = false;

    const renderMr = (label) => {
      panel.innerHTML = `
        <div class="mr-head"><div class="mr-title">🛡️ Création des MR de conformité CIS</div><div class="mr-prog">${fmt(done)} / ${fmt(totalRepos)} repos avec écart</div></div>
        <div class="mr-stats">
          <span class="mr-pill ok">✅ ${fmt(counts.created)} créées</span>
          <span class="mr-pill">⏭️ ${fmt(counts.exists)} déjà là</span>
          ${counts.forbidden ? `<span class="mr-pill ko">🔒 ${fmt(counts.forbidden)} refus (token)</span>` : ''}
          ${counts.error ? `<span class="mr-pill ko">❌ ${fmt(counts.error)} échecs</span>` : ''}
        </div>
        ${label ? `<div class="mr-sub">${escH(label)}</div>` : ''}
        <div class="mr-list" id="mrList"></div>`;
    };
    renderMr('Démarrage…');
    const addRow = (r) => {
      const el = document.getElementById('mrList'); if (!el) return;
      const icon = r.status === 'created' ? '✅' : r.status === 'exists' ? '⏭️' : r.status === 'forbidden' ? '🔒' : '❌';
      const txt = r.status === 'created' ? 'MR créée' : r.status === 'exists' ? 'MR déjà ouverte' : r.status === 'forbidden' ? 'refusé (token sans droit d\'écriture)' : `échec (${escH(r.detail || '')})`;
      const link = r.url ? `<a href="${r.url}" target="_blank" rel="noopener" class="mr-link">ouvrir ↗</a>` : '';
      el.insertAdjacentHTML('beforeend', `<div class="mr-row"><span class="mr-ic">${icon}</span><span class="mr-repo" title="${escH(r.repo.path)}">${escH(r.repo.path)}</span><span class="mr-stat">${txt}</span>${link}</div>`);
    };

    let idx = 0;
    async function worker() {
      while (idx < crit.length && !aborted) {
        const { repo, res } = crit[idx++];
        renderMr(repo.path);
        let r; try { r = await createCISMR(repo, res); } catch { r = { repo, status: 'error', detail: 'exception' }; }
        counts[r.status] = (counts[r.status] || 0) + 1; done++;
        if (r.status === 'forbidden') forbiddenSeen = true;
        if ((r.status === 'created' || r.status === 'exists') && r.url) {
          res.mrUrl = r.url; // persiste l'URL sur le résultat (survit aux re-render/filtre)
          attachMRLinkToCard(repo.id, r.url, r.status === 'created' ? 'MR de conformité créée' : 'MR de conformité déjà ouverte');
        }
        addRow(r); renderMr(repo.path);
        if (forbiddenSeen && counts.forbidden >= 3) aborted = true;
      }
    }
    await Promise.all(Array.from({ length: MR_CONC }, () => worker()));
    renderMr('');
    if (forbiddenSeen) showToast('🔒 Token sans droit d\'écriture — aucune MR créée. PAT scope « api » requis.', 'error', 7000);
    else showToast(`🛡️ ${fmt(counts.created)} MR CIS créée(s)${counts.exists ? `, ${fmt(counts.exists)} déjà présente(s)` : ''}${counts.error ? `, ${fmt(counts.error)} échec(s)` : ''}.`, counts.created ? 'success' : 'info', 6000);
    } finally { mrCreating = false; }
  }


  // Remet à zéro l'état de création de MR au début de chaque scan : panneau
  // masqué/vidé et verrou libéré. Sans ça, un panneau d'un scan précédent
  // (ex. secrets) persiste et bloque l'affichage du suivant (ex. CIS).
  function resetMrPanel() {
    mrCreating = false;
    const p = document.getElementById('mrPanel');
    if (p) { p.innerHTML = ''; p.style.display = 'none'; }
  }


  // Panneau de résultats MR, inséré entre la summary-bar et la grille.
  function ensureMrPanel() {
    let p = document.getElementById('mrPanel');
    if (!p) {
      p = document.createElement('div');
      p.id = 'mrPanel';
      p.className = 'mr-panel';
      const grid = document.getElementById('findingsGrid');
      grid.parentNode.insertBefore(p, grid);
    }
    p.style.display = 'block';
    return p;
  }
