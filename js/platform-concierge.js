/*
 * Salsifi — Platform Concierge (nouveau service)
 * ==================================================================
 * Remplaçant conversationnel du pipeline-generator (le pipeline-generator
 * reste EN PLACE tant que ce service n'est pas validé). Assistant de
 * livraison gouverné : « livre en dev », « release en prod », « bump 2.0.5 »,
 * « coupe sonar »… — l'IA traduit, le noyau déterministe exécute, l'humain
 * garde le merge.
 *
 * ── Architecture 2 couches ────────────────────────────────────────
 *  ✨ Couche IA (« comprendre ») : phrase → intention structurée.
 *     Passe par un PROXY BACKEND (auth → token, Vault → creds Vertex).
 *     Si le proxy est absent/injoignable (mode local file://), on retombe
 *     sur un parseur regex déterministe (aucun réseau IA). L'IA n'est
 *     sollicitée que quand le repo l'exige (chaos / hétérogénéité).
 *  ⚙️ Noyau déterministe (« exécuter ») : lit les 3 sources de vérité,
 *     vérifie les invariants (cohérence, anti-fantôme, auto-bump), prépare
 *     le patch, crée branche + commit + MR via l'API GitLab. Ne merge JAMAIS.
 *     Ne touche JAMAIS la toolchain centrale (incluse, pas copiée).
 *
 * Contrat du proxy backend (à implémenter côté serveur) :
 *   POST {AI_PROXY}/parse   (credentials: 'include')
 *     body : { text, context:{ flow, pilot, chaos, branches:[{n,mr,mine,age,sem?}] } }
 *     → 200 { action, version|null, test|null, branchHint|null, confidence, human }
 *   Le backend authentifie la session, récupère le token GitLab (Vault),
 *   appelle Vertex, renvoie l'intention. Il n'expose jamais les creds.
 *
 * Chargé après la couche commune :
 *   <script src="js/common/utils.js"></script>
 *   <script src="js/common/gitlab.js"></script>
 *   <script src="js/common/auth.js"></script>
 *   <script src="js/platform-concierge.js"></script>
 */
