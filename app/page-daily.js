// ═══════════════════════════════════════
// RAPPORT DU MOIS
// ═══════════════════════════════════════
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
    document.getElementById('r-items').innerHTML = '<div class="empty">Aucune commande ce mois</div>';
    document.getElementById('r-consumption').innerHTML = '';
    return;
  }

  const total = orders.reduce((s, o) => s + o.total, 0);
  const units = orders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.qty, 0), 0);
  document.getElementById('r-orders').textContent = orders.length;
  document.getElementById('r-total').textContent = fmtMoney(total);
  document.getElementById('r-avg').textContent = fmtMoney(total / orders.length);
  document.getElementById('r-units').textContent = units;

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
