/* insights · render.js — rendu DOM. */

function showError(msg) {
    document.getElementById('loadingContainer').style.display = 'none';
    document.getElementById('errorContainer').innerHTML =
        `<div class="error-message">❌ ${msg}</div>`;
}


// ════════════════════════════════════════════════════════════
//  CALCUL DORA MAISON
// ════════════════════════════════════════════════════════════

/*
 * Niveau + présentation (barre et écart à l'Elite).
 *
 * Les SEUILS viennent de js/common/dora-standard.js — source unique. Ce fichier en
 * redéfinissait sa propre copie, et elle avait dérivé : le lead time y était noté
 * Elite jusqu'à 24 h alors que la référence DORA Accelerate place Elite à 1 h. Un cran
 * entier d'écart avec le hub, sur le même dépôt, malgré un commentaire affirmant
 * l'alignement. C'est précisément ce qu'une source unique empêche.
 */
function doraLevel(metric, value) {
    if (value === null || value === undefined) return { level: 'N/A', cls: '', pct: 0, gap: null };

    const D = window.Salsifi.dora;
    const level = D.level(metric, value);
    if (!level) return { level: 'N/A', cls: '', pct: 0, gap: null };

    const PCT = { Elite: 100, High: 70, Medium: 40, Low: 15 };
    const target = D.THRESHOLDS[metric].elite;

    let gap = null;
    if (level !== 'Elite') {
        if (metric === 'df')       gap = `+${(target - value).toFixed(1)} deploy/sem pour Elite`;
        else if (metric === 'cfr') gap = `${(value - target).toFixed(0)}% à réduire pour Elite`;
        else                       gap = `${(value - target).toFixed(0)}h à réduire pour Elite`;
    }

    return { level, cls: level.toLowerCase(), pct: PCT[level], gap };
}

// ════════════════════════════════════════════════════════════
//  RENDER DORA CARDS
// ════════════════════════════════════════════════════════════

function renderDoraCards(v) {
    const state = {};

    function renderCard(id, metric, value, displayVal, naReason, trendHtml) {
        const lvl = doraLevel(metric, value);
        state[metric] = value;
        state[metric + 'Level'] = lvl;

        const valEl  = document.getElementById(id);
        const badgeEl= document.getElementById(id + '-badge');
        const progEl = document.getElementById(id + '-progress');
        const actEl  = document.getElementById(id + '-action');

        valEl.innerHTML = displayVal + (trendHtml || '');

        if (lvl.level === 'N/A') {
            badgeEl.innerHTML = naReason
                ? `<div class="na-reason">${naReason}</div>`
                : '<span class="dora-badge">N/A</span>';
            if (progEl) progEl.innerHTML = '';
            if (actEl) actEl.classList.remove('show');
            return;
        }
        const icons = { Elite: '🟢', High: '🔵', Medium: '🟡', Low: '🔴' };
        badgeEl.innerHTML = `<span class="dora-badge ${lvl.cls}">${icons[lvl.level]} ${lvl.level}</span>`;

        if (lvl.gap) {
            progEl.innerHTML = `
                <div class="elite-bar"><div class="elite-fill ${lvl.cls}" style="width:${lvl.pct}%"></div></div>
                <div class="elite-msg"><strong>${lvl.gap}</strong></div>`;
            if (actEl) actEl.classList.add('show');
        } else {
            progEl.innerHTML = `
                <div class="elite-bar"><div class="elite-fill elite" style="width:100%"></div></div>
                <div class="elite-msg">🏆 <strong>Niveau Elite atteint !</strong></div>`;
            if (actEl) actEl.classList.remove('show');
        }
    }

    // DF — affichage /sem
    const dfDisplay = v.df !== null ? `${v.df}/sem` : 'N/A';
    renderCard('deployFrequency', 'df', v.df, dfDisplay);

    // LT — affichage heures ou jours
    let ltDisplay = 'N/A';
    if (v.lt !== null) {
        ltDisplay = v.lt >= 24 ? `${(v.lt / 24).toFixed(1)}j` : `${v.lt}h`;
    }
    renderCard('leadTime', 'lt', v.lt, ltDisplay);

    // CFR
    const cfrDisplay = v.cfr !== null ? `${v.cfr}%` : 'N/A';

    // ── Tendance récente (honnête, sans écraser le badge) ──
    // Le badge, le % de la carte, le résumé DORA et les quick-wins reflètent TOUS le même
    // CFR de la fenêtre (v.cfr). Avant, un « plancher de tendance » gonflait en silence le
    // badge/niveau (badge Elite sur un chiffre affiché à 12 %, et 3 valeurs différentes
    // entre la carte, le résumé DORA et les quick-wins). Si la fenêtre récente (5j) est à
    // un meilleur niveau DORA, on l'annonce désormais EXPLICITEMENT à côté du badge.
    let cfrRecentNote = '';
    if (v.cfr !== null && v.cfr5 !== null) {
        const order = { 'low': 0, 'medium': 1, 'high': 2, 'elite': 3 };
        const lvl5 = doraLevel('cfr', v.cfr5);
        const lvlFinal = doraLevel('cfr', v.cfr);
        if (order[lvl5.cls] > order[lvlFinal.cls]) {
            cfrRecentNote = ` <span style="color:#6ee7b7;font-size:12px">· tendance 5j : ${lvl5.level}</span>`;
        }
    }

    const cfrWindows = v.cfr !== null ? `
        <div style="display:flex;gap:10px;margin-top:8px;margin-bottom:4px">
            <div style="flex:1;background:var(--ov-08);border-radius:8px;padding:6px 10px;text-align:center">
                <div style="font-size:10px;opacity:0.6;margin-bottom:2px">30j</div>
                <div style="font-size:14px;font-weight:700;color:#fca5a5">${v.cfr30 !== null ? v.cfr30+'%' : 'N/A'}</div>
            </div>
            <div style="flex:1;background:var(--ov-08);border-radius:8px;padding:6px 10px;text-align:center">
                <div style="font-size:10px;opacity:0.6;margin-bottom:2px">10j</div>
                <div style="font-size:14px;font-weight:700;color:#fca5a5">${v.cfr10 !== null ? v.cfr10+'%' : '—'}</div>
            </div>
            <div style="flex:1;background:var(--ov-08);border-radius:8px;padding:6px 10px;text-align:center">
                <div style="font-size:10px;opacity:0.6;margin-bottom:2px">5j</div>
                <div style="font-size:14px;font-weight:700;color:#fca5a5">${v.cfr5 !== null ? v.cfr5+'%' : '—'}</div>
            </div>
        </div>` : '';
    const cfrTrendHtml = (v.cfrTrend === 'down'   ? ' <span style="color:#6ee7b7;font-size:13px">↘️ en amélioration</span>'
                        : v.cfrTrend === 'up'     ? ' <span style="color:#fca5a5;font-size:13px">↗️ en dégradation</span>'
                        : v.cfrTrend === 'stable' ? ' <span style="opacity:0.5;font-size:13px">→ stable</span>'
                        : '') + cfrRecentNote + cfrWindows;
    const cfrNaReason = v.cfr === null
        ? (v.cfrInsufficient
            ? `⚠️ Pas assez de livraisons sur main/master (${v.totalP} pipeline${v.totalP > 1 ? 's' : ''})`
            : '⚪ Aucun pipeline sur main/master')
        : null;
    renderCard('failureRate', 'cfr', v.cfr, cfrDisplay, cfrNaReason, cfrTrendHtml);

    // MTTR
    const mttrDisplay = v.mttr !== null ? (v.mttr >= 24 ? `${(v.mttr / 24).toFixed(1)}j` : `${v.mttr}h`) : '—';
    const mttrNaReason = v.mttr === null
        ? (v.mttrInsufficient
            ? `⚠️ Pas assez de livraisons sur main/master (${v.prodPipelines30Length || 0} pipeline${(v.prodPipelines30Length || 0) > 1 ? 's' : ''})`
            : (v.totalP === 0
                ? '⚪ Aucun pipeline sur 30j'
                : '✅ Aucun échec pipeline détecté sur 30j'))
        : null;
    renderCard('restoreTime', 'mttr', v.mttr, mttrDisplay, mttrNaReason);

    // Stocker des flags supplémentaires pour le score global
    state._mttrMissing = v.mttr === null;
    state._mttrInsufficient = v.mttrInsufficient;
    state._dfMissing = v.df === null;
    state._ltMissing = v.lt === null;
    state._cfrMissing = v.cfr === null;

    return state;
}

