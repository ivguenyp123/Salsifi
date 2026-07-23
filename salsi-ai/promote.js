/*
 * Salsi — promote.js : boucle d'apprentissage (IA rédige → MR → tu valides)
 * ------------------------------------------------------------------
 * 1. Lit candidates.jsonl (paires question/réponse in-scope écrites par le back).
 * 2. Groupe par question, garde les RÉCURRENTES (≥ MIN_COUNT).
 * 3. L'IA (Vertex) DISTILLE chaque paire en entrée déterministe {t, kw, all?, a}.
 * 4. Dédup contre l'existant (formation + appris).
 * 5. Insère dans js/salsi/learned.js (au marqueur) et OUVRE UNE MR GitLab.
 *    → TOI tu relis le diff et tu merges. Rien ne part en prod sans ta validation.
 *
 * `node promote.js --dry-run` : fait tout SAUF la MR (affiche ce qui serait proposé).
 * `node promote.js`           : ouvre la MR (si GitLab configuré).
 *
 * Env : MIN_COUNT, CANDIDATES_FILE, PROMOTED_FILE, REPO_ROOT, LEARNED_PATH,
 *       FORMATION_PATH, GITLAB_URL, GITLAB_TOKEN, GITLAB_PROJECT, TARGET_BRANCH,
 *       + (pour distiller) GCP_PROJECT, GCP_LOCATION, VERTEX_MODEL, GOOGLE_APPLICATION_CREDENTIALS.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry-run');
const MIN_COUNT = parseInt(process.env.MIN_COUNT || '3', 10);
const CANDIDATES_FILE = process.env.CANDIDATES_FILE || './candidates.jsonl';
const PROMOTED_FILE = process.env.PROMOTED_FILE || './promoted.txt';
const REPO_ROOT = process.env.REPO_ROOT || path.join(__dirname, '..');
const LEARNED_PATH = process.env.LEARNED_PATH || 'js/salsi/learned.js';
const FORMATION_PATH = process.env.FORMATION_PATH || 'js/salsi/formation.js';
const MARKER = '/* __PROMOTE_INSERT__';

// GitLab
const GL = (process.env.GITLAB_URL || '').replace(/\/$/, '');
const TOKEN = process.env.GITLAB_TOKEN || '';
const PROJECT = encodeURIComponent(process.env.GITLAB_PROJECT || '');
const BASE = process.env.TARGET_BRANCH || 'main';

// Vertex (distillation) — optionnel : sans GCP, distilleur local naïf (dry-run/tests).
const GCP_PROJECT = process.env.GCP_PROJECT || '';
const GCP_LOCATION = process.env.GCP_LOCATION || 'europe-west9';
const VERTEX_MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-pro';

function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
// Mots vides : ni comme mots-cl\u00e9s, ni pour la d\u00e9dup (\u00e9vite les faux \u00ab d\u00e9j\u00e0 couvert \u00bb).
var STOP = { quoi: 1, comment: 1, est: 1, une: 1, des: 1, les: 1, pour: 1, avec: 1, dans: 1, mon: 1, mes: 1, ton: 1, tes: 1, sur: 1, que: 1, qui: 1, le: 1, la: 1, du: 1, de: 1, en: 1, et: 1, ou: 1, ce: 1, ca: 1, un: 1, se: 1, il: 1, elle: 1, on: 1, nous: 1, vous: 1, mais: 1, par: 1, aux: 1, ses: 1, son: 1, sont: 1, plus: 1, tout: 1 };
function sig(k) { return k.length >= 4 && !STOP[k]; }  // mot-cl\u00e9 significatif ?
function qq(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
function readRepo(p) { return fs.readFileSync(path.join(REPO_ROOT, p), 'utf8'); }

// ── Distillation : question + réponse validée → entrée déterministe ──
async function distill(q, a) {
    if (GCP_PROJECT) {
        try { return await distillVertex(q, a); } catch (e) { console.warn('[distill] Vertex échoué, repli local:', e.message); }
    }
    return distillLocal(q, a);
}
function distillLocal(q, a) {
    const toks = norm(q).split(' ').filter(w => w.length > 3 && !STOP[w]);
    const kw = Array.from(new Set([norm(q)].concat(toks.slice(0, 6)))).filter(Boolean);
    const t = q.trim().replace(/\s+/g, ' ').slice(0, 60);
    return { mod: 'auto', t: t.charAt(0).toUpperCase() + t.slice(1), kw, a: String(a) };
}
async function distillVertex(q, a) {
    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
    const token = (await (await auth.getClient()).getAccessToken()).token;
    const url = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/publishers/google/models/${VERTEX_MODEL}:generateContent`;
    const sys = "Tu transformes une paire (question, réponse validée) en UNE entrée de base de connaissance déterministe pour Salsi. "
        + "Renvoie STRICTEMENT ce JSON : {\"t\":\"titre court\",\"kw\":[\"6 à 10 formulations/variantes de la question, minuscules sans accents\"],\"all\":[\"0 à 2 mots-clés qui doivent TOUS être présents, ou []\"],\"a\":\"la réponse, HTML léger <b>/<br>, fidèle et concise\"}. "
        + "Ne change pas le sens de la réponse. Pas de texte hors JSON.";
    const body = {
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: `QUESTION:\n${q}\n\nRÉPONSE VALIDÉE:\n${a}` }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 700, responseMimeType: 'application/json' }
    };
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('Vertex ' + r.status);
    const j = await r.json();
    const txt = (((j.candidates || [])[0] || {}).content || {}).parts && j.candidates[0].content.parts[0].text || '{}';
    const o = JSON.parse(txt);
    return { mod: 'auto', t: String(o.t || q).slice(0, 80), kw: (o.kw || []).map(norm).filter(Boolean), all: (o.all || []).map(norm).filter(Boolean), a: String(o.a || a) };
}

// ── GitLab API ──
async function gl(method, ep, body) {
    const r = await fetch(`${GL}/api/v4${ep}`, { method, headers: { 'PRIVATE-TOKEN': TOKEN, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(`GitLab ${method} ${ep} → ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
}

function entryLiteral(e) {
    const all = (e.all && e.all.length) ? `, all: [${e.all.map(qq).join(', ')}]` : '';
    return `        { mod: 'auto', t: ${qq(e.t)}, kw: [${e.kw.map(qq).join(', ')}]${all}, a: ${qq(e.a)} },`;
}

async function main() {
    if (!fs.existsSync(CANDIDATES_FILE)) { console.log('Pas de', CANDIDATES_FILE); return; }
    const promoted = fs.existsSync(PROMOTED_FILE) ? new Set(fs.readFileSync(PROMOTED_FILE, 'utf8').split('\n').filter(Boolean)) : new Set();

    // 1-2. grouper par question, garder les récurrentes non déjà promues
    const groups = new Map();
    for (const line of fs.readFileSync(CANDIDATES_FILE, 'utf8').split('\n').filter(Boolean)) {
        let o; try { o = JSON.parse(line); } catch (e) { continue; }
        if (!o.qhash || promoted.has(o.qhash)) continue;
        const g = groups.get(o.qhash) || { q: o.q, a: o.a, count: 0 };
        g.count++; g.a = o.a; g.q = o.q; groups.set(o.qhash, g);
    }
    const eligible = [...groups.entries()].filter(([, g]) => g.count >= MIN_COUNT);
    if (!eligible.length) { console.log(`Aucune question récurrente (≥ ${MIN_COUNT}).`); return; }
    console.log(`${eligible.length} question(s) récurrente(s) ≥ ${MIN_COUNT}.`);

    // dédup : texte existant (formation + appris)
    const learnedSrc = readRepo(LEARNED_PATH);
    let existing = norm(learnedSrc);
    try { existing += ' ' + norm(readRepo(FORMATION_PATH)); } catch (e) { }

    const newEntries = []; const promotedHashes = [];
    for (const [hash, g] of eligible) {
        const e = await distill(g.q, g.a);
        if (!e.kw || !e.kw.length) { console.log('  ⏭️  sans mot-clé, ignoré :', g.q.slice(0, 60)); continue; }
        const already = e.kw.some(k => sig(k) && existing.indexOf(k) >= 0);
        if (already) { console.log('  ⏭️  déjà couvert :', e.t); promotedHashes.push(hash); continue; }
        newEntries.push(e); promotedHashes.push(hash);
        existing += ' ' + norm(e.kw.join(' '));
        console.log(`  ➕ « ${e.t} »  (${g.count}×, ${e.kw.length} mots-clés)`);
    }
    if (!newEntries.length) { console.log('Rien de nouveau à proposer (tout est déjà couvert).'); markPromoted(promotedHashes); return; }

    // 4. insérer au marqueur
    const idx = learnedSrc.indexOf(MARKER);
    if (idx < 0) throw new Error('Marqueur __PROMOTE_INSERT__ introuvable dans ' + LEARNED_PATH);
    const insertion = newEntries.map(entryLiteral).join('\n') + '\n';
    const newSrc = learnedSrc.slice(0, idx) + insertion + '        ' + learnedSrc.slice(idx);

    if (DRY || !GL || !TOKEN || !PROJECT) {
        console.log('\n--- DRY-RUN' + (GL ? '' : ' (GitLab non configuré)') + ' : entrées qui seraient ajoutées ---\n');
        console.log(insertion);
        return;
    }

    // 5. branche + commit + MR
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const branch = `salsi/auto-learn-${stamp}`;
    const baseInfo = await gl('GET', `/projects/${PROJECT}/repository/branches/${encodeURIComponent(BASE)}`);
    await gl('POST', `/projects/${PROJECT}/repository/branches?branch=${encodeURIComponent(branch)}&ref=${encodeURIComponent(baseInfo.commit.id)}`);
    await gl('POST', `/projects/${PROJECT}/repository/commits`, {
        branch, commit_message: `Salsi: apprend ${newEntries.length} entrée(s) (récurrentes en fallback IA)`,
        actions: [{ action: 'update', file_path: LEARNED_PATH, content: newSrc }]
    });
    const mr = await gl('POST', `/projects/${PROJECT}/merge_requests`, {
        source_branch: branch, target_branch: BASE, remove_source_branch: true,
        title: `Salsi apprend ${newEntries.length} réponse(s) — à valider`,
        description: `Rédigées par l'IA à partir de questions récurrentes tombées en fallback (≥ ${MIN_COUNT}×).\n\nRelis chaque entrée, ajuste si besoin, puis merge → elles passent en **déterministe** (0 IA la prochaine fois).\n\n` + newEntries.map(e => `- **${e.t}** (${e.kw.length} mots-clés)`).join('\n')
    });
    console.log(`\n✅ MR ouverte : ${mr.web_url}`);
    markPromoted(promotedHashes);
}

function markPromoted(hashes) {
    if (DRY || !hashes.length) return;
    try { fs.appendFileSync(PROMOTED_FILE, hashes.join('\n') + '\n'); } catch (e) { }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
