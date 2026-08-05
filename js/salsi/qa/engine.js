/* salsi/qa · engine.js — routage des questions, panneau UI & câblage (chargé dernier). */

'use strict';

    var _lastIntent = null;   // mémoire de contexte pour les questions de suivi (« lesquelles ? »)
    async function answer(q) {
        var n = norm(q);
        // ── Small-talk d'abord (salut, ça va, merci…) — rendu null si vraie question derrière ──
        var st = smalltalkRoute(n); if (st) return st;
        // ── Un module précis nommé (« c'est quoi Smart Estimate ? ») gagne sur l'aide générale ──
        var ml = moduleLookup(n); if (ml) return ml;
        // ── Formation : concepts des docs (canary, kill switch, dette de flags, types de flags…) ──
        var fr = formationRoute(n); if (fr) return fr;
        // ── Aide : « que fait la plateforme / comment tu peux m'aider / les modules » ──
        if (/que (fait|fais|font)|a quoi (sert|ca sert|servent|serts)|qu est ce que (tu sais|tu peux|salsifi|la plateforme|le hub|c est)|c est quoi (la plateforme|salsifi|le hub)|tes (fonctionnalites|capacites|features|possibilites)|que (peux|sais) tu faire|(comment|est ce que) (tu peux|pourrais|peux tu|tu pourrais).* ?m aider|tu peux m aider|(liste|tous|quels) (des )?modules|les modules|toutes les fonctionnalites|montre moi ce que tu sais|presente (toi|la plateforme)|a quoi tu sers|ton aide/.test(n)) {
            var rh = d_help(); rh.intent = 'help'; return rh;
        }
        // ── Livraison : actions réelles (approuver / merger / fermer / commenter / préparer / train) ──
        try { var lv = Salsifi.livraisonRoute ? await Salsifi.livraisonRoute(n, q) : null; if (lv) return lv; } catch (e) { /* on retombe sur le routage normal */ }
        // ── DORA d'abord (le module qu'on travaille en profondeur) ──
        var doraCtx = /\bdora\b|deploiement|deployment|lead time|\blt\b|\bcfr\b|taux d echec|change failure|\bmttr\b|ttrs|restauration|frequence/.test(n);
        var improveVerb = /ameliorer|optimiser|augmenter|reduire|baisser|progresser|booster|accelerer|muscler|monter|passer elite|atteindre elite|comment (faire|augmenter|reduire|ameliorer|optimiser|progresser)/.test(n);
        // ── Rapports téléchargeables (une action) ──
        var wantReport = /rapport|report|\bexport/.test(n) && /genere|generer|telecharge|download|exporte|exporter|\bexport\b|fais moi|sors moi|produit|edite|donne moi le rapport|veux le rapport|cree|bilan a telecharger/.test(n) && !/c est quoi|qu est ce/.test(n);
        // « génère / télécharge / exporte le rapport de mes DORA » → rapport DORA
        if (wantReport && (/\bdora\b/.test(n) || doraCtx)) {
            var rr = d_dora_report(); rr.intent = 'dora_report'; return rr;
        }
        // « génère le rapport du jour / de la semaine / du mois » → rapport d'activité
        if (wantReport) {
            var per = null;
            if (/semaine|hebdo|\b7 ?j/.test(n)) per = { d: 7, l: 'Semaine' };
            else if (/mois|mensuel|\b30 ?j/.test(n)) per = { d: 30, l: 'Mois' };
            else if (/jour|quotidien|journalier|aujourd|daily|journee/.test(n)) per = { d: 1, l: 'Jour' };
            if (per) { var ra = await d_activity_report(per.d, per.l); ra.intent = 'activity_report_' + per.l.toLowerCase(); return ra; }
            return { html: `Quel rapport veux-tu ? 📄 « rapport du <b>jour</b> », « rapport de la <b>semaine</b> », « rapport du <b>mois</b> » — ou « le rapport <b>DORA</b> ».`, intent: 'report_ask' };
        }
        // « comment améliorer ma fréquence / mon lead time / mon CFR / mon MTTR (ou mon score DORA) »
        // (avant le calcul-du-score : « améliorer mon score » = progresser, pas « comment c'est calculé »)
        if (improveVerb) {
            var dk = doraKeyFromN(n);
            if (dk || /\bdora\b|score/.test(n)) { var ri = d_dora_improve(dk, n); ri.intent = 'dora_improve' + (dk ? '_' + dk : ''); return ri; }
        }
        // « comment est calculé le score DORA »
        if (/\bdora\b|score/.test(n) && /calcul|calcule|c est quoi le score|score.*(marche|fonctionne)|combien de points|comment (ca marche|fonctionne)/.test(n)) {
            var rc = d_dora_scorecalc(); rc.intent = 'dora_score_calc'; return rc;
        }
        // « comment je m'en sers / comment ça marche / comment utiliser <module> » → mode d'emploi
        // (après le score-calc DORA, avant les routes module → « comment marche le bus factor » = usage).
        if (/comment (je )?m en (sers|servir)|comment (on )?(s en sert|s en servir|l utilise|l utiliser|utiliser|utilise|je fais|on fait)|comment (ca |c est )?(marche|fonctionne|s utilise)|ca s utilise comment|je m en sers comment/.test(n)) {
            var uk = usageKeyFromN(n) || (_lastIntent && usageKeyFromIntent(_lastIntent.k));
            if (uk) { var ru = usageHelp(uk); ru.intent = 'usage_' + uk; return ru; }
            return { html: `Dis-moi de quel module tu parles 🌱 — <b>DORA</b>, <b>badges</b>, <b>bus factor</b>, <b>Daily</b>, <b>feature flags</b>, <b>Repo Analyzer</b>… ou demande « <b>que fait la plateforme</b> » pour la vue d'ensemble.`, intent: 'usage_ask' };
        }
        // ── Gaming / Achievements (avant les « niveaux » DORA : « phases »/« badges » gagnent) ──
        var gr = await gamingRoute(n, /(combien|nombre|mon |ma |mes |quel|quelle|aujourd|semaine|mois)/.test(n));
        if (gr) {
            // Le sujet courant devient « badges » → un suivi (« lesquels ? ») ne repart pas
            // sur une intention obsolète (ex. feature flags) restée en mémoire.
            var _bi = INTENTS.filter(function (x) { return x.k === 'badges'; })[0]; if (_bi) _lastIntent = _bi;
            return gr;
        }
        // ── Daily Report : conseils du jour / ce qu'il contient (avant l'atelier générique) ──
        var dailyCtx = /daily|standup|rapport (du jour|quotidien|journalier|d activite)/.test(n);
        if (/conseil du jour|conseils du jour/.test(n) || (dailyCtx && /conseil|signale|detecte|declenche|alerte|flag/.test(n))) { var rdt = d_daily_tips(); rdt.intent = 'daily_tips'; return rdt; }
        if (dailyCtx && /contient|dans le|sections?|quoi dedans|que montre|qu y a|comprend|composition/.test(n)) { var rdc = d_daily_content(); rdc.intent = 'daily_content'; return rdc; }
        // ── Repo Analyzer : score / ce qui ne va pas / améliorer / activité (avant l'atelier) ──
        var rp = await repoRoute(n); if (rp) return rp;
        // ── Bus Factor : améliorer / les niveaux (avant l'atelier générique et les niveaux DORA) ──
        var busCtx = /bus factor|busfactor|facteur de bus|camion|silo de connaissance|qui sait quoi/.test(n);
        if (busCtx) {
            if (improveVerb || /pair programming|mob|partager le savoir|repartir|rotation|documenter|reduire le risque|desiloter|dessilot/.test(n)) { var rbi = d_bf_improve(); rbi.intent = 'busfactor_improve'; return rbi; }
            // « la note de MON bus factor » → mes vraies données (d_bus), pas le tableau générique.
            if (/niveau|niveaux|note|notes|palier|risque|critique|score|seuil|sur 5|\/5|comment.*(calcul|marche|fonctionne)/.test(n) && !/\bmon\b|\bma\b|\bmes\b/.test(n)) { var rbl = d_bf_levels(); rbl.intent = 'busfactor_levels'; return rbl; }
        }
        // « les niveaux / les notes / les paliers DORA » (ou « c'est quoi Elite »)
        if (/niveau|niveaux|note|notes|palier|paliers|bareme|baremes|seuil|seuils|elite|high performer|medium performer|low performer|barometre/.test(n) && (doraCtx || /elite|palier|performer|bareme/.test(n))) {
            // « la note de MON lead time / MES dora » → mes vraies mesures (pas le tableau générique).
            if (/\bmon\b|\bma\b|\bmes\b/.test(n)) { var rmy = await d_dora(n); rmy.intent = 'dora'; return rmy; }
            var rl = d_dora_levels(doraKeyFromN(n)); rl.intent = 'dora_levels'; return rl;
        }
        // Ateliers : question d'amélioration → on recommande un atelier (avant tout le reste).
        if (/\batelier|workshop|accompagnement|optimiser|ameliorer|\breduire\b|progresser|muscler|comment (faire|reduire|ameliorer|optimiser)/.test(n)) {
            var atl = searchAteliers(n); if (atl) { atl.intent = 'atelier'; return atl; }
        }
        var isDef = /(c est quoi|qu est ce|c est quoi|explique|definition|ca veut dire|signifie|comprends pas|c est koi)/.test(n);
        var isData = /(combien|nombre|mon |ma |mes |quel|quelle|nom|liste|lesquel|laquelle|lequel|montre|affiche|donne|aujourd|semaine|mois|derni|est ce que|qui |environnement|\benv\b|actif|inactif|\bon\b|\boff\b)/.test(n);
        var intent = null;
        for (var i = 0; i < INTENTS.length; i++) { if (hit(n, INTENTS[i].trig)) { intent = INTENTS[i]; break; } }
        // Suivi : pas d'intention trouvée mais une demande de donnée → dernière intention.
        if (!intent && isData && _lastIntent && _lastIntent.data && /nom|liste|lesquel|laquelle|lequel|lesquelles|montre|affiche|donne|detail|environnement|\benv\b|actif|inactif|\bprod\b|\bon\b|\boff\b/.test(n)) intent = _lastIntent;
        if (!intent) return { html: `Je ne réponds que sur la <b>plateforme</b> 🌱 — les concepts (« c'est quoi le bus factor ? »), tes résultats (pipelines, MR, bus factor, DORA, sécu…) et les ateliers (« atelier pour optimiser mon flow »). Reformule, ou essaie : « l'état de mon repo », « combien de FF ? ».`, intent: 'unknown' };
        if (intent.data) _lastIntent = intent;
        var r;
        if (isDef && intent.def) r = { html: defHtml(intent.def) };
        else if (isData && intent.data) r = await intent.data(n);
        else if (intent.data && !intent.def) r = await intent.data(n);
        else if (intent.def && !intent.data) r = { html: defHtml(intent.def) };
        else if (intent.dataFirst && intent.data) r = await intent.data(n); // module orienté données (ex. FF) → répond données par défaut
        else r = { html: defHtml(intent.def, true) };
        r.intent = intent.k;
        return r;
    }
    // Export du journal (téléchargement .jsonl) pour l'analyse hors-ligne.
    window.salsiQaExport = function () {
        var raw = lsGet('salsifi_qa_log'); var arr = raw ? JSON.parse(raw) : [];
        var body = arr.map(function (e) { return JSON.stringify(e); }).join('\n');
        var blob = new Blob([body], { type: 'application/x-ndjson' }); var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = 'salsi-qa-log.jsonl'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    };

    // ── UI : icône flottante + panneau chat ──
    var msgsEl;
    function addMsg(role, html) {
        if (!msgsEl) return;
        var d = document.createElement('div'); d.className = 'sqa-msg ' + role; d.innerHTML = html;
        msgsEl.appendChild(d); msgsEl.scrollTop = msgsEl.scrollHeight;
        return d;
    }
    async function ask(q) {
        if (!q) return;
        addMsg('user', esc(q));
        var pending = addMsg('salsi', '⏳ …');
        var r; try { r = await answer(q); } catch (e) { r = { html: '😅 Je n\'ai pas pu répondre — réessaie.', intent: 'error' }; }
        // ── IA en DERNIER recours : uniquement si le déterministe ne sait pas ET l'IA est branchée ──
        var usedAI = false;
        if (r && r.intent === 'unknown' && Salsifi.aiConfigured && Salsifi.aiConfigured()) {
            if (pending) pending.innerHTML = '⚡ Je réfléchis…';
            try {
                var ai = await Salsifi.aiAsk({ question: q, contexte: salsiContext() });
                if (ai && ai.answer) { usedAI = true; r = { html: ai.answer + '<div class="sqa-hint">⚡ Réponse assistée par IA (hors déterministe)</div>', intent: ai.horsPerimetre ? 'ai_out' : 'ai' }; }
            } catch (e) { /* on garde le refus honnête */ }
        }
        logQ(q, r && r.intent, usedAI);   // trace : question + heure + contexte + intention + ai
        if (pending) pending.innerHTML = r.html;
        if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
    }
    function suggestions() {
        var chips = ['mes priorités du jour ?', 'que fait la plateforme ?', 'la note de mon repo ?', 'mon score DORA ?', 'combien de FF ?', 'ce qui ne va pas ?'];
        return '<div class="sqa-chips">' + chips.map(function (c) { return `<button class="sqa-chip" data-q="${esc(c)}">${esc(c)}</button>`; }).join('') + '</div>';
    }
    function togglePanel(open) {
        var p = document.getElementById('salsiQaPanel'); if (!p) return;
        var show = open != null ? open : p.style.display === 'none';
        p.style.display = show ? 'flex' : 'none';
        if (show) { var inp = document.getElementById('sqaQ'); if (inp) inp.focus(); }
    }
    function qaBuild() {
        if (document.getElementById('salsiFab')) return;
        var mascot = Salsifi.mascotSVG ? Salsifi.mascotSVG('happy') : '🌱';
        var fab = document.createElement('button'); fab.id = 'salsiFab'; fab.className = 'salsi-fab'; fab.title = 'Demande à Salsi (plateforme)'; fab.innerHTML = mascot;
        var panel = document.createElement('div'); panel.id = 'salsiQaPanel'; panel.className = 'salsi-qa-panel'; panel.style.display = 'none';
        var sub = 'plateforme · IA quand il faut';
        panel.innerHTML =
            '<div class="sqa-head"><span class="sqa-ava">' + mascot + '</span><div><div class="sqa-title">Salsi</div><div class="sqa-sub">' + sub + '</div></div><button class="sqa-x" id="sqaX">✕</button></div>' +
            '<div class="sqa-msgs" id="sqaMsgs"></div>' +
            '<div class="sqa-input"><input id="sqaQ" type="text" placeholder="c\'est quoi le bus factor ? · combien de FF ?" autocomplete="off"><button id="sqaSend" title="Demander">↑</button></div>';
        document.body.appendChild(fab); document.body.appendChild(panel);
        msgsEl = panel.querySelector('#sqaMsgs');
        addMsg('salsi', 'Salut, moi c\'est <b>Salsi</b> 🌱 Pose-moi une question sur la plateforme — un concept ou tes chiffres. ' + suggestions());

        fab.addEventListener('click', function () { togglePanel(); });
        panel.querySelector('#sqaX').addEventListener('click', function () { togglePanel(false); });
        var inp = panel.querySelector('#sqaQ'), send = panel.querySelector('#sqaSend');
        function go() { var q = inp.value.trim(); if (!q) return; inp.value = ''; ask(q); }
        send.addEventListener('click', go);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
        panel.addEventListener('click', function (e) { var c = e.target.closest && e.target.closest('.sqa-chip'); if (c) { ask(c.getAttribute('data-q')); } });
    }

    window.salsiQaAsk = ask;
    window.salsiQaToggle = togglePanel;
    // Permet aux actions de livraison (boutons du chat) de parler dans le panneau.
    window.salsiQaSay = function (html) { if (!msgsEl) qaBuild(); togglePanel(true); return addMsg('salsi', html); };

    document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { if (getAuth()) qaBuild(); }, 500); });
