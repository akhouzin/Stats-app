// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════

// Handle QR deep-link: ?add=RestaurantName&url=https://...
// Scanned from the POS tunnel modal — auto-saves the location and connects.
// Returns whether it actually connected, so the multi-restaurant gate below
// can skip itself: a deep link is already an explicit "use this one" choice.
const _deepLinkConnected = (function handleQRDeepLink() {
  try {
    const params = new URLSearchParams(location.search);
    const name   = params.get('add');
    const url    = params.get('url');
    if (!name || !url) return false;
    const list = JSON.parse(localStorage.getItem('cp_locations') || '[]');
    if (!list.some(l => l.url === url)) {
      list.push({ name, url });
      localStorage.setItem('cp_locations', JSON.stringify(list));
    }
    localStorage.setItem('cp_api_url', url);
    history.replaceState({}, '', location.pathname); // clean URL bar
    return true;
  } catch { return false; }
})();

// Paints the last known identity of the active restaurant synchronously
// (branding.js keeps it in localStorage), so the very first frame already
// shows its name/logo/colors rather than the neutral ERPGEN default.
loadStatsBranding();
// Reads every restaurant's last loaded data back from the device
// (store-db.js) — usually a few tens of ms.
const _hydrated = _storeHydrateFromDisk();
const _savedLocations = (function () {
  try { return JSON.parse(localStorage.getItem('cp_locations') || '[]'); } catch { return []; }
})();

// Opens the active restaurant from its on-device copy when there is one —
// the dashboard is filled at once and refreshed live behind it (amber dot,
// "Mise à jour…") — else falls back to a normal first load with skeletons.
async function _openActiveStore() {
  const myEpoch = _locationEpoch;
  await _hydrated;
  if (myEpoch !== _locationEpoch) return; // user already switched elsewhere
  const snap = _storeSnapshotRestore(getApiBase());
  if (snap) _showRestoredStore(snap);
  else loadData();
}

if (!_deepLinkConnected && _savedLocations.length > 1) {
  // 2+ restaurants saved on this device — always ask which one to use on
  // open rather than silently reusing whatever was last active.
  _showStartupChooser();
} else if (getApiBase()) {
  _openActiveStore();
} else {
  // First remote launch (GitHub Pages / APK) with no POS URL saved yet —
  // open the location picker immediately instead of making failing API calls.
  _showDisconnectedScreen();
  document.addEventListener('DOMContentLoaded', openLocationModal);
}

// ── Pending orders warning (from POS offline queue in shared localStorage) ──
function checkPendingBanner() {
  const banner = document.getElementById('pending-banner');
  if (!banner) return;
  try {
    const pendingOrders  = JSON.parse(localStorage.getItem('cp_pending_orders')  || '[]');
    const pendingCancels = JSON.parse(localStorage.getItem('cp_pending_cancels') || '[]');
    const total = pendingOrders.length + pendingCancels.length;
    if (total > 0) {
      banner.textContent = `⚠ ${total} commande(s) non synchronisée(s) — les stats peuvent être incomplètes`;
      banner.classList.add('visible');
    } else {
      banner.classList.remove('visible');
    }
  } catch(e) {}
}
checkPendingBanner();
window.addEventListener('storage', checkPendingBanner);

// ── Service worker (../sw.js) — instant app shell on the web/PWA build ──
// Skipped in the APK (window.Capacitor: files are already local) and on
// file:// / 127.0.0.1 / localhost (the POS machine itself and development,
// where a cached shell would serve stale code) — there any previously
// registered worker is removed. `?sw=1` forces it on locally for testing.
(function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || typeof window.Capacitor !== 'undefined' || location.protocol === 'file:') return;
  const local = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
  const forced = new URLSearchParams(location.search).get('sw') === '1';
  if (local && !forced) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('[sw] registration failed', e));
  });
})();

window.addEventListener('resize', () => {
  if (chartWeek) chartWeek.resize();
  if (chartMonth) chartMonth.resize();
});
