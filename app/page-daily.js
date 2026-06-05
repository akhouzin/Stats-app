// ═══════════════════════════════════════
// RAPPORT DU JOUR
// ═══════════════════════════════════════
function changeDay(dir) {
  const days = getUniqueDays(allOrders);
  dayOffset = Math.max(0, Math.min(days.length - 1, dayOffset + dir));
  renderRapport();
}

function renderRapport() {
  document.getElementById('rapport-loading').style.display = 'none';
  document.getElementById('rapport-content').style.display = 'block';

  const days = getUniqueDays(allOrders);
  if (!days.length) {
    document.getElementById('r-day-label').textContent = '—';
    document.getElementById('r-items').innerHTML = '<div class="empty">Chargement des données…</div>';
    document.getElementById('r-consumption').innerHTML = '';
    return;
  }

  const todayKey = getDayKey(new Date());
  // Default to the most recent day that has actual orders, not today (which may be empty).
  if (dayOffset === 0 && !days.includes(todayKey)) {
    // days[0] is already the most recent day with data — keep dayOffset=0
  } else if (dayOffset === 0 && days.includes(todayKey)) {
    // today has no orders yet; jump to first day that does
    const firstWithOrders = days.findIndex(d => d !== todayKey);
    if (firstWithOrders > 0) dayOffset = firstWithOrders;
    days.unshift(todayKey);
  } else {
    if (!days.includes(todayKey)) days.unshift(todayKey);
  }

  dayOffset = Math.max(0, Math.min(days.length - 1, dayOffset));
  const key = days[dayOffset];
  const date = parseDay(key);

  document.getElementById('r-day-label').textContent = fmtDate(date);
  document.getElementById('r-day-sub').textContent = dayOffset === 0 ? "Aujourd'hui" : '';
  document.getElementById('r-prev').disabled = dayOffset >= days.length - 1;
  document.getElementById('r-next').disabled = dayOffset <= 0;

  const orders = allOrders.filter(o => getDayKey(o.time) === key).sort((a, b) => a.time - b.time);

  const total = orders.reduce((s, o) => s + o.total, 0);
  document.getElementById('r-orders').textContent = orders.length;
  document.getElementById('r-total').textContent = fmtMoney(total);

  // Items
  const itemMap = {};
  orders.forEach(o => o.items.forEach(item => {
    if (!itemMap[item.name]) itemMap[item.name] = { qty: 0, rev: 0 };
    itemMap[item.name].qty += item.qty;
    itemMap[item.name].rev += item.price * item.qty;
  }));
  const sortedItems = Object.entries(itemMap).sort((a, b) => b[1].rev - a[1].rev);
  const maxRev = sortedItems[0]?.[1].rev || 1;
  document.getElementById('r-items').innerHTML = sortedItems.length
    ? sortedItems.map(([name, d]) => `
        <div class="row">
          <div><div class="row-name">${name}</div>
            <div class="bar-wrap"><div class="bar-fill" style="width:${(d.rev/maxRev*100).toFixed(0)}%"></div></div>
          </div>
          <div class="row-right"><div class="row-val">×${d.qty}</div><div class="row-dim">${fmtMoney(d.rev)} Dhs</div></div>
        </div>`).join('')
    : '<div class="empty">Aucune commande</div>';

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
