/* report-builder · compute.js — logique pure (calculs, helpers). */

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