// ════════════════════════════════════════════════════════════
//  SCORE GLOBAL — CORRIGÉ avec gestion correcte du MTTR
// ════════════════════════════════════════════════════════════

function renderGlobalScore(state) {
    const levels = { elite: 100, high: 70, medium: 40, low: 15 };

    const allMetrics = [
        { key: 'df',   label: '🚀 Deploy Freq',  lvl: state.dfLevel,   missing: state._dfMissing   },
        { key: 'lt',   label: '⚡ Lead Time',     lvl: state.ltLevel,   missing: state._ltMissing   },
        { key: 'cfr',  label: '🔧 CFR',           lvl: state.cfrLevel,  missing: state._cfrMissing  },
        { key: 'mttr', label: '⏱️ TTRS',          lvl: state.mttrLevel, missing: state._mttrMissing }
    ];

    const validScores = allMetrics.filter(s => s.lvl && s.lvl.cls);
    const missingMetrics = allMetrics.filter(s => s.missing);

    // Si aucune métrique disponible
    if (validScores.length === 0) {
        document.getElementById('scoreCircle').style.borderColor = '#6b7280';
        document.getElementById('scoreValue').textContent = '—';
        document.getElementById('scoreLevelTitle').textContent = '⚪ Score indisponible';
        document.getElementById('scoreDesc').textContent = 'Aucune donnée suffisante pour calculer un score DORA. Vérifiez vos pipelines et merge requests sur 30 jours.';
        document.getElementById('scoreBreakdown').innerHTML = '';
        return { score: null, cls: null };
    }

    let avg = Math.round(validScores.reduce((s, m) => s + (levels[m.lvl.cls] || 0), 0) / validScores.length);

    // ── PÉNALITÉ MTTR ──
    // Si MTTR est manquant, le score est plafonné à 75 et le niveau "Elite" est interdit
    const mttrIsMissing = state._mttrMissing;
    const penaltyApplied = mttrIsMissing && validScores.length >= 1;
    let finalCls = '';
    let penaltyMessage = '';

    if (penaltyApplied) {
        avg = Math.min(avg, 75);
        const rawCls = avg >= 85 ? 'elite' : avg >= 60 ? 'high' : avg >= 35 ? 'medium' : 'low';
        // Rétrograder d'un cran si Elite
        if (rawCls === 'elite') {
            finalCls = 'high';
            penaltyMessage = '⚠️ Score plafonné à High : les données MTTR sont insuffisantes pour évaluer la résilience. Configurez vos pipelines main/master pour collecter cette métrique.';
        } else {
            finalCls = rawCls;
            penaltyMessage = '⚠️ Score potentiellement surévalué : données MTTR manquantes.';
        }
    } else {
        finalCls = avg >= 85 ? 'elite' : avg >= 60 ? 'high' : avg >= 35 ? 'medium' : 'low';
    }

    // ── PÉNALITÉ AUTRES MÉTRIQUES ──
    // Si plus d'une métrique manquante, score plafonné à 50
    if (missingMetrics.length >= 2) {
        avg = Math.min(avg, 50);
        finalCls = avg >= 60 ? 'high' : avg >= 35 ? 'medium' : 'low';
        if (penaltyMessage) penaltyMessage += ' ';
        penaltyMessage += `⚠️ ${missingMetrics.length} métriques manquantes sur 4 — score limité.`;
    }

    const circle = document.getElementById('scoreCircle');
    const scoreColors = { elite: '#10b981', high: '#3b82f6', medium: '#f59e0b', low: '#ef4444' };
    circle.style.borderColor = scoreColors[finalCls] || '#6b7280';
    document.getElementById('scoreValue').textContent = avg;

    const titles = {
        elite: '🏆 Elite Performer',
        high: '✅ High Performer',
        medium: '📈 Medium Performer',
        low: '⚠️ Low Performer'
    };
    const descs = {
        elite: 'Votre équipe délivre avec excellence. Continuez à surveiller la stabilité.',
        high: 'Bonne performance. Quelques optimisations pour atteindre le niveau Elite.',
        medium: 'Marge de progression significative. Les Quick Wins ci-dessous vous guident.',
        low: 'Des améliorations urgentes sont nécessaires. Commencez par les actions critiques.'
    };

    let titleHtml = titles[finalCls] || '—';
    if (penaltyApplied) {
        titleHtml += ' <span style="background:rgba(239,68,68,0.2);color:#fca5a5;padding:2px 8px;border-radius:8px;font-size:11px;margin-left:8px">⚠️ MTTR manquant</span>';
    }

    document.getElementById('scoreLevelTitle').innerHTML = titleHtml;
    document.getElementById('scoreDesc').textContent = penaltyMessage || descs[finalCls] || '';

    // ── Breakdown avec TOUTES les métriques (y compris les manquantes) ──
    const breakdownHtml = allMetrics.map(m => {
        const lvl = m.lvl;
        const pct = lvl && lvl.cls ? (levels[lvl.cls] || 0) : 0;
        const color = lvl && lvl.cls ? scoreColors[lvl.cls] : '#6b7280';
        const levelName = lvl && lvl.level ? lvl.level : 'N/A';
        const missingBadge = m.missing ? ' <span style="font-size:10px;opacity:0.6">(données insuffisantes)</span>' : '';

        return `<div class="score-row">
            <span class="score-row-label">${m.label}${missingBadge}</span>
            <div class="score-row-bar"><div class="score-row-fill" style="width:${m.missing ? 0 : pct}%;height:100%;border-radius:3px;background:${color}"></div></div>
            <span class="score-row-val" style="color:${color}">${levelName}</span>
        </div>`;
    }).join('');
    document.getElementById('scoreBreakdown').innerHTML = breakdownHtml;

    return { score: avg, cls: finalCls };
}

