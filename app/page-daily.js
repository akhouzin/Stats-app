// ═══════════════════════════════════════
// RAPPORT DU MOIS
// ═══════════════════════════════════════
let _rapportViewMode = 'simple';

function setRapportViewMode(mode) {
  _rapportViewMode = mode;
  document.getElementById('r-view-btn-simple').classList.toggle('active', mode === 'simple');
  document.getElementById('r-view-btn-detailed').classList.toggle('active', mode === 'detailed');
  document.getElementById('r-kpi-simple').style.display = mode === 'simple' ? 'grid' : 'none';
  document.getElementById('r-kpi-detailed').style.display = mode === 'detailed' ? 'block' : 'none';
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
    document.getElementById('r-detailed-rows').innerHTML = '<div class="empty">Aucune commande ce mois</div>';
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

  // Detailed breakdown — how the 4 headline numbers relate day-to-day and vs last month
  const activeDayKeys = getUniqueDays(orders);
  const activeDays = activeDayKeys.length;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const avgPerActiveDay = total / activeDays;
  const ordersPerActiveDay = orders.length / activeDays;
  const itemsPerOrder = units / orders.length;

  const dayTotals = {};
  orders.forEach(o => { const dk = getDayKey(o.time); dayTotals[dk] = (dayTotals[dk] || 0) + o.total; });
  const [bestDayKey, bestDayTotal] = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];
  const bestDayLabel = parseDay(bestDayKey).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });

  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevOrders = allOrders.filter(o => o.time >= prevMonthStart && o.time < monthStart);
  let trendHtml = '<span style="color:var(--text-dim);">Pas de données</span>';
  if (prevOrders.length) {
    const prevTotal = prevOrders.reduce((s, o) => s + o.total, 0);
    const revDelta = prevTotal > 0 ? ((total - prevTotal) / prevTotal * 100) : null;
    const cntDelta = ((orders.length - prevOrders.length) / prevOrders.length * 100);
    const fmtDelta = d => d === null ? '—' : (d >= 0 ? '+' : '') + d.toFixed(0) + '%';
    const colorOf = d => d === null ? 'var(--text-dim)' : (d >= 0 ? 'var(--green)' : 'var(--red)');
    trendHtml = `<span style="color:${colorOf(revDelta)}">CA ${fmtDelta(revDelta)}</span> · <span style="color:${colorOf(cntDelta)}">Cmd ${fmtDelta(cntDelta)}</span>`;
  }

  const detailRows = [
    ['Jours actifs', `${activeDays} / ${daysInMonth} jours`],
    ['Encaissé / jour actif', `${fmtMoney(avgPerActiveDay)} Dhs`],
    ['Commandes / jour actif', ordersPerActiveDay.toFixed(1)],
    ['Articles / commande', itemsPerOrder.toFixed(1)],
    ['Meilleur jour', `${bestDayLabel} — ${fmtMoney(bestDayTotal)} Dhs`],
    ['Vs mois dernier', trendHtml],
  ];
  document.getElementById('r-detailed-rows').innerHTML = detailRows.map(([label, val]) => `
      <div class="row">
        <div class="row-name">${label}</div>
        <div class="row-val">${val}</div>
      </div>`).join('');

  setRapportViewMode(_rapportViewMode);

  // Items
  const itemMap = {};
  orders.forEach(o => o.items.forEach(item => {
    if (!itemMap[item.name]) itemMap[item.name] = { qty: 0, rev: 0 };
    itemMap[item.name].qty += item.qty;
    itemMap[item.name].rev += item.price * item.qty;
  }));
  const sortedItems = Object.entries(itemMap).sort((a, b) => b[1].rev - a[1].rev);
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
