// ═══════════════════════════════════════
// LOAD DATA
// ═══════════════════════════════════════

// Small per-POS datasets (salary, charges, marchandise) — a few KB each, so
// they're simply re-fetched on every refresh. Takes an explicit base so
// store-cache.js can prefetch a restaurant that isn't the active one.
async function _fetchSmallData(base) {
  const [salStaff, salDays, charges, chargeDays, marcCats, marcArts, marcAchats, marcLinks] = await Promise.all([
    apiGetFrom(base, '/api/sal/staff'),
    apiGetFrom(base, '/api/sal/days'),
    apiGetFrom(base, '/api/rec/charges'),
    apiGetFrom(base, '/api/rec/charge-days'),
    apiGetFrom(base, '/api/marc/categories'),
    apiGetFrom(base, '/api/marc/articles'),
    apiGetFrom(base, '/api/marc/achats'),
    apiGetFrom(base, '/api/marc/links'),
  ]);
  const salDaysMap = {};
  salDays.forEach(d => {
    if (!salDaysMap[d.staff_id]) salDaysMap[d.staff_id] = {};
    salDaysMap[d.staff_id][d.day_key] = d.status;
  });
  const chargeDaysMap = {};
  chargeDays.forEach(r => {
    if (!chargeDaysMap[r.charge_id]) chargeDaysMap[r.charge_id] = {};
    chargeDaysMap[r.charge_id][r.day_key] = r.amount;
  });
  return {
    salStaff, salDays: salDaysMap, charges, chargeDays: chargeDaysMap,
    marcCategories: marcCats, marcArticles: marcArts, marcAchats, marcLinks,
  };
}

const _EMPTY_SMALL_STATE = {
  salStaff: [], salDays: {}, charges: [], chargeDays: {},
  marcCategories: [], marcArticles: [], marcAchats: [], marcLinks: [],
};

function _assignSmallState(s) {
  _salStaff       = s.salStaff;
  _salDays        = s.salDays;
  _charges        = s.charges;
  _chargeDays     = s.chargeDays;
  _marcCategories = s.marcCategories;
  _marcArticles   = s.marcArticles;
  _marcAchats     = s.marcAchats;
  _marcLinks      = s.marcLinks;
}

function _currentSmallState() {
  return {
    salStaff: _salStaff, salDays: _salDays, charges: _charges, chargeDays: _chargeDays,
    marcCategories: _marcCategories, marcArticles: _marcArticles, marcAchats: _marcAchats, marcLinks: _marcLinks,
  };
}

// ── Menu ──
// /api/menu-items embeds every article's photo as a base64 data URI —
// measured 1.3–1.6 MB per shop over the tunnel (8 s on a slow one), and it
// used to be re-downloaded on EVERY 60 s refresh and awaited before anything
// rendered. Only page-today.js's photos and page-daily.js/page-revenue.js's
// category grouping read it, and a menu barely changes during a day — so it
// now loads off the critical path (pages render first, then re-render once it
// lands) and is only re-fetched once MENU_TTL_MS has passed. It's also kept
// on the device with the rest of the snapshot (store-db.js), so photos show
// on the very first frame of the next app open; when a cached copy exists the
// re-check waits MENU_RECHECK_DELAY_MS so it never competes with the live
// numbers for bandwidth, and an unchanged menu doesn't re-render anything.
const MENU_TTL_MS = 30 * 60 * 1000;
const MENU_RECHECK_DELAY_MS = 6000;
let _menuFetchedAt = 0;   // 0 = never fetched for the active POS
let _menuInFlight  = false;

function _menuSignature(list) {
  let n = 0;
  for (const m of list) n += (m.image ? m.image.length : 0) + m.name.length + Number(m.price || 0);
  return list.length + ':' + n;
}