// ════════════════════════════════════════════════════════════
//  COMPAGNON TEMPOREL DORA  (même système que le gaming :
//  snapshot → journal → régime → trajectoire → voix ; 0 IA, déterministe)
// ════════════════════════════════════════════════════════════

function esc(s) { return (window.Salsifi && window.Salsifi.escapeHtml) ? window.Salsifi.escapeHtml(String(s)) : String(s); }

function doraFrDate(at) {
    const M = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const p = String(at).split('-'); if (p.length < 3) return at;
    return parseInt(p[2], 10) + ' ' + (M[parseInt(p[1], 10) - 1] || '');
}

function doraFmt(metric, v) {
    if (v == null) return '—';
    if (metric === 'df') return v + '/sem';
    if (metric === 'cfr') return v + '%';
    // lt / mttr en heures → jours si ≥24
    return v >= 24 ? (v / 24).toFixed(1) + 'j' : v + 'h';
}

function doraEvIcon(ev) {
    if (ev.type === 'level-up' || ev.type === 'score-up') return '⬆️';
    if (ev.type === 'level-down' || ev.type === 'score-down') return '⬇️';
    if (ev.type === 'record') return '🏅';
    if (ev.type === 'regression') return '⚠️';
    return '•';
}

function doraEvText(ev) {
    if (ev.kind === 'dora') {
        const m = DORA_META[ev.metric] || { emoji: '•', label: ev.metric };
        const verb = ev.type === 'level-up' ? 'monte' : 'retombe';
        const cls = ev.type === 'level-up' ? 'up' : 'down';
        return `${m.emoji} <b>${esc(m.label)}</b> ${verb} <span class="dc-lvl ${cls}">${esc(ev.from)} → ${esc(ev.to)}</span>`;
    }
    if (ev.kind === 'score') {
        const names = { low: 'Low', medium: 'Medium', high: 'High', elite: 'Elite' };
        const cls = ev.type === 'score-up' ? 'up' : 'down';
        return `🎯 <b>Niveau DORA global</b> <span class="dc-lvl ${cls}">${names[ev.from] || ev.from} → ${names[ev.to] || ev.to}</span>`;
    }
    // métrique : record / régression
    const m = DORA_META[ev.metric] || { emoji: '•', label: ev.metric };
    if (ev.type === 'record') return `${m.emoji} <b>${esc(m.label)}</b> : nouveau record — ${esc(doraFmt(ev.metric, ev.value))}`;
    return `${m.emoji} <b>${esc(m.label)}</b> se dégrade : ${esc(doraFmt(ev.metric, ev.prev))} → ${esc(doraFmt(ev.metric, ev.value))}`;
}


