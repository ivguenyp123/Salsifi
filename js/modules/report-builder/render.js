/* report-builder · render.js — rendu DOM. */

function getTree() {
  if (!REPO._tree) REPO._tree = gpage(`/projects/${REPO.id}/repository/tree?recursive=true`, { maxPages: 15 });
  return REPO._tree;
}

function renderComposer() {
  const avail = BLOCKS.filter(b => !selected.includes(b.id));
  el('palette').innerHTML = avail.length
    ? avail.map(b => cardHtml(b, 'palette')).join('')
    : '<div class="empty-hint">Tous les blocs sont dans le rapport.</div>';
  el('canvas').innerHTML = selected.length
    ? selected.map((id, i) => cardHtml(BLOCK_BY_ID[id], 'canvas', i)).join('')
    : '<div class="empty-hint drop-hint">Glisse un bloc ici (ou clique ＋) — ils seront générés dans cet ordre.</div>';
  el('genBtn').disabled = selected.length === 0;
  el('genCount').textContent = selected.length + ' bloc' + (selected.length > 1 ? 's' : '');
}


function cardHtml(b, zone, i) {
  const last = selected.length - 1;
  return `<div class="block-card ${zone}" data-id="${b.id}">
    <span class="bc-grip" title="Glisser pour déplacer">⋮⋮</span>
    <span class="bc-icon">${b.icon}</span>
    <div class="bc-body"><div class="bc-title">${esc(b.title)}</div><div class="bc-desc">${esc(b.desc)}</div></div>
    ${zone === 'canvas'
      ? `<span class="bc-ctrl">
           <button class="bc-mv" title="Monter" onclick="ReportBuilder.move('${b.id}',-1)" ${i === 0 ? 'disabled' : ''}>▲</button>
           <button class="bc-mv" title="Descendre" onclick="ReportBuilder.move('${b.id}',1)" ${i === last ? 'disabled' : ''}>▼</button>
           <button class="bc-x" title="Retirer" onclick="ReportBuilder.remove('${b.id}')">✕</button>
         </span>`
      : `<button class="bc-add" title="Ajouter au rapport" onclick="ReportBuilder.add('${b.id}')">＋</button>`}
  </div>`;
}

// Toute nouvelle sélection invalide le rapport déjà produit (sinon l'export
// resterait périmé) puis re-rend la liste.

function applySelection() { invalidate(); renderComposer(); }

// ══════════════════════════════════════════════════════════════════
//  DRAG & DROP maison (Pointer Events) — robuste, cross-navigateur.
//  Toute la zone « Mon rapport » est cible ; on peut déposer n'importe où
//  (haut, bas, entre deux). Pas de HTML5 draggable (trop fragile).
// ══════════════════════════════════════════════════════════════════

function setupDnd() {
  document.addEventListener('pointerdown', onDown);
}

function onDown(e) {
  if (e.button != null && e.button > 0) return;         // clic gauche / tactile
  const card = e.target.closest('.block-card');
  if (!card || e.target.closest('button')) return;      // laisse ＋ / ✕ / ▲▼ agir
  drag = { id: card.dataset.id, from: card.classList.contains('canvas') ? 'canvas' : 'palette', x0: e.clientX, y0: e.clientY, src: card, active: false, ghost: null, offX: 0, offY: 0 };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
}

function onMove(e) {
  if (!drag) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return; // seuil
    startGhost(e);
    drag.active = true;
    document.body.classList.add('dnd-active');
  }
  e.preventDefault();
  drag.ghost.style.left = (e.clientX - drag.offX) + 'px';
  drag.ghost.style.top = (e.clientY - drag.offY) + 'px';
  updateIndicator(e);
}

function onUp(e) {
  window.removeEventListener('pointermove', onMove);
  if (!drag) return;
  const wasActive = drag.active;
  const d = drag;
  cleanup();
  if (!wasActive) return;               // simple clic → rien
  resolveDrop(e, d);
}

function startGhost(e) {
  const r = drag.src.getBoundingClientRect();
  const g = drag.src.cloneNode(true);
  g.className = 'block-card block-ghost';
  g.style.width = r.width + 'px';
  drag.offX = e.clientX - r.left;
  drag.offY = e.clientY - r.top;
  g.style.left = (e.clientX - drag.offX) + 'px';
  g.style.top = (e.clientY - drag.offY) + 'px';
  document.body.appendChild(g);
  drag.ghost = g;
  drag.src.classList.add('is-src');
}

function inRect(x, y, r, padY) { padY = padY || 0; return x >= r.left && x <= r.right && y >= r.top - padY && y <= r.bottom + padY; }

function updateIndicator(e) {
  const canvas = el('canvas');
  const over = inRect(e.clientX, e.clientY, canvas.getBoundingClientRect(), 24);
  canvas.classList.toggle('drop-active', over);
  let line = document.getElementById('dropLine');
  if (!over) { if (line) line.remove(); return; }
  if (!line) { line = document.createElement('div'); line.id = 'dropLine'; line.className = 'drop-line'; }
  const ref = refCard(canvas, e.clientY, drag.id);
  if (ref) canvas.insertBefore(line, ref); else canvas.appendChild(line);
}

function refCard(canvas, y, excludeId) {
  const cards = [...canvas.querySelectorAll('.block-card')].filter(c => c.dataset.id !== excludeId);
  for (const c of cards) { const b = c.getBoundingClientRect(); if (y < b.top + b.height / 2) return c; }
  return null;
}

function resolveDrop(e, d) {
  const canvas = el('canvas'), palette = el('palette');
  const overCanvas = inRect(e.clientX, e.clientY, canvas.getBoundingClientRect(), 24);
  const overPalette = inRect(e.clientX, e.clientY, palette.getBoundingClientRect(), 24);
  if (overCanvas) {
    const arr = selected.filter(x => x !== d.id);
    const ref = refCard(canvas, e.clientY, d.id);
    const at = ref ? arr.indexOf(ref.dataset.id) : arr.length;
    arr.splice(at < 0 ? arr.length : at, 0, d.id);
    selected = arr;
    applySelection();
  } else if (d.from === 'canvas' && overPalette) {
    selected = selected.filter(x => x !== d.id);
    applySelection();
  } else {
    renderComposer(); // annulé : on restaure l'affichage
  }
}

function cleanup() {
  if (drag && drag.ghost) drag.ghost.remove();
  document.querySelectorAll('.block-card.is-src').forEach(c => c.classList.remove('is-src'));
  const line = document.getElementById('dropLine'); if (line) line.remove();
  el('canvas').classList.remove('drop-active');
  document.body.classList.remove('dnd-active');
  drag = null;
}

// ══════════════════════════════════════════════════════════════════
//  GÉNÉRATION DU RAPPORT (données réelles)
// ══════════════════════════════════════════════════════════════════

function invalidate() {
  genToken++;
  lastHtml = null;
  const d = el('downloadBtn'); if (d) d.disabled = true;
  const pw = el('previewWrap'); if (pw) pw.classList.remove('show');
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
  add(id) { if (!selected.includes(id)) selected.push(id); applySelection(); },
  remove(id) { selected = selected.filter(x => x !== id); applySelection(); },
  toggleAll() { selected = selected.length === BLOCKS.length ? [] : DEFAULT_ORDER.slice(); applySelection(); },
  move(id, dir) {
    const i = selected.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= selected.length) return;
    [selected[i], selected[j]] = [selected[j], selected[i]];
    applySelection();
  },
};

// ── bootstrap ──
