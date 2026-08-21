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

// loadData() has two phases of very different cost: "today" (small, fast —
// one narrow date-range query) and "full history" (the entire unfiltered
// mirror_orders table, needed for the Rapport/Recette/Salaire/Insights tabs'
// month-over-month navigation, which has no fixed lookback limit). Callers
// that just need the dashboard to be usable again (e.g. a Stats location
// switch) can pass onTodayReady to be notified once the fast phase lands,
// instead of waiting on the full-history phase too — see
// Stats/app/location-picker.js:_switchWithTransition().
async function loadData(onTodayReady) {
  if (!getApiBase()) { if (typeof onTodayReady === 'function') onTodayReady(); return; }
  loadStatsBranding();
  try {
    const [cancelledData, todayRaw] = await Promise.all([
      apiGet('/api/cancelled'),
      fetchTodayOrders(),
      loadLocalData(),
    ]);

    const cancelledKeys = new Set(cancelledData.map(r => `${r.num}|${r.dateKey}`));
    allOrders = mapOrders(todayRaw, cancelledKeys);
    _ordersStamp++;

    document.getElementById('live-status').textContent = 'En ligne';
    renderToday();
    renderSalaire();
    renderRecette();
    if (typeof onTodayReady === 'function') onTodayReady();

    document.getElementById('live-status').textContent = 'Chargement…';
    const allRaw = await fetchAllOrders();
    allOrders = mapOrders(allRaw, cancelledKeys);
    _ordersStamp++;
    clearConsumptionCache();
    historyLoaded = true;
    document.getElementById('live-status').textContent = 'En ligne';

    renderPage(currentPage);

  } catch (e) {
    console.error(e);
    document.getElementById('live-status').textContent = 'Erreur connexion';
    if (typeof onTodayReady === 'function') onTodayReady();
  }
}

// ═══════════════════════════════════════
// AUTO REFRESH every 60s
// ═══════════════════════════════════════
setInterval(loadData, 60000);