function renderDoraCompanion(vals, state, scoreInfo) {
    const cont = document.getElementById('doraCompanion');
    const DH = window.Salsifi && window.Salsifi.doraHistory;
    if (!cont || !DH) return;

    const today = new Date().toISOString().slice(0, 10);
    const levels = { df: state.dfLevel, lt: state.ltLevel, cfr: state.cfrLevel, mttr: state.mttrLevel };
    const snap = DH.buildSnapshot(vals, levels, scoreInfo ? scoreInfo.score : null, scoreInfo ? scoreInfo.cls : null, today);
    const history = DH.record(projectId, snap);

    const scoreTxt = (scoreInfo && scoreInfo.score != null) ? scoreInfo.score + '/100' : '—';
    const clsLabel = { elite: '🏆 Elite', high: '✅ High', medium: '📈 Medium', low: '⚠️ Low' };
    const curCls = scoreInfo && scoreInfo.cls ? (clsLabel[scoreInfo.cls] || scoreInfo.cls) : '—';

    // ── Jour 1 : pas d'historique à raconter — on pose l'état + un cap clair,
    //    sans jamais dire « je mémorise » (ça casse l'illusion). ──
    if (history.length < 2) {
        cont.innerHTML = `
        <div class="dc-panel">
            <div class="dc-head">
                <div class="dc-traj flat"><span class="dc-traj-ic">🧭</span>
                    <div><div class="dc-traj-t">Première mesure DORA</div>
                    <div class="dc-traj-s">Score actuel <b>${esc(scoreTxt)}</b> · ${esc(curCls)}</div></div>
                </div>
            </div>
            <div class="dc-firstrun">À ta prochaine analyse, je te raconte ce qui a bougé : paliers DORA franchis (Low→High…), nouveaux records et régressions — comparés à <b>ta</b> normale, pas à un seuil abstrait.</div>
        </div>
        <div id="doraCoachPanel"></div>`;
        renderDoraCoach(vals, state);
        return;
    }

    const events = DH.deriveEvents(history);
    const regime = DH.regime(history);
    const traj = DH.trajectory(history);

    // ── Trajectoire (bandeau) ──
    const trajMeta = {
        up:   { ic: '📈', t: 'En progression', cls: 'up' },
        down: { ic: '📉', t: 'En recul', cls: 'down' },
        flat: { ic: '➡️', t: 'Stable', cls: 'flat' }
    }[traj.dir] || { ic: '➡️', t: 'Stable', cls: 'flat' };
    const deltaTxt = (traj.base != null && Math.abs(traj.delta) >= 1)
        ? ` <span class="dc-delta ${trajMeta.cls}">${traj.delta > 0 ? '+' : ''}${Math.round(traj.delta)} pts vs ta normale</span>` : '';
    const trajHtml = `
        <div class="dc-traj ${trajMeta.cls}"><span class="dc-traj-ic">${trajMeta.ic}</span>
            <div><div class="dc-traj-t">${trajMeta.t} — <b>${esc(scoreTxt)}</b> · ${esc(curCls)}</div>
            <div class="dc-traj-s">Sur ${traj.points} mesure${traj.points > 1 ? 's' : ''}${deltaTxt}</div></div>
        </div>`;

    // ── Journal (les 8 événements les plus récents) ──
    const recent = events.slice().sort((a, b) => a.at < b.at ? 1 : -1).slice(0, 8);
    const journal = recent.length
        ? recent.map(ev => `<li class="dc-ev ${ev.type}">${doraEvIcon(ev)} ${doraEvText(ev)} <span class="dc-date">${esc(doraFrDate(ev.at))}</span></li>`).join('')
        : '<li class="dc-muted">Rien de neuf depuis ta dernière analyse — tu tiens ton cap.</li>';

    // ── Régime (écarts à la baseline propre à l'équipe) ──
    const regChips = Object.keys(regime)
        .map(k => regime[k].status !== 'normal' ? Object.assign({ k }, regime[k]) : null).filter(Boolean)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3)
        .map(r => {
            const m = DORA_META[r.k] || { emoji: '•', label: r.k };
            const better = r.status === 'above';
            return `<span class="dc-reg ${better ? 'above' : 'below'}">${better ? '⚡' : '🐢'} ${m.emoji} ${esc(m.label)} ${better ? 'meilleur' : 'moins bon'} que ta normale (${r.delta > 0 ? '+' : ''}${Math.round(r.delta * 100)}%)</span>`;
        }).join('');

    cont.innerHTML = `
    <div class="dc-panel">
        <div class="dc-head">${trajHtml}</div>
        <div class="dc-grid">
            <div class="dc-col">
                <div class="dc-col-h">📓 Ce qui a bougé</div>
                <ul class="dc-journal">${journal}</ul>
            </div>
            <div class="dc-col">
                <div class="dc-col-h">📊 Ton régime</div>
                <div class="dc-regime">${regChips || '<span class="dc-muted">Tes métriques sont dans ta normale habituelle.</span>'}</div>
            </div>
        </div>
    </div>
    <div id="doraCoachPanel"></div>`;

    // Le conseil n'est plus un one-liner passif : c'est le Coach Salsi (interactif,
    // orienté objectif, qui évolue avec tes mesures). Rendu dans son propre nœud.
    renderDoraCoach(vals, state);
}

