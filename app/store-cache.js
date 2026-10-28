// ═══════════════════════════════════════
// STORE CACHE — per-restaurant in-memory snapshots + background prefetch.
//
// Stats' data lives in plain globals (state.js / data-loader.js) that only
// ever hold ONE POS at a time. Switching restaurants used to throw that away
// and re-download everything (~2–11 s over a tunnel), even when switching
// straight back to the restaurant just left. This file keeps a snapshot of
// each restaurant's loaded state for the session, so:
//   • switching to a restaurant already visited is instant (then refreshed
//     in the background, with the topbar sync dot);
//   • after the active restaurant finishes loading, the OTHER saved ones are
//     prefetched once, quietly, so even the first switch is instant;
//   • the store switcher sheet can show each one's live status and today's
//     totals without connecting to it.
//
// Snapshots hold references to the same arrays/objects the globals point to
// — data-loader.js always REASSIGNS those globals with fresh objects on load,
// so a snapshot never sees another restaurant's data leak into it.
// Menu photos are never prefetched (1.3–1.6 MB per shop) — they load when
// the restaurant is actually opened (data-loader.js:_refreshMenuIfStale()).
// ═══════════════════════════════════════

const _storeSnapshots  = new Map(); // base URL → snapshot
const _storeHealth     = new Map(); // base URL → { ok, at }
const _storePrefetches = new Map(); // base URL → in-flight Promise<snapshot|null>

// A restored snapshot younger than this is shown as-is, without an immediate
// background refresh — e.g. switching A → B → A within a few seconds.
const STORE_SNAPSHOT_FRESH_MS = 30000;

function _storeNotify() {
  if (typeof _renderStoreSheetIfOpen === 'function') _renderStoreSheetIfOpen();
  if (typeof _renderStartupChooserIfOpen === 'function') _renderStartupChooserIfOpen();
}

// ── On-device persistence (store-db.js) ──
// Snapshots are written to IndexedDB a moment after they change (debounced —
// a load can save several times in a row: orders, then menu) and flushed
// immediately when the app is backgrounded, since a phone may kill it there.
// Only the default eager window of orders is persisted: history extended
// for Revenue/Recette can be months long and is cheap to re-fetch lazily.
const _STORE_PERSIST_DELAY_MS = 2000;
const _storePersistTimers = new Map(); // base → timeout id

function _storePersistNow(base) {
  clearTimeout(_storePersistTimers.get(base));
  _storePersistTimers.delete(base);
  const s = _storeSnapshots.get(base);
  if (!s || s.fromDisk) return; // nothing new since it was read from disk
  _storeLastPersistAt.set(base, Date.now());
  const windowStart = _historyWindowStart();
  const from = s.historyLoadedFrom && s.historyLoadedFrom > windowStart ? s.historyLoadedFrom : windowStart;
  _sdbPut(base, {
    ...s,
    allOrders: s.allOrders.filter(o => o.time >= from),
    historyLoadedFrom: from,
  });
}

// Throttled, not just debounced: with live ticks every 15 s a busy shop can
// change the snapshot every minute, and each write clones ~2 MB (menu photos
// included). At most one write per store per _STORE_PERSIST_MIN_GAP_MS; the
// timer, once set, is left alone so the write isn't postponed forever.
const _STORE_PERSIST_MIN_GAP_MS = 30000;
const _storeLastPersistAt = new Map(); // base → ms

function _storeSchedulePersist(base) {
  if (_storePersistTimers.has(base)) return;
  const sinceLast = Date.now() - (_storeLastPersistAt.get(base) || 0);
  const wait = Math.max(_STORE_PERSIST_DELAY_MS, _STORE_PERSIST_MIN_GAP_MS - sinceLast);
  _storePersistTimers.set(base, setTimeout(() => _storePersistNow(base), wait));
}

// A live check that found nothing new: keep the in-memory snapshot's
// "live as of" time current (status lines) without rewriting it to disk.
function _storeTouch(base, at) {
  const s = _storeSnapshots.get(base);
  if (s && !s.fromDisk) s.lastLoadOkAt = at;
  _storeHealth.set(base, { ok: true, at });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) [..._storePersistTimers.keys()].forEach(_storePersistNow);
});

