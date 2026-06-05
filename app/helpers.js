// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
function getDayKey(date) {
  return date.toLocaleDateString('fr-MA', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
function fmtMoney(n) { return n.toFixed(2); }
function fmtTime(date) { return date.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' }); }
function fmtDate(date) { return date.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); }
function fmtDateShort(date) { return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); }

function getUniqueDays(orders) {
  const days = new Set(orders.map(o => getDayKey(o.time)));
  return [...days].sort((a, b) => {
    const pa = a.split('/'), pb = b.split('/');
    return new Date(pb[2], pb[1]-1, pb[0]) - new Date(pa[2], pa[1]-1, pa[0]);
  });
}

function parseDay(key) {
  const p = key.split('/');
  return new Date(p[2], p[1]-1, p[0]);
}

function getMonthStart() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
}

// Consumption calc for a set of orders
function calcConsumption(orders) {
  const coffeeKw = ['espresso', 'café', 'cafe', 'nespresso', 'latte', 'cappuccino', 'iced', 'frappuccino'];
  const milkKw   = ['lait', 'latte', 'cappuccino', 'creme', 'viennoise', 'chocolat', 'ness ness'];
  let water = 0, coffeeG = 0, milkCl = 0, theG = 0;
  let water50 = 0, oulmes = 0, oulmesFr = 0, sodas = 0;
  let sucreTHe = 0, sucreCafe = 0;
  orders.forEach(o => {
    o.items.forEach(item => {
      const mi = menuItems.find(m => m.name === item.name);
      if (!mi) return;
      const nl = item.name.toLowerCase();
      const hasCoffee = coffeeKw.some(k => nl.includes(k));
      const hasMilk   = milkKw.some(k => nl.includes(k));
      const noWater33 = ['Espresso Sans eau', 'Thé Marocain sans eau', 'Lait froid'];
      if (mi.cat === 'Boissons Chaudes' && !noWater33.includes(item.name)) water += item.qty;
      if (hasCoffee) coffeeG += item.qty * 10;
      if (hasMilk)   milkCl  += item.qty * 10;
      if (item.name === 'Thé Marocain')        theG     += item.qty * 5;
      if (item.name === 'Eau minérale 50CL')   water50  += item.qty;
      if (item.name === 'Eau gazeuse Oulmes')  oulmes   += item.qty;
      if (item.name === 'Eau Oulmes fruitées') oulmesFr += item.qty;
      if (item.name === 'Sodas')               sodas    += item.qty;
      // Water items outside Boissons Chaudes (e.g. Menu Personnel) — skip already-named items to avoid double count
      if (mi.cat !== 'Boissons Chaudes' && nl.includes('eau') &&
          item.name !== 'Eau minérale 50CL' &&
          item.name !== 'Eau gazeuse Oulmes' &&
          item.name !== 'Eau Oulmes fruitées') {
        if (nl.includes('oulmes') && nl.includes('fruit')) oulmesFr += item.qty;
        else if (nl.includes('oulmes') || nl.includes('gazeuse')) oulmes += item.qty;
        else if (nl.includes('50')) water50 += item.qty;
        else water += item.qty;
      }
      // Sugar
      if (item.name === 'Thé Marocain') {
        sucreTHe += item.qty * 1;
      } else if (noWater33.includes(item.name) || item.name === 'Espresso') {
        sucreCafe += item.qty * 2;
      } else if (mi.cat === 'Boissons Chaudes') {
        sucreCafe += item.qty * 2;
      }
    });
  });
  return { water, coffeeG, milkCl, theG, water50, oulmes, oulmesFr, sodas, sucreTHe, sucreCafe };
}

// ═══════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();
