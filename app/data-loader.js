// ═══════════════════════════════════════
// LOAD DATA
// ═══════════════════════════════════════
async function loadLocalData() {
  const [restocks, salStaff, salDays, menuData, charges, chargeDays, marcCats, marcArts, marcAchats, marcLinks] = await Promise.all([
    apiGet('/api/restocks'),
    apiGet('/api/sal/staff'),
    apiGet('/api/sal/days'),
    apiGet('/api/menu-items'),
    apiGet('/api/rec/charges'),
    apiGet('/api/rec/charge-days'),
    fetchMarcCategories(),
    fetchMarcArticles(),
    fetchMarcAchats(),
    fetchMarcLinks(),
  ]);
  _marcCategories = marcCats;
  _marcArticles   = marcArts;
  _marcAchats     = marcAchats;
  _marcLinks      = marcLinks;
  _restocks = {};
  restocks.forEach(r => {
    if (!_restocks[r.key]) _restocks[r.key] = [];
    _restocks[r.key].push({ id: r.id, date: r.date, amount: r.amount, price: r.price_per_unit || null });
  });
  _salStaff = salStaff;
  _salDays = {};
  salDays.forEach(d => {
    if (!_salDays[d.staff_id]) _salDays[d.staff_id] = {};
    _salDays[d.staff_id][d.day_key] = d.status;
  });
  if (menuData.length > 0)
    menuItems = menuData.map(i => ({ id: i.id, name: i.name, cat: i.cat, price: i.price }));
  _charges = charges;
  _chargeDays = {};
  chargeDays.forEach(r => {
    if (!_chargeDays[r.charge_id]) _chargeDays[r.charge_id] = {};
    _chargeDays[r.charge_id][r.day_key] = r.amount;
  });
}

function mapOrders(raw, cancelledKeys) {
  return raw
    .filter(r => {
      if (!r.num) return false;
      const dayKey = r.time ? String(r.time).substring(0, 10) : '';
      return !cancelledKeys.has(`${r.num}|${dayKey}`);
    })
    .map(r => ({ num: r.num, items: r.items, total: r.total, time: new Date(r.time), server: r.server || '—' }));
}

// ── Lazy render: only render the page the user is currently on ──
let historyLoaded = false;

function renderPage(idx) {
  switch (idx) {
    case 0: renderToday();      break;
    case 1: renderRapport();    break;
    case 2: renderRecette();    break;
    case 3: renderSalaire();    break;
    case 4: renderInventaire(); break;
    case 5: renderRevenue();    break;
  }
}

// ═══════════════════════════════════════
// HISTORY WINDOW
// ═══════════════════════════════════════
// Of every page that reads allOrders, only page-recette.js's month
// navigation (recMonthOffset) has no lower bound — a business can page back
// indefinitely. Every other consumer's own range fits comfortably inside a
// generous trailing window: page-today.js (max 7 days back), page-daily.js
// (current month only), page-inventory.js (today/week/current-month
// periods), page-salary.js (doesn't read allOrders at all), page-revenue.js
// (no navigation control — just reflects whatever's currently loaded, same
// as before, only now "whatever's loaded" is bounded instead of infinite).
// So instead of always fetching the ENTIRE order history (the main cost
// behind Stats feeling slow, and one that only ever grows), the initial
// load is bounded to this window, and Recette's navigation lazily extends
// it backward on demand via ensureOrdersLoadedThrough() — see that
// function and changeRecMonth() (page-recette.js) for how.
const HISTORY_WINDOW_MONTHS = 13;

// Oldest date currently covered by allOrders. Once extended backward (by a
// Recette navigation past the default window), this must never move
// forward again for the life of the session — loadData()'s periodic
// refresh re-fetches from THIS boundary, not the default window, precisely
// so a user looking at month -18 doesn't have that data silently vanish out
// from under them on the next 60s auto-refresh. The cost of that is real
// (the periodic refresh re-fetches however far back the session has ever
// gone) but it's proportional to what this specific session actually
// looked at, not to the store's total lifetime order count.
let _historyLoadedFrom = null;

let _cancelledKeysCache = null;   // reused by ensureOrdersLoadedThrough() — avoids its own /api/cancelled round trip
let _historyExtendPromise = null; // in-flight guard — overlapping callers await the same fetch instead of racing

function _historyWindowStart() {
  const d = new Date();
  d.setMonth(d.getMonth() - HISTORY_WINDOW_MONTHS);
  d.setHours(0, 0, 0, 0);
  return d;
}

function _farFutureCutoff() {
  const d = new Date();
  d.setDate(d.getDate() + 2); // safely past "today" regardless of timezone
  return d;
}

