/* insights · index.js — entrée & câblage (chargé en dernier). */

function init() {
    // Nouveau format hub : localStorage 'devops_hub_workspaces' (JSON) + 'hub_selected_repo_id'
    // Auth centralisee (devops_hub_workspaces + fallback sessionStorage legacy)
    const _auth = window.Salsifi.loadAuth({ redirect: false });
    if (_auth) { token = _auth.token; GITLAB_URL = _auth.gitlabUrl; }

    // Project ID : nouveau format puis ancien
    const selectedRepoId = localStorage.getItem('hub_selected_repo_id');
    projectId = selectedRepoId || sessionStorage.getItem('gitlab_project_id');

    if (!token || !GITLAB_URL) {
        showError('Token ou URL GitLab manquant. Retourne au hub pour te connecter.');
        return;
    }
    if (!projectId) {
        showError('Aucun projet sélectionné. Retourne au hub pour choisir un projet.');
        return;
    }

    // Tenter de retrouver le nom du projet depuis le cache des repos du hub
    let projectName = sessionStorage.getItem('gitlab_project');
    if (!projectName && _auth) {
        try {
            const cacheKey = 'hub_cache_repos_' + (_auth.username || '');
            const cacheRaw = localStorage.getItem(cacheKey);
            if (cacheRaw) {
                const cache = JSON.parse(cacheRaw);
                const found = cache.repos && cache.repos.find(r => String(r.id) === String(projectId));
                if (found) projectName = found.name;
            }
        } catch { /* ignore */ }
    }
    document.getElementById('projectName').textContent = projectName || `Projet #${projectId}`;

    // Bouton export branché en event delegation (plus de onclick inline).
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportReport);
    loadData();
}


const DORA_META = {
    df:   { emoji: '🚀', label: 'Fréquence de déploiement' },
    lt:   { emoji: '⚡', label: 'Lead Time' },
    cfr:  { emoji: '🔧', label: 'Change Failure Rate' },
    mttr: { emoji: '⏱️', label: 'Temps de restauration' }
};
// ── Contenu du coach : un vrai plan par métrique DORA (pas un one-liner).
//    Chaque levier a un id stable (rotation/escalade), un effort et un impact.
//    `measure` = ce qui bouge quand tu progresses ; `traps` = les fausses bonnes idées.

