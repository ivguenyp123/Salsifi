# Salsi AI — back de fallback (Vertex AI · gemini-2.5-pro)

Petit relais entre le chat **Salsi** (navigateur) et **Vertex AI**. Les identifiants
GCP restent **ici**, jamais dans le front. L'IA n'est appelée qu'en **dernier recours**
(quand le déterministe de Salsi ne sait pas — géré côté client).

## Contrat (front ↔ back)

```
POST /salsi/ask
Body    → { "question": "...", "contexte": { plateforme, modules, glossaire, formation, resultats } }
Réponse → { "answer": "<html léger>", "horsPerimetre": false }
```

`GET /health` → `{ ok: true, ... }`.

## Lancer

```bash
cd salsi-ai
npm install
# renseigne les variables (voir .env.example), puis :
GCP_PROJECT=... GCP_LOCATION=europe-west9 \
GOOGLE_APPLICATION_CREDENTIALS=/secrets/sa.json \
ALLOW_ORIGIN=https://ton-hub SALSI_SECRET=xxx \
npm start
```

Docker :

```bash
docker build -t salsi-ai .
docker run -p 8080:8080 --env-file .env -v /secrets:/secrets:ro salsi-ai
```

## Auth GCP

`google-auth-library` utilise les **Application Default Credentials** :
- **CI/serveur** : écris le contenu de ta variable secrète GitLab (clé du compte de
  service, rôle *Vertex AI User*) dans un fichier, puis
  `GOOGLE_APPLICATION_CREDENTIALS=/ce/fichier.json`.
- **GCP** (Cloud Run / GCE / GKE) : le compte de service attaché suffit, rien à faire.

## Brancher côté front (Salsi)

Dans le hub, une fois le back en ligne :

```js
localStorage.setItem('salsi_ai_url', 'https://ton-serveur/salsi/ask');
localStorage.setItem('salsi_ai_secret', 'xxx'); // si SALSI_SECRET est défini
```

Tant que `salsi_ai_url` est vide, **l'IA reste éteinte** et Salsi garde son refus
honnête. Rien d'autre à changer côté front.

## Sécurité

- Creds GCP **côté serveur uniquement**.
- **CORS strict** (`ALLOW_ORIGIN` = l'origine réelle du hub, pas `*` en prod).
- **Secret partagé** optionnel (`SALSI_SECRET` ↔ entête `X-Salsi-Secret`).
- **Fallback-only** : l'IA n'est jamais sur le chemin normal → coût/latence maîtrisés.
- Le prompt système cadre le modèle sur le **périmètre plateforme** et lui interdit
  d'inventer des chiffres (il renvoie vers les questions déterministes de Salsi).

## Réduire l'usage de l'IA au fil du temps

Le front logge chaque question dans `localStorage['salsifi_qa_log']` avec un flag
`ai: true` quand l'IA a répondu. Exporte-le (bouton d'export de Salsi), repère les
questions récurrentes traitées par l'IA, et **ajoute-les au déterministe** (glossaire,
formation, `all`). L'IA est alors appelée de moins en moins.