// ════════════════════════════════════════════════════════════
//  COACH SALSI  (sur quelle des 4 mesures veux-tu progresser ?)
//  Interactif + évolutif : on retient le cap choisi, on compare la mesure au
//  moment du choix, et on fait tourner les leviers (escalade si ça ne bouge pas).
// ════════════════════════════════════════════════════════════

function doraCurrentValue(vals, m) {
    return m === 'mttr' ? vals.mttr : vals[m];
}

function doraProgressVerdict(m, startValue, curValue) {
    // Direction-aware : df up (mieux = plus haut), lt/cfr/mttr down (mieux = plus bas).
    if (startValue == null || curValue == null) return null;
    const up = m === 'df';
    const diff = curValue - startValue;
    const rel = startValue !== 0 ? Math.abs(diff) / Math.abs(startValue) : 0;
    if (rel < 0.05) return { dir: 'flat' };
    const better = up ? diff > 0 : diff < 0;
    return { dir: better ? 'up' : 'down', startValue, curValue, rel };
}

// Le coach = point d'entrée sobre (Salsi te demande sur quoi progresser), et le
// PLAN complet s'ouvre dans la MÊME popup « Atelier Salsi » que les achievements.

function renderDoraCoach(vals, state) {
    _doraCoachCtx = { vals, state };
    const host = document.getElementById('doraCoachPanel');
    const DH = window.Salsifi && window.Salsifi.doraHistory;
    if (!host || !DH) return;

    const levels = { df: state.dfLevel, lt: state.ltLevel, cfr: state.cfrLevel, mttr: state.mttrLevel };
    const coach = DH.readCoach(projectId);

    // Salsi suggère la métrique la plus faible (hors N/A) pour amorcer.
    const rank = { Low: 0, Medium: 1, High: 2, Elite: 3 };
    let weakest = null;
    ['df', 'lt', 'cfr', 'mttr'].forEach(k => {
        const lv = levels[k] && levels[k].level; if (!lv || lv === 'N/A') return;
        if (!weakest || rank[lv] < rank[weakest.lv]) weakest = { k, lv };
    });

    const cards = ['df', 'lt', 'cfr', 'mttr'].map(k => {
        const c = DORA_COACH[k], L = levels[k] || {};
        const lvl = L.level || 'N/A';
        const cls = L.cls || 'na';
        const suggested = weakest && weakest.k === k && !(coach && coach.focus);
        const isCap = coach && coach.focus === k;
        return `<button class="coach-pick ${suggested ? 'suggested' : ''} ${isCap ? 'is-cap' : ''}" onclick="doraCoachOpen('${k}')">
            <div class="coach-pick-top"><span class="coach-pick-emoji">${c.emoji}</span>
                <span class="coach-pick-lvl ${cls}">${esc(lvl)}</span></div>
            <div class="coach-pick-label">${esc(c.label)}</div>
            <div class="coach-pick-target">Cap : ${esc(c.targetTxt)}</div>
            ${suggested ? '<div class="coach-pick-sug">👉 Salsi te suggère de commencer ici</div>' : ''}
            ${isCap ? '<div class="coach-pick-sug">⭐ Ton cap actuel — clique pour ton plan</div>' : ''}
        </button>`;
    }).join('');

    const sub = coach && coach.focus && DORA_COACH[coach.focus]
        ? `Ton cap : <b>${DORA_COACH[coach.focus].emoji} ${esc(DORA_COACH[coach.focus].label)}</b>. Clique une mesure pour (r)ouvrir ton plan — je te suis dans le temps.`
        : `Sur quelle des 4 mesures veux-tu progresser ? Clique-en une : je te fais un <b>plan complet</b> et je te suis dans le temps.`;

    host.innerHTML = `
    <div class="coach-panel">
        <div class="coach-head">
            <span class="coach-avatar">${(window.Salsifi && window.Salsifi.mascotSVG) ? window.Salsifi.mascotSVG('happy') : '🌱'}</span>
            <div><div class="coach-title">Coach Salsi</div>
            <div class="coach-sub">${sub}</div></div>
        </div>
        <div class="coach-picks">${cards}</div>
    </div>`;
}

// Ouvre le plan complet dans la popup Atelier Salsi (même UX que les badges).

