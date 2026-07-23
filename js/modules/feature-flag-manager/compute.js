/* feature-flag-manager · compute.js — logique pure : scoring, statuts, familles, helpers. */


        function computeTimelineData() {
            const now = new Date();
            const WEEKS = 8;

            // Bucket boundaries — chaque semaine = [startMs, endMs]
            const buckets = [];
            const labels  = [];
            for (let w = WEEKS - 1; w >= 0; w--) {
                const endMs   = now.getTime() - w * 7 * 86400000;
                const startMs = endMs - 7 * 86400000;
                buckets.push({ startMs, endMs });
                labels.push(w === 0 ? 'S-1' : 'S-' + (w + 1));
            }

            // CRÉATIONS — depuis created_at des flags actifs
            const creates = buckets.map(() => 0);
            currentFlags.forEach(function(f) {
                const t = new Date(f.created_at).getTime();
                buckets.forEach(function(b, i) {
                    if (t >= b.startMs && t < b.endMs) creates[i]++;
                });
            });

            // SUPPRESSIONS — depuis audit events GitLab (si chargés via l'onglet Historique)
            const deletes = buckets.map(() => 0);
            try {
                if (AUDIT_EVENTS_CACHE && AUDIT_EVENTS_CACHE.byFlag) {
                    AUDIT_EVENTS_CACHE.byFlag.forEach(function(list) {
                        list.forEach(function(ev) {
                            const act = classifyAuditAction(ev);
                            if (act.key !== 'delete') return;
                            const t = new Date(ev.created_at).getTime();
                            buckets.forEach(function(b, i) {
                                if (t >= b.startMs && t < b.endMs) deletes[i]++;
                            });
                        });
                    });
                }
            } catch(e) {}

            // Déterminer si on a de vraies données ou seulement du vide
            const totalCreates = creates.reduce(function(a,b){ return a+b; }, 0);
            const totalDeletes = deletes.reduce(function(a,b){ return a+b; }, 0);
            const hasRealData  = totalCreates > 0 || totalDeletes > 0;

            return { labels, creates, deletes, hasRealData, totalCreates, totalDeletes };
        }

        function escapeAttr(v) { return window.Salsifi.escapeAttr(v); }

        // ══════════════════════════════════════════════════════════════════
        // INITIALISATION
        // ══════════════════════════════════════════════════════════════════

        function analyzeProdStatus(flag, now) {
            // 1) En prod ? — présence du scope 'production' dans les strategies
            let inProd = false;
            (flag.strategies || []).forEach(function(s){
                (s.scopes || []).forEach(function(sc){
                    if (sc.environment_scope === PROD_SCOPE) inProd = true;
                });
            });
            if (!inProd) return { inProd: false, prodSinceDays: null, prodSinceEstimated: false };

            // 2) Depuis quand ? — plus ancien audit event mentionnant 'production'
            //    dans son message, en repartant du dernier event qui l'aurait retiré.
            let prodSince = null, estimated = false;
            try {
                const events = AUDIT_EVENTS_CACHE?.byFlag?.get?.(flag.name);
                if (Array.isArray(events) && events.length) {
                    // events triés desc (récent -> ancien). On parcourt du plus récent
                    // au plus ancien et on garde la date de l'event 'prod' la plus
                    // ancienne d'une séquence continue (on s'arrête si un event retire
                    // explicitement la prod).
                    const mentionsProd = (ev) => {
                        const msg = (ev.details && (ev.details.custom_message || ev.details.change || '')) + '';
                        return /\bproduction\b/i.test(msg);
                    };
                    const removesProd = (ev) => {
                        const msg = (ev.details && (ev.details.custom_message || '')) + '';
                        return /\b(removed?|deleted?|disabled?).*production\b/i.test(msg);
                    };
                    // du plus ancien au plus récent
                    const asc = events.slice().reverse();
                    for (const ev of asc) {
                        const t = new Date(ev.created_at);
                        if (isNaN(t)) continue;
                        if (removesProd(ev)) { prodSince = null; continue; } // prod retirée puis re-mise : on repart
                        if (mentionsProd(ev) && !prodSince) { prodSince = t; estimated = true; }
                    }
                }
            } catch { /* audit muet : on laissera prodSince null */ }

            const prodSinceDays = prodSince
                ? Math.floor((now - prodSince) / (1000 * 60 * 60 * 24))
                : null;
            return { inProd: true, prodSinceDays, prodSinceEstimated: estimated };
        }

        // ══════════════════════════════════════════════════════════════════
        // ANALYSE DES FLAGS (selon la doc de Dan)
        // ══════════════════════════════════════════════════════════════════

        function analyzeFlag(flag) {
            const now = new Date();
            const createdAt = new Date(flag.created_at);
            const ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
            const prodStatus = analyzeProdStatus(flag, now);
            
            // Déterminer le rollout percentage
            let rolloutPercent = 0;
            if (flag.strategies && flag.strategies.length > 0) {
                for (const strategy of flag.strategies) {
                    if (strategy.name === 'default' || strategy.name === 'gradualRolloutUserId') {
                        if (strategy.parameters && strategy.parameters.percentage) {
                            rolloutPercent = Math.max(rolloutPercent, parseInt(strategy.parameters.percentage));
                        } else if (strategy.name === 'default') {
                            rolloutPercent = 100;
                        }
                    }
                }
            }
            // `active` est l'interrupteur maître, PAS le % de déploiement : un flag
            // inactif est à 0 %, un flag actif sans stratégie de % est à 100 %, mais
            // un flag actif en rollout progressif garde son pourcentage réel.
            if (!flag.active) {
                rolloutPercent = 0;
            } else if (!flag.strategies || flag.strategies.length === 0) {
                rolloutPercent = 100;
            }

            // Type de flag
            const isOpsFlag = flag.name.startsWith('disable-');

            // Estimation du temps à 100% rollout. Sources, par priorité :
            //   1. Audit events GitLab (préchargés via fetchFeatureFlagAuditEvents) :
            //      on cherche le dernier event qui a fait passer le rollout à 100%.
            //   2. Fallback : `updated_at` du flag. Imparfait — saute si on modifie
            //      la description après le passage à 100% — mais c'est ce qu'on
            //      a sans audit log.
            const updatedAt = new Date(flag.updated_at || flag.created_at);
            let fullRolloutSince = updatedAt;
            try {
                const events = AUDIT_EVENTS_CACHE?.byFlag?.get?.(flag.name);
                if (Array.isArray(events) && events.length > 0) {
                    // Events triés desc par date. On cherche le plus ancien event
                    // postérieur au dernier passage à 100% — concrètement le
                    // premier event chronologique qui a mis le flag à plein.
                    // Heuristique simple : on prend l'event "update" le plus
                    // ancien dans la séquence depuis le dernier "create"/"reset".
                    const updates = events.filter(ev => classifyAuditAction(ev).key === 'update');
                    if (updates.length > 0) {
                        const oldestUpdate = updates[updates.length - 1];
                        const t = new Date(oldestUpdate.created_at);
                        if (!isNaN(t) && t < fullRolloutSince) fullRolloutSince = t;
                    }
                }
            } catch { /* fallback silencieux sur updated_at */ }
            const daysAtFullRollout = rolloutPercent === 100
                ? Math.floor((now - fullRolloutSince) / (1000 * 60 * 60 * 24))
                : 0;

            // ══════════════════════════════════════════════════════════════
            // BASE DE DETTE — depuis quand le flag est-il une dette potentielle ?
            //   La dette technique d'une FF naît quand elle vit EN PROD, pas à sa
            //   création. Beaucoup d'équipes ne sont pas en trunk-based : une FF
            //   peut vivre 80j en intégration/UAT avant la prod — ce n'est PAS de
            //   la dette tant qu'elle n'est pas en prod.
            //   Priorité des sources, de la plus juste à la plus dégradée :
            //     1. prodSinceDays    — durée réelle en production (estimée, audit)
            //     2. daysAtFullRollout— à défaut, durée à 100% MAIS seulement si le
            //                           flag a un scope 'production' (sinon ce 100%
            //                           est en UAT/intégration et n'est PAS de la dette)
            //     3. ageInDays        — uniquement si scope prod sans autre signal
            //   Si le flag n'est PAS en prod du tout : pas de base de dette (null),
            //   il ne pourra pas être classé DETTE/CRITIQUE — quel que soit son âge.
            //   Les seuils DETTE/CRITIQUE se basent sur CETTE valeur, plus sur l'âge
            //   de création. ROLLOUT/STABILISATION restent inchangés.
            let debtDays;
            if (prodStatus.prodSinceDays != null) {
                debtDays = prodStatus.prodSinceDays;          // 1. durée en prod connue
            } else if (prodStatus.inProd) {
                // en prod mais durée inconnue (audit muet) : on estime via le 100%, sinon l'âge
                debtDays = daysAtFullRollout > 0 ? daysAtFullRollout : ageInDays;
            } else {
                debtDays = null;                              // pas en prod → pas de dette
            }

            // ══════════════════════════════════════════════════════════════
            // LOGIQUE DE LA DOC DE DAN
            // ══════════════════════════════════════════════════════════════

            // OPS FLAG - Pas de limite de temps (Section 1)
            // "tant que la dépendance existe"
            if (isOpsFlag) {
                return {
                    ...flag,
                    ageInDays,
                    ...prodStatus,
                    debtDays,
                    rolloutPercent,
                    daysAtFullRollout,
                    status: 'OPS',
                    icon: '⚙️',
                    message: 'Kill switch permanent - OK',
                    action: null,
                    priority: 0,
                    color: 'ops',
                    isOpsFlag: true
                };
            }

            // EN ROLLOUT - Pas encore à 100%
            // "5% → 25% → 50% → 100% (3-7 jours)"
            if (rolloutPercent < 100) {
                return {
                    ...flag,
                    ageInDays,
                    ...prodStatus,
                    debtDays,
                    rolloutPercent,
                    daysAtFullRollout,
                    status: 'ROLLOUT',
                    icon: '🚀',
                    message: `En déploiement (${rolloutPercent}%)`,
                    action: 'Continuer rollout progressif',
                    priority: 0,
                    color: 'rollout',
                    isOpsFlag: false
                };
            }

            // À 100% MAIS < 2 SEMAINES - Stabilisation
            // "2 semaines de stabilité à 100% avant cleanup"
            if (daysAtFullRollout < 14) {
                const remaining = 14 - daysAtFullRollout;
                return {
                    ...flag,
                    ageInDays,
                    ...prodStatus,
                    debtDays,
                    rolloutPercent,
                    daysAtFullRollout,
                    status: 'STABILISATION',
                    icon: '🔄',
                    message: `100% depuis ${daysAtFullRollout}j - Stabilisation`,
                    action: `Attendre encore ${remaining} jours avant cleanup`,
                    priority: 1,
                    color: 'stabilisation',
                    isOpsFlag: false
                };
            }

            // À 100% MAIS PAS EN PROD — équipe non-TBD : flag stabilisé en
            // intégration/UAT, en attente de fenêtre de déploiement prod.
            // Ce n'est PAS de la dette tant que ce n'est pas en prod, quel que
            // soit l'âge. On le signale comme "prêt à promouvoir", pas comme dette.
            if (debtDays == null) {
                return {
                    ...flag,
                    ageInDays,
                    ...prodStatus,
                    debtDays,
                    rolloutPercent,
                    daysAtFullRollout,
                    status: 'STABILISATION',
                    icon: '🟦',
                    message: `100% hors prod (${daysAtFullRollout}j) - en attente de promotion`,
                    action: 'Promouvoir en production ou clôturer si abandonné',
                    priority: 1,
                    color: 'stabilisation',
                    isOpsFlag: false
                };
            }

            // À 100% ET ≥ 2 SEMAINES ET < 1 MOIS - Prêt pour cleanup
            // "OBLIGATOIREMENT supprimé 2 semaines après stabilisation"
            if (debtDays <= 30) {
                return {
                    ...flag,
                    ageInDays,
                    ...prodStatus,
                    debtDays,
                    rolloutPercent,
                    daysAtFullRollout,
                    status: 'CLEANUP',
                    icon: '✅',
                    message: `100% depuis ${daysAtFullRollout}j - Prêt`,
                    action: '⚡ Cleanup MAINTENANT',
                    priority: 2,
                    color: 'cleanup',
                    isOpsFlag: false
                };
            }

            // > 1 MOIS - DETTE TECHNIQUE
            // "UN FLAG QUI RESTE ACTIF > 1 MOIS EST UNE DETTE TECHNIQUE"
            if (debtDays <= 60) {
                return {
                    ...flag,
                    ageInDays,
                    ...prodStatus,
                    debtDays,
                    rolloutPercent,
                    daysAtFullRollout,
                    status: 'DETTE',
                    icon: '⚠️',
                    message: `${debtDays} jours en prod - DETTE TECHNIQUE`,
                    action: 'Justification écrite OU suppression immédiate',
                    priority: 3,
                    color: 'dette',
                    isOpsFlag: false
                };
            }

            // > 2 MOIS - CRITIQUE
            // "FREEZE nouvelles features, on nettoie d'abord"
            return {
                ...flag,
                ageInDays,
                ...prodStatus,
                    debtDays,
                rolloutPercent,
                daysAtFullRollout,
                status: 'CRITIQUE',
                icon: '💀',
                message: `${debtDays} jours en prod - CRITIQUE`,
                action: '🚨 FREEZE features - Cleanup OBLIGATOIRE',
                priority: 4,
                color: 'critical',
                isOpsFlag: false
            };
        }

        // ══════════════════════════════════════════════════════════════════
        // CHARGEMENT DES FLAGS
        // ══════════════════════════════════════════════════════════════════

        function daysAgo(days) {
            const d = new Date();
            d.setDate(d.getDate() - days);
            return d.toISOString();
        }

        function extractFlagsFromContent(content) {
            const flags = [];
            
            // Pattern pour TypeScript/JavaScript : type FeatureFlags = 'flag1' | 'flag2'
            const tsMatch = content.match(/type\s+FeatureFlags\s*=\s*([\s\S]*?);/);
            if (tsMatch) {
                const matches = tsMatch[1].match(/'([^']+)'/g);
                if (matches) {
                    matches.forEach(m => flags.push(m.replace(/'/g, '')));
                }
            }
            
            // Pattern pour Java : enum avec valeurs
            const javaMatch = content.match(/enum\s+FeatureFlags\s*\{([\s\S]*?)\}/);
            if (javaMatch) {
                const matches = javaMatch[1].match(/(\w+)\s*\(/g);
                if (matches) {
                    matches.forEach(m => flags.push(m.replace(/\s*\(/, '')));
                }
            }
            
            // Pattern pour Python : liste ou enum
            const pyMatch = content.match(/FEATURE_FLAGS\s*=\s*\[([\s\S]*?)\]/);
            if (pyMatch) {
                const matches = pyMatch[1].match(/'([^']+)'/g);
                if (matches) {
                    matches.forEach(m => flags.push(m.replace(/'/g, '')));
                }
            }
            
            return flags;
        }
        
        // Générer le contenu complet du fichier client (premier flag)

        function generateFullClientFile(stack, flagName, projectPath) {
            const unleashUrl = `${GITLAB_URL}/api/v4/feature_flags/unleash/${projectId}`;
            
            if (stack === 'angular' || stack === 'react') {
                return `// ═══════════════════════════════════════════════════════════════
// Feature Flags Client - AUTO-GENERATED by DevOps Hub
// Dernière mise à jour: ${new Date().toISOString().split('T')[0]}
// ═══════════════════════════════════════════════════════════════

import { UnleashClient } from 'unleash-proxy-client';

// Configuration Unleash (GitLab Feature Flags)
const unleash = new UnleashClient({
    url: '${unleashUrl}',
    clientKey: process.env.GITLAB_FF_INSTANCE_ID || 'YOUR_INSTANCE_ID',
    appName: '${projectPath || 'my-app'}',
    environment: process.env.NODE_ENV || 'development',
    refreshInterval: 120, // Rafraîchit toutes les 120 secondes
});

// Démarrer le client
unleash.start();

// ═══════════════════════════════════════════════════════════════
// TYPES DES FEATURE FLAGS
// Mis à jour automatiquement par le DevOps Hub
// ═══════════════════════════════════════════════════════════════
type FeatureFlags =
    | '${flagName}';

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Vérifie si un feature flag est activé
 * @param flagName - Le nom du flag à vérifier
 * @returns true si le flag est activé, false sinon
 */
export const isFeatureEnabled = (flagName: FeatureFlags): boolean => {
    return unleash.isEnabled(flagName);
};

/**
 * Vérifie si un feature flag est activé (avec contexte utilisateur)
 * @param flagName - Le nom du flag à vérifier
 * @param userId - L'ID de l'utilisateur pour le ciblage
 * @returns true si le flag est activé pour cet utilisateur
 */
export const isFeatureEnabledForUser = (flagName: FeatureFlags, userId: string): boolean => {
    return unleash.isEnabled(flagName, { userId });
};

// Event listeners pour le debug
unleash.on('ready', () => {
    console.log('✅ Feature Flags client prêt');
});

unleash.on('error', (error: Error) => {
    console.error('❌ Feature Flags erreur:', error);
});

unleash.on('update', () => {
    console.log('🔄 Feature Flags mis à jour');
});

export default unleash;

// ═══════════════════════════════════════════════════════════════
// EXEMPLE D'UTILISATION
// ═══════════════════════════════════════════════════════════════
/*
import { isFeatureEnabled } from './feature-flags';

if (isFeatureEnabled('${flagName}')) {
    // Nouveau comportement
} else {
    // Ancien comportement
}
*/
`;
            } else if (stack === 'java') {
                const className = flagName.split('-').map((w, i) => 
                    i === 0 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
                ).join('_').toUpperCase();
                
                return `package com.lcl.config;

// ═══════════════════════════════════════════════════════════════
// Feature Flags - AUTO-GENERATED by DevOps Hub
// Dernière mise à jour: ${new Date().toISOString().split('T')[0]}
// ═══════════════════════════════════════════════════════════════

import io.getunleash.Unleash;
import io.getunleash.UnleashContext;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Enum des Feature Flags disponibles.
 * Mis à jour automatiquement par le DevOps Hub.
 */
public enum FeatureFlags {
    ${className}("${flagName}");

    private final String key;

    FeatureFlags(String key) {
        this.key = key;
    }

    public String getKey() {
        return key;
    }
}

/**
 * Service pour vérifier les Feature Flags.
 */
@Component
class FeatureFlagService {

    @Autowired
    private Unleash unleash;

    /**
     * Vérifie si un feature flag est activé.
     */
    public boolean isEnabled(FeatureFlags flag) {
        return unleash.isEnabled(flag.getKey());
    }

    /**
     * Vérifie si un feature flag est activé pour un utilisateur.
     */
    public boolean isEnabledForUser(FeatureFlags flag, String userId) {
        UnleashContext context = UnleashContext.builder()
            .userId(userId)
            .build();
        return unleash.isEnabled(flag.getKey(), context);
    }
}

// ═══════════════════════════════════════════════════════════════
// EXEMPLE D'UTILISATION
// ═══════════════════════════════════════════════════════════════
/*
@Autowired
private FeatureFlagService featureFlags;

if (featureFlags.isEnabled(FeatureFlags.${className})) {
    // Nouveau comportement
} else {
    // Ancien comportement
}
*/
`;
            } else if (stack === 'python') {
                return `# ═══════════════════════════════════════════════════════════════
# Feature Flags Client - AUTO-GENERATED by DevOps Hub
# Dernière mise à jour: ${new Date().toISOString().split('T')[0]}
# ═══════════════════════════════════════════════════════════════

import os
from UnleashClient import UnleashClient
from typing import Literal

# Configuration Unleash (GitLab Feature Flags)
unleash_client = UnleashClient(
    url="${unleashUrl}",
    app_name="${projectPath || 'my-app'}",
    instance_id=os.environ.get('GITLAB_FF_INSTANCE_ID', 'YOUR_INSTANCE_ID'),
    refresh_interval=120,
)

# Démarrer le client
unleash_client.initialize_client()

# ═══════════════════════════════════════════════════════════════
# TYPES DES FEATURE FLAGS
# Mis à jour automatiquement par le DevOps Hub
# ═══════════════════════════════════════════════════════════════
FeatureFlags = Literal[
    '${flagName}',
]

FEATURE_FLAGS = [
    '${flagName}',
]

# ═══════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════

def is_feature_enabled(flag_name: FeatureFlags) -> bool:
    """Vérifie si un feature flag est activé."""
    return unleash_client.is_enabled(flag_name)


def is_feature_enabled_for_user(flag_name: FeatureFlags, user_id: str) -> bool:
    """Vérifie si un feature flag est activé pour un utilisateur."""
    context = {'userId': user_id}
    return unleash_client.is_enabled(flag_name, context)


# ═══════════════════════════════════════════════════════════════
# EXEMPLE D'UTILISATION
# ═══════════════════════════════════════════════════════════════
# from config.feature_flags import is_feature_enabled
#
# if is_feature_enabled('${flagName}'):
#     # Nouveau comportement
# else:
#     # Ancien comportement
`;
            }
            
            return '';
        }
        
        // Mettre à jour le fichier existant avec le nouveau flag

        function updateExistingClientFile(content, stack, newFlagName) {
            if (stack === 'angular' || stack === 'react') {
                // Ajouter le nouveau flag au type FeatureFlags
                const typeRegex = /(type\s+FeatureFlags\s*=[\s\S]*?)(\s*;)/;
                const match = content.match(typeRegex);
                if (match) {
                    const newType = match[1] + `\n    | '${newFlagName}'` + match[2];
                    content = content.replace(typeRegex, newType);
                }
                
                // Mettre à jour la date
                content = content.replace(
                    /Dernière mise à jour: \d{4}-\d{2}-\d{2}/,
                    `Dernière mise à jour: ${new Date().toISOString().split('T')[0]}`
                );
                
            } else if (stack === 'java') {
                // Ajouter le nouveau flag à l'enum
                const enumName = newFlagName.split('-').map((w, i) => 
                    i === 0 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
                ).join('_').toUpperCase();
                
                const enumRegex = /(public enum FeatureFlags \{[\s\S]*?)(\s*;[\s\S]*?private final String key)/;
                const match = content.match(enumRegex);
                if (match) {
                    const newEnum = match[1] + `,\n    ${enumName}("${newFlagName}")` + match[2];
                    content = content.replace(enumRegex, newEnum);
                }
                
            } else if (stack === 'python') {
                // Ajouter au Literal
                const literalRegex = /(FeatureFlags = Literal\[[\s\S]*?)(\s*\])/;
                const match = content.match(literalRegex);
                if (match) {
                    const newLiteral = match[1] + `\n    '${newFlagName}',` + match[2];
                    content = content.replace(literalRegex, newLiteral);
                }
                
                // Ajouter à la liste
                const listRegex = /(FEATURE_FLAGS = \[[\s\S]*?)(\s*\])/;
                const listMatch = content.match(listRegex);
                if (listMatch) {
                    const newList = listMatch[1] + `\n    '${newFlagName}',` + listMatch[2];
                    content = content.replace(listRegex, newList);
                }
            }
            
            return content;
        }
        
        // Créer une MR avec le fichier mis à jour

        function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }

        // ══════════════════════════════════════════════════════════════════
        // RAPPORT HTML PAR ENVIRONNEMENT
        // Génère un document HTML autonome listant tous les flags, groupés par
        // environnement (production, staging, *…), pour sortir p.ex. « toutes
        // les FF en prod » en un clic.
        // ══════════════════════════════════════════════════════════════════

        // Environnements d'un flag = ensemble des environment_scope de ses stratégies.

        function flagEnvironments(flag) {
            const envs = new Set();
            (flag.strategies || []).forEach(function (s) {
                (s.scopes || []).forEach(function (sc) {
                    if (sc && sc.environment_scope) envs.add(sc.environment_scope);
                });
            });
            return envs.size ? Array.from(envs) : ['(non scopé)'];
        }

        // Rollout réellement appliqué dans un environnement donné (les stratégies
        // ciblant cet env, ou '*'). Master switch `active` prioritaire.

        function flagRolloutInEnv(flag, env) {
            if (!flag.active) return 0;
            const strats = (flag.strategies || []).filter(function (s) {
                return (s.scopes || []).some(function (sc) {
                    return sc.environment_scope === env || sc.environment_scope === '*';
                });
            });
            if (!strats.length) return flag.rolloutPercent != null ? flag.rolloutPercent : 100;
            let pct = 0;
            strats.forEach(function (s) {
                if (s.parameters && s.parameters.percentage != null) {
                    pct = Math.max(pct, parseInt(s.parameters.percentage, 10) || 0);
                } else if (s.name === 'default') {
                    pct = Math.max(pct, 100);
                }
            });
            return pct;
        }

        // Ordre d'affichage des environnements : prod d'abord, puis '*', puis un
        // ordre métier connu, puis alphabétique, « (non scopé) » en dernier.

        function sortEnvNames(names) {
            const RANK = { 'production': 0, 'prod': 0, '*': 1, 'staging': 3, 'preprod': 4,
                'pre-production': 4, 'uat': 5, 'recette': 5, 'integration': 6, 'qa': 6,
                'development': 8, 'dev': 8, 'test': 9 };
            return names.slice().sort(function (a, b) {
                const ra = a === '(non scopé)' ? 99 : (RANK[a] != null ? RANK[a] : 20);
                const rb = b === '(non scopé)' ? 99 : (RANK[b] != null ? RANK[b] : 20);
                if (ra !== rb) return ra - rb;
                return a.localeCompare(b);
            });
        }

        function groupAuditEventsByFlag(events) {
            const map = new Map();
            events.forEach(ev => {
                const name = ev.details && ev.details.target_details;
                if (!name) return;
                if (!map.has(name)) map.set(name, []);
                map.get(name).push(ev);
            });
            map.forEach(list => list.sort((a, b) =>
                new Date(b.created_at) - new Date(a.created_at)
            ));
            return map;
        }

        function extractEnvironmentsFromFlag(flag) {
            const scopes = new Set();
            (flag.strategies || []).forEach(s => {
                (s.scopes || []).forEach(sc => {
                    if (sc && sc.environment_scope) scopes.add(sc.environment_scope);
                });
            });
            return Array.from(scopes);
        }

        function envBadgeClass(env) {
            const e = (env || '').toLowerCase().trim();
            // Mapping explicite LCL (ordre du plus "live" au plus tech)
            if (e === 'production' || e === 'prod')      return 'prod';
            if (e === 'pilote'     || e === 'pilot')     return 'pilote';
            if (e === 'uat')                              return 'uat';
            if (e === 'master')                           return 'master';
            if (e === 'demo')                             return 'demo';
            if (e === 'integration' || e === 'integ')     return 'integration';
            if (e === '*' || e === 'all')                 return 'all';
            // Fallbacks historiques (autres projets GitLab qu'on pourrait croiser)
            if (e.includes('prod'))                       return 'prod';
            if (e.includes('stag') || e === 'preprod')    return 'staging';
            if (e.includes('dev')  || e.includes('test')) return 'dev';
            return '';
        }

        function classifyAuditAction(ev) {
            const raw = (ev && ev.details && (ev.details.custom_message || ev.details.change || '')) || '';
            const m = raw.toLowerCase();
            if (m.includes('created')   || m.includes('créé'))      return { key: 'create',  emoji: '➕', label: 'Création' };
            if (m.includes('destroyed') || m.includes('deleted')
                || m.includes('supprim'))                           return { key: 'delete',  emoji: '🗑️', label: 'Suppression' };
            if (m.includes('enabled')   || m.includes('activ'))     return { key: 'enable',  emoji: '🟢', label: 'Activation' };
            if (m.includes('disabled')  || m.includes('désactiv'))  return { key: 'disable', emoji: '🟡', label: 'Désactivation' };
            return { key: 'update', emoji: '✏️', label: 'Modification' };
        }

        function formatDateTime(iso) {
            try {
                const d = new Date(iso);
                if (isNaN(d.getTime())) return String(iso || '');
                return d.toLocaleString('fr-FR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
            } catch { return String(iso || ''); }
        }
        


        // ══════════════════════════════════════════════════════════════════
        // SCORE SANTÉ HISTORIQUE
        // ══════════════════════════════════════════════════════════════════

        function computeHealthTrend(history) {
            if (history.length < 2) return null;
            var now = Date.now();
            var week7 = now - 7 * 24 * 3600000;
            // Score actuel (dernier point)
            var current = history[history.length - 1].s;
            // Score il y a 7 jours (premier point >= 7j ago)
            var old7 = null;
            for (var i = 0; i < history.length; i++) {
                if (history[i].t >= week7) { break; }
                old7 = history[i].s;
            }
            if (old7 === null && history.length > 1) old7 = history[0].s;
            return old7 !== null ? current - old7 : null;
        }

        function _newGroupId() { return 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

        function _parseGroups(str) {
            try {
                const p = JSON.parse(str);
                return Array.isArray(p) ? p.filter(g => g && g.name && Array.isArray(g.flags)) : [];
            } catch { return []; }
        }

        function tokenizeFlag(name) {
            return String(name || '')
                .toLowerCase()
                .split(/[_\-\s]+/)
                .filter(Boolean);
        }

        // Tokens significatifs : on retire les mots-outils (enable/disable/...) AVANT
        // de chercher les racines, sinon "enable_legal_representant" (3 tokens) bat
        // "legal_representant" (2 tokens) au tri "plus spécifique" et casse le regroupement.

        function meaningfulTokens(name) {
            return tokenizeFlag(name).filter(t => !_FAMILY_STOPWORDS.has(t));
        }

        // Toutes les sous-séquences CONTIGUËS de tokens (n-grammes), longueur >= minLen

        function tokenNgrams(tokens, minLen) {
            const out = [];
            const n = tokens.length;
            for (let len = Math.min(n, 5); len >= minLen; len--) {
                for (let i = 0; i + len <= n; i++) {
                    out.push(tokens.slice(i, i + len).join(' '));
                }
            }
            return out;
        }

        function prettyFamilyLabel(key) {
            return key.split(' ').join('_');
        }

        // Renvoie [{ label, key, flags:[...] }, ...] trié par taille décroissante.
        // minGroupSize : nb mini de flags pour former une famille (défaut 2)
        // minTokens    : longueur mini d'un n-gramme pour être une racine (défaut 2)
        // Mots mono-token trop génériques pour être une racine de famille à eux seuls.
        // (on les autorise seulement dans une racine de >= 2 tokens)

        function computeFlagGroups(flags, opts) {
            opts = opts || {};
            const minGroupSize = opts.minGroupSize || 2;
            const minTokens    = opts.minTokens    || 1;  // 1 token OK si distinctif

            // Une racine mono-token n'est valable que si elle est distinctive :
            // au moins 4 caractères ET pas dans la liste des mots génériques.
            function rootIsValid(key) {
                const toks = key.split(' ');
                if (toks.length >= 2) return true;
                const t = toks[0];
                return t.length >= 4 && !_FAMILY_GENERIC.has(t);
            }

            // 1) index : ngram -> set de noms de flags qui le contiennent
            const byNgram = new Map(); // key -> { tokens:int, names:Set }
            const flagTokens = new Map();
            flags.forEach(f => {
                const toks = meaningfulTokens(f.name);
                flagTokens.set(f.name, toks);
                const seen = new Set(); // un ngram compté 1x par flag même s'il apparait 2x
                tokenNgrams(toks, minTokens).forEach(ng => {
                    if (seen.has(ng)) return;
                    seen.add(ng);
                    if (!byNgram.has(ng)) byNgram.set(ng, { tokens: ng.split(' ').length, names: new Set() });
                    byNgram.get(ng).names.add(f.name);
                });
            });

            // 2) candidats : ngrams partagés par >= minGroupSize flags ET racine valide
            let candidates = [...byNgram.entries()]
                .filter(([key, v]) => v.names.size >= minGroupSize && rootIsValid(key))
                .map(([key, v]) => ({ key, tokens: v.tokens, names: v.names }));

            // 3) on classe les racines par SCORE DE COUVERTURE = membres × longueur.
            //    Une racine courte qui ratisse large (ex: "predica", 3 flags) peut ainsi
            //    battre une racine longue qui n'en capte que 2 ("predica product tile").
            //    À score égal, on préfère la racine la plus spécifique (plus de tokens),
            //    puis le plus de membres, puis l'ordre alpha (déterminisme).
            candidates.sort((a, b) => {
                const sa = a.names.size * a.tokens;
                const sb = b.names.size * b.tokens;
                return (sb - sa) || (b.tokens - a.tokens) || (b.names.size - a.names.size) || a.key.localeCompare(b.key);
            });

            // 4) assignation gloutonne : chaque flag rejoint sa racine la plus spécifique
            const byName = new Map(flags.map(f => [f.name, f]));
            const assigned = new Set();
            const groups = [];
            candidates.forEach(c => {
                const members = [...c.names].filter(n => !assigned.has(n));
                if (members.length >= minGroupSize) {
                    members.forEach(n => assigned.add(n));
                    groups.push({
                        label: prettyFamilyLabel(c.key),
                        key: c.key,
                        flags: members.map(n => byName.get(n)).filter(Boolean)
                    });
                }
            });

            // 5) DEUXIÈME PASSAGE — rattachement des orphelins.
            //    Un flag isolé peut partager une racine (>= minTokens tokens) avec une
            //    famille existante sans avoir été capté par la racine la plus dense.
            //    Ex : "blocking_legal_representant" partage "legal_representant" avec la
            //    famille "legal_representant_profile" -> on le rattache.
            //    On rattache au meilleur match (racine commune la plus longue).
            let orphans = flags.filter(f => !assigned.has(f.name));
            orphans.forEach(f => {
                const fToks = new Set(meaningfulTokens(f.name));
                let best = null, bestOverlap = 0;
                groups.forEach(g => {
                    const gToks = g.key.split(' ');
                    // tokens de la racine de la famille présents dans le flag
                    const common = gToks.filter(t => fToks.has(t));
                    let overlap = common.length;
                    // un overlap d'1 seul token doit être distinctif (>=4 car, non générique)
                    if (overlap === 1 && !rootIsValid(common[0])) overlap = 0;
                    if (overlap >= 1 && overlap > bestOverlap) {
                        bestOverlap = overlap; best = g;
                    }
                });
                if (best) { best.flags.push(byName.get(f.name)); assigned.add(f.name); }
            });

            // 6) orphelins restants
            orphans = flags.filter(f => !assigned.has(f.name));
            if (orphans.length) {
                groups.push({ label: '∅ Isolés', key: '__orphans__', flags: orphans });
            }

            // les labels de famille reflètent la racine commune ; on garde le label
            // de la racine d'origine (le plus parlant) même après rattachement.

            // tri d'affichage : grosses familles d'abord, orphelins toujours en dernier
            groups.sort((a, b) => {
                if (a.key === '__orphans__') return 1;
                if (b.key === '__orphans__') return -1;
                return b.flags.length - a.flags.length || a.label.localeCompare(b.label);
            });

            return groups;
        }

        // Retourne (et met en cache) les familles pour le set courant de flags

        function getFlagFamilies() {
            if (!_familyCache) _familyCache = computeFlagGroups(currentFlags);
            return _familyCache;
        }

        // Map nom de flag -> label de famille (pour filtrer en mode plat)

        function familyOfFlag(name) {
            const fams = getFlagFamilies();
            for (const g of fams) {
                if (g.flags.some(f => f.name === name)) return g.label;
            }
            return '∅ Isolés';
        }

        // Remplit le <select id="family-filter"> avec les familles détectées

        function _grpById(id) { return _manualGroups.find(g => g.id === id); }

        function _grpStatusColor(status) {
            return { ROLLOUT:'#a78bfa', STABILISATION:'#60a5fa', CLEANUP:'#34d399',
                     DETTE:'#fbbf24', CRITIQUE:'#f87171', OPS:'#6b7280' }[status] || '#6b7280';
        }

        function hasProdScope(flag) {
            const scopes = (flag.strategies || []).flatMap(s => s.scopes || []);
            return scopes.some(s => s.environment_scope === 'production' || s.environment_scope === 'prod' || s.environment_scope === '*');
        }
