/* maturity · index.js — bootstrap : construction des données dérivées + câblage DOM (chargé en dernier). */



// Charger les questions du JSON (sauf sécurité qui reste à part)
for (const q of jsonData.questions) {
    QUESTIONS.push({
        id: q.id,
        cat: q.category,
        q: q.question,
        metric: q.metric ? q.metric.label : null
    });
    ADVICE[q.id] = q.advice;
}

QUESTIONS.forEach(q => { if (q.metric && METRIC_KEY_MAP[q.metric]) q.metric = METRIC_KEY_MAP[q.metric]; });

for (const sq of SECURITY_QUESTIONS) {
    QUESTIONS.push(sq);
    ADVICE[sq.id] = {
        non_conforme: "Activer le paramètre dans les settings GitLab",
        conforme: "Paramètre correct"
    };
}


// ============================================
// BOOTSTRAP — exécuté immédiatement (script en bas du body, DOM prêt)
// ============================================

if (!initAuth()) {
    // Redirect déjà déclenché, on stoppe l'exécution
    throw new Error('Auth required');
}


attachEventDelegation();


// Date par défaut (était en fin de fichier, déplacé ici pour clarté)
const inDateEl = document.getElementById('inDate');

if (inDateEl) inDateEl.value = new Date().toISOString().split('T')[0];


// Délégation d'événement : un seul listener attaché sur #actionsList,
// indépendant du contenu du texte (zéro souci d'échappement).
(function attachActionListDelegation() {
    const list = document.getElementById('actionsList');
    if (!list || list.dataset.delegated === '1') return;
    list.addEventListener('click', (e) => {
        if (e.target.closest('.ws-link')) return;   // laisse le lien atelier s'ouvrir sans (dé)sélectionner
        const item = e.target.closest('.action-item[data-aid]');
        if (!item || !list.contains(item)) return;
        const aid = item.dataset.aid;
        if (selectedActions.has(aid)) selectedActions.delete(aid);
        else selectedActions.add(aid);
        renderAccompaniments();
    });
    list.dataset.delegated = '1';
})();


document.getElementById('inDate').value = new Date().toISOString().split('T')[0];
