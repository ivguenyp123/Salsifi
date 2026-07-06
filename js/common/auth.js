/*
 * Salsifi — authentification commune
 * ------------------------------------------------------------------
 * Chargé AVANT le script de page, après utils.js/gitlab.js :
 *     <script src="js/common/auth.js"></script>
 *
 * Centralise la lecture de l'auth GitLab (token + URL) et la résolution
 * du repo courant. Change le format de stockage un jour = 1 fichier à
 * toucher, au lieu de 16.
 *
 *   Salsifi.loadAuth(opts?)  → { token, gitlabUrl, username } ou null
 *     - lit localStorage 'devops_hub_workspaces' (format hub)
 *     - fallback URL : sessionStorage 'gitlab_base_url'
 *     - opts.redirect !== false : redirige vers login.html si incomplet
 *   Salsifi.getRepoId()      → id du repo courant, ou null
 *     - priorité au query param ?repo=<id>, sinon localStorage
 *       'hub_selected_repo_id'
 */
(function (global) {
    'use strict';

    var Salsifi = global.Salsifi || (global.Salsifi = {});

    var AUTH_KEY = 'devops_hub_workspaces';
    var LOGIN_URL = 'login.html';

    Salsifi.loadAuth = function loadAuth(opts) {
        opts = opts || {};
        var d = null;
        try {
            var raw = localStorage.getItem(AUTH_KEY);
            if (raw) d = JSON.parse(raw);
        } catch (e) { /* JSON invalide → d reste null */ }

        var tok = (d && d.token) || null;
        var url = (d && d.gitlabUrl) || null;
        // Fallbacks legacy (ancien format sessionStorage), même si devops_hub_workspaces absent
        if (!tok) { try { tok = sessionStorage.getItem('gitlab_token'); } catch (e) {} }
        if (!url) { try { url = sessionStorage.getItem('gitlab_base_url'); } catch (e) {} }

        var auth = (tok && url) ? { token: tok, gitlabUrl: url, username: (d && d.username) || '' } : null;

        if (!auth && opts.redirect !== false) {
            global.location.href = LOGIN_URL;
        }
        return auth;
    };

    Salsifi.getRepoId = function getRepoId() {
        try {
            var q = new URLSearchParams(global.location.search).get('repo');
            if (q) return q;
        } catch (e) {}
        try {
            return localStorage.getItem('hub_selected_repo_id') || null;
        } catch (e) { return null; }
    };

})(typeof window !== 'undefined' ? window : this);
