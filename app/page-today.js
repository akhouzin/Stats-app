// ═══════════════════════════════════════
// TODAY
// ═══════════════════════════════════════
function renderToday() {
  const todayKey = getDayKey(new Date());
  const orders = allOrders.filter(o => getDayKey(o.time) === todayKey);

  document.getElementById('today-loading').style.display = 'none';
  document.getElementById('today-content').style.display = 'block';

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
    : '<div class="empty">Aucune commande aujourd\'hui</div>';

  renderBaristaReport(orders);

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
          <div style="margin-top:6px;text-align:right;">
            <button onclick="cancelOrder(${o.num})" style="background:none;border:1px solid var(--red);border-radius:6px;padding:3px 10px;font-size:11px;color:var(--red);cursor:pointer;font-family:'Cinzel',serif;letter-spacing:0.5px;">Annuler</button>
          </div>
        </div>`).join('')
    : '<div class="empty">Aucune commande aujourd\'hui</div>';
}

async function cancelOrder(num) {
  if (!confirm(`Annuler la commande N° ${String(num).padStart(4,'0')} ?`)) return;
  const { error } = await sb.from('cancelled_orders').insert({ num });
  if (error) { alert('Erreur: ' + error.message); return; }
  allOrders = allOrders.filter(o => o.num !== num);
  renderAll();
}