const DORA_COACH = {
    df: {
        emoji: '🚀', label: 'Fréquence de déploiement', targetTxt: '≥ 7 déploiements/sem (Elite)',
        stakes: 'Déployer souvent, c\'est livrer par petits lots : moins de risque à chaque mise en prod, un retour terrain rapide, et la fin des « big bang » stressants. Un déploiement rare concentre tout le risque sur un seul moment.',
        levers: [
            { id: 'df.cd', title: 'Automatiser le déploiement (CD)', detail: 'Un merge sur la branche par défaut doit déclencher le déploiement, sans geste manuel. Tant qu\'un humain doit « lancer » la prod, la fréquence plafonne.', effort: 'moyen', impact: 'fort', module: { name: 'Pipeline Generator', page: 'pipeline-generator.html' } },
            { id: 'df.small', title: 'Découper en petites MR', detail: 'Plus tu fusionnes petit et souvent, plus tu déploies. Vise des MR sous ~200 lignes : elles se relisent et se mergent dans la journée.', effort: 'faible', impact: 'fort' },
            { id: 'df.flags', title: 'Feature flags', detail: 'Déploie du code inactif derrière un flag pour découpler « déployer » de « activer ». Tu livres en continu sans exposer l\'inachevé.', effort: 'moyen', impact: 'moyen', module: { name: 'Feature Flag Manager', page: 'feature-flag-manager.html' } },
            { id: 'df.trunk', title: 'Branches courtes (trunk-based)', detail: 'Des branches qui vivent des semaines finissent en gros merges rares. Rapproche-toi du trunk : branche → merge en quelques jours max.', effort: 'moyen', impact: 'moyen' },
            { id: 'df.fastci', title: 'Pipeline rapide et fiable', detail: 'Si le pipeline est lent ou instable, personne ne déploie souvent. Un CI vert en quelques minutes, c\'est ce qui rend le déploiement fréquent tenable.', effort: 'moyen', impact: 'moyen' }
        ],
        measure: 'Je te sais en progrès quand le nombre de pipelines réussis par semaine (sur ta fenêtre 30 j) grimpe.',
        traps: ['« Déployer souvent » ne veut pas dire « déployer n\'importe quoi » : garde un œil sur ton CFR en parallèle.', 'Compter les déploiements manuels : si tu ne peux pas les mesurer, tu ne peux pas les augmenter.']
    },
    lt: {
        emoji: '⚡', label: 'Lead Time', targetTxt: '≤ 24 h premier commit → prod (Elite)',
        stakes: 'Le Lead Time, c\'est le délai entre « le dev commence » et « c\'est en prod ». Long, il veut dire de la valeur qui dort, des reviews qui traînent et du contexte perdu entre l\'écriture et la livraison.',
        levers: [
            { id: 'lt.small', title: 'Réduire la taille des MR', detail: 'Une petite MR se relit en minutes ; une grosse traîne des jours et décourage les revieweurs. C\'est le levier n°1 sur le lead time.', effort: 'faible', impact: 'fort', module: { name: 'MR Reviewer', page: 'mr-reviewer.html' } },
            { id: 'lt.sla', title: 'Un SLA de review', detail: 'Fixe une attente d\'équipe (ex. première review < 4 h ouvrées), avec des revieweurs désignés et des notifications. La review qui dort est souvent le plus gros du délai.', effort: 'faible', impact: 'fort' },
            { id: 'lt.merge', title: 'Merger dès que c\'est vert', detail: 'Une MR approuvée et au pipeline vert ne devrait pas attendre. Traque les MR « prêtes mais pas mergées ».', effort: 'faible', impact: 'moyen' },
            { id: 'lt.wip', title: 'Limiter le travail en cours', detail: 'Trop de MR ouvertes en parallèle = rien n\'avance vraiment. Fini d\'abord, commence ensuite.', effort: 'moyen', impact: 'moyen' },
            { id: 'lt.autochecks', title: 'Automatiser les checks bloquants', detail: 'Lint, format, tests : si un humain doit signaler ces détails à la main, la review s\'éternise. Laisse le CI le faire.', effort: 'moyen', impact: 'moyen' }
        ],
        measure: 'Ta progression se lit sur la médiane premier commit → merge de tes MR fusionnées.',
        traps: ['Raccourcir le lead time en sautant la review : tu ne fais que déplacer le problème sur le CFR.', 'Optimiser une MR géante « vite mergée » : c\'est la taille qu\'il faut réduire, pas la vigilance.']
    },
    cfr: {
        emoji: '🔧', label: 'Change Failure Rate', targetTxt: '≤ 5 % de déploiements en échec (Elite)',
        stakes: 'Le CFR, c\'est la part de tes livraisons prod qui cassent. Trop haut, il signale que tu vas vite mais que tu casses souvent : rollbacks, stress, et une confiance qui s\'érode à chaque incident.',
        levers: [
            { id: 'cfr.gates', title: 'Quality gates avant merge', detail: 'Pipeline vert obligatoire, review obligatoire, branche par défaut protégée : rendre le merge d\'un changement non vérifié tout simplement impossible.', effort: 'faible', impact: 'fort', module: { name: 'Gouvernance repo', page: 'gouvernance-repo.html' } },
            { id: 'cfr.tests', title: 'Tests automatisés sur les chemins critiques', detail: 'Sans filet, chaque déploiement est un pari. Couvre d\'abord les parcours qui font mal quand ils cassent.', effort: 'fort', impact: 'fort' },
            { id: 'cfr.staging', title: 'Un staging représentatif', detail: 'Tester « comme en prod » avant la prod attrape les surprises de config et d\'environnement avant qu\'elles ne cassent les utilisateurs.', effort: 'moyen', impact: 'moyen' },
            { id: 'cfr.small', title: 'Des changements plus petits', detail: 'Un petit changement casse moins souvent et se diagnostique en minutes. La taille des MR est aussi une affaire de stabilité.', effort: 'faible', impact: 'moyen' },
            { id: 'cfr.review', title: 'Deux paires d\'yeux sur les zones sensibles', detail: 'Sur le code critique, exige une vraie revue (pas un rubber-stamp). Le coût d\'une review est très inférieur au coût d\'un rollback.', effort: 'faible', impact: 'moyen' }
        ],
        measure: 'Ta progression se lit sur le pourcentage de pipelines prod (main/master) en échec, pondéré vers le récent.',
        traps: ['Masquer les échecs par des retries aveugles : ça cache le CFR, ça ne le baisse pas.', 'Blâmer les personnes plutôt que le process : un CFR élevé est presque toujours un problème de garde-fous, pas de talent.']
    },
    mttr: {
        emoji: '⏱️', label: 'Temps de restauration', targetTxt: '≤ 1 h pour restaurer le service (Elite)',
        stakes: 'Quand ça casse — et ça finira par casser — combien de temps pour revenir à la normale ? Un MTTR long, c\'est un incident qui dure, donc de l\'impact utilisateur. La résilience compte autant que la vitesse.',
        levers: [
            { id: 'mttr.rollback', title: 'Rollback en un geste', detail: 'Pouvoir revenir à la version précédente en une commande (ou un clic) est ce qui transforme un incident d\'une heure en incident de cinq minutes.', effort: 'moyen', impact: 'fort' },
            { id: 'mttr.detect', title: 'Détecter vite', detail: 'Alerting sur les pipelines/déploiements en échec et monitoring des symptômes : on ne restaure pas ce qu\'on n\'a pas vu tomber.', effort: 'moyen', impact: 'fort' },
            { id: 'mttr.small', title: 'Déployer petit et souvent', detail: 'Un petit changement est plus facile à annuler et à diagnostiquer : la fréquence de déploiement sert aussi la restauration.', effort: 'faible', impact: 'moyen' },
            { id: 'mttr.flags', title: 'Couper via un feature flag', detail: 'Désactiver la fonctionnalité fautive sans redéployer : la remédiation la plus rapide qui soit.', effort: 'moyen', impact: 'moyen', module: { name: 'Feature Flag Manager', page: 'feature-flag-manager.html' } },
            { id: 'mttr.runbook', title: 'Des runbooks', detail: 'Une procédure écrite pour les incidents fréquents évite d\'improviser sous pression et fait gagner de précieuses minutes.', effort: 'faible', impact: 'moyen' }
        ],
        measure: 'Ta progression se lit sur le temps médian entre un pipeline en échec et le succès qui restaure, sur main/master.',
        traps: ['Un MTTR « N/A » (aucun échec observé) n\'est pas un blanc-seing : configure la mesure sur tes pipelines prod pour être prêt le jour J.', 'Optimiser la détection sans préparer la remédiation : voir vite ne sert à rien si on ne sait pas revenir vite.']
    }
};


