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

async function renderPage(idx) {
  switch (idx) {
    case 0: renderToday();      break;
    case 1: await _renderRapportWithPrevMonthHistory(); break;
    case 2: renderSalaire();    break;
    case 3: renderInventaire(); break;
    case 4: await _renderRevenueWithTrendHistory(); break;
  }
}

// page-daily.js's Rapport shows the current month by default (already
// covered by the eager window below) plus a "Vs Mois Dernier" comparison
// against the FULL previous calendar month, which is not. Renders
// immediately with whatever's loaded (current month is always there; the
// trend tile reads "Pas de données" until the lazy fetch lands), then
// extends backward and re-renders once the previous month arrives — same
// pattern as Revenue below. renderRapport() has no stamp guard of its own,
// so the second call is a plain (cheap) recompute, not a no-op — that's
// fine, it only happens once per session per the same ensureOrdersLoadedThrough()
// no-op-if-already-covered rule.
async function _renderRapportWithPrevMonthHistory() {
  renderRapport();
  const now = new Date();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  try {
    // padMonths: 0 — Rapport only ever wants exactly the one previous month,
    // not an amortized multi-month batch (that padding is for Recette's
    // open-ended back-navigation, below). Padding here would silently
    // multiply this fetch several times over for no benefit, which is
    // exactly what was making the older, data-heavy POS feel stuck when
    // just opening this tab.
    await ensureOrdersLoadedThrough(prevMonthStart, 0);
    renderRapport();
  } catch (e) {
    console.error('[rapport] failed to load previous-month history', e);
  }
}

// page-revenue.js's monthly trend (its `monthEntries.slice(0, 6)`) wants up
// to REVENUE_TREND_MONTHS of history — more than the default eager window
// below carries. Renders immediately with whatever's already loaded (so
// opening the Revenue tab is never blocked on a network round trip), then
// lazily extends backward and re-renders once the fuller window lands —
// same "instant now, lazy for older" principle as page-recette.js's
// changeRecMonth(). renderRevenue() itself no-ops on the second call unless
// _ordersStamp actually changed (ensureOrdersLoadedThrough bumps it), so
// this costs nothing extra once the trend window is already loaded.
const REVENUE_TREND_MONTHS = 6;
async function _renderRevenueWithTrendHistory() {
  renderRevenue();
  const trendStart = new Date();
  trendStart.setMonth(trendStart.getMonth() - (REVENUE_TREND_MONTHS - 1));
  trendStart.setDate(1);
  trendStart.setHours(0, 0, 0, 0);
  try {
    // padMonths: 0 — REVENUE_TREND_MONTHS already IS the exact window this
    // chart needs; the default amortized padding (meant for Recette's
    // open-ended back-navigation) would fetch several months more than the
    // chart will ever use, for no benefit.
    await ensureOrdersLoadedThrough(trendStart, 0);
    renderRevenue();
  } catch (e) {
    console.error('[revenue] failed to load trend history', e);
  }
}

// ═══════════════════════════════════════
// HISTORY WINDOW
// ═══════════════════════════════════════
// Eagerly-loaded default window on connect and on every 60s refresh: the
// CURRENT calendar month only, per explicit user request — "only get the
// whole data of the current month, the other history can be fetched by
// time passing." Everything before the current month is lazy, fetched on
// demand via ensureOrdersLoadedThrough() only by the specific section that
// actually needs it: page-recette.js's unbounded back-navigation
// (changeRecMonth), page-daily.js's Rapport "Vs Mois Dernier" comparison
// (_renderRapportWithPrevMonthHistory, above), and page-revenue.js's
// REVENUE_TREND_MONTHS trend chart (_renderRevenueWithTrendHistory, above).
// page-inventory.js (today/week/current-month periods) and page-salary.js
// (doesn't read allOrders at all) need nothing beyond the current month
// either. The one exception carved out of "current month only" is
// page-today.js's day-by-day nav (TODAY_MAX_OFFSET, up to 7 days back) —
// near the start of a month that can reach a handful of days into the
// PREVIOUS month, and that page has no lazy-fetch of its own, so the eager
// window's true start is whichever is further back: the 1st of the current
// month, or TODAY_MIN_LOOKBACK_DAYS before today. In practice this means
// "current month only" for most of the month, widening by at most about a
// week right around the 1st — never the whole previous month.
const TODAY_MIN_LOOKBACK_DAYS = 8; // 1 day of slack past page-today.js's own 7-day max offset

