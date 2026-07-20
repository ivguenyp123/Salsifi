/*
 * Génère SALSI_CONSEILS.md depuis js/gaming-recipes.js (recettes) + les
 * métadonnées de badge (js/gaming.js). Reproductible : à relancer après toute
 * modif des recettes pour garder le markdown synchrone.
 *   node scripts/gen-salsi-conseils.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const recipes = require(path.join(root, 'js/gaming-recipes.js'));
const src = fs.readFileSync(path.join(root, 'js/gaming.js'), 'utf8');

// Extrait un champ string d'un badge, en gérant les apostrophes ÉCHAPPÉES
// (ex. criteria: 'Variables d\'environnement par env').
function field(id, key) {
    const i = src.indexOf("id: '" + id + "'");
    if (i < 0) return '';
    const win = src.slice(i, i + 1000);
    const m = win.match(new RegExp(key + ":\\s*'((?:\\\\.|[^'\\\\])*)'"));
    if (!m) return '';
    return m[1].replace(/\\(['"\\])/g, '$1'); // dé-échappe \' \" \\
}

// Convertit le HTML léger des recettes en markdown propre.
function md(s) {
    return String(s || '')
        .replace(/<\/?b>/g, '**').replace(/<code>/g, '`').replace(/<\/code>/g, '`')
        .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
}

// Bloc de code robuste : langage selon l'extension, et un fence assez long pour
// englober d'éventuels triple-backticks internes (ex. README contenant ```bash).
function codeBlock(content, filePath) {
    const lang = filePath && /\.md$/i.test(filePath) ? 'markdown' : 'yaml';
    const runs = content.match(/`+/g);
    const maxRun = runs ? Math.max.apply(null, runs.map(s => s.length)) : 0;
    const ticks = '`'.repeat(Math.max(3, maxRun + 1));
    return ticks + lang + '\n' + content.replace(/\n+$/, '') + '\n' + ticks;
}

const CATS = { delivery: '🚀 Delivery', quality: '🔍 Qualité & Revue', stability: '🛡️ Stabilité', hygiene: '🧹 Hygiène du dépôt', resilience: '🧠 Résilience', practices: '⚙️ Pratiques DevOps' };
const MODE = { 'create-file': '📄 fichier (MR)', 'template': '📋 modèle à coller', 'setting': '⚙️ réglage GitLab', 'coaching': '🧭 démarche' };

const ids = Object.keys(recipes);
const byCat = {};
for (const id of ids) { const c = field(id, 'category') || 'autre'; (byCat[c] = byCat[c] || []).push(id); }

let out = '# Salsi — Conseils par badge (à valider)\n\n';
out += 'Relis chaque conseil et coche-le quand il te va. Généré depuis `js/gaming-recipes.js` (fidèle à la prod). ' + ids.length + ' badges.\n\n';
out += '> Régénérer après modif des recettes : `node scripts/gen-salsi-conseils.js`\n';

for (const c of Object.keys(CATS)) {
    if (!byCat[c]) continue;
    out += '\n---\n\n## ' + CATS[c] + '\n';
    for (const id of byCat[c]) {
        const r = recipes[id];
        const name = field(id, 'name') || id;
        const crit = field(id, 'criteria');
        const tgt = field(id, 'target');
        out += '\n### ' + name + '  <sub>`' + id + '` · ' + (MODE[r.mode] || r.mode) + '</sub>\n\n';
        out += '- [ ] **Validé**\n';
        if (crit || tgt) out += '- **Objectif** : ' + md(crit) + (tgt ? ' (cible ' + md(tgt) + ')' : '') + '\n';
        if (r.why) out += '- **Pourquoi** : ' + md(r.why) + '\n';
        if (r.steps && r.steps.length) { out += '- **Comment on fait** :\n'; r.steps.forEach((s, i) => { out += '  ' + (i + 1) + '. ' + md(s) + '\n'; }); }
        if (r.module) out += '- **Outil qui aide** : ' + r.module.name + '\n';
        if (r.note) out += '- **Note** : ' + md(r.note) + '\n';
        if (r.template) out += '- **Modèle** :\n\n' + codeBlock(r.template, r.filePath) + '\n';
    }
}

fs.writeFileSync(path.join(root, 'SALSI_CONSEILS.md'), out);
console.log('SALSI_CONSEILS.md régénéré — ' + ids.length + ' badges, ' + out.length + ' octets');
