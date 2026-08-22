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

loadStatsBranding();
const _savedLocations = (function () {
  try { return JSON.parse(localStorage.getItem('cp_locations') || '[]'); } catch { return []; }
})();
if (!_deepLinkConnected && _savedLocations.length > 1) {
  // 2+ restaurants saved on this device — always ask which one to use on
  // open rather than silently reusing whatever was last active.
  _showStartupChooser();
} else if (getApiBase()) {
  loadData();
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

window.addEventListener('resize', () => {
  if (chartWeek) chartWeek.resize();
  if (chartMonth) chartMonth.resize();
});
