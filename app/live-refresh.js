// ═══════════════════════════════════════
// LIVE REFRESH — owns every "fetch the active POS's new data" trigger, so
// what's on screen keeps up with the till without reloading the app:
//
//   • a tick every QUICK_REFRESH_MS while visible — a `quick` load (last few
//     hours of orders + cancellations, a few KB) and a deeper incremental
//     load once AUTO_REFRESH_MS has passed (data-loader.js:loadData());
//   • an immediate refresh whenever the app comes back to the foreground —
//     visibilitychange alone isn't reliable on phones, so also the Capacitor
//     `resume` event (Android APK), bfcache `pageshow`, window focus and
//     `online` (network back);
//   • pull-to-refresh at the top of the page, and a tap on the topbar status.
//
// New sales briefly highlight the Commandes KPIs (_onLiveDataChanged()).
// ═══════════════════════════════════════

const QUICK_REFRESH_MS = 15000;

function _autoRefreshAllowed() {
  if (document.hidden || !getApiBase()) return false;
  // The startup chooser is up: nothing is on screen to refresh yet.
  return !(typeof _isChoosingStore === 'function' && _isChoosingStore());
}

function _liveTick() {
  if (!_autoRefreshAllowed()) return;
  if (!historyLoaded) { loadData(); return; } // first load failed or still pending — retry it
  const deepDue = Date.now() - _lastDeepLoadAt >= AUTO_REFRESH_MS;
  loadData(null, { quick: !deepDue });
}
setInterval(_liveTick, QUICK_REFRESH_MS);

// Explicit / resume refresh. Shows the amber "Mise à jour…" state when what's
// on screen is more than a couple of minutes old, plus the topbar sync dot.
function refreshNow() {
  if (!getApiBase() || (typeof _isChoosingStore === 'function' && _isChoosingStore())) return Promise.resolve();
  const myEpoch = _locationEpoch;
  if (historyLoaded && Date.now() - _lastLoadOkAt > 2 * AUTO_REFRESH_MS) _setLiveStatus('refreshing');
  _locSyncStart(myEpoch);
  return loadData().finally(() => _locSyncEnd(myEpoch));
}

function _onAppResume() {
  if (document.hidden) return;
  if (Date.now() - _lastLoadOkAt < 5000) return; // just refreshed — several of these fire together
  refreshNow();
}
document.addEventListener('visibilitychange', _onAppResume);
document.addEventListener('resume', _onAppResume); // Capacitor native bridge (APK)
window.addEventListener('pageshow', e => { if (e.persisted) _onAppResume(); });
window.addEventListener('focus', _onAppResume);
window.addEventListener('online', _onAppResume);

// ── New-sale highlight ──
let _kpiSeen = { epoch: -1, orders: null };
function _onLiveDataChanged() {
  const el = document.getElementById('t-orders');
  const v = el ? el.textContent : null;
  // Only a change on the SAME restaurant counts — not a switch or first load.
  if (_kpiSeen.epoch === _locationEpoch && _kpiSeen.orders !== null && v !== _kpiSeen.orders) {
    ['t-orders', 't-revenue', 't-avg', 't-items'].forEach(id => {
      const card = document.getElementById(id)?.closest('.kpi');
      if (!card) return;
      card.classList.remove('kpi-bump');
      void card.offsetWidth; // restart the animation
      card.classList.add('kpi-bump');
    });
  }
  _kpiSeen = { epoch: _locationEpoch, orders: v };
  if (typeof _kdRefresh === 'function') _kdRefresh(); // an open stat-card detail panel follows the new data
}

// ── Tap the topbar status → refresh now ──
document.addEventListener('DOMContentLoaded', () => {
  const t = document.querySelector('.topbar-time');
  if (!t) return;
  t.title = 'Actualiser';
  t.style.cursor = 'pointer';
  t.addEventListener('click', () => { t.classList.add('is-tapped'); refreshNow().finally(() => t.classList.remove('is-tapped')); });
});

// ── Pull-to-refresh ──
// Vertical drag down from the very top of the dashboard. Coexists with
// page-nav.js's horizontal swipe (only a mostly-vertical drag counts) and
// ignores drags that start inside a scrolled list, a modal or the store sheet.
// stats.css sets `overscroll-behavior-y: contain` so the browser's own
// pull-to-reload (a full page reload) doesn't fire on top of this one.
(function setupPullToRefresh() {
  const PULL_TRIGGER = 64, PULL_MAX = 96;
  let startX = 0, startY = 0, pulling = false, armed = false, pull = 0, busy = false;
  let ind = null;

  function indicator() {
    if (ind) return ind;
    ind = document.createElement('div');
    ind.className = 'ptr';
    ind.innerHTML = '<span class="ptr-icon">↓</span>';
    document.body.appendChild(ind);
    return ind;
  }
  function blocked(target) {
    if (busy || window.scrollY > 0) return true;
    const wrap = document.getElementById('pages-wrap');
    if (!wrap || wrap.style.display === 'none' || !wrap.contains(target)) return true;
    if (document.querySelector('.loc-modal.loc-modal-open, .store-sheet.store-sheet-open')) return true;
    for (let el = target; el && el !== wrap; el = el.parentElement) {
      if (el.scrollTop > 0) return true; // inside a list that isn't at its own top
    }
    return false;
  }
  function render() {
    const el = indicator();
    el.style.transform = `translate(-50%, ${pull - 44}px)`;
    el.style.opacity = String(Math.min(1, pull / PULL_TRIGGER));
    el.classList.toggle('ptr-ready', pull >= PULL_TRIGGER);
  }
  function reset() {
    pull = 0;
    if (!ind) return;
    ind.classList.add('ptr-settle');
    ind.style.transform = 'translate(-50%, -44px)';
    ind.style.opacity = '0';
    setTimeout(() => ind && ind.classList.remove('ptr-settle', 'ptr-ready', 'ptr-busy'), 250);
  }

  document.addEventListener('touchstart', e => {
    pulling = false; armed = false;
    if (e.touches.length !== 1 || blocked(e.target)) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    armed = true;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!armed) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!pulling) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (dy <= 0 || Math.abs(dx) * 1.5 > dy) { armed = false; return; } // horizontal swipe or scroll up
      pulling = true;
    }
    pull = Math.min(PULL_MAX, Math.max(0, dy * 0.5));
    render();
  }, { passive: true });

  function end() {
    if (!pulling) { armed = false; return; }
    pulling = false; armed = false;
    if (pull < PULL_TRIGGER) { reset(); return; }
    busy = true;
    indicator().classList.add('ptr-busy');
    pull = PULL_TRIGGER; render();
    refreshNow().finally(() => { busy = false; reset(); });
  }
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
})();
