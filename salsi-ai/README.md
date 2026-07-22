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

## Sécurité (blindage)

- Creds GCP **côté serveur uniquement** (`google-auth-library`, chargé paresseusement).
- **Prompt système durci** : périmètre strict + anti-injection (question/contexte =
  données, jamais des instructions) + anti-hallucination (pas de chiffre/module/seuil
  inventé) + refus hors périmètre sans y répondre.
- **Safety filters Vertex natifs** (`SAFETY_THRESHOLD`) ; les réponses bloquées
  (prompt jugé dangereux ou `finishReason` de sécurité) → **refus propre**, jamais un crash.
- **Contrôle d'origine côté serveur** + **CORS strict** (`ALLOW_ORIGIN`, liste séparée
  par virgules ; pas de `*` en prod).
- **Secret partagé** (`SALSI_SECRET` ↔ entête `X-Salsi-Secret`).
- **Rate-limiting** par IP (`RATE_MAX` / `RATE_WINDOW_MS`), **timeout** Vertex
  (`VERTEX_TIMEOUT_MS`), limite de payload (256 Ko), erreurs internes non divulguées.
- **Fallback-only** : l'IA n'est jamais sur le chemin normal → surface d'attaque et
  coût minuscules.
- **Journal d'audit** structuré (JSON sur stdout) : `outcome` (ok / hors_perimetre /
  blocked), IP, origine, **hash** de la question. Le texte des questions n'est loggé
  que si `LOG_QUESTIONS=true` (OFF par défaut, vie privée). Événements : `ask`,
  `rate_limited`, `origin_denied`, `auth_denied`, `error`, `boot`.

> Un prompt ne bloque jamais 100 % des injections : c'est de la **réduction de
> risque**. Les vraies barrières sont le fallback-only, le secret + l'origine, le
> rate-limit et les safety filters. Pour un audit RSSI, pointe le journal d'audit
> vers votre SIEM.

## Réduire l'usage de l'IA au fil du temps

Le front logge chaque question dans `localStorage['salsifi_qa_log']` avec un flag
`ai: true` quand l'IA a répondu. Exporte-le (bouton d'export de Salsi), repère les
questions récurrentes traitées par l'IA, et **ajoute-les au déterministe** (glossaire,
formation, `all`). L'IA est alors appelée de moins en moins.
