/*
 * Salsifi — transport GitLab commun
 * ------------------------------------------------------------------
 * Chargé AVANT le script de page, après utils.js :
 *     <script src="js/common/gitlab.js"></script>
 *
 * Centralise UNIQUEMENT le transport bas niveau vers l'API GitLab :
 * construction de l'URL (/api/v4 + support des URL absolues), en-tête
 * PRIVATE-TOKEN, et retry unique sur rate-limit HTTP 429 (Retry-After).
 *
 * Renvoie toujours l'objet Response brut : chaque page conserve son
 * propre contrat au-dessus (certaines veulent la Response, d'autres du
 * JSON-ou-null). Le token et l'URL de base restent gérés par chaque
 * page (noms de variables et chargement de l'auth inchangés).
 */
(function (global) {
    'use strict';

    var Salsifi = global.Salsifi || (global.Salsifi = {});

    /**
     * @param {string} baseUrl   URL de l'instance GitLab (ex. https://gitlab.example.com)
     * @param {string} token     Personal/Project access token (en-tête PRIVATE-TOKEN)
     * @param {string} endpoint  Chemin après /api/v4 (ex. "/projects/1"), ou URL absolue (http…)
     * @param {object} [init]    Options fetch() additionnelles (method, body, headers…)
     * @returns {Promise<Response>}
     */
    Salsifi.gitlabFetch = async function gitlabFetch(baseUrl, token, endpoint, init = {}) {
        const url = (typeof endpoint === 'string' && endpoint.startsWith('http'))
            ? endpoint
            : `${baseUrl}/api/v4${endpoint}`;
        const headers = { 'PRIVATE-TOKEN': token, ...(init.headers || {}) };
        let r = await fetch(url, { ...init, headers });
        if (r.status === 429) {
            const retryAfter = parseInt(r.headers.get('Retry-After')) || 2;
            console.warn(`[gitlabFetch] 429 sur ${endpoint}, retry dans ${retryAfter}s`);
            await new Promise(res => setTimeout(res, retryAfter * 1000));
            r = await fetch(url, { ...init, headers });
        }
        return r;
    };

    /**
     * Contrat « GET simple » : renvoie le JSON parsé, ou null si erreur/HTTP non-ok.
     * (Ne PAS rappeler .json() sur le retour — il est déjà parsé.)
     * @returns {Promise<any|null>}
     */
    Salsifi.gitlabJson = async function gitlabJson(baseUrl, token, endpoint, init = {}) {
        try {
            const r = await Salsifi.gitlabFetch(baseUrl, token, endpoint, init);
            return r.ok ? await r.json() : null;
        } catch (e) {
            return null;
        }
    };

    /**
     * Pagination GitLab, agrégée et TOUJOURS bornée (jamais de boucle infinie).
     * Ajoute per_page (défaut 100, sauf si déjà présent dans endpoint) et page,
     * s'arrête dès qu'une page est vide / partielle, avec un cap de pages dur.
     *
     * @param {string} endpoint  chemin après /api/v4, SANS page (ex. "/projects/1/repository/branches")
     * @param {object} [opts]    { perPage=100, maxPages=50, throwOnError=false }
     *   - throwOnError:true → lève si la 1re page échoue (sinon renvoie l'agrégat partiel/vide)
     * @returns {Promise<Array>} tous les éléments concaténés
     */
    Salsifi.gitlabPaginate = async function gitlabPaginate(baseUrl, token, endpoint, opts = {}) {
        const perPage = opts.perPage || 100;
        const maxPages = opts.maxPages || 50;
        const all = [];
        const hasPer = /[?&]per_page=/.test(endpoint);
        const withPer = hasPer ? endpoint : endpoint + (endpoint.includes('?') ? '&' : '?') + 'per_page=' + perPage;
        for (let page = 1; page <= maxPages; page++) {
            const r = await Salsifi.gitlabFetch(baseUrl, token, withPer + '&page=' + page);
            if (!r.ok) {
                if (page === 1 && opts.throwOnError) throw new Error('GitLab ' + endpoint + ' → ' + r.status);
                break;
            }
            const batch = await r.json();
            if (!Array.isArray(batch) || batch.length === 0) break;
            all.push(...batch);
            if (batch.length < perPage) break;
        }
        return all;
    };

})(typeof window !== 'undefined' ? window : this);
