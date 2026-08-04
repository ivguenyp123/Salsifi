/* secret-scanner-test · compute.js — logique pure (patterns, scoring, parsing, gabarits) (chargé en 3e). */

'use strict';

  function nextLink(h) {
    if (!h) return null;
    for (const part of h.split(',')) { const m = part.match(/<([^>]+)>\s*;\s*rel="next"/); if (m) return m[1]; }
    return null;
  }

  // ── Énumération de tous les repos accessibles — pagination KEYSET (fiable au-delà de qq milliers) ──
  // Filtre serveur : archivés exclus. Filtre client : repos vides (default_branch null) ignorés.
  const SECRET_PATTERNS = [
    { name: 'AWS Access Key',            re: /\bAKIA[0-9A-Z]{16}\b/g },
    { name: 'GitLab PAT',                re: /\bglpat-[a-zA-Z0-9_\-]{20}\b/g },
    { name: 'GitHub PAT (classic)',      re: /\bghp_[a-zA-Z0-9]{36}\b/g },
    { name: 'GitHub PAT (fine-grained)', re: /\bgithub_pat_[a-zA-Z0-9_]{82}\b/g },
    { name: 'Slack Token',               re: /\bxox[baprs]-[0-9a-zA-Z\-]{10,}\b/g },
    { name: 'Stripe Secret Key',         re: /\bsk_live_[0-9a-zA-Z]{24}\b/g },
    { name: 'Stripe Restricted Key',     re: /\brk_live_[0-9a-zA-Z]{24}\b/g },
    { name: 'Google API Key',            re: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
    { name: 'GCP OAuth Client Secret',   re: /\bGOCSPX-[a-zA-Z0-9_\-]{28}\b/g },
    { name: 'GCP Service Account ID',    re: /"private_key_id"\s*:\s*"[a-f0-9]{40}"/g },
    { name: 'GitLab Runner/Deploy/CI Token', re: /\bgl(?:rt|dt|ft|ptt|cbt|soat|agent|imt)-[0-9a-zA-Z_\-]{20,}\b/g },
    { name: 'GitHub Token (oauth/server/refresh)', re: /\bgh[opsu]_[a-zA-Z0-9]{36}\b/g },
    { name: 'npm Token',                 re: /\bnpm_[a-zA-Z0-9]{36}\b/g },
    { name: 'PyPI Token',                re: /\bpypi-AgEIcHlwaS[a-zA-Z0-9_\-]{50,}\b/g },
    { name: 'OpenAI Key',                re: /\bsk-(?:proj|svcacct|admin)-[a-zA-Z0-9_\-]{20,}\b|\bsk-[a-zA-Z0-9]{48}\b/g },
    { name: 'Anthropic Key',             re: /\bsk-ant-[a-zA-Z0-9_\-]{20,}\b/g },
    { name: 'HuggingFace Token',         re: /\bhf_[a-zA-Z0-9]{34,}\b/g },
    { name: 'HashiCorp Vault Token',     re: /\bhvs\.[a-zA-Z0-9_\-]{20,}\b/g },
    { name: 'DigitalOcean Token',        re: /\bdo[oprt]_v1_[a-f0-9]{64}\b/g },
    { name: 'SendGrid API Key',          re: /\bSG\.[a-zA-Z0-9_\-]{22}\.[a-zA-Z0-9_\-]{43}\b/g },
    { name: 'Private Key (PEM)',         re: /-----BEGIN (?:RSA |OPENSSH |DSA |EC )?PRIVATE KEY-----/g },
    { name: 'JWT Token',                 re: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g },
    { name: 'Basic Auth in URL',         re: /https?:\/\/[a-zA-Z0-9._\-]+:[^@\s\/]{6,}@/g },
    { name: 'DB Connection String',      re: /\b(?:mongodb|postgres|postgresql|mysql|redis|amqp|amqps)(?:\+srv)?:\/\/[^:\/\s]+:[^@\s\/]+@/gi },
  ];
  const PLACEHOLDER_RE = /^(?:your[-_]?|x{3,}|<[^>]+>|\$\{[^}]+\}|\{\{[^}]+\}\}|placeholder|change[-_]?me|redacted|todo|fake|dummy|example|sample|test[-_]?only)/i;

  function isSuspectFile(path) {
    const name = path.split('/').pop().toLowerCase();
    const lowerPath = path.toLowerCase();
    if (/\.(example|template|sample|dist|md|png|jpe?g|gif|ico|svg|woff2?|ttf|eot|webp|mp[34]|mov|avi|zip|tar|gz|rar|7z|pdf|jar|war|class)$/i.test(name)) return false;
    if (/(?:^|\/)(?:node_modules|vendor|dist|build|target|coverage|\.git|out|\.next|\.nuxt|\.cache|__pycache__|\.venv|venv)(?:\/|$)/.test(lowerPath)) return false;
    const risky = [
      /^\.env(\..+)?$/,
      /^(config|application|appsettings|settings|secrets?|credentials?)(\..+)?\.(json|ya?ml|toml|properties|ini|xml|env)$/,
      /^application(-.+)?\.(properties|ya?ml)$/,
      /^appsettings(\..+)?\.json$/,
      /^(local_settings|secret_settings)\.py$/,
      /^service[-_]account.*\.json$/,
      /^(credentials|firebase|gcp|aws)(\..+)?\.json$/,
      /\.(pem|key|p12|pfx|jks|asc)$/,
      /^id_(rsa|dsa|ecdsa|ed25519)$/,
      /^\.(npmrc|pypirc|dockercfg|htpasswd|netrc)$/,
      /^config\.json$/,
      /^terraform\.tfvars(\..+)?$/,
      /\.tfstate(\.backup)?$/,
      /^web\.config$/,
      /^\.gitlab-ci(\..+)?\.ya?ml$/,
      /^docker-compose(\..+)?\.ya?ml$/,
    ];
    return risky.some(re => re.test(name));
  }

  const COMMITS_PER_REPO_CAP = 8000; // garde-fou par repo (gros monorepo)

  // ── Persistance incrémentale (reprise après coupure) ──
  const HIST_KEY = 'secrets_hist_v1';
  function loadHistState() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY)) || {}; } catch { return {}; }
  }
  let _histSaveWarned = false;
  function saveHistState(state) {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(state)); }
    catch (e) {
      if (!_histSaveWarned) { _histSaveWarned = true; showToast('Stockage local saturé — reprise partielle possible.', 'info'); }
    }
  }
  function resetHistory() {
    try { localStorage.removeItem(HIST_KEY); } catch {}
    showToast('Historique réinitialisé — le prochain scan repart de zéro.', 'success');
  }

  function supplyEco(path) {
    const lower = path.toLowerCase();
    if (/(?:^|\/)(?:node_modules|vendor|dist|build|target|\.git|__pycache__|venv|\.venv|coverage)(?:\/|$)/.test(lower)) return null;
    const name = path.split('/').pop();
    if (name === 'package.json') return 'npm';
    if (name === '.npmrc') return 'npmrc';
    if (/^\.gitlab-ci(\..+)?\.ya?ml$/i.test(name)) return 'ci';
    if (name === 'pom.xml') return 'maven';
    if (name === 'build.gradle' || name === 'build.gradle.kts') return 'gradle';
    if (/^requirements.*\.txt$/i.test(name)) return 'pip';
    if (name === 'Dockerfile' || /\.dockerfile$/i.test(name) || /^Dockerfile\./i.test(name)) return 'docker';
    return null;
  }
  const _lineOf = (raw, needle) => { const i = raw.indexOf(needle); return i < 0 ? null : raw.slice(0, i).split('\n').length; };
  const _trunc = s => { s = String(s).trim(); return s.length > 90 ? s.slice(0, 90) + '…' : s; };
  const _pipe = /\b(curl|wget)\b[^\n|]*\|\s*(sh|bash)\b/;

  function checkSupply(eco, content, file, out) {
    const push = (severity, tag, type, line, preview) => out.push({ kind: 'supply', severity, tag, type, file, line, preview: _trunc(preview) });
    if (eco === 'npm') {
      let pkg; try { pkg = JSON.parse(content); } catch { return; }
      for (const h of ['preinstall', 'install', 'postinstall']) {
        if (pkg.scripts && pkg.scripts[h]) push('red', 'npm', `Script ${h}`, _lineOf(content, `"${h}"`), pkg.scripts[h]);
      }
      const exact = /^\d+\.\d+\.\d+([-+].+)?$/;
      for (const dk of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        const deps = pkg[dk]; if (!deps || typeof deps !== 'object') continue;
        for (const [n, v] of Object.entries(deps)) {
          const val = String(v).trim();
          if (exact.test(val)) continue;
          const sev = (val === 'latest' || val === '*' || /^(git\+|https?:\/\/|github:|file:)/i.test(val)) ? 'red' : 'orange';
          push(sev, 'npm', 'Dépendance non figée', _lineOf(content, `"${n}"`), `${n}: ${val}`);
        }
      }
    } else if (eco === 'npmrc') {
      content.split('\n').forEach((ln, i) => {
        const m = ln.match(/registry\s*=\s*(\S+)/i); if (!m) return;
        const url = m[1];
        if (/^http:\/\//i.test(url)) push('red', 'npm', 'Registry HTTP (non chiffré)', i + 1, ln);
        else if (/^https?:/i.test(url) && !/registry\.npmjs\.org/i.test(url)) push('orange', 'npm', 'Registry npm tiers', i + 1, ln);
      });
    } else if (eco === 'ci') {
      content.split('\n').forEach((ln, i) => {
        const im = ln.match(/^\s*image:\s*["']?([^\s"'{]+)/);
        if (im) { const img = im[1]; if (/:latest$/i.test(img) || !/:/.test(img)) push('orange', 'ci', 'Image CI non pinnée', i + 1, img); }
        if (_pipe.test(ln)) push('red', 'ci', 'Exécution distante (pipe shell)', i + 1, ln);
        if (/(remote:|include:).*https?:\/\//.test(ln)) push('orange', 'ci', 'include CI distant', i + 1, ln);
      });
    } else if (eco === 'maven') {
      content.split('\n').forEach((ln, i) => {
        const m = ln.match(/<version>\s*([^<]+?)\s*<\/version>/i);
        if (m) { const v = m[1]; if (!v.includes('${') && (/[\[\]\(\)]/.test(v) || /\b(LATEST|RELEASE)\b/.test(v))) push('orange', 'maven', 'Version Maven dynamique', i + 1, v); }
      });
    } else if (eco === 'gradle') {
      content.split('\n').forEach((ln, i) => {
        if (/['"][\w.\-]+:[\w.\-]+:[^'"]*(\+|latest\.)[^'"]*['"]/i.test(ln)) push('orange', 'gradle', 'Version Gradle dynamique', i + 1, ln);
      });
    } else if (eco === 'pip') {
      content.split('\n').forEach((ln, i) => {
        const t = ln.trim();
        if (!t || t.startsWith('#') || t.startsWith('-') || /^https?:/i.test(t) || t.startsWith('git+')) return;
        if (/^[A-Za-z0-9._\-\[\]]+/.test(t) && !/[=<>~!]=/.test(t)) push('orange', 'pip', 'Dépendance Python non figée', i + 1, t);
      });
    } else if (eco === 'docker') {
      content.split('\n').forEach((ln, i) => {
        const f = ln.match(/^\s*FROM\s+(\S+)/i);
        if (f) { const img = f[1]; if (!/@sha256:/.test(img) && (/:latest$/i.test(img) || !/:/.test(img))) push('orange', 'docker', 'Image Docker non pinnée', i + 1, img); }
        if (/^\s*ADD\s+https?:\/\//i.test(ln)) push('orange', 'docker', 'ADD distant (Dockerfile)', i + 1, ln);
        if (_pipe.test(ln)) push('red', 'docker', 'Exécution distante (pipe shell)', i + 1, ln);
      });
    }
  }

  function fmtDur(s) {
    s = Math.round(s); if (s < 60) return s + 's';
    const m = Math.floor(s / 60), r = s % 60; if (m < 60) return `${m}m${r ? r + 's' : ''}`;
    const h = Math.floor(m / 60); return `${h}h${m % 60}m`;
  }
  function severityForType(t) {
    // Rouge = exécution de code / secret ; orange = version non figée.
    const red = ['Basic Auth in URL', 'GitLab PAT', 'GitHub PAT (classic)', 'GitHub PAT (fine-grained)',
      'AWS Access Key', 'Slack Token', 'Stripe Secret Key', 'Stripe Restricted Key', 'Google API Key',
      'SendGrid API Key', 'Private Key (PEM)', 'JWT Token', 'DB Connection String',
      'Script preinstall', 'Script install', 'Script postinstall',
      'Exécution distante (pipe shell)', 'Registry HTTP (non chiffré)'];
    return red.includes(t) ? 'red' : 'orange';
  }

  function parseMavenRanges(content) {
    const issues = []; let m;
    const rangeRe = /<version>\s*([\[\(][^<]+[\]\)])\s*<\/version>/g;
    while ((m = rangeRe.exec(content)) !== null) issues.push({ type: 'range', value: m[1] });
    const dynRe = /<version>\s*(LATEST|RELEASE|.*-SNAPSHOT)\s*<\/version>/g;
    while ((m = dynRe.exec(content)) !== null) issues.push({ type: 'dynamic', value: m[1] });
    return issues;
  }

  // Scan CIS d'UN repo. Renvoie { score, status, checks[], unverifiable }.
  // checks[] : { id, cis, label, state: 'ok'|'ko'|'na'|'unverif', detail, fixable }
  function buildReportMarkdown(repo, res) {
    const isSupply = res.findings.some(f => f.kind === 'supply');
    const isHist = res.findings.some(f => f.commit);
    const noun = isSupply ? 'alertes supply-chain' : 'secrets';
    const date = new Date().toLocaleString('fr-FR');

    let md = `# 🔑 Rapport de scan sécurité — ${noun}\n\n`;
    md += `> Généré automatiquement par **DevOps Hub · Secrets Scanner**.\n`;
    md += `> Cette MR est une **proposition** : libre à vous de la fermer. Rien n'est mergé automatiquement.\n\n`;
    md += `- **Repo** : \`${repo.path}\`\n`;
    md += `- **Date** : ${date}\n`;
    md += `- **Mode** : ${isSupply ? 'Supply-chain' : (isHist ? 'Secrets (historique)' : 'Secrets (surface)')}\n`;
    md += `- **${isSupply ? 'Alertes' : 'Secrets'} détectés** : ${res.findings.length}\n\n`;
    if (!isSupply) md += `> ⚠️ Valeurs **censurées** (préfixe + \`***\`). Aucune valeur complète n'est exposée dans ce fichier.\n\n`;

    md += `## Détail\n\n`;
    md += `| Fichier | Ligne | ${isHist ? 'Commit | ' : ''}Type | Catégorie | Aperçu |\n`;
    md += `|---|---|${isHist ? '---|' : ''}---|---|---|\n`;
    for (const f of res.findings) {
      const cat = f.tag || ('CIS ' + f.cis);
      md += `| \`${f.file}\` | ${f.line || ''} | ${isHist ? (f.commit || '') + ' | ' : ''}${f.type} | ${cat} | \`${f.preview}\` |\n`;
    }

    md += `\n## Que faire ?\n\n`;
    if (isSupply) {
      md += `- Épingler les versions (exactes ou par \`@sha256\`).\n`;
      md += `- Retirer / auditer les hooks d'install non vérifiés.\n`;
      md += `- Pinner les images CI/Docker (tag figé ou digest).\n`;
      md += `- Bannir les \`curl … | bash\`.\n`;
    } else {
      md += `1. **Révoquer** chaque secret côté service (considérez-le compromis).\n`;
      md += `2. **Retirer** la valeur du fichier, la remplacer par une variable CI/CD protégée.\n`;
      md += `3. **Purger l'historique** Git si le secret y a été commité (\`git filter-repo\`).\n`;
    }
    md += `\n---\n_Refs CIS GitLab : 1.5.1 (code), 2.3.8 (pipeline), 5.1.3 (déploiement). Généré par DevOps Hub._\n`;
    return md;
  }

  // Pourquoi c'est dangereux — par type de secret/finding. Concret, pas générique.
  // Clé = sous-chaîne cherchée dans finding.type (insensible à la casse).
  const RISK = [
    ['AWS Access Key', 'Accès direct à l\'infra AWS (S3, EC2, IAM…). Une clé valide = prise de contrôle du compte cloud et factures potentiellement énormes.'],
    ['Anthropic', 'Clé API facturée à l\'usage. Exposée = consommation frauduleuse à tes frais et quota épuisé.'],
    ['OpenAI', 'Clé API facturée à l\'usage. Exposée = consommation frauduleuse à tes frais et quota épuisé.'],
    ['HuggingFace', 'Accès aux modèles et repos privés, et écriture possible selon le scope du token.'],
    ['GitLab PAT', 'Jeton personnel : accès à tous tes projets GitLab avec tes droits. Lecture/écriture de code, CI, variables protégées.'],
    ['GitLab Runner', 'Token CI/CD : permet d\'enregistrer un runner ou de récupérer des secrets de pipeline. Pivot vers la chaîne de build.'],
    ['GitHub PAT', 'Jeton personnel GitHub : accès aux repos avec tes droits, push de code, lecture de secrets d\'actions.'],
    ['GitHub Token', 'Jeton OAuth/serveur GitHub : accès programmatique aux repos et à l\'API avec les droits associés.'],
    ['Stripe Secret', 'Clé secrète de paiement : création de charges, remboursements, accès aux données clients. Risque financier direct.'],
    ['Stripe Restricted', 'Clé Stripe restreinte : périmètre limité mais toujours sensible (selon les permissions accordées).'],
    ['Private Key (PEM)', 'Clé privée cryptographique : déchiffrement de trafic, usurpation d\'identité TLS/SSH, signature frauduleuse.'],
    ['JWT', 'Jeton de session/identité : peut permettre l\'usurpation d\'un utilisateur ou d\'un service tant qu\'il est valide.'],
    ['DB Connection', 'Chaîne de connexion base de données : accès direct aux données (lecture/écriture/suppression) si le réseau le permet.'],
    ['GCP OAuth', 'Secret client OAuth Google Cloud : usurpation de l\'application et accès aux ressources GCP autorisées.'],
    ['Google API Key', 'Clé API Google : consommation de quotas facturés et accès aux services activés sur le projet.'],
    ['Slack', 'Jeton Slack : lecture de messages, envoi au nom du bot/utilisateur, accès aux canaux privés selon le scope.'],
    ['npm Token', 'Jeton npm : publication de paquets en ton nom. Risque d\'empoisonnement de la chaîne d\'approvisionnement.'],
    ['PyPI', 'Jeton PyPI : publication de paquets Python en ton nom. Risque d\'empoisonnement de la supply-chain.'],
    ['SendGrid', 'Clé d\'envoi d\'e-mails : spam/phishing depuis ton domaine, atteinte à la réputation d\'expéditeur.'],
    ['DigitalOcean', 'Jeton DigitalOcean : contrôle des droplets, bases et réseaux du compte.'],
    ['Vault', 'Jeton HashiCorp Vault : accès aux secrets stockés selon les policies associées au token.'],
    // Supply-chain
    ['Script preinstall', 'Hook exécuté automatiquement à l\'install : code arbitraire lancé sur tout poste/CI qui installe les deps.'],
    ['Script install', 'Hook exécuté automatiquement à l\'install : code arbitraire lancé sur tout poste/CI qui installe les deps.'],
    ['Script postinstall', 'Hook exécuté automatiquement à l\'install : code arbitraire lancé sur tout poste/CI qui installe les deps.'],
    ['Dépendance non figée', 'Version non épinglée : une mise à jour malveillante en amont entre silencieusement dans le build (supply-chain).'],
    ['Dépendance Python non figée', 'Version non épinglée : une release amont compromise entre dans le build sans contrôle.'],
    ['Version Maven dynamique', 'Version dynamique (LATEST/RELEASE/range) : build non reproductible, exposé à une dépendance amont compromise.'],
    ['Version Gradle dynamique', 'Version dynamique (+) : build non reproductible, exposé à une dépendance amont compromise.'],
    ['Registry HTTP', 'Registre en HTTP non chiffré : paquets interceptables/modifiables en transit (man-in-the-middle).'],
    ['Registry npm tiers', 'Registre tiers : la confiance repose sur un acteur externe non contrôlé.'],
    ['Image CI non pinnée', 'Image :latest ou sans tag : le contenu peut changer à tout moment, build non reproductible.'],
    ['Image Docker non pinnée', 'Image sans digest : le contenu derrière le tag peut être remplacé, build non reproductible.'],
    ['Exécution distante (pipe shell)', 'curl … | bash : exécute un script distant non vérifié. Si la source est compromise, exécution directe sur le runner.'],
    ['ADD distant', 'ADD d\'une URL : contenu distant non vérifié intégré à l\'image.'],
    ['include CI distant', 'Inclusion d\'une config CI distante : un changement amont modifie ton pipeline sans relecture.'],
  ];
  function riskText(type) {
    const hit = RISK.find(([k]) => type.toLowerCase().includes(k.toLowerCase()));
    return hit ? hit[1] : 'Donnée sensible exposée dans le dépôt : à considérer comme compromise et à traiter.';
  }

  // Description de la MR : auto-portante. Quel fichier, quelle ligne, pourquoi
  // c'est dangereux, quoi faire. C'est ce que le destinataire lit en premier.
  function buildMRDescription(repo, res) {
    const isSupply = res.findings.some(f => f.kind === 'supply');
    const n = res.findings.length;
    const noun = isSupply ? 'alerte(s) supply-chain' : 'secret(s)';

    let d = `## 🔑 Scan sécurité — ${n} ${noun}\n\n`;
    d += `Rapport généré automatiquement par **DevOps Hub · Secrets Scanner** sur \`${repo.path}\`.\n`;
    d += `> ⚠️ **Proposition** : à vous de décider. Rien n'est mergé automatiquement, libre à vous de fermer cette MR.\n`;
    if (!isSupply) d += `> Les valeurs ci-dessous sont **censurées** (préfixe + \`***\`).\n`;
    d += `\n---\n\n`;

    res.findings.forEach((f, i) => {
      const cat = f.tag || ('CIS ' + f.cis);
      d += `### ${i + 1}. ${f.type}\n`;
      d += `- **Fichier** : \`${f.file}\`${f.line ? ` — **ligne ${f.line}**` : ''}${f.commit ? ` — commit \`${f.commit}\`` : ''}\n`;
      d += `- **Catégorie** : ${cat}\n`;
      d += `- **Aperçu** : \`${f.preview}\`\n`;
      d += `- **Pourquoi c'est dangereux** : ${riskText(f.type)}\n`;
      d += `- **Action** : ${isSupply
        ? 'épingler la version (exacte ou `@sha256`), retirer les hooks/`curl … | bash` non vérifiés.'
        : '**révoquer** le secret côté service (le considérer compromis), le retirer du fichier, le remplacer par une variable CI/CD protégée, puis **purger l\'historique** Git si nécessaire.'}\n\n`;
    });

    d += `---\n_Détail complet également dans \`${MR_FILE}\`. Refs CIS GitLab : 1.5.1 (code), 2.3.8 (pipeline), 5.1.3 (déploiement)._\n`;
    return d;
  }


  // status ∈ 'created' | 'exists' | 'forbidden' | 'error'
  const MR_CIS_BRANCH = 'security-scan/cis';

  function defaultSecurityMd(repo) {
    return `# Politique de sécurité — ${repo.path}\n\n`
      + `## Signaler une vulnérabilité\n\n`
      + `Merci de signaler toute vulnérabilité de manière responsable, en privé, à l'équipe sécurité plutôt que via une issue publique.\n\n`
      + `- Contact : _à compléter (e-mail ou canal sécurité de l'équipe)_\n`
      + `- Délai de réponse visé : sous 72 h ouvrées\n\n`
      + `## Versions supportées\n\n`
      + `| Version | Supportée |\n|---|---|\n| dernière | ✅ |\n\n`
      + `---\n_Fichier proposé automatiquement par DevOps Hub (conformité CIS GitLab 1.2.1). À adapter par l'équipe._\n`;
  }
  function defaultCodeowners(repo) {
    return `# CODEOWNERS — ${repo.path}\n`
      + `# Définit les propriétaires par défaut, sollicités en revue sur chaque MR.\n`
      + `# Syntaxe : <motif>  @utilisateur ou @groupe\n`
      + `# Réf. CIS GitLab 1.1.6. À compléter par l'équipe.\n\n`
      + `* @${(repo.path.split('/')[0]) || 'votre-groupe'}\n`;
  }

  function buildCISDescription(repo, res, fileActions) {
    const ko = res.checks.filter(c => c.state === 'ko');
    const unverif = res.checks.filter(c => c.state === 'unverif');
    let d = `## 🛡️ Conformité CIS GitLab — score ${res.score}/100\n\n`;
    d += `Audit automatique **DevOps Hub** sur \`${repo.path}\`. Statut : **${res.status === 'conform' ? '✅ conforme' : '🔴 non conforme'}** (score ${res.score}/100, priorité).\n`;
    d += `> ⚠️ **Proposition** : à valider ou refuser (merge / close). Rien n'est imposé.\n\n`;

    if (fileActions.length) {
      d += `### 📄 Fichiers proposés dans cette MR\n`;
      d += `Ces fichiers sont **ajoutés par cette MR** — il vous suffit de la merger pour les créer (ou de les ajuster avant) :\n\n`;
      for (const fa of fileActions) d += `- \`${fa.file_path}\` — ${fa.why}\n`;
      d += `\n`;
    }

    d += `### ⚙️ À régler dans les Settings GitLab\n`;
    d += `Ces points **ne peuvent pas** être corrigés par un commit : ils relèvent de la configuration du projet.\n\n`;
    const settingsKo = ko.filter(c => !c.fixable);
    if (settingsKo.length) {
      d += `| Check | CIS | Constat | Où corriger |\n|---|---|---|---|\n`;
      const where = {
        branch: 'Settings → Repository → Protected branches',
        approvals: 'Settings → Merge requests → Approvals',
        linear: 'Settings → Merge requests → Merge method',
        maintainers: 'Project information → Members',
        webhooks: 'Settings → Webhooks',
        inactive: 'Archiver le projet (Settings → General → Advanced)',
      };
      for (const c of settingsKo) d += `| ${escMd(c.label)} | ${c.cis} | ${escMd(c.detail)} | ${where[c.id] || '—'} |\n`;
      d += `\n`;
    } else {
      d += `_Aucun réglage de configuration en écart._\n\n`;
    }

    if (unverif.length) {
      d += `### 🔒 Non vérifiable (droits insuffisants)\n`;
      d += `Le compte ayant lancé le scan n'avait pas les droits de lire ces points. **Ce n'est pas un constat de non-conformité.**\n\n`;
      for (const c of unverif) d += `- ${escMd(c.label)} (CIS ${c.cis})\n`;
      d += `\n`;
    }

    d += `---\n_Réf. CIS GitLab Benchmark v1.0.1. Généré par DevOps Hub._\n`;
    return d;
  }
  const escMd = t => String(t == null ? '' : t).replace(/\|/g, '\\|');

  const BR_LOCKFILES = { npm: ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock'] };
  const BR_MANIFESTS = { npm: ['package.json'] };
  const BR_SBOM_RE = /(?:^|[\/])(?:gl-sbom.*\.cdx\.json|.*\.cdx\.json|bom\.json|sbom\.json|cyclonedx.*\.json)$/i;

  // ── PUR : correspondance de version (exacte ou wildcard x/*) ──
  function brVersionMatch(target, resolved) {
    if (!target || !resolved) return false;
    if (target === resolved) return true;
    const t = String(target).split('.'), r = String(resolved).split('.');
    for (let i = 0; i < t.length; i++) {
      const seg = t[i];
      if (seg === 'x' || seg === '*') continue;      // wildcard segment
      if (r[i] === undefined || r[i] !== seg) return false;
    }
    return true;
  }

  // ── PUR : parse package-lock.json (v1 & v2/v3) → [{name,version,integrity,dev,direct}] ──
  function brParseNpmLock(content) {
    let j; try { j = JSON.parse(content); } catch { return null; }
    const out = [];
    // Dépendances directes déclarées (pour direct vs transitif).
    const rootPkg = (j.packages && j.packages['']) || {};
    const directNames = new Set([].concat(
      Object.keys(rootPkg.dependencies || {}),
      Object.keys(rootPkg.devDependencies || {}),
      Object.keys((j.dependencies && !j.packages) ? {} : {})
    ));
    if (j.packages) {                                 // v2 / v3
      for (const key of Object.keys(j.packages)) {
        if (key === '') continue;
        const m = key.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/);
        if (!m) continue;
        const v = j.packages[key] || {};
        out.push({ name: m[1], version: v.version || null, integrity: v.integrity || null, dev: !!v.dev, direct: directNames.has(m[1]), installScript: !!v.hasInstallScript });
      }
    }
    if (j.dependencies && !j.packages) {              // v1 (récursif)
      const walk = (deps, top) => {
        for (const name of Object.keys(deps)) {
          const v = deps[name] || {};
          out.push({ name, version: v.version || null, integrity: v.integrity || null, dev: !!v.dev, direct: top });
          if (v.dependencies) walk(v.dependencies, false);
        }
      };
      walk(j.dependencies, true);
    }
    return out;
  }

  // ── PUR : parse yarn.lock (v1 classique) → [{name,version,integrity,direct}] ──
  function brParseYarnLock(content) {
    const out = [];
    const blocks = String(content).split(/\n(?=\S)/);   // un bloc par entrée (header non indenté)
    for (const block of blocks) {
      const lines = block.split('\n');
      const header = lines[0]; if (!header || !header.includes('@') || !/:\s*$/.test(header.trim())) continue;
      // noms depuis le header : "axios@^1.0.0", "axios@~1.1":
      const names = new Set();
      header.replace(/:\s*$/, '').split(',').forEach(spec => {
        let s = spec.trim().replace(/^"|"$/g, '');
        const at = s.lastIndexOf('@');
        if (at > 0) names.add(s.slice(0, at));
      });
      let version = null, integrity = null;
      for (const ln of lines) {
        let m = ln.match(/^\s+version:?\s+"?([^"\s]+)"?/); if (m) version = m[1];
        m = ln.match(/^\s+integrity\s+"?([^"\s]+)"?/); if (m) integrity = m[1];
      }
      for (const name of names) out.push({ name, version, integrity, dev: false, direct: true });
    }
    return out;
  }

  function brParseLock(path, content) {
    const leaf = path.split('/').pop().toLowerCase();
    if (leaf === 'yarn.lock') return brParseYarnLock(content);
    if (leaf === 'package-lock.json' || leaf === 'npm-shrinkwrap.json') return brParseNpmLock(content);
    return null;
  }

  // ── PUR : le composant IOC est-il dans ces entrées de lockfile ? ──
  function brFindComponent(entries, name, version) {
    if (!entries) return null;
    const hit = entries.find(e => e.name === name && brVersionMatch(version, e.version));
    return hit || null;
  }

  // ── PUR : CycloneDX contient le composant ? ──
  function brSbomHasComponent(sbom, name, version) {
    if (!sbom || !Array.isArray(sbom.components)) return false;
    return sbom.components.some(c => {
      if (c.purl && c.purl.includes('/' + name + '@')) return brVersionMatch(version, (c.purl.split('@').pop() || '').split('?')[0]);
      return c.name === name && brVersionMatch(version, c.version);
    });
  }

  // ── PUR : niveau de preuve d'une exposition → 'confirmed'|'executed'|'resolved'|'present' ──
  function brEvidenceLevel(exp) {
    if (exp.sbomConfirmed) return 'confirmed';
    if (exp.resolved && exp.pipelines > 0) return 'executed';
    if (exp.resolved) return 'resolved';
    return 'present';
  }
  // ── PUR : score P1→P3 (P0 = tranche privilèges/propagation) ──
  const BR_LEVEL_META = {
    confirmed: { p: 'P1', label: 'Exécution confirmée (SBOM)', tone: 'p1' },
    executed:  { p: 'P1', label: 'Très probable (lockfile + pipeline)', tone: 'p1' },
    resolved:  { p: 'P2', label: 'Exposition probable (lockfile, sans exécution)', tone: 'p2' },
    present:   { p: 'P3', label: 'Présence historique (manifeste, sans lockfile)', tone: 'p3' }
  };
  // ── PUR : le job exposé pouvait-il faire des dégâts ? (tranche privilèges) ──
  function brExecuted(exp) { const l = brEvidenceLevel(exp); return l === 'confirmed' || l === 'executed'; }
  function brP0Reasons(exp) {
    const r = [];
    if (!brExecuted(exp)) return r;
    const p = exp.priv;
    if (p) {
      if (p.hasSecrets) r.push('secrets accessibles');
      if (p.writeCapable) r.push('droits d\'écriture (registry / job token sortant)');
      if (p.sharedRunner) r.push('runner partagé/persistant');
    }
    const pr = exp.prop;
    if (pr) {
      if (pr.published) r.push('a publié un package');
      if (pr.prodDeployed) r.push('déployé en production');
    }
    return r;
  }
  // ── PUR : priorité P0→P3 (P0 = exécuté ET pouvait atteindre secrets/écriture/runner) ──
  function brScore(exp) {
    const meta = BR_LEVEL_META[brEvidenceLevel(exp)];
    if (brP0Reasons(exp).length) return { p: 'P0', label: 'Compromission critique — ' + meta.label, tone: 'p0' };
    return { p: meta.p, label: meta.label, tone: meta.tone };
  }

  // ── PUR : disposition de la timeline (positions en %) ──
  function brLayout(exposures, t0, t1) {
    const span = Math.max(1, t1 - t0);
    const pct = t => Math.max(0, Math.min(100, ((t - t0) / span) * 100));
    return exposures.map(e => {
      const intro = e.introducedAt != null ? e.introducedAt : t0;
      const rem = e.removedAt != null ? e.removedAt : t1;
      return {
        exp: e,
        leftPct: pct(intro),
        widthPct: Math.max(1.2, pct(rem) - pct(intro)),
        execs: (e.execs || []).map(x => ({ level: x.level, xPct: pct(x.at) }))
      };
    });
  }

  // ── Lecture artefact brut (SBOM) — texte, pas JSON base64 ──
  function brParseIOC() {
    const eco = (document.getElementById('brEco') || {}).value || 'npm';
    const name = ((document.getElementById('brName') || {}).value || '').trim();
    const version = ((document.getElementById('brVersion') || {}).value || '').trim();
    const fromV = (document.getElementById('brFrom') || {}).value;
    const toV = (document.getElementById('brTo') || {}).value;
    const from = fromV ? new Date(fromV + 'T00:00:00Z').toISOString() : null;
    const to = toV ? new Date(toV + 'T23:59:59Z').toISOString() : null;
    const limRaw = parseInt((document.getElementById('brLimit') || {}).value, 10);
    const limit = Number.isFinite(limRaw) && limRaw > 0 ? limRaw : null;
    return { eco, name, version, from, to, limit, purl: `pkg:${eco}/${name}@${version}` };
  }

  // ── Commits touchant un fichier dans la fenêtre ──
  const BR_COMMITS_CAP = 12;   // garde-fou coût par lockfile

  // ── Présence : où le composant était dans un repo (lockfiles) ──
  const BEHAVIOR_PATTERNS = [
    { id: 'download-exec', sev: 'red', label: 'Téléchargement piped vers un shell (curl|bash)', re: /\b(curl|wget)\b[^\n|]*\|\s*(bash|sh|zsh|python[0-9]?|node|perl|ruby)\b/i },
    { id: 'base64-exec', sev: 'red', label: 'Décodage base64 exécuté', re: /base64\s+(-d|--decode)\b[^\n|]*\|\s*(bash|sh|zsh)\b/i },
    { id: 'eval-download', sev: 'red', label: 'eval/IEX sur contenu distant', re: /(\beval\b[^\n]*\b(curl|wget|fetch|https?:\/\/))|(iex\s*\()/i },
    { id: 'rev-shell', sev: 'red', label: 'Reverse shell', re: /\/dev\/tcp\/|\b(nc|ncat)\b[^\n]*\s-e\b|bash\s+-i\s*>?&|sh\s+-i\s*>?&/i },
    { id: 'raw-ip-fetch', sev: 'red', label: 'Fetch vers une IP brute', re: /\b(curl|wget)\b[^\n]*\bhttps?:\/\/\d{1,3}(\.\d{1,3}){3}\b/i },
    { id: 'powershell-enc', sev: 'red', label: 'PowerShell encodé', re: /powershell[^\n]*\s-e(nc|ncodedcommand)?\b/i },
    { id: 'chmod-exec', sev: 'orange', label: 'chmod +x puis exécution', re: /chmod\s+\+x[^\n]*&&[^\n]*(\.\/|\/tmp\/)/i },
    { id: 'shell-spawn', sev: 'orange', label: 'Spawn de processus (child_process)', re: /child_process|execSync\s*\(|spawnSync\s*\(/i },
    { id: 'docker-add-url', sev: 'orange', label: 'ADD depuis une URL (Dockerfile)', re: /^\s*ADD\s+https?:\/\//i }
  ];
  // PUR : cherche les empreintes dans un texte (par ligne → n° de ligne + extrait).
  function brScanText(text, source) {
    const out = [];
    if (!text) return out;
    const lines = String(text).split('\n');
    for (const p of BEHAVIOR_PATTERNS) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 2000) continue;
        if (p.re.test(lines[i])) { out.push({ id: p.id, label: p.label, sev: p.sev, source: source, line: i + 1, sample: lines[i].trim().slice(0, 140) }); break; }
      }
    }
    return out;
  }
  function brBuildPlan() {
    const { exposures, ioc } = _brState;
    const byRepo = {}; exposures.forEach(e => { (byRepo[e.repo.path] = byRepo[e.repo.path] || []).push(e); });
    const PRANK = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const p0 = exposures.filter(e => brScore(e).p === 'P0');
    const p1 = exposures.filter(e => brScore(e).p === 'P1');
    const secretsRepos = exposures.filter(e => e.priv && e.priv.hasSecrets);
    const lines = [];
    lines.push(`# Plan d'action — ${ioc.name}@${ioc.version}`, '', `IOC : ${ioc.purl}`, ioc.from ? `Fenêtre : ${ioc.from} → ${ioc.to || 'maintenant'}` : '', '');
    lines.push(`## Synthèse`, `- Repos exposés : ${Object.keys(byRepo).length}`, `- Expositions : ${exposures.length}`, `- P0 (exécuté + pouvait atteindre secrets/écriture/runner) : ${p0.length}`, `- P1 (exécution avérée) : ${p1.length}`, '');
    if (p0.length) lines.push(`## 🔴 P0 — à traiter en premier`, ...p0.map(e => {
      const reasons = brP0Reasons(e).join(', ');
      return `- [ ] ${e.repo.path} — ${e.pipelines} pipeline(s) exposé(s) ; ${reasons}`;
    }), '');
    lines.push(`## À corriger (dépôts)`, ...Object.keys(byRepo).map(r => {
      const worst = byRepo[r].reduce((a, e) => Math.min(a, PRANK[brScore(e).p]), 3);
      return `- [ ] ${r} — retirer ${ioc.name}@${ioc.version}, régénérer le lockfile (priorité P${worst})`;
    }), '');
    if (secretsRepos.length) lines.push(`## 🔑 Secrets à tourner (jobs exposés y avaient accès — état actuel)`, ...secretsRepos.map(e => `- [ ] ${e.repo.path} — ${fmt(e.priv.secrets.length)} variable(s) CI/CD : ${e.priv.secrets.slice(0, 8).map(s => s.key).join(', ')}${e.priv.secrets.length > 8 ? '…' : ''}`), '');
    if (p1.length) lines.push(`## Pipelines à examiner (exécution avérée)`, ...p1.map(e => `- [ ] ${e.repo.path} — ${e.pipelines} pipeline(s) sur commit(s) exposé(s)${e.sbomConfirmed ? ' · SBOM confirme le composant' : ''}`), '');
    const propagated = exposures.filter(e => e.prop && (e.prop.published || e.prop.prodDeployed || (e.prop.downstream && e.prop.downstream.length)));
    if (propagated.length) lines.push(`## 📦 Propagation à contenir`, ...propagated.map(e => {
      const p = e.prop, bits = [];
      if (p.published) bits.push(`${p.packages.length} package(s) publié(s)`);
      if (p.images && p.images.length) bits.push(`${p.images.length} image(s) registry`);
      if (p.prodDeployed) bits.push(`déployé en prod${p.prodActive ? ' (toujours actif)' : ''}`);
      if (p.downstream && p.downstream.length) bits.push(`${p.downstream.length} projet(s) consommateur(s)${p.truncated ? '+' : ''}`);
      return `- [ ] ${e.repo.path} — ${bits.join(' · ')}`;
    }), '');
    const behav = exposures.filter(e => e.behavior && (e.behavior.installScript || e.behavior.red > 0));
    if (behav.length) lines.push(`## ☣️ Comportement suspect (empreintes statiques — à confirmer par les logs/EDR)`, ...behav.map(e => {
      const b = e.behavior, bits = [];
      if (b.installScript) bits.push('le composant exécute un script d\'installation');
      const labs = [...new Set(b.findings.map(f => f.label))];
      if (labs.length) bits.push(labs.join(' ; '));
      return `- [ ] ${e.repo.path} — ${bits.join(' · ')}`;
    }), '');
    lines.push('_Généré en lecture seule. Aucune action n\'a été exécutée. Privilèges = état actuel des variables (confidence: current_state_only) ; caches non calculés ; comportement = empreintes statiques, pas de télémétrie runtime._');
    return lines.filter(l => l !== null).join('\n');
  }
  const OSV_BASE = 'https://api.osv.dev';
  const OSV_ECO = { npm: 'npm' };   // écosystème Salsifi → écosystème OSV

  function osvSeverity(id, detail) {
    if (String(id).startsWith('MAL-')) return { label: 'MALVEILLANT', rank: 5, tone: 'p1' };
    const ds = (detail && detail.database_specific && detail.database_specific.severity) || '';
    const s = String(ds).toUpperCase();
    if (s.includes('CRIT')) return { label: 'CRITIQUE', rank: 4, tone: 'p1' };
    if (s.includes('HIGH') || s.includes('ÉLEV')) return { label: 'ÉLEVÉ', rank: 3, tone: 'p1' };
    if (s.includes('MOD') || s.includes('MED')) return { label: 'MOYEN', rank: 2, tone: 'p2' };
    if (s.includes('LOW')) return { label: 'FAIBLE', rank: 1, tone: 'p3' };
    return { label: 'Vulnérable', rank: 0, tone: 'p2' };
  }

  // ── Inventaire : composants résolus de tous les repos (HEAD) ──