function doraCoachOpen(m) {
    const DH = window.Salsifi && window.Salsifi.doraHistory;
    if (!DH || !_doraCoachCtx || !DORA_COACH[m] || !window.Salsifi.openSalsiAtelier) return;
    const { vals, state } = _doraCoachCtx;
    const levels = { df: state.dfLevel, lt: state.ltLevel, cfr: state.cfrLevel, mttr: state.mttrLevel };
    const today = new Date().toISOString().slice(0, 10);
    const c = DORA_COACH[m];
    const L = levels[m] || {};
    const curVal = doraCurrentValue(vals, m);
    const curLvl = L.level || 'N/A';
    const atGoal = curLvl === 'Elite';

    // Cap : on garde la ligne de base si c'est déjà le cap suivi, sinon on la (re)pose.
    let coach = DH.readCoach(projectId);
    if (!coach || coach.focus !== m) {
        coach = { focus: m, startedAt: today, startValue: (typeof curVal === 'number' ? curVal : null), startLevel: L.level || null };
        DH.writeCoach(projectId, coach);
    }

    // Évolution depuis le cap.
    const verdict = doraProgressVerdict(m, coach.startValue, curVal);
    let progress = null;
    if (atGoal) {
        progress = { cls: 'up', html: `🏆 Tu es au niveau <b>Elite</b> sur cette mesure — tiens le cap, et veille à ne pas le payer sur une autre métrique.` };
    } else if (verdict) {
        const fmtS = esc(doraFmt(m, coach.startValue)), fmtC = esc(doraFmt(m, curVal));
        if (verdict.dir === 'up') progress = { cls: 'up', html: `📈 Depuis ton cap (${esc(doraFrDate(coach.startedAt))}), ${esc(c.label)} est passé de <b>${fmtS}</b> à <b>${fmtC}</b> — ça marche, on continue.` };
        else if (verdict.dir === 'down') progress = { cls: 'down', html: `📉 Depuis ton cap (${esc(doraFrDate(coach.startedAt))}), ${esc(c.label)} a glissé de <b>${fmtS}</b> à <b>${fmtC}</b> — on ajuste l'angle.` };
        else progress = { cls: 'flat', html: `➡️ Depuis ton cap (${esc(doraFrDate(coach.startedAt))}), ${esc(c.label)} n'a pas vraiment bougé (${fmtC}) — essayons un autre levier.` };
    } else if (curVal != null) {
        progress = { cls: 'flat', html: `🧭 On part de <b>${esc(doraFmt(m, curVal))}</b> — c'est ta ligne de base pour ce cap.` };
    }

    // Levier « à faire maintenant » : rotation via le registre, escalade si la
    // mesure ne bouge pas ou si le levier a déjà été proposé.
    const pick = DH.pickAdvice(c.levers.map(l => l.id), DH.adviceRead(projectId));
    let nowId = c.levers[0].id, escalate = false;
    if (pick) {
        nowId = pick.id;
        escalate = pick.escalate || (verdict && verdict.dir !== 'up' && pick.count >= 1);
        DH.adviceRecord(projectId, pick.id, today);
    }

    // Le PLAN = les leviers ordonnés, en <li> riches, avec le mouvement du moment
    // mis en avant (même liste .salsi-steps que « Comment on fait » du gaming).
    const chipCls = { faible: 'good', moyen: 'warn', fort: 'bad' };       // effort : moins c'est mieux
    const impCls = { faible: 'bad', moyen: 'warn', fort: 'good' };        // impact : plus c'est mieux
    // Ordre naturel (déjà priorisé du plus rentable au moins urgent) ; on tague
    // seulement le levier « à faire maintenant » choisi par la rotation.
    const stepsHtml = c.levers.map(l => {
        const isNow = l.id === nowId;
        const mod = l.module ? ` <a class="salsi-chip mod" href="${l.module.page}?repo=${encodeURIComponent(projectId)}">🧰 ${esc(l.module.name)}</a>` : '';
        const chips = `<span class="salsi-lever-chips"><span class="salsi-chip ${chipCls[l.effort] || ''}">effort ${esc(l.effort)}</span><span class="salsi-chip ${impCls[l.impact] || ''}">impact ${esc(l.impact)}</span>${mod}</span>`;
        return `<li class="${isNow ? 'is-now' : ''}"><span class="salsi-lever-t">${esc(l.title)}${isNow ? '<span class="salsi-now-tag">à faire maintenant</span>' : ''}</span><span class="salsi-lever-d">${esc(l.detail)}</span>${chips}</li>`;
    });

    const escaExtra = escalate ? [{ kind: 'note', html: `⏳ On y revient : si ça coince, bloque 30 min cette semaine pour attaquer le mouvement du moment — c'est lui qui débloque la suite.` }] : [];
    const extras = escaExtra
        .concat([{ kind: 'measure', html: `📏 <b>Comment je saurai que tu progresses :</b> ${esc(c.measure)}` }])
        .concat([{ kind: 'trap', html: `⚠️ <b>Pièges à éviter</b><br>• ${c.traps.map(esc).join('<br>• ')}` }]);

    // Diagnostic « chez toi, concrètement » : les ex-Quick Wins, branchés sur les
    // vraies données du repo, avec le module Salsifi qui aide pour chaque constat.
    const diagItems = doraSignals(m).map(it => ({
        tone: it.tone, icon: it.icon, text: it.text,
        module: it.module ? { name: it.module.name, href: it.module.page + '?repo=' + encodeURIComponent(projectId) } : null
    }));

    // Action principale = ouvrir le module lié au mouvement du moment (là où on agit).
    const nowLever = c.levers.find(l => l.id === nowId);
    const actions = [];
    if (nowLever && nowLever.module) actions.push({ label: `🧰 Ouvrir ${nowLever.module.name}`, kind: 'primary', href: `${nowLever.module.page}?repo=${encodeURIComponent(projectId)}` });

    window.Salsifi.openSalsiAtelier({
        title: c.label,
        subtitle: 'cap DORA à améliorer',
        modeTag: '🎯 plan de progression',
        mood: atGoal ? 'proud' : 'happy',
        bubble: `Ok, on bosse <b>${esc(c.label)}</b> 💪 Je regarde ce qui se passe <b>chez toi</b>, je t'explique <b>pourquoi</b> ça compte, puis je te donne le plan.`,
        analysis: [
            { label: '📊 Chez toi :', value: curVal != null ? doraFmt(m, curVal) + ' (' + curLvl + ')' : 'N/A' },
            { label: '🎯 Objectif :', value: c.targetTxt }
        ],
        progress: progress,
        diagnostic: { title: '🔎 Chez toi, concrètement', items: diagItems },
        why: esc(c.stakes),
        planTitle: 'Le plan pour progresser',
        steps: stepsHtml,
        extras: extras,
        actions: actions
    });
    renderDoraCoach(vals, state);   // rafraîchit le point d'entrée (marque le cap)
}

