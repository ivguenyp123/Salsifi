/* livraison · state.js — état & config partagés (chargé en 1er). */

'use strict';

  const HUB_URL = 'hub.html';
  let GITLAB_URL = null, TOKEN = null, PROJECT_ID = null, PROJECT_PATH = '', USERNAME = '', DEFAULT_BRANCH = 'main';
  let mrList = [], selected = null, authorFilter = '', busy = false;
  // Tranche 2 — préparation : bump IMAGE_TAG + sync overlays + création de MR.
  let branches = [], prepBranch = '', prepBumpType = 'minor', prepCurTag = '';
  // Tranche 3 — suivi du train de pipeline + logs.
  let pipeId = null, pipeTimer = null, logTimer = null, curJobId = null, autoScroll = true;
  const IMAGE_TAG_RX = /^(\s*IMAGE_TAG:\s*)(["']?)([^"'\n]+)(["']?)(\s*)$/m;
  const KUSTO_RX = /(^|\/)kustomization\.ya?ml$/i;

  const PIPE_ICON = { success: '✅', running: '🔄', pending: '⏳', created: '⏳', failed: '❌', canceled: '⏹️', skipped: '⏭️', manual: '👆' };
