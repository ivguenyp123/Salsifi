        // ══════════════════════════════════════════════════════════════════
        //  VARIABLES
        // ══════════════════════════════════════════════════════════════════

        let GITLAB_URL = null;
        let projectId = null;
        let token = null;
        let generatedYaml = null;
        let existingSecrets = [];

        // Variables CI/CD LCL - liste fixe
        const LCL_VARIABLES = [
            { key: 'ARGOCD_AUTH_TOKEN', desc: 'Token ArgoCD principal' },
            { key: 'ARGOCD_AUTH_TOKEN_DEVELOPMENT', desc: 'Token ArgoCD DEV' },
            { key: 'ARTIFACTORY_USER_ACCOUNT', desc: 'Compte Artifactory' },
            { key: 'ARTIFACTORY_USER_PASSWORD', desc: 'Password Artifactory' },
            { key: 'PROXY_USER_NAME', desc: 'Username Proxy' },
            { key: 'service_account', desc: 'Service Account' },
            { key: 'SERVICE_ACCOUNT_PASSWORD_HP', desc: 'Password HP' },
            { key: 'SERVICE_ACCOUNT_PASSWORD_P', desc: 'Password P' },
            { key: 'SERVICE_ACCOUNT_USERNAME_HP', desc: 'Username HP' },
            { key: 'SERVICE_ACCOUNT_USERNAME_P', desc: 'Username P' },
            { key: 'SONARQUBE_PROJECTKEY', desc: 'Clé projet SonarQube' },
            { key: 'SONARQUBE_TOKEN', desc: 'Token SonarQube' },
            { key: 'SONARQUBE_TOKEN_METRICS', desc: 'Token Metrics SonarQube' },
            { key: 'SONARQUBE_URL', desc: 'URL SonarQube' },
        ];


        // ══════════════════════════════════════════════════════════════════
        //  TABS
        // ══════════════════════════════════════════════════════════════════

        function showTab(tabName) {
            // Update tab buttons
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');

            // Update tab content
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tabName}`).classList.add('active');

            // Load secrets when switching to secrets tab
            if (tabName === 'secrets' && existingSecrets.length === 0) {
                loadExistingSecrets();
            }
        }


        // ══════════════════════════════════════════════════════════════════
        //  SECRETS MANAGER
        // ══════════════════════════════════════════════════════════════════

        async function loadExistingSecrets() {
            try {
                const res = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/variables`, {
                    headers: { 'PRIVATE-TOKEN': token }
                });

                if (res.ok) {
                    existingSecrets = await res.json();
                } else {
                    existingSecrets = [];
                }

                renderSecrets();
                updateSecretsCount();

            } catch (error) {
                console.error('Erreur chargement secrets:', error);
                showMessage('error', '❌ Erreur chargement des variables');
            }
        }

        function renderSecrets() {
            const grid = document.getElementById('secretsGrid');
            
            let html = '';
            LCL_VARIABLES.forEach(variable => {
                const existing = existingSecrets.find(s => s.key === variable.key);
                const exists = !!existing;

                html += `
                    <div class="secret-item ${exists ? 'exists' : 'missing'}">
                        <div class="secret-key" title="${variable.desc}">${variable.key}</div>
                        <input type="password" class="secret-input" id="secret-${variable.key}" 
                               placeholder="${exists ? '••••••••' : 'Entrer la valeur...'}"
                               data-key="${variable.key}">
                        <div class="secret-status">${exists ? '✅' : '❌'}</div>
                        <div class="secret-actions">
                            <button class="secret-btn save" onclick="saveSecret('${variable.key}')">💾</button>
                            ${exists ? `<button class="secret-btn delete" onclick="deleteSecret('${variable.key}')">🗑️</button>` : ''}
                        </div>
                    </div>
                `;
            });

            grid.innerHTML = html;
        }

        function updateSecretsCount() {
            const configured = LCL_VARIABLES.filter(v => existingSecrets.find(s => s.key === v.key)).length;
            const missing = LCL_VARIABLES.length - configured;
            document.getElementById('secretsConfigured').textContent = configured;
            document.getElementById('secretsMissing').textContent = missing;
        }

        async function saveSecret(key) {
            const input = document.getElementById(`secret-${key}`);
            const value = input.value.trim();

            if (!value) {
                showMessage('error', '❌ Veuillez entrer une valeur');
                return;
            }

            const masked = input.dataset.masked === 'true';
            const exists = existingSecrets.find(s => s.key === key);

            try {
                const method = exists ? 'PUT' : 'POST';
                const url = exists 
                    ? `${GITLAB_URL}/api/v4/projects/${projectId}/variables/${key}`
                    : `${GITLAB_URL}/api/v4/projects/${projectId}/variables`;

                const res = await fetch(url, {
                    method: method,
                    headers: {
                        'PRIVATE-TOKEN': token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        key: key,
                        value: value,
                        protected: false,
                        masked: masked,
                        variable_type: 'env_var'
                    })
                });

                if (res.ok) {
                    showMessage('success', `✅ Variable ${key} sauvegardée`);
                    input.value = '';
                    await loadExistingSecrets();
                } else {
                    const error = await res.json();
                    throw new Error(error.message || 'Erreur sauvegarde');
                }

            } catch (error) {
                console.error('Erreur save secret:', error);
                showMessage('error', `❌ Erreur: ${error.message}`);
            }
        }

        async function deleteSecret(key) {
            if (!confirm(`Supprimer la variable ${key} ?`)) return;

            try {
                const res = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/variables/${key}`, {
                    method: 'DELETE',
                    headers: { 'PRIVATE-TOKEN': token }
                });

                if (res.ok) {
                    showMessage('success', `✅ Variable ${key} supprimée`);
                    await loadExistingSecrets();
                } else {
                    throw new Error('Erreur suppression');
                }

            } catch (error) {
                showMessage('error', `❌ Erreur: ${error.message}`);
            }
        }

        async function addCustomSecret() {
            const keyInput = document.getElementById('newSecretKey');
            const valueInput = document.getElementById('newSecretValue');
            const key = keyInput.value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
            const value = valueInput.value.trim();

            if (!key || !value) {
                showMessage('error', '❌ Remplissez la clé et la valeur');
                return;
            }

            try {
                const res = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/variables`, {
                    method: 'POST',
                    headers: {
                        'PRIVATE-TOKEN': token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        key: key,
                        value: value,
                        protected: false,
                        masked: true,
                        variable_type: 'env_var'
                    })
                });

                if (res.ok) {
                    showMessage('success', `✅ Variable ${key} ajoutée`);
                    keyInput.value = '';
                    valueInput.value = '';
                    await loadExistingSecrets();
                } else {
                    const error = await res.json();
                    throw new Error(error.message || 'Erreur ajout');
                }

            } catch (error) {
                showMessage('error', `❌ Erreur: ${error.message}`);
            }
        }

        async function saveAllSecrets() {
            // Collecter les variables à sauvegarder
            const inputs = document.querySelectorAll('.secret-input[data-key]');
            const toSave = [];

            for (const input of inputs) {
                if (input.value.trim()) {
                    const key = input.dataset.key;
                    const exists = existingSecrets.find(s => s.key === key);
                    toSave.push({
                        key: key,
                        value: input.value.trim(),
                        action: exists ? 'UPDATE' : 'CREATE',
                        masked: input.dataset.masked === 'true'
                    });
                }
            }

            if (toSave.length === 0) {
                showMessage('error', '❌ Aucune variable à sauvegarder');
                return;
            }

            // Afficher le preview
            showSecretsPreview(toSave);
        }

        function showSecretsPreview(secrets) {
            const modal = document.getElementById('secretsPreviewModal');
            const content = document.getElementById('secretsPreviewContent');

            let html = `
                <div class="preview-summary">
                    <span>📝 ${secrets.filter(s => s.action === 'CREATE').length} nouvelles</span>
                    <span>✏️ ${secrets.filter(s => s.action === 'UPDATE').length} mises à jour</span>
                </div>
                <div class="preview-list">
            `;

            secrets.forEach(s => {
                const icon = s.action === 'CREATE' ? '➕' : '✏️';
                const maskedValue = s.masked ? '••••••••' : s.value.substring(0, 20) + (s.value.length > 20 ? '...' : '');
                html += `
                    <div class="preview-item ${s.action.toLowerCase()}">
                        <span class="preview-action">${icon}</span>
                        <span class="preview-key">${s.key}</span>
                        <span class="preview-value">${maskedValue}</span>
                    </div>
                `;
            });

            html += '</div>';
            content.innerHTML = html;

            // Stocker les secrets pour la confirmation
            modal.dataset.secrets = JSON.stringify(secrets);
            modal.classList.add('show');
        }

        async function confirmSaveSecrets() {
            const modal = document.getElementById('secretsPreviewModal');
            const secrets = JSON.parse(modal.dataset.secrets || '[]');
            
            modal.classList.remove('show');

            let saved = 0;
            let errors = 0;

            for (const secret of secrets) {
                try {
                    const exists = secret.action === 'UPDATE';
                    const method = exists ? 'PUT' : 'POST';
                    const url = exists 
                        ? `${GITLAB_URL}/api/v4/projects/${projectId}/variables/${secret.key}`
                        : `${GITLAB_URL}/api/v4/projects/${projectId}/variables`;

                    const res = await fetch(url, {
                        method: method,
                        headers: {
                            'PRIVATE-TOKEN': token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            key: secret.key,
                            value: secret.value,
                            protected: false,
                            masked: secret.masked,
                            variable_type: 'env_var'
                        })
                    });

                    if (res.ok) {
                        saved++;
                    } else {
                        errors++;
                    }
                } catch {
                    errors++;
                }
            }

            // Clear inputs
            document.querySelectorAll('.secret-input[data-key]').forEach(input => {
                input.value = '';
            });

            await loadExistingSecrets();

            if (saved > 0) {
                showMessage('success', `✅ ${saved} variable(s) sauvegardée(s) sur GitLab`);
            }
            if (errors > 0) {
                showMessage('error', `❌ ${errors} erreur(s)`);
            }
        }

        function closeSecretsPreview() {
            document.getElementById('secretsPreviewModal').classList.remove('show');
        }

        function exportSecretsTemplate() {
            const template = currentSecrets.map(s => `${s.key}=`).join('\n');
            const blob = new Blob([template], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'gitlab-variables.env';
            a.click();
            URL.revokeObjectURL(url);
            showMessage('info', '📥 Template exporté');
        }


        // ══════════════════════════════════════════════════════════════════
        //  INIT
        // ══════════════════════════════════════════════════════════════════

        // ══════════════════════════════════════════════════════════════════
        //  AUTH + REPO — modèle plateforme (aligné DevOps Hub)
        //  Token : localStorage 'devops_hub_workspaces' = { gitlabUrl, token, username }
        //  Repo  : query param ?repo=<id> (posé par le hub)
        // ══════════════════════════════════════════════════════════════════
        const STORAGE_KEY = 'devops_hub_workspaces';
        const HUB_URL = 'hub-mockup-v2_1.html'; // le mockup V2 est le hub ; seul endroit à changer

        let projectPath = null; // path_with_namespace, pour les liens GitLab

        function loadAuth() {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            try {
                const data = JSON.parse(raw);
                if (!data.gitlabUrl || !data.token) return null;
                return data;
            } catch { return null; }
        }

        // Helper API centralisé avec retry 429 (parité plateforme)
        async function glFetch(path, options = {}) {
            const opts = { ...options, headers: { 'PRIVATE-TOKEN': token, ...(options.headers || {}) } };
            let res = await fetch(`${GITLAB_URL}/api/v4${path}`, opts);
            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get('Retry-After') || '2', 10);
                await new Promise(r => setTimeout(r, retryAfter * 1000));
                res = await fetch(`${GITLAB_URL}/api/v4${path}`, opts);
            }
            return res;
        }

        async function init() {
            const auth = loadAuth();
            if (!auth) { window.location.href = 'login.html'; return; }

            const repoId = new URLSearchParams(location.search).get('repo');
            if (!repoId) { window.location.href = HUB_URL; return; }

            // Variables globales utilisées partout dans le moteur
            token = auth.token;
            GITLAB_URL = auth.gitlabUrl;
            projectId = repoId;

            // Lien retour vers le hub
            document.querySelectorAll('[data-hub-link]').forEach(a => { a.href = HUB_URL; });

            // Charger le repo cible (nom + path)
            try {
                const res = await glFetch(`/projects/${projectId}`);
                if (!res.ok) throw new Error('Projet introuvable');
                const project = await res.json();
                projectPath = project.path_with_namespace;
                document.getElementById('headerProjectName').textContent = project.name;
                const appName = project.name.toLowerCase().replace(/-/g, '');
                document.getElementById('appName').value = appName;
            } catch (e) {
                console.error('Erreur chargement du repo:', e);
                showMessage('error', '❌ Impossible de charger le repo sélectionné');
                setTimeout(() => { window.location.href = HUB_URL; }, 2000);
                return;
            }

            // Charger les branches
            await loadBranches();

            // Charger automatiquement le YAML existant et générer la preview
            if (document.getElementById('targetBranch').value) {
                await loadExistingYaml();
                generatePipeline();
            }
        }


        // ══════════════════════════════════════════════════════════════════
        //  LOAD BRANCHES
        // ══════════════════════════════════════════════════════════════════

        async function loadBranches() {
            const refreshBtn = document.getElementById('refreshBtn');
            const select = document.getElementById('targetBranch');
            const runSelect = document.getElementById('runBranch');

            refreshBtn.classList.add('loading');
            select.innerHTML = '<option value="">Chargement...</option>';
            runSelect.innerHTML = '<option value="">Chargement...</option>';

            try {
                const res = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/repository/branches?per_page=100`, {
                    headers: { 'PRIVATE-TOKEN': token }
                });

                if (!res.ok) throw new Error('Erreur chargement');

                const branches = await res.json();

                select.innerHTML = '';
                runSelect.innerHTML = '<option value="">-- Sélectionner une branche --</option>';
                
                branches.forEach(branch => {
                    // Pour targetBranch
                    const option = document.createElement('option');
                    option.value = branch.name;
                    option.textContent = branch.name + (branch.default ? ' (default)' : '');
                    if (branch.name === 'main' || branch.name === 'master' || branch.default) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                    
                    // Pour runBranch
                    const option2 = document.createElement('option');
                    option2.value = branch.name;
                    option2.textContent = branch.name + (branch.default ? ' (default)' : '');
                    runSelect.appendChild(option2);
                });

                showMessage('info', `✅ ${branches.length} branches chargées`);

            } catch (error) {
                console.error('Erreur:', error);
                select.innerHTML = '<option value="">Erreur de chargement</option>';
                runSelect.innerHTML = '<option value="">Erreur de chargement</option>';
                showMessage('error', '❌ Impossible de charger les branches');
            }

            refreshBtn.classList.remove('loading');
        }


        // ══════════════════════════════════════════════════════════════════
        //  LOAD EXISTING YAML
        // ══════════════════════════════════════════════════════════════════

        async function loadExistingYaml() {
            const branch = document.getElementById('targetBranch').value;

            if (!branch) {
                showMessage('error', '❌ Sélectionnez d\'abord une branche');
                return;
            }

            const loadBtn = document.getElementById('loadYamlBtn');
            loadBtn.disabled = true;
            loadBtn.textContent = '⏳ Chargement...';

            try {
                // Récupérer le fichier .gitlab-ci.yml
                const res = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/repository/files/.gitlab-ci.yml?ref=${encodeURIComponent(branch)}`, {
                    headers: { 'PRIVATE-TOKEN': token }
                });

                if (!res.ok) {
                    if (res.status === 404) {
                        showMessage('error', '❌ Aucun .gitlab-ci.yml trouvé sur cette branche');
                    } else {
                        throw new Error('Erreur de chargement');
                    }
                    return;
                }

                const data = await res.json();
                const yamlContent = atob(data.content); // Decode base64

                // Parser le YAML et remplir le formulaire
                parseAndFillForm(yamlContent);

                showMessage('success', '✅ YAML chargé ! Modifiez ce que vous voulez puis cliquez sur Prévisualiser');

            } catch (error) {
                console.error('Erreur:', error);
                showMessage('error', `❌ Erreur: ${error.message}`);
            } finally {
                loadBtn.disabled = false;
                loadBtn.textContent = '📥 Charger YAML';
            }
        }

        function parseAndFillForm(yamlContent) {
            // Parser les variables du YAML
            const getValue = (key) => {
                const regex = new RegExp(`${key}:\\s*["']?([^"'\\n]+)["']?`, 'i');
                const match = yamlContent.match(regex);
                return match ? match[1].trim() : '';
            };

            const getBoolValue = (key) => {
                const value = getValue(key);
                return value.toLowerCase() === 'true';
            };

            // Remplir les champs de base
            const appName = getValue('APP_MS_NAME');
            if (appName) document.getElementById('appName').value = appName;

            const capiref = getValue('CAPIREF');
            if (capiref) document.getElementById('capiref').value = capiref;

            const blockCode = getValue('APP_BLOCK_CODE');
            if (blockCode) document.getElementById('blockCode').value = blockCode;

            const ownerEmail = getValue('OWNER_EMAIL');
            if (ownerEmail) document.getElementById('ownerEmail').value = ownerEmail;

            const ownerName = getValue('OWNER_NAME');
            if (ownerName) document.getElementById('ownerName').value = ownerName;

            const team = getValue('TEAM');
            if (team) document.getElementById('teamName').value = team;

            const imageTag = getValue('IMAGE_TAG');
            if (imageTag) document.getElementById('imageTag').value = imageTag;

            // Environnements de déploiement
            document.getElementById('deployDev').checked = getBoolValue('DEPLOY_TO_DEV');
            document.getElementById('deployUat').checked = getBoolValue('DEPLOY_TO_UAT');
            document.getElementById('deployProd').checked = getBoolValue('DEPLOY_TO_PROD');

            // Jobs optionnels (logique positive ENABLE_*)
            document.getElementById('sonarqube').checked = getBoolValue('ENABLE_SONAR');
            document.getElementById('promoteStaging').checked = getBoolValue('ENABLE_PROMOTE_STAGING');
            document.getElementById('promoteStable').checked = getBoolValue('ENABLE_PROMOTE_STABLE');
            document.getElementById('createChange').checked = getBoolValue('ENABLE_CREATE_CHANGE');
            document.getElementById('playwright').checked = getBoolValue('ENABLE_PLAYWRIGHT');
            document.getElementById('newman').checked = getBoolValue('ENABLE_NEWMAN');
            document.getElementById('bruno').checked = getBoolValue('ENABLE_BRUNO');

            console.log('✅ Formulaire pré-rempli avec le YAML existant');
        }


        // ══════════════════════════════════════════════════════════════════
        //  GENERATE PIPELINE
        // ══════════════════════════════════════════════════════════════════

        function generatePipeline() {
            const config = {
                appName: document.getElementById('appName').value || 'my-app',
                capiref: document.getElementById('capiref').value || 'CAPIREF',
                blockCode: document.getElementById('blockCode').value || 'block-code',
                ownerEmail: document.getElementById('ownerEmail').value || 'owner@lcl.fr',
                ownerName: document.getElementById('ownerName').value || 'LCL/TEAM',
                teamName: document.getElementById('teamName').value || 'TEAM',
                imageTag: document.getElementById('imageTag').value || '1.0.0',
                deployDev: document.getElementById('deployDev').checked,
                deployUat: document.getElementById('deployUat').checked,
                deployProd: document.getElementById('deployProd').checked,
                sonarqube: document.getElementById('sonarqube').checked,
                promoteStaging: document.getElementById('promoteStaging').checked,
                promoteStable: document.getElementById('promoteStable').checked,
                createChange: document.getElementById('createChange').checked,
                playwright: document.getElementById('playwright').checked,
                newman: document.getElementById('newman').checked,
                bruno: document.getElementById('bruno').checked
            };

            generatedYaml = buildYaml(config);

            document.getElementById('yamlContent').textContent = generatedYaml;
            document.getElementById('yamlSection').style.display = 'block';
            document.getElementById('pushOnlyBtn').disabled = false;
            document.getElementById('pushRunBtn').disabled = false;

            showMessage('info', '👁️ Prévisualisation générée. Choisissez une action.');
            document.getElementById('yamlSection').scrollIntoView({ behavior: 'smooth' });
        }

        function buildYaml(config) {
            const imageTag = config.imageTag || '1.0.0';

            let yaml = `include:
  - project: "lcl/commun/devops/ci-cd"
    file: "toolchain.yaml"
    ref: "main"

# ========================================
# VARIABLES DU PROJET
# ========================================
variables:
  # === Informations métier (obligatoires) ===
  CAPIREF: "${config.capiref}"
  APP_MS_NAME: "${config.appName}"
  OWNER_EMAIL: "${config.ownerEmail}"
  OWNER_NAME: "${config.ownerName}"
  APP_BLOCK_CODE: "${config.blockCode}"
  CONTACT_LDD: "${config.ownerEmail}"
  TEAM: "${config.teamName}"
  IMAGE_TAG: "${imageTag}"

  ENABLE_SONAR: "${config.sonarqube}"
  ENABLE_CREATE_CHANGE: "${config.createChange}"
  ENABLE_PROMOTE_STAGING: "${config.promoteStaging}"
  ENABLE_PROMOTE_STABLE: "${config.promoteStable}"
`;

            // Jobs de tests : opt-in, écrits uniquement si activés
            if (config.playwright) yaml += `  ENABLE_PLAYWRIGHT: "true"\n`;
            if (config.newman)     yaml += `  ENABLE_NEWMAN: "true"\n`;
            if (config.bruno)      yaml += `  ENABLE_BRUNO: "true"\n`;

            yaml += `
  DEPLOY_TO_DEV: "${config.deployDev}"
  DEPLOY_TO_UAT: "${config.deployUat}"
  DEPLOY_TO_PROD: "${config.deployProd}"

# Deploy rules
deploy:
  rules:
    # Vos règles supplémentaires
    - if: $CI_PIPELINE_SOURCE != "merge_request_event"

# Docker rules
build_docker:
  rules:
    # Vos règles supplémentaires
    - if: $CI_PIPELINE_SOURCE != "merge_request_event"
`;

            return yaml;
        }


        // ══════════════════════════════════════════════════════════════════
        //  VERSION BUMP & OVERLAY SYNC
        // ══════════════════════════════════════════════════════════════════

        function bumpImageTag(type) {
            const input = document.getElementById('imageTag');
            const current = (input.value || '').trim();
            const match = current.match(/^(\d+)\.(\d+)\.(\d+)/);
            if (!match) {
                showMessage('error', `❌ "${current}" n'est pas en SemVer (attendu : x.y.z)`);
                return;
            }
            let major = parseInt(match[1], 10);
            let minor = parseInt(match[2], 10);
            let patch = parseInt(match[3], 10);
            if (type === 'major') { major += 1; minor = 0; patch = 0; }
            else if (type === 'minor') { minor += 1; patch = 0; }
            else if (type === 'patch') { patch += 1; }
            input.value = `${major}.${minor}.${patch}`;
            showMessage('info', `📈 IMAGE_TAG : ${current} → ${input.value}`);
        }

        async function syncOverlays() {
            const branch = document.getElementById('targetBranch').value;
            const newVersion = (document.getElementById('imageTag').value || '').trim();

            if (!projectId) {
                showMessage('error', '❌ Pas de projet GitLab sélectionné');
                return;
            }
            if (!branch) {
                showMessage('error', '❌ Sélectionne d\'abord une branche cible');
                return;
            }
            if (!token) {
                showMessage('error', '❌ Pas de token GitLab en session');
                return;
            }
            if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
                showMessage('error', `❌ IMAGE_TAG "${newVersion}" non SemVer`);
                return;
            }

            const overlayPaths = [
                'Manifests/overlays/development/kustomization.yaml',
                'Manifests/overlays/uat/kustomization.yaml'
            ];

            const btn = document.getElementById('syncOverlaysBtn');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '⏳ Sync en cours...';

            try {
                const actions = [];
                const summary = [];

                for (const path of overlayPaths) {
                    const url = `${GITLAB_URL}/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
                    const res = await fetch(url, {
                        headers: { 'PRIVATE-TOKEN': token }
                    });
                    if (!res.ok) {
                        if (res.status === 404) {
                            throw new Error(`Fichier introuvable sur ${branch} : ${path}`);
                        }
                        throw new Error(`Lecture ${path} : HTTP ${res.status}`);
                    }
                    const data = await res.json();
                    const original = atob(data.content);

                    // Patch line par line, on garde les guillemets pour newTag
                    const updated = original
                        .replace(/^(\s*newTag:\s*).*$/gm, `$1"${newVersion}"`)
                        .replace(/^(\s*-\s+APP_VERSION=).*$/gm, `$1${newVersion}`);

                    if (updated === original) {
                        console.warn(`⚠️ Aucun changement détecté dans ${path}`);
                        summary.push(`${path} : pas de changement`);
                    } else {
                        summary.push(`${path} : OK`);
                    }

                    actions.push({
                        action: 'update',
                        file_path: path,
                        content: updated
                    });
                }

                // Commit atomique des 2 fichiers
                const commitRes = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/repository/commits`, {
                    method: 'POST',
                    headers: {
                        'PRIVATE-TOKEN': token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        branch: branch,
                        commit_message: `[DevOps Hub] Bump version → ${newVersion} (development + uat)`,
                        actions: actions
                    })
                });

                if (!commitRes.ok) {
                    const errText = await commitRes.text();
                    throw new Error(`Commit refusé : HTTP ${commitRes.status} — ${errText}`);
                }

                const commit = await commitRes.json();
                console.log('Sync overlays:', summary);
                showMessage('success', `✅ Overlays sync à ${newVersion} sur ${branch} — commit ${commit.short_id}`);
            } catch (err) {
                console.error(err);
                showMessage('error', `❌ Sync overlays : ${err.message}`);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }


        // ══════════════════════════════════════════════════════════════════
        //  PUSH TO GITLAB
        // ══════════════════════════════════════════════════════════════════

        async function pushToGitlab(runPipeline = true) {
            // Forcer la conversion en boolean (au cas où passé comme string)
            runPipeline = runPipeline === true || runPipeline === 'true';
            console.log('pushToGitlab called with runPipeline:', runPipeline, typeof runPipeline);
            
            const branch = document.getElementById('targetBranch').value;

            if (!branch) {
                showMessage('error', '❌ Sélectionnez une branche');
                return;
            }

            if (!generatedYaml) {
                showMessage('error', '❌ Générez d\'abord le pipeline');
                return;
            }

            const pushOnlyBtn = document.getElementById('pushOnlyBtn');
            const pushRunBtn = document.getElementById('pushRunBtn');
            pushOnlyBtn.disabled = true;
            pushRunBtn.disabled = true;
            
            const activeBtn = runPipeline ? pushRunBtn : pushOnlyBtn;
            const originalText = activeBtn.innerHTML;
            activeBtn.innerHTML = '⏳ Push en cours...';

            try {
                // Vérifier si le fichier existe
                const checkRes = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/repository/files/.gitlab-ci.yml?ref=${encodeURIComponent(branch)}`, {
                    headers: { 'PRIVATE-TOKEN': token }
                });

                const fileExists = checkRes.ok;
                const method = fileExists ? 'PUT' : 'POST';

                // Message de commit avec ou sans [ci skip]
                const commitMessage = runPipeline 
                    ? `[DevOps Hub] ${fileExists ? 'Update' : 'Add'} .gitlab-ci.yml`
                    : `[DevOps Hub] ${fileExists ? 'Update' : 'Add'} .gitlab-ci.yml [ci skip]`;

                // Créer ou mettre à jour
                const res = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/repository/files/.gitlab-ci.yml`, {
                    method: method,
                    headers: {
                        'PRIVATE-TOKEN': token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        branch: branch,
                        content: generatedYaml,
                        commit_message: commitMessage,
                        encoding: 'text'
                    })
                });

                if (!res.ok) {
                    const error = await res.json();
                    throw new Error(error.message || 'Erreur push');
                }

                if (runPipeline) {
                    showMessage('success', `✅ Pipeline pushé sur "${branch}" !`);

                    // Attendre un peu que GitLab déclenche le pipeline
                    activeBtn.innerHTML = '⏳ Recherche du pipeline...';
                    await new Promise(r => setTimeout(r, 2000));

                    // Récupérer le dernier pipeline déclenché
                    const pipelinesRes = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/pipelines?ref=${encodeURIComponent(branch)}&per_page=1&order_by=id&sort=desc`, {
                        headers: { 'PRIVATE-TOKEN': token }
                    });

                    if (pipelinesRes.ok) {
                        const pipelines = await pipelinesRes.json();
                        if (pipelines.length > 0) {
                            const latestPipeline = pipelines[0];
                            showMessage('info', `🚀 Pipeline #${latestPipeline.id} détecté ! Démarrage du monitoring...`);
                            await startPipelineMonitor(latestPipeline.id);
                        } else {
                            showMessage('info', '⚠️ Aucun pipeline détecté. Vérifiez sur GitLab.');
                        }
                    }
                } else {
                    showMessage('success', `✅ YAML sauvegardé sur "${branch}" (pipeline non lancé)`);
                }

            } catch (error) {
                console.error('Erreur push:', error);
                showMessage('error', `❌ Erreur: ${error.message}`);
            }

            pushOnlyBtn.disabled = false;
            pushRunBtn.disabled = false;
            pushOnlyBtn.innerHTML = '💾 Sauvegarder (sans lancer)';
            pushRunBtn.innerHTML = '🚀 Sauvegarder & Lancer';
        }

        async function runPipelineOnly() {
            const branch = document.getElementById('runBranch').value;

            if (!branch) {
                showMessage('error', '❌ Sélectionnez une branche');
                return;
            }

            const runBtn = document.getElementById('runPipelineBtn');
            runBtn.disabled = true;
            runBtn.innerHTML = '⏳ Lancement...';

            try {
                // Lancer la pipeline via l'API
                console.log('Running pipeline on branch:', branch);
                console.log('URL:', `${GITLAB_URL}/api/v4/projects/${projectId}/pipeline`);
                
                const res = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/pipeline`, {
                    method: 'POST',
                    headers: {
                        'PRIVATE-TOKEN': token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        ref: branch
                    })
                });

                if (!res.ok) {
                    const errorData = await res.json();
                    console.error('Pipeline error:', errorData);
                    // GitLab renvoie souvent { message: { base: ["error"] } } ou { error: "message" }
                    let errorMsg = 'Erreur inconnue';
                    if (errorData.message) {
                        if (typeof errorData.message === 'string') {
                            errorMsg = errorData.message;
                        } else if (errorData.message.base) {
                            errorMsg = errorData.message.base.join(', ');
                        } else {
                            errorMsg = JSON.stringify(errorData.message);
                        }
                    } else if (errorData.error) {
                        errorMsg = errorData.error;
                    } else if (errorData.errors) {
                        errorMsg = Array.isArray(errorData.errors) ? errorData.errors.join(', ') : errorData.errors;
                    }
                    throw new Error(errorMsg);
                }

                const pipeline = await res.json();
                showMessage('success', `✅ Pipeline #${pipeline.id} lancé sur "${branch}" !`);
                
                // Démarrer le monitoring
                await startPipelineMonitor(pipeline.id);

            } catch (error) {
                console.error('Erreur run pipeline:', error);
                showMessage('error', `❌ Erreur: ${error.message || error}`);
            }

            runBtn.disabled = false;
            runBtn.innerHTML = '▶️ Lancer la pipeline';
        }


        // ══════════════════════════════════════════════════════════════════
        //  UTILS
        // ══════════════════════════════════════════════════════════════════

        function showMessage(type, text) {
            document.querySelectorAll('.message').forEach(m => m.classList.remove('show'));
            const msg = document.getElementById(`${type}Message`);
            if (msg) {
                msg.textContent = text;
                msg.classList.add('show');
                setTimeout(() => msg.classList.remove('show'), 5000);
            }
        }

        function copyYaml() {
            navigator.clipboard.writeText(generatedYaml).then(() => {
                showMessage('success', '📋 YAML copié !');
            });
        }

        function downloadYaml() {
            const blob = new Blob([generatedYaml], { type: 'text/yaml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '.gitlab-ci.yml';
            a.click();
            URL.revokeObjectURL(url);
        }


        // ══════════════════════════════════════════════════════════════════
        //  PIPELINE MONITOR
        // ══════════════════════════════════════════════════════════════════

        let currentPipelineId = null;
        let currentJobId = null;
        let monitoringInterval = null;
        let logsInterval = null;
        let autoScroll = true;

        async function startPipelineMonitor(pipelineId) {
            currentPipelineId = pipelineId;
            
            // Show monitor
            document.getElementById('pipelineMonitor').style.display = 'block';
            document.getElementById('pipelineId').textContent = `#${pipelineId}`;
            
            // Set GitLab link
            document.getElementById('gitlabPipelineLink').href = `${GITLAB_URL}/${projectPath}/-/pipelines/${pipelineId}`;
            
            // Start monitoring
            await updatePipelineStatus();
            monitoringInterval = setInterval(updatePipelineStatus, 3000);
            
            // Scroll to monitor
            document.getElementById('pipelineMonitor').scrollIntoView({ behavior: 'smooth' });
        }

        async function updatePipelineStatus() {
            try {
                // Get pipeline info
                const pipelineRes = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/pipelines/${currentPipelineId}`, {
                    headers: { 'PRIVATE-TOKEN': token }
                });
                
                if (!pipelineRes.ok) throw new Error('Pipeline not found');
                
                const pipeline = await pipelineRes.json();
                updateStatusBadge(pipeline.status);
                
                // Get jobs
                const jobsRes = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/pipelines/${currentPipelineId}/jobs?per_page=50`, {
                    headers: { 'PRIVATE-TOKEN': token }
                });
                
                if (!jobsRes.ok) throw new Error('Jobs not found');
                
                const jobs = await jobsRes.json();
                renderJobs(jobs.reverse()); // Reverse to show in order
                
                // Auto-select running job
                const runningJob = jobs.find(j => j.status === 'running');
                if (runningJob && currentJobId !== runningJob.id) {
                    selectJob(runningJob.id, runningJob.name);
                }
                
                // Stop monitoring if pipeline finished
                if (['success', 'failed', 'canceled'].includes(pipeline.status)) {
                    clearInterval(monitoringInterval);
                    showMessage(pipeline.status === 'success' ? 'success' : 'error', 
                        pipeline.status === 'success' ? '✅ Pipeline terminé avec succès !' : `❌ Pipeline ${pipeline.status}`);
                }
                
            } catch (error) {
                console.error('Monitor error:', error);
            }
        }

        function updateStatusBadge(status) {
            const badge = document.querySelector('.status-badge');
            badge.className = `status-badge ${status}`;
            
            const icons = {
                pending: '⏳ En attente',
                running: '🔄 En cours',
                success: '✅ Succès',
                failed: '❌ Échec',
                canceled: '⏹️ Annulé'
            };
            
            badge.textContent = icons[status] || status;
        }

        function renderJobs(jobs) {
            const timeline = document.getElementById('jobsTimeline');
            
            const icons = {
                pending: '⏳',
                created: '⏳',
                running: '🔄',
                success: '✅',
                failed: '❌',
                canceled: '⏹️',
                skipped: '⏭️',
                manual: '👆'
            };
            
            // Grouper les jobs par stage
            const stages = {};
            const stageOrder = [];
            
            jobs.forEach(job => {
                const stageName = job.stage || 'unknown';
                if (!stages[stageName]) {
                    stages[stageName] = [];
                    stageOrder.push(stageName);
                }
                stages[stageName].push(job);
            });
            
            // Déterminer le statut de chaque stage
            function getStageStatus(stageJobs) {
                if (stageJobs.some(j => j.status === 'failed')) return 'failed';
                if (stageJobs.some(j => j.status === 'running')) return 'running';
                if (stageJobs.every(j => j.status === 'success')) return 'success';
                if (stageJobs.some(j => j.status === 'pending' || j.status === 'created')) return 'pending';
                return 'pending';
            }
            
            // Construire le HTML du train
            let html = '';
            
            stageOrder.forEach((stageName, index) => {
                const stageJobs = stages[stageName];
                const stageStatus = getStageStatus(stageJobs);
                
                // Ajouter la flèche avant (sauf pour le premier stage)
                if (index > 0) {
                    const prevStageStatus = getStageStatus(stages[stageOrder[index - 1]]);
                    html += `<div class="stage-arrow ${prevStageStatus}">→</div>`;
                }
                
                // Stage container
                html += `
                    <div class="stage-container">
                        <div class="stage">
                            <div class="stage-name">${stageName}</div>
                            <div class="stage-jobs">
                `;
                
                // Jobs du stage
                stageJobs.forEach(job => {
                    html += `
                        <div class="job-card ${job.status} ${currentJobId === job.id ? 'active' : ''}" 
                             onclick="selectJob(${job.id}, '${job.name.replace(/'/g, "\\'")}')">
                            <div class="job-icon">${icons[job.status] || '❓'}</div>
                            <div class="job-name" title="${job.name}">${job.name}</div>
                            <div class="job-duration">${formatDuration(job.duration)}</div>
                        </div>
                    `;
                });
                
                html += `
                            </div>
                        </div>
                    </div>
                `;
            });
            
            timeline.innerHTML = html;
        }

        function formatDuration(seconds) {
            if (!seconds) return '--';
            if (seconds < 60) return `${Math.round(seconds)}s`;
            const mins = Math.floor(seconds / 60);
            const secs = Math.round(seconds % 60);
            return `${mins}m ${secs}s`;
        }

        async function selectJob(jobId, jobName) {
            currentJobId = jobId;
            document.getElementById('currentJobName').textContent = jobName;
            
            // Update active state
            document.querySelectorAll('.job-card').forEach(card => {
                card.classList.toggle('active', card.onclick.toString().includes(jobId));
            });
            
            // Clear previous logs interval
            if (logsInterval) clearInterval(logsInterval);
            
            // Fetch logs
            await fetchJobLogs();
            
            // Start logs polling for running jobs
            const jobCard = document.querySelector(`.job-card.active`);
            if (jobCard && jobCard.classList.contains('running')) {
                logsInterval = setInterval(fetchJobLogs, 2000);
            }
        }

        async function fetchJobLogs() {
            if (!currentJobId) return;
            
            try {
                const res = await fetch(`${GITLAB_URL}/api/v4/projects/${projectId}/jobs/${currentJobId}/trace`, {
                    headers: { 'PRIVATE-TOKEN': token }
                });
                
                if (!res.ok) {
                    document.getElementById('logsContent').textContent = 'Logs non disponibles';
                    return;
                }
                
                const logs = await res.text();
                const formattedLogs = formatLogs(logs);
                document.getElementById('logsContent').innerHTML = formattedLogs;
                
                // Auto scroll
                if (autoScroll) {
                    const container = document.getElementById('logsContainer');
                    container.scrollTop = container.scrollHeight;
                }
                
            } catch (error) {
                console.error('Logs error:', error);
                document.getElementById('logsContent').textContent = 'Erreur chargement logs';
            }
        }

        function formatLogs(logs) {
            // Remove ANSI codes
            logs = logs.replace(/\x1b\[[0-9;]*m/g, '');
            
            // Split into lines and format
            return logs.split('\n').map(line => {
                let className = 'log-line';
                
                if (line.includes('✅') || line.includes('success') || line.includes('SUCCESS')) {
                    className += ' success';
                } else if (line.includes('❌') || line.includes('error') || line.includes('ERROR') || line.includes('fatal')) {
                    className += ' error';
                } else if (line.includes('⚠️') || line.includes('warning') || line.includes('WARNING')) {
                    className += ' warning';
                } else if (line.includes('===') || line.includes('---') || line.startsWith('section_')) {
                    className += ' section';
                } else if (line.includes('ℹ️') || line.includes('INFO')) {
                    className += ' info';
                }
                
                // Escape HTML
                const escaped = line
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                
                return `<span class="${className}">${escaped}</span>`;
            }).join('\n');
        }

        function toggleAutoScroll() {
            autoScroll = !autoScroll;
            document.getElementById('autoScrollBtn').textContent = `📜 Auto-scroll: ${autoScroll ? 'ON' : 'OFF'}`;
        }

        function refreshLogs() {
            fetchJobLogs();
            showMessage('info', '🔄 Logs rafraîchis');
        }

        function stopMonitoring() {
            if (monitoringInterval) clearInterval(monitoringInterval);
            if (logsInterval) clearInterval(logsInterval);
            document.getElementById('pipelineMonitor').style.display = 'none';
            currentPipelineId = null;
            currentJobId = null;
            showMessage('info', '⏹️ Monitoring arrêté');
        }


        // ══════════════════════════════════════════════════════════════════
        //  RESET FORM
        // ══════════════════════════════════════════════════════════════════

        function resetForm() {
            document.getElementById('yamlSection').style.display = 'none';
            document.getElementById('pushOnlyBtn').disabled = true;
            document.getElementById('pushRunBtn').disabled = true;
            document.querySelectorAll('.message').forEach(m => m.classList.remove('show'));
            generatedYaml = null;

            // Reset tous les champs
            document.getElementById('capiref').value = '';
            document.getElementById('blockCode').value = '';
            document.getElementById('ownerEmail').value = '';
            document.getElementById('ownerName').value = '';
            document.getElementById('teamName').value = '';
            document.getElementById('imageTag').value = '1.0.0';

            // Reset checkboxes - jobs activés par défaut
            document.getElementById('deployDev').checked = true;
            document.getElementById('deployUat').checked = true;
            document.getElementById('deployProd').checked = false;
            document.getElementById('sonarqube').checked = true;
            document.getElementById('promoteStaging').checked = true;
            document.getElementById('promoteStable').checked = true;
            document.getElementById('createChange').checked = false;
            
            // Jobs de test désactivés par défaut
            document.getElementById('playwright').checked = false;
            document.getElementById('newman').checked = false;
            document.getElementById('bruno').checked = false;
        }


        // ══════════════════════════════════════════════════════════════════
        //  START
        // ══════════════════════════════════════════════════════════════════

        init();
