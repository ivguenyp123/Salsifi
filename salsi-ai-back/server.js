/*
 * Salsi — back IA de référence (relais vers Vertex AI · Gemini).
 * ------------------------------------------------------------------
 * Le front (js/salsi/ai.js) n'appelle l'IA qu'en DERNIER recours, quand le
 * déterministe ne sait pas. Ce serveur reçoit { question, contexte } et renvoie
 * { answer, horsPerimetre }. Il ne détient AUCUN secret en dur : tout vient de
 * l'environnement (injecté par ta CI depuis Vault) et l'auth GCP passe par ADC
 * (Application Default Credentials / Workload Identity) — pas de clé dans le code.
 *
 * Contrat (identique à js/salsi/ai.js) :
 *   POST /salsi/ask
 *   headers: Content-Type: application/json  [+ X-Salsi-Secret: <SALSI_SECRET>]
 *   body:    { question: string, contexte: { plateforme, modules, glossaire, formation, resultats } }
 *   -> 200   { answer: "<html léger>", horsPerimetre: boolean }
 *
 * Démarrage : voir README.md. Variables : .env.example.
 */
'use strict';

const http = require('http');
const { VertexAI } = require('@google-cloud/vertexai');

// ── Config 100 % environnement (Vault → CI → env). Aucun défaut sensible. ──
const PORT = parseInt(process.env.PORT || '8080', 10);
const SALSI_SECRET = process.env.SALSI_SECRET || '';            // secret partagé avec le front (optionnel mais recommandé)
const GCP_PROJECT = process.env.GCP_PROJECT || '';             // ex. "mon-projet-lcl"
const GCP_LOCATION = process.env.GCP_LOCATION || 'europe-west1';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';          // mets l'origine du hub en prod

if (!GCP_PROJECT) { console.error('[salsi-ai] GCP_PROJECT manquant (env).'); process.exit(1); }

// Auth GCP par ADC : aucune clé ici. En CI/prod, utilise Workload Identity ou
// GOOGLE_APPLICATION_CREDENTIALS pointant vers un fichier monté par Vault.
const vertex = new VertexAI({ project: GCP_PROJECT, location: GCP_LOCATION });

// Salsi ne DÉCIDE ni n'EXÉCUTE jamais une action (livraison, merge, etc.) : le
// back explique, il n'agit pas. Garde-fou côté serveur, en plus du front.
const SYSTEM = [
  "Tu es Salsi, l'assistant d'une plateforme interne d'aide à la maturité DevOps au-dessus de GitLab.",
  "Réponds UNIQUEMENT dans le périmètre décrit par le champ `contexte` (modules, glossaire, formation, résultats de l'utilisateur).",
  "Style : français, concis, chaleureux, en HTML LÉGER (<b>, <br>, <code>, <a>) — jamais de Markdown, jamais de bloc de code long.",
  "Tu EXPLIQUES et TU ORIENTES vers le bon module ; tu n'exécutes JAMAIS d'action (aucune livraison, aucun merge, aucune écriture). Si on te le demande, explique où le faire dans la plateforme.",
  "Si la question sort du périmètre plateforme, réponds brièvement et honnêtement, et signale-le.",
  "Réponds STRICTEMENT en JSON: {\"answer\": string (html léger), \"horsPerimetre\": boolean}."
].join('\n');

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, X-Salsi-Secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  });
  res.end(body);
}

async function ask(question, contexte) {
  const model = vertex.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: { role: 'system', parts: [{ text: SYSTEM }] },
    generationConfig: { temperature: 0.3, maxOutputTokens: 700, responseMimeType: 'application/json' }
  });
  const prompt = 'CONTEXTE (grounding) :\n' + JSON.stringify(contexte || {}, null, 0) + '\n\nQUESTION :\n' + String(question || '');
  const r = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
  const text = (((r.response || {}).candidates || [])[0] || {}).content?.parts?.[0]?.text || '';
  try {
    const j = JSON.parse(text);
    if (j && typeof j.answer === 'string' && j.answer) return { answer: j.answer, horsPerimetre: !!j.horsPerimetre };
  } catch (e) { /* le modèle n'a pas rendu du JSON strict */ }
  // Filet : si pas de JSON exploitable, on renvoie le texte brut comme réponse.
  return { answer: text ? String(text).slice(0, 4000) : "Je n'ai pas pu formuler de réponse.", horsPerimetre: false };
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method === 'GET' && req.url === '/healthz') return json(res, 200, { ok: true });
  if (req.method !== 'POST' || !/^\/salsi\/ask\/?$/.test(req.url)) return json(res, 404, { error: 'not found' });

  // Secret partagé (défense simple contre l'usage tiers). Configure-le côté front aussi.
  if (SALSI_SECRET && req.headers['x-salsi-secret'] !== SALSI_SECRET) return json(res, 401, { error: 'unauthorized' });

  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
  req.on('end', async () => {
    let payload; try { payload = JSON.parse(raw || '{}'); } catch (e) { return json(res, 400, { error: 'bad json' }); }
    const question = payload && payload.question;
    if (!question || typeof question !== 'string') return json(res, 400, { error: 'question requise' });
    try {
      const out = await ask(question, payload.contexte);
      return json(res, 200, out);
    } catch (e) {
      console.error('[salsi-ai] erreur Vertex :', e && e.message);
      return json(res, 502, { error: 'ia indisponible' });
    }
  });
});

server.listen(PORT, () => console.log('[salsi-ai] à l\'écoute sur :' + PORT + ' (modèle ' + GEMINI_MODEL + ', projet ' + GCP_PROJECT + ')'));
