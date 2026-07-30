/* report-builder · index.js — entrée & câblage (chargé en dernier). */

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


const el = id => document.getElementById(id);


let drag = null;


let lastHtml = null;

let genToken = 0;

// Toute modif de la sélection périme le rapport déjà produit : on coupe le
// téléchargement et l'aperçu pour que l'export corresponde TOUJOURS à l'écran.

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
  setupDnd();
  renderComposer();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
