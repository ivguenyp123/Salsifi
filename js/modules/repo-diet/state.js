/* repo-diet · state.js — état & config partagés (chargé en 1er). */

        // ══════════════════════════════════════════════════════════════════
        //  CONFIGURATION
        // ══════════════════════════════════════════════════════════════════


        let GITLAB_URL = null;

        let projectId = null;

        let token = null;


        const SUSPECT_PATTERNS = {
            'binaries': { icon: '📦', name: 'Binaires Java', extensions: ['.jar', '.war', '.ear', '.class'], recommendation: 'Utiliser Nexus/Artifactory' },
            'dotnet': { icon: '🔷', name: 'Binaires .NET', extensions: ['.dll', '.exe', '.pdb'], recommendation: 'Utiliser NuGet' },
            'archives': { icon: '🗜️', name: 'Archives', extensions: ['.zip', '.tar', '.gz', '.rar', '.7z'], recommendation: 'Stockage externe' },
            'media': { icon: '🎬', name: 'Médias', extensions: ['.mp4', '.avi', '.mp3', '.wav', '.psd'], recommendation: 'Utiliser Git LFS' },
            'logs': { icon: '📜', name: 'Logs', extensions: ['.log'], recommendation: 'Ajouter au .gitignore' },
            'data': { icon: '🗄️', name: 'Données', extensions: ['.sql', '.dump', '.bak', '.csv'], recommendation: 'Ne pas versionner' },
            'deps_node': { icon: '📗', name: 'node_modules', folders: ['node_modules'], recommendation: 'npm ci' },
            'deps_python': { icon: '🐍', name: 'Python env', folders: ['venv', '.venv', '__pycache__'], recommendation: '.gitignore' },
            'build': { icon: '🔨', name: 'Build', folders: ['target', 'build', 'dist', 'out', 'bin', 'obj'], recommendation: '.gitignore' },
            'ide': { icon: '💻', name: 'IDE', folders: ['.idea', '.vscode', '.vs'], recommendation: '.gitignore' },
            'secrets': { icon: '🔐', name: 'Secrets!', extensions: ['.pem', '.key', '.p12', '.keystore'], recommendation: '⚠️ SUPPRIMER!' }
        };

        // Concurrence pour les fetches de taille par fichier. 8 simultanés = bon
        // compromis sur GitLab self-hosted standard LCL. Aligné sur l'écosystème.

        const FILE_SIZE_CONCURRENCY = 8;
        // Cap sur le nb de fetches de taille pour ne pas exploser sur des repos
        // monstrueux. Sur 200+ fichiers suspects, on prend les 200 premiers
        // (déjà très représentatifs).

        const MAX_SIZE_FETCHES = 200;


        let allFiles = [];

        let analysis = { totalSize: 0, totalFiles: 0, patterns: {}, distribution: {}, suspects: [] };

        let generatedGitignore = '';

        let allSelected = false;

        // ══════════════════════════════════════════════════════════════════
        //  HELPERS — fetchGitLab (retry 429), runWithConcurrency, escapeHtml.
        //  Alignés sur l'écosystème (insights, gaming, feature-flag-manager,
        //  mr-reviewer, auto-rebase, conflict-radar, bus-factor, branch-cleaner).
        // ══════════════════════════════════════════════════════════════════

