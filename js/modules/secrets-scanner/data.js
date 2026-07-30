/* secrets-scanner · data.js — I/O (auth, fetch). */

async function rawFetch(url, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      apiCalls++;
      const r = await fetch(url, { headers: { 'PRIVATE-TOKEN': token } });
      if (r.status === 401) { localStorage.removeItem('devops_hub_workspaces'); window.location.href = 'login.html'; return null; }
      if (r.status === 429 || r.status >= 500) {
        if (r.status === 429) throttles++;
        const ra = parseInt(r.headers.get('Retry-After')) || Math.min(30, Math.pow(2, i + 1));
        await sleep(ra * 1000);
        continue;
      }
      return r;
    } catch {
      await sleep(Math.min(15, Math.pow(2, i + 1)) * 1000);
    }
  }
  return null;
}

async function fetchGL(ep) {
  const r = await rawFetch(`${GITLAB_URL}/api/v4${ep}`);
  if (!r || !r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

async function fetchGLStatus(ep) {
  const url = `${GITLAB_URL}/api/v4${ep}`;
  for (let i = 0; i < 4; i++) {
    try {
      apiCalls++;
      const r = await fetch(url, { headers: { 'PRIVATE-TOKEN': token } });
      if (r.status === 401) { localStorage.removeItem('devops_hub_workspaces'); window.location.href = 'login.html'; return { status: 401, data: null }; }
      if (r.status === 429 || r.status >= 500) {
        if (r.status === 429) throttles++;
        const ra = parseInt(r.headers.get('Retry-After')) || Math.min(30, Math.pow(2, i + 1));
        await sleep(ra * 1000); continue;
      }
      let data = null; try { data = await r.json(); } catch {}
      return { status: r.status, data };
    } catch { await sleep(Math.min(15, Math.pow(2, i + 1)) * 1000); }
  }
  return { status: 0, data: null };
}

