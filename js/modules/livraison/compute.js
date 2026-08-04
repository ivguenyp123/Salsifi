/* livraison · compute.js — helpers purs (format, versions, statuts) (chargé en 3e). */

'use strict';

  const esc = (v) => (window.Salsifi && window.Salsifi.escapeHtml) ? window.Salsifi.escapeHtml(v) : String(v == null ? '' : v);
  const initials = (n) => (n || '?').split(/[\s_.@-]/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?';
  const timeAgo = (iso) => {
    if (!iso) return '';
    const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return s + ' s'; if (s < 3600) return Math.round(s / 60) + ' min';
    if (s < 86400) return Math.round(s / 3600) + ' h'; return Math.round(s / 86400) + ' j';
  };

  function aiUrl() { return (localStorage.getItem('mr_reviewer_api_url') || window.MR_REVIEWER_API_URL || '').trim(); }

  function bumpVer(v, type) {
    const m = (v || '').match(/^(\d+)\.(\d+)\.(\d+)/); if (!m) return '';
    let a = +m[1], b = +m[2], c = +m[3];
    if (type === 'major') { a++; b = 0; c = 0; } else if (type === 'minor') { b++; c = 0; } else c++;
    return a + '.' + b + '.' + c;
  }
  function prepTarget() { return bumpVer(prepCurTag, prepBumpType); }
  function stageStatus(jobs) {
    if (jobs.some(j => j.status === 'failed')) return 'failed';
    if (jobs.some(j => j.status === 'running')) return 'running';
    if (jobs.length && jobs.every(j => ['success', 'skipped', 'manual'].includes(j.status))) return 'success';
    return 'pending';
  }
  function fmtDur(s) { if (!s) return ''; if (s < 60) return Math.round(s) + 's'; return Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's'; }

  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
