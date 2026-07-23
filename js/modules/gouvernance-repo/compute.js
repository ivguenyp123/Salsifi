/* gouvernance-repo · compute.js — logique pure : analyse secrets/supply/CIS, parsing, rapports (strings).
 * Portée globale du script classique (module déballé de son IIFE). */

'use strict';

  function _registryHost(u) { try { return new URL(u).hostname; } catch { return ''; } }

  function isInternalRegistry(u) { const h = _registryHost(u); return !!h && INTERNAL_REGISTRY_RX.test(h); }

  // URL GitLab d'un finding, ancrée sur la LIGNE exacte (ou le fichier si pas de ligne).
  // Même logique que les cartes en page → un lien mène droit au problème.
  // Marche pour tous les modes : repo.url est renseigné en mono (?repo=), workspace et « tous ».
  // Pour un finding historique, on ancre sur le commit (f.commit) plutôt que la branche.
  function findingUrl(repo, f) {
    if (!repo || !f || !f.file || f.file === '—') return '';
    // web_url (repo.url) peut manquer selon l'API (ex. listing `simple=true`) :
    // on reconstruit alors la base depuis GITLAB_URL + le chemin du repo, donc un
    // lien est TOUJOURS produit (rapport, cartes, Excel, Markdown), dans tous les modes.
    const base = repo.url || ((typeof GITLAB_URL === 'string' && GITLAB_URL && repo.path)
      ? GITLAB_URL.replace(/\/+$/, '') + '/' + repo.path : '');
    if (!base) return '';
    const branch = repo.defaultBranch && repo.defaultBranch !== 'HEAD' ? repo.defaultBranch : 'HEAD';
    const ref = f.commit ? f.commit : branch;
    const encFile = String(f.file).split('/').map(encodeURIComponent).join('/');
    return `${base}/-/blob/${encodeURIComponent(ref)}/${encFile}${f.line ? '#L' + f.line : ''}`;
  }

  function nextLink(h) {
    if (!h) return null;
    for (const part of h.split(',')) { const m = part.match(/<([^>]+)>\s*;\s*rel="next"/); if (m) return m[1]; }
    return null;
  }


  function isSuspectFile(path) {
    const name = path.split('/').pop().toLowerCase();
    const lowerPath = path.toLowerCase();
    if (/\.(example|template|sample|dist|md|png|jpe?g|gif|ico|svg|woff2?|ttf|eot|webp|mp[34]|mov|avi|zip|tar|gz|rar|7z|pdf|jar|war|class)$/i.test(name)) return false;
    if (/(?:^|\/)(?:node_modules|vendor|dist|build|target|coverage|\.git|out|\.next|\.nuxt|\.cache|__pycache__|\.venv|venv)(?:\/|$)/.test(lowerPath)) return false;
    const risky = [
      /^\.env(\..+)?$/,
      /^(config|application|appsettings|settings|secrets?|credentials?)(\..+)?\.(json|ya?ml|toml|properties|ini|xml|env)$/,
      /^application(-.+)?\.(properties|ya?ml)$/,
      /^appsettings(\..+)?\.json$/,
      /^(local_settings|secret_settings)\.py$/,
      /^service[-_]account.*\.json$/,
      /^(credentials|firebase|gcp|aws)(\..+)?\.json$/,
      /\.(pem|key|p12|pfx|jks|asc)$/,
      /^id_(rsa|dsa|ecdsa|ed25519)$/,
      /^\.(npmrc|pypirc|dockercfg|htpasswd|netrc)$/,
      /^config\.json$/,
      /^terraform\.tfvars(\..+)?$/,
      /\.tfstate(\.backup)?$/,
      /^web\.config$/,
      /^\.gitlab-ci(\..+)?\.ya?ml$/,
      /^docker-compose(\..+)?\.ya?ml$/,
    ];
    return risky.some(re => re.test(name));
  }


  // ══════════════════════════════════════════════════════════════════════
  // MOTEUR SUPPLY-CHAIN (surface) — manifestes & CI, par fichier
  // findings: { kind:'supply', severity:'red'|'orange', tag, type, file, line, preview }
  // ══════════════════════════════════════════════════════════════════════
  function supplyEco(path) {
    const lower = path.toLowerCase();
    if (/(?:^|\/)(?:node_modules|vendor|dist|build|target|\.git|__pycache__|venv|\.venv|coverage)(?:\/|$)/.test(lower)) return null;
    const name = path.split('/').pop();
    if (name === 'package.json') return 'npm';
    if (name === '.npmrc') return 'npmrc';
    if (/^\.gitlab-ci(\..+)?\.ya?ml$/i.test(name)) return 'ci';
    if (name === 'pom.xml') return 'maven';
    if (name === 'build.gradle' || name === 'build.gradle.kts') return 'gradle';
    if (/^requirements.*\.txt$/i.test(name)) return 'pip';
    if (name === 'Dockerfile' || /\.dockerfile$/i.test(name) || /^Dockerfile\./i.test(name)) return 'docker';
    return null;
  }


  function checkSupply(eco, content, file, out) {
    const push = (severity, tag, type, line, preview) => out.push({ kind: 'supply', severity, tag, type, file, line, preview: _trunc(preview) });
    if (eco === 'npm') {
      let pkg; try { pkg = JSON.parse(content); } catch { return; }
      for (const h of ['preinstall', 'install', 'postinstall']) {
        if (pkg.scripts && pkg.scripts[h]) push('red', 'npm', `Script ${h}`, _lineOf(content, `"${h}"`), pkg.scripts[h]);
      }
      const exact = /^\d+\.\d+\.\d+([-+].+)?$/;
      for (const dk of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        const deps = pkg[dk]; if (!deps || typeof deps !== 'object') continue;
        for (const [n, v] of Object.entries(deps)) {
          const val = String(v).trim();
          if (exact.test(val)) continue;
          const sev = (val === 'latest' || val === '*' || /^(git\+|https?:\/\/|github:|file:)/i.test(val)) ? 'red' : 'orange';
          push(sev, 'npm', 'Dépendance non figée', _lineOf(content, `"${n}"`), `${n}: ${val}`);
        }
      }
    } else if (eco === 'npmrc') {
      content.split('\n').forEach((ln, i) => {
        const m = ln.match(/registry\s*=\s*(\S+)/i); if (!m) return;
        const url = m[1];
        if (/^http:\/\//i.test(url)) push('red', 'npm', 'Registry HTTP (non chiffré)', i + 1, ln);
        else if (/^https?:/i.test(url) && !/registry\.npmjs\.org/i.test(url) && !isInternalRegistry(url)) push('orange', 'npm', 'Registry npm tiers', i + 1, ln);
      });
    } else if (eco === 'ci') {
      content.split('\n').forEach((ln, i) => {
        const im = ln.match(/^\s*image:\s*["']?([^\s"'{]+)/);
        if (im) { const img = im[1]; if (/:latest$/i.test(img) || !/:/.test(img)) push('orange', 'ci', 'Image CI non pinnée', i + 1, img); }
        if (_pipe.test(ln)) push('red', 'ci', 'Exécution distante (pipe shell)', i + 1, ln);
        if (/(remote:|include:).*https?:\/\//.test(ln)) push('orange', 'ci', 'include CI distant', i + 1, ln);
      });
    } else if (eco === 'maven') {
      content.split('\n').forEach((ln, i) => {
        const m = ln.match(/<version>\s*([^<]+?)\s*<\/version>/i);
        if (m) { const v = m[1]; if (!v.includes('${') && (/[\[\]\(\)]/.test(v) || /\b(LATEST|RELEASE)\b/.test(v))) push('orange', 'maven', 'Version Maven dynamique', i + 1, v); }
      });
    } else if (eco === 'gradle') {
      content.split('\n').forEach((ln, i) => {
        if (/['"][\w.\-]+:[\w.\-]+:[^'"]*(\+|latest\.)[^'"]*['"]/i.test(ln)) push('orange', 'gradle', 'Version Gradle dynamique', i + 1, ln);
      });
    } else if (eco === 'pip') {
      content.split('\n').forEach((ln, i) => {
        const t = ln.trim();
        if (!t || t.startsWith('#') || t.startsWith('-') || /^https?:/i.test(t) || t.startsWith('git+')) return;
        if (/^[A-Za-z0-9._\-\[\]]+/.test(t) && !/[=<>~!]=/.test(t)) push('orange', 'pip', 'Dépendance Python non figée', i + 1, t);
      });
    } else if (eco === 'docker') {
      content.split('\n').forEach((ln, i) => {
        const f = ln.match(/^\s*FROM\s+(\S+)/i);
        if (f) { const img = f[1]; if (!/@sha256:/.test(img) && (/:latest$/i.test(img) || !/:/.test(img))) push('orange', 'docker', 'Image Docker non pinnée', i + 1, img); }
        if (/^\s*ADD\s+https?:\/\//i.test(ln)) push('orange', 'docker', 'ADD distant (Dockerfile)', i + 1, ln);
        if (_pipe.test(ln)) push('red', 'docker', 'Exécution distante (pipe shell)', i + 1, ln);
      });
    }
  }


  // ── Instrumentation (mode historique) ──
  function fmtDur(s) {
    s = Math.round(s); if (s < 60) return s + 's';
    const m = Math.floor(s / 60), r = s % 60; if (m < 60) return `${m}m${r ? r + 's' : ''}`;
    const h = Math.floor(m / 60); return `${h}h${m % 60}m`;
  }


  // ══════════════════════════════════════════════════════════════════════
  // POPUP D'ENTRÉE + orchestration « lance tout » (analyse → MR → rapport)
  // ══════════════════════════════════════════════════════════════════════
  function launchScopeLabel() {
    return monoRepoId ? 'ce repo'
      : (workspaceMode ? `${workspaceRepos.length} repo(s) du workspace « ${workspaceName} »`
        : 'tous tes repos accessibles');
  }

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
        const link = findingUrl(repo, f);
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
      for (const f of res.findings) {
        const url = findingUrl(repo, f);
        const fileCell = url ? `[\`${f.file}\`](${url})` : `\`${f.file}\``;
        const lineCell = (url && f.line) ? `[${f.line}](${url})` : (f.line || '');
        md += `| ${fileCell} | ${lineCell} | ${f.commit || ''} | ${f.type} | ${f.tag || ('CIS ' + f.cis)} | \`${f.preview}\` |\n`;
      }
      md += `\n`;
    }
    download(isSupply ? 'scan-supply-chain.md' : 'scan-secrets.md', md, 'text/markdown');
  }


  // ── Rapport HTML (format identique à l'exemple validé) ──────────────
  // 1b : génère le rapport du mode courant ; si les deux familles de scans
  // ont été faites, génère le rapport global (sections Secrets + Supply-chain).
  function severityForType(t) {
    // Rouge = exécution de code / secret ; orange = version non figée.
    const red = ['Basic Auth in URL', 'GitLab PAT', 'GitHub PAT (classic)', 'GitHub PAT (fine-grained)',
      'AWS Access Key', 'Slack Token', 'Stripe Secret Key', 'Stripe Restricted Key', 'Google API Key',
      'SendGrid API Key', 'Private Key (PEM)', 'JWT Token', 'DB Connection String',
      'Script preinstall', 'Script install', 'Script postinstall',
      'Exécution distante (pipe shell)', 'Registry HTTP (non chiffré)'];
    return red.includes(t) ? 'red' : 'orange';
  }


  function exportReport() {
    // Lit les accumulateurs (cumul Surface+Historique côté secrets, dédoublonnés).
    const secRows = Array.from(reportSecrets.values());
    const supRows = Array.from(reportSupply.values());
    const cisRows = Array.from(reportCIS.values());

    if (!scannedSecrets && !scannedSupply && !scannedCIS) { showToast('Lance un scan avant de générer un rapport.', 'error'); return; }

    const sev = {};
    [...secRows, ...supRows].forEach(r => { sev[r.Type] = severityForType(r.Type); });

    const html = renderReportHTML({ secRows, supRows, cisRows, hasSec: scannedSecrets, hasSup: scannedSupply, hasCis: scannedCIS, sev, consolidated: buildConsolidated() });
    const parts = [];
    if (scannedSecrets) parts.push('secrets');
    if (scannedSupply) parts.push('supply');
    if (scannedCIS) parts.push('cis');
    const name = parts.length > 1 ? 'rapport-securite-global.html' : `rapport-${parts[0]}.html`;
    download(name, html, 'text/html');
    showToast('📑 Rapport généré ✅', 'success');
  }


  // ══════════════════════════════════════════════════════════════════════
  // RÉSULTATS CONSOLIDÉS — vue PAR REPO + priorisation, depuis les accumulateurs.
  // Une intention → la plateforme scanne tout → ici on réunit secrets + supply +
  // CIS par dépôt et on classe du plus risqué au moins risqué.
  // ══════════════════════════════════════════════════════════════════════
  function buildConsolidated() {
    const byRepo = new Map();
    const get = (path) => { if (!byRepo.has(path)) byRepo.set(path, { path, url: '', secrets: [], supply: [], cis: null }); return byRepo.get(path); };
    for (const r of reportSecrets.values()) get(r.Repo).secrets.push(r);
    for (const r of reportSupply.values()) get(r.Repo).supply.push(r);
    for (const r of reportCIS.values()) { const e = get(r.Repo); e.cis = r; if (r.url) e.url = r.url; }
    const rows = [...byRepo.values()].map(e => {
      const supRed = e.supply.filter(s => severityForType(s.Type) === 'red').length;
      const supOrange = e.supply.length - supRed;
      const cisGaps = e.cis ? e.cis.gaps.length : 0;
      // Pondération : un secret exposé pèse plus qu'une alerte version, etc.
      const risk = e.secrets.length * 10 + supRed * 5 + cisGaps * 3 + supOrange * 2;
      return Object.assign(e, { supRed, supOrange, cisGaps, risk });
    }).sort((a, b) => b.risk - a.risk);
    const totals = {
      repos: rows.length,
      secrets: reportSecrets.size,
      supply: reportSupply.size,
      cisGaps: rows.reduce((s, r) => s + r.cisGaps, 0),
      cisRepos: reportCIS.size,
    };
    return { rows, totals };
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

    // Agrégats CIS
    const cisRows = d.cisRows || [];
    const cisNon = cisRows.filter(r => r.Status === 'nonconform');
    const cisGaps = cisRows.reduce((s, r) => s + (r.gaps ? r.gaps.length : 0), 0);
    const cisScoreBadge = (sc) => { const c = sc >= 80 ? '#34d399' : sc >= 50 ? '#fbbf24' : '#f87171'; return `<span style="font-family:var(--fm);font-weight:700;color:${c}">${sc}</span>`; };

    // KPIs dynamiques : seulement les familles réellement scannées.
    const kpiCards = [];
    if (d.hasSec) {
      kpiCards.push(`<div class="kpi red"><div class="n">${d.secRows.length}</div><div class="l">🔑 Secrets exposés</div></div>`);
      kpiCards.push(`<div class="kpi violet"><div class="n">${nbRepos(d.secRows)}</div><div class="l">Repos touchés (secrets)</div></div>`);
    }
    if (d.hasSup) {
      kpiCards.push(`<div class="kpi orange"><div class="n">${d.supRows.length}</div><div class="l">📦 Alertes supply-chain</div></div>`);
      kpiCards.push(`<div class="kpi cyan"><div class="n">${nbRepos(d.supRows)}</div><div class="l">Repos touchés (supply)</div></div>`);
    }
    if (d.hasCis) {
      kpiCards.push(`<div class="kpi red"><div class="n">${cisNon.length}</div><div class="l">🛡️ CIS non conformes</div></div>`);
      kpiCards.push(`<div class="kpi orange"><div class="n">${cisGaps}</div><div class="l">Écarts CIS</div></div>`);
    }
    const kpis = `<div class="kpis">${kpiCards.join('')}</div>`;

    // Priorisation : repos les plus à risque (secrets + supply + CIS combinés).
    const cons = d.consolidated || { rows: [] };
    const rankRows = cons.rows.slice(0, 40).map((r, i) => `<tr>
        <td style="font-family:var(--fm);font-weight:700;color:var(--measure)">#${i + 1}</td>
        <td class="t-repo" title="${esc(r.path)}">${esc(r.path)}</td>
        <td>${r.secrets.length ? '🔑 ' + r.secrets.length : '—'}</td>
        <td>${r.supply.length ? '📦 ' + r.supply.length : '—'}</td>
        <td>${r.cisGaps ? '🛡️ ' + r.cisGaps + (r.cis ? ' · score ' + r.cis.Score : '') : '—'}</td>
        <td><b style="color:#fca5a5">${r.risk}</b></td>
    </tr>`).join('');
    const rankSection = cons.rows.length ? `
  <div class="section">
    <div class="section-h">🎯 Repos les plus à risque <span class="pill">${cons.rows.length} repos · à traiter du haut vers le bas</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Rang</th><th>Repo</th><th>Secrets</th><th>Supply</th><th>CIS</th><th>Risque</th></tr></thead><tbody>${rankRows}</tbody></table></div>
  </div>` : '';

    const cisSection = d.hasCis ? `
  <div class="section">
    <div class="section-h">🛡️ Conformité CIS GitLab <span class="pill">${cisNon.length} non conforme(s) · ${cisGaps} écart(s) · ${cisRows.length} repos</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Repo</th><th>Score</th><th>Contrôle CIS</th><th>Écart constaté</th></tr></thead><tbody>
      ${cisRows.filter(r => r.gaps && r.gaps.length).sort((a, b) => a.Score - b.Score).flatMap(r => r.gaps.map((g, i) =>
        `<tr><td class="t-repo" title="${esc(r.Repo)}">${i === 0 ? esc(r.Repo) : ''}</td><td>${i === 0 ? cisScoreBadge(r.Score) : ''}</td><td style="font-family:var(--fm);font-size:11px;color:var(--ts)">CIS ${esc(g.cis)} — ${esc(g.label)}</td><td style="color:#fca5a5">${esc(g.detail)}</td></tr>`
      )).join('') || '<tr><td colspan="4" class="empty">Tous les repos scannés sont conformes ✅</td></tr>'}
    </tbody></table></div>
  </div>` : '';

    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rapport Sécurité — DevOps Hub</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;700;800&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0f0a1f;--bg2:#1a1230;--card:rgba(28,20,50,0.6);--bd:rgba(255,255,255,0.08);--bd2:rgba(255,255,255,0.18);--ov-06:rgba(255,255,255,0.06);
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
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px;margin-bottom:30px}
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
    <div><h1>🛡️ Rapport Sécurité</h1><div class="sub">${[d.hasSec ? 'secrets exposés' : '', d.hasSup ? 'risques supply-chain' : '', d.hasCis ? 'conformité CIS' : ''].filter(Boolean).join(' · ')} — Inspecter &amp; Sécuriser</div></div>
    <div class="meta">DevOps Hub · Inspecter &amp; Sécuriser<br>Généré le ${dateStr}</div>
  </div>
  <div class="divider"></div>
${kpis}
${rankSection}
${secSection}
${supSection}
${cisSection}
  <div class="foot">Rapport généré par DevOps Hub · Inspecter &amp; Sécuriser · Valeurs sensibles censurées (aucune valeur complète exposée)</div>
</div>
<script>
const D = ${dataJson};
function tag(s){return '<span class="sev-tag '+s+'">'+(s==='red'?'🔴':'🟠')+'</span>'}
function link(r,txt,cls){return r.Lien?'<a class="'+cls+' t-link" href="'+r.Lien+'" target="_blank" rel="noopener">'+txt+'</a>':'<span class="'+cls+'">'+txt+'</span>'}
function renderSec(f){
  var tb=document.querySelector('#secTable tbody'); if(!tb)return; f=(f||'').toLowerCase();
  tb.innerHTML=D.sec.filter(function(r){return !f||(r.Repo+r.Fichier+r.Type+r['Aperçu']).toLowerCase().indexOf(f)>=0;}).map(function(r){
    var s=D.sev[r.Type]||'red';
    return '<tr><td>'+tag(s)+'</td><td class="t-repo" title="'+r.Repo+'">'+link(r,r.Repo,'t-repo')+'</td><td>'+link(r,r.Fichier+':'+r.Ligne,'t-file')+'</td><td>'+r.Type+'</td><td><span class="t-prev">'+r['Aperçu']+'</span></td><td style="font-family:var(--fm);font-size:11px;color:var(--tm)">'+r['Catégorie']+'</td></tr>';
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
    return '<tr><td>'+tag(s)+'</td><td class="t-repo" title="'+r.Repo+'">'+link(r,r.Repo,'t-repo')+'</td><td>'+link(r,r.Fichier+':'+r.Ligne,'t-file')+'</td><td>'+r.Type+'</td><td style="font-family:var(--fm);font-size:11px;color:var(--ts)">'+r['Catégorie']+'</td><td><span class="t-prev">'+r['Aperçu']+'</span></td></tr>';
  }).join('')||'<tr><td colspan="6" class="empty">Aucun résultat</td></tr>';
}
var _ss=document.getElementById('secSearch'); if(_ss){_ss.addEventListener('input',function(e){renderSec(e.target.value);}); renderSec('');}
['supSearch','supSev','supEco'].forEach(function(id){var el=document.getElementById(id); if(el)el.addEventListener('input',renderSup);});
if(document.getElementById('supTable')) renderSup();
</script>
</body></html>`;
  }

  function fmt(n) { return new Intl.NumberFormat('fr-FR').format(n); }


  function parseMavenRanges(content) {
    const issues = []; let m;
    const rangeRe = /<version>\s*([\[\(][^<]+[\]\)])\s*<\/version>/g;
    while ((m = rangeRe.exec(content)) !== null) issues.push({ type: 'range', value: m[1] });
    const dynRe = /<version>\s*(LATEST|RELEASE|.*-SNAPSHOT)\s*<\/version>/g;
    while ((m = dynRe.exec(content)) !== null) issues.push({ type: 'dynamic', value: m[1] });
    return issues;
  }


  // Markdown du rapport, par repo. Aligné sur exportMarkdown : mêmes colonnes,
  // colonne Commit seulement en historique, aperçus censurés, refs CIS.
  function buildReportMarkdown(repo, res) {
    const isSupply = res.findings.some(f => f.kind === 'supply');
    const isHist = res.findings.some(f => f.commit);
    const noun = isSupply ? 'alertes supply-chain' : 'secrets';
    const date = new Date().toLocaleString('fr-FR');

    let md = `# 🔑 Rapport de scan sécurité — ${noun}\n\n`;
    md += `> Généré automatiquement par **DevOps Hub · Secrets Scanner**.\n`;
    md += `> Cette MR est une **proposition** : libre à vous de la fermer. Rien n'est mergé automatiquement.\n\n`;
    md += `- **Repo** : \`${repo.path}\`\n`;
    md += `- **Date** : ${date}\n`;
    md += `- **Mode** : ${isSupply ? 'Supply-chain' : (isHist ? 'Secrets (historique)' : 'Secrets (surface)')}\n`;
    md += `- **${isSupply ? 'Alertes' : 'Secrets'} détectés** : ${res.findings.length}\n\n`;
    if (!isSupply) md += `> ⚠️ Valeurs **censurées** (préfixe + \`***\`). Aucune valeur complète n'est exposée dans ce fichier.\n\n`;

    md += `## Détail\n\n`;
    md += `| Fichier | Ligne | ${isHist ? 'Commit | ' : ''}Type | Catégorie | Aperçu |\n`;
    md += `|---|---|${isHist ? '---|' : ''}---|---|---|\n`;
    for (const f of res.findings) {
      const cat = f.tag || ('CIS ' + f.cis);
      const url = findingUrl(repo, f);
      const fileCell = url ? `[\`${f.file}\`](${url})` : `\`${f.file}\``;
      const lineCell = (url && f.line) ? `[${f.line}](${url})` : (f.line || '');
      md += `| ${fileCell} | ${lineCell} | ${isHist ? (f.commit || '') + ' | ' : ''}${f.type} | ${cat} | \`${f.preview}\` |\n`;
    }

    md += `\n## Que faire ?\n\n`;
    if (isSupply) {
      md += `- Épingler les versions (exactes ou par \`@sha256\`).\n`;
      md += `- Retirer / auditer les hooks d'install non vérifiés.\n`;
      md += `- Pinner les images CI/Docker (tag figé ou digest).\n`;
      md += `- Bannir les \`curl … | bash\`.\n`;
    } else {
      md += `1. **Révoquer** chaque secret côté service (considérez-le compromis).\n`;
      md += `2. **Retirer** la valeur du fichier, la remplacer par une variable CI/CD protégée.\n`;
      md += `3. **Purger l'historique** Git si le secret y a été commité (\`git filter-repo\`).\n`;
    }
    md += `\n---\n_Refs CIS GitLab : 1.5.1 (code), 2.3.8 (pipeline), 5.1.3 (déploiement). Généré par DevOps Hub._\n`;
    return md;
  }

  function riskText(type) {
    const hit = RISK.find(([k]) => type.toLowerCase().includes(k.toLowerCase()));
    return hit ? hit[1] : 'Donnée sensible exposée dans le dépôt : à considérer comme compromise et à traiter.';
  }


  // Description de la MR : auto-portante. Quel fichier, quelle ligne, pourquoi
  // c'est dangereux, quoi faire. C'est ce que le destinataire lit en premier.
  function buildMRDescription(repo, res) {
    const isSupply = res.findings.some(f => f.kind === 'supply');
    const n = res.findings.length;
    const noun = isSupply ? 'alerte(s) supply-chain' : 'secret(s)';

    let d = `## 🔑 Scan sécurité — ${n} ${noun}\n\n`;
    d += `Rapport généré automatiquement par **DevOps Hub · Secrets Scanner** sur \`${repo.path}\`.\n`;
    d += `> ⚠️ **Proposition** : à vous de décider. Rien n'est mergé automatiquement, libre à vous de fermer cette MR.\n`;
    if (!isSupply) d += `> Les valeurs ci-dessous sont **censurées** (préfixe + \`***\`).\n`;
    d += `\n---\n\n`;

    res.findings.forEach((f, i) => {
      const cat = f.tag || ('CIS ' + f.cis);
      d += `### ${i + 1}. ${f.type}\n`;
      d += `- **Fichier** : \`${f.file}\`${f.line ? ` — **ligne ${f.line}**` : ''}${f.commit ? ` — commit \`${f.commit}\`` : ''}\n`;
      d += `- **Catégorie** : ${cat}\n`;
      d += `- **Aperçu** : \`${f.preview}\`\n`;
      d += `- **Pourquoi c'est dangereux** : ${riskText(f.type)}\n`;
      d += `- **Action** : ${isSupply
        ? 'épingler la version (exacte ou `@sha256`), retirer les hooks/`curl … | bash` non vérifiés.'
        : '**révoquer** le secret côté service (le considérer compromis), le retirer du fichier, le remplacer par une variable CI/CD protégée, puis **purger l\'historique** Git si nécessaire.'}\n\n`;
    });

    d += `---\n_Détail complet également dans \`${MR_FILE}\`. Refs CIS GitLab : 1.5.1 (code), 2.3.8 (pipeline), 5.1.3 (déploiement)._\n`;
    return d;
  }


  function defaultSecurityMd(repo) {
    return `# Politique de sécurité — ${repo.path}\n\n`
      + `## Signaler une vulnérabilité\n\n`
      + `Merci de signaler toute vulnérabilité de manière responsable, en privé, à l'équipe sécurité plutôt que via une issue publique.\n\n`
      + `- Contact : _à compléter (e-mail ou canal sécurité de l'équipe)_\n`
      + `- Délai de réponse visé : sous 72 h ouvrées\n\n`
      + `## Versions supportées\n\n`
      + `| Version | Supportée |\n|---|---|\n| dernière | ✅ |\n\n`
      + `---\n_Fichier proposé automatiquement par DevOps Hub (conformité CIS GitLab 1.2.1). À adapter par l'équipe._\n`;
  }

  function defaultCodeowners(repo) {
    return `# CODEOWNERS — ${repo.path}\n`
      + `# Définit les propriétaires par défaut, sollicités en revue sur chaque MR.\n`
      + `# Syntaxe : <motif>  @utilisateur ou @groupe\n`
      + `# Réf. CIS GitLab 1.1.6. À compléter par l'équipe.\n\n`
      + `* @${(repo.path.split('/')[0]) || 'votre-groupe'}\n`;
  }


  function buildCISDescription(repo, res, fileActions) {
    const ko = res.checks.filter(c => c.state === 'ko');
    const unverif = res.checks.filter(c => c.state === 'unverif');
    let d = `## 🛡️ Conformité CIS GitLab — score ${res.score}/100\n\n`;
    d += `Audit automatique **DevOps Hub** sur \`${repo.path}\`. Statut : **${res.status === 'conform' ? '✅ conforme' : '🔴 non conforme'}** (score ${res.score}/100, priorité).\n`;
    d += `> ⚠️ **Proposition** : à valider ou refuser (merge / close). Rien n'est imposé.\n\n`;

    if (fileActions.length) {
      d += `### 📄 Fichiers proposés dans cette MR\n`;
      d += `Ces fichiers sont **ajoutés par cette MR** — il vous suffit de la merger pour les créer (ou de les ajuster avant) :\n\n`;
      for (const fa of fileActions) d += `- \`${fa.file_path}\` — ${fa.why}\n`;
      d += `\n`;
    }

    d += `### ⚙️ À régler dans les Settings GitLab\n`;
    d += `Ces points **ne peuvent pas** être corrigés par un commit : ils relèvent de la configuration du projet.\n\n`;
    const settingsKo = ko.filter(c => !c.fixable);
    if (settingsKo.length) {
      d += `| Check | CIS | Constat | Où corriger |\n|---|---|---|---|\n`;
      const where = {
        branch: 'Settings → Repository → Protected branches',
        approvals: 'Settings → Merge requests → Approvals',
        linear: 'Settings → Merge requests → Merge method',
        maintainers: 'Project information → Members',
        webhooks: 'Settings → Webhooks',
        inactive: 'Archiver le projet (Settings → General → Advanced)',
      };
      for (const c of settingsKo) d += `| ${escMd(c.label)} | ${c.cis} | ${escMd(c.detail)} | ${where[c.id] || '—'} |\n`;
      d += `\n`;
    } else {
      d += `_Aucun réglage de configuration en écart._\n\n`;
    }

    if (unverif.length) {
      d += `### 🔒 Non vérifiable (droits insuffisants)\n`;
      d += `Le compte ayant lancé le scan n'avait pas les droits de lire ces points. **Ce n'est pas un constat de non-conformité.**\n\n`;
      for (const c of unverif) d += `- ${escMd(c.label)} (CIS ${c.cis})\n`;
      d += `\n`;
    }

    d += `---\n_Réf. CIS GitLab Benchmark v1.0.1. Généré par DevOps Hub._\n`;
    return d;
  }
