/* secrets-scanner · compute.js — logique pure (calculs, helpers). */

function parseMavenRanges(content) {
  const issues = []; let m;
  const rangeRe = /<version>\s*([\[\(][^<]+[\]\)])\s*<\/version>/g;
  while ((m = rangeRe.exec(content)) !== null) issues.push({ type: 'range', value: m[1] });
  const dynRe = /<version>\s*(LATEST|RELEASE|.*-SNAPSHOT)\s*<\/version>/g;
  while ((m = dynRe.exec(content)) !== null) issues.push({ type: 'dynamic', value: m[1] });
  return issues;
}

// Scan CIS d'UN repo. Renvoie { score, status, checks[], unverifiable }.
// checks[] : { id, cis, label, state: 'ok'|'ko'|'na'|'unverif', detail, fixable }
