/* project-scaffolder · data.js — I/O (auth, fetch). */

        function loadAuth() {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            try {
                const data = JSON.parse(raw);
                if (!data.gitlabUrl || !data.token) return null;
                return data;
            } catch { return null; }
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

