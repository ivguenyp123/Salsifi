/* maturity · render.js — rendu DOM : écrans, quiz, rapport, modals, accompagnement, toasts. */



// ============================================
// TOAST — remplace les alert() bloquants
// ============================================

function showToast(message, type = 'info') {
    let toast = document.getElementById('maturity-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'maturity-toast';
        toast.style.cssText = `
            position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            padding: 12px 24px; border-radius: 999px;
            color: var(--text-primary, #f5f1ff);
            font-family: var(--font-body, 'Manrope', sans-serif);
            font-weight: 500; font-size: 14px;
            z-index: 10000;
            backdrop-filter: blur(20px);
            box-shadow: 0 12px 32px rgba(0,0,0,0.4);
            opacity: 0; transition: opacity .25s ease, transform .25s ease;
            pointer-events: none;
            max-width: 90vw; text-align: center;
            border: 1px solid var(--border-strong, var(--ov-18));
        `;
        document.body.appendChild(toast);
    }
    const bg = type === 'error'   ? 'rgba(251, 113, 133, 0.20)'
             : type === 'warning' ? 'rgba(251, 191, 36, 0.20)'
             : type === 'success' ? 'rgba(45, 212, 191, 0.20)'
             :                       'rgba(124, 92, 255, 0.20)';
    toast.style.background = bg;
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
    }, 3000);
}


function attachEventDelegation() {
    document.body.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const handler = ACTION_HANDLERS[el.dataset.action];
        if (handler) handler(e, el);
    });
    // Radio inputs des questions : passent par event delegation 'change'
    // (avant : onchange="pick(...)" inline dans chaque radio).
    document.body.addEventListener('change', (e) => {
        const el = e.target.closest('input[type="radio"][data-action="pick"]');
        if (!el) return;
        pick(el.dataset.qid, parseInt(el.dataset.val, 10));
    });
    // Escape ferme le modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCfModal();
    });
}


function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0,0);
    const steps = { 's-welcome':'Étape 1/4','s-quiz':'Étape 2/4','s-loading':'Analyse...','s-report':'Rapport','s-actions':'Plan' };
    document.getElementById('headerStep').textContent = steps[id] || '';
}


function startQuiz() {
    document.getElementById('inDate').value = document.getElementById('inDate').value || new Date().toISOString().split('T')[0];
    currentCatIdx = 0;
    renderCategory();
    showScreen('s-quiz');
}


function renderCategory() {
    const cat = quizCategories[currentCatIdx];
    const qs = getCatQuestions(cat.id);
    const bgColors = { culture:'rgba(244,114,182,0.15)', delivery:'rgba(96,165,250,0.15)', quality:'rgba(167,139,250,0.15)',
        stability:'rgba(52,211,153,0.15)', hygiene:'rgba(251,191,36,0.15)', resilience:'rgba(248,113,113,0.15)', practices:'rgba(249,115,22,0.15)' };
    document.getElementById('categoryHeader').innerHTML = `<div class="category-header" style="background:${bgColors[cat.id]}"><div class="ch-icon">${cat.icon}</div><div class="ch-info"><div class="ch-name">${cat.label}</div><div class="ch-desc">${cat.desc}</div></div><div class="ch-count">${qs.length} questions</div></div>`;
    document.getElementById('questionList').innerHTML = qs.map((q,i) => {
        const current = answers[q.id] || null;
        return `<div class="q-card ${current ? 'answered' : ''}" id="qc-${q.id}"><div class="q-num">Question ${String(i+1).padStart(2,'0')} / ${qs.length}</div><div class="q-text">${q.q}</div><div class="levels">${LEVELS.map((l,v) => `<label class="lvl-opt"><input type="radio" name="ans-${q.id}" value="${v+1}" ${current===v+1?'checked':''} onchange="pick('${q.id}',${v+1})"><div class="lvl-box"><div class="lvl-num">${v+1}</div><div class="lvl-lbl">${l}</div></div></label>`).join('')}</div></div>`;
    }).join('');
    const isFirst = currentCatIdx === 0;
    const isLast = currentCatIdx === quizCategories.length - 1;
    document.getElementById('quizNav').innerHTML = `${isFirst ? '' : '<button class="btn-nav btn-prev" onclick="prevCat()">← Précédent</button>'}${isLast ? '<button class="btn-nav btn-finish" onclick="finishQuiz()">🚀 Analyser les résultats</button>' : '<button class="btn-nav btn-next" onclick="nextCat()">Suivant →</button>'}`;
    updateProgress();
}


function pick(qid, val) { answers[qid] = val; document.getElementById('qc-'+qid).classList.add('answered'); updateProgress(); }

function updateProgress() { const total = getAllQuestions().length; const done = Object.keys(answers).length; document.getElementById('qpFill').style.width = (done/total*100)+'%'; document.getElementById('qpText').textContent = done + ' / ' + total; }

function nextCat() {
    const cat = quizCategories[currentCatIdx];
    const qs = getCatQuestions(cat.id);
    const unanswered = qs.filter(q => !answers[q.id]);
    if (unanswered.length > 0) {
        alert(`⚠️ Veuillez répondre à toutes les questions avant de continuer (${unanswered.length} sans réponse).`);
        return;
    }
    if (currentCatIdx < quizCategories.length - 1) { currentCatIdx++; renderCategory(); }
}

function prevCat() { if (currentCatIdx > 0) { currentCatIdx--; renderCategory(); } }