// Loads every snapshot saved on this device into memory (without
// overwriting anything already loaded this session). Called once at boot by
// app-init.js before it decides what to show. Restored snapshots are marked
// `fromDisk` — shown immediately, but always refreshed, and replaceable by a
// background prefetch.
let _storeHydrated = null;
function _storeHydrateFromDisk() {
  if (_storeHydrated) return _storeHydrated;
  const saved = new Set(_getLocations().map(l => l.url));
  _storeHydrated = _sdbLoadAll().then(all => {
    all.forEach((snap, base) => {
      if (!saved.has(base)) { _sdbDelete(base); return; } // restaurant removed meanwhile
      if (_storeSnapshots.has(base) || !snap || !Array.isArray(snap.allOrders)) return;
      _storeSnapshots.set(base, { ...snap, fromDisk: true });
    });
    _storeNotify();
  }).catch(() => {});
  return _storeHydrated;
}

function _storeForget(base) {
  _storeSnapshots.delete(base);
  _storeHealth.delete(base);
  clearTimeout(_storePersistTimers.get(base));
  _storePersistTimers.delete(base);
  _sdbDelete(base);
}

// True when a snapshot exists but wasn't loaded live recently — i.e. what's
// on screen is the last known state and a refresh is (or should be) running.
function _storeIsStale(base) {
  const s = _storeSnapshots.get(base);
  return !!s && (s.fromDisk || Date.now() - s.lastLoadOkAt > 2 * AUTO_REFRESH_MS);
}

// Captures the ACTIVE restaurant's state. Called after every successful
// load/extension (data-loader.js) and right before switching away
// (location-picker.js:_activateLocation()).
function _storeSnapshotSave(base) {
  if (!base || !historyLoaded) return;
  const prev = _storeSnapshots.get(base);
  _storeSnapshots.set(base, {
    // Still the disk copy if no live load has landed since it was restored
    // (e.g. leaving a restaurant before its background refresh finished).
    fromDisk:          !!(prev && prev.fromDisk && prev.lastLoadOkAt === _lastLoadOkAt),
    allOrders,
    historyLoadedFrom: _historyLoadedFrom,
    cancelledKeys:     _cancelledKeysCache,
    lastFullLoadAt:    _lastFullLoadAt,
    lastLoadOkAt:      _lastLoadOkAt,
    menuItems,
    menuFetchedAt:     _menuFetchedAt,
    small:             _currentSmallState(),
    savedAt:           Date.now(),
  });
  if (_lastLoadOkAt) _storeHealth.set(base, { ok: true, at: _lastLoadOkAt });
  _storeSchedulePersist(base);
  _storeNotify();
}

function _storeMarkError(base) {
  _storeHealth.set(base, { ok: false, at: Date.now() });
  _storeNotify();
}

// Empties every per-restaurant global — the state a never-visited restaurant
// starts from. Bumps _ordersStamp so stamp-guarded renders recompute.
function _storeStateReset() {
  allOrders           = [];
  _historyLoadedFrom  = null;
  historyLoaded       = false;
  _cancelledKeysCache = null;
  _lastFullLoadAt     = 0;
  _lastLoadOkAt       = 0;
  _lastDeepLoadAt     = 0;
  menuItems           = [];
  _menuFetchedAt      = 0;
  _menuInFlight       = false;
  _assignSmallState(_EMPTY_SMALL_STATE);
  _ordersStamp++;
}

// Puts a restaurant's snapshot back into the globals (and its cached
// branding on the topbar). Returns the snapshot, or null if there is none.
function _storeSnapshotRestore(base) {
  const s = _storeSnapshots.get(base);
  if (!s) return null;
  allOrders           = s.allOrders;
  _historyLoadedFrom  = s.historyLoadedFrom;
  _cancelledKeysCache = s.cancelledKeys;
  _lastFullLoadAt     = s.lastFullLoadAt;
  _lastLoadOkAt       = s.lastLoadOkAt;
  menuItems           = s.menuItems;
  _menuFetchedAt      = s.menuFetchedAt;
  _assignSmallState(s.small);
  historyLoaded = true;
  _ordersStamp++;
  const b = getCachedBranding(base);
  if (b) applyStatsBranding(b);
  return s;
}