// Extends allOrders backward to cover targetDate, if it isn't already —
// no-op when targetDate is already within the loaded window (the common
// case, since most navigation stays recent). Appends the newly-fetched
// (strictly older) chunk to the end of allOrders rather than re-sorting —
// the server already returns each range newest-first, and everything in
// this chunk is by construction older than everything already loaded, so
// the array's existing newest-first order is preserved.
async function ensureOrdersLoadedThrough(targetDate) {
  if (_historyLoadedFrom && targetDate >= _historyLoadedFrom) return;
  if (_historyExtendPromise) return _historyExtendPromise;

  const gapEnd = _historyLoadedFrom || _farFutureCutoff();
  // Fetch a full extra window at once (not just the exact gap) so paging
  // back one month at a time doesn't turn into one network round trip per
  // click — same width as the initial load.
  const gapStart = new Date(targetDate);
  gapStart.setMonth(gapStart.getMonth() - HISTORY_WINDOW_MONTHS);

  // Snapshot which POS connection this fetch belongs to — if the user
  // switches restaurants (location-picker.js:_activateLocation()/
  // _deactivateLocation()) while this request is in flight, _locationEpoch
  // will have moved on by the time it resolves, and this result (belonging
  // to the OLD restaurant) must be discarded rather than concat()'d onto the
  // NEW restaurant's allOrders.
  const myEpoch = _locationEpoch;

  _historyExtendPromise = (async () => {
    const statusEl = document.getElementById('live-status');
    const prevStatus = statusEl ? statusEl.textContent : null;
    if (statusEl) statusEl.textContent = "Chargement de l'historique…";
    try {
      const raw = await fetchOrdersRange(gapStart, gapEnd);
      if (myEpoch !== _locationEpoch) return; // stale — a different POS is now active
      const olderOrders = mapOrders(raw, _cancelledKeysCache || new Set());
      allOrders = allOrders.concat(olderOrders);
      _historyLoadedFrom = gapStart;
      _ordersStamp++;
      clearConsumptionCache();
    } finally {
      if (statusEl) statusEl.textContent = prevStatus;
      _historyExtendPromise = null;
    }
  })();
  return _historyExtendPromise;
}

// loadData() has two phases of very different cost: "today" (small, fast —
// one narrow date-range query) and "history" (bounded to HISTORY_WINDOW_MONTHS
// by default, or however far a Recette navigation has already extended it —
// see above). Callers that just need the dashboard to be usable again (e.g.
// a Stats location switch) can pass onTodayReady to be notified once the
// fast phase lands, instead of waiting on the history phase too — see
// Stats/app/location-picker.js:_switchWithTransition(). onTodayReady is
// called with `true`/`false` (whether the "today" phase actually succeeded)
// so a caller mid-switch can tell a failed connection apart from a real one
// instead of silently showing the dashboard either way — the stale-epoch
// bail-outs below call it with no argument, since those only ever belong to
// a request that's since been superseded by a newer switch, not to a switch
// still waiting on a result.
async function loadData(onTodayReady) {
  if (!getApiBase()) { if (typeof onTodayReady === 'function') onTodayReady(); return; }
  loadStatsBranding();
  // Snapshot which POS connection this call belongs to. Switching restaurants
  // (location-picker.js:_activateLocation()/_deactivateLocation()) bumps
  // _locationEpoch — if that happens while THIS call is still awaiting a
  // response (e.g. a straggling 60s auto-refresh from the restaurant the
  // user just switched AWAY from, or an overlapping switch-to-switch race),
  // every check below stops it from overwriting allOrders/menuItems/etc with
  // the wrong restaurant's data once it finally resolves. This was the cause
  // of switching restaurants sometimes showing a mix of both, or the
  // previous one's numbers, instead of the one just selected.
  const myEpoch = _locationEpoch;
  try {
    const [cancelledData, todayRaw] = await Promise.all([
      apiGet('/api/cancelled'),
      fetchTodayOrders(),
      loadLocalData(),
    ]);
    if (myEpoch !== _locationEpoch) { if (typeof onTodayReady === 'function') onTodayReady(); return; }

    const cancelledKeys = new Set(cancelledData.map(r => `${r.num}|${r.dateKey}`));
    _cancelledKeysCache = cancelledKeys;
    allOrders = mapOrders(todayRaw, cancelledKeys);
    _ordersStamp++;

    document.getElementById('live-status').textContent = 'En ligne';
    renderToday();
    renderSalaire();
    renderRecette();
    if (typeof onTodayReady === 'function') onTodayReady(true);

    document.getElementById('live-status').textContent = 'Chargement…';
    // Lights the topbar switcher chip's sync dot for as long as the heavier
    // history phase below is still running — see location-picker.js's
    // _locSyncStart()/_locSyncEnd() (both are epoch-guarded, so a straggling
    // call from a restaurant switched away from can't clear the dot for the
    // one now actually loading, or vice versa).
    if (typeof _locSyncStart === 'function') _locSyncStart(myEpoch);
    // Never shrink back to the default window once extended — see
    // _historyLoadedFrom's comment above for why.
    const defaultStart = _historyWindowStart();
    const windowStart = (_historyLoadedFrom && _historyLoadedFrom < defaultStart)
      ? _historyLoadedFrom
      : defaultStart;
    const allRaw = await fetchOrdersRange(windowStart, _farFutureCutoff());
    if (myEpoch !== _locationEpoch) { if (typeof _locSyncEnd === 'function') _locSyncEnd(myEpoch); return; } // stale — a different POS is now active
    allOrders = mapOrders(allRaw, cancelledKeys);
    _historyLoadedFrom = windowStart;
    _ordersStamp++;
    clearConsumptionCache();
    historyLoaded = true;
    document.getElementById('live-status').textContent = 'En ligne';
    if (typeof _locSyncEnd === 'function') _locSyncEnd(myEpoch);

    renderPage(currentPage);

  } catch (e) {
    console.error(e);
    if (myEpoch === _locationEpoch) document.getElementById('live-status').textContent = 'Erreur connexion';
    if (typeof _locSyncEnd === 'function') _locSyncEnd(myEpoch);
    if (typeof onTodayReady === 'function') onTodayReady(false);
  }
}

// ═══════════════════════════════════════
// AUTO REFRESH every 60s
// ═══════════════════════════════════════
setInterval(loadData, 60000);