// Batch size for each on-demand backward extension once a page actually
// needs order history older than the eager default above (Recette's
// unbounded back-navigation, Rapport's and Revenue's trend comparisons) —
// sized as a chunk, not "fetch exactly what's needed", so repeated
// navigation doesn't turn into one network round trip per click/tab-open.
const HISTORY_EXTEND_CHUNK_MONTHS = 6;

// Oldest date currently covered by allOrders. Once extended backward (by a
// Recette navigation, or a Rapport/Revenue tab-open, past the default
// window), this must never move forward again for the life of the session —
// loadData()'s periodic refresh re-fetches from THIS boundary, not the
// default window, precisely so a user looking at month -18 doesn't have
// that data silently vanish out from under them on the next 60s
// auto-refresh. The cost of that is real (the periodic refresh re-fetches
// however far back the session has ever gone) but it's proportional to what
// this specific session actually looked at, not to the store's total
// lifetime order count.
let _historyLoadedFrom = null;

let _cancelledKeysCache = null;   // reused by ensureOrdersLoadedThrough() — avoids its own /api/cancelled round trip
let _historyExtendPromise = null; // in-flight guard — overlapping callers await the same fetch instead of racing

function _historyWindowStart() {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const minLookback = new Date(now);
  minLookback.setDate(minLookback.getDate() - TODAY_MIN_LOOKBACK_DAYS);
  minLookback.setHours(0, 0, 0, 0);
  // Whichever is further back — see the comment above for why both matter.
  return currentMonthStart < minLookback ? currentMonthStart : minLookback;
}

// +2 days, not +1 — the POS's business day (helpers.js:getDayKey(), shifted
// by its day-cycle-start hour) can extend up to ~23h past calendar midnight,
// so a literal "tomorrow" cutoff could clip an order that's still "today"
// business-day-wise. This margin, combined with _historyWindowStart()'s own
// lower bound (always at least TODAY_MIN_LOOKBACK_DAYS back), is what used
// to be handled by a separate narrow fetchTodayOrders() call — merged away
// once loadData() started fetching the whole eager window in one request.
function _farFutureCutoff() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d;
}

// Extends allOrders backward to cover targetDate, if it isn't already —
// no-op when targetDate is already within the loaded window (the common
// case, since most navigation stays recent). Appends the newly-fetched
// (strictly older) chunk to the end of allOrders rather than re-sorting —
// the server already returns each range newest-first, and everything in
// this chunk is by construction older than everything already loaded, so
// the array's existing newest-first order is preserved.
//
// padMonths controls how much EXTRA history to fetch beyond targetDate
// itself, on top of the exact gap: default HISTORY_EXTEND_CHUNK_MONTHS,
// for callers with an open-ended, incremental need (page-recette.js's
// changeRecMonth() — a business can keep clicking "previous month"
// indefinitely, so batching ahead avoids one network round trip per
// click). Callers whose target is already an exact, fixed, one-shot need —
// _renderRapportWithPrevMonthHistory() (exactly one previous month),
// _renderRevenueWithTrendHistory() (exactly REVENUE_TREND_MONTHS) — pass 0,
// so this fetches precisely what they asked for and nothing more. Padding
// those by another 6 months each (the old, single-chunk-size behavior) was
// multiplying an otherwise small tab-open fetch by 6-7x for no benefit,
// which is what made just opening Rapport/Revenue feel slow/stuck on a POS
// with a meaningful amount of order history.
async function ensureOrdersLoadedThrough(targetDate, padMonths = HISTORY_EXTEND_CHUNK_MONTHS) {
  if (_historyLoadedFrom && targetDate >= _historyLoadedFrom) return;
  if (_historyExtendPromise) return _historyExtendPromise;

  const gapEnd = _historyLoadedFrom || _farFutureCutoff();
  const gapStart = new Date(targetDate);
  gapStart.setMonth(gapStart.getMonth() - padMonths);

  // Snapshot which POS connection this fetch belongs to — if the user
  // switches restaurants (location-picker.js:_activateLocation()/
  // _deactivateLocation()) while this request is in flight, _locationEpoch
  // will have moved on by the time it resolves, and this result (belonging
  // to the OLD restaurant) must be discarded rather than concat()'d onto the
  // NEW restaurant's allOrders.
  const myEpoch = _locationEpoch;

  // Lights the topbar switcher chip's sync dot for as long as this
  // on-demand backward extension is in flight — see location-picker.js's
  // _locSyncStart()/_locSyncEnd() (both epoch-guarded, so a straggling call
  // from a restaurant switched away from can't touch the dot meant for
  // whichever restaurant is actually active now). This is the only place
  // left in the app where meaningfully older history loads in the
  // background after the visible page has already rendered — loadData()'s
  // own fetch (below) is a single up-front request now, not a phased one.
  if (typeof _locSyncStart === 'function') _locSyncStart(myEpoch);
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
      if (typeof _locSyncEnd === 'function') _locSyncEnd(myEpoch);
    }
  })();
  return _historyExtendPromise;
}

