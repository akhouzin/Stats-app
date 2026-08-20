// ═══════════════════════════════════════
// LOCAL API — connects to the stats-server (Electron main process)
//
// URL resolution (in priority order):
//   1. localStorage 'cp_api_url'  — set by the location picker (QR scan or manual)
//   2. http://127.0.0.1:3721      — loaded directly on the POS machine
//   3. location.origin            — served by a tunnel host (stats.erpgen.net, etc.)
//   4. null                       — first-run on GitHub Pages / APK: location picker opens
//
// NOTE: Capacitor (Android APK) reports hostname 'localhost' but is NOT the POS
// machine — window.Capacitor is the discriminator.
// Static hosting providers (github.io, etc.) go to case 4, not case 3.
// ═══════════════════════════════════════

const _LOCAL_URL    = 'http://127.0.0.1:3721';
const _STATIC_HOSTS = ['github.io', 'netlify.app', 'vercel.app', 'pages.dev'];
const _isCapacitor  = typeof window !== 'undefined' && typeof window.Capacitor !== 'undefined';
// file:// counts as local — Stats opened directly on the POS machine
const _isLocal      = !_isCapacitor && (location.protocol === 'file:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost');
const _isTunnelHost = !_isCapacitor && !_isLocal && !_STATIC_HOSTS.some(h => location.hostname.endsWith(h));

function getApiBase() {
  try {
    const saved   = localStorage.getItem('cp_api_url');
    if (saved) return saved;
    if (_isLocal) return _LOCAL_URL;
    // origin can be the string "null" on file:// pages — guard against it
    if (_isTunnelHost && location.origin && location.origin !== 'null') return location.origin;
    return null;
  } catch {
    if (_isLocal) return _LOCAL_URL;
    if (_isTunnelHost && location.origin && location.origin !== 'null') return location.origin;
    return null;
  }
}

async function apiGet(path) {
  const r = await fetch(getApiBase() + path);
  if (!r.ok) throw new Error(`API ${r.status}: GET ${path}`);
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch(getApiBase() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`API ${r.status}: POST ${path}`);
  return r.json();
}

async function apiPut(path, body) {
  const r = await fetch(getApiBase() + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`API ${r.status}: PUT ${path}`);
  return r.json();
}

async function apiDelete(path) {
  const r = await fetch(getApiBase() + path, { method: 'DELETE' });
  if (!r.ok) throw new Error(`API ${r.status}: DELETE ${path}`);
  return r.json();
}

// Fast preliminary fetch used before fetchAllOrders() arrives — window is widened
// to [yesterday 00:00, day-after-tomorrow 00:00) rather than literal calendar
// midnight-to-midnight, since the POS's business day (helpers.js:getDayKey(),
// shifted by its day-cycle-start hour) can start up to 23h before or extend up
// to 23h past calendar midnight; this 3-day span safely covers "today"'s real
// business-day boundaries for any cycle hour without needing to know the hour
// ahead of this request. getDayKey() (once the hour has loaded via branding.js)
// buckets this raw set into the correct day client-side, same as History does.
async function fetchTodayOrders() {
  const now  = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
  const to   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString();
  return apiGet(`/api/orders?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

async function fetchAllOrders() {
  return apiGet('/api/orders');
}

async function fetchMarcCategories() {
  return apiGet('/api/marc/categories');
}

async function fetchMarcArticles() {
  return apiGet('/api/marc/articles');
}

async function fetchMarcAchats() {
  return apiGet('/api/marc/achats');
}

async function fetchMarcLinks() {
  return apiGet('/api/marc/links');
}
