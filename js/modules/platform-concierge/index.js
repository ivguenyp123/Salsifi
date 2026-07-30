/* platform-concierge · index.js — entrée & câblage (chargé en dernier). */

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