function _refreshMenuIfStale(base, myEpoch) {
  if (_menuInFlight || (_menuFetchedAt && Date.now() - _menuFetchedAt < MENU_TTL_MS)) return;
  _menuInFlight = true;
  const delay = menuItems.length ? MENU_RECHECK_DELAY_MS : 0;
  new Promise(r => setTimeout(r, delay))
    .then(() => {
      if (myEpoch !== _locationEpoch) throw new Error('stale');
      return apiGetFrom(base, '/api/menu-items');
    })
    .then(menuData => {
      const mapped = menuData.map(i => ({ id: i.id, name: i.name, cat: i.cat, price: i.price, image: i.image || '' }));
      if (myEpoch !== _locationEpoch) {
        // Switched away mid-download — hand the (expensive) result to that
        // restaurant's snapshot instead of discarding it, so going back
        // doesn't download it again.
        const snap = typeof _storeSnapshots !== 'undefined' && _storeSnapshots.get(base);
        if (snap) {
          snap.menuItems = mapped;
          snap.menuFetchedAt = Date.now();
          if (!snap.fromDisk) _storeSchedulePersist(base);
        }
        return;
      }
      _menuFetchedAt = Date.now();
      if (_menuSignature(mapped) !== _menuSignature(menuItems)) {
        menuItems = mapped;
        _ordersStamp++; // page-revenue.js's stamp guard — its category split reads the menu
        if (historyLoaded) renderPage(currentPage);
      }
      if (typeof _storeSnapshotSave === 'function') _storeSnapshotSave(base);
    })
    .catch(e => { if (e.message !== 'stale') console.error('[menu] load failed', e); })
    .finally(() => { if (myEpoch === _locationEpoch) _menuInFlight = false; });
}
// `_cancelKey` keeps the raw (server-side) day key next to the parsed Date so
// an incremental refresh can re-apply a newer cancellation list to orders it
// already holds without re-deriving the key from a timezone-shifted Date.
function _orderKey(o) { return `${o.num}|${o._cancelKey}`; }

function mapOrders(raw, cancelledKeys) {
  return raw
    .filter(r => {
      if (!r.num) return false;
      const dayKey = r.time ? String(r.time).substring(0, 10) : '';
      return !cancelledKeys.has(`${r.num}|${dayKey}`);
    })
    .map(r => ({
      num: r.num, items: r.items, total: r.total, time: new Date(r.time), server: r.server || '—',
      _cancelKey: r.time ? String(r.time).substring(0, 10) : '',
    }));
}

// ── Lazy render: only render the page the user is currently on ──
let historyLoaded = false;

async function renderPage(idx) {
  switch (idx) {
    case 0: renderToday();      break;
    case 1: await _renderRapportWithPrevMonthHistory(); break;
    case 2: renderSalaire();    break;
    case 3: renderMarchandise(); break;
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
// loadData()'s FULL refresh (every FULL_REFRESH_MS) re-fetches from THIS
// boundary, not the default window, precisely so a user looking at month -18
// doesn't have that data silently vanish out from under them. The 60 s
// refreshes in between only re-fetch the last INCREMENTAL_LOOKBACK_DAYS and
// keep everything older as-is — see loadData().
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
  const base = getApiBase();

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
      const raw = await fetchOrdersRange(gapStart, gapEnd, base);
      if (myEpoch !== _locationEpoch) return; // stale — a different POS is now active
      const olderOrders = mapOrders(raw, _cancelledKeysCache || new Set());
      allOrders = allOrders.concat(olderOrders);
      _historyLoadedFrom = gapStart;
      _ordersStamp++;
      if (typeof _storeSnapshotSave === 'function') _storeSnapshotSave(base);
    } finally {
      if (statusEl) statusEl.textContent = prevStatus;
      _historyExtendPromise = null;
      if (typeof _locSyncEnd === 'function') _locSyncEnd(myEpoch);
    }
  })();
  return _historyExtendPromise;
}

