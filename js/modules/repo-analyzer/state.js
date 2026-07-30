/* repo-analyzer · state.js — état & config partagés (chargé en 1er). */

        // CONFIGURATION
        const THRESHOLDS = {
            gitflow: { feature: { warning: 7, critical: 14 }, release: { warning: 3, critical: 7 } },
            trunk: { branch: { warning: 1, critical: 3 } },
            featureBranching: { feature: { warning: 5, critical: 10 } },
            busFactor: { warning: 70, critical: 90 }
        };

        let GITLAB_URL = null; let projectId = null; let token = null; let flowType = null;
        let analysisData = { branches: [], contributors: [], commits: [], mergeRequests: [], project: null, protectedBranches: [], repoTree: [], labels: [], pipelines: [], failedJobs: [], deployments: [] };
        let quickWins = [];

        // ── AUTH + REPO — modèle plateforme (aligné DevOps Hub) ──
        const STORAGE_KEY = 'devops_hub_workspaces';
        const HUB_URL = 'hub.html'; // le mockup V2 est le hub ; seul endroit à changer


        let currentFilter = 'all';