let _doraCoachCtx = null;   // { vals, state } — pour re-render sur clic sans refetch


function exportReport() {
    const projectName = document.getElementById('projectName').textContent;
    const safeProjectName = escapeHtml(projectName);
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Les .textContent / innerText retournent du texte brut, pas de HTML.
    const df  = document.getElementById('deployFrequency').textContent;
    const lt  = document.getElementById('leadTime').textContent;
    const cfr = document.getElementById('failureRate').textContent;
    const mttr = document.getElementById('restoreTime').textContent;

    function getBadge(elId) {
        const el = document.getElementById(elId);
        if (!el) return 'N/A';
        const badge = el.querySelector('.dora-badge');
        return badge ? badge.textContent.trim() : 'N/A';
    }
    const dfBadge   = getBadge('deployFrequency-badge');
    const ltBadge   = getBadge('leadTime-badge');
    const cfrBadge  = getBadge('failureRate-badge');
    const mttrBadge = getBadge('restoreTime-badge');

    // Score : .innerText évite les balises HTML du badge "MTTR manquant"
    // sans utiliser de regex fragile sur du innerHTML.
    const scoreValue = document.getElementById('scoreValue').textContent;
    const scoreLevel = document.getElementById('scoreLevelTitle').innerText.trim();

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Rapport DORA — ${safeProjectName} — ${dateStr}</title>
<style>
* { margin:0;padding:0;box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
       background:linear-gradient(135deg,#1e1b4b,#312e81,#4c1d95);
       min-height:100vh;color:white;padding:40px; }
.container { max-width:900px;margin:0 auto; }
.header { text-align:center;padding:40px;background:var(--ov-1);border-radius:24px;
          border:1px solid var(--ov-2);margin-bottom:40px; }
.header h1 { font-size:32px;font-weight:800;margin-bottom:8px; }
.header p { opacity:0.7;font-size:15px; }
.project { display:inline-block;padding:10px 20px;background:var(--ov-15);
           border-radius:12px;font-size:16px;font-weight:600;margin-top:16px; }
.section-title { font-size:20px;font-weight:700;margin:30px 0 16px;
                 padding-bottom:10px;border-bottom:2px solid var(--ov-2); }
.score-global { text-align:center;padding:30px;background:var(--ov-1);border-radius:20px;
                border:1px solid var(--ov-2);margin-bottom:30px; }
.score-value { font-size:64px;font-weight:800; }
.score-level { font-size:20px;font-weight:700;margin-top:8px; }
.dora-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:30px; }
.dora-card { background:var(--ov-1);border-radius:16px;padding:24px;
             border:1px solid var(--ov-2); }
.dora-name { font-size:13px;font-weight:600;opacity:0.8;margin-bottom:8px; }
.dora-val { font-size:36px;font-weight:800;margin-bottom:8px; }
.dora-badge { display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600; }
.method-note { background:var(--ov-07);border:1px solid var(--ov-15);
               border-radius:12px;padding:16px;font-size:12px;opacity:0.75;margin-top:20px;line-height:1.7; }
.footer { text-align:center;margin-top:40px;opacity:0.5;font-size:13px; }
</style></head><body><div class="container">
<div class="header">
  <div style="font-size:56px;margin-bottom:16px">📊</div>
  <h1>Rapport DORA Metrics</h1>
  <p>Performance DevOps</p>
  <div class="project">📦 ${safeProjectName}</div>
  <p style="margin-top:12px;font-size:13px;opacity:0.6">Généré le ${dateStr} à ${timeStr}</p>
</div>
<div class="score-global">
  <div class="score-value">${scoreValue}/100</div>
  <div class="score-level">${escapeHtml(scoreLevel)}</div>
</div>
<div class="section-title">🎯 Les 4 métriques DORA</div>
<div class="dora-grid">
  <div class="dora-card">
    <div class="dora-name">🚀 Deploy Frequency</div>
    <div class="dora-val" style="color:#a5b4fc">${df}</div>
    <span class="dora-badge" style="background:rgba(165,180,252,0.2);color:#a5b4fc">${dfBadge}</span>
  </div>
  <div class="dora-card">
    <div class="dora-name">⚡ Lead Time for Changes</div>
    <div class="dora-val" style="color:#6ee7b7">${lt}</div>
    <span class="dora-badge" style="background:rgba(110,231,183,0.2);color:#6ee7b7">${ltBadge}</span>
  </div>
  <div class="dora-card">
    <div class="dora-name">🔧 Change Failure Rate</div>
    <div class="dora-val" style="color:#fca5a5">${cfr}</div>
    <span class="dora-badge" style="background:rgba(252,165,165,0.2);color:#fca5a5">${cfrBadge}</span>
  </div>
  <div class="dora-card">
    <div class="dora-name">⏱️ Time to Restore Service</div>
    <div class="dora-val" style="color:#fcd34d">${mttr}</div>
    <span class="dora-badge" style="background:rgba(252,211,77,0.2);color:#fcd34d">${mttrBadge}</span>
  </div>
</div>
<div class="method-note">
  <strong>Méthode de calcul</strong><br>
  DF : pipelines success sur env prod / 30j × 7<br>
  Lead Time : médiane first_commit_at → merged_at des MRs<br>
  CFR : pipelines failed / total pipelines × 100 (fenêtres pondérées 5j/10j/30j)<br>
  TTRS : médiane durée pipeline failed → success suivant sur branche prod<br><br>
  <strong>⚠️ Note sur le score global :</strong> si MTTR est manquant, le score est plafonné à 75/100 maximum. Toute métrique absente réduit la fiabilité du score.
</div>
<div class="footer">DevOps Hub © ${now.getFullYear()}</div>
</div></body></html>`;

    try {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `DORA-${projectName.replace(/[^a-zA-Z0-9]/g,'-')}-${now.toISOString().split('T')[0]}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        alert('Erreur lors de l\'export : ' + e.message);
    }
}

// ════════════════════════════════════════════════════════════
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
