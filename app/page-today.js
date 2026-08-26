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

  // Articles sold (aggregated qty/revenue per article name)
  const articleMap = {};
  orders.forEach(o => o.items.forEach(i => {
    const mi = menuItems.find(m => m.name === i.name);
    if (!articleMap[i.name]) articleMap[i.name] = { qty: 0, revenue: 0 };
    articleMap[i.name].qty += i.qty;
    if (mi) articleMap[i.name].revenue += i.qty * mi.price;
  }));
  const articleEntries = Object.entries(articleMap).sort((a, b) => b[1].qty - a[1].qty);
  document.getElementById('t-articles').innerHTML = articleEntries.length
    ? articleEntries.map(([name, d]) => `
        <div class="row">
          <div class="row-name">${name} <span class="row-dim">×${d.qty}</span></div>
          <div class="row-val">${fmtMoney(d.revenue)} Dhs</div>
        </div>`).join('')
    : emptyMsg;

  setTodayViewMode(_todayViewMode);

  // Recent orders (last 20)
  const recent = orders;
  document.getElementById('t-recent').innerHTML = recent.length
    ? recent.map(o => `
        <div class="live-order">
          <div class="live-order-top">
            <span>N° ${String(o.num).padStart(4,'0')} — ${fmtTime(o.time)}</span>
            <span>${fmtMoney(o.total)} Dhs</span>
          </div>
          <div class="live-order-items">${o.items.map(i => `${i.name} ×${i.qty}`).join(' · ')}</div>
          ${o.server !== '—' ? `<div style="font-size:11px;color:var(--text-dim);margin-top:3px;">${o.server}</div>` : ''}
        </div>`).join('')
    : emptyMsg;
}
