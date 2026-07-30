/* repo-diet · compute.js — logique pure (calculs, helpers). */

        function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }

        // Encodage UTF-8 → base64 moderne (remplacement du legacy
        // `btoa(unescape(encodeURIComponent(...)))` qui utilise `unescape`,
        // déprécié).

        function analyzeFiles() {
            const codeExts = ['.js', '.ts', '.py', '.java', '.cs', '.go', '.rb', '.php', '.c', '.cpp', '.vue', '.jsx', '.tsx'];
            const configExts = ['.json', '.yml', '.yaml', '.xml', '.toml', '.ini', '.properties'];
            const docExts = ['.md', '.txt', '.rst', '.pdf'];

            for (const file of allFiles) {
                if (file.type !== 'blob') continue;
                analysis.totalFiles++;

                const ext = getExt(file.name);
                const pathLower = file.path.toLowerCase();

                if (codeExts.includes(ext)) analysis.distribution.code++;
                else if (configExts.includes(ext)) analysis.distribution.config++;
                else if (docExts.includes(ext)) analysis.distribution.docs++;
                else if (['.png', '.jpg', '.gif', '.svg', '.mp4'].includes(ext)) analysis.distribution.media++;
                else if (['.jar', '.dll', '.exe', '.zip'].includes(ext)) analysis.distribution.binary++;
                else analysis.distribution.other++;

                const segments = pathLower.split('/');
                for (const [key, pattern] of Object.entries(SUSPECT_PATTERNS)) {
                    let isSuspect = false;
                    if (pattern.extensions?.includes(ext)) isSuspect = true;
                    // Match par SEGMENT de chemin, pas par sous-chaîne : sinon `bin`
                    // matchait `combine.js`, `out` matchait `about.md`, etc.
                    if (pattern.folders?.some(f => segments.includes(f.toLowerCase()))) isSuspect = true;

                    if (isSuspect) {
                        if (!analysis.patterns[key]) analysis.patterns[key] = { ...pattern, files: [] };
                        analysis.patterns[key].files.push(file);
                        analysis.suspects.push(file);
                        // Un fichier n'est classé QUE dans le premier pattern qui matche —
                        // sinon il est compté plusieurs fois dans `suspects` (total gonflé).
                        break;
                    }
                }
            }

            for (const file of allFiles) {
                if (file.type !== 'tree') continue;
                for (const [key, pattern] of Object.entries(SUSPECT_PATTERNS)) {
                    if (pattern.folders?.some(f => file.name.toLowerCase() === f.toLowerCase())) {
                        if (!analysis.patterns[key]) analysis.patterns[key] = { ...pattern, files: [] };
                        analysis.patterns[key].hasFolder = true;
                        analysis.patterns[key].folderPath = file.path;
                    }
                }
            }
        }


        function formatSize(bytes) {
            if (!bytes) return '0 B';
            const k = 1024, sizes = ['B', 'Ko', 'Mo', 'Go'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }

