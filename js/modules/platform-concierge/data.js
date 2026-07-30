/* platform-concierge · data.js — I/O (auth, fetch). */

function gfetch(endpoint, init) { return S.gitlabFetch(AUTH.gitlabUrl, AUTH.token, endpoint, init); }