(function () {
  'use strict';

  const S = window.Salsifi || {};
  const esc = S.escapeHtml || (s => String(s == null ? '' : s));
  const HUB_URL = 'hub.html';

  // ── Endpoint du proxy IA (injecté par le backend quand servi). En local, null. ──
  const AI_PROXY =
    window.SALSIFI_AI_PROXY ||
    (document.querySelector('meta[name="salsifi-ai-proxy"]') || {}).content ||
    null;

  // ══════════════════════════════════════════════════════════════════
  //  CONVENTIONS (LCL) — À AJUSTER À TA CONVENTION RÉELLE
  //  Où vivent les 3 sources de vérité d'une version, et comment on les
  //  patche. Isolé ici pour ne rien coder en dur dans le moteur.
  // ══════════════════════════════════════════════════════════════════
  const CONV = {
    // Environnement (dossier overlay) visé selon l'action.
    envForAction: { deliver_dev: 'development', deliver_uat: 'uat', release_prod: 'production' },
    // Branche cible d'une MR selon flow + action.
    target(flow, action, version) {
      if (action === 'release_prod') return 'main';
      if (flow === 'gitflow') return action === 'deliver_uat' ? 'release/' + version : 'develop';
      return 'main';
    },
    // Les 3 sources : fichier + regex de lecture + fabrique de remplacement.
    sources(env) {
      return [
        { id: 'IMAGE_TAG', file: '.gitlab-ci.yml',
          read: /(\bIMAGE_TAG\s*:\s*["']?)([^"'\s]+)(["']?)/,
          repl: (m, v) => m.replace(/(\bIMAGE_TAG\s*:\s*["']?)([^"'\s]+)(["']?)/, `$1${v}$3`) },
        { id: 'newTag', file: `Manifests/overlays/${env}/kustomization.yaml`,
          read: /(\bnewTag\s*:\s*["']?)([^"'\s]+)(["']?)/,
          repl: (m, v) => m.replace(/(\bnewTag\s*:\s*["']?)([^"'\s]+)(["']?)/, `$1${v}$3`) },
        { id: 'APP_VERSION', file: `Manifests/overlays/${env}/kustomization.yaml`,
          read: /(\bAPP_VERSION\s*[:=]\s*["']?)([^"'\s]+)(["']?)/,
          repl: (m, v) => m.replace(/(\bAPP_VERSION\s*[:=]\s*["']?)([^"'\s]+)(["']?)/, `$1${v}$3`) },
      ];
    },
    // Toolchain centrale — jamais modifiée (affichée comme verrouillée).
    toolchain: 'lcl/commun/devops/ci-cd',
  };

  // ── état module ──
  let AUTH = null, REPO = null, CTX = null;
  let lastPlan = null, lastIntent = null;

  // ══════════════════════════════════════════════════════════════════
  //  TRANSPORT GitLab (via couche commune)
  // ══════════════════════════════════════════════════════════════════
  function gjson(endpoint, init) { return S.gitlabJson(AUTH.gitlabUrl, AUTH.token, endpoint, init); }
  function gfetch(endpoint, init) { return S.gitlabFetch(AUTH.gitlabUrl, AUTH.token, endpoint, init); }
  function gpaginate(endpoint, opts) { return S.gitlabPaginate(AUTH.gitlabUrl, AUTH.token, endpoint, opts); }
  function jpost(endpoint, body) {
    return gfetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  // Lit un fichier texte à un ref donné ; null si absent (404).
  async function readFile(path, ref) {
    const j = await gjson(`/projects/${REPO.id}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`);
    if (!j || !j.content) return null;
    try { return decodeURIComponent(escape(atob(j.content))); } catch { try { return atob(j.content); } catch { return null; } }
  }

  // ══════════════════════════════════════════════════════════════════
  //  CONTEXTE REPO — détection déterministe (flow / pilotage / chaos)
  // ══════════════════════════════════════════════════════════════════
  async function loadContext() {
    const proj = await gjson(`/projects/${REPO.id}`);
    if (!proj) throw new Error('Projet GitLab introuvable ou accès refusé.');
    REPO.name = proj.name;
    REPO.path = proj.path_with_namespace || proj.name;
    REPO.defaultBranch = proj.default_branch || 'main';

    const branchesRaw = await gpaginate(`/projects/${REPO.id}/repository/branches`, { maxPages: 20 });
    // MR ouvertes → savoir quelles branches ont une MR
    const mrs = await gpaginate(`/projects/${REPO.id}/merge_requests?state=opened`, { maxPages: 10 });
    const mrSrc = new Set(mrs.map(m => m.source_branch));
    const me = AUTH.username;
    const branches = branchesRaw.map(b => ({
      n: b.name,
      mr: mrSrc.has(b.name),
      mine: !!(b.commit && b.commit.author_name && me && b.commit.author_name.includes(me)),
      committed: b.commit && b.commit.committed_date,
      default: !!b.default,
    }));

    const ci = await readFile('.gitlab-ci.yml', REPO.defaultBranch);
    const names = branches.map(b => b.n);
    const hasGitflow = names.some(n => /^(develop|release\/|hotfix\/)/.test(n));
    const hasFeature = names.some(n => /^feature\//.test(n));
    const flow = !ci ? '?' : (hasGitflow ? 'gitflow' : (hasFeature ? 'feature' : 'trunk'));
    // Pilotage : rules par contexte Git (gitflow) → 'git' ; variables DEPLOY_* → 'variables'
    const pilot = !ci ? '—' : (/\bDEPLOY_TO_\w+/.test(ci) ? 'variables' : (hasGitflow ? 'git' : 'variables'));
    const count = branches.length;
    const chaos = count > 60 ? 'high' : (count > 8 ? 'mid' : 'low');
    // L'IA n'est utile que quand la compréhension est non triviale.
    const aiNeeded = !ci || chaos === 'high' || (chaos === 'mid' && flow === 'gitflow');

    CTX = { flow, pilot, chaos, count, aiNeeded, hasCi: !!ci, ci, branches };
    return CTX;
  }

  // ══════════════════════════════════════════════════════════════════
  //  COUCHE IA — proxy Vertex (servi) OU fallback regex (local)
  // ══════════════════════════════════════════════════════════════════
  function regexParse(text) {
    const t = text.toLowerCase();
    const v = t.match(/(\d+\.\d+\.\d+)/);
    for (const k of ['sonar', 'newman', 'bruno', 'playwright']) {
      if (t.includes(k)) {
        const en = !/(coupe|désactive|desactive|retire|off|sans|inutile|pas de)/.test(t);
        return { action: 'toggle_test', test: k, enabled: en, version: null, branchHint: null,
          confidence: .97, human: (en ? 'Activer ' : 'Couper ') + k[0].toUpperCase() + k.slice(1) };
      }
    }
    let branchHint = null;
    const m = t.match(/(?:la branche (?:du|de la|de) |le (?:fix|correctif) (?:du |de la |de )?|livre (?:la branche )?)([a-zàâéèêî\s-]+?)(?: en | sur |$)/);
    if (m) branchHint = m[1].trim();
    if (/login|connexion|auth/.test(t)) branchHint = 'login';
    if (/dashboard|tableau/.test(t)) branchHint = 'dashboard';
    if (/prod|production/.test(t) && !/uat|recette/.test(t))
      return { action: 'release_prod', version: v ? v[1] : null, branchHint, test: null, enabled: null, confidence: .93, human: v ? ('Release ' + v[1] + ' en PRODUCTION') : 'Release en PRODUCTION' };
    if (/uat|recette|release/.test(t))
      return { action: 'deliver_uat', version: v ? v[1] : null, branchHint, test: null, enabled: null, confidence: .9, human: v ? ('Livrer ' + v[1] + ' en UAT') : 'Livrer en UAT' };
    if (/dev|livre|déploie|deploie/.test(t))
      return { action: 'deliver_dev', version: v ? v[1] : null, branchHint, test: null, enabled: null, confidence: .94, human: v ? ('Bumper ' + v[1] + ' et livrer en DEV') : 'Livrer en DEV' };
    if (/bump/.test(t))
      return { action: 'bump', version: v ? v[1] : null, branchHint: null, test: null, enabled: null, confidence: v ? .95 : .6, human: v ? ('Bump → ' + v[1]) : 'Bump (version manquante)' };
    return { action: 'unknown', confidence: .3, human: 'Intention non reconnue', branchHint: null, version: null, test: null, enabled: null };
  }

  async function parseIntent(text) {
    // Repo simple/connu → regex suffit, on n'appelle pas le modèle.
    if (AI_PROXY && CTX.aiNeeded) {
      try {
        const r = await fetch(AI_PROXY.replace(/\/$/, '') + '/parse', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, context: { flow: CTX.flow, pilot: CTX.pilot, chaos: CTX.chaos, branches: CTX.branches } }),
        });
        if (r.ok) { const j = await r.json(); if (j && j.action) return { _via: 'ia', ...j }; }
      } catch (e) { /* proxy injoignable → fallback */ }
    }
    return { _via: 'regex', ...regexParse(text) };
  }

  // ══════════════════════════════════════════════════════════════════
  //  NOYAU DÉTERMINISTE — résolution de branche
  // ══════════════════════════════════════════════════════════════════
  function resolveBranch(hint) {
    const real = CTX.branches;
    if (CTX.chaos === 'low') return { pick: real[0], alts: [], mode: 'unique', reasons: [] };
    const scored = real.map(b => {
      let s = 0; const reasons = [];
      if (hint && b.n.toLowerCase().includes(hint.toLowerCase())) { s += 60; reasons.push('nom contient « ' + hint + ' »'); }
      if (b.mr) { s += 30; reasons.push('MR ouverte'); }
      if (b.mine) { s += 15; reasons.push('tes commits'); }
      return { b, s, reasons };
    }).sort((a, b) => b.s - a.s);
    return { pick: scored[0].b, reasons: scored[0].reasons, alts: scored.slice(1, 6).map(x => x.b),
      mode: CTX.chaos === 'high' ? 'semantic' : 'sorted' };
  }

  function bumpPatch(ver) {
    const m = String(ver).match(/^(\d+)\.(\d+)\.(\d+)/);
    return m ? `${m[1]}.${m[2]}.${parseInt(m[3], 10) + 1}` : ver;
  }

  // ══════════════════════════════════════════════════════════════════
  //  NOYAU — construit le plan (lecture 3 sources + invariants + patch)
  // ══════════════════════════════════════════════════════════════════
  async function buildPlan(intent) {
    const plan = { steps: [], patch: [], diff: [], blocked: false, prodLock: false, branchRes: null, action: intent.action };

    if (intent.action === 'bump' && !intent.version) {
      plan.blocked = true; plan.steps.push(['warn', '<span class="warntxt">Version manquante</span> — précise « bump 2.0.5 ».']);
      return plan;
    }
    if (intent.action === 'toggle_test') return buildTogglePlan(intent, plan);

    const isDeliver = ['deliver_dev', 'deliver_uat', 'release_prod', 'bump'].includes(intent.action);
    if (!isDeliver) { plan.blocked = true; plan.steps.push(['warn', 'Action non prise en charge dans cette phase.']); return plan; }

    // Repo vierge : bootstrap CI (prochaine itération) — on ne devine pas.
    if (!CTX.hasCi) {
      plan.blocked = true;
      plan.steps.push(['warn', 'Aucun <code>.gitlab-ci.yml</code> détecté — l’amorçage de pipeline arrive dans une prochaine itération (modèle du catalogue).']);
      return plan;
    }

    // Résolution de branche (informative en delivery)
    if (['deliver_dev', 'deliver_uat', 'release_prod'].includes(intent.action)) {
      plan.branchRes = resolveBranch(intent.branchHint);
    }

    // ── Lecture des 3 sources de vérité ──
    const env = CONV.envForAction[intent.action] || 'development';
    const srcDefs = CONV.sources(env);
    const files = {}; // path → raw content (mémorisé une fois)
    const readings = [];
    for (const d of srcDefs) {
      if (!(d.file in files)) files[d.file] = await readFile(d.file, REPO.defaultBranch);
      const content = files[d.file];
      const mm = content && content.match(d.read);
      readings.push({ def: d, content, value: mm ? mm[2] : null });
    }
    const missing = readings.filter(r => r.value == null);
    if (missing.length) {
      plan.blocked = true;
      plan.steps.push(['warn', '<span class="warntxt">Sources illisibles</span> : ' +
        missing.map(r => '<code>' + r.def.id + '</code> (' + esc(r.def.file) + ')').join(', ') +
        ' — ajuste la convention (en-tête du service) ou vérifie le repo.']);
      return plan;
    }
    const vals = readings.map(r => r.value);
    const cur = vals[0];
    const aligned = vals.every(v => v === cur);
    plan.steps.push(['ok', '<b>Lecture</b> : ' + readings.map(r => '<code>' + r.def.id + '</code> ' + esc(r.value)).join(' · ')]);
    plan.steps.push(aligned
      ? ['ok', '<b>Cohérence</b> : les 3 sources alignées sur ' + esc(cur) + ' ✓']
      : ['warn', '<b>Cohérence</b> : <span class="warntxt">désalignement</span> — je réaligne toutes les sources sur la cible']);

    // ── Anti-fantôme + auto-bump ──
    let target = intent.version;
    if (target && target === cur) {
      plan.blocked = true;
      plan.steps.push(['warn', '<b>Anti-fantôme</b> : <span class="warntxt">' + esc(target) + ' est déjà la version courante</span> — Argo ne réconcilierait rien. Tu voulais bumper ?']);
      return plan;
    }
    if (!target) {
      target = bumpPatch(cur);
      plan.steps.push(['ok', '<b>Auto-bump</b> : pas de version précisée → patch ' + esc(cur) + ' → <code>' + esc(target) + '</code>']);
    }
    plan.steps.push(['ok', '<b>Anti-fantôme</b> : ' + esc(target) + ' ≠ ' + esc(cur) + ' → Argo réconciliera ✓']);
    plan.newVersion = target;

    // ── Branche résolue ──
    if (plan.branchRes && plan.branchRes.pick) {
      const tgt = CONV.target(CTX.flow, intent.action, target);
      plan.mrTarget = tgt;
      plan.steps.push(['ok', '<b>Cible</b> : <code>' + esc(plan.branchRes.pick.n) + '</code> → ' +
        (intent.action === 'release_prod' ? 'MR vers <code>main</code> (merge humain)' : 'MR vers <code>' + esc(tgt) + '</code>')]);
    } else {
      plan.mrTarget = CONV.target(CTX.flow, intent.action, target);
    }

    // ── Patch des sources (le geste vivant) : actions de commit + diff visuel ──
    const perFile = {};
    for (const r of readings) {
      const newContent = r.def.repl(files[r.def.file] || '', target);
      files[r.def.file] = newContent; // cumulatif si 2 clés dans le même fichier
      perFile[r.def.file] = newContent;
      plan.diff.push(['file', r.def.file + ' — ' + r.def.id]);
      plan.diff.push(['del', '-   ' + r.def.id + ': "' + r.value + '"']);
      plan.diff.push(['add', '+   ' + r.def.id + ': "' + target + '"']);
    }
    plan.patch = Object.keys(perFile).map(f => ({ action: 'update', file_path: f, content: perFile[f] }));

    plan.steps.push(['ok', '<b>GitLab</b> : lecture OK · patch préparé sur ' + plan.patch.length + ' fichier(s) du repo appelant ✓']);
    if (intent.action === 'release_prod') plan.prodLock = true;
    return plan;
  }

  async function buildTogglePlan(intent, plan) {
    if (!CTX.hasCi) { plan.blocked = true; plan.steps.push(['warn', 'Pas de <code>.gitlab-ci.yml</code> à éditer.']); return plan; }
    const key = 'ENABLE_' + intent.test.toUpperCase();
    const content = CTX.ci;
    const re = new RegExp('(\\b' + key + '\\s*:\\s*["\']?)(true|false)(["\']?)', 'i');
    const mm = content.match(re);
    const to = intent.enabled ? 'true' : 'false';
    plan.steps.push(['core', 'Éditer <code>' + key + '</code> dans le <b>.gitlab-ci.yml appelant</b> (jamais la toolchain).']);
    if (mm) {
      plan.diff.push(['file', '.gitlab-ci.yml'], ['del', '-   ' + key + ': "' + mm[2] + '"'], ['add', '+   ' + key + ': "' + to + '"']);
      plan.patch = [{ action: 'update', file_path: '.gitlab-ci.yml', content: content.replace(re, `$1${to}$3`) }];
    } else {
      plan.diff.push(['file', '.gitlab-ci.yml'], ['add', '+   ' + key + ': "' + to + '"   # variable ajoutée']);
      // insertion naïve : à raffiner selon la structure réelle du YAML
      plan.blocked = true;
      plan.steps.push(['warn', 'Variable <code>' + key + '</code> absente du fichier — insertion à confirmer (structure YAML à préciser).']);
    }
    plan.mrTarget = REPO.defaultBranch;
    plan.newVersion = null;
    plan.toggle = { key, to };
    return plan;
  }

  // ══════════════════════════════════════════════════════════════════
  //  EXÉCUTION — branche + commit + MR (jamais de merge)
  // ══════════════════════════════════════════════════════════════════
  async function execute(plan, intent) {
    if (!plan.patch.length) { toast('Rien à appliquer.'); return; }
    const slug = intent.action.replace(/_/g, '-') + (plan.newVersion ? '-' + plan.newVersion : (plan.toggle ? '-' + plan.toggle.key.toLowerCase() : ''));
    const branch = 'concierge/' + slug + '-' + Date.now().toString(36).slice(-4);
    const target = plan.mrTarget || REPO.defaultBranch;
    setBusy('Création de la branche + commit + MR…');
    try {
      // 1) branche depuis la branche par défaut
      let r = await gfetch(`/projects/${REPO.id}/repository/branches?branch=${encodeURIComponent(branch)}&ref=${encodeURIComponent(REPO.defaultBranch)}`, { method: 'POST' });
      if (!r.ok) throw new Error('création de branche refusée (' + r.status + ')');
      // 2) commit atomique des fichiers patchés
      const commitMsg = plan.toggle
        ? `ci: ${plan.toggle.to === 'true' ? 'active' : 'coupe'} ${plan.toggle.key}`
        : `chore(release): ${intent.action} → ${plan.newVersion}`;
      r = await jpost(`/projects/${REPO.id}/repository/commits`, {
        branch, commit_message: commitMsg,
        actions: plan.patch.map(a => ({ action: a.action, file_path: a.file_path, content: a.content })),
      });
      if (!r.ok) throw new Error('commit refusé (' + r.status + ')');
      // 3) MR (jamais mergée)
      const title = plan.toggle ? commitMsg : `[Concierge] ${intent.human} — ${plan.newVersion}`;
      r = await jpost(`/projects/${REPO.id}/merge_requests`, {
        source_branch: branch, target_branch: target, title,
        remove_source_branch: true,
        description: 'MR préparée par le Platform Concierge. Le merge reste ton geste.',
      });
      const mr = r.ok ? await r.json() : null;
      clearBusy();
      renderDone(plan, intent, mr, branch, target);
      toast('✓ Branche + commit + MR prêts — le merge reste ton geste');
    } catch (e) {
      clearBusy();
      toast('✗ ' + e.message);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════
  function el(id) { return document.getElementById(id); }

  function renderContextBanner() {
    const ai = CTX.aiNeeded
      ? '<span class="ai-badge ai-on">✨ IA active</span>'
      : '<span class="ai-badge ai-off">○ IA inactive</span>';
    const chaosCls = CTX.chaos === 'high' ? 'dv-chaos-high' : 'dv-chaos-low';
    el('detect').innerHTML =
      `<div class="detect-block"><span class="detect-label">Repo</span><span class="detect-val dv-flow">${esc(REPO.path)}</span></div>` +
      `<div class="detect-sep"></div>` +
      `<div class="detect-block"><span class="detect-label">Workflow</span><span class="detect-val dv-flow">${esc(CTX.flow)}</span></div>` +
      `<div class="detect-sep"></div>` +
      `<div class="detect-block"><span class="detect-label">Pilotage</span><span class="detect-val dv-pilot">${esc(CTX.pilot)}</span></div>` +
      `<div class="detect-sep"></div>` +
      `<div class="detect-block"><span class="detect-label">Branches</span><span class="detect-val ${chaosCls}">${CTX.count}</span></div>` +
      ai +
      `<div class="detect-why">↳ ${CTX.aiNeeded ? 'compréhension non triviale → couche IA sollicitée' + (AI_PROXY ? ' (proxy Vertex)' : ' — proxy absent, fallback regex local') : 'repo simple/connu → parsing regex, aucune IA'}</div>`;
  }

  function renderExamples() {
    const ex = CTX.flow === 'gitflow'
      ? ['livre en dev', 'prépare la release 1.8.0 en uat', 'release en prod', 'coupe sonar']
      : ['livre en dev', 'bump 2.0.5 et livre', 'active sonar'];
    el('examples').innerHTML = ex.map(e => `<span class="chip" onclick="Concierge.fill('${e.replace(/'/g, "\\'")}')">${e}</span>`).join('');
    el('prompt').placeholder = 'ex. ' + ex[0];
  }

  function stepsHtml(steps) {
    return '<div class="steps"><div class="steps-title">⚙️ Vérifications du noyau (déterministe)</div>' +
      steps.map((s, i) => `<div class="step ${s[0]}"><span class="step-num">${s[0] === 'warn' ? '!' : (s[0] === 'core' ? '✎' : i + 1)}</span><span class="step-text">${s[1]}</span></div>`).join('') +
      '</div>';
  }
  function diffHtml(diff) {
    if (!diff.length) return '';
    let h = '<div class="diff"><div class="diff-head">📝 Diff — fichiers du repo appelant</div>';
    diff.forEach(d => { h += d[0] === 'file' ? `<div class="diff-file">${esc(d[1])}</div>` : `<div class="diff-line ${d[0]}">${esc(d[1] || ' ')}</div>`; });
    h += `<div class="locked-file">🔒 toolchain ${esc(CONV.toolchain)} — incluse, jamais modifiée</div></div>`;
    return h;
  }
  function attestHtml(intent, plan) {
    const via = intent._via === 'ia';
    const conf = Math.round((intent.confidence || 0) * 100);
    const ai = via
      ? [['yes', 'A traduit ta phrase en intention <code>{action:"' + intent.action + '"' + (intent.version ? ', version:"' + intent.version + '"' : '') + '}</code>']]
      : [['no', '<b>Inactive</b> — une regex a suffi, le modèle n’a pas été appelé']];
    ai.push(['no', 'N’a lu aucun fichier, rien écrit, rien mergé, rien déployé']);
    const core = [['yes', 'A lu les 3 sources de vérité']];
    const checks = plan.steps.filter(s => s[0] === 'ok' || s[0] === 'warn').length;
    if (checks) core.push(['yes', 'A vérifié ' + checks + ' invariant(s) déterministe(s)']);
    if (plan.patch && plan.patch.length) core.push(['yes', 'A préparé le patch sur ' + plan.patch.length + ' fichier(s) appelant(s)']);
    core.push(['no', 'N’a jamais touché la toolchain centrale']);
    core.push(['no', plan.blocked ? 'N’a rien lancé — bloqué par un invariant' : 'Ne mergera PAS — geste rendu à l’humain sur GitLab']);
    const col = (cls, head, rows) => `<div class="attest-col ${cls}"><div class="attest-col-head">${head}</div>` +
      rows.map(x => `<div class="attest-li"><span class="mk ${x[0]}">${x[0] === 'yes' ? '✓' : '✕'}</span><span>${x[1]}</span></div>`).join('') + '</div>';
    const net = via ? 'Réseau IA : 1 appel proxy (Vertex), aucune écriture' : 'Aucun appel modèle sur tout le geste';
    return '<div class="attest"><div class="attest-head"><span class="shield">🛡️</span>Périmètre d’exécution — qui a fait quoi</div><div class="attest-cols">' +
      col('ai', '✨ Couche IA' + (via ? ' · confiance ' + conf + '%' : ''), ai) +
      col('core', '⚙️ Noyau déterministe', core) +
      `</div><div class="attest-foot">L’IA traduit l’intention · le noyau gouverne chaque geste<span class="net">${net}</span></div></div>`;
  }

  function render(intent, plan) {
    const r = el('result');
    if (intent.action === 'unknown') {
      r.innerHTML = '<div class="intent-card"><div class="intent-understood">Je n’ai pas compris</div><div class="intent-phrase">Reformule, ou clique un exemple.</div></div>';
      r.classList.add('show'); return;
    }
    const conf = Math.round((intent.confidence || 0) * 100);
    const confColor = conf >= 90 ? 'var(--ok)' : conf >= 70 ? 'var(--warn)' : 'var(--err)';
    const intentCard =
      `<div class="intent-card"><div class="intent-head"><div><div class="intent-understood">J’ai compris</div><div class="intent-phrase">${esc(intent.human)}</div></div>` +
      `<div class="confidence"><div class="confidence-val" style="color:${confColor}">${conf}%</div><div class="confidence-label">confiance</div></div></div>` +
      `<div class="intent-grid">` +
        `<div class="intent-field"><div class="intent-field-label">action</div><div class="intent-field-val">${esc(intent.action)}</div></div>` +
        `<div class="intent-field"><div class="intent-field-label">version</div><div class="intent-field-val ${intent.version ? '' : 'muted'}">${esc(intent.version || 'null')}</div></div>` +
        `<div class="intent-field"><div class="intent-field-label">test</div><div class="intent-field-val ${intent.test ? '' : 'muted'}">${esc(intent.test || 'null')}</div></div>` +
      `</div></div>`;

    let confirm;
    if (plan.blocked) {
      confirm = '<div class="confirm-row"><button class="btn btn-block" disabled>⛔ Rien à faire</button><button class="btn btn-adjust" onclick="document.getElementById(\'prompt\').focus()">✏️ Reformuler</button></div>';
    } else if (plan.prodLock) {
      confirm = '<div class="prod-lock"><span class="prod-lock-icon">🔒</span><div class="prod-lock-text"><b>Le merge sur main reste humain.</b> Le Concierge prépare la MR et la vérifie ; c’est toi qui déclenches la prod sur GitLab.</div></div>' +
        '<div class="confirm-row"><button class="btn btn-confirm" onclick="Concierge.exec()">✓ Préparer la MR de release</button></div>';
    } else {
      confirm = '<div class="confirm-row"><button class="btn btn-confirm" onclick="Concierge.exec()">✅ Préparer branche + commit + MR</button><button class="btn btn-adjust" onclick="Concierge.fill(document.getElementById(\'prompt\').value)">↻ Recalculer</button></div>';
    }
    r.innerHTML = intentCard + stepsHtml(plan.steps) + diffHtml(plan.diff) + attestHtml(intent, plan) + confirm;
    r.classList.add('show');
    r.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderDone(plan, intent, mr, branch, target) {
    const link = mr && mr.web_url;
    el('result').innerHTML =
      '<div class="prod-lock" style="background:rgba(52,211,153,.07);border-color:rgba(52,211,153,.3)"><span class="prod-lock-icon">✅</span>' +
      `<div class="prod-lock-text" style="color:#9ff0d4"><b>MR prête.</b> Branche <code>${esc(branch)}</code> → <code>${esc(target)}</code>. ` +
      (link ? `<a href="${esc(link)}" target="_blank" rel="noopener" style="color:var(--deliver);font-weight:700">Ouvrir la MR sur GitLab →</a>` : 'MR créée.') +
      ' Le merge reste ton geste.</div></div>';
    el('result').classList.add('show');
  }

  // ── busy / toast ──
  function setBusy(txt) { const t = el('thinking'); el('thinkingText').textContent = txt; t.classList.add('show'); }
  function clearBusy() { el('thinking').classList.remove('show'); }
  function toast(m) { const e = el('toast'); e.textContent = m; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 2800); }

  // ══════════════════════════════════════════════════════════════════
  //  ORCHESTRATION
  // ══════════════════════════════════════════════════════════════════
  async function run() {
    const text = el('prompt').value.trim();
    if (!text) return;
    el('result').classList.remove('show');
    setBusy(CTX.aiNeeded ? 'La couche IA lit le repo et comprend ta phrase…' : 'Parsing déterministe (pas d’IA sur ce repo)…');
    const intent = await parseIntent(text);
    lastIntent = intent;
    if (intent.action === 'unknown') { clearBusy(); render(intent, {}); return; }
    const plan = await buildPlan(intent);
    lastPlan = plan;
    clearBusy();
    render(intent, plan);
  }

  const Concierge = {
    run,
    fill(t) { el('prompt').value = t; run(); },
    exec() { if (lastPlan && !lastPlan.blocked && lastIntent) execute(lastPlan, lastIntent); },
  };
  window.Concierge = Concierge;

  // ── bootstrap ──
  async function init() {
    AUTH = S.loadAuth ? S.loadAuth() : null;
    if (!AUTH) return; // loadAuth redirige vers login
    const id = S.getRepoId ? S.getRepoId() : null;
    if (!id) { el('detect').innerHTML = '<div class="detect-why">Aucun repo sélectionné. Ouvre le service depuis le hub (<code>?repo=&lt;id&gt;</code>).</div>'; return; }
    REPO = { id };
    setBusy('Lecture du repo…');
    try {
      await loadContext();
      clearBusy();
      renderContextBanner();
      renderExamples();
      el('prompt').addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    } catch (e) {
      clearBusy();
      el('detect').innerHTML = `<div class="detect-why">✗ ${esc(e.message)}</div>`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
