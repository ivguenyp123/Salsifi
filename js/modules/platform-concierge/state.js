/* platform-concierge · state.js — état & config partagés (chargé en 1er). */

/*
 * Salsifi — Platform Concierge (nouveau service)
 * ==================================================================
 * Remplaçant conversationnel du pipeline-generator (le pipeline-generator
 * reste EN PLACE tant que ce service n'est pas validé). Assistant de
 * livraison gouverné : « livre en dev », « release en prod », « bump 2.0.5 »,
 * « coupe sonar »… — l'IA traduit, le noyau déterministe exécute, l'humain
 * garde le merge.
 *
 * ── Architecture 2 couches ────────────────────────────────────────
 *  ✨ Couche IA (« comprendre ») : phrase → intention structurée.
 *     Passe par un PROXY BACKEND (auth → token, Vault → creds Vertex).
 *     Si le proxy est absent/injoignable (mode local file://), on retombe
 *     sur un parseur regex déterministe (aucun réseau IA). L'IA n'est
 *     sollicitée que quand le repo l'exige (chaos / hétérogénéité).
 *  ⚙️ Noyau déterministe (« exécuter ») : lit les 3 sources de vérité,
 *     vérifie les invariants (cohérence, anti-fantôme, auto-bump), prépare
 *     le patch, crée branche + commit + MR via l'API GitLab. Ne merge JAMAIS.
 *     Ne touche JAMAIS la toolchain centrale (incluse, pas copiée).
 *
 * Contrat du proxy backend (à implémenter côté serveur) :
 *   POST {AI_PROXY}/parse   (credentials: 'include')
 *     body : { text, context:{ flow, pilot, chaos, branches:[{n,mr,mine,age,sem?}] } }
 *     → 200 { action, version|null, test|null, branchHint|null, confidence, human }
 *   Le backend authentifie la session, récupère le token GitLab (Vault),
 *   appelle Vertex, renvoie l'intention. Il n'expose jamais les creds.
 *
 * Chargé après la couche commune :
 *   <script src="js/common/utils.js"></script>
 *   <script src="js/common/gitlab.js"></script>
 *   <script src="js/common/auth.js"></script>
 *   <script src="js/platform-concierge.js"></script>
 */


const S = window.Salsifi || {};

const esc = S.escapeHtml || (s => String(s == null ? '' : s));

const HUB_URL = 'hub.html';

// ── Endpoint du proxy IA (injecté par le backend quand servi). En local, null. ──

const AI_PROXY =
  window.SALSIFI_AI_PROXY ||
  (document.querySelector('meta[name="salsifi-ai-proxy"]') || {}).content ||
  null;

// ══════════════════════════════════════════════════════════════════
//  CONVENTIONS (LCL) — À AJUSTER À TA CONVENTION RÉELLE
//  Où vivent les 3 sources de vérité d'une version, et comment on les
//  patche. Isolé ici pour ne rien coder en dur dans le moteur.
// ══════════════════════════════════════════════════════════════════

const CONV = {
  // Environnement (dossier overlay) visé selon l'action.
  envForAction: { deliver_dev: 'development', deliver_uat: 'uat', release_prod: 'production' },
  // Branche cible d'une MR selon flow + action.
  target(flow, action, version) {
    if (action === 'release_prod') return 'main';
    if (flow === 'gitflow') return action === 'deliver_uat' ? 'release/' + version : 'develop';
    return 'main';
  },
  // Les 3 sources : fichier + regex de lecture + fabrique de remplacement.
  sources(env) {
    return [
      { id: 'IMAGE_TAG', file: '.gitlab-ci.yml',
        read: /(\bIMAGE_TAG\s*:\s*["']?)([^"'\s]+)(["']?)/,
        repl: (m, v) => m.replace(/(\bIMAGE_TAG\s*:\s*["']?)([^"'\s]+)(["']?)/, `$1${v}$3`) },
      { id: 'newTag', file: `Manifests/overlays/${env}/kustomization.yaml`,
        read: /(\bnewTag\s*:\s*["']?)([^"'\s]+)(["']?)/,
        repl: (m, v) => m.replace(/(\bnewTag\s*:\s*["']?)([^"'\s]+)(["']?)/, `$1${v}$3`) },
      { id: 'APP_VERSION', file: `Manifests/overlays/${env}/kustomization.yaml`,
        read: /(\bAPP_VERSION\s*[:=]\s*["']?)([^"'\s]+)(["']?)/,
        repl: (m, v) => m.replace(/(\bAPP_VERSION\s*[:=]\s*["']?)([^"'\s]+)(["']?)/, `$1${v}$3`) },
    ];
  },
  // Toolchain centrale — jamais modifiée (affichée comme verrouillée).
  toolchain: 'lcl/commun/devops/ci-cd',
};

// ── état module ──

let AUTH = null, REPO = null, CTX = null;

let lastPlan = null, lastIntent = null;

// ══════════════════════════════════════════════════════════════════
//  TRANSPORT GitLab (via couche commune)
// ══════════════════════════════════════════════════════════════════