// ════════════════════════════════════════════════════════════
//  EVOLUTION CHART
// ════════════════════════════════════════════════════════════

function renderEvolutionChart(pipelines30, mergeRequests) {
    const now = new Date();

    const labels = [], dfData = [], ltData = [];

    // 30 jours, tous les jours (anciennement 1j/2). Chart.js gère sans souci
    // l'affichage condensé pour 30 points et la lisibilité reste bonne.
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }));

        const dayP = pipelines30.filter(p => p.created_at && p.created_at.startsWith(dateStr));
        dfData.push(dayP.filter(p => p.status === 'success').length);

        const dayMRs = mergeRequests.filter(mr =>
            mr.state === 'merged' && mr.merged_at && mr.merged_at.startsWith(dateStr)
        );
        if (dayMRs.length > 0) {
            const ltValues = dayMRs.map(mr => {
                return (new Date(mr.merged_at) - new Date(mr.first_commit_at || mr.created_at)) / 3600000;
            }).filter(v => v > 0 && v < 8760);
            if (ltValues.length > 0) {
                ltValues.sort((a, b) => a - b);
                const mid = Math.floor(ltValues.length / 2);
                if (ltValues.length % 2 === 0) {
                    ltData.push(parseFloat(((ltValues[mid - 1] + ltValues[mid]) / 2).toFixed(1)));
                } else {
                    ltData.push(parseFloat(ltValues[mid].toFixed(1)));
                }
            } else {
                ltData.push(null);
            }
        } else {
            ltData.push(null);
        }
    }

    if (_charts.evolution) _charts.evolution.destroy();
    const ctx = document.getElementById('evolutionChart').getContext('2d');
    _charts.evolution = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Déploiements/jour',
                    data: dfData,
                    borderColor: '#a5b4fc',
                    backgroundColor: 'rgba(165,180,252,0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y',
                    spanGaps: true
                },
                {
                    label: 'Lead Time (h)',
                    data: ltData,
                    borderColor: '#6ee7b7',
                    backgroundColor: 'rgba(110,231,183,0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1',
                    spanGaps: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: 'white', font: { size: 12 } } }
            },
            scales: {
                x: {
                    ticks: { color: cssVar('--chart-ink','rgba(255,255,255,0.6)'), font: { size: 10 } },
                    grid: { color: cssVar('--chart-grid','rgba(255,255,255,0.08)') }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Déploiements', color: cssVar('--chart-ink','rgba(255,255,255,0.6)') },
                    ticks: { color: cssVar('--chart-ink','rgba(255,255,255,0.6)') },
                    grid: { color: cssVar('--chart-grid','rgba(255,255,255,0.08)') },
                    min: 0
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Lead Time (h)', color: cssVar('--chart-ink','rgba(255,255,255,0.6)') },
                    ticks: { color: cssVar('--chart-ink','rgba(255,255,255,0.6)') },
                    grid: { drawOnChartArea: false },
                    min: 0
                }
            }
        }
    });
}

// ════════════════════════════════════════════════════════════
//  DIAGNOSTIC « CHEZ TOI » — branché sur les données réelles du repo.
//  (Remplace les anciens Quick Wins : leur substance est repliée, plus
//   travaillée, dans le Coach Salsi — un seul endroit pour agir.)
// ════════════════════════════════════════════════════════════

