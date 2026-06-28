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

async function loadData() {
  if (!getApiBase()) return;
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
  }
}

// ═══════════════════════════════════════
// AUTO REFRESH every 60s
// ═══════════════════════════════════════
setInterval(loadData, 60000);