async function finishQuiz() {
    if (!initAuth()) return;
    
    showScreen('s-loading');
    const steps = ['Connexion GitLab…','Analyse pipelines…','Scan MR…','Vérification branches…','Scan Gouvernance…','Analyse fichiers…','Contributeurs…','Feature flags…'];
    const stepsEl = document.getElementById('ldSteps');
    const fill = document.getElementById('ldFill');
    stepsEl.innerHTML = steps.map((s,i) => `<div class="ld-step" id="ldst-${i}">⏳ ${s}</div>`).join('');
    
    const updateStep = (stepNum) => {
        if (stepNum > 0) {
            document.getElementById('ldst-' + (stepNum - 1)).classList.add('done');
            document.getElementById('ldst-' + (stepNum - 1)).textContent = '✓ ' + steps[stepNum - 1].replace('…', '');
        }
        fill.style.width = (stepNum / steps.length * 100) + '%';
    };
    
    try {
        await fetchAllMetrics(updateStep);
        
        document.getElementById('ldst-' + (steps.length - 1)).classList.add('done');
        document.getElementById('ldst-' + (steps.length - 1)).textContent = '✓ ' + steps[steps.length - 1].replace('…', '');
        fill.style.width = '100%';
        
        await new Promise(r => setTimeout(r, 500));
        showScreen('s-report');
        renderReport();
    } catch (err) {
        console.error('Erreur analyse GitLab:', err);
        alert('Erreur lors de l\'analyse GitLab. Vérifiez votre connexion et réessayez.');
        showScreen('s-quiz');
    }
}


function renderReport() {
    const catScores = CATEGORIES.map(c => {
        const decl = declScoreForCat(c.id);
        const data = dataScoreForCat(c.id);
        let final = c.type === 'data_only' ? (data||0) : (data !== null ? Math.round((decl+data)/2) : (decl||0));
        return { ...c, decl, data, final };
    });
    const globalScore = Math.round(catScores.reduce((s,c)=>s+c.final,0)/catScores.length);
    const lvl = globalScore >= 80 ? 4 : globalScore >= 60 ? 3 : globalScore >= 40 ? 2 : globalScore >= 20 ? 1 : 0;
    document.getElementById('rhScore').textContent = globalScore;
    document.getElementById('rhLevel').textContent = LEVELS[lvl];
    document.getElementById('rhMeta').textContent = `${document.getElementById('inSquad').value} · ${document.getElementById('inTribu').value} · ${document.getElementById('inDate').value}`;
    const ctx = document.getElementById('radarChart').getContext('2d');
    new Chart(ctx, {
        type:'radar', data:{ labels: catScores.map(c=>c.icon+' '+c.label.split(' ')[0]), datasets:[
            { label:'Déclaratif', data:catScores.map(c=>c.decl), backgroundColor:'rgba(167,139,250,0.15)', borderColor:'rgba(167,139,250,0.6)', borderWidth:2, borderDash:[5,5], pointRadius:4 },
            { label:'Data GitLab', data:catScores.map(c=>c.data??c.decl), backgroundColor:'rgba(96,165,250,0.15)', borderColor:'rgba(96,165,250,0.8)', borderWidth:2, pointRadius:5 }
        ]},
        options:{ responsive:true, maintainAspectRatio:false, scales:{ r:{ beginAtZero:true, max:100, grid:{ color:cssVar('--chart-grid','rgba(255,255,255,0.06)') }, pointLabels:{ font:{ size:11 }, color:cssVar('--chart-ink','rgba(255,255,255,0.6)') } } }, plugins:{ legend:{ labels:{ color:cssVar('--chart-ink','rgba(255,255,255,0.6)'), font:{ size:11 } } } } }
    });
    window._catScores = catScores;
    document.getElementById('confrontGrid').innerHTML = catScores.map((c,idx) => {
        const delta = (c.data!==null && c.decl!==null) ? c.decl - c.data : 0;
        const badgeClass = c.type === 'data_only' ? (c.data>=80?'aligned':c.data>=50?'gap':'big-gap') : (Math.abs(delta)<5?'aligned':Math.abs(delta)<20?'gap':'big-gap');
        const badgeText = c.type === 'data_only' ? (c.data>=80?'✓ Conforme':c.data>=50?'⚠️ Partiel':'🔴 Non conforme') : (Math.abs(delta)<5?'✓ Aligné':delta>0?`↑ +${delta}`:`↓ ${delta}`);
        return `<div class="cf-card" onclick="openCfModal(${idx})"><div class="cf-header"><div class="cf-icon">${c.icon}</div><div class="cf-name">${c.label}</div><div class="cf-badge ${badgeClass}">${badgeText}</div></div><div class="cf-bars"><div class="cf-bar-row"><div class="cf-bar-label">Déclar.</div><div class="cf-bar-track"><div class="cf-bar-fill declaratif" style="width:${c.decl??0}%"></div></div><div class="cf-bar-val">${c.decl??'-'}</div></div>${c.type !== 'data_only'?`<div class="cf-bar-row"><div class="cf-bar-label">Data</div><div class="cf-bar-track"><div class="cf-bar-fill data" style="width:${c.data??0}%"></div></div><div class="cf-bar-val">${c.data??'-'}</div></div>`:''}</div><div class="cf-expand-hint">▼ Cliquer pour le détail</div></div>`;
    }).join('');
}


