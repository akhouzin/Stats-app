// ═══════════════════════════════════════
// STATE
// ═══════════════════════════════════════
let allOrders = [];
let _ordersStamp = 0;
let dayOffset = 0;
let chartWeek = null, chartMonth = null;

let menuItems = [];   // [{id, name, cat, price}] — populated by loadLocalData()

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

