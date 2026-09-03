// ═══════════════════════════════════════
// TODAY
// ═══════════════════════════════════════
const TODAY_MAX_OFFSET = -7;
let _todayViewMode = 'orders';

function changeTodayDay(dir) {
  dayOffset = Math.max(TODAY_MAX_OFFSET, Math.min(0, dayOffset + dir));
  renderToday();
}

function setTodayViewMode(mode) {
  _todayViewMode = mode;
  document.getElementById('t-view-btn-orders').classList.toggle('active', mode === 'orders');
  document.getElementById('t-view-btn-articles').classList.toggle('active', mode === 'articles');
  document.getElementById('t-recent').style.display = mode === 'orders' ? 'block' : 'none';
  document.getElementById('t-articles').style.display = mode === 'articles' ? 'block' : 'none';
}

function renderToday() {
  const day = new Date();
  day.setDate(day.getDate() + dayOffset);
  const dayKey = getDayKey(day);
  const orders = allOrders.filter(o => getDayKey(o.time) === dayKey);

  document.getElementById('today-loading').style.display = 'none';
  document.getElementById('today-content').style.display = 'block';

  // Day label + nav state
  const isToday = dayOffset === 0;
  const isYesterday = dayOffset === -1;
  const dayLabel = isToday ? "Aujourd'hui" : isYesterday ? 'Hier' : day.toLocaleDateString('fr-MA', { weekday: 'long', day: '2-digit', month: 'long' });
  document.getElementById('t-day-label').textContent = isToday || isYesterday
    ? dayLabel + ' — ' + day.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' })
    : dayLabel;
  document.getElementById('t-day-prev').disabled = dayOffset <= TODAY_MAX_OFFSET;
  document.getElementById('t-day-next').disabled = dayOffset >= 0;

  const dayLabelLower = dayLabel.toLowerCase();
  document.getElementById('t-sub-orders').textContent = dayLabelLower;
  document.getElementById('t-sub-revenue').textContent = 'Dhs ' + dayLabelLower;
  document.getElementById('t-servers-title').textContent = dayLabel;
  document.getElementById('t-barista-title').textContent = dayLabel;

  const emptyMsg = `<div class="empty">Aucune commande ${dayLabelLower}</div>`;

  const total = orders.reduce((s, o) => s + o.total, 0);
  const items = orders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.qty, 0), 0);
  document.getElementById('t-orders').textContent = orders.length;
  document.getElementById('t-revenue').textContent = fmtMoney(total);
  document.getElementById('t-avg').textContent = orders.length ? fmtMoney(total / orders.length) : '0.00';
  document.getElementById('t-items').textContent = items;

  // By server
  const srvMap = {};
  orders.forEach(o => { srvMap[o.server] = (srvMap[o.server] || 0) + o.total; });
  const srvEntries = Object.entries(srvMap).sort((a, b) => b[1] - a[1]);
  document.getElementById('t-servers').innerHTML = srvEntries.length
    ? srvEntries.map(([name, tot]) => `
        <div class="row">
          <div class="row-name">${name}</div>
          <div class="row-val">${fmtMoney(tot)} Dhs</div>
        </div>`).join('')
    : emptyMsg;

  renderBaristaReport(orders, dayLabelLower);

  // Articles sold (aggregated qty/revenue per article name) — revenue uses
  // each cart line's OWN recorded price (i.price), not a live menu-catalog
  // lookup: an item renamed/deleted/repriced since the order was placed
  // would otherwise silently undercount (or drop entirely) here while
  // `total` above (built from each order's own already-correct total)
  // stayed right, making this list's TOTAL drift from "Chiffre d'affaires".
  // Passing `total` itself as the TOTAL line (rather than re-summing this
  // map) guarantees the two can never disagree, matching how
  // page-daily.js's monthly Articles vendus receipt already does it.
  const articleMap = {};
  orders.forEach(o => o.items.forEach(i => {
    if (!articleMap[i.name]) articleMap[i.name] = { qty: 0, revenue: 0 };
    articleMap[i.name].qty += i.qty;
    articleMap[i.name].revenue += i.qty * i.price;
  }));
  const articleEntries = Object.entries(articleMap).sort((a, b) => b[1].qty - a[1].qty);
  renderReceiptIframe(
    't-articles-frame', 'ARTICLES VENDUS', dayLabel,
    articleEntries.map(([name, d]) => ({ name, qty: d.qty, amount: fmtMoney(d.revenue) })),
    'TOTAL', fmtMoney(total)
  );

  setTodayViewMode(_todayViewMode);

  // Recent orders (last 20)
  const recent = orders;
  document.getElementById('t-recent').innerHTML = recent.length
    ? recent.map(o => `
        <div class="live-order">
          <div class="live-order-top">
            <span>N° ${String(o.num).padStart(4,'0')}</span>
            <span>${fmtTime(o.time)}</span>
          </div>
          ${o.server !== '—' ? `<div class="live-order-server">${o.server}</div>` : ''}
          <div class="live-order-items">${o.items.map(i => `
              <div class="live-order-item-row">
                <span class="live-order-qtybadge">${i.qty}</span>
                <span>${i.name}</span>
              </div>`).join('')}</div>
          <div class="live-order-total">${fmtMoney(o.total)} Dhs</div>
        </div>`).join('')
    : emptyMsg;
}
