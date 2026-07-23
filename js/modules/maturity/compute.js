/* maturity · compute.js — logique pure : scoring, sélection de questions, helpers. */



function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }


function escapeAttr(v) { return window.Salsifi.escapeAttr(v); }


function getAdvice(qid, level) {
    const a = ADVICE[qid];
    if (!a) return null;
    if (a[level]) return a[level];
    if (level === 'non_conforme' && a.non_conforme) return a.non_conforme;
    if (level === 'conforme' && a.conforme) return a.conforme;
    return a[3] || null;
}


function getCatQuestions(catId) {
    return QUESTIONS.filter(q => q.cat === catId && !q.dataOnly);
}


function getAllQuestions() {
    return QUESTIONS.filter(q => !q.dataOnly);
}


function declScoreForCat(catId) {
    const cat = CATEGORIES.find(c => c.id === catId);
    if (cat?.type === 'data_only') return null;
    const qs = getCatQuestions(catId);
    const vals = qs.map(q => answers[q.id]).filter(Boolean);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length/5*100);
}


function dataScoreForCat(catId) {
    // On inclut les questions `dataOnly` (ex. la catégorie Sécurité X01-X05, jamais
    // posées dans le quiz mais toutes issues de métriques GitLab) : getCatQuestions
    // les exclut, ce qui rendait le pilier data Sécurité toujours nul.
    const qs = QUESTIONS.filter(q => q.cat === catId && q.metric);
    if (!qs.length) return null;
    const scored = qs.filter(q => GITLAB_DATA[q.metric]?.score != null);
    if (!scored.length) return null;
    return Math.round(scored.reduce((s,q) => s + GITLAB_DATA[q.metric].score, 0) / scored.length);
}
