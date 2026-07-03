        // ============================================
        // AUTH + REPO — modèle plateforme (aligné DevOps Hub)
        // Token : localStorage 'devops_hub_workspaces' = { gitlabUrl, token, username }
        // Repo  : passé en query param ?repo=<id> par la modal "Démarrer" du Hub
        // ============================================
        const STORAGE_KEY = 'devops_hub_workspaces';

        // ⚠️ Nom de page du NOUVEAU hub (le seul endroit à changer pour les liens retour).
        // Le mockup V2 est désormais le hub. Si tu le renommes (ex. hub.html en prod), change ici.
        const HUB_URL = 'hub-mockup-v2_1.html';

        function loadAuth() {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            try {
                const data = JSON.parse(raw);
                if (!data.gitlabUrl || !data.token) return null;
                return data;
            } catch { return null; }
        }

        const auth = loadAuth();
        if (!auth) { window.location.href = 'login.html'; }

        const repoId = new URLSearchParams(location.search).get('repo');
        if (!repoId) { window.location.href = HUB_URL; }

        // sessionData conserve les mêmes champs que le moteur attend ;
        // gitlabUrl (web_url du repo) et projectName sont remplis après fetch.
        const sessionData = {
            gitlabBaseUrl: auth ? auth.gitlabUrl : null, // racine instance → /api/v4
            gitlabUrl: null,                              // web_url du repo (clone + lien MR)
            gitlabToken: auth ? auth.token : null,
            projectName: null,
            projectId: repoId
        };

        // Description du projet (utilisée dans les templates)
        let projectDescription = '';

        // Charge le repo cible depuis GitLab puis amorce l'UI.
        async function boot() {
            // Tous les liens retour pointent sur le nouveau hub
            document.querySelectorAll('[data-hub-link]').forEach(a => { a.href = HUB_URL; });
            try {
                const project = await gitlabAPI(`/projects/${sessionData.projectId}`);
                sessionData.projectName = project.name;
                sessionData.gitlabUrl   = project.web_url;
                projectDescription      = project.description || '';
                document.getElementById('headerProjectName').textContent = project.name;

                // ⛔ GARDE-FOU : ne JAMAIS scaffolder un repo qui a du contenu.
                const guard = await checkRepoScaffoldable(project);
                if (!guard.ok) {
                    showBlocked(guard.reason, guard.detail);
                    return; // wizard jamais affiché → aucun write possible
                }

                updateUI();
            } catch (e) {
                console.error('Erreur chargement du repo:', e);
                alert("Impossible de charger le repo sélectionné.\n\n" + e.message + "\n\nRetour au Hub.");
                window.location.href = HUB_URL;
            }
        }

        // ============================================
        // GARDE-FOU "REPO VIDE" — bloque toute écriture destructive
        // ============================================
        // Autorisé : repo neuf, branche par défaut avec au plus un README/.gitignore/LICENSE
        // et un seul commit. Tout le reste = refus, on ne touche à rien.
        const SCAFFOLD_ALLOWLIST = new Set([
            'README.md', 'readme.md', 'Readme.md', 'README', 'README.rst',
            '.gitignore', 'LICENSE', 'LICENSE.md', 'LICENCE', 'license'
        ]);

        async function checkRepoScaffoldable(project) {
            // Cas 1 : repo totalement vide (aucun commit / pas de branche par défaut).
            // Le moteur fait `update README.md` et branche depuis `main` → il LUI FAUT un README initial.
            if (project.empty_repo || !project.default_branch) {
                return {
                    ok: false,
                    reason: "Ce repo n'a pas encore de branche par défaut.",
                    detail: "Initialise-le côté GitLab avec un README (option « Initialize repository with a README ») puis relance « Démarrer »."
                };
            }
            const branch = project.default_branch;

            // Cas 2 : contenu à la racine de la branche par défaut.
            let tree;
            try {
                tree = await gitlabAPI(`/projects/${project.id}/repository/tree?ref=${encodeURIComponent(branch)}&per_page=100`);
            } catch (e) {
                // Par sécurité, en cas de doute on bloque plutôt que de risquer un écrasement.
                return {
                    ok: false,
                    reason: "Impossible de vérifier le contenu du repo.",
                    detail: "Vérification de sécurité échouée (" + e.message + "). Initialisation annulée par prudence."
                };
            }
            const meaningful = (tree || []).filter(e => !SCAFFOLD_ALLOWLIST.has(e.name));
            if (meaningful.length > 0) {
                const sample = meaningful.slice(0, 4).map(e => e.name).join(', ');
                return {
                    ok: false,
                    reason: "Ce repo n'est pas vide.",
                    detail: `${meaningful.length} élément(s) déjà présent(s) à la racine de « ${branch} » (ex. ${sample}${meaningful.length > 4 ? '…' : ''}). Initialisation annulée pour ne rien écraser.`
                };
            }

            // Cas 3 : historique (plus d'un commit) → on bloque par prudence même si la racine est "propre".
            try {
                const commits = await gitlabAPI(`/projects/${project.id}/repository/commits?per_page=2&ref_name=${encodeURIComponent(branch)}`);
                if (Array.isArray(commits) && commits.length > 1) {
                    return {
                        ok: false,
                        reason: "Ce repo a déjà un historique.",
                        detail: `Plusieurs commits sur « ${branch} ». Initialisation annulée par prudence — le Scaffolder est réservé aux repos neufs.`
                    };
                }
            } catch (e) {
                console.warn('Vérif commits non concluante (on continue) :', e.message);
            }

            return { ok: true };
        }

        function showBlocked(reason, detail) {
            const formCard = document.getElementById('formCard');
            const blocked = document.getElementById('blockedCard');
            const progress = document.querySelector('.progress-steps');
            if (formCard) formCard.style.display = 'none';
            if (progress) progress.style.display = 'none';
            if (blocked) {
                document.getElementById('blockedReason').textContent = reason;
                document.getElementById('blockedDetail').textContent = detail;
                document.getElementById('blockedHubLink').href = HUB_URL;
                blocked.style.display = 'block';
            }
        }

        // ============================================
        // STATE
        // ============================================
        let currentStep = 1;
        const totalSteps = 4;
        
        const config = {
            workflow: 'gitflow',
            stack: 'java',
            options: {
                kustomize: true,
                gitlabCi: true,
                dockerfile: false,
                editorconfig: true,
                protectMain: true,
                protectDevelop: false
            }
        };

        // ============================================
        // DOM ELEMENTS
        // ============================================
        const steps = document.querySelectorAll('.step');
        const formSteps = document.querySelectorAll('.form-step');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const formCard = document.getElementById('formCard');
        const successCard = document.getElementById('successCard');
        const loadingOverlay = document.getElementById('loadingOverlay');

        // ============================================
        // NAVIGATION
        // ============================================
        function updateUI() {
            // Update progress steps
            steps.forEach((step, index) => {
                const stepNum = index + 1;
                step.classList.remove('active', 'completed');
                if (stepNum === currentStep) {
                    step.classList.add('active');
                } else if (stepNum < currentStep) {
                    step.classList.add('completed');
                }
            });

            // Show/hide form steps
            formSteps.forEach(fs => {
                fs.classList.remove('active');
                if (parseInt(fs.dataset.step) === currentStep) {
                    fs.classList.add('active');
                }
            });

            // Update buttons
            prevBtn.style.visibility = currentStep === 1 ? 'hidden' : 'visible';
            
            if (currentStep === totalSteps) {
                nextBtn.innerHTML = '🚀 Initialiser';
            } else {
                nextBtn.innerHTML = 'Suivant →';
            }

            // Step-specific updates
            if (currentStep === 3) {
                updateOptionsVisibility();
            }
            if (currentStep === 4) {
                updateSummary();
            }
        }

        function nextStep() {
            if (currentStep < totalSteps) {
                currentStep++;
                updateUI();
            } else {
                initializeProject();
            }
        }

        function prevStep() {
            if (currentStep > 1) {
                currentStep--;
                updateUI();
            }
        }

        // ============================================
        // WORKFLOW SELECTION
        // ============================================
        const workflowInfoTexts = {
            'gitflow': 'GitFlow est recommandé pour les projets avec des cycles de release planifiés.',
            'feature-branching': 'Feature Branching est idéal pour les petites équipes avec des déploiements fréquents.',
            'trunk': 'Trunk-based active automatiquement le Merge Train pour un flux CD optimisé.'
        };

        document.querySelectorAll('input[name="workflow"]').forEach(input => {
            input.addEventListener('change', (e) => {
                config.workflow = e.target.value;
                document.getElementById('workflowInfoText').textContent = workflowInfoTexts[config.workflow];
            });
        });

        // ============================================
        // STACK SELECTION
        // ============================================
        document.querySelectorAll('input[name="stack"]').forEach(input => {
            input.addEventListener('change', (e) => {
                config.stack = e.target.value;
            });
        });

        // ============================================
        // OPTIONS
        // ============================================
        function updateOptionsVisibility() {
            const protectDevelopContainer = document.getElementById('optProtectDevelopContainer');
            if (config.workflow === 'gitflow') {
                protectDevelopContainer.classList.remove('disabled');
                protectDevelopContainer.querySelector('input').disabled = false;
            } else {
                protectDevelopContainer.classList.add('disabled');
                protectDevelopContainer.querySelector('input').disabled = true;
                protectDevelopContainer.querySelector('input').checked = false;
                config.options.protectDevelop = false;
            }
        }

        document.querySelectorAll('.checkbox-item input').forEach(input => {
            input.addEventListener('change', (e) => {
                const optionMap = {
                    'optKustomize': 'kustomize',
                    'optGitlabCi': 'gitlabCi',
                    'optDockerfile': 'dockerfile',
                    'optEditorconfig': 'editorconfig',
                    'optProtect': 'protectMain',
                    'optProtectDevelop': 'protectDevelop'
                };
                const option = optionMap[e.target.id];
                if (option) {
                    config.options[option] = e.target.checked;
                }
            });
        });

        // ============================================
        // PREVIEW TABS
        // ============================================
        document.querySelectorAll('.preview-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.preview-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.querySelector(`.preview-content[data-preview="${tab.dataset.preview}"]`).classList.add('active');
            });
        });

        // ============================================
        // SUMMARY
        // ============================================
        function updateSummary() {
            // Update header
            document.getElementById('summaryRepoName').textContent = sessionData.projectName;
            document.getElementById('summaryRepoPath').textContent = sessionData.projectId;

            const workflowLabels = {
                'gitflow': '🌳 GitFlow',
                'feature-branching': '🌿 Feature Branching',
                'trunk': '🚄 Trunk-based'
            };
            const stackLabels = {
                'java': '☕ Java Maven',
                'angular': '🅰️ Angular',
                'python': '🐍 Python',
                'node': '💚 Node.js',
                'dotnet': '🔷 .NET',
                'cobol': '🏛️ COBOL/z/OS',
                'empty': '📁 Minimal'
            };

            document.getElementById('summaryWorkflow').textContent = workflowLabels[config.workflow];
            document.getElementById('summaryStack').textContent = stackLabels[config.stack];

            // Update previews
            updateFileTree();
            updateBranchList();
            updateSettingsList();
        }

        function updateFileTree() {
            let html = `<span class="folder">${sessionData.projectName}/</span><br>`;
            
            const files = [];
            
            files.push({ name: 'README.md', hint: 'généré' });
            files.push({ name: '.gitignore', hint: config.stack });
            
            if (config.options.gitlabCi) {
                files.push({ name: '.gitlab-ci.yml', hint: 'placeholder' });
            }
            if (config.options.editorconfig) {
                files.push({ name: '.editorconfig', hint: '' });
            }
            if (config.options.dockerfile) {
                files.push({ name: 'Dockerfile', hint: 'multi-stage' });
            }

            // Stack specific
            if (config.stack === 'java') {
                files.push({ name: 'pom.xml', hint: '' });
                files.push({ name: 'src/', hint: '', folder: true });
            } else if (config.stack === 'angular') {
                files.push({ name: 'package.json', hint: '' });
                files.push({ name: 'angular.json', hint: '' });
                files.push({ name: 'src/', hint: '', folder: true });
            } else if (config.stack === 'python') {
                files.push({ name: 'pyproject.toml', hint: '' });
                files.push({ name: 'requirements.txt', hint: '' });
                files.push({ name: 'src/', hint: '', folder: true });
            } else if (config.stack === 'node') {
                files.push({ name: 'package.json', hint: '' });
                files.push({ name: 'src/', hint: '', folder: true });
            } else if (config.stack === 'dotnet') {
                files.push({ name: `${sessionData.projectName}.csproj`, hint: '' });
                files.push({ name: 'src/', hint: '', folder: true });
            } else if (config.stack === 'cobol') {
                files.push({ name: 'src/', hint: '', folder: true, sub: [
                    'cobol/*.cbl',
                    'copybook/*.cpy',
                    'jcl/*.jcl',
                    'bms/'
                ]});
                files.push({ name: 'build/', hint: 'DBB', folder: true, sub: [
                    'build.groovy',
                    'build.properties'
                ]});
            }

            if (config.options.kustomize) {
                files.push({ name: 'kustomize/', hint: '', folder: true, sub: [
                    'base/',
                    'overlays/dev/',
                    'overlays/recette/',
                    'overlays/prod/'
                ]});
            }

            files.forEach((f, i) => {
                const isLast = i === files.length - 1 && !f.sub;
                const prefix = isLast ? '└── ' : '├── ';
                const className = f.folder ? 'folder' : 'file';
                const hint = f.hint ? ` <span class="generated">← ${f.hint}</span>` : '';
                html += `${prefix}<span class="${className}">${f.name}</span>${hint}<br>`;
                
                if (f.sub) {
                    f.sub.forEach((s, si) => {
                        const subPrefix = si === f.sub.length - 1 ? '    └── ' : '    ├── ';
                        html += `${subPrefix}<span class="folder">${s}</span><br>`;
                    });
                }
            });

            document.getElementById('fileTree').innerHTML = html;
        }

        function updateBranchList() {
            const branches = [];
            
            branches.push({ name: 'main', badges: ['default', config.options.protectMain ? 'protected' : null].filter(Boolean) });
            
            if (config.workflow === 'gitflow') {
                branches.push({ name: 'develop', badges: config.options.protectDevelop ? ['protected'] : [] });
                branches.push({ name: 'feature/example', badges: ['example'] });
            } else if (config.workflow === 'feature-branching') {
                branches.push({ name: 'feature/example', badges: ['example'] });
            }

            let html = '';
            branches.forEach(b => {
                const badgesHtml = b.badges.map(badge => {
                    const labels = {
                        'default': 'DEFAULT',
                        'protected': '🔒 PROTECTED',
                        'example': 'EXAMPLE'
                    };
                    return `<span class="branch-badge ${badge}">${labels[badge]}</span>`;
                }).join('');
                
                html += `
                    <div class="branch-item">
                        <span class="branch-icon">🌿</span>
                        <span class="branch-name">${b.name}</span>
                        ${badgesHtml}
                    </div>
                `;
            });

            document.getElementById('branchList').innerHTML = html;
        }

        function updateSettingsList() {
            const settings = [];

            if (config.options.protectMain) {
                settings.push('Branche main protégée');
            }
            if (config.workflow === 'gitflow' && config.options.protectDevelop) {
                settings.push('Branche develop protégée');
            }
            if (config.workflow === 'trunk') {
                settings.push('Merged results pipelines activé');
                settings.push('Merge train activé');
            }

            let html = settings.length > 0 
                ? settings.map(s => `<div class="settings-item"><span class="check">✓</span> ${s}</div>`).join('')
                : '<div class="settings-item" style="opacity: 0.5">Aucun setting particulier</div>';

            document.getElementById('settingsList').innerHTML = html;
        }

        // ============================================
        // FILE TEMPLATES
        // ============================================
        
        function getReadmeContent() {
            return `# ${sessionData.projectName}

${projectDescription || 'Description du projet.'}

## 🚀 Getting Started

\`\`\`bash
git clone ${sessionData.gitlabUrl}.git
cd ${sessionData.projectName}
\`\`\`

## 📁 Structure

\`\`\`
${sessionData.projectName}/
├── src/           # Code source
├── kustomize/     # Manifests Kubernetes (ArgoCD)
└── ...
\`\`\`

## 🔧 Configuration

Voir le Pipeline Generator du DevOps Hub pour configurer le CI/CD.

---
*Généré par LCL DevOps Hub*
`;
        }

        function getGitignore() {
            const common = `# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/
`;
            const stacks = {
                'java': `# Java
target/
*.class
*.jar
*.war
.mvn/
!.mvn/wrapper/maven-wrapper.jar
`,
                'angular': `# Node
node_modules/
dist/
.angular/
.npm/
npm-debug.log
`,
                'python': `# Python
__pycache__/
*.py[cod]
*$py.class
.Python
venv/
.venv/
*.egg-info/
dist/
build/
.pytest_cache/
`,
                'node': `# Node
node_modules/
dist/
.npm/
npm-debug.log
*.tsbuildinfo
`,
                'dotnet': `# .NET
bin/
obj/
*.user
*.suo
.vs/
`,
                'empty': ''
            };
            return common + (stacks[config.stack] || '');
        }

        function getGitlabCi() {
            return `# GitLab CI/CD Pipeline
# ═══════════════════════════════════════════════════════════════
# Utilisez le Pipeline Generator du DevOps Hub pour configurer
# ce fichier avec les stages et jobs adaptés à votre projet.
# ═══════════════════════════════════════════════════════════════

stages: []

# TODO: Configurer via Pipeline Generator
`;
        }

        function getEditorconfig() {
            return `# EditorConfig - https://editorconfig.org
root = true

[*]
charset = utf-8
indent_style = space
indent_size = 4
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.{yml,yaml}]
indent_size = 2

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
`;
        }

        function getDockerfile() {
            const dockerfiles = {
                'java': `# Multi-stage build for Java
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
`,
                'angular': `# Multi-stage build for Angular
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build --prod

FROM nginx:alpine
COPY --from=builder /app/dist/*/browser /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`,
                'python': `# Multi-stage build for Python
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY src ./src
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0"]
`,
                'node': `# Multi-stage build for Node.js
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/main.js"]
`,
                'dotnet': `# Multi-stage build for .NET
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS builder
WORKDIR /app
COPY *.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o out

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=builder /app/out .
EXPOSE 8080
ENTRYPOINT ["dotnet", "${sessionData.projectName}.dll"]
`,
                'empty': `FROM alpine:latest
WORKDIR /app
CMD ["sh"]
`
            };
            return dockerfiles[config.stack] || dockerfiles['empty'];
        }

        function getPomXml() {
            return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    
    <groupId>com.lcl</groupId>
    <artifactId>${sessionData.projectName}</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <packaging>jar</packaging>
    
    <name>${sessionData.projectName}</name>
    <description>${projectDescription || 'Application LCL'}</description>
    
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
    </parent>
    
    <properties>
        <java.version>21</java.version>
    </properties>
    
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
    
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
`;
        }

        function getPackageJson(type) {
            if (type === 'angular') {
                return JSON.stringify({
                    name: sessionData.projectName,
                    version: "1.0.0",
                    scripts: {
                        start: "ng serve",
                        build: "ng build",
                        test: "ng test"
                    },
                    dependencies: {
                        "@angular/core": "^17.0.0",
                        "@angular/common": "^17.0.0"
                    },
                    devDependencies: {
                        "@angular/cli": "^17.0.0",
                        "typescript": "~5.2.0"
                    }
                }, null, 2);
            } else {
                return JSON.stringify({
                    name: sessionData.projectName,
                    version: "1.0.0",
                    description: projectDescription || "",
                    main: "dist/main.js",
                    scripts: {
                        start: "node dist/main.js",
                        build: "tsc",
                        dev: "ts-node src/main.ts"
                    },
                    dependencies: {
                        express: "^4.18.0"
                    },
                    devDependencies: {
                        typescript: "^5.0.0"
                    }
                }, null, 2);
            }
        }

        function getAngularJson() {
            return JSON.stringify({
                "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
                version: 1,
                projects: {
                    [sessionData.projectName]: {
                        projectType: "application",
                        root: "",
                        sourceRoot: "src"
                    }
                }
            }, null, 2);
        }

        function getPyprojectToml() {
            return `[project]
name = "${sessionData.projectName}"
version = "1.0.0"
description = "${projectDescription || ''}"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.100.0",
    "uvicorn>=0.23.0",
]

