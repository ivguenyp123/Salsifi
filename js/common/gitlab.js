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

})(typeof window !== 'undefined' ? window : this);
