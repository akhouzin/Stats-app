// ═══════════════════════════════════════
// STORE DB — on-device persistence of each restaurant's last loaded data.
//
// store-cache.js keeps per-restaurant snapshots in memory for the session;
// this file writes them to IndexedDB so the NEXT app open can show the last
// known numbers, menu photos and totals immediately (then refresh in the
// background) instead of a spinner for the 5–20 s a cold tunnel fetch takes
// on a phone connection. IndexedDB rather than localStorage: a snapshot with
// menu photos is ~2 MB per restaurant (over localStorage's whole-origin
// quota) and structured clone keeps the Date/Set fields as-is.
//
// Every call is best-effort: if IndexedDB is unavailable (private mode,
// blocked storage, old WebView) the app simply behaves as before.
// ═══════════════════════════════════════

const _SDB_NAME    = 'erpgen-stats';
const _SDB_VERSION = 1;
const _SDB_STORE   = 'snapshots';
let _sdbPromise = null;

function _sdbOpen() {
  if (_sdbPromise) return _sdbPromise;
  _sdbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(_SDB_NAME, _SDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(_SDB_STORE)) db.createObjectStore(_SDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return _sdbPromise;
}

function _sdbTx(mode, fn) {
  return _sdbOpen().then(db => new Promise(resolve => {
    if (!db) { resolve(null); return; }
    try {
      const tx = db.transaction(_SDB_STORE, mode);
      const result = fn(tx.objectStore(_SDB_STORE));
      tx.oncomplete = () => resolve(result && 'result' in result ? result.result : true);
      tx.onerror = tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));
}

// → Map<baseUrl, snapshot> of everything saved on this device.
function _sdbLoadAll() {
  return _sdbOpen().then(db => new Promise(resolve => {
    const out = new Map();
    if (!db) { resolve(out); return; }
    try {
      const req = db.transaction(_SDB_STORE, 'readonly').objectStore(_SDB_STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) { resolve(out); return; }
        out.set(cur.key, cur.value);
        cur.continue();
      };
      req.onerror = () => resolve(out);
    } catch {
      resolve(out);
    }
  }));
}

function _sdbPut(base, snap) { return _sdbTx('readwrite', s => { s.put(snap, base); }); }
function _sdbDelete(base)    { return _sdbTx('readwrite', s => { s.delete(base); }); }