// ═══════════════════════════════════════
// LOAD / REFRESH
// ═══════════════════════════════════════
// Fetches the active POS's data and renders it. Everything the first paint
// needs — orders, cancellations, the small datasets and branding (getDayKey()
// depends on its day-cycle hour) — goes out in ONE parallel wave. The old
// two-wave split (small stuff first, orders after) existed to keep an
// HTTP/1.1 connection pool free for the orders payload, but in practice the
// first wave included the 1.3–1.6 MB menu, so the orders request sat idle
// behind it for up to 8 s on every switch. The menu is now off the critical
// path entirely (_refreshMenuIfStale()), and the remaining requests are tiny.
//
// Two refresh depths:
//   full        — the whole loaded window (current month by default, or
//                 however far back _historyLoadedFrom has been extended).
//                 First load of a POS, then every FULL_REFRESH_MS.
//   incremental — only the last INCREMENTAL_LOOKBACK_DAYS, merged over what's
//                 already held. Every other 60 s tick — a busy shop's month
//                 of orders is ~150–200 KB gzipped, re-downloaded every minute
//                 before this.
//
// onTodayReady(true/false) reports whether the load succeeded so a caller
// mid-switch (location-picker.js:_switchWithTransition()) can tell a failed
// connection from a real one; it's called with no argument when the result
// was discarded because a different POS became active meanwhile.
const FULL_REFRESH_MS = 10 * 60 * 1000;
const INCREMENTAL_LOOKBACK_DAYS = 2; // ≥ 1 business day of slack past midnight + the day-cycle shift
const AUTO_REFRESH_MS = 60000;

let _lastFullLoadAt = 0;   // when the active POS last had a full (non-incremental) refresh
let _lastLoadOkAt   = 0;   // when the active POS last answered at all — drives the live-status text
let _loadInFlight = null;
let _loadInFlightEpoch = -1;

function _incrementalStart() {
  const d = new Date();
  d.setDate(d.getDate() - INCREMENTAL_LOOKBACK_DAYS);
  d.setHours(0, 0, 0, 0);
  return d;
}

