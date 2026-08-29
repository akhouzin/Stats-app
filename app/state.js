// ═══════════════════════════════════════
// STATE
// ═══════════════════════════════════════
let allOrders = [];
let _ordersStamp = 0;
// Bumped every time the active POS connection (cp_api_url) changes — lets
// in-flight loadData()/ensureOrdersLoadedThrough() calls started against the
// PREVIOUS location detect they're stale and refuse to commit their results
// once they resolve. See location-picker.js:_activateLocation()/_deactivateLocation().
let _locationEpoch = 0;
let dayOffset = 0;
let chartWeek = null, chartMonth = null;

let menuItems = [];   // [{id, name, cat, price}] — populated by loadLocalData()

// Name→menuItem lookup, rebuilt only when menuItems itself is reassigned
// (loadLocalData() always creates a fresh array when it changes, so caching
// by reference is safe and self-invalidating). Every per-order-item
// consumer (helpers.js:calcConsumption(), page-today.js/page-daily.js/
// page-revenue.js's item aggregations) used to call menuItems.find() once
// PER ITEM — an O(orders × items × menuItems) scan that measured over a
// full second of main-thread blocking on a POS with a few thousand orders
// loaded (page-recette.js's day-by-day table makes it worse still, calling
// calcConsumption() once per day of the month). _menuByName() turns every
// one of those into an O(1) Map.get(), so the real cost becomes
// O(orders × items + menuItems) — the lookup building is now a single pass
// over the (typically small) menu, not one per order line.
let _menuByNameCache = null;
let _menuByNameCacheFor = null;
function _menuByName() {
  if (_menuByNameCacheFor !== menuItems) {
    _menuByNameCache = new Map(menuItems.map(m => [m.name, m]));
    _menuByNameCacheFor = menuItems;
  }
  return _menuByNameCache;
}

let _restocks = {};   // key → [{id, date, amount}]

let _marcCategories = []; // marc_categories: [{id, nom, sort_order}]
let _marcArticles   = []; // marc_articles: [{id, nom, cat_id, pu, pkg, pl, barcode, unit_label, conv_pkg, conv_pl}]
let _marcAchats     = []; // marc_achats: [{id, article_id, date, qty_pu, qty_pkg, qty_pl}]
let _marcLinks      = []; // marc_links: [{id, article_id, item_name, qty_per_sale}]
let _salStaff  = [];  // [{id, name, rate}]
let _salDays   = {};  // staffId → {dayKey: "status" or "status:amount"}
let _charges   = [];  // [{id, name}]
let _chargeDays = {}; // chargeId → {dayKey: amount}
let _fixedCharge = parseFloat(localStorage.getItem('fixedCharge') ?? '400');

