/* report-builder · state.js — état & config partagés (chargé en 1er). */

/*
 * Salsifi — Générateur de rapport (Mesurer & Progresser)
 * ==================================================================
 * On choisit des blocs (drag & drop pour les inclure et les ordonner),
 * on clique « Générer », et le module produit un rapport HTML AUTONOME
 * (téléchargeable) construit sur les VRAIES données GitLab au moment du
 * clic. Aucun build, marche servi et en local (file://).
 *
 * Chaque bloc = une fonction fetch(ctx) qui interroge l'API GitLab via la
 * couche commune et renvoie une section normalisée { stats, rows, note }.
 * Un bloc qui échoue n'empêche pas le rapport : il s'affiche « indisponible ».
 *
 * Chargé après la couche commune (utils/gitlab/auth).
 */


const S = window.Salsifi || {};

const esc = S.escapeHtml || (s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));


let AUTH = null, REPO = null;

const SINCE_30 = () => new Date(Date.now() - 30 * 86400000).toISOString();


const gjson = (ep, init) => S.gitlabJson(AUTH.gitlabUrl, AUTH.token, ep, init);

const gpage = (ep, opts) => S.gitlabPaginate(AUTH.gitlabUrl, AUTH.token, ep, opts);

// ── helpers de calcul ──

const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : 0;

const fmtDate = iso => { if (!iso) return '—'; try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return '—'; } };

const daysAgo = iso => { if (!iso) return null; return Math.floor((Date.now() - new Date(iso)) / 86400000); };
// Arbre récursif du dépôt, mutualisé sur une génération (réinitialisé à chaque « Générer »).