// "19:22" for today, "27/10 19:22" for an older moment (a device-cached
// snapshot can be days old).
function _fmtSyncTime(ms) {
  const d = new Date(ms);
  const hhmm = d.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? hhmm
    : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hhmm}`;
}

// kind: 'ok' | 'refreshing' (last-known data on screen, live load running) | 'error'
function _setLiveStatus(kind) {
  const el  = document.getElementById('live-status');
  const dot = document.querySelector('.live-dot');
  const when = _lastLoadOkAt ? _fmtSyncTime(_lastLoadOkAt) : '';
  if (dot) {
    dot.classList.toggle('live-dot-off', kind === 'error');
    dot.classList.toggle('live-dot-sync', kind === 'refreshing');
  }
  document.body.classList.toggle('data-stale', kind !== 'ok' && historyLoaded);
  if (!el) return;
  if (kind === 'ok') {
    el.textContent = 'En ligne';
    el.title = 'Mis à jour à ' + when;
  } else if (kind === 'refreshing') {
    el.textContent = 'Mise à jour…';
    el.title = when ? 'Données affichées : ' + when : '';
  } else {
    // With data already on screen, say how old it is rather than implying it's gone.
    el.textContent = historyLoaded && when ? 'Hors ligne · ' + when : 'Erreur connexion';
    el.title = '';
  }
}

// Third, lightest depth — `quick` (live-refresh.js, every QUICK_REFRESH_MS
// while visible): only the last QUICK_LOOKBACK_HOURS of orders + the
// cancellation list, merged like an incremental load. A few KB, so a sale
// rung up at the till shows within seconds instead of up to a minute later.
// The lookback is hours, not "since the newest order I hold", because an
// order's `time` is when it was opened — a table can be mirrored long after.
// Nothing is re-rendered when the slice came back identical.
const QUICK_LOOKBACK_HOURS = 3;
let _lastDeepLoadAt = 0; // last successful full/incremental load (quick ticks don't count)

// Order count + revenue + cancellation count of everything newer than `from`
// (allOrders is newest-first, so this stops at the first older order).
function _sliceSig(list, from, cancelledCount) {
  let n = 0, sum = 0, nums = 0;
  for (const o of list) {
    if (o.time < from) break;
    n++; sum += Number(o.total) || 0; nums += Number(o.num) || 0;
  }
  return `${n}|${sum.toFixed(2)}|${nums}|${cancelledCount}`;
}

async function loadData(onTodayReady, { full = false, quick = false } = {}) {
  const done = ok => { if (typeof onTodayReady === 'function') onTodayReady(ok); };
  const base = getApiBase();
  if (!base) { done(); return; }
  const myEpoch = _locationEpoch;
  // A load for this same POS is already on the wire (a tick overlapping a
  // slow previous one, or a resume racing the interval) — join it instead
  // of stacking a duplicate request.
  if (_loadInFlight && _loadInFlightEpoch === myEpoch) { done(await _loadInFlight); return; }
  const mode = full ? 'full' : (quick && historyLoaded ? 'quick' : 'auto');
  const p = _loadDataImpl(base, myEpoch, mode);
  _loadInFlight = p;
  _loadInFlightEpoch = myEpoch;
  try {
    done(await p);
  } finally {
    if (_loadInFlight === p) _loadInFlight = null;
  }
}

async function _loadDataImpl(base, myEpoch, mode) {
  const quick = mode === 'quick';
  const incremental = !quick && historyLoaded && mode !== 'full' && (Date.now() - _lastFullLoadAt) < FULL_REFRESH_MS;
  // Never shrink back to the default window once extended — see
  // _historyLoadedFrom's comment above for why.
  const defaultStart = _historyWindowStart();
  const windowStart = (_historyLoadedFrom && _historyLoadedFrom < defaultStart) ? _historyLoadedFrom : defaultStart;
  const fetchFrom = quick
    ? new Date(Date.now() - QUICK_LOOKBACK_HOURS * 3600000)
    : (incremental ? _incrementalStart() : windowStart);

  if (!quick) _refreshMenuIfStale(base, myEpoch);

  try {
    const [cancelledData, small, raw] = await Promise.all([
      apiGetFrom(base, '/api/cancelled'),
      quick ? null : _fetchSmallData(base),
      fetchOrdersRange(fetchFrom, _farFutureCutoff(), base),
      quick ? null : loadStatsBranding(), // epoch-guarded itself, never throws
    ]);
    if (myEpoch !== _locationEpoch) return undefined; // stale — a different POS is now active

    const cancelledKeys = new Set(cancelledData.map(r => `${r.num}|${r.dateKey}`));
    const prevCancelledCount = _cancelledKeysCache ? _cancelledKeysCache.size : -1;
    const before = _sliceSig(allOrders, fetchFrom, prevCancelledCount);
    _cancelledKeysCache = cancelledKeys;
    if (small) _assignSmallState(small);
    const fresh = mapOrders(raw, cancelledKeys);
    if (quick || incremental) {
      // Keep what's older than the re-fetched slice, minus anything that has
      // since been cancelled or re-sent in `fresh` (a boundary order).
      const freshKeys = new Set(fresh.map(_orderKey));
      const kept = allOrders.filter(o => o.time < fetchFrom && !freshKeys.has(_orderKey(o)) && !cancelledKeys.has(_orderKey(o)));
      allOrders = fresh.concat(kept);
    } else {
      allOrders = fresh;
      _historyLoadedFrom = windowStart;
      _lastFullLoadAt = Date.now();
    }
    const changed = !quick || _sliceSig(allOrders, fetchFrom, cancelledKeys.size) !== before;
    historyLoaded = true;
    _lastLoadOkAt = Date.now();
    if (!quick) _lastDeepLoadAt = _lastLoadOkAt;
    _setLiveStatus('ok');

    if (changed) {
      _ordersStamp++;
      renderToday();
      renderSalaire();
      renderRecette();
      renderPage(currentPage);
      if (typeof _onLiveDataChanged === 'function') _onLiveDataChanged();
    }
    if (changed) {
      if (typeof _storeSnapshotSave === 'function') _storeSnapshotSave(base);
    } else if (typeof _storeTouch === 'function') {
      _storeTouch(base, _lastLoadOkAt); // nothing new — just "still live as of now"
    }
    if (!quick && typeof _prefetchOtherStores === 'function') _prefetchOtherStores();
    return true;
  } catch (e) {
    console.error(e);
    if (myEpoch !== _locationEpoch) return undefined;
    _setLiveStatus('error');
    if (typeof _storeMarkError === 'function') _storeMarkError(base);
    return false;
  }
}
// Refresh scheduling (ticks, resume, pull-to-refresh) lives in live-refresh.js.