[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"
`;
        }

        function getRequirementsTxt() {
            return `fastapi>=0.100.0
uvicorn>=0.23.0
pydantic>=2.0.0
`;
        }

        function getCsproj() {
            return `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
`;
        }

        // ============================================
        // COBOL / MAINFRAME TEMPLATES
        // ============================================

        function getCobolHelloWorld() {
            return `       IDENTIFICATION DIVISION.
       PROGRAM-ID. ${sessionData.projectName.toUpperCase().replace(/-/g, '').substring(0, 8)}.
       AUTHOR. LCL DEVOPS HUB.
      *****************************************************************
      * ${sessionData.projectName}
      * ${projectDescription || 'Programme COBOL généré par DevOps Hub'}
      *****************************************************************
       
       ENVIRONMENT DIVISION.
       
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-MESSAGE    PIC X(50) VALUE 'HELLO FROM DEVOPS HUB'.
       
       PROCEDURE DIVISION.
           DISPLAY WS-MESSAGE
           STOP RUN.
`;
        }

        function getCobolCopybook() {
            return `      *****************************************************************
      * COPYBOOK: ${sessionData.projectName.toUpperCase().substring(0, 8)}
      * Description: Structure de données commune
      *****************************************************************
       01 WS-COMMON-AREA.
          05 WS-RETURN-CODE     PIC S9(4) COMP VALUE 0.
          05 WS-ERROR-MSG       PIC X(80) VALUE SPACES.
          05 WS-TIMESTAMP       PIC X(26) VALUE SPACES.
`;
        }

        function getJclTemplate() {
            const pgmName = sessionData.projectName.toUpperCase().replace(/-/g, '').substring(0, 8);
            return `//${pgmName}J JOB (ACCT),'${sessionData.projectName}',
//             CLASS=A,MSGCLASS=X,NOTIFY=&SYSUID
//*****************************************************************
//* JCL: ${sessionData.projectName}
//* Description: ${projectDescription || 'Job généré par DevOps Hub'}
//*****************************************************************
//STEP01   EXEC PGM=${pgmName}
//STEPLIB  DD DSN=YOUR.LOADLIB,DISP=SHR
//SYSOUT   DD SYSOUT=*
//SYSPRINT DD SYSOUT=*
//SYSIN    DD DUMMY
`;
        }

        function getDbbBuildGroovy() {
            return `// DBB Build Script for ${sessionData.projectName}
// Generated by LCL DevOps Hub
// Documentation: https://www.ibm.com/docs/en/dbb

@groovy.transform.BaseScript com.ibm.dbb.groovy.ScriptLoader baseScript
import com.ibm.dbb.build.*
import com.ibm.dbb.dependency.*
import com.ibm.dbb.repository.*

// Build properties
def properties = BuildProperties.getInstance()
properties.buildPropFiles = ['build.properties']

// Source directories
def srcDirs = [
    'src/cobol',
    'src/copybook'
]

// Compile COBOL programs
def cobolCompile = new CobolCompile()
cobolCompile.command = properties.getFileProperty('cobolCompiler')

println "** Building ${sessionData.projectName} **"

srcDirs.each { dir ->
    def files = new FileNameFinder().getFileNames(dir, '**/*.cbl')
    files.each { file ->
        println "Compiling: \$file"
        // Add your compile logic here
    }
}

println "** Build complete **"
`;
        }

        function getDbbBuildProperties() {
            return `# DBB Build Properties for ${sessionData.projectName}
# Generated by LCL DevOps Hub

# z/OS Configuration
zosHlq=${sessionData.projectName.toUpperCase().replace(/-/g, '').substring(0, 8)}
zosDatasets=\${zosHlq}.LOAD,\${zosHlq}.DBRM,\${zosHlq}.OBJ

# Compiler options
cobolCompiler=IGYCRCTL
cobolOptions=LIB,RENT,APOST,TRUNC(OPT)

# Copybook paths
copybookPaths=src/copybook

# Build output
buildOutputDir=build/outputs
`;
        }

        function getMainframeGitignore() {
            return `# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db

# Build outputs
build/
*.load
*.lst
*.obj
*.dbrm

# DBB
logs/
.dbb/

# Listings
*.listing
*.lis

# Temporary
*.tmp
*.bak
`;
        }

        function getMainframeGitlabCi() {
            return `# GitLab CI/CD Pipeline for Mainframe
# ═══════════════════════════════════════════════════════════════
# Ce pipeline utilise DBB (Dependency Based Build) pour compiler
# les programmes COBOL et les déployer sur z/OS.
# ═══════════════════════════════════════════════════════════════

stages:
  - build
  - test
  - deploy

variables:
  DBB_HOME: /usr/lpp/dbb
  ZOSMF_HOST: your-zosmf-host.lcl.fr
  
# TODO: Configurer via Pipeline Generator ou zOps Platform
# Documentation: https://devops-hub.lcl.internal/zops

build:
  stage: build
  tags:
    - zos-runner
  script:
    - echo "Building with DBB..."
    # groovyz build/build.groovy
  only:
    - main
    - develop

# deploy:
#   stage: deploy
#   script:
#     - echo "Deploying to z/OS..."
#   environment:
#     name: production
`;
        }

        function getMainframeReadme() {
            return `# ${sessionData.projectName}

${projectDescription || 'Projet Mainframe COBOL généré par DevOps Hub.'}

## 🏛️ Structure du projet

\`\`\`
${sessionData.projectName}/
├── src/
│   ├── cobol/          # Programmes COBOL (.cbl)
│   ├── copybook/       # COPY books (.cpy)
│   ├── jcl/            # Jobs JCL
│   └── bms/            # Écrans BMS (CICS)
├── build/
│   ├── build.groovy    # Script DBB
│   └── build.properties
├── config/
│   └── dbb/            # Configuration DBB
└── test/
    └── unit/           # Tests unitaires
\`\`\`

## 🚀 Getting Started

### Prérequis
- IBM Dependency Based Build (DBB)
- Accès z/OS avec RACF approprié
- GitLab Runner configuré pour z/OS

### Clone
\`\`\`bash
git clone ${sessionData.gitlabUrl}.git
cd ${sessionData.projectName}
\`\`\`

### Build local (avec DBB)
\`\`\`bash
groovyz build/build.groovy
\`\`\`

## 🔧 Configuration

### DBB
Modifier \`build/build.properties\` pour adapter:
- HLQ des datasets
- Options de compilation
- Chemins des copybooks

### CI/CD
Voir le [zOps Platform](zops-platform.html) pour:
- Configuration du runner z/OS
- Déploiement automatisé
- Feature flags COBOL

## 📚 Documentation
- [IBM DBB Documentation](https://www.ibm.com/docs/en/dbb)
- [LCL DevOps Hub - zOps](zops-platform.html)

---
*Généré par LCL DevOps Hub - zOps Platform*
`;
        }

        // ============================================
        // GITLAB API HELPER
        // ============================================
        
        async function gitlabAPI(endpoint, method = 'GET', body = null) {
            const options = {
                method,
                headers: { 
                    'PRIVATE-TOKEN': sessionData.gitlabToken, 
                    'Content-Type': 'application/json' 
                }
            };
            if (body) options.body = JSON.stringify(body);
            
            let response = await fetch(`${sessionData.gitlabBaseUrl}/api/v4${endpoint}`, options);
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
                await new Promise(r => setTimeout(r, retryAfter * 1000));
                response = await fetch(`${sessionData.gitlabBaseUrl}/api/v4${endpoint}`, options);
            }
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`API Error ${response.status}: ${error}`);
            }
            
            return response.status === 204 ? null : response.json();
        }

        function setLoadingStep(step, state) {
            const stepEl = document.querySelector(`.loading-step[data-loading="${step}"]`);
            stepEl.classList.remove('active', 'done', 'error');
            stepEl.classList.add(state);
            stepEl.querySelector('.step-icon').textContent = 
                state === 'active' ? '⏳' : 
                state === 'done' ? '✅' : '❌';
        }

        // ============================================
        // INITIALIZE PROJECT (API calls)
        // ============================================
        async function initializeProject() {
            // ⛔ Re-vérification de dernière seconde avant TOUT write (l'état a pu changer).
            try {
                const project = await gitlabAPI(`/projects/${sessionData.projectId}`);
                const guard = await checkRepoScaffoldable(project);
                if (!guard.ok) {
                    showBlocked(guard.reason, guard.detail);
                    return; // on n'écrit rien
                }
            } catch (e) {
                alert("Vérification de sécurité impossible avant l'initialisation.\n\n" + e.message + "\n\nAnnulé pour ne rien risquer.");
                return;
            }

            loadingOverlay.classList.add('show');
            const createdFiles = [];
            const createdBranches = ['main'];
            const appliedSettings = [];
            const initBranch = 'init/devops-hub-setup';

            try {
                // ─────────────────────────────────────────
                // STEP 1: Create files on init branch
                // ─────────────────────────────────────────
                setLoadingStep('files', 'active');
                
                const actions = [];
                
                // README.md - update existing
                actions.push({ action: 'update', file_path: 'README.md', content: getReadmeContent() });
                createdFiles.push('README.md');
                
                // .gitignore
                actions.push({ action: 'create', file_path: '.gitignore', content: getGitignore() });
                createdFiles.push('.gitignore');
                
                // .gitlab-ci.yml
                if (config.options.gitlabCi) {
                    actions.push({ action: 'create', file_path: '.gitlab-ci.yml', content: getGitlabCi() });
                    createdFiles.push('.gitlab-ci.yml');
                }
                
                // .editorconfig
                if (config.options.editorconfig) {
                    actions.push({ action: 'create', file_path: '.editorconfig', content: getEditorconfig() });
                    createdFiles.push('.editorconfig');
                }
                
                // Dockerfile
                if (config.options.dockerfile) {
                    actions.push({ action: 'create', file_path: 'Dockerfile', content: getDockerfile() });
                    createdFiles.push('Dockerfile');
                }
                
                // Stack-specific files
                if (config.stack === 'java') {
                    actions.push({ action: 'create', file_path: 'pom.xml', content: getPomXml() });
                    actions.push({ action: 'create', file_path: 'src/main/java/.gitkeep', content: '' });
                    actions.push({ action: 'create', file_path: 'src/test/java/.gitkeep', content: '' });
                    createdFiles.push('pom.xml', 'src/');
                } else if (config.stack === 'angular') {
                    actions.push({ action: 'create', file_path: 'package.json', content: getPackageJson('angular') });
                    actions.push({ action: 'create', file_path: 'angular.json', content: getAngularJson() });
                    actions.push({ action: 'create', file_path: 'src/.gitkeep', content: '' });
                    createdFiles.push('package.json', 'angular.json', 'src/');
                } else if (config.stack === 'python') {
                    actions.push({ action: 'create', file_path: 'pyproject.toml', content: getPyprojectToml() });
                    actions.push({ action: 'create', file_path: 'requirements.txt', content: getRequirementsTxt() });
                    actions.push({ action: 'create', file_path: 'src/__init__.py', content: '' });
                    actions.push({ action: 'create', file_path: 'src/main.py', content: '# Entry point\n' });
                    createdFiles.push('pyproject.toml', 'requirements.txt', 'src/');
                } else if (config.stack === 'node') {
                    actions.push({ action: 'create', file_path: 'package.json', content: getPackageJson('node') });
                    actions.push({ action: 'create', file_path: 'src/.gitkeep', content: '' });
                    createdFiles.push('package.json', 'src/');
                } else if (config.stack === 'dotnet') {
                    actions.push({ action: 'create', file_path: `${sessionData.projectName}.csproj`, content: getCsproj() });
                    actions.push({ action: 'create', file_path: 'src/.gitkeep', content: '' });
                    createdFiles.push(`${sessionData.projectName}.csproj`, 'src/');
                } else if (config.stack === 'cobol') {
                    // COBOL / Mainframe structure
                    // Override README with mainframe-specific
                    actions[0] = { action: 'update', file_path: 'README.md', content: getMainframeReadme() };
                    // Override .gitignore
                    actions[1] = { action: 'create', file_path: '.gitignore', content: getMainframeGitignore() };
                    // Override .gitlab-ci.yml if enabled
                    if (config.options.gitlabCi) {
                        const ciIndex = actions.findIndex(a => a.file_path === '.gitlab-ci.yml');
                        if (ciIndex !== -1) {
                            actions[ciIndex] = { action: 'create', file_path: '.gitlab-ci.yml', content: getMainframeGitlabCi() };
                        }
                    }
                    
                    // Source structure
                    const pgmName = sessionData.projectName.toUpperCase().replace(/-/g, '').substring(0, 8);
                    actions.push({ action: 'create', file_path: `src/cobol/${pgmName}.cbl`, content: getCobolHelloWorld() });
                    actions.push({ action: 'create', file_path: 'src/copybook/COMMON.cpy', content: getCobolCopybook() });
                    actions.push({ action: 'create', file_path: `src/jcl/${pgmName}.jcl`, content: getJclTemplate() });
                    actions.push({ action: 'create', file_path: 'src/bms/.gitkeep', content: '' });
                    
                    // DBB Build
                    actions.push({ action: 'create', file_path: 'build/build.groovy', content: getDbbBuildGroovy() });
                    actions.push({ action: 'create', file_path: 'build/build.properties', content: getDbbBuildProperties() });
                    
                    // Config & Test
                    actions.push({ action: 'create', file_path: 'config/dbb/.gitkeep', content: '' });
                    actions.push({ action: 'create', file_path: 'test/unit/.gitkeep', content: '' });
                    
                    createdFiles.push('src/cobol/', 'src/copybook/', 'src/jcl/', 'build/');
                }
                
                // Kustomize structure (vide)
                if (config.options.kustomize) {
                    actions.push({ action: 'create', file_path: 'kustomize/base/.gitkeep', content: '' });
                    actions.push({ action: 'create', file_path: 'kustomize/overlays/dev/.gitkeep', content: '' });
                    actions.push({ action: 'create', file_path: 'kustomize/overlays/recette/.gitkeep', content: '' });
                    actions.push({ action: 'create', file_path: 'kustomize/overlays/prod/.gitkeep', content: '' });
                    createdFiles.push('kustomize/');
                }
                
                // Create init branch first
                await gitlabAPI(`/projects/${sessionData.projectId}/repository/branches`, 'POST', {
                    branch: initBranch,
                    ref: 'main'
                });
                console.log('✅ Branch created:', initBranch);
                
                // Commit all files to init branch
                await gitlabAPI(`/projects/${sessionData.projectId}/repository/commits`, 'POST', {
                    branch: initBranch,
                    commit_message: '🚀 Initial project setup by DevOps Hub',
                    actions: actions
                });
                console.log('✅ Files committed');
                
                // Create MR (leave it open for review/merge)
                const mr = await gitlabAPI(`/projects/${sessionData.projectId}/merge_requests`, 'POST', {
                    source_branch: initBranch,
                    target_branch: 'main',
                    title: '🚀 Initial project setup by DevOps Hub',
                    description: `## 🚀 Initialisation du projet par DevOps Hub

### Configuration
- **Workflow**: ${config.workflow}
- **Stack**: ${config.stack}

### Fichiers créés
${createdFiles.map(f => '- `' + f + '`').join('\n')}

---
*Généré automatiquement par [LCL DevOps Hub](${HUB_URL})*`,
                    remove_source_branch: true
                });
                console.log('✅ MR created:', mr.iid);
                
                // Store MR info for success screen
                window.createdMR = mr;
                
                setLoadingStep('files', 'done');

                // ─────────────────────────────────────────
                // STEP 2: Create branches
                // ─────────────────────────────────────────
                setLoadingStep('branches', 'active');
                
                // Create branches from init branch (which has all files)
                // After MR merge, these will be based on the correct content
                if (config.workflow === 'gitflow') {
                    await gitlabAPI(`/projects/${sessionData.projectId}/repository/branches`, 'POST', {
                        branch: 'develop',
                        ref: initBranch
                    });
                    createdBranches.push('develop');
                    
                    await gitlabAPI(`/projects/${sessionData.projectId}/repository/branches`, 'POST', {
                        branch: 'feature/example',
                        ref: 'develop'
                    });
                    createdBranches.push('feature/example');
                } else if (config.workflow === 'feature-branching') {
                    await gitlabAPI(`/projects/${sessionData.projectId}/repository/branches`, 'POST', {
                        branch: 'feature/example',
                        ref: initBranch
                    });
                    createdBranches.push('feature/example');
                }
                
                setLoadingStep('branches', 'done');

                // ─────────────────────────────────────────
                // STEP 3: Protect branches
                // ─────────────────────────────────────────
                setLoadingStep('protect', 'active');
                
                if (config.options.protectMain) {
                    try {
                        await gitlabAPI(`/projects/${sessionData.projectId}/protected_branches`, 'POST', {
                            name: 'main',
                            push_access_level: 0,
                            merge_access_level: 40,
                            allow_force_push: false
                        });
                        appliedSettings.push('main protégée');
                    } catch (e) {
                        console.warn('Branch main already protected:', e.message);
                        appliedSettings.push('main protégée');
                    }
                }
                
                if (config.workflow === 'gitflow' && config.options.protectDevelop) {
                    try {
                        await gitlabAPI(`/projects/${sessionData.projectId}/protected_branches`, 'POST', {
                            name: 'develop',
                            push_access_level: 0,
                            merge_access_level: 40,
                            allow_force_push: false
                        });
                        appliedSettings.push('develop protégée');
                    } catch (e) {
                        console.warn('Branch develop protection error:', e.message);
                    }
                }
                
                setLoadingStep('protect', 'done');

                // ─────────────────────────────────────────
                // STEP 4: Project settings (merge train)
                // ─────────────────────────────────────────
                setLoadingStep('settings', 'active');
                
                if (config.workflow === 'trunk') {
                    try {
                        await gitlabAPI(`/projects/${sessionData.projectId}`, 'PUT', {
                            merge_pipelines_enabled: true,
                            merge_trains_enabled: true
                        });
                        appliedSettings.push('Merge train activé');
                    } catch (e) {
                        console.warn('Merge train activation error:', e.message);
                    }
                }
                
                setLoadingStep('settings', 'done');

                // ─────────────────────────────────────────
                // SUCCESS
                // ─────────────────────────────────────────
                await new Promise(r => setTimeout(r, 500));
                loadingOverlay.classList.remove('show');
                showSuccess(createdFiles, createdBranches, appliedSettings);

            } catch (error) {
                console.error('Initialization error:', error);
                setLoadingStep('files', 'error');
                loadingOverlay.classList.remove('show');
                alert('Erreur lors de l\'initialisation:\n\n' + error.message);
            }
        }

        function showSuccess(files, branches, settings) {
            formCard.style.display = 'none';
            successCard.classList.add('show');

            // MR link
            const mrUrl = `${sessionData.gitlabUrl}/-/merge_requests/${window.createdMR.iid}`;
            document.getElementById('mrLink').href = mrUrl;
            document.getElementById('mrLinkStep').href = mrUrl;
            document.getElementById('cloneCommand').textContent = `git clone ${sessionData.gitlabUrl}.git`;

            // Files summary
            document.getElementById('summaryFiles').innerHTML = files.map(f => `
                <div class="summary-item"><span class="check">✓</span> ${f}</div>
            `).join('');

            // Branches summary
            document.getElementById('summaryBranches').innerHTML = branches.map(b => `
                <div class="summary-item"><span class="check">✓</span> ${b}</div>
            `).join('');

            // Settings summary
            document.getElementById('summarySettings').innerHTML = settings.length > 0 
                ? settings.map(s => `<div class="summary-item"><span class="check">✓</span> ${s}</div>`).join('')
                : '<div class="summary-item" style="opacity:0.5">—</div>';
        }

        // ============================================
        // EVENT LISTENERS
        // ============================================
        nextBtn.addEventListener('click', nextStep);
        prevBtn.addEventListener('click', prevStep);

        // ============================================
        // INIT
        // ============================================
        boot();