function doraSignals(metric) {
    const R = _doraRepo || {};
    const raw = R.raw || {};
    const pp = Array.isArray(R.pipelines30) ? R.pipelines30 : [];
    const mrs = Array.isArray(R.mergeRequests) ? R.mergeRequests : [];
    const br = Array.isArray(R.branches) ? R.branches : [];
    const contrib = Array.isArray(R.contributors) ? R.contributors : [];
    const now = Date.now();
    const S = _doraState || {};
    const lvlName = k => (S[k + 'Level'] && S[k + 'Level'].level) || '';
    const lvlCls = k => (S[k + 'Level'] && S[k + 'Level'].cls) || '';

    const items = [];
    const push = (tone, icon, text, mod) => items.push({ tone, icon, text, module: mod || null });
    const M = { pipe: { name: 'Pipeline Generator', page: 'pipeline-generator.html' }, gov: { name: 'Gouvernance repo', page: 'gouvernance-repo.html' }, branch: { name: 'Branch Monitor', page: 'branch-cleaner.html' }, flags: { name: 'Feature Flag Manager', page: 'feature-flag-manager.html' }, mr: { name: 'MR Reviewer', page: 'mr-reviewer.html' }, bus: { name: 'Bus Factor', page: 'bus-factor.html' } };

    const failed = pp.filter(p => p.status === 'failed');
    const openMRs = mrs.filter(m => m.state === 'opened');
    const staleMRs = openMRs.filter(m => (now - new Date(m.created_at).getTime()) / 86400000 > 3);
    const mergedMRs = mrs.filter(m => m.state === 'merged');
    const staleBranches = br.filter(b => {
        if (['main', 'master', 'develop', 'dev'].includes(b.name)) return false;
        return b.commit && b.commit.committed_date && (now - new Date(b.commit.committed_date).getTime()) / 86400000 > 30;
    });
    const bigMRs = mergedMRs.filter(m => (m.files_count != null ? m.files_count : (m.changes_count || 0)) > 10);
    const bigShare = mergedMRs.length ? Math.round(bigMRs.length / mergedMRs.length * 100) : 0;

    if (metric === 'df') {
        if (failed.length) push('critical', '🔴', `${failed.length} pipeline${failed.length > 1 ? 's' : ''} en échec sur 30 j : tant qu'ils sont rouges, rien de fiable ne part en prod. Les remettre au vert est ton gain le plus rapide sur la fréquence.`, M.pipe);
        if (raw.df !== null && raw.df < 1) push('critical', '🔁', `Moins d'un déploiement par semaine (${raw.df}/sem). Vise un objectif simple d'abord : livrer à chaque sprint, en découpant les features en incréments déployables.`);
        else if (raw.df !== null && raw.df < 7) push('warn', '📦', `${raw.df} déploiement/sem — niveau ${lvlName('df')}. Pour viser Elite (≥7/sem), enlève les approbations manuelles bloquantes et automatise les checks pré-merge.`, M.gov);
        if (staleBranches.length > 5) push('info', '🌿', `${staleBranches.length} branches inactives depuis 30+ j : du travail commencé mais jamais livré, qui plombe ta cadence réelle.`, M.branch);
    }

    if (metric === 'lt') {
        if (staleMRs.length) push('critical', '⏳', `${staleMRs.length} MR ouverte${staleMRs.length > 1 ? 's' : ''} depuis 3+ jours sans review — chaque jour d'attente s'ajoute directement à ton Lead Time (aujourd'hui ${raw.lt !== null ? (raw.lt >= 24 ? (raw.lt / 24).toFixed(1) + 'j' : raw.lt + 'h') : 'N/A'}).`, M.mr);
        if (bigMRs.length && bigShare >= 30) push('warn', '✂️', `${bigMRs.length} MR mergées à 10+ fichiers (${bigShare}% du total) : les grosses MR traînent en review. Découpe-les — c'est le levier n°1 sur le Lead Time.`, M.mr);
        if (staleBranches.length > 5) push('info', '🌿', `${staleBranches.length} branches mortes (30+ j sans commit) : active la suppression auto après merge pour garder un dépôt lisible.`, M.branch);
        if (raw.lt !== null && raw.lt > 168) push('critical', '🚨', `Lead Time médian à ${(raw.lt / 24).toFixed(1)} jours (Low). Cible immédiate : passer sous 7 jours en traquant les étapes manuelles du workflow.`);
    }

    if (metric === 'cfr') {
        if (raw.cfr !== null && raw.cfr > 15) push('critical', '🛑', `${raw.cfr}% de tes pipelines prod échouent (${raw.failedP}/${raw.totalP}). Au-delà de 15% tu es Low : des tests automatisés attrapent les régressions avant le push.`, M.gov);
        else if (raw.cfr !== null && raw.cfr >= 5) push('warn', '🧪', `CFR à ${raw.cfr}% — niveau ${lvlName('cfr')}. Pour passer Elite (<5%) : lint + tests d'intégration + quality gates bloquants dans le pipeline.`, M.gov);
        // Croisement inter-DORA (ex-cross-wins), remonté là où il compte.
        if (lvlCls('df') === 'elite' && (lvlCls('cfr') === 'low' || lvlCls('cfr') === 'medium')) push('warn', '⚠️', `Tu livres vite (déploiement Elite) mais tu casses souvent (CFR ${lvlName('cfr')}) : priorité aux quality gates AVANT la prod, sinon la vitesse se paie en incidents.`, M.gov);
        if (lvlCls('lt') === 'low' && (lvlCls('cfr') === 'low' || lvlCls('cfr') === 'medium')) push('critical', '🔥', `Lead Time lent ET CFR élevé : c'est le signal d'une dette technique/process. Traite la stabilité en priorité, la vitesse suivra.`);
    }

    if (metric === 'mttr') {
        const failedOld = failed.filter(p => {
            if (p.ref !== 'main' && p.ref !== 'master') return false;
            if ((now - new Date(p.created_at).getTime()) / 86400000 <= 1) return false;
            return !pp.find(n => n.ref === p.ref && n.status === 'success' && new Date(n.created_at) > new Date(p.created_at));
        });
        if (failedOld.length) push('critical', '🔧', `${failedOld.length} pipeline${failedOld.length > 1 ? 's' : ''} cassé${failedOld.length > 1 ? 's' : ''} depuis 24h+ sur main sans correctif : chaque heure allonge ton temps de restauration.`, M.pipe);
        if (raw.mttr !== null && raw.mttr > 24) push('warn', '⏱️', `TTRS médian à ${raw.mttr >= 24 ? (raw.mttr / 24).toFixed(1) + 'j' : raw.mttr + 'h'} (${lvlName('mttr')}). Prépare un rollback en un geste et coupe via feature flag pour restaurer plus vite.`, M.flags);
        if (contrib.length && contrib.length <= 1) push('critical', '🚌', `Un seul contributeur actif — bus factor critique : en incident, ta restauration dépend d'une seule personne. Partage les accès et la connaissance.`, M.bus);
    }

    if (!items.length) push('good', '✅', `Rien d'alarmant côté données pour cette mesure. Le plan ci-dessous te fait viser le cran au-dessus, proprement.`);
    return items;
}


// ════════════════════════════════════════════════════════════
//  EXPORT RAPPORT
// ════════════════════════════════════════════════════════════