// Fetches one NON-active restaurant into a snapshot without touching any
// global. Same default window and payloads as data-loader.js's full load,
// minus the menu. Concurrent callers share the same promise.
function _prefetchStore(base) {
  if (_storePrefetches.has(base)) return _storePrefetches.get(base);
  const p = (async () => {
    try {
      const windowStart = _historyWindowStart();
      const [cancelledData, small, raw] = await Promise.all([
        apiGetFrom(base, '/api/cancelled'),
        _fetchSmallData(base),
        fetchOrdersRange(windowStart, _farFutureCutoff(), base),
        fetchBrandingFor(base).catch(() => null),
      ]);
      const cancelledKeys = new Set(cancelledData.map(r => `${r.num}|${r.dateKey}`));
      const now = Date.now();
      const prev = _storeSnapshots.get(base);
      const snap = {
        allOrders: mapOrders(raw, cancelledKeys),
        historyLoadedFrom: windowStart,
        cancelledKeys,
        lastFullLoadAt: now,
        lastLoadOkAt: now,
        // The menu isn't prefetched (photos) — carry over a disk copy's.
        menuItems:     prev ? prev.menuItems : [],
        menuFetchedAt: prev ? prev.menuFetchedAt : 0,
        small,
        savedAt: now,
      };
      // A real visit may have produced a richer live snapshot (extended
      // history, menu) while this was in flight — never overwrite that one.
      // A copy read from disk is just a placeholder and is replaced.
      if (!prev || prev.fromDisk) {
        _storeSnapshots.set(base, snap);
        _storeSchedulePersist(base);
      }
      _storeHealth.set(base, { ok: true, at: now });
      return _storeSnapshots.get(base);
    } catch (e) {
      console.warn('[store-cache] prefetch failed for', base, e);
      _storeHealth.set(base, { ok: false, at: Date.now() });
      return null;
    } finally {
      _storePrefetches.delete(base);
      _storeNotify();
    }
  })();
  _storePrefetches.set(base, p);
  _storeNotify();
  return p;
}

// Prefetches every saved restaurant (except the active one) that has no
// snapshot yet — one at a time, so it never competes with the active
// restaurant's own requests for bandwidth. `includeActive` is for the
// startup chooser, where no restaurant is open yet.
let _prefetchQueueRunning = false;
async function _prefetchOtherStores({ includeActive = false } = {}) {
  if (_prefetchQueueRunning) return;
  _prefetchQueueRunning = true;
  try {
    const active = getApiBase();
    for (const loc of _getLocations()) {
      if (!includeActive && loc.url === active) continue;
      if (_storeSnapshots.has(loc.url) && !_storeSnapshots.get(loc.url).fromDisk) continue;
      const h = _storeHealth.get(loc.url);
      if (h && !h.ok && Date.now() - h.at < 60000) continue; // just failed — don't hammer it
      await _prefetchStore(loc.url);
    }
  } finally {
    _prefetchQueueRunning = false;
  }
}

function _storeIsLoading(base) { return _storePrefetches.has(base); }
function _storeHealthOf(base) { return _storeHealth.get(base) || null; }
function _storeHasSnapshot(base) { return _storeSnapshots.has(base); }

// Today's order count + revenue for any snapshotted restaurant, bucketed by
// THAT restaurant's own business-day cutover (its cached branding), not the
// active one's — helpers.js:getDayKey() only knows the active POS.
function _storeTodaySummary(base) {
  const s = _storeSnapshots.get(base);
  if (!s) return null;
  const b = getCachedBranding(base);
  const shiftMs = ((b && Number(b.dayCycleStartHour)) || 0) * 3600000;
  const dayOf = t => new Date(t - shiftMs).toDateString();
  const today = dayOf(Date.now());
  const floor = Date.now() - 2 * 86400000; // allOrders is newest-first — stop scanning past 2 days
  let count = 0, total = 0;
  for (const o of s.allOrders) {
    const t = o.time.getTime();
    if (t < floor) break;
    if (dayOf(t) === today) { count++; total += Number(o.total) || 0; }
  }
  return { count, total, at: s.lastLoadOkAt, stale: _storeIsStale(base) };
}
