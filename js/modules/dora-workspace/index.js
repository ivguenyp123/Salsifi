/* dora-workspace · index.js — entrée & câblage (chargé en dernier). */

const HUB_URL = 'hub.html';

document.addEventListener('DOMContentLoaded', () => {
    // Flèche retour → hub V2 (pattern data-hub-link comme les autres modules).
    document.querySelectorAll('[data-hub-link]').forEach(a => { a.href = HUB_URL; });
    init();
    // Écouteurs période / refresh
    document.getElementById('periodSelect').addEventListener('change', onPeriodChange);
    document.getElementById('refreshBtn').addEventListener('click', loadDoraData);
    document.getElementById('periodFrom').addEventListener('change', loadDoraData);
    document.getElementById('periodTo').addEventListener('change', loadDoraData);
    // Écouteurs organisation des squads
    document.getElementById('organizeBtn').addEventListener('click', toggleOrganizePanel);
    document.getElementById('closeOrganizeBtn').addEventListener('click', toggleOrganizePanel);
    document.getElementById('addSquadBtn').addEventListener('click', onAddSquad);
    document.getElementById('newSquadName').addEventListener('keydown', e => { if (e.key === 'Enter') onAddSquad(); });
    // Écouteurs export / import JSON
    document.getElementById('exportBtn').addEventListener('click', exportWorkspaceJson);
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importInput').click());
    document.getElementById('importInput').addEventListener('change', handleImportJson);
});


async function init() {
    // Auth : toujours via localStorage (pattern hub/gouvernance/workspace-setup).
    const _auth = window.Salsifi.loadAuth({ redirect: false });
    if (!_auth) { return showError('Non connecté. Ouvre le hub et connecte-toi d\'abord. <br><a href="' + HUB_URL + '" style="color:#a78bfa;">← Retour au hub</a>'); }
    GITLAB_URL = _auth.gitlabUrl;
    token = _auth.token;

    // DORA = vue workspace uniquement (agrégation multi-repos).
    // Pas de mode mono-repo. Sans workspace actif : message (pas de redirection,
    // qui planterait en file:// avec "unique security origins").
    const wsJson = sessionStorage.getItem('current_workspace');
    if (!wsJson) {
        return showError(
            'Aucune tribu sélectionnée. Ouvre ce module depuis le hub : ' +
            'choisis une tribu (workspace) puis clique sur DORA. ' +
            '<br><a href="' + HUB_URL + '" style="color:#a78bfa;">← Retour au hub</a>'
        );
    }
    currentWorkspace = JSON.parse(wsJson);

    if (!currentWorkspace.repositories?.length) {
        return showError('Ce workspace ne contient aucun repo.');
    }
    document.getElementById('workspaceName').textContent =
        `🗂️ ${currentWorkspace.name} (${currentWorkspace.repositories.length} repos)`;
    await loadDoraData();
}


const SERIES_COLORS = {
    df:   '#2dd4bf',  // deliver / cyan-vert
    lt:   '#7c5cff',  // measure / violet
    cfr:  '#fb923c',  // inspect / orange
    mttr: '#f472b6'   // collab / rose
};

// Graphe multi-courbes avec axes + grille.
// series = [{ key, label, points:[number|null,...] }], labels = [tag,...]

const WS_STORAGE_KEY = 'devops_hub_workspaces';

// Sauvegarde le workspace courant (avec ses squads) dans localStorage ET session.
