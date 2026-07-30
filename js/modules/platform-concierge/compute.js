/* platform-concierge · compute.js — logique pure (calculs, helpers). */

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