// Fetches everything the eager default window covers (the current month,
// give or take page-today.js's lookback floor — see _historyWindowStart())
// before the dashboard renders, so it never shows a narrower "today only"
// preview that gets silently upgraded moments later. Older history
// (previous months, Revenue's trend) stays lazy — see
// ensureOrdersLoadedThrough() above. onTodayReady is called with
// `true`/`false` (whether this load actually succeeded) so a caller
// mid-switch (location-picker.js:_switchWithTransition()) can tell a failed
// connection apart from a real one instead of silently showing the
// dashboard either way — the stale-epoch bail-out below calls it with no
// argument, since that only ever belongs to a request that's since been
// superseded by a newer switch, not to a switch still waiting on a result.
//
// Split into two sequential waves rather than one single Promise.all of
// everything: loadLocalData() alone fans out to 10 concurrent requests, and
// most browsers cap concurrent requests per origin around 6 (HTTP/1.1) —
// throwing the orders fetch (by far the largest single payload here, and
// the one most likely to be slow on a POS with substantial order history)
// into that same 11-wide burst let it get queued behind/interleaved with
// 10 much smaller requests, and vice versa, so even the small ones could
// end up waiting on a connection slot. Fetching the small stuff first, then
// the orders range on its own, keeps each wave's peak concurrency lower and
// gives the potentially-large request the connection pool to itself —
// without changing the "nothing renders until the current month is fully
// loaded" guarantee, since both waves are still awaited before anything
// below runs.
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
    // Never shrink back to the default window once extended — see
    // _historyLoadedFrom's comment above for why.
    const defaultStart = _historyWindowStart();
    const windowStart = (_historyLoadedFrom && _historyLoadedFrom < defaultStart)
      ? _historyLoadedFrom
      : defaultStart;

    const [cancelledData] = await Promise.all([
      apiGet('/api/cancelled'),
      loadLocalData(),
    ]);
    if (myEpoch !== _locationEpoch) { if (typeof onTodayReady === 'function') onTodayReady(); return; }
    const allRaw = await fetchOrdersRange(windowStart, _farFutureCutoff());
    if (myEpoch !== _locationEpoch) { if (typeof onTodayReady === 'function') onTodayReady(); return; }

    const cancelledKeys = new Set(cancelledData.map(r => `${r.num}|${r.dateKey}`));
    _cancelledKeysCache = cancelledKeys;
    allOrders = mapOrders(allRaw, cancelledKeys);
    _historyLoadedFrom = windowStart;
    _ordersStamp++;
    clearConsumptionCache();
    historyLoaded = true;

    document.getElementById('live-status').textContent = 'En ligne';
    renderToday();
    renderSalaire();
    renderRecette();
    if (typeof onTodayReady === 'function') onTodayReady(true);

    renderPage(currentPage);

  } catch (e) {
    console.error(e);
    if (myEpoch === _locationEpoch) document.getElementById('live-status').textContent = 'Erreur connexion';
    if (typeof onTodayReady === 'function') onTodayReady(false);
  }
}

// ═══════════════════════════════════════
// AUTO REFRESH every 60s
// ═══════════════════════════════════════
setInterval(loadData, 60000);
