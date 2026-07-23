/* feature-flag-manager · state.js — état & config partagés (chargé en 1er).
 * Portée globale du script classique (partagée entre les <script> du module). */


        let timelineChartInstance = null;

        let GITLAB_URL = null;

        let projectId = null;

        let token = null;

        let currentFlags = [];

        let wizardStep = 1;

        let wizardType = null; // 'flag' or 'ops'

        // ══════════════════════════════════════════════════════════════════
        // HELPERS — fetch avec retry 429 + escapeHtml
        // Alignés sur workspace-hub / gouvernance-repo / dora-workspace / repo-analyzer.
        // ══════════════════════════════════════════════════════════════════

        const PROD_SCOPE = 'production';

        let currentCleanupFlag = null;

        let currentCleanupFlagData = null;

        const DEFAULT_PATHS = {
            angular: 'src/app/core/feature-flags.ts',
            react: 'src/lib/featureFlags.ts',
            java: 'src/main/java/com/lcl/config/FeatureFlags.java',
            python: 'src/config/feature_flags.py'
        };
        
        // État du fichier client

        let clientFileExists = false;

        let existingFlags = [];

        let existingFileContent = '';
        
        // Mettre à jour le chemin par défaut quand on change la stack.
        // Auparavant attaché via un second DOMContentLoaded — maintenant appelé
        // depuis init() pour éviter une race condition avec le bootstrap principal.

        const REPORT_STATUS_META = {
            ROLLOUT:       { label: 'Rollout',       color: '#a78bfa' },
            STABILISATION: { label: 'Stabilisation', color: '#60a5fa' },
            CLEANUP:       { label: 'Cleanup',       color: '#fbbf24' },
            DETTE:         { label: 'Dette',         color: '#fb923c' },
            CRITIQUE:      { label: 'Critique',      color: '#f87171' },
            OPS:           { label: 'Ops',           color: '#94a3b8' }
        };

        const AUDIT_EVENTS_CACHE = {
            byFlag: null,        // Map<flagName, Event[]>  (events triés desc par date)
            total: 0,
            fetchedAt: null,
            error: null
        };

        // Fetch paginé des audit events, filtré sur Operations::FeatureFlag

        let _flagFilter  = '';

        let _flagSortCol = 'age';

        let _flagSortDir = 'desc'; // 'asc' | 'desc'

        // ── Regroupement par famille (clustering souple) ──────────────────

        let _flagFamily  = '';     // famille sélectionnée dans le dropdown ('' = toutes)

        let _flagGrouped = false;  // mode "vue groupée" (accordéon par famille)

        let _familyCache = null;   // résultat de computeFlagGroups, recalculé au load

        let _collapsedFamilies = new Set(); // labels de familles repliées

        // ── Groupes MANUELS (créés par l'équipe) ──────────────────────────
        // Stockage PARTAGÉ = variable de projet GitLab (SALSIFI_FF_GROUPS),
        // lisible/écrivable seulement par les rôles Maintainer. Les autres
        // (403 sur l'API variables) retombent sur localStorage → ils ne voient
        // que LEURS groupes. Solution d'attente avant un vrai back.
        // Chaque groupe : { id, name, flags:[…] } ; un flag peut être dans
        // plusieurs groupes.

        let _manualGroups = [];

        let _groupMode = 'auto';        // 'auto' (familles) | 'manual'

        let _groupsShared = false;      // true = variable projet (Maintainer) ; false = perso

        let _groupsLoaded = false;

        let _groupsSaveTimer = null;

        const FF_GROUPS_VAR = 'SALSIFI_FF_GROUPS';

        const STATUS_ORDER = { CRITIQUE:0, DETTE:1, CLEANUP:2, STABILISATION:3, ROLLOUT:4, OPS:5 };

        // ══════════════════════════════════════════════════════════════════
        // AUTO-GROUPING — clustering par tokens communs (zéro nom hardcodé)
        // Matching SOUPLE : on cherche les sous-séquences de tokens partagées,
        // pas seulement les préfixes. Ex: "enable_blocking_legal_representant"
        // et "enable_legal_representant_profile_100" partagent "legal_representant"
        // même si ce n'est pas en tête de nom.
        // ══════════════════════════════════════════════════════════════════

        // Tokens "vides" qui ne servent pas à identifier une famille

        const _FAMILY_STOPWORDS = new Set(['enable','disable','not','no','is','the','a','to','of','with','on','off','v1','v2','v3']);

        const _FAMILY_GENERIC = new Set(['tile','page','profile','display','redirection','operations','template','mail','last','new','old','default','test','flag','feature','user','users']);

        let _pendingToggle = null; // { flagName, activate, toggleEl }
