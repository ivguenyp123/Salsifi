# Salsi — back IA (plug-and-play)

Petit relais entre le hub et **Vertex AI (Gemini)**. Le front n'appelle l'IA
qu'en **dernier recours** (quand le déterministe ne sait pas répondre). Ce back
ne détient **aucun secret en dur** : tout vient de l'environnement (injecté par
ta CI depuis **Vault**), et l'auth GCP passe par **ADC** — pas de clé dans le code.

> ⚠️ Salsi **n'exécute jamais d'action** (livraison, merge, écriture). Le back
> **explique et oriente** uniquement — c'est verrouillé dans le prompt système,
> en plus du déterministe côté front qui garde toutes les actions.

## Le contrat (figé, côté front dans `js/salsi/ai.js`)

```
POST /salsi/ask
headers: Content-Type: application/json   [+ X-Salsi-Secret: <SALSI_SECRET>]
body:    { "question": "…", "contexte": { plateforme, modules, glossaire, formation, resultats } }

200      { "answer": "<html léger>", "horsPerimetre": true|false }
```

`contexte` = le **grounding** produit par le front (`salsiContext()`) : la
plateforme, ses modules, le glossaire, la formation et **les résultats de
l'utilisateur** (DORA, badges, repo). Le modèle répond *dans ce périmètre*.

## Démarrer en local

```bash
cd salsi-ai-back
cp .env.example .env         # renseigne GCP_PROJECT + SALSI_SECRET
npm install
# auth locale : gcloud auth application-default login   (ADC)
npm start                    # écoute sur :8080
curl -s localhost:8080/healthz
```

## Brancher le front

Une fois le back déployé, côté hub (console navigateur ou provisioning) :

```js
localStorage.setItem('salsi_ai_url', 'https://ton-back/salsi/ask');
localStorage.setItem('salsi_ai_secret', '<le même SALSI_SECRET>'); // si activé
```

…ou en dur dans `js/salsi/config.js` (`Salsifi.AI_URL` / `Salsifi.AI_SECRET`),
que ta CI peut écrire au déploiement. Dès qu'une URL est présente,
`Salsifi.aiConfigured()` passe à vrai et l'IA prend le relais **quand il faut**.

## En prod (Vault + CI)

- `SALSI_SECRET`, `GCP_PROJECT`, etc. → mappés depuis **Vault** dans la pipeline,
  jamais commités.
- Auth Vertex → **Workload Identity** (idéal) ou `GOOGLE_APPLICATION_CREDENTIALS`
  pointant vers un fichier monté par Vault (`/vault/secrets/…`).
- `ALLOW_ORIGIN` → l'URL exacte du hub (au lieu de `*`).
- Le service peut tourner en conteneur (Cloud Run, GKE, VM) — il n'expose que
  `POST /salsi/ask` et `GET /healthz`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `server.js` | le relais (Node, sans framework) |
| `package.json` | 1 dépendance : `@google-cloud/vertexai` |
| `.env.example` | les variables attendues (à mapper depuis Vault) |
