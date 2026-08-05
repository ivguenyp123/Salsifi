/* salsi/qa · dora.js — DORA : base de connaissances, calculs, rapports (chargé 2e). */

'use strict';

    function d_secrets() { return { html: `🔎 Pour les <b>secrets exposés</b>, c'est un scan à part (lourd) : ouvre le <b>Secrets Scanner</b> / la <b>Gouvernance</b>. Je ne le lance pas en direct ici.` }; }
    function d_etat() {
        try { if (typeof window.salsiBriefShow === 'function') { window.salsiBriefShow(); return { html: `📋 J'ouvre le <b>bilan complet</b> de ton repo (sécurité, bus factor, activité, DORA…) — regarde la fenêtre qui s'affiche. 👉` }; } } catch (e) { }
        return { html: `Ouvre le <b>bilan</b> via la pastille 🌱 Salsi en haut du hub (sélectionne d'abord un repo).` };
    }
    // « quelles sont mes priorités de la journée » → ouvre le bilan Salsi (top 5, sécu d'abord).
    function d_priorities() {
        try { if (typeof window.salsiBriefShow === 'function') { window.salsiBriefShow(); return { html: `🎯 J'ouvre tes <b>priorités du jour</b> — le bilan Salsi te classe le <b>top 5</b> à traiter (la sécurité d'abord), en analysant ton repo. 👉` }; } } catch (e) { }
        return { html: `Tes <b>priorités</b> s'affichent via la pastille 🌱 <b>Salsi</b> en haut du hub — sélectionne d'abord un repo, et je te sors le top 5 à traiter.` };
    }

    // ══════════════════════════════════════════════════════════════════
    //  SAVOIR DORA — miroir fidèle du module DORA Insights (js/insights.js)
    //  Seuils = doraLevel() · Leviers/stakes/measure = DORA_COACH · Score = renderGlobalScore
    //  On ne réinvente rien : Salsi répond avec le contenu exact de la maquette.
    // ══════════════════════════════════════════════════════════════════
    var DORA_KB = {
        df: {
            emoji: '🚀', label: 'Fréquence de déploiement', short: 'fréquence de déploiement',
            def: 'À quelle fréquence tu livres en prod. Souvent = petits lots, moins de risque à chaque mise en prod, retour terrain rapide.',
            calc: 'pipelines <i>success</i> en prod sur 30 j × 7 (dédupliqués par commit).',
            // notes Elite→Low, seuils exacts de doraLevel('df')
            levels: [
                { lv: 'Elite', ic: '🟢', th: '≥ 7 déploiements/sem' },
                { lv: 'High', ic: '🔵', th: '1 à 7 /sem' },
                { lv: 'Medium', ic: '🟡', th: '0,25 à 1 /sem (≈ 1 par mois → 1 par semaine)' },
                { lv: 'Low', ic: '🔴', th: '< 0,25 /sem (moins d\'1 par mois)' }
            ],
            target: '≥ 7 déploiements/sem (Elite)',
            stakes: 'Déployer souvent, c\'est livrer par petits lots : moins de risque à chaque mise en prod, un retour terrain rapide, et la fin des « big bang » stressants.',
            levers: [
                { t: 'Automatiser le déploiement (CD)', d: 'Un merge sur la branche par défaut déclenche le déploiement, sans geste manuel. Tant qu\'un humain doit « lancer » la prod, la fréquence plafonne.', mod: 'Pipeline Generator', page: 'pipeline-generator.html' },
                { t: 'Découper en petites MR', d: 'Vise des MR sous ~200 lignes : elles se relisent et se mergent dans la journée. Plus tu fusionnes petit et souvent, plus tu déploies.' },
                { t: 'Feature flags', d: 'Déploie du code inactif derrière un flag pour découpler « déployer » de « activer ».', mod: 'Feature Flag Manager', page: 'feature-flag-manager.html' },
                { t: 'Branches courtes (trunk-based)', d: 'Branche → merge en quelques jours max, sinon ça finit en gros merges rares.' },
                { t: 'Pipeline rapide et fiable', d: 'Un CI vert en quelques minutes rend le déploiement fréquent tenable.' }
            ],
            measure: 'Je te sais en progrès quand le nombre de pipelines réussis par semaine grimpe.',
            atl: 'pipeline deploiement automatisation ci cd trunk'
        },
        lt: {
            emoji: '⚡', label: 'Lead Time', short: 'lead time',
            def: 'Le délai entre « le dev commence » (premier commit) et « c\'est en prod » (merge). Long = de la valeur qui dort et des reviews qui traînent.',
            calc: 'médiane du délai premier commit → merge de tes MR fusionnées (30 j).',
            levels: [
                { lv: 'Elite', ic: '🟢', th: '≤ 24 h (moins d\'un jour)' },
                { lv: 'High', ic: '🔵', th: '≤ 1 semaine (24 h → 168 h)' },
                { lv: 'Medium', ic: '🟡', th: '≤ 1 mois (168 h → 720 h)' },
                { lv: 'Low', ic: '🔴', th: '> 1 mois (720 h+)' }
            ],
            target: '≤ 24 h premier commit → prod (Elite)',
            stakes: 'Un Lead Time long, c\'est de la valeur qui dort, des reviews qui traînent et du contexte perdu entre l\'écriture et la livraison.',
            levers: [
                { t: 'Réduire la taille des MR', d: 'Une petite MR se relit en minutes ; une grosse traîne des jours. C\'est le levier n°1 sur le lead time.', mod: 'MR Reviewer', page: 'mr-reviewer.html' },
                { t: 'Un SLA de review', d: 'Fixe une attente d\'équipe (ex. première review < 4 h ouvrées), revieweurs désignés + notifications. La review qui dort est souvent le plus gros du délai.' },
                { t: 'Merger dès que c\'est vert', d: 'Une MR approuvée au pipeline vert ne devrait pas attendre. Traque les MR « prêtes mais pas mergées ».' },
                { t: 'Limiter le travail en cours', d: 'Trop de MR ouvertes en parallèle = rien n\'avance. Fini d\'abord, commence ensuite.' },
                { t: 'Automatiser les checks bloquants', d: 'Lint, format, tests : laisse le CI le faire, la review s\'éternise moins.' }
            ],
            measure: 'Ta progression se lit sur la médiane premier commit → merge de tes MR fusionnées.',
            atl: 'revue review mr taille wip cycle livraison flux goulot'
        },
        cfr: {
            emoji: '🔧', label: 'Change Failure Rate (CFR)', short: 'taux d\'échec (CFR)',
            def: 'La part de tes livraisons prod qui cassent (échec / rollback). Trop haut : tu vas vite mais tu casses souvent.',
            calc: 'pipelines prod (main/master) en échec / total × 100, pondéré vers le récent (fenêtres 5 j / 10 j / 30 j).',
            levels: [
                { lv: 'Elite', ic: '🟢', th: '≤ 5 % des déploiements en échec' },
                { lv: 'High', ic: '🔵', th: '≤ 10 %' },
                { lv: 'Medium', ic: '🟡', th: '≤ 15 %' },
                { lv: 'Low', ic: '🔴', th: '> 15 %' }
            ],
            target: '≤ 5 % de déploiements en échec (Elite)',
            stakes: 'Un CFR trop haut, c\'est des rollbacks, du stress, et une confiance qui s\'érode à chaque incident.',
            levers: [
                { t: 'Quality gates avant merge', d: 'Pipeline vert obligatoire, review obligatoire, branche par défaut protégée : rendre le merge d\'un changement non vérifié impossible.', mod: 'Gouvernance repo', page: 'gouvernance-repo.html' },
                { t: 'Tests automatisés sur les chemins critiques', d: 'Sans filet, chaque déploiement est un pari. Couvre d\'abord les parcours qui font mal quand ils cassent.' },
                { t: 'Un staging représentatif', d: 'Tester « comme en prod » attrape les surprises de config et d\'environnement avant les utilisateurs.' },
                { t: 'Des changements plus petits', d: 'Un petit changement casse moins souvent et se diagnostique en minutes.' },
                { t: 'Deux paires d\'yeux sur les zones sensibles', d: 'Sur le code critique, exige une vraie revue. Le coût d\'une review << le coût d\'un rollback.' }
            ],
            measure: 'Ta progression se lit sur le % de pipelines prod (main/master) en échec, pondéré vers le récent.',
            atl: 'test couverture qualite quality gate rollback tdd'
        },
        mttr: {
            emoji: '⏱️', label: 'Temps de restauration (MTTR / TTRS)', short: 'temps de restauration (MTTR)',
            def: 'Le temps pour revenir à la normale après un incident. La résilience compte autant que la vitesse.',
            calc: 'médiane de la durée pipeline en échec → succès qui restaure, sur branche prod.',
            levels: [
                { lv: 'Elite', ic: '🟢', th: '≤ 1 h pour restaurer' },
                { lv: 'High', ic: '🔵', th: '≤ 24 h (moins d\'un jour)' },
                { lv: 'Medium', ic: '🟡', th: '≤ 1 semaine (24 h → 168 h)' },
                { lv: 'Low', ic: '🔴', th: '> 1 semaine (168 h+)' }
            ],
            target: '≤ 1 h pour restaurer le service (Elite)',
            stakes: 'Un MTTR long, c\'est un incident qui dure, donc de l\'impact utilisateur. Ça finira par casser — la question c\'est en combien de temps tu reviens.',
            levers: [
                { t: 'Rollback en un geste', d: 'Revenir à la version précédente en une commande (ou un clic) transforme un incident d\'une heure en incident de cinq minutes.' },
                { t: 'Détecter vite', d: 'Alerting sur les pipelines/déploiements en échec + monitoring des symptômes : on ne restaure pas ce qu\'on n\'a pas vu tomber.' },
                { t: 'Déployer petit et souvent', d: 'Un petit changement est plus facile à annuler et diagnostiquer.' },
                { t: 'Couper via un feature flag', d: 'Désactiver la fonctionnalité fautive sans redéployer : la remédiation la plus rapide qui soit.', mod: 'Feature Flag Manager', page: 'feature-flag-manager.html' },
                { t: 'Des runbooks', d: 'Une procédure écrite pour les incidents fréquents évite d\'improviser sous pression.' }
            ],
            measure: 'Ta progression se lit sur le temps médian entre un pipeline en échec et le succès qui restaure.',
            atl: 'incident monitoring alerting observabilite rollback post mortem runbook resilience'
        }
    };
    var DORA_ORDER = { Low: 0, Medium: 1, High: 2, Elite: 3 };
    // Détecte de quelle mesure DORA parle la question (ou null).
    function doraKeyFromN(n) {
        if (/\bcfr\b|taux d echec|change failure|echec de changement|stabilite|ca casse|je casse|on casse/.test(n)) return 'cfr';
        if (/\bmttr\b|ttrs|restauration|time to restore|temps de reprise|resilience|recuperation/.test(n)) return 'mttr';
        if (/lead time|\blt\b|delai de livraison|temps de cycle|cycle time|delai de mise en prod/.test(n)) return 'lt';
        if (/frequence de deploiement|deployment frequency|deploy freq|\bdf\b|deployer|deploiement|livrer plus souvent|frequence.*deploi/.test(n)) return 'df';
        return null;
    }
    // « comment améliorer ma mesure » → plan condensé fidèle au Coach du module.
    function d_dora_improve(key, n) {
        // pas de mesure ciblée → on prend la plus faible du cache, sinon on propose de choisir.
        var suggestNote = '';
        if (!key) {
            var c = repoCtx(); var pid = c.err ? targetRepo() : c.pid;
            var DH = Salsifi.doraHistory, h = (DH && pid) ? DH.read(pid) : [];
            if (h && h.length) {
                var lv = h[h.length - 1].levels || {}, worst = null, worstRank = 99;
                ['df', 'lt', 'cfr', 'mttr'].forEach(function (k) { var r = DORA_ORDER[lv[k]]; if (typeof r === 'number' && r < worstRank) { worstRank = r; worst = k; } });
                if (worst) { key = worst; suggestNote = `👉 Je te suggère d'attaquer <b>${DORA_KB[key].label}</b> — c'est ta mesure la plus basse (<b>${esc(lv[key])}</b>).<br>`; }
            }
            if (!key) {
                return { html: `Sur quelle des <b>4 mesures DORA</b> veux-tu progresser ? 🌱<br>🚀 <b>fréquence de déploiement</b> · ⚡ <b>lead time</b> · 🔧 <b>CFR</b> (taux d'échec) · ⏱️ <b>MTTR</b> (restauration).<br>Dis-moi « améliorer mon <b>lead time</b> » — ou ouvre le <b>Coach Salsi</b> dans <a href="insights.html" target="_blank" rel="noopener">DORA Insights ↗</a> pour un plan complet suivi dans le temps.` };
            }
        }
        var m = DORA_KB[key];
        var levers = m.levers.slice(0, 3).map(function (l) {
            var mod = l.mod ? ` <a href="${esc(l.page)}" target="_blank" rel="noopener">🧰 ${esc(l.mod)} ↗</a>` : '';
            return `<div class="sqa-atl"><b>${esc(l.t)}</b>${mod}<div class="sqa-atl-d">${esc(l.d)}</div></div>`;
        }).join('');
        var more = m.levers.length > 3 ? `<div class="sqa-hint">+${m.levers.length - 3} autres leviers dans le <b>Coach Salsi</b> (DORA Insights).</div>` : '';
        // Un atelier d'accompagnement relié à la mesure (parmi les 205).
        var atlTop = scoreAteliers(m.atl.split(' '))[0];
        var atlHtml = atlTop ? `<div class="sqa-hint">🎓 Atelier pour se faire accompagner :</div>${atelierCard(atlTop.a)}` : '';
        return {
            html: `${suggestNote}${m.emoji} <b>Améliorer ta ${esc(m.short)}</b> — cap : <b>${esc(m.target)}</b>.<br><span class="sqa-hint">${esc(m.stakes)}</span>${levers}${more}` +
                `<div class="sqa-atl-x">📏 ${esc(m.measure)}</div>${atlHtml}` +
                `<div class="sqa-hint">Plan complet + suivi dans le temps → <b>Coach Salsi</b> dans <a href="insights.html" target="_blank" rel="noopener">DORA Insights ↗</a>.</div>`
        };
    }
    // « les notes / niveaux DORA » → les 4 paliers, seuils exacts. key ⇒ une mesure, sinon les 4.
    function d_dora_levels(key) {
        function block(k) {
            var m = DORA_KB[k];
            var rows = m.levels.map(function (L) { return `${L.ic} <b>${L.lv}</b> — ${esc(L.th)}`; }).join('<br>');
            return `${m.emoji} <b>${esc(m.label)}</b><br>${rows}`;
        }
        if (key) return { html: block(key) };
        return {
            html: `📊 Les <b>4 niveaux DORA</b> (🟢 Elite · 🔵 High · 🟡 Medium · 🔴 Low), seuils par mesure :<br><br>` +
                ['df', 'lt', 'cfr', 'mttr'].map(block).join('<br><br>') +
                `<div class="sqa-hint">Le score global /100 combine ces 4 niveaux — demande-moi « comment est calculé le score DORA ».</div>`
        };
    }
    // « comment est calculé le score DORA » → la formule exacte du module.
    function d_dora_scorecalc() {
        return {
            html: `🎯 <b>Score DORA /100</b> : chaque mesure vaut des points selon son niveau — 🟢 Elite <b>100</b> · 🔵 High <b>70</b> · 🟡 Medium <b>40</b> · 🔴 Low <b>15</b>. Le score = la <b>moyenne</b> des 4.<br>` +
                `Niveau global : ≥ 85 🏆 Elite · ≥ 60 ✅ High · ≥ 35 📈 Medium · sinon ⚠️ Low.<br>` +
                `<span class="sqa-hint">⚠️ Si le <b>MTTR</b> manque, le score est plafonné à 75 (Elite interdit) : sans mesure de résilience, on ne peut pas garantir le haut du tableau. Si 2 mesures+ manquent, plafond à 50.</span>`
        };
    }
    // « génère-moi le rapport de mes DORA » → construit le rapport HTML (miroir du
    // module) depuis le cache DORA et le télécharge. Zéro donnée re-fetchée : on
    // utilise la dernière analyse mémorisée par DORA Insights.
    function doraFmtVal(metric, v) {
        if (v == null) return '—';
        if (metric === 'df') return v + '/sem';
        if (metric === 'cfr') return v + '%';
        return v >= 24 ? (v / 24).toFixed(1) + 'j' : v + 'h';
    }
    function triggerDownload(filename, content, mime) {
        try {
            var blob = new Blob([content], { type: (mime || 'text/html') + ';charset=utf-8' });
            var url = URL.createObjectURL(blob), a = document.createElement('a');
            a.href = url; a.download = filename; document.body.appendChild(a); a.click();
            document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
            return true;
        } catch (e) { return false; }
    }
    function d_dora_report() {
        var c = repoCtx(); if (c.err) return c.err;
        var DH = Salsifi.doraHistory, h = (DH && DH.read) ? DH.read(c.pid) : [];
        if (!h || !h.length) return { html: `Je n'ai pas encore de mesure DORA pour <b>${esc(c.name)}</b> — ouvre une fois <b>DORA Insights</b> (l'analyse se mémorise), puis redemande-moi « génère le rapport DORA ». 🌱` };
        var last = h[h.length - 1], m = last.metrics || {}, lv = last.levels || {}, cls = last.cls;
        var df = doraFmtVal('df', m.df), lt = doraFmtVal('lt', m.lt), cfr = doraFmtVal('cfr', m.cfr), mttr = doraFmtVal('mttr', m.mttrDora);
        var scoreValue = (typeof m.doraScore === 'number') ? Math.round(m.doraScore) : '—';
        var titles = { elite: '🏆 Elite Performer', high: '✅ High Performer', medium: '📈 Medium Performer', low: '⚠️ Low Performer' };
        var scoreLevel = cls ? (titles[cls] || cls) : 'Score indisponible';
        var dfB = lv.df || 'N/A', ltB = lv.lt || 'N/A', cfrB = lv.cfr || 'N/A', mttrB = lv.mttr || 'N/A';
        var now = new Date();
        var dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        var timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        var name = esc(c.name);
        var html = '<!DOCTYPE html>\n<html lang="fr"><head><meta charset="UTF-8"><title>Rapport DORA — ' + name + ' — ' + dateStr + '</title>'
            + '<style>:root{--o1:rgba(255,255,255,.05);--o2:rgba(255,255,255,.12);--o15:rgba(255,255,255,.15);--o07:rgba(255,255,255,.07)}'
            + '*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:linear-gradient(135deg,#1e1b4b,#312e81,#4c1d95);min-height:100vh;color:#fff;padding:40px}'
            + '.container{max-width:900px;margin:0 auto}.header{text-align:center;padding:40px;background:var(--o1);border-radius:24px;border:1px solid var(--o2);margin-bottom:40px}'
            + '.header h1{font-size:32px;font-weight:800;margin-bottom:8px}.header p{opacity:.7;font-size:15px}.project{display:inline-block;padding:10px 20px;background:var(--o15);border-radius:12px;font-size:16px;font-weight:600;margin-top:16px}'
            + '.section-title{font-size:20px;font-weight:700;margin:30px 0 16px;padding-bottom:10px;border-bottom:2px solid var(--o2)}.score-global{text-align:center;padding:30px;background:var(--o1);border-radius:20px;border:1px solid var(--o2);margin-bottom:30px}'
            + '.score-value{font-size:64px;font-weight:800}.score-level{font-size:20px;font-weight:700;margin-top:8px}.dora-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:30px}'
            + '.dora-card{background:var(--o1);border-radius:16px;padding:24px;border:1px solid var(--o2)}.dora-name{font-size:13px;font-weight:600;opacity:.8;margin-bottom:8px}.dora-val{font-size:36px;font-weight:800;margin-bottom:8px}'
            + '.dora-badge{display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600}.method-note{background:var(--o07);border:1px solid var(--o15);border-radius:12px;padding:16px;font-size:12px;opacity:.75;margin-top:20px;line-height:1.7}.footer{text-align:center;margin-top:40px;opacity:.5;font-size:13px}</style></head><body><div class="container">'
            + '<div class="header"><div style="font-size:56px;margin-bottom:16px">📊</div><h1>Rapport DORA Metrics</h1><p>Performance DevOps</p><div class="project">📦 ' + name + '</div><p style="margin-top:12px;font-size:13px;opacity:.6">Généré le ' + dateStr + ' à ' + timeStr + '</p></div>'
            + '<div class="score-global"><div class="score-value">' + scoreValue + '/100</div><div class="score-level">' + esc(scoreLevel) + '</div></div>'
            + '<div class="section-title">🎯 Les 4 métriques DORA</div><div class="dora-grid">'
            + '<div class="dora-card"><div class="dora-name">🚀 Deploy Frequency</div><div class="dora-val" style="color:#a5b4fc">' + esc(df) + '</div><span class="dora-badge" style="background:rgba(165,180,252,.2);color:#a5b4fc">' + esc(dfB) + '</span></div>'
            + '<div class="dora-card"><div class="dora-name">⚡ Lead Time for Changes</div><div class="dora-val" style="color:#6ee7b7">' + esc(lt) + '</div><span class="dora-badge" style="background:rgba(110,231,183,.2);color:#6ee7b7">' + esc(ltB) + '</span></div>'
            + '<div class="dora-card"><div class="dora-name">🔧 Change Failure Rate</div><div class="dora-val" style="color:#fca5a5">' + esc(cfr) + '</div><span class="dora-badge" style="background:rgba(252,165,165,.2);color:#fca5a5">' + esc(cfrB) + '</span></div>'
            + '<div class="dora-card"><div class="dora-name">⏱️ Time to Restore Service</div><div class="dora-val" style="color:#fcd34d">' + esc(mttr) + '</div><span class="dora-badge" style="background:rgba(252,211,77,.2);color:#fcd34d">' + esc(mttrB) + '</span></div></div>'
            + '<div class="method-note"><strong>Méthode de calcul</strong><br>DF : pipelines success sur env prod / 30j × 7<br>Lead Time : médiane first_commit_at → merged_at des MRs<br>CFR : pipelines failed / total pipelines × 100 (fenêtres pondérées 5j/10j/30j)<br>TTRS : médiane durée pipeline failed → success suivant sur branche prod<br><br><strong>⚠️ Note sur le score global :</strong> si MTTR est manquant, le score est plafonné à 75/100 maximum. Toute métrique absente réduit la fiabilité du score.</div>'
            + '<div class="footer">DevOps Hub © ' + now.getFullYear() + '</div></div></body></html>';
        var filename = 'DORA-' + String(c.name).replace(/[^a-zA-Z0-9]/g, '-') + '-' + now.toISOString().split('T')[0] + '.html';
        var okDl = triggerDownload(filename, html, 'text/html');
        if (!okDl) return { html: `😅 Je n'ai pas pu déclencher le téléchargement (blocage navigateur ?). Réessaie, ou exporte depuis <b>DORA Insights</b>.` };
        var when = last.at ? ` (analyse du <b>${esc(last.at)}</b>)` : '';
        return { html: `📄 Rapport DORA de <b>${name}</b> généré et téléchargé ✅${when}<br>Score <b>${scoreValue}/100</b> — ${esc(scoreLevel)}. Fichier : <code>${esc(filename)}</code>.<br><span class="sqa-hint">C'est un instantané de ta dernière analyse DORA. Rouvre <b>DORA Insights</b> pour rafraîchir les chiffres avant d'exporter.</span>` };
    }

    // ══════════════════════════════════════════════════════════════════
    //  RAPPORT D'ACTIVITÉ — jour / semaine / mois (miroir du Daily Report)
    //  Reproduit generateStandaloneReport() : santé, best-practices, jour-par-jour.
    //  NOUVEAU : le « jour » (days=1) qui n'existait pas dans le module.
    // ══════════════════════════════════════════════════════════════════
    function inRange(iso, a, b) { var t = Date.parse(iso); return !isNaN(t) && t >= a && t <= b; }
    function pctScore(x) { return x >= 70 ? '#34d399' : x >= 40 ? '#fbbf24' : '#f87171'; }
    async function d_activity_report(days, label) {
        var c = repoCtx(); if (c.err) return c.err;
        var base = c.auth.gitlabUrl, tok = c.auth.token, P = c.pid;
        var end = new Date(), start = new Date(); start.setDate(start.getDate() - days + 1); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
        var aMs = start.getTime(), bMs = end.getTime(), after = start.toISOString(), before = end.toISOString();
        var pag = function (ep, mp) { return Salsifi.gitlabPaginate(base, tok, ep, { maxPages: mp || 3 }).catch(function () { return []; }); };
        var qr = `updated_after=${encodeURIComponent(after)}&updated_before=${encodeURIComponent(before)}`;
        var R;
        try {
            R = await Promise.all([
                pag(`/projects/${P}/pipelines?${qr}&order_by=updated_at&sort=desc`, 5),
                pag(`/projects/${P}/merge_requests?state=merged&${qr}`, 3),
                Salsifi.gitlabPaginate(base, tok, `/projects/${P}/merge_requests?state=opened`, { maxPages: 3 }).catch(function () { return []; }),
                pag(`/projects/${P}/merge_requests?state=closed&${qr}`, 2),
                pag(`/projects/${P}/deployments?${qr}`, 2),
                Salsifi.gitlabPaginate(base, tok, `/projects/${P}/repository/branches`, { maxPages: 3 }).catch(function () { return []; }),
                pag(`/projects/${P}/repository/commits?since=${encodeURIComponent(after)}&until=${encodeURIComponent(before)}`, 5)
            ]);
        } catch (e) { return { html: `😅 Je n'ai pas pu récupérer les données pour le rapport. Réessaie.` }; }
        var pipelines = (R[0] || []).filter(function (p) { return inRange(p.created_at, aMs, bMs); });
        var mrsMerged = (R[1] || []).filter(function (m) { return m.merged_at && inRange(m.merged_at, aMs, bMs); });
        var mrsOpen = R[2] || [];
        var mrsClosed = (R[3] || []).filter(function (m) { return inRange(m.updated_at || m.created_at, aMs, bMs); });
        var deployments = (R[4] || []).filter(function (d) { return inRange(d.created_at, aMs, bMs); });
        var branches = R[5] || [], commits = (R[6] || []).filter(function (cm) { return inRange(cm.created_at, aMs, bMs); });

        var total = pipelines.length, success = pipelines.filter(function (p) { return p.status === 'success'; }).length, failed = pipelines.filter(function (p) { return p.status === 'failed'; }).length;
        var rate = total ? Math.round(success / total * 100) : 0;
        var staleBranches = branches.filter(function (b) { var d = b.commit && (b.commit.committed_date || b.commit.created_at); return d && (Date.now() - Date.parse(d)) / 86400000 > 90; }).length;
        var oldMrs = mrsOpen.filter(function (mr) { return (Date.now() - Date.parse(mr.created_at)) / 86400000 > 7; }).length;
        var health = 100; if (rate < 80) health -= 20; if (rate < 60) health -= 15; if (staleBranches > 20) health -= 15; if (oldMrs > 5) health -= 10;
        health = Math.max(0, Math.min(100, health));
        var hText = health >= 80 ? 'Bonne santé' : health >= 50 ? 'À surveiller' : 'Critique', hColor = pctScore(health);

        // best-practices (formules exactes du module)
        var staleMrs = mrsOpen.map(function (mr) { return { ageDays: Math.floor((Date.now() - Date.parse(mr.created_at)) / 86400000), iid: mr.iid, title: mr.title }; }).filter(function (mr) { return mr.ageDays >= 2; }).sort(function (a, b) { return b.ageDays - a.ageDays; });
        var avgPipPerDay = total / Math.max(days, 1);
        var reviewScore = mrsOpen.length ? Math.max(0, Math.round(100 - (staleMrs.length / mrsOpen.length) * 100)) : 100;
        var branchScore = branches.length ? Math.max(0, Math.min(100, Math.round(100 - (staleBranches / branches.length) * 200))) : 100;
        var failRateScore = Math.max(0, 100 - (total ? Math.round(failed / total * 100) : 0));
        var practices = [
            { icon: '⚡', name: 'Pipeline Speed', score: Math.min(100, Math.round(avgPipPerDay > 0 ? 90 : 50)), detail: `${avgPipPerDay.toFixed(1)} pip/jour` },
            { icon: '✅', name: 'Success Rate', score: rate, detail: `${success}/${total} success` },
            { icon: '👀', name: 'Review Speed', score: reviewScore, detail: `${staleMrs.length} MR > 48h` },
            { icon: '🌿', name: 'Branch Hygiene', score: branchScore, detail: `${staleBranches} stale > 90j` },
            { icon: '🔴', name: 'Failure Rate', score: failRateScore, detail: `${failed} échecs` }
        ];
        var globalBP = Math.round(practices.reduce(function (s, p) { return s + p.score; }, 0) / practices.length);

        // jour-par-jour (bucket local)
        var dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'], daily = [];
        for (var i = days - 1; i >= 0; i--) {
            var dd = new Date(); dd.setDate(dd.getDate() - i); var ds = new Date(dd); ds.setHours(0, 0, 0, 0); var de = new Date(dd); de.setHours(23, 59, 59, 999);
            var s = ds.getTime(), e2 = de.getTime();
            daily.push({
                label: dayNames[dd.getDay()], date: dd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
                success: pipelines.filter(function (p) { return p.status === 'success' && inRange(p.created_at, s, e2); }).length,
                failed: pipelines.filter(function (p) { return p.status === 'failed' && inRange(p.created_at, s, e2); }).length,
                total: pipelines.filter(function (p) { return inRange(p.created_at, s, e2); }).length,
                mrsMerged: mrsMerged.filter(function (m) { return inRange(m.merged_at, s, e2); }).length,
                commits: commits.filter(function (cm) { return inRange(cm.created_at, s, e2); }).length
            });
        }
        // top failures par branche
        var failByRef = {}; pipelines.filter(function (p) { return p.status === 'failed'; }).forEach(function (p) { var ref = p.ref || 'unknown'; failByRef[ref] = (failByRef[ref] || 0) + 1; });
        var topFails = Object.keys(failByRef).map(function (k) { return { ref: k, n: failByRef[k] }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);

        var startStr = start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
        var endStr = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        var rangeStr = days === 1 ? endStr : (startStr + ' → ' + endStr);
        var nm = esc(c.name);
        // barres jour-par-jour
        var maxPip = Math.max.apply(null, daily.map(function (x) { return x.total; }).concat([1]));
        var bars = daily.map(function (x) {
            var hPct = Math.round((x.total / maxPip) * 100), fPct = x.total ? Math.round((x.failed / x.total) * 100) : 0;
            return `<div style="flex:1;text-align:center"><div style="height:90px;display:flex;align-items:flex-end;justify-content:center"><div title="${x.total} pipelines" style="width:60%;height:${Math.max(hPct, 2)}%;background:linear-gradient(180deg,#34d399 ${100 - fPct}%,#f87171 ${100 - fPct}%);border-radius:4px 4px 0 0"></div></div><div style="font-size:10px;opacity:.7;margin-top:4px">${esc(x.label)}</div><div style="font-size:9px;opacity:.5">${esc(x.date)}</div></div>`;
        }).join('');
        var practiceRows = practices.map(function (p) {
            return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>${p.icon} ${esc(p.name)} <span style="opacity:.6;font-size:11px">${esc(p.detail)}</span></span><b style="color:${pctScore(p.score)}">${p.score}</b></div><div style="height:7px;background:rgba(255,255,255,.1);border-radius:4px;overflow:hidden"><div style="height:100%;width:${p.score}%;background:${pctScore(p.score)}"></div></div></div>`;
        }).join('');
        var failRows = topFails.length ? topFails.map(function (f) { return `<tr><td style="padding:6px 10px"><code>${esc(f.ref)}</code></td><td style="padding:6px 10px;text-align:right;color:#f87171"><b>${f.n}</b></td></tr>`; }).join('') : `<tr><td colspan="2" style="padding:10px;opacity:.6">Aucun échec sur la période 🎉</td></tr>`;
        var staleRows = staleMrs.slice(0, 5).map(function (mr) { return `<tr><td style="padding:6px 10px">!${esc(mr.iid)} ${esc((mr.title || '').slice(0, 50))}</td><td style="padding:6px 10px;text-align:right">${mr.ageDays} j</td></tr>`; }).join('') || `<tr><td colspan="2" style="padding:10px;opacity:.6">Aucune MR ancienne 👍</td></tr>`;
        var dailyTable = daily.map(function (x) { return `<tr><td style="padding:5px 10px">${esc(x.label)} ${esc(x.date)}</td><td style="padding:5px 10px;text-align:center">${x.total}</td><td style="padding:5px 10px;text-align:center;color:#34d399">${x.success}</td><td style="padding:5px 10px;text-align:center;color:#f87171">${x.failed}</td><td style="padding:5px 10px;text-align:center">${x.mrsMerged}</td><td style="padding:5px 10px;text-align:center">${x.commits}</td></tr>`; }).join('');

        var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:linear-gradient(135deg,#0f172a,#1e293b,#312e81);min-height:100vh;color:#e2e8f0;padding:32px}.wrap{max-width:960px;margin:0 auto}.card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:24px;margin-bottom:20px}h1{font-size:28px;font-weight:800}h2{font-size:17px;font-weight:700;margin-bottom:14px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px}.stat{background:rgba(255,255,255,.04);border-radius:12px;padding:14px;text-align:center}.stat .v{font-size:26px;font-weight:800}.stat .l{font-size:11px;opacity:.6;margin-top:2px}table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;padding:6px 10px;opacity:.6;font-weight:600;border-bottom:1px solid rgba(255,255,255,.1)}tr{border-bottom:1px solid rgba(255,255,255,.05)}.foot{text-align:center;opacity:.4;font-size:12px;margin-top:8px}';
        var html = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rapport ' + esc(label) + ' — ' + nm + ' — ' + esc(rangeStr) + '</title><style>' + css + '</style></head><body><div class="wrap">'
            + '<div class="card" style="text-align:center"><div style="font-size:46px">📋</div><h1>Rapport ' + esc(label) + '</h1><p style="opacity:.7;margin-top:6px">📦 ' + nm + ' · ' + esc(rangeStr) + '</p>'
            + '<div style="display:inline-block;margin-top:16px;padding:10px 22px;border-radius:14px;background:' + hColor + '22;border:1px solid ' + hColor + '55"><span style="font-size:30px;font-weight:800;color:' + hColor + '">' + health + '/100</span> <span style="font-weight:700;color:' + hColor + '">' + hText + '</span></div></div>'
            + '<div class="card"><h2>📊 Vue d\'ensemble</h2><div class="grid">'
            + '<div class="stat"><div class="v">' + total + '</div><div class="l">Pipelines</div></div>'
            + '<div class="stat"><div class="v" style="color:#34d399">' + rate + '%</div><div class="l">Taux succès</div></div>'
            + '<div class="stat"><div class="v" style="color:#f87171">' + failed + '</div><div class="l">Échecs</div></div>'
            + '<div class="stat"><div class="v">' + mrsMerged.length + '</div><div class="l">MR mergées</div></div>'
            + '<div class="stat"><div class="v">' + mrsOpen.length + '</div><div class="l">MR ouvertes</div></div>'
            + '<div class="stat"><div class="v">' + deployments.length + '</div><div class="l">Déploiements</div></div>'
            + '<div class="stat"><div class="v">' + commits.length + '</div><div class="l">Commits</div></div></div></div>'
            + '<div class="card"><h2>📈 Activité jour par jour</h2><div style="display:flex;gap:6px;align-items:flex-end">' + bars + '</div>'
            + '<table style="margin-top:16px"><tr><th>Jour</th><th style="text-align:center">Pip.</th><th style="text-align:center">✅</th><th style="text-align:center">❌</th><th style="text-align:center">MR</th><th style="text-align:center">Commits</th></tr>' + dailyTable + '</table></div>'
            + '<div class="card"><h2>🎯 Bonnes pratiques — global <b style="color:' + pctScore(globalBP) + '">' + globalBP + '/100</b></h2>' + practiceRows + '</div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">'
            + '<div class="card"><h2>🔴 Top échecs par branche</h2><table>' + failRows + '</table></div>'
            + '<div class="card"><h2>⏳ MR qui traînent</h2><table>' + staleRows + '</table></div></div>'
            + '<div class="card foot">Généré par Salsi 🌱 · ' + esc(endStr) + ' · Données GitLab bornées (' + label.toLowerCase() + ')</div>'
            + '</div></body></html>';
        var filename = 'rapport-' + String(label).toLowerCase() + '-' + String(c.name).replace(/[^a-zA-Z0-9]/g, '-') + '-' + end.toISOString().split('T')[0] + '.html';
        if (!triggerDownload(filename, html, 'text/html')) return { html: `😅 Téléchargement bloqué par le navigateur. Réessaie.` };
        return { html: `📄 Rapport <b>${esc(label)}</b> de <b>${nm}</b> généré et téléchargé ✅ (${esc(rangeStr)}).<br>Santé <b style="color:${hColor}">${health}/100</b> — ${esc(hText)} · ${total} pipelines (${rate}% succès) · ${mrsMerged.length} MR mergées · ${commits.length} commits.<br>Fichier : <code>${esc(filename)}</code>.` };
    }

    // ══════════════════════════════════════════════════════════════════
    //  SAVOIR GAMING / ACHIEVEMENTS — miroir fidèle de js/gaming.js
    //  47 badges · 6 familles · 5 phases (gaming-history.js) · gate anti-vide.
    //  Recettes « comment débloquer » lues au runtime dans Salsifi.gamingRecipes.
    // ══════════════════════════════════════════════════════════════════
