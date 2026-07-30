/* access-workspace · index.js — entrée & câblage (chargé en dernier). */

const ROLE_FILTERS = [['all', 'Tous'], ['admin', '👑 Maintainers & Owners'], ['owner', 'Owners'], ['maintainer', 'Maintainers']];

const esc = window.Salsifi.escapeHtml;

const escA = window.Salsifi.escapeAttr;

// Lien vers la page « Membres » du repo dans GitLab, filtrée sur la personne
// → clic sur un nom = j'atterris pile sur ses droits dans ce repo, pour agir.

async function init() {
    const _auth = window.Salsifi.loadAuth({ redirect: false });
    if (!_auth) {
        return showError('Non connecté. Ouvre le hub et connecte-toi d\'abord. <br><a href="' + HUB_URL + '" style="color:#a78bfa;">← Retour au hub</a>');
    }
    GITLAB_URL = _auth.gitlabUrl;
    token = _auth.token;
    myUsername = _auth.username || '';

    const wsJson = sessionStorage.getItem('current_workspace');
    if (!wsJson) {
        return showError(
            'Aucune tribu sélectionnée. Ouvre ce module depuis le hub : ' +
            'choisis une tribu (workspace) puis clique sur Accès & Rôles. ' +
            '<br><a href="' + HUB_URL + '" style="color:#a78bfa;">← Retour au hub</a>'
        );
    }
    currentWorkspace = JSON.parse(wsJson);

    if (!currentWorkspace.repositories?.length) {
        return showError('Ce workspace ne contient aucun repo.');
    }
    document.getElementById('workspaceName').textContent =
        `🗂️ ${currentWorkspace.name} (${currentWorkspace.repositories.length} repos)`;
    await loadAllowlist();
    await loadAccessData();
}


const SERVICE_RX = /(^|[_-])(bot|bots|robot|operator|runner|service|svc|deploy|deployer|ci|cd|pipeline|automation|token|sonar|nexus|artifactory|vault|terraform|ansible|jenkins|scanner)([_-]|$)/i;

const HIST_ICON = { added: '➕', joined: '➕', removed: '➖', left: '➖', role: '🔄', expiration: '⏳' };


const HIST_FILTERS = [['all', 'Tout'], ['role', '🔄 Changements de rôle'], ['membership', '➕➖ Arrivées / départs']];
