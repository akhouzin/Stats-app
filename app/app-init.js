// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════

// Handle QR deep-link: ?add=RestaurantName&url=https://...
// Scanned from the POS tunnel modal — auto-saves the location and connects.
(function handleQRDeepLink() {
  try {
    const params = new URLSearchParams(location.search);
    const name   = params.get('add');
    const url    = params.get('url');
    if (!name || !url) return;
    const list = JSON.parse(localStorage.getItem('cp_locations') || '[]');
    if (!list.some(l => l.url === url)) {
      list.push({ name, url });
      localStorage.setItem('cp_locations', JSON.stringify(list));
    }
    localStorage.setItem('cp_api_url', url);
    history.replaceState({}, '', location.pathname); // clean URL bar
  } catch {}
})();

// On first remote launch (GitHub Pages / APK) with no POS URL saved,
// open the location picker immediately instead of making failing API calls.
if (getApiBase()) {
  loadData();
} else {
  document.getElementById('live-status').textContent = 'Aucun POS configuré';
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
