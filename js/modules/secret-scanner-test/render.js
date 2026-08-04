/* secret-scanner-test · render.js — rendu DOM (cartes, graphes, exports, panneaux) (chargé en 4e). */

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

  let currentTypeFilter = null;
  let liveCount = 0;
  const RENDER_CAP = 400; // au-delà : on garde tout en mémoire/Excel, mais on n'inonde pas le DOM

  function cardHTML(repo, findings, scanned) {
    const id = 'r' + repo.id;
    const branch = repo.defaultBranch && repo.defaultBranch !== 'HEAD' ? repo.defaultBranch : 'HEAD';
    const isSupply = findings.some(f => f.kind === 'supply');
    const isHist = findings.some(f => f.commit);
    const rows = findings.map(f => {
      const encFile = f.file.split('/').map(encodeURIComponent).join('/');
      const ref = f.commit ? f.commit : branch;
      const link = repo.url ? `${repo.url}/-/blob/${encodeURIComponent(ref)}/${encFile}${f.line ? '#L' + f.line : ''}` : '';
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
        const link = repo.url ? `${repo.url}/-/blob/${encodeURIComponent(ref)}/${f.file.split('/').map(encodeURIComponent).join('/')}${f.line ? '#L' + f.line : ''}` : '';
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
    if (totalFindings > 0) {
      aborted = false;
      createReportMRs();
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // GRAPHIQUES (Chart.js, CDN) — Top repos · par type (cliquable) · couverture
  // ══════════════════════════════════════════════════════════════════════
  let _charts = [];
  const CHART_PALETTE = ['#7c5cff', '#2dd4bf', '#fb923c', '#f472b6', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#c084fc', '#fb7185', '#22d3ee', '#a3e635', '#f59e0b', '#e879f9', '#4ade80'];

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

  // ── Exports (preview censurée uniquement) ──
  const affected = () => results.filter(r => r.res.findings.length > 0);
  function exportJson() {
    const payload = {
      generatedAt: new Date().toISOString(), gitlabUrl: GITLAB_URL,
      reposScanned: results.length, reposAffected: affected().length,
      totalFindings: results.reduce((s, r) => s + r.res.findings.length, 0),
      repos: affected().map(({ repo, res }) => ({ id: repo.id, name: repo.name, path: repo.path, url: repo.url, scanned: res.scanned, findings: res.findings }))
    };
    download('scan-secrets.json', JSON.stringify(payload, null, 2), 'application/json');
  }
  function exportExcel() {
    if (typeof XLSX === 'undefined') { showToast('Librairie Excel non chargée (vérifie ta connexion).', 'error'); return; }
    const rows = [];
    for (const { repo, res } of affected()) {
      const ns = repo.path.split('/').slice(0, -1).join('/') || '—';
      const branch = repo.defaultBranch && repo.defaultBranch !== 'HEAD' ? repo.defaultBranch : 'HEAD';
      for (const f of res.findings) {
        const ref = f.commit ? f.commit : branch;
        const link = repo.url ? `${repo.url}/-/blob/${encodeURIComponent(ref)}/${f.file.split('/').map(encodeURIComponent).join('/')}${f.line ? '#L' + f.line : ''}` : '';
        rows.push({ Repo: repo.path, Namespace: ns, Fichier: f.file, Ligne: f.line || '', Commit: f.commit || '', Type: f.type, 'Catégorie': f.tag || ('CIS ' + f.cis), 'Aperçu': f.preview, Lien: link });
      }
    }
    if (!rows.length) { showToast('Rien à exporter ✅', 'success'); return; }

    const header = ['Repo', 'Namespace', 'Fichier', 'Ligne', 'Commit', 'Type', 'Catégorie', 'Aperçu', 'Lien'];
    const ws = XLSX.utils.json_to_sheet(rows, { header });
    ws['!cols'] = [{ wch: 42 }, { wch: 28 }, { wch: 46 }, { wch: 7 }, { wch: 11 }, { wch: 24 }, { wch: 14 }, { wch: 22 }, { wch: 60 }];
    ws['!autofilter'] = { ref: ws['!ref'] };
    // Liens GitLab cliquables (colonne I = 9e)
    rows.forEach((r, i) => { if (r.Lien) { const cell = ws['I' + (i + 2)]; if (cell) cell.l = { Target: r.Lien, Tooltip: 'Ouvrir dans GitLab' }; } });

    const fileBase = mode === 'supply' ? 'scan-supply-chain' : 'scan-secrets';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, mode === 'supply' ? 'Supply-chain' : 'Secrets');
    XLSX.writeFile(wb, fileBase + '.xlsx');
  }

  function exportMarkdown() {
    const aff = affected();
    const total = results.reduce((s, r) => s + r.res.findings.length, 0);
    const isSupply = mode === 'supply';
    const title = isSupply ? 'Scan supply-chain' : 'Scan secrets';
    const noteLine = isSupply ? '' : '> Valeurs censurées (préfixe + `***`). Aucune valeur complète exportée.\n\n';
    let md = `# ${title} — DevOps Hub\n\n- Date : ${new Date().toLocaleString('fr-FR')}\n- GitLab : ${GITLAB_URL}\n- Repos scannés : ${results.length}\n- Repos touchés : ${aff.length}\n- ${isSupply ? 'Alertes' : 'Secrets'} : ${total}\n\n${noteLine}`;
    if (!aff.length) md += `✅ Rien détecté.\n`;
    for (const { repo, res } of aff) {
      md += `## ${repo.path}\n\n${repo.url}\n\n| Fichier | Ligne | Commit | Type | Catégorie | Aperçu |\n|---|---|---|---|---|---|\n`;
      for (const f of res.findings) md += `| \`${f.file}\` | ${f.line || ''} | ${f.commit || ''} | ${f.type} | ${f.tag || ('CIS ' + f.cis)} | \`${f.preview}\` |\n`;
      md += `\n`;
    }
    download(isSupply ? 'scan-supply-chain.md' : 'scan-secrets.md', md, 'text/markdown');
  }

  // ── Rapport HTML (format identique à l'exemple validé) ──────────────
  // 1b : génère le rapport du mode courant ; si les deux familles de scans
  // ont été faites, génère le rapport global (sections Secrets + Supply-chain).
  function exportReport() {
    // Lit les accumulateurs (cumul Surface+Historique côté secrets, dédoublonnés).
    const secRows = Array.from(reportSecrets.values());
    const supRows = Array.from(reportSupply.values());

    if (!scannedSecrets && !scannedSupply) { showToast('Lance un scan avant de générer un rapport.', 'error'); return; }

    const sev = {};
    [...secRows, ...supRows].forEach(r => { sev[r.Type] = severityForType(r.Type); });

    const html = renderReportHTML({ secRows, supRows, hasSec: scannedSecrets, hasSup: scannedSupply, sev });
    const isGlobal = scannedSecrets && scannedSupply;
    const name = isGlobal ? 'rapport-securite-global.html' : (scannedSupply ? 'rapport-supply-chain.html' : 'rapport-secrets.html');
    download(name, html, 'text/html');
    showToast('📑 Rapport généré ✅', 'success');
  }

  function renderReportHTML(d) {
    const esc = (s) => { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    const nbRepos = (rows) => new Set(rows.map(r => r.Repo)).size;
    const countBy = (rows, key) => { const m = {}; rows.forEach(r => { const k = r[key]; m[k] = (m[k] || 0) + 1; }); return m; };
    const sevOf = (t) => d.sev[t] || severityForType(t);

    // Agrégats secrets
    const secByType = countBy(d.secRows, 'Type');
    // Agrégats supply
    const supByType = countBy(d.supRows, 'Type');
    const supEco = countBy(d.supRows, 'Catégorie');
    const supRed = d.supRows.filter(r => sevOf(r.Type) === 'red').length;
    const supOrange = d.supRows.length - supRed;
    const nsCount = {}; d.supRows.forEach(r => { nsCount[r.Namespace] = (nsCount[r.Namespace] || 0) + 1; });
    const topNs = Object.entries(nsCount).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Barres répartition
    const bars = (byType) => {
      const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
      if (!entries.length) return '<div class="empty">Aucune donnée</div>';
      const mx = entries[0][1];
      return entries.map(([t, v]) => {
        const s = sevOf(t);
        return `<div class="bar-row"><div class="bar-label">${esc(t)}</div><div class="bar-track"><div class="bar-fill ${s}" style="width:${Math.round(v / mx * 100)}%"></div></div><div class="bar-val">${v}</div></div>`;
      }).join('');
    };

    // Donut écosystèmes
    const ecoColors = { ci: '#fb923c', npm: '#7c5cff', docker: '#2dd4bf', maven: '#f472b6', gradle: '#60a5fa', pip: '#fbbf24' };
    const ecoEntries = Object.entries(supEco).sort((a, b) => b[1] - a[1]);
    const ecoTot = ecoEntries.reduce((s, e) => s + e[1], 0) || 1;
    let acc = 0; const segs = []; const legend = [];
    ecoEntries.forEach(([k, v]) => {
      const c = ecoColors[k] || '#888'; const a0 = acc / ecoTot * 360; acc += v; const a1 = acc / ecoTot * 360;
      segs.push(`${c} ${a0.toFixed(1)}deg ${a1.toFixed(1)}deg`);
      legend.push(`<div class="lg"><span class="dot" style="background:${c}"></span>${esc(k)} <b>${v}</b></div>`);
    });
    const donutStyle = segs.length ? `background:conic-gradient(${segs.join(',')});` : 'background:var(--ov-08);';

    // Top namespaces
    const nsBars = topNs.length ? topNs.map(([k, v]) => {
      const mx = topNs[0][1];
      return `<div class="bar-row"><div class="bar-label ns">${esc(k)}</div><div class="bar-track"><div class="bar-fill orange" style="width:${Math.round(v / mx * 100)}%"></div></div><div class="bar-val">${v}</div></div>`;
    }).join('') : '<div class="empty">Aucune donnée</div>';

    const dataJson = JSON.stringify({ sec: d.secRows, sup: d.supRows, sev: d.sev });
    const dateStr = new Date().toLocaleString('fr-FR');

    // Sections conditionnelles
    const secSection = d.hasSec ? `
  <div class="section">
    <div class="section-h">🔑 Secrets exposés <span class="pill">${d.secRows.length} trouvés · ${nbRepos(d.secRows)} repos</span></div>
    <div class="grid2">
      <div class="card"><div class="card-t">Répartition par type</div>${bars(secByType)}</div>
      <div class="card"><div class="card-t">Pourquoi c'est critique</div>
        <p style="color:var(--ts);font-size:13px;line-height:1.7">Chaque secret exposé est une <b style="color:var(--tp)">clé d'entrée directe</b>. Un secret commité reste dans l'historique Git même après suppression : il doit être considéré comme <b style="color:#fca5a5">compromis</b>.</p>
        <p style="color:var(--ts);font-size:13px;line-height:1.7;margin-top:12px">Action : <b style="color:var(--tp)">(1)</b> révoquer côté service, <b style="color:var(--tp)">(2)</b> remplacer par une variable protégée, <b style="color:var(--tp)">(3)</b> purger l'historique.</p>
      </div>
    </div>
  </div>
  <div class="section">
    <div class="tbl-controls"><input id="secSearch" placeholder="🔍 Filtrer les secrets (repo, fichier, type…)"></div>
    <div class="tbl-wrap"><table id="secTable"><thead><tr><th>Risque</th><th>Repo</th><th>Fichier</th><th>Type</th><th>Aperçu</th><th>CIS</th></tr></thead><tbody></tbody></table></div>
  </div>` : '';

    const supSection = d.hasSup ? `
  <div class="section">
    <div class="section-h">📦 Supply-chain <span class="pill">${d.supRows.length} alertes · ${nbRepos(d.supRows)} repos</span></div>
    <div class="kpis" style="grid-template-columns:repeat(2,1fr);margin-bottom:18px">
      <div class="kpi red"><div class="n">${supRed}</div><div class="l">🔴 Exécution de code</div></div>
      <div class="kpi orange"><div class="n">${supOrange}</div><div class="l">🟠 Version non figée</div></div>
    </div>
    <div class="grid2">
      <div class="card"><div class="card-t">Répartition par type d'alerte</div>${bars(supByType)}</div>
      <div class="card"><div class="card-t">Par écosystème</div>
        <div class="donut-wrap">
          <div class="donut" style="${donutStyle}"><div class="donut-c"><div class="n">${d.supRows.length}</div><div class="l">alertes</div></div></div>
          <div class="legend">${legend.join('')}</div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:18px"><div class="card-t">Top 10 des namespaces les plus touchés</div>${nsBars}</div>
  </div>
  <div class="section">
    <div class="tbl-controls">
      <input id="supSearch" placeholder="🔍 Filtrer (repo, fichier, type…)">
      <select id="supSev"><option value="">Tous les risques</option><option value="red">🔴 Exécution</option><option value="orange">🟠 Version non figée</option></select>
      <select id="supEco"><option value="">Tous écosystèmes</option><option value="ci">CI</option><option value="npm">npm</option><option value="docker">docker</option><option value="maven">maven</option></select>
    </div>
    <div class="tbl-wrap"><table id="supTable"><thead><tr><th>Risque</th><th>Repo</th><th>Fichier</th><th>Type</th><th>Éco</th><th>Aperçu</th></tr></thead><tbody></tbody></table></div>
  </div>` : '';

    const kpis = `
  <div class="kpis">
    <div class="kpi red"><div class="n">${d.secRows.length}</div><div class="l">🔑 Secrets exposés</div></div>
    <div class="kpi violet"><div class="n">${nbRepos(d.secRows)}</div><div class="l">Repos touchés (secrets)</div></div>
    <div class="kpi orange"><div class="n">${d.supRows.length}</div><div class="l">📦 Alertes supply-chain</div></div>
    <div class="kpi cyan"><div class="n">${nbRepos(d.supRows)}</div><div class="l">Repos touchés (supply)</div></div>
  </div>`;

    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rapport Sécurité — DevOps Hub</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;700;800&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:var(--bg-deep);--bg2:var(--bg-mid);--card:var(--card-6);--bd:var(--ov-08);--bd2:var(--ov-18);
--tp:#f5f1ff;--ts:#b8aed8;--tm:#7a6fa3;--measure:#7c5cff;--inspect:#fb923c;--deliver:#2dd4bf;--collab:#f472b6;
--red:#f87171;--orange:#fb923c;--ok:#34d399;--fd:'Bricolage Grotesque',sans-serif;--fb:'Manrope',sans-serif;--fm:'JetBrains Mono',monospace}
body{font-family:var(--fb);background:var(--bg);color:var(--tp);min-height:100vh;padding:28px;
background-image:radial-gradient(ellipse 700px 500px at 12% 5%,rgba(251,146,60,.13),transparent 60%),radial-gradient(ellipse 600px 400px at 88% 15%,rgba(124,92,255,.11),transparent 60%)}
.wrap{max-width:1240px;margin:0 auto}
.head{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;margin-bottom:8px}
.head h1{font-family:var(--fd);font-size:32px;font-weight:800;letter-spacing:-.02em;display:flex;align-items:center;gap:12px}
.head .sub{color:var(--ts);font-size:14px;margin-top:4px}
.head .meta{color:var(--tm);font-size:13px;font-family:var(--fm);text-align:right}
.divider{height:1px;background:linear-gradient(90deg,var(--inspect),transparent);margin:18px 0 28px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:30px}
.kpi{background:var(--card);backdrop-filter:blur(20px);border:1px solid var(--bd);border-radius:18px;padding:22px}
.kpi .n{font-family:var(--fd);font-size:42px;font-weight:800;line-height:1;letter-spacing:-.03em}
.kpi .l{color:var(--tm);font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-top:8px}
.kpi.red .n{color:var(--red)}.kpi.orange .n{color:var(--orange)}.kpi.violet .n{color:var(--measure)}.kpi.cyan .n{color:var(--deliver)}
.section{margin-bottom:34px}
.section-h{font-family:var(--fd);font-size:20px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:10px}
.section-h .pill{font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;background:rgba(251,146,60,.18);color:#fdba74;border:1px solid rgba(251,146,60,.3)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.card{background:var(--card);backdrop-filter:blur(20px);border:1px solid var(--bd);border-radius:18px;padding:22px}
.card-t{font-size:14px;font-weight:600;color:var(--ts);margin-bottom:18px;text-transform:uppercase;letter-spacing:.04em}
.bar-row{display:grid;grid-template-columns:1fr 130px 36px;align-items:center;gap:12px;margin-bottom:11px}
.bar-label{font-size:13px;color:var(--tp);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-label.ns{font-family:var(--fm);font-size:11px;color:var(--ts)}
.bar-track{height:8px;background:var(--ov-06);border-radius:99px;overflow:hidden}
.bar-fill{height:100%;border-radius:99px}
.bar-fill.red{background:linear-gradient(90deg,#f87171,#ef4444)}
.bar-fill.orange{background:linear-gradient(90deg,#fb923c,#f59e0b)}
.bar-val{font-family:var(--fd);font-weight:700;font-size:15px;text-align:right}
.donut-wrap{display:flex;align-items:center;gap:28px;flex-wrap:wrap}
.donut{width:140px;height:140px;border-radius:50%;flex-shrink:0;position:relative}
.donut::after{content:'';position:absolute;inset:26px;border-radius:50%;background:var(--bg2)}
.donut-c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2}
.donut-c .n{font-family:var(--fd);font-size:26px;font-weight:800}.donut-c .l{font-size:10px;color:var(--tm);text-transform:uppercase}
.legend{display:flex;flex-direction:column;gap:8px}
.lg{font-size:13px;color:var(--ts);display:flex;align-items:center;gap:8px}.lg b{color:var(--tp);font-family:var(--fm)}
.dot{width:11px;height:11px;border-radius:3px;display:inline-block}
.tbl-controls{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.tbl-controls input,.tbl-controls select{padding:9px 13px;border-radius:10px;background:var(--ov-06);border:1px solid var(--bd2);color:var(--tp);font-family:var(--fb);font-size:13px}
.tbl-controls input{flex:1;min-width:200px}
.tbl-controls input::placeholder{color:var(--tm)}
.tbl-wrap{background:var(--card);border:1px solid var(--bd);border-radius:16px;overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:13px 14px;color:var(--tm);font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--bd2);background:rgba(0,0,0,.15)}
td{padding:11px 14px;border-bottom:1px solid var(--bd);color:var(--ts);vertical-align:top}
tr:hover td{background:rgba(124,92,255,.05)}
.t-repo{color:var(--tp);font-weight:500;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.t-file{font-family:var(--fm);font-size:11px;color:var(--ts)}
.t-prev{font-family:var(--fm);font-size:11px;background:rgba(0,0,0,.3);padding:2px 7px;border-radius:5px;color:#fcd34d;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block}
.sev-tag{font-size:11px;font-weight:600;padding:2px 9px;border-radius:6px;white-space:nowrap}
.sev-tag.red{background:rgba(248,113,113,.2);color:#fca5a5}
.sev-tag.orange{background:rgba(251,146,60,.2);color:#fdba74}
.t-link{color:var(--inspect);text-decoration:none}.t-link:hover{text-decoration:underline}
.foot{text-align:center;color:var(--tm);font-size:12px;margin-top:30px;padding-top:20px;border-top:1px solid var(--bd)}
.empty{color:var(--tm);font-style:italic;padding:20px;text-align:center}
@media(max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.grid2{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
  <div class="head">
    <div><h1>🛡️ Rapport Sécurité</h1><div class="sub">Secrets exposés &amp; risques supply-chain — scan de tous les repos accessibles</div></div>
    <div class="meta">DevOps Hub · Inspecter &amp; Sécuriser<br>Généré le ${dateStr}</div>
  </div>
  <div class="divider"></div>
${kpis}
${secSection}
${supSection}
  <div class="foot">Rapport généré par DevOps Hub · Secrets Scanner · Valeurs sensibles censurées (aucune valeur complète exposée)</div>
</div>
<script>
const D = ${dataJson};
function tag(s){return '<span class="sev-tag '+s+'">'+(s==='red'?'🔴':'🟠')+'</span>'}
function link(r,txt,cls){return r.Lien?'<a class="'+cls+' t-link" href="'+r.Lien+'" target="_blank" rel="noopener">'+txt+'</a>':'<span class="'+cls+'">'+txt+'</span>'}
function renderSec(f){
  var tb=document.querySelector('#secTable tbody'); if(!tb)return; f=(f||'').toLowerCase();
  tb.innerHTML=D.sec.filter(function(r){return !f||(r.Repo+r.Fichier+r.Type+r['Aperçu']).toLowerCase().indexOf(f)>=0;}).map(function(r){
    var s=D.sev[r.Type]||'red';
    return '<tr><td>'+tag(s)+'</td><td class="t-repo" title="'+r.Repo+'">'+r.Repo+'</td><td>'+link(r,r.Fichier+':'+r.Ligne,'t-file')+'</td><td>'+r.Type+'</td><td><span class="t-prev">'+r['Aperçu']+'</span></td><td style="font-family:var(--fm);font-size:11px;color:var(--tm)">'+r['Catégorie']+'</td></tr>';
  }).join('')||'<tr><td colspan="6" class="empty">Aucun résultat</td></tr>';
}
function renderSup(){
  var si=document.getElementById('supSearch'); if(!si)return;
  var f=si.value.toLowerCase(), sv=document.getElementById('supSev').value, ec=document.getElementById('supEco').value;
  var tb=document.querySelector('#supTable tbody');
  tb.innerHTML=D.sup.filter(function(r){
    var s=D.sev[r.Type]||'orange';
    if(sv&&s!==sv)return false; if(ec&&r['Catégorie']!==ec)return false;
    if(f&&(r.Repo+r.Fichier+r.Type+r['Aperçu']).toLowerCase().indexOf(f)<0)return false; return true;
  }).map(function(r){var s=D.sev[r.Type]||'orange';
    return '<tr><td>'+tag(s)+'</td><td class="t-repo" title="'+r.Repo+'">'+r.Repo+'</td><td>'+link(r,r.Fichier+':'+r.Ligne,'t-file')+'</td><td>'+r.Type+'</td><td style="font-family:var(--fm);font-size:11px;color:var(--ts)">'+r['Catégorie']+'</td><td><span class="t-prev">'+r['Aperçu']+'</span></td></tr>';
  }).join('')||'<tr><td colspan="6" class="empty">Aucun résultat</td></tr>';
}
var _ss=document.getElementById('secSearch'); if(_ss){_ss.addEventListener('input',function(e){renderSec(e.target.value);}); renderSec('');}
['supSearch','supSev','supEco'].forEach(function(id){var el=document.getElementById(id); if(el)el.addEventListener('input',renderSup);});
if(document.getElementById('supTable')) renderSup();
</script>
</body></html>`;
  }

  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ── Helpers ──
  function show(id, on) { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; }
  function toggleCard(id) { const c = document.getElementById(id)?.closest('.repo-card'); if (c) c.classList.toggle('expanded'); }
  function fmt(n) { return new Intl.NumberFormat('fr-FR').format(n); }
  function escH(t) { if (t == null) return ''; const d = document.createElement('div'); d.textContent = String(t); return d.innerHTML; }
  let toastTimer = null;
  function showToast(msg, type = 'info', duration = 4500) {
    const t = document.getElementById('fixToast'); if (!t) return;
    t.textContent = msg; t.className = `fix-toast show ${type}`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), duration);
  }
  function showInfo() { show('infoModal', true); }
  function closeInfo() { show('infoModal', false); }

  // ══════════════════════════════════════════════════════════════════════
  // MODE CIS — conformité CIS GitLab Benchmark par repo (porté de gouvernance).
  // Produit un score /100 + des checks pass/fail/unverifiable. Le 403 sur un
  // endpoint de config (droits insuffisants) → « non vérifiable », JAMAIS
  // « non conforme » : on ne ment pas sur la posture.
  // ══════════════════════════════════════════════════════════════════════

  // fetchGL renvoie null sur erreur sans distinguer 403/404/vide. Pour le CIS on
  // a besoin de savoir si c'est un refus de droits. Variante qui rend le statut.
  const cisStateIcon = s => s === 'ok' ? '✅' : s === 'ko' ? '🔴' : s === 'unverif' ? '🔒' : '⚪';
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
    if (withGaps > 0) { aborted = false; createCISMRs(); }
  }

  let cisFilter = 'all';
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


  // Mécanique GitLab : branche (depuis default_branch) → commit du
  // SECURITY-SCAN.md → MR vers default_branch. Aucun merge. Idempotent.
  // ══════════════════════════════════════════════════════════════════════

  // rawFetch est GET-only ; les écritures veulent POST + Content-Type + body.
  // Même backoff 429/5xx, même 401→login, mêmes compteurs que rawFetch.
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


  // ══════════════════════════════════════════════════════════════════════
  //  BLAST RADIUS — tranche 1 (présence historique + exécution + P1→P3)
  //  Chaîne READ-ONLY : IOC → où le composant était (lockfiles, version
  //  résolue) → a-t-il tourné (pipelines, SBOM si présent) → score → rapport.
  //  Privilèges & propagation (→ P0) : tranches suivantes.
  // ══════════════════════════════════════════════════════════════════════

  // Lockfiles npm reconnus (tranche 1 : écosystème npm).
  function brShellHTML(ioc) {
    return `
      <div class="br-head">
        <div class="br-ioc">🚨 <b>${escH(ioc.name)}@${escH(ioc.version)}</b> <span class="br-purl">${escH(ioc.purl)}</span></div>
        <div class="br-status" id="brStatus">Initialisation…</div>
        <button class="stop-btn" onclick="brStop()">⏹ Stop</button>
      </div>
      <div class="br-summary" id="brSummary"></div>
      <div class="br-timeline-wrap"><div class="br-timeline" id="brTimeline"></div></div>
      <div class="br-table" id="brTable"></div>
      <div class="export-row" id="brExport" style="display:none;">
        <button class="ghost-btn" onclick="brExportPlan()">📋 Exporter le plan d'action</button>
        <button class="ghost-btn" onclick="brExportReport()">📑 Rapport d'incident (HTML)</button>
      </div>`;
  }

  function brFrDateTime(ms) {
    if (ms == null) return '—';
    const d = new Date(ms);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  }

  // Puces de privilèges d'une exposition (métadonnées only ; honnête sur l'inconnu).
  function brPrivChips(e) {
    if (!e.pipelines) return '<span class="br-muted">—</span>';
    if (!e.priv) return '<span class="br-chip br-unk">⏳ …</span>';
    const p = e.priv, chips = [];
    if (p.secretsForbidden) chips.push('<span class="br-chip br-unk" title="Droits insuffisants pour lister les variables">🔒 secrets non vérifiables</span>');
    else if (p.hasSecrets) chips.push(`<span class="br-chip br-hot" title="Variables CI/CD du projet (noms only)">🔑 ${fmt(p.secrets.length)} secret(s)</span>`);
    if (p.writeCapable) chips.push('<span class="br-chip br-hot" title="Registry conteneur et/ou job token sortant">✍️ écriture</span>');
    if (p.sharedRunner) chips.push('<span class="br-chip br-hot" title="Runner partagé/instance — privileged/socket = infra, hors API">🏃 runner partagé</span>');
    if (!chips.length) chips.push('<span class="br-chip">rien de notable</span>');
    return chips.join(' ');
  }

  // Puces de propagation : ce que les jobs exposés ont fabriqué / propagé.
  function brPropChips(e) {
    if (!e.pipelines) return '<span class="br-muted">—</span>';
    if (!e.prop) return '<span class="br-chip br-unk">⏳ …</span>';
    const p = e.prop, chips = [];
    if (p.published) chips.push(`<span class="br-chip br-hot" title="Packages publiés depuis l'exposition">📦 ${fmt(p.packages.length)} package(s)</span>`);
    if (p.images && p.images.length) chips.push(`<span class="br-chip" title="Images dans le registry du projet (datation limitée)">🐳 ${fmt(p.images.length)} image(s)</span>`);
    if (p.prodDeployed) chips.push(`<span class="br-chip br-hot" title="Déploiement en environnement de production">🚀 prod${p.prodActive ? ' · actif' : ''}</span>`);
    else if (p.deployments && p.deployments.length) chips.push(`<span class="br-chip">🚀 ${fmt(p.deployments.length)} déploiement(s)</span>`);
    if (p.downstream && p.downstream.length) chips.push(`<span class="br-chip" title="Projets consommateurs via pipelines aval (profondeur 2)">↘️ ${fmt(p.downstream.length)} conso.${p.truncated ? '+' : ''}</span>`);
    if (!chips.length) chips.push('<span class="br-chip">rien de produit détecté</span>');
    return chips.join(' ');
  }

  // Puces de comportement suspect (empreintes STATIQUES, pas du runtime).
  function brBehChips(e) {
    const b = e.behavior;
    if (!b) return '<span class="br-chip br-unk">⏳ …</span>';
    const chips = [];
    if (b.installScript) chips.push('<span class="br-chip br-hot" title="Le composant exécute un script d\'installation npm (postinstall…) — vecteur n°1 des compromissions">☣️ install script</span>');
    const byId = {}; b.findings.forEach(f => { if (!byId[f.id]) byId[f.id] = f; });
    Object.keys(byId).slice(0, 3).forEach(id => {
      const f = byId[id];
      chips.push(`<span class="br-chip ${f.sev === 'red' ? 'br-hot' : ''}" title="${escH(f.source)} · L${f.line} : ${escH(f.sample)}">${f.sev === 'red' ? '🚩' : '⚠️'} ${escH(f.label)}</span>`);
    });
    if (!chips.length) chips.push('<span class="br-chip">rien de suspect</span>');
    return chips.join(' ');
  }

  function brRender(host, ioc, exposures, done) {
    // Comptes P0/P1/P2/P3.
    const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
    let executed = 0, withSecrets = 0, published = 0, prodActive = 0, behavior = 0, reposSet = new Set();
    exposures.forEach(e => {
      const s = brScore(e); counts[s.p]++;
      if (e.pipelines > 0) executed++;
      if (e.priv && e.priv.hasSecrets) withSecrets++;
      if (e.prop && e.prop.published) published++;
      if (e.prop && e.prop.prodActive) prodActive++;
      if (e.behavior && (e.behavior.installScript || e.behavior.red > 0)) behavior++;
      reposSet.add(e.repo.id);
    });
    const sumEl = host.querySelector('#brSummary');
    if (sumEl) sumEl.innerHTML = [
      ['Repos exposés', fmt(reposSet.size)],
      ['P0 · critique', fmt(counts.P0)],
      ['P1 · exécution', fmt(counts.P1)],
      ['P2 · probable', fmt(counts.P2)],
      ['Jobs avec secrets', fmt(withSecrets)],
      ['Actif en prod', fmt(prodActive)],
      ['Comportement ☣️', fmt(behavior)]
    ].map(([k, v]) => `<div class="br-cell${(k.startsWith('P0') && counts.P0) || (k === 'Actif en prod' && prodActive) || (k.startsWith('Comportement') && behavior) ? ' br-cell-p0' : ''}"><div class="br-k">${k}</div><div class="br-v">${v}</div></div>`).join('')
      + `<div class="br-p0note">🔓 <b>P0 calculé</b> : exécuté <b>et</b> (secrets / écriture / runner partagé <b>ou</b> package publié / déployé en prod). Privilèges = <b>état actuel</b> des variables (<code>confidence: current_state_only</code>). Caches non calculés (opaques côté API). <b>Actif en prod</b> = le chiffre le plus important.</div>`
      + `<div class="br-p0note">☣️ <b>Comportement</b> = empreintes <b>statiques</b> (install scripts, CI, Dockerfile) : détecte l'<b>intention</b> (curl|bash, base64|sh, reverse-shell, ADD depuis URL), <b>pas</b> l'événement runtime. Le vrai runtime (processus/réseau/K8s) demande un agent (Falco/eBPF) — hors périmètre de ce banc.</div>`;

    // Timeline.
    const tl = host.querySelector('#brTimeline');
    if (tl) {
      const times = [];
      exposures.forEach(e => { if (e.introducedAt != null) times.push(e.introducedAt); if (e.removedAt != null) times.push(e.removedAt); (e.execs || []).forEach(x => x.at != null && times.push(x.at)); });
      if (ioc.from) times.push(Date.parse(ioc.from)); if (ioc.to) times.push(Date.parse(ioc.to));
      if (!times.length) { tl.innerHTML = '<div class="br-muted">Pas de date exploitable pour l’instant.</div>'; }
      else {
        let t0 = Math.min.apply(null, times), t1 = Math.max.apply(null, times);
        if (t1 - t0 < 3600000) { t1 = t0 + 3600000; }   // au moins 1h de large
        const pad = (t1 - t0) * 0.04; t0 -= pad; t1 += pad;
        const laid = brLayout(exposures.slice().sort((a, b) => (a.introducedAt || 0) - (b.introducedAt || 0)), t0, t1);
        const axis = `<div class="br-axis"><span>${brFrDateTime(t0)}</span><span>${brFrDateTime((t0 + t1) / 2)}</span><span>${brFrDateTime(t1)}</span></div>`;
        const rows = laid.map(L => {
          const s = brScore(L.exp);
          const dots = L.execs.map(x => `<span class="br-dot ${x.level === 'confirmed' ? 'confirmed' : 'executed'}" style="left:${x.xPct.toFixed(2)}%" title="${x.level === 'confirmed' ? 'SBOM confirmé' : 'pipeline exécuté'}"></span>`).join('');
          return `<div class="br-row">
            <div class="br-row-label" title="${escH(L.exp.repo.path)}">${escH(L.exp.repo.path)}</div>
            <div class="br-track">
              <div class="br-bar ${s.tone}" style="left:${L.leftPct.toFixed(2)}%;width:${L.widthPct.toFixed(2)}%" title="${s.p} · ${escH(s.label)}"></div>
              ${dots}
            </div>
            <div class="br-row-p ${s.tone}">${s.p}</div>
          </div>`;
        }).join('');
        tl.innerHTML = axis + (rows || '<div class="br-muted">Aucune exposition datée.</div>');
      }
    }

    // Table détaillée.
    const tb = host.querySelector('#brTable');
    if (tb) {
      if (!exposures.length) tb.innerHTML = done ? '<div class="br-empty">✅ Aucune trace du composant sur le périmètre scanné.</div>' : '';
      else tb.innerHTML = `<table class="br-tbl"><thead><tr>
          <th>Repo</th><th>Fichier</th><th>Version</th><th>Preuve</th><th>Atteignable</th><th>Produit / propagé</th><th>Comportement (statique)</th><th>Priorité</th>
        </tr></thead><tbody>${exposures.map(e => {
          const s = brScore(e), lvl = brEvidenceLevel(e);
          return `<tr>
            <td class="br-td-repo">${e.repo.url ? `<a href="${e.repo.url}" target="_blank" rel="noopener">${escH(e.repo.path)}</a>` : escH(e.repo.path)}</td>
            <td><code>${escH(e.file)}</code>${e.direct ? '' : ' <span class="br-tag">transitif</span>'}${e.scope === 'dev' ? ' <span class="br-tag">dev</span>' : ''}</td>
            <td>${escH(e.version || '—')}</td>
            <td><span class="br-ev ${s.tone}">${escH(BR_LEVEL_META[lvl].label)}</span></td>
            <td>${brPrivChips(e)}</td>
            <td>${brPropChips(e)}</td>
            <td>${brBehChips(e)}</td>
            <td><span class="br-pri ${s.tone}">${s.p}</span></td>
          </tr>`;
        }).join('')}</tbody></table>`;
    }
    const exp = host.querySelector('#brExport'); if (exp) exp.style.display = (done && exposures.length) ? 'flex' : 'none';
  }

  function discShellHTML() {
    return `
      <div class="br-head">
        <div class="br-ioc">🔎 <b>Découverte</b> <span class="br-purl">inventaire → OSV.dev</span></div>
        <div class="br-status" id="discStatus">Initialisation…</div>
        <button class="stop-btn" onclick="discStop()">⏹ Stop</button>
      </div>
      <div class="br-summary" id="discSummary"></div>
      <div class="br-table" id="discTable"></div>`;
  }
  function discRender(host, compCount, reposCount, flagged, done) {
    const mal = flagged.filter(f => f.malicious).length;
    const reposHit = new Set(); flagged.forEach(f => f.repos.forEach((_, id) => reposHit.add(id)));
    const sum = host.querySelector('#discSummary');
    if (sum) sum.innerHTML = [
      ['Repos scannés', fmt(reposCount)],
      ['Composants résolus', fmt(compCount)],
      ['Signalés (OSV)', fmt(flagged.length)],
      ['Malveillants', fmt(mal)],
      ['Repos concernés', fmt(reposHit.size)]
    ].map(([k, v]) => `<div class="br-cell"><div class="br-k">${k}</div><div class="br-v">${v}</div></div>`).join('');

    const tb = host.querySelector('#discTable');
    if (!tb) return;
    if (!flagged.length) { tb.innerHTML = done ? '<div class="br-empty">✅ Aucun composant signalé par OSV.dev sur le périmètre scanné.</div>' : ''; return; }
    tb.innerHTML = `<table class="br-tbl"><thead><tr>
        <th>Gravité</th><th>Composant</th><th>Version</th><th>Avis OSV</th><th>Repos</th><th></th>
      </tr></thead><tbody>${flagged.map(f => {
        const idsHtml = f.ids.slice(0, 3).map(id => `<a href="https://osv.dev/vulnerability/${encodeURIComponent(id)}" target="_blank" rel="noopener">${escH(id)}</a>`).join(' ') + (f.ids.length > 3 ? ` +${f.ids.length - 3}` : '');
        const jsName = f.name.replace(/'/g, "\\'"), jsVer = f.version.replace(/'/g, "\\'");
        return `<tr>
          <td><span class="br-pri ${f.sev.tone}">${f.malicious ? '☣️ ' : ''}${escH(f.sev.label)}</span></td>
          <td class="br-td-repo"><b>${escH(f.name)}</b>${f.dev ? ' <span class="br-tag">dev</span>' : ''}${f.summary ? `<div class="disc-sum">${escH(f.summary)}</div>` : ''}</td>
          <td><code>${escH(f.version)}</code></td>
          <td class="disc-ids">${idsHtml}</td>
          <td>${fmt(f.repos.size)}</td>
          <td><button class="disc-trace" onclick="brFromDiscovery('${jsName}','${jsVer}')">🎯 Tracer</button></td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  // Un composant signalé → pré-remplit l'IOC et lance le Blast Radius.
