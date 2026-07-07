/*
 * Salsifi — Générateur de rapport (Mesurer & Progresser)
 * ==================================================================
 * On choisit des blocs (drag & drop pour les inclure et les ordonner),
 * on clique « Générer », et le module produit un rapport HTML AUTONOME
 * (téléchargeable) construit sur les VRAIES données GitLab au moment du
 * clic. Aucun build, marche servi et en local (file://).
 *
 * Chaque bloc = une fonction fetch(ctx) qui interroge l'API GitLab via la
 * couche commune et renvoie une section normalisée { stats, rows, note }.
 * Un bloc qui échoue n'empêche pas le rapport : il s'affiche « indisponible ».
 *
 * Chargé après la couche commune (utils/gitlab/auth).
 */
(function () {
  'use strict';

  const S = window.Salsifi || {};
  const esc = S.escapeHtml || (s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));

  let AUTH = null, REPO = null;
  const SINCE_30 = () => new Date(Date.now() - 30 * 86400000).toISOString();

  const gjson = (ep, init) => S.gitlabJson(AUTH.gitlabUrl, AUTH.token, ep, init);
  const gpage = (ep, opts) => S.gitlabPaginate(AUTH.gitlabUrl, AUTH.token, ep, opts);

  // ── helpers de calcul ──
  const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : 0;
  const fmtDate = iso => { if (!iso) return '—'; try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return '—'; } };
  const daysAgo = iso => { if (!iso) return null; return Math.floor((Date.now() - new Date(iso)) / 86400000); };
  // Arbre récursif du dépôt, mutualisé sur une génération (réinitialisé à chaque « Générer »).
  function getTree() {
    if (!REPO._tree) REPO._tree = gpage(`/projects/${REPO.id}/repository/tree?recursive=true`, { maxPages: 15 });
    return REPO._tree;
  }
  const doraLevel = (metric, v) => {
    if (v == null) return '';
    if (metric === 'df') return v >= 1 ? 'Elite' : v >= 1 / 7 ? 'High' : v >= 1 / 30 ? 'Medium' : 'Low';
    if (metric === 'lt') return v < 1 ? 'Elite' : v < 7 ? 'High' : v < 30 ? 'Medium' : 'Low';
    if (metric === 'cfr') return v <= 5 ? 'Elite' : v <= 10 ? 'High' : v <= 15 ? 'Medium' : 'Low';
    if (metric === 'mttr') return v < 1 ? 'Elite' : v < 24 ? 'High' : v < 168 ? 'Medium' : 'Low';
    return '';
  };

  // ══════════════════════════════════════════════════════════════════
  //  BLOCS — chacun interroge l'API GitLab (données réelles au run)
  // ══════════════════════════════════════════════════════════════════
  const BLOCKS = [
    {
      id: 'identity', icon: '📇', title: 'Identité du dépôt',
      desc: 'Nom, visibilité, branche par défaut, dernière activité',
      async fetch() {
        const p = await gjson(`/projects/${REPO.id}`);
        if (!p) throw new Error('projet indisponible');
        return {
          stats: [
            { label: 'Branche par défaut', value: esc(p.default_branch || '—') },
            { label: 'Visibilité', value: esc(p.visibility || '—') },
            { label: '★ Stars', value: p.star_count || 0 },
            { label: 'Dernière activité', value: fmtDate(p.last_activity_at) },
          ],
          rows: [
            ['Chemin', esc(p.path_with_namespace || REPO.path)],
            ['Description', esc(p.description || '—')],
            ['Issues ouvertes', p.open_issues_count != null ? p.open_issues_count : '—'],
            ['Créé le', fmtDate(p.created_at)],
          ],
        };
      },
    },
    {
      id: 'delivery', icon: '🚀', title: 'Livraison — pipelines (30 j)',
      desc: 'Volume, taux de succès, cadence de déploiement',
      async fetch() {
        const pipes = await gpage(`/projects/${REPO.id}/pipelines?updated_after=${SINCE_30()}`, { maxPages: 10 });
        const total = pipes.length;
        const ok = pipes.filter(p => p.status === 'success').length;
        const ko = pipes.filter(p => p.status === 'failed').length;
        const onDefault = pipes.filter(p => p.ref === REPO.defaultBranch && p.status === 'success').length;
        return {
          stats: [
            { label: 'Pipelines (30 j)', value: total },
            { label: 'Taux de succès', value: pct(ok, ok + ko) + ' %' },
            { label: 'Échecs', value: ko },
            { label: 'Déploiements / jour', value: (onDefault / 30).toFixed(2), sub: `sur ${esc(REPO.defaultBranch)}` },
          ],
          note: total === 0 ? 'Aucun pipeline sur les 30 derniers jours.' : null,
        };
      },
    },
    {
      id: 'mrs', icon: '🔀', title: 'Merge Requests (30 j)',
      desc: 'Ouvertes, mergées, lead time, taux de review',
      async fetch() {
        const merged = await gpage(`/projects/${REPO.id}/merge_requests?state=merged&updated_after=${SINCE_30()}`, { maxPages: 10 });
        const opened = await gpage(`/projects/${REPO.id}/merge_requests?state=opened`, { maxPages: 10 });
        const realMerged = merged.filter(m => m.merged_at && new Date(m.merged_at) >= new Date(SINCE_30()));
        const leads = realMerged.map(m => (new Date(m.merged_at) - new Date(m.created_at)) / 86400000).filter(d => d >= 0).sort((a, b) => a - b);
        const medLead = leads.length ? leads[Math.floor(leads.length / 2)] : null;
        const sevenDaysAgo = Date.now() - 7 * 86400000;
        const zombies = opened.filter(m => new Date(m.created_at).getTime() < sevenDaysAgo).length;
        return {
          stats: [
            { label: 'Mergées (30 j)', value: realMerged.length },
            { label: 'Ouvertes', value: opened.length },
            { label: 'Lead time médian', value: medLead != null ? medLead.toFixed(1) + ' j' : '—' },
            { label: 'Zombies (> 7 j)', value: zombies },
          ],
        };
      },
    },
    {
      id: 'contributors', icon: '👥', title: 'Contributeurs & bus factor',
      desc: 'Concentration des contributions, facteur de bus',
      async fetch() {
        const cs = await gjson(`/projects/${REPO.id}/repository/contributors?per_page=100`);
        const list = Array.isArray(cs) ? cs : [];
        const total = list.reduce((s, c) => s + (c.commits || 0), 0);
        const sorted = [...list].sort((a, b) => b.commits - a.commits);
        // bus factor = nb de personnes cumulant > 50 % des commits
        let cum = 0, bus = 0;
        for (const c of sorted) { cum += c.commits; bus++; if (total && cum / total > 0.5) break; }
        const top = sorted[0];
        return {
          stats: [
            { label: 'Contributeurs', value: list.length },
            { label: 'Bus factor', value: total ? bus : '—', sub: '> 50 % des commits' },
            { label: 'Top contributeur', value: top ? esc(top.name) : '—', sub: top && total ? pct(top.commits, total) + ' %' : '' },
            { label: 'Commits totaux', value: total },
          ],
          note: total && bus <= 1 ? '⚠️ Bus factor de 1 : un seul contributeur concentre la majorité des commits.' : null,
        };
      },
    },
    {
      id: 'branches', icon: '🌿', title: 'Branches',
      desc: 'Total, obsolètes (> 30 j), protégées',
      async fetch() {
        const branches = await gpage(`/projects/${REPO.id}/repository/branches`, { maxPages: 20 });
        const prot = await gjson(`/projects/${REPO.id}/protected_branches`);
        const protectedCount = Array.isArray(prot) ? prot.length : 0;
        const stale = branches.filter(b => { const d = daysAgo(b.commit && b.commit.committed_date); return d != null && d > 30; }).length;
        return {
          stats: [
            { label: 'Branches', value: branches.length },
            { label: 'Obsolètes (> 30 j)', value: stale },
            { label: 'Protégées', value: protectedCount },
            { label: 'Actives (≤ 30 j)', value: branches.length - stale },
          ],
          note: stale > 20 ? `${stale} branches n'ont pas bougé depuis > 30 j — un nettoyage serait utile.` : null,
        };
      },
    },
    {
      id: 'releases', icon: '🏷️', title: 'Tags & releases',
      desc: 'Nombre de tags, dernière release',
      async fetch() {
        const tags = await gpage(`/projects/${REPO.id}/repository/tags`, { maxPages: 5 });
        const latest = tags[0];
        return {
          stats: [
            { label: 'Tags', value: tags.length },
            { label: 'Dernier tag', value: latest ? esc(latest.name) : '—' },
            { label: 'Date', value: latest ? fmtDate(latest.commit && latest.commit.created_at) : '—' },
          ],
          note: tags.length === 0 ? 'Aucun tag : le semantic versioning n\'est pas encore en place.' : null,
        };
      },
    },
    {
      id: 'commits', icon: '📈', title: 'Activité — commits (30 j)',
      desc: 'Volume de commits et jours actifs',
      async fetch() {
        const commits = await gpage(`/projects/${REPO.id}/repository/commits?since=${SINCE_30()}`, { maxPages: 10 });
        const days = new Set(commits.map(c => (c.created_at || '').slice(0, 10))).size;
        const authors = new Set(commits.map(c => c.author_email || c.author_name)).size;
        return {
          stats: [
            { label: 'Commits (30 j)', value: commits.length },
            { label: 'Jours actifs', value: days, sub: '/ 30' },
            { label: 'Auteurs distincts', value: authors },
            { label: 'Commits / jour actif', value: days ? (commits.length / days).toFixed(1) : '0' },
          ],
        };
      },
    },
    {
      id: 'dora', icon: '📊', title: 'DORA — les 4 métriques (30 j)',
      desc: 'Deploy Frequency, Lead Time, Change Failure Rate, MTTR',
      async fetch() {
        const since = SINCE_30();
        const pipes = await gpage(`/projects/${REPO.id}/pipelines?updated_after=${since}`, { maxPages: 10 });
        const def = pipes.filter(p => p.ref === REPO.defaultBranch).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const succ = def.filter(p => p.status === 'success').length;
        const fail = def.filter(p => p.status === 'failed').length;
        const df = succ / 30;
        const cfr = (succ + fail) ? pct(fail, succ + fail) : null;
        // MTTR : par incident (on ne recompte pas les échecs consécutifs d'une même série)
        const rec = [];
        for (let i = 0; i < def.length; i++) {
          if (def[i].status !== 'failed') continue;
          if (i > 0 && def[i - 1].status === 'failed') continue;
          const nxt = def.slice(i + 1).find(p => p.status === 'success');
          if (nxt) { const h = (new Date(nxt.created_at) - new Date(def[i].created_at)) / 3600000; if (h > 0 && h <= 24 * 30) rec.push(h); }
        }
        rec.sort((a, b) => a - b);
        const mttr = rec.length ? rec[Math.floor(rec.length / 2)] : null;
        const merged = await gpage(`/projects/${REPO.id}/merge_requests?state=merged&updated_after=${since}`, { maxPages: 10 });
        const leads = merged.filter(m => m.merged_at && new Date(m.merged_at) >= new Date(since))
          .map(m => (new Date(m.merged_at) - new Date(m.created_at)) / 86400000).filter(d => d >= 0).sort((a, b) => a - b);
        const lt = leads.length ? leads[Math.floor(leads.length / 2)] : null;
        const dfVal = df >= 1 ? df.toFixed(1) + ' /j' : (df * 7 >= 1 ? (df * 7).toFixed(1) + ' /sem' : (df * 30).toFixed(1) + ' /mois');
        return {
          stats: [
            { label: 'Deploy Frequency', value: dfVal, sub: doraLevel('df', df) },
            { label: 'Lead Time', value: lt != null ? lt.toFixed(1) + ' j' : '—', sub: doraLevel('lt', lt) },
            { label: 'Change Failure Rate', value: cfr != null ? cfr + ' %' : '—', sub: doraLevel('cfr', cfr) },
            { label: 'MTTR', value: mttr != null ? mttr.toFixed(1) + ' h' : '—', sub: doraLevel('mttr', mttr) },
          ],
          note: def.length === 0 ? 'Aucun pipeline sur la branche par défaut (30 j) — métriques indisponibles.' : null,
        };
      },
    },
    {
      id: 'ciconfig', icon: '⚙️', title: 'Configuration CI/CD',
      desc: 'Pipeline, CODEOWNERS, templates MR, .gitignore, protection',
      async fetch() {
        const paths = (await getTree()).map(f => f.path);
        const has = re => paths.some(p => re.test(p));
        const prot = await gjson(`/projects/${REPO.id}/protected_branches`);
        const defProt = Array.isArray(prot) && prot.some(b => b.name === REPO.defaultBranch);
        const rows = [
          ['.gitlab-ci.yml', has(/^\.gitlab-ci\.yml$/) ? '✅ présent' : '❌ absent'],
          ['CODEOWNERS', has(/^(CODEOWNERS|docs\/CODEOWNERS|\.gitlab\/CODEOWNERS)$/i) ? '✅ présent' : '❌ absent'],
          ['Templates de MR', has(/^\.gitlab\/merge_request_templates\//) ? '✅ présents' : '❌ absents'],
          ['.gitignore', has(/^\.gitignore$/) ? '✅ présent' : '❌ absent'],
          ['Branche par défaut protégée', defProt ? '✅ oui' : '❌ non'],
        ];
        const ok = rows.filter(r => /✅/.test(r[1])).length;
        return { stats: [{ label: 'Bonnes pratiques', value: ok + '/' + rows.length, sub: 'au vert' }], rows };
      },
    },
    {
      id: 'governance', icon: '🔒', title: 'Gouvernance & conformité',
      desc: 'Protection de branche, approbations, CODEOWNERS, SECURITY.md',
      async fetch() {
        const prot = await gjson(`/projects/${REPO.id}/protected_branches`);
        const parr = Array.isArray(prot) ? prot : [];
        const def = parr.find(b => b.name === REPO.defaultBranch);
        const ap = await gjson(`/projects/${REPO.id}/approvals`);
        const paths = (await getTree()).map(f => f.path);
        const hasCo = paths.some(p => /^(CODEOWNERS|docs\/CODEOWNERS|\.gitlab\/CODEOWNERS)$/i.test(p));
        const hasSec = paths.some(p => /(^|\/)SECURITY\.md$/i.test(p));
        const rows = [
          ['Branche par défaut protégée', def ? '✅ oui' : '❌ non'],
          ['Force-push interdit', def ? (def.allow_force_push ? '❌ autorisé' : '✅ interdit') : '—'],
          ['Approbations requises', ap && ap.approvals_before_merge != null ? (ap.approvals_before_merge >= 1 ? '✅ ' + ap.approvals_before_merge : '❌ 0') : '—'],
          ['CODEOWNERS', hasCo ? '✅ présent' : '❌ absent'],
          ['SECURITY.md', hasSec ? '✅ présent' : '❌ absent'],
        ];
        const ok = rows.filter(r => /✅/.test(r[1])).length;
        return { stats: [{ label: 'Conformité', value: ok + '/' + rows.length, sub: 'contrôles au vert' }], rows };
      },
    },
    {
      id: 'flags', icon: '🚩', title: 'Feature flags',
      desc: 'Nombre de flags, actifs vs inactifs',
      async fetch() {
        const f = await gjson(`/projects/${REPO.id}/feature_flags`);
        const list = f && Array.isArray(f.feature_flags) ? f.feature_flags : (Array.isArray(f) ? f : null);
        if (!list) return { stats: [{ label: 'Feature flags', value: '—' }], note: 'Feature Flags non activés ou inaccessibles sur ce projet.' };
        const active = list.filter(x => x.active).length;
        return { stats: [
          { label: 'Total', value: list.length },
          { label: 'Actifs', value: active },
          { label: 'Inactifs', value: list.length - active },
        ] };
      },
    },
    {
      id: 'issues', icon: '🎫', title: 'Issues (30 j)',
      desc: 'Ouvertes, fermées et créées sur la période',
      async fetch() {
        const since = SINCE_30();
        const opened = await gpage(`/projects/${REPO.id}/issues?state=opened`, { maxPages: 10 });
        const closed = await gpage(`/projects/${REPO.id}/issues?state=closed&updated_after=${since}`, { maxPages: 10 });
        const closedIn = closed.filter(i => i.closed_at && new Date(i.closed_at) >= new Date(since));
        const createdIn = await gpage(`/projects/${REPO.id}/issues?created_after=${since}`, { maxPages: 10 });
        return { stats: [
          { label: 'Ouvertes', value: opened.length },
          { label: 'Fermées (30 j)', value: closedIn.length },
          { label: 'Créées (30 j)', value: createdIn.length },
        ], note: (opened.length + closed.length + createdIn.length) === 0 ? 'Aucune issue — le suivi est peut-être désactivé sur ce projet.' : null };
      },
    },
    {
      id: 'hygiene', icon: '🧹', title: 'Hygiène du dépôt',
      desc: 'Artefacts à ne pas versionner (build, binaires, logs…)',
      async fetch() {
        const blobs = (await getTree()).filter(f => f.type === 'blob');
        const susExt = new Set(['.jar', '.war', '.class', '.dll', '.exe', '.pdb', '.zip', '.tar', '.gz', '.log', '.dump', '.bak', '.7z', '.rar']);
        const susDir = new Set(['node_modules', 'target', 'build', 'dist', 'out', 'bin', 'obj', 'vendor', '.idea', '.vscode', '.vs', 'venv', '.venv', '__pycache__']);
        const cat = {};
        let suspects = 0;
        for (const f of blobs) {
          const ext = ((f.name.match(/\.[a-z0-9]+$/i) || [''])[0]).toLowerCase();
          const seg = f.path.toLowerCase().split('/').find(s => susDir.has(s));
          if (seg) { cat[seg] = (cat[seg] || 0) + 1; suspects++; }
          else if (susExt.has(ext)) { cat[ext] = (cat[ext] || 0) + 1; suspects++; }
        }
        const top = Object.entries(cat).sort((a, b) => b[1] - a[1]).slice(0, 6);
        return {
          stats: [
            { label: 'Fichiers', value: blobs.length },
            { label: 'Suspects', value: suspects, sub: 'à ignorer / externaliser' },
            { label: 'Ratio', value: pct(suspects, blobs.length) + ' %' },
          ],
          rows: top.map(t => [t[0], t[1] + ' fichier(s)']),
          note: suspects === 0 ? 'Aucun artefact suspect détecté — dépôt propre 👍' : null,
        };
      },
    },
  ];
  const BLOCK_BY_ID = Object.fromEntries(BLOCKS.map(b => [b.id, b]));

  // ══════════════════════════════════════════════════════════════════
  //  ÉTAT DU COMPOSEUR
  // ══════════════════════════════════════════════════════════════════
  // Ordre de rapport par défaut = TOUS les blocs (rapport complet d'emblée).
  const DEFAULT_ORDER = ['identity', 'dora', 'delivery', 'mrs', 'issues', 'commits', 'contributors', 'branches', 'releases', 'ciconfig', 'governance', 'flags', 'hygiene'];
  let selected = DEFAULT_ORDER.slice();
  let dragData = null;

  const el = id => document.getElementById(id);

  function renderComposer() {
    const avail = BLOCKS.filter(b => !selected.includes(b.id));
    el('palette').innerHTML = avail.length
      ? avail.map(b => cardHtml(b, 'palette')).join('')
      : '<div class="empty-hint">Tous les blocs sont dans le rapport.</div>';
    el('canvas').innerHTML = selected.length
      ? selected.map(id => cardHtml(BLOCK_BY_ID[id], 'canvas')).join('')
      : '<div class="empty-hint drop-hint">Glisse des blocs ici — ils seront générés dans cet ordre.</div>';
    wireDnd();
    el('genBtn').disabled = selected.length === 0;
    el('genCount').textContent = selected.length + ' bloc' + (selected.length > 1 ? 's' : '');
  }

  function cardHtml(b, zone) {
    return `<div class="block-card ${zone}" draggable="true" data-id="${b.id}">
      <span class="bc-grip">⋮⋮</span>
      <span class="bc-icon">${b.icon}</span>
      <div class="bc-body"><div class="bc-title">${esc(b.title)}</div><div class="bc-desc">${esc(b.desc)}</div></div>
      ${zone === 'canvas'
        ? `<button class="bc-x" title="Retirer" onclick="ReportBuilder.remove('${b.id}')">✕</button>`
        : `<button class="bc-add" title="Ajouter" onclick="ReportBuilder.add('${b.id}')">＋</button>`}
    </div>`;
  }

  // Applique une nouvelle sélection : invalide le rapport déjà généré (sinon
  // l'export resterait périmé) et re-rend la liste APRÈS le cycle de drag (le
  // rebuild innerHTML pendant un drag natif casse les glissers suivants).
  function applySelection(deferRender) {
    invalidate();
    if (deferRender) setTimeout(renderComposer, 0);
    else renderComposer();
  }

  // ── drag & drop ──
  function wireDnd() {
    document.querySelectorAll('.block-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        dragData = { id: card.dataset.id, from: card.classList.contains('canvas') ? 'canvas' : 'palette' };
        card.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', card.dataset.id); e.dataTransfer.effectAllowed = 'move'; } catch (x) {}
      });
      card.addEventListener('dragend', () => { document.querySelectorAll('.block-card.dragging').forEach(c => c.classList.remove('dragging')); dragData = null; });
    });
    const canvas = el('canvas');
    canvas.ondragover = e => { e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (x) {} canvas.classList.add('drop-active'); };
    canvas.ondragleave = e => { if (e.target === canvas) canvas.classList.remove('drop-active'); };
    canvas.ondrop = e => {
      e.preventDefault(); canvas.classList.remove('drop-active');
      if (!dragData) return;
      const id = dragData.id;
      const after = dragAfter(canvas, e.clientY);
      const afterId = after ? after.dataset.id : null;
      dragData = null;
      selected = selected.filter(x => x !== id); // retire si déjà présent (réordonnancement)
      const at = afterId == null ? selected.length : selected.indexOf(afterId);
      selected.splice(at < 0 ? selected.length : at, 0, id);
      applySelection(true);
    };
    // retirer un bloc en le glissant vers la palette
    const palette = el('palette');
    palette.ondragover = e => { e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (x) {} };
    palette.ondrop = e => {
      e.preventDefault();
      if (dragData && dragData.from === 'canvas') { const id = dragData.id; dragData = null; selected = selected.filter(x => x !== id); applySelection(true); }
    };
  }
  function dragAfter(container, y) {
    const cards = [...container.querySelectorAll('.block-card:not(.dragging)')];
    let closest = null, closestOffset = -Infinity;
    for (const c of cards) {
      const box = c.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closestOffset) { closestOffset = offset; closest = c; }
    }
    return closest;
  }

  // ══════════════════════════════════════════════════════════════════
  //  GÉNÉRATION DU RAPPORT (données réelles)
  // ══════════════════════════════════════════════════════════════════
  let lastHtml = null;
  let genToken = 0;

  // Toute modif de la sélection périme le rapport déjà produit : on coupe le
  // téléchargement et l'aperçu pour que l'export corresponde TOUJOURS à l'écran.
  function invalidate() {
    genToken++;
    lastHtml = null;
    const d = el('downloadBtn'); if (d) d.disabled = true;
    const pw = el('previewWrap'); if (pw) pw.classList.remove('show');
  }

  async function generate() {
    if (!selected.length) return;
    const token = ++genToken;         // ce run est le seul valide
    const order = selected.slice();   // fige la sélection au clic
    REPO._tree = null;                // données fraîches à chaque génération
    setStatus('Récupération des données GitLab…', true);
    el('genBtn').disabled = true;
    el('downloadBtn').disabled = true;
    const sections = [];
    for (const id of order) {
      if (token !== genToken) { setStatus('Sélection modifiée — relance la génération.', false); el('genBtn').disabled = false; return; }
      const b = BLOCK_BY_ID[id];
      setStatus(`Bloc « ${b.title} »…`, true);
      try {
        const data = await b.fetch();
        sections.push({ ok: true, block: b, data });
      } catch (e) {
        sections.push({ ok: false, block: b, error: e.message || 'indisponible' });
      }
    }
    if (token !== genToken) { setStatus('Sélection modifiée — relance la génération.', false); el('genBtn').disabled = false; return; }
    const stamp = new Date();
    lastHtml = buildReport(sections, stamp);
    setStatus(`Rapport prêt — ${sections.length} bloc(s), données au ${stamp.toLocaleString('fr-FR')}.`, false);
    el('preview').srcdoc = lastHtml;
    el('previewWrap').classList.add('show');
    el('downloadBtn').disabled = false;
    el('genBtn').disabled = false;
    el('preview').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function sectionInner(s) {
    if (!s.ok) return `<p class="r-unavail">⚠️ Données indisponibles (${esc(s.error)}).</p>`;
    const d = s.data;
    let h = '';
    if (d.stats && d.stats.length) {
      h += '<div class="r-stats">' + d.stats.map(st =>
        `<div class="r-stat"><div class="r-stat-val">${esc(st.value)}</div><div class="r-stat-lbl">${esc(st.label)}</div>${st.sub ? `<div class="r-stat-sub">${esc(st.sub)}</div>` : ''}</div>`).join('') + '</div>';
    }
    if (d.rows && d.rows.length) {
      h += '<table class="r-table">' + d.rows.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('') + '</table>';
    }
    if (d.note) h += `<p class="r-note">${esc(d.note)}</p>`;
    return h;
  }

  function buildReport(sections, stamp) {
    const secHtml = sections.map(s =>
      `<section class="r-section"><h2>${s.block.icon} ${esc(s.block.title)}</h2>${sectionInner(s)}</section>`).join('\n');
    // Rapport AUTONOME : CSS inline, polices système, aucune dépendance externe.
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport — ${esc(REPO.path || REPO.name)}</title>
<style>
:root{--ac:#7c5cff;--ac2:#2dd4bf;--ink:#1a1626;--mut:#6b6480;--line:#e7e3f0;--bg:#faf9fd;--card:#fff;}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.5}
.r-wrap{max-width:900px;margin:0 auto;padding:40px 28px 64px}
.r-head{border-bottom:3px solid var(--ac);padding-bottom:18px;margin-bottom:8px}
.r-brand{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ac);font-weight:700}
.r-title{font-size:26px;font-weight:800;margin:6px 0 4px}
.r-meta{font-size:13px;color:var(--mut)}
.r-meta code{background:#f0edf7;padding:1px 6px;border-radius:5px;font-size:12px}
.r-section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin-top:20px;page-break-inside:avoid}
.r-section h2{font-size:17px;margin:0 0 14px}
.r-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:6px}
.r-stat{background:#f7f5fc;border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.r-stat-val{font-size:22px;font-weight:800;color:var(--ac)}
.r-stat-lbl{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
.r-stat-sub{font-size:11px;color:var(--mut);margin-top:3px}
.r-table{width:100%;border-collapse:collapse;margin-top:12px}
.r-table th{text-align:left;font-size:12px;color:var(--mut);font-weight:600;padding:7px 10px;width:34%;vertical-align:top;border-top:1px solid var(--line)}
.r-table td{font-size:13px;padding:7px 10px;border-top:1px solid var(--line)}
.r-note{margin:12px 0 0;padding:10px 12px;background:#fff7e6;border:1px solid #f5e2b3;border-radius:8px;font-size:13px;color:#8a6d1f}
.r-unavail{color:#a13b3b;font-size:13px;margin:0}
.r-foot{margin-top:28px;padding-top:16px;border-top:1px solid var(--line);font-size:12px;color:var(--mut);text-align:center}
@media print{body{background:#fff}.r-section{border-color:#ddd}}
</style></head><body>
<div class="r-wrap">
  <div class="r-head">
    <div class="r-brand">Salsifi · DevOps Hub</div>
    <div class="r-title">Rapport — ${esc(REPO.name || REPO.path)}</div>
    <div class="r-meta">Dépôt <code>${esc(REPO.path || REPO.name)}</code> · Généré le ${esc(stamp.toLocaleString('fr-FR'))} · <b>données réelles au moment de la génération</b></div>
  </div>
  ${secHtml}
  <div class="r-foot">Généré par Salsifi — ${sections.length} bloc(s) · données GitLab en direct</div>
</div>
</body></html>`;
  }

  function download() {
    if (!lastHtml) return;
    const safe = (REPO.path || REPO.name || 'repo').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([lastHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `rapport-${safe}-${stamp}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function setStatus(msg, busy) {
    const s = el('status');
    s.innerHTML = (busy ? '<span class="spinner"></span>' : '') + esc(msg);
    s.classList.toggle('busy', !!busy);
  }

  // ── API publique (onclick) ──
  window.ReportBuilder = {
    generate, download,
    add(id) { if (!selected.includes(id)) selected.push(id); applySelection(false); },
    remove(id) { selected = selected.filter(x => x !== id); applySelection(false); },
    toggleAll() { selected = selected.length === BLOCKS.length ? [] : DEFAULT_ORDER.slice(); applySelection(false); },
  };

  // ── bootstrap ──
  async function init() {
    AUTH = S.loadAuth ? S.loadAuth() : null;
    if (!AUTH) return;
    const id = S.getRepoId ? S.getRepoId() : null;
    if (!id) { el('repoLine').textContent = 'Aucun repo sélectionné — ouvre le module depuis le hub (?repo=<id>).'; return; }
    REPO = { id };
    const p = await gjson(`/projects/${id}`);
    if (p) { REPO.name = p.name; REPO.path = p.path_with_namespace || p.name; REPO.defaultBranch = p.default_branch || 'main'; }
    else { REPO.name = 'repo #' + id; REPO.path = REPO.name; REPO.defaultBranch = 'main'; }
    el('repoLine').innerHTML = 'Dépôt : <code>' + esc(REPO.path) + '</code>';
    renderComposer();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
