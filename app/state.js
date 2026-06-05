// ═══════════════════════════════════════
// STATE
// ═══════════════════════════════════════
let allOrders = [];
let _ordersStamp = 0;
let dayOffset = 0;
let chartWeek = null, chartMonth = null;

let menuItems = [];   // [{id, name, cat, price}] — populated by loadLocalData()

let _restocks = {};   // key → [{id, date, amount}]
let _salStaff  = [];  // [{id, name, rate}]
let _salDays   = {};  // staffId → {dayKey: "status" or "status:amount"}
let _charges   = [];  // [{id, name}]
let _chargeDays = {}; // chargeId → {dayKey: amount}
let _fixedCharge = parseFloat(localStorage.getItem('fixedCharge') ?? '400');

