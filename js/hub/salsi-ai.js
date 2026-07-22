/*
 * Salsi — Transport IA (fallback en DERNIER recours)
 * ------------------------------------------------------------------
 * Le déterministe répond d'abord (salsi-qa.js). SEULEMENT si l'intention est
 * « unknown », Salsi appelle un petit back (ton serveur) qui relaie vers
 * Vertex AI · gemini-2.5-pro. Ce fichier ne fait QUE l'appel HTTP — aucune
 * clé, aucun secret GCP côté navigateur.
 *
 * IA OFF par défaut : tant qu'aucune URL n'est configurée, aiConfigured() est
 * faux et rien n'est appelé (Salsi garde son refus honnête).
 *
 * Config (au choix) :
 *   - localStorage 'salsi_ai_url'    = 'https://ton-serveur/salsi/ask'
 *   - localStorage 'salsi_ai_secret' = secret partagé (optionnel, entête)
 *   - ou window.Salsifi.AI_URL / AI_SECRET (constantes)
 * Contrat : POST { question, contexte } → { answer:'html léger', horsPerimetre:bool }
 */
(function (global) {
    'use strict';
    var S = global.Salsifi || (global.Salsifi = {});

    function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
    function cfg() {
        return {
            url: ls('salsi_ai_url') || S.AI_URL || '',
            secret: ls('salsi_ai_secret') || S.AI_SECRET || '',
            timeout: 20000
        };
    }

    // Vrai seulement si une URL de back est configurée → sinon l'IA reste éteinte.
    S.aiConfigured = function () { return !!cfg().url; };

    // Appelle le back ; renvoie { answer, horsPerimetre } ou null (échec / non configuré).
    S.aiAsk = async function (payload) {
        var c = cfg(); if (!c.url) return null;
        var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var to = ctrl ? setTimeout(function () { ctrl.abort(); }, c.timeout) : null;
        try {
            var headers = { 'Content-Type': 'application/json' };
            if (c.secret) headers['X-Salsi-Secret'] = c.secret;
            var res = await fetch(c.url, {
                method: 'POST', headers: headers,
                body: JSON.stringify(payload || {}),
                signal: ctrl ? ctrl.signal : undefined
            });
            if (to) clearTimeout(to);
            if (!res.ok) return null;
            var j = await res.json();
            if (!j || typeof j.answer !== 'string' || !j.answer) return null;
            return { answer: j.answer, horsPerimetre: !!j.horsPerimetre };
        } catch (e) { if (to) clearTimeout(to); return null; }
    };
})(typeof window !== 'undefined' ? window : this);
