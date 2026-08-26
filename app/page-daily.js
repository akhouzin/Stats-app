// ═══════════════════════════════════════
// RAPPORT DU MOIS
// ═══════════════════════════════════════
let _rapportViewMode = 'simple';

function setRapportViewMode(mode) {
  _rapportViewMode = mode;
  document.getElementById('r-view-btn-simple').classList.toggle('active', mode === 'simple');
  document.getElementById('r-view-btn-trends').classList.toggle('active', mode === 'trends');
  document.getElementById('r-view-btn-sales').classList.toggle('active', mode === 'sales');
  document.getElementById('r-kpi-simple').style.display = mode === 'simple' ? 'grid' : 'none';
  document.getElementById('r-kpi-trends').style.display = mode === 'trends' ? 'grid' : 'none';
  document.getElementById('r-kpi-sales').style.display = mode === 'sales' ? 'grid' : 'none';
}

function renderRapport() {
  document.getElementById('rapport-loading').style.display = 'none';
  document.getElementById('rapport-content').style.display = 'block';

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  document.getElementById('r-month-label').textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const orders = allOrders.filter(o => o.time >= monthStart).sort((a, b) => a.time - b.time);

  if (!orders.length) {
    document.getElementById('r-orders').textContent = '0';
    document.getElementById('r-total').textContent = '0.00';
    document.getElementById('r-avg').textContent = '0.00';
    document.getElementById('r-units').textContent = '0';
    document.getElementById('r-day-avg').textContent = '0.00';
    document.getElementById('r-active-days').textContent = '0 jours actifs';
    document.getElementById('r-items-per-order').textContent = '0.0';
    document.getElementById('r-best-day').textContent = '—';
    document.getElementById('r-best-day-amount').textContent = '—';
    document.getElementById('r-trend-ca').textContent = '—';
    document.getElementById('r-trend-cmd').textContent = '—';
    document.getElementById('r-top-article').textContent = '—';
    document.getElementById('r-top-article-amount').textContent = '—';
    document.getElementById('r-top-category').textContent = '—';
    document.getElementById('r-top-category-amount').textContent = '—';
    document.getElementById('r-avg-item-price').textContent = '0.00';
    document.getElementById('r-multi-item-pct').textContent = '0%';
    document.getElementById('r-items').innerHTML = '<div class="empty">Aucune commande ce mois</div>';
    document.getElementById('r-consumption').innerHTML = '';
    setRapportViewMode(_rapportViewMode);
    return;
  }

  const total = orders.reduce((s, o) => s + o.total, 0);
  const units = orders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.qty, 0), 0);
  document.getElementById('r-orders').textContent = orders.length;
  document.getElementById('r-total').textContent = fmtMoney(total);
  document.getElementById('r-avg').textContent = fmtMoney(total / orders.length);
  document.getElementById('r-units').textContent = units;

  // Per-article revenue/qty — computed once here, reused by the Ventes tab's "Article Vedette"
  // tile below and by the "Articles vendus" list further down.
  const itemMap = {};
  orders.forEach(o => o.items.forEach(item => {
    if (!itemMap[item.name]) itemMap[item.name] = { qty: 0, rev: 0 };
    itemMap[item.name].qty += item.qty;
    itemMap[item.name].rev += item.price * item.qty;
  }));
  const sortedItems = Object.entries(itemMap).sort((a, b) => b[1].rev - a[1].rev);

  // Tendances — how the 4 headline numbers relate day-to-day and vs last month.
  // Kept to exactly 4 tiles (same as #r-kpi-simple/#r-kpi-sales) so the toggle never
  // changes the grid's size/row-count — switching modes must not shift the cards below it.
  const activeDays = getUniqueDays(orders).length;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const itemsPerOrder = units / orders.length;

  document.getElementById('r-day-avg').textContent = fmtMoney(total / activeDays);
  document.getElementById('r-active-days').textContent = `Dhs · ${activeDays}/${daysInMonth} jours actifs`;
  document.getElementById('r-items-per-order').textContent = itemsPerOrder.toFixed(1);

  const dayTotals = {};
  orders.forEach(o => { const dk = getDayKey(o.time); dayTotals[dk] = (dayTotals[dk] || 0) + o.total; });
  const [bestDayKey, bestDayTotal] = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('r-best-day').textContent = parseDay(bestDayKey).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
  document.getElementById('r-best-day-amount').textContent = `${fmtMoney(bestDayTotal)} Dhs`;

  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevOrders = allOrders.filter(o => o.time >= prevMonthStart && o.time < monthStart);
  const trendCaEl = document.getElementById('r-trend-ca');
  const trendCmdEl = document.getElementById('r-trend-cmd');
  if (prevOrders.length) {
    const prevTotal = prevOrders.reduce((s, o) => s + o.total, 0);
    const revDelta = prevTotal > 0 ? ((total - prevTotal) / prevTotal * 100) : null;
    const cntDelta = (orders.length - prevOrders.length) / prevOrders.length * 100;
    const fmtDelta = d => d === null ? '—' : (d >= 0 ? '+' : '') + d.toFixed(0) + '%';
    trendCaEl.textContent = fmtDelta(revDelta);
    trendCaEl.className = 'kpi-value' + (revDelta === null ? '' : revDelta >= 0 ? ' green' : ' red');
    trendCmdEl.textContent = 'Commandes ' + fmtDelta(cntDelta);
    trendCmdEl.style.color = cntDelta >= 0 ? 'var(--green)' : 'var(--red)';
  } else {
    trendCaEl.textContent = '—';
    trendCaEl.className = 'kpi-value';
    trendCmdEl.textContent = 'Pas de données';
    trendCmdEl.style.color = '';
  }

  // Ventes — sales composition this month (works for a solo owner with no staff, unlike a
  // server/staff breakdown which is meaningless when there's only ever one user).
  const [topArticleName, topArticleData] = sortedItems[0] || [];
  document.getElementById('r-top-article').textContent = topArticleName || '—';
  document.getElementById('r-top-article-amount').textContent = topArticleData ? `${fmtMoney(topArticleData.rev)} Dhs` : '—';

  const catMap = {};
  orders.forEach(o => o.items.forEach(item => {
    const mi = menuItems.find(m => m.name === item.name);
    const cat = mi ? mi.cat : 'Autre';
    catMap[cat] = (catMap[cat] || 0) + item.price * item.qty;
  }));
  const rankedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  document.getElementById('r-top-category').textContent = rankedCats.length ? rankedCats[0][0] : '—';
  document.getElementById('r-top-category-amount').textContent = rankedCats.length ? `${fmtMoney(rankedCats[0][1])} Dhs` : '—';

  document.getElementById('r-avg-item-price').textContent = fmtMoney(total / units);

  const multiItemOrders = orders.filter(o => o.items.reduce((s, i) => s + i.qty, 0) > 1).length;
  document.getElementById('r-multi-item-pct').textContent = `${(multiItemOrders / orders.length * 100).toFixed(0)}%`;

  setRapportViewMode(_rapportViewMode);

  // Items
  const maxRev = sortedItems[0]?.[1].rev || 1;
  document.getElementById('r-items').innerHTML = sortedItems.map(([name, d]) => `
      <div class="row">
        <div><div class="row-name">${name}</div>
          <div class="bar-wrap"><div class="bar-fill" style="width:${(d.rev/maxRev*100).toFixed(0)}%"></div></div>
        </div>
        <div class="row-right"><div class="row-val">×${d.qty}</div><div class="row-dim">${fmtMoney(d.rev)} Dhs</div></div>
      </div>`).join('');

  // Consumption
  const { water, water50, oulmes, oulmesFr, sodas, coffeeG, milkCl, theG, sucreTHe, sucreCafe } = calcConsumption(orders);
  const consRows = [
    ['Eau minérale 33cl',   water,     `bouteille${water > 1 ? 's' : ''}`],
    ['Eau minérale 50cl',   water50,   `bouteille${water50 > 1 ? 's' : ''}`],
    ['Eau gazeuse Oulmes',  oulmes,    `bouteille${oulmes > 1 ? 's' : ''}`],
    ['Eau Oulmes fruitées', oulmesFr,  `bouteille${oulmesFr > 1 ? 's' : ''}`],
    ['Sodas',               sodas,     `unité${sodas > 1 ? 's' : ''}`],
    ['Café',                coffeeG,   'g'],
    ['Lait',                milkCl,    'cl'],
    ['Thé Marocain',        theG,      'g'],
    ['Sucre thé',           sucreTHe,  `pcs`],
    ['Sucre café',          sucreCafe, `pcs`],
  ].filter(([, qty]) => qty > 0);
  document.getElementById('r-consumption').innerHTML = consRows.length
    ? consRows.map(([l, qty, u]) =>
        `<div class="cons-row"><span class="cons-label">${l}</span><span class="cons-val">${qty} ${u}</span></div>`
      ).join('')
    : '<div class="empty">Aucune consommation</div>';
}

// ═══════════════════════════════════════
// TOP ITEMS
// ═══════════════════════════════════════