function openCfModal(catIdx) {
    const c = window._catScores[catIdx];
    const qs = QUESTIONS.filter(q => q.cat === c.id);
    const details = qs.map((q,i) => {
        const declVal = answers[q.id] || 3;
        const declLabel = LEVELS[declVal-1];
        const declScore = Math.round(declVal / 5 * 100);
        const m = q.metric ? GITLAB_DATA[q.metric] : null;
        const dataScore = m ? m.score : null;
        const advice = getAdvice(q.id, declVal);
        let gapClass = '';
        let gapBadge = '';
        if (m) {
            const delta = declScore - dataScore;
            const absDelta = Math.abs(delta);
            if (absDelta < 15) {
                gapClass = 'border-left:4px solid rgba(16,185,129,0.5);';
                gapBadge = '<span style="font-size:10px;background:rgba(16,185,129,0.2);color:#6ee7b7;padding:2px 8px;border-radius:6px;font-weight:700">✓ Aligné</span>';
            } else if (delta > 0) {
                gapClass = 'border-left:4px solid rgba(251,191,36,0.5);';
                gapBadge = '<span style="font-size:10px;background:rgba(251,191,36,0.2);color:#fde68a;padding:2px 8px;border-radius:6px;font-weight:700">↑ +' + Math.round(delta) + '</span>';
            } else {
                gapClass = 'border-left:4px solid rgba(96,165,250,0.5);';
                gapBadge = '<span style="font-size:10px;background:rgba(96,165,250,0.2);color:#93c5fd;padding:2px 8px;border-radius:6px;font-weight:700">↓ ' + Math.round(delta) + '</span>';
            }
        }
        const dataPills = m
            ? '<span class="cf-d-pill real">📊 ' + m.val + ' <span style="opacity:0.55;font-weight:400">· règle : ' + m.rule + '</span></span> ' + gapBadge
            : '';
        return '<div class="cf-detail-item" style="' + gapClass + '"><div class="cf-dq">' + (i+1) + '. ' + q.q + '</div><div class="cf-d-scores"><span class="cf-d-pill decl">✋ ' + declVal + '/5 — ' + declLabel + '</span>' + dataPills + '</div><div class="cf-d-explain">💡 ' + (advice || 'Continuez à progresser') + '</div></div>';
    }).join('');
    document.getElementById('cfModal').innerHTML = '<button class="cf-modal-close" onclick="closeCfModal()">✕</button><div class="cf-modal-header"><div class="cf-modal-icon">' + c.icon + '</div><div class="cf-modal-title">' + c.label + '</div></div><div class="cf-modal-section-title">Détail question par question</div>' + details;
    document.getElementById('cfOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeCfModal() { document.getElementById('cfOverlay').classList.remove('open'); document.body.style.overflow = ''; }


async function goActions() {
    showScreen('s-actions');
    await renderAccompaniments();
}


async function renderAccompaniments() {
    const acc = await loadAccompagnement();

    const items = QUESTIONS.map(q => {
        const declVal = answers[q.id] || null;
        const dataScore = q.metric ? (GITLAB_DATA[q.metric]?.score ?? null) : null;
        const metricData = q.metric ? GITLAB_DATA[q.metric] : null;
        return { ...q, declVal, dataScore, metricData };
    });

    const accompagnements = [];
    const diagnosticsAjoutes = new Set();

    items.forEach(item => {
        const qAcc = acc[item.id];
        if (!qAcc) return;

        if (qAcc.securite) {
            if (item.dataScore !== null && item.dataScore < 80) {
                accompagnements.push({
                    id: item.id,
                    title: qAcc.label,
                    categorie: qAcc.categorie,
                    dataPoint: item.metricData ? item.metricData.val : null,
                    actions: [{ id: `${item.id}#0`, text: qAcc.action, done: false }],
                    niveau: null,
                    niveauTitre: null,
                    isDiagnostic: false
                });
            }
            return;
        }

        let niveauDeclencheur = null;

        if (item.declVal !== null && item.declVal <= 3) {
            niveauDeclencheur = item.declVal;
        }

        if (item.dataScore !== null && item.dataScore <= 60) {
            const niveauData = item.dataScore <= 20 ? 1 : item.dataScore <= 40 ? 2 : 3;
            if (niveauDeclencheur === null || niveauData < niveauDeclencheur) {
                niveauDeclencheur = niveauData;
            }
        }

        if (niveauDeclencheur === null) return;

        const niveauKey = String(Math.min(niveauDeclencheur, 3));
        const niveauInfo = qAcc.niveaux ? qAcc.niveaux[niveauKey] : null;
        if (!niveauInfo) return;

        if (qAcc.diagnostic && !diagnosticsAjoutes.has(item.cat)) {
            diagnosticsAjoutes.add(item.cat);
            const diagId = `diag-${item.cat}`;
            accompagnements.push({
                id: diagId,
                title: `Diagnostic — ${qAcc.categorie}`,
                categorie: qAcc.categorie,
                dataPoint: null,
                actions: [{ id: `${diagId}#0`, text: qAcc.diagnostic, done: false }],
                niveau: null,
                niveauTitre: null,
                isDiagnostic: true
            });
        }

        // Lien Confluence de chaque action, via le référentiel commun.
        // L'ordre des actions code == ordre du référentiel (vérifié), donc
        // l'index i suffit. lien null = page pas encore écrite.
        const wsList = (window.Salsifi && window.Salsifi.workshops)
            ? window.Salsifi.workshops.get(item.id, niveauKey) : [];
        accompagnements.push({
            id: item.id,
            title: qAcc.label,
            categorie: qAcc.categorie,
            dataPoint: item.metricData ? `${item.metricData.val} · règle : ${item.metricData.rule}` : null,
            actions: niveauInfo.actions.map((a, i) => ({ id: `${item.id}#${i}`, text: a, done: false, lien: (wsList[i] && wsList[i].lien) || null })),
            niveau: niveauDeclencheur,
            niveauTitre: niveauInfo.titre,
            isDiagnostic: false
        });
    });

    const categoriesMap = {};
    accompagnements.forEach(a => {
        if (!categoriesMap[a.categorie]) categoriesMap[a.categorie] = [];
        categoriesMap[a.categorie].push(a);
    });

    const totalActions = accompagnements.filter(a => !a.isDiagnostic).reduce((s,a) => s + a.actions.length, 0);
    document.getElementById('actionsStats').innerHTML = `<div class="as-pill"><span class="as-num">${Object.keys(categoriesMap).length}</span> Axes</div><div class="as-pill"><span class="as-num">${accompagnements.filter(a=>!a.isDiagnostic).length}</span> Accompagnements</div><div class="as-pill"><span class="as-num">${totalActions}</span> Actions</div><div class="as-pill"><span class="as-num">${selectedActions.size}</span> Sélectionnées</div>`;

    const catIcons = {
        'Toolchain CI/CD': '⚙️', 'Processus Merge': '🔒', 'Hygiène & Gouvernance': '🧹',
        'Sécurité': '🔐', 'Résilience & Bus Factor': '🚌', 'Culture & Rituels': '👥',
        'Stabilité Pipeline': '⚙️', 'Pratiques DevOps': '⚡'
    };

    let html = '';
    Object.entries(categoriesMap).forEach(([cat, catItems]) => {
        const icon = catIcons[cat] || '📋';
        html += `<div class="action-category"><div class="ac-header">${icon} ${cat}</div>`;
        catItems.forEach(item => {
            if (item.isDiagnostic) {
                html += `<div style="background:var(--ov-04);border-left:3px solid rgba(167,139,250,0.5);border-radius:10px;padding:12px 16px;margin-bottom:10px;">`;
                html += `<div style="font-size:11px;font-weight:700;opacity:0.5;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em;">🔍 Diagnostic</div>`;
                html += `<div class="action-item ${selectedActions.has(item.actions[0].id)?'selected':''}" data-aid="${item.actions[0].id}"><div class="ai-check"></div><div class="ai-content"><div class="ai-task">${item.actions[0].text}</div></div></div>`;
                html += `</div>`;
            } else {
                const niveauColor = item.niveau === 1 ? 'rgba(248,113,113,0.3)' : item.niveau === 2 ? 'rgba(251,191,36,0.3)' : 'rgba(96,165,250,0.3)';
                html += `<div style="background:var(--ov-04);border-radius:12px;padding:14px 16px;margin-bottom:10px;">`;
                html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">`;
                html += `<div style="font-size:13px;font-weight:700;flex:1;">${item.title}</div>`;
                if (item.niveau) html += `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:${niveauColor}">Niveau ${item.niveau} — ${item.niveauTitre}</span>`;
                html += `</div>`;
                if (item.dataPoint) html += `<div style="font-size:11px;opacity:0.5;margin-bottom:8px;">📊 ${item.dataPoint}</div>`;
                item.actions.forEach(action => {
                    const wsLink = action.lien
                        ? `<a class="ws-link" href="${action.lien}" target="_blank" rel="noopener" title="Ouvrir l'atelier dans Confluence" style="display:inline-block;margin-top:8px;font-size:11px;font-weight:600;color:var(--accent,#a78bfa);text-decoration:none;border:1px solid var(--border-subtle,var(--ov-08));border-radius:6px;padding:3px 10px;">📄 Voir l'atelier</a>`
                        : '';
                    html += `<div class="action-item ${selectedActions.has(action.id)?'selected':''}" data-aid="${action.id}"><div class="ai-check"></div><div class="ai-content"><div class="ai-task">${action.text}</div>${wsLink}</div></div>`;
                });
                html += `</div>`;
            }
        });
        html += `</div>`;
    });

    if (accompagnements.length === 0) html = `<div style="text-align:center;padding:60px;"><div style="font-size:48px;">🏆</div><div style="font-size:20px;font-weight:700;">Félicitations !</div><div>Aucun accompagnement détecté — squad au top !</div></div>`;
    document.getElementById('actionsList').innerHTML = html;
}



// ============================================
// EXPORT HTML — Plan d'accompagnement standalone
// ============================================
// Génère un fichier HTML autonome (téléchargement direct).
// Le HTML sémantique (h1/h2/h3/ul/li/strong) permet le copier-coller
// dans Confluence/Jira/Word avec préservation de la structure.

function exportActionPlan() {
    // ---- Métadonnées ----
    const squad = (document.getElementById('inSquad').value || 'Squad').trim();
    const tribu = (document.getElementById('inTribu').value || '—').trim();
    const date  = document.getElementById('inDate').value || new Date().toISOString().split('T')[0];
    const score = parseInt(document.getElementById('rhScore').textContent, 10) || 0;
    const level = document.getElementById('rhLevel').textContent.trim() || '—';

    // ---- Collecte des actions, par catégorie (cochées + non cochées) ----
    const categoriesMap = {};      // actions retenues (cochées)
    const unselectedMap = {};      // actions non retenues (non cochées)
    document.querySelectorAll('.action-category').forEach(catEl => {
        const headerEl = catEl.querySelector('.ac-header');
        const catName = headerEl ? headerEl.textContent.trim() : 'Actions';

        catEl.querySelectorAll('.action-item').forEach(item => {
            const taskEl = item.querySelector('.ai-task');
            if (!taskEl) return;
            const text = taskEl.textContent.trim();
            const target = item.classList.contains('selected') ? categoriesMap : unselectedMap;
            if (!target[catName]) target[catName] = [];
            target[catName].push(text);
        });
    });

    // Note : on autorise l'export même sans action retenue.
    // Le rapport reste utile pour le détail de l'évaluation et le backlog.
    const totalActions = Object.values(categoriesMap).reduce((s, arr) => s + arr.length, 0);
    const totalUnselected = Object.values(unselectedMap).reduce((s, arr) => s + arr.length, 0);

    if (totalActions === 0 && totalUnselected === 0 && Object.keys(answers).length === 0) {
        alert('Rien à exporter : aucune action et aucune réponse au quiz.');
        return;
    }

    // ---- Collecte du détail des questions, regroupées par catégorie ----
    // On suit la même logique que openCfModal() : declVal, dataScore, gap, conseil.
    const questionsByCategory = {};
    CATEGORIES.forEach(cat => {
        const qs = QUESTIONS.filter(q => q.cat === cat.id);
        if (qs.length === 0) return;

        const items = [];
        let totalDecl = 0, declCount = 0, totalData = 0, dataCount = 0;

        qs.forEach((q, i) => {
            const declValRaw = answers[q.id];
            const m = q.metric ? GITLAB_DATA[q.metric] : null;

            // Sécurité : niveau déclaratif = 'conforme' / 'non_conforme' (pas un nombre)
            let declValNum = null, declLabel = '—', declScore = null;
            if (declValRaw === 'conforme') { declLabel = 'Conforme'; declScore = 100; }
            else if (declValRaw === 'non_conforme') { declLabel = 'Non conforme'; declScore = 0; }
            else if (typeof declValRaw === 'number') {
                declValNum = declValRaw;
                declLabel = `Niveau ${declValNum}/5 — ${LEVELS[declValNum - 1] || ''}`;
                declScore = Math.round(declValNum / 5 * 100);
            } else {
                declLabel = 'Non répondu';
            }

            const dataScore = m ? m.score : null;
            const dataVal   = m ? m.val   : null;
            const dataRule  = m ? m.rule  : null;

            // Gap
            let gap = null;
            if (declScore !== null && dataScore !== null) {
                gap = declScore - dataScore;
            }

            // Aggregations pour le résumé de catégorie
            if (declScore !== null) { totalDecl += declScore; declCount++; }
            if (dataScore !== null) { totalData += dataScore; dataCount++; }

            const advice = (declValRaw !== undefined && declValRaw !== null)
                ? getAdvice(q.id, declValRaw)
                : null;

            items.push({
                num: i + 1, q: q.q, declLabel, declScore,
                dataVal, dataRule, dataScore, gap, advice
            });
        });

        questionsByCategory[cat.id] = {
            label: cat.label, icon: cat.icon, color: cat.color,
            avgDecl: declCount > 0 ? Math.round(totalDecl / declCount) : null,
            avgData: dataCount > 0 ? Math.round(totalData / dataCount) : null,
            count: qs.length,
            items
        };
    });

    // Niveau → couleur d'accent
    const accent = score >= 80 ? '#10b981'
                 : score >= 60 ? '#3b82f6'
                 : score >= 40 ? '#f59e0b'
                 : '#ef4444';
    const accentSoft = score >= 80 ? '#d1fae5'
                     : score >= 60 ? '#dbeafe'
                     : score >= 40 ? '#fef3c7'
                     : '#fee2e2';

    // Helper : escape HTML pour le contenu utilisateur
    const esc = (s) => String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    // ---- Sections d'actions ----
    let sectionsHTML = '';
    Object.entries(categoriesMap).forEach(([cat, actions]) => {
        const items = actions.map(a => `<li>${esc(a)}</li>`).join('');
        sectionsHTML += `
        <section class="axis">
            <h3>${esc(cat)} <span class="axis-count">${actions.length} action${actions.length > 1 ? 's' : ''}</span></h3>
            <ul>${items}</ul>
        </section>`;
    });

    // ---- Sections d'actions NON retenues (accordéon) ----
    let unselectedHTML = '';
    Object.entries(unselectedMap).forEach(([cat, actions]) => {
        const items = actions.map(a => `<li>${esc(a)}</li>`).join('');
        unselectedHTML += `
        <section class="axis-skip">
            <h3>${esc(cat)} <span class="axis-count-skip">${actions.length}</span></h3>
            <ul>${items}</ul>
        </section>`;
    });

    // ---- HTML du détail des questions (sections dépliables) ----
    let questionsHTML = '';
    let totalQuestionsRendered = 0;

    Object.values(questionsByCategory).forEach(cat => {
        if (cat.items.length === 0) return;
        totalQuestionsRendered += cat.items.length;

        const itemsHTML = cat.items.map(it => {
            // Pills
            let pills = '';
            pills += `<span class="q-pill q-decl">✋ ${esc(it.declLabel)}</span>`;
            if (it.dataVal !== null && it.dataVal !== undefined) {
                pills += `<span class="q-pill q-data">📊 ${esc(it.dataVal)}${it.dataRule ? ` <span class="q-rule">· règle : ${esc(it.dataRule)}</span>` : ''}</span>`;
            }
            if (it.gap !== null) {
                const absG = Math.abs(it.gap);
                if (absG < 15) {
                    pills += `<span class="q-pill q-gap-ok">✓ Aligné</span>`;
                } else if (it.gap > 0) {
                    pills += `<span class="q-pill q-gap-up">↑ +${Math.round(it.gap)} (déclaration optimiste)</span>`;
                } else {
                    pills += `<span class="q-pill q-gap-down">↓ ${Math.round(it.gap)} (data sous-évaluée)</span>`;
                }
            }

            const adviceHTML = it.advice
                ? `<div class="q-advice">💡 ${esc(it.advice)}</div>`
                : '';

            // Border-left selon gap
            let borderColor = '#ecebf3';
            if (it.gap !== null) {
                const absG = Math.abs(it.gap);
                if (absG < 15) borderColor = '#10b981';
                else if (it.gap > 0) borderColor = '#f59e0b';
                else borderColor = '#3b82f6';
            }

            return `
            <div class="q-item" style="border-left-color:${borderColor}">
                <div class="q-text"><span class="q-num">${it.num}.</span> ${esc(it.q)}</div>
                <div class="q-pills">${pills}</div>
                ${adviceHTML}
            </div>`;
        }).join('');

        const summaryStats = [];
        if (cat.avgDecl !== null) summaryStats.push(`Déclaratif : <strong>${cat.avgDecl}/100</strong>`);
        if (cat.avgData !== null) summaryStats.push(`Data : <strong>${cat.avgData}/100</strong>`);
        const summaryStatsHTML = summaryStats.length ? ` <span class="q-cat-stats">${summaryStats.join(' · ')}</span>` : '';

        questionsHTML += `
        <details class="q-cat" style="border-left-color:${cat.color}">
            <summary>
                <span class="q-cat-icon">${cat.icon}</span>
                <span class="q-cat-label">${esc(cat.label)}</span>
                <span class="q-cat-count">${cat.items.length} question${cat.items.length > 1 ? 's' : ''}</span>
                ${summaryStatsHTML}
                <span class="q-cat-chev">▾</span>
            </summary>
            <div class="q-items">
                ${itemsHTML}
            </div>
        </details>`;
    });

    const generatedAt = new Date().toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });

    // ---- Document HTML complet ----
    const doc = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Plan DevOps — ${esc(squad)} — ${esc(date)}</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #f4f4f7; }
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #1e1b2e;
        line-height: 1.6;
        padding: 40px 20px;
    }
    .page {
        max-width: 880px; margin: 0 auto;
        background: #fff;
        border-radius: 18px;
        box-shadow: 0 24px 60px -20px rgba(102,126,234,0.25), 0 8px 24px -8px rgba(0,0,0,0.08);
        overflow: hidden;
    }

    /* Hero */
    .hero {
        position: relative;
        padding: 48px 56px 56px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #fff;
        overflow: hidden;
    }
    .hero::before {
        content: ''; position: absolute; inset: 0;
        background:
            radial-gradient(800px 300px at 100% -10%, var(--ov-18), transparent 60%),
            radial-gradient(500px 200px at -10% 110%, var(--ov-1), transparent 60%);
        pointer-events: none;
    }
    .hero > * { position: relative; }
    .eyebrow {
        font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase;
        opacity: 0.75; margin-bottom: 14px;
    }
    .hero h1 {
        font-size: 34px; font-weight: 800; letter-spacing: -0.02em;
        margin-bottom: 22px; line-height: 1.15;
    }
    .meta-grid {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
        margin-top: 8px;
    }
    .meta-card {
        background: var(--ov-13);
        backdrop-filter: blur(10px);
        border: 1px solid var(--ov-22);
        border-radius: 12px;
        padding: 14px 18px;
    }
    .meta-card .label {
        font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
        text-transform: uppercase; opacity: 0.72; margin-bottom: 6px;
    }
    .meta-card .value {
        font-size: 17px; font-weight: 700;
    }

    /* Score block */
    .score-block {
        display: grid; grid-template-columns: auto 1fr; gap: 36px;
        align-items: center;
        padding: 40px 56px;
        border-bottom: 1px solid #ecebf3;
    }
    .gauge {
        position: relative; width: 168px; height: 168px;
    }
    .gauge svg { transform: rotate(-90deg); }
    .gauge .gv-text {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
    }
    .gauge .gv-num {
        font-size: 44px; font-weight: 800; color: ${accent}; line-height: 1;
    }
    .gauge .gv-sub {
        font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
        text-transform: uppercase; color: #8a8499; margin-top: 6px;
    }
    .score-info .level-pill {
        display: inline-block; padding: 6px 14px; border-radius: 999px;
        background: ${accentSoft}; color: ${accent};
        font-size: 12px; font-weight: 700; letter-spacing: 0.04em;
        margin-bottom: 14px;
    }
    .score-info h2 {
        font-size: 24px; font-weight: 800; letter-spacing: -0.01em;
        color: #1e1b2e; margin-bottom: 10px;
    }
    .score-info p {
        color: #5a5570; font-size: 14px; max-width: 460px;
    }
    .stat-row {
        display: flex; gap: 24px; margin-top: 18px;
    }
    .stat-row .stat {
        font-size: 13px; color: #5a5570;
    }
    .stat-row .stat strong {
        color: #1e1b2e; font-size: 17px; font-weight: 800; display: block;
    }

    /* Body */
    .body {
        padding: 40px 56px 48px;
    }
    .body > h2 {
        font-size: 13px; font-weight: 700; letter-spacing: 0.14em;
        text-transform: uppercase; color: #8a8499;
        margin-bottom: 20px;
        padding-bottom: 14px;
        border-bottom: 1px solid #ecebf3;
    }
    .axis {
        margin-bottom: 28px;
        padding: 22px 24px;
        background: #fafafe;
        border: 1px solid #ecebf3;
        border-left: 4px solid #764ba2;
        border-radius: 12px;
    }
    .axis h3 {
        font-size: 17px; font-weight: 800; color: #1e1b2e;
        margin-bottom: 14px;
        display: flex; align-items: center; gap: 10px;
    }
    .axis-count {
        font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
        background: #ece9f6; color: #764ba2;
        padding: 3px 10px; border-radius: 999px;
    }
    .axis ul {
        list-style: none; padding: 0;
    }
    .axis li {
        position: relative;
        padding: 10px 0 10px 30px;
        border-bottom: 1px dashed #ecebf3;
        font-size: 14px; color: #2c2840;
    }
    .axis li:last-child { border-bottom: none; }
    .axis li::before {
        content: '✓';
        position: absolute; left: 0; top: 50%; transform: translateY(-50%);
        width: 20px; height: 20px;
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: #fff; font-size: 12px; font-weight: 800;
        display: flex; align-items: center; justify-content: center;
        border-radius: 50%;
    }

    /* Empty state — aucune action retenue */
    .empty-actions {
        text-align: center;
        padding: 32px 20px;
        background: #fafafe;
        border: 1px dashed #d8d3e8;
        border-radius: 12px;
    }
    .empty-icon { font-size: 36px; margin-bottom: 10px; opacity: 0.7; }
    .empty-title {
        font-size: 15px; font-weight: 800; color: #5a5570;
        margin-bottom: 6px;
    }
    .empty-sub {
        font-size: 13px; color: #8a8499; line-height: 1.5;
        max-width: 440px; margin: 0 auto;
    }

    /* Actions NON retenues (accordéon, secondaire) */
    .skip-section {
        padding: 0 56px 24px;
    }
    details.skip-block {
        background: #fafafe;
        border: 1px dashed #d8d3e8;
        border-radius: 12px;
        overflow: hidden;
    }
    details.skip-block summary {
        padding: 14px 20px;
        cursor: pointer;
        list-style: none;
        display: flex;
        align-items: center;
        gap: 12px;
        user-select: none;
        font-size: 13px;
        color: #5a5570;
    }
    details.skip-block summary::-webkit-details-marker { display: none; }
    .skip-icon { font-size: 16px; opacity: 0.7; }
    .skip-label { font-weight: 700; color: #5a5570; flex: 1; letter-spacing: 0.02em; }
    .skip-count {
        font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
        background: #ece9f6; color: #8a8499;
        padding: 3px 10px; border-radius: 999px;
    }
    .skip-chev {
        font-size: 14px; color: #8a8499;
        transition: transform 0.2s;
    }
    details.skip-block[open] .skip-chev { transform: rotate(180deg); }
    .skip-body {
        padding: 14px 20px 18px;
        border-top: 1px dashed #d8d3e8;
    }
    .skip-body .skip-intro {
        font-size: 12px; color: #8a8499; font-style: italic;
        margin-bottom: 14px; line-height: 1.5;
    }
    section.axis-skip {
        margin-bottom: 14px;
        padding: 12px 16px;
        background: #fff;
        border: 1px solid #ecebf3;
        border-radius: 10px;
    }
    section.axis-skip h3 {
        font-size: 13px; font-weight: 700; color: #5a5570;
        margin-bottom: 8px;
        display: flex; align-items: center; gap: 8px;
    }
    .axis-count-skip {
        font-size: 10px; font-weight: 700;
        background: #f0eef7; color: #8a8499;
        padding: 2px 8px; border-radius: 999px;
    }
    section.axis-skip ul {
        list-style: none; padding: 0;
    }
    section.axis-skip li {
        position: relative;
        padding: 6px 0 6px 24px;
        font-size: 12.5px; color: #8a8499;
        border-bottom: 1px dashed #ecebf3;
        line-height: 1.5;
    }
    section.axis-skip li:last-child { border-bottom: none; }
    section.axis-skip li::before {
        content: '○';
        position: absolute; left: 4px; top: 50%; transform: translateY(-50%);
        color: #c5bfd6; font-size: 14px; font-weight: 700;
    }

    /* Détail des questions (dépliables) */
    .questions-section {
        padding: 8px 56px 40px;
    }
    .questions-section > h2 {
        font-size: 13px; font-weight: 700; letter-spacing: 0.14em;
        text-transform: uppercase; color: #8a8499;
        margin-bottom: 20px;
        padding-bottom: 14px;
        border-bottom: 1px solid #ecebf3;
    }
    details.q-cat {
        background: #fff;
        border: 1px solid #ecebf3;
        border-left: 4px solid #764ba2;
        border-radius: 12px;
        margin-bottom: 14px;
        overflow: hidden;
        transition: box-shadow 0.2s;
    }
    details.q-cat[open] {
        box-shadow: 0 4px 16px -8px rgba(102,126,234,0.25);
    }
    details.q-cat summary {
        padding: 16px 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 14px;
        list-style: none;
        user-select: none;
    }
    details.q-cat summary::-webkit-details-marker { display: none; }
    .q-cat-icon { font-size: 20px; }
    .q-cat-label { font-weight: 800; color: #1e1b2e; flex: 1; }
    .q-cat-count {
        font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
        background: #ece9f6; color: #764ba2;
        padding: 3px 10px; border-radius: 999px;
    }
    .q-cat-stats {
        font-size: 11px; color: #5a5570;
    }
    .q-cat-stats strong { color: #1e1b2e; font-weight: 800; }
    .q-cat-chev {
        font-size: 14px; color: #8a8499;
        transition: transform 0.2s;
    }
    details.q-cat[open] .q-cat-chev { transform: rotate(180deg); }
    .q-items {
        padding: 0 20px 18px;
        border-top: 1px solid #ecebf3;
    }
    .q-item {
        padding: 14px 16px;
        margin-top: 12px;
        background: #fafafe;
        border-radius: 10px;
        border-left: 3px solid #ecebf3;
    }
    .q-text {
        font-size: 13px; font-weight: 700; color: #1e1b2e;
        margin-bottom: 10px; line-height: 1.45;
    }
    .q-num {
        display: inline-block;
        color: #764ba2; font-weight: 800;
        margin-right: 4px;
    }
    .q-pills {
        display: flex; flex-wrap: wrap; gap: 6px;
        margin-bottom: 8px;
    }
    .q-pill {
        font-size: 11px; font-weight: 700;
        padding: 4px 10px; border-radius: 6px;
        line-height: 1.4;
    }
    .q-pill.q-decl { background: #f3f0fb; color: #5b3a93; }
    .q-pill.q-data { background: #eef4ff; color: #1e40af; }
    .q-rule { font-weight: 400; opacity: 0.7; }
    .q-pill.q-gap-ok   { background: #d1fae5; color: #065f46; }
    .q-pill.q-gap-up   { background: #fef3c7; color: #92400e; }
    .q-pill.q-gap-down { background: #dbeafe; color: #1e40af; }
    .q-advice {
        font-size: 12px; color: #5a5570;
        font-style: italic;
        padding: 8px 12px;
        background: #fff;
        border-radius: 6px;
        border: 1px solid #ecebf3;
        line-height: 1.5;
    }

    /* Footer */
    .footer {
        padding: 22px 56px 28px;
        border-top: 1px solid #ecebf3;
        font-size: 11px; color: #8a8499;
        display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;
    }
    .footer strong { color: #5a5570; }

    /* Print : tout déplier pour l'impression */
    @media print {
        body { background: #fff; padding: 0; }
        .page { box-shadow: none; border-radius: 0; }
        .axis, .axis-skip, .q-cat, .q-item, .skip-block { break-inside: avoid; }
        details.q-cat > .q-items,
        details.skip-block > .skip-body { display: block !important; }
        details.q-cat:not([open]) > summary ~ *,
        details.skip-block:not([open]) > summary ~ * { display: block !important; }
        .q-cat-chev, .skip-chev { display: none; }
    }
</style>
</head>
<body>
<div class="page">
    <header class="hero">
        <div class="eyebrow">DevOps Hub · Plan d'accompagnement</div>
        <h1>🎯 Plan DevOps — ${esc(squad)}</h1>
        <div class="meta-grid">
            <div class="meta-card">
                <div class="label">Squad</div>
                <div class="value">${esc(squad)}</div>
            </div>
            <div class="meta-card">
                <div class="label">Tribu</div>
                <div class="value">${esc(tribu)}</div>
            </div>
            <div class="meta-card">
                <div class="label">Date</div>
                <div class="value">${esc(date)}</div>
            </div>
        </div>
    </header>

    <section class="score-block">
        <div class="gauge">
            <svg width="168" height="168" viewBox="0 0 168 168">
                <circle cx="84" cy="84" r="74" fill="none" stroke="#ecebf3" stroke-width="14"/>
                <circle cx="84" cy="84" r="74" fill="none" stroke="${accent}" stroke-width="14"
                        stroke-linecap="round"
                        stroke-dasharray="${(score / 100 * 2 * Math.PI * 74).toFixed(2)} ${(2 * Math.PI * 74).toFixed(2)}"/>
            </svg>
            <div class="gv-text">
                <div class="gv-num">${score}</div>
                <div class="gv-sub">/ 100</div>
            </div>
        </div>
        <div class="score-info">
            <span class="level-pill">${esc(level)}</span>
            <h2>Score global de maturité</h2>
            <p>Plan d'accompagnement issu de l'évaluation déclarative croisée avec les données GitLab. Les actions ci-dessous ont été sélectionnées pour combler les écarts identifiés.</p>
            <div class="stat-row">
                <div class="stat"><strong>${Object.keys(categoriesMap).length}</strong>Axes</div>
                <div class="stat"><strong>${totalActions}</strong>Actions</div>
            </div>
        </div>
    </section>

    <main class="body">
        <h2>Actions retenues</h2>
        ${totalActions > 0 ? sectionsHTML : `
        <div class="empty-actions">
            <div class="empty-icon">🎯</div>
            <div class="empty-title">Aucune action retenue pour ce plan</div>
            <div class="empty-sub">Ce rapport présente l'évaluation de maturité ${totalUnselected > 0 ? `et un backlog de ${totalUnselected} action${totalUnselected > 1 ? 's' : ''} disponibles` : ''}.</div>
        </div>`}
    </main>

    ${totalUnselected > 0 ? `<section class="skip-section">
        <details class="skip-block">
            <summary>
                <span class="skip-icon">📦</span>
                <span class="skip-label">Actions non retenues — backlog</span>
                <span class="skip-count">${totalUnselected} action${totalUnselected > 1 ? 's' : ''}</span>
                <span class="skip-chev">▾</span>
            </summary>
            <div class="skip-body">
                <div class="skip-intro">Ces actions ont été identifiées par le diagnostic mais n'ont pas été retenues pour ce trimestre. Elles restent disponibles pour les itérations suivantes.</div>
                ${unselectedHTML}
            </div>
        </details>
    </section>` : ''}

    ${totalQuestionsRendered > 0 ? `<section class="questions-section">
        <h2>Détail de l'évaluation — questions &amp; résultats</h2>
        ${questionsHTML}
    </section>` : ''}

    <footer class="footer">
        <span>Généré par <strong>DevOps Hub</strong> · Maturité DevOps</span>
        <span>${esc(generatedAt)}</span>
    </footer>
</div>
</body>
</html>`;

    // ---- Téléchargement ----
    const safeSquad = squad.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'squad';
    const filename = `plan-devops_${safeSquad}_${date}.html`;
    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
