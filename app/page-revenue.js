// ═══════════════════════════════════════
// REVENUE
// ═══════════════════════════════════════
let _revStamp = -1;

function renderInsights() {
  const orders = allOrders;
  if (!orders.length) {
    document.getElementById('rev-insights').innerHTML = '<div class="empty">Pas assez de données</div>';
    return;
  }

  // ── Hours ──
  const hourMap = {};
  orders.forEach(o => {
    const h = o.time.getHours();
    if (!hourMap[h]) hourMap[h] = { total: 0, count: 0 };
    hourMap[h].total += o.total;
    hourMap[h].count++;
  });
  const hourEntries = Object.entries(hourMap)
    .filter(([, v]) => v.count >= 3)
    .map(([h, v]) => ({ h: +h, total: v.total, count: v.count }))
    .sort((a, b) => b.count - a.count);
  const rushHours = hourEntries.slice(0, 3);
  const deadHours = [...hourEntries].sort((a, b) => a.count - b.count).slice(0, 3);

  // ── Days of week ──
  const DAY_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const dayMap = {};
  orders.forEach(o => {
    const d = o.time.getDay();
    const dk = getDayKey(o.time);
    if (!dayMap[d]) dayMap[d] = { total: 0, count: 0, days: new Set() };
    dayMap[d].total += o.total;
    dayMap[d].count++;
    dayMap[d].days.add(dk);
  });
  const dayEntries = Object.entries(dayMap)
    .filter(([, v]) => v.days.size >= 1)
    .map(([d, v]) => ({ name: DAY_FR[+d], avgDay: v.total / v.days.size, count: v.count }))
    .sort((a, b) => b.avgDay - a.avgDay);
  const rushDays = dayEntries.slice(0, 3);
  const deadDays = [...dayEntries].sort((a, b) => a.avgDay - b.avgDay).slice(0, 3);

  // ── Menu items ──
  const itemMap = {};
  orders.forEach(o => {
    o.items.forEach(item => {
      const mi = menuItems.find(m => m.name === item.name);
      if (!mi) return;
      if (!itemMap[item.name]) itemMap[item.name] = { qty: 0, revenue: 0 };
      itemMap[item.name].qty += item.qty;
      itemMap[item.name].revenue += item.qty * mi.price;
    });
  });
  const topQty = Object.entries(itemMap).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);
  const topRev = Object.entries(itemMap).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
  const maxQty = topQty[0]?.[1].qty || 1;
  const maxRev = topRev[0]?.[1].revenue || 1;

  const noData = '<div class="empty" style="padding:6px 0;font-size:11px;">Pas assez de données</div>';
  const fmtH = h => `${h}h – ${h+1}h`;

  const hourRow = (item, rush) => `
    <div class="ins-item">
      <span class="ins-badge ${rush ? 'ins-rush' : 'ins-dead'}">${fmtH(item.h)}</span>
      <span class="ins-item-stats">${item.count} cmd · ${fmtMoney(item.total)} Dhs</span>
    </div>`;

  const dayRow = (item, rush) => `
    <div class="ins-item">
      <span class="ins-badge ${rush ? 'ins-rush' : 'ins-dead'}">${item.name}</span>
      <span class="ins-item-stats">moy. ${fmtMoney(item.avgDay)} Dhs/j</span>
    </div>`;

  const prodRow = (name, val, max, label, idx) => `
    <div class="ins-prod-row">
      <span class="ins-prod-rank">${idx+1}</span>
      <span class="ins-prod-name">${name}</span>
      <div class="ins-prod-bar-wrap"><div class="ins-prod-bar" style="width:${Math.round(val/max*100)}%"></div></div>
      <span class="ins-prod-val">${label}</span>
    </div>`;

  document.getElementById('rev-insights').innerHTML = `
    <div class="ins-section">
      <div class="ins-section-title">Heures de pointe &amp; Heures creuses</div>
      <div class="ins-cols">
        <div>
          <div class="ins-col-label ins-rush-label">Pointe</div>
          ${rushHours.length ? rushHours.map(h => hourRow(h, true)).join('') : noData}
        </div>
        <div>
          <div class="ins-col-label ins-dead-label">Creuses</div>
          ${deadHours.length ? deadHours.map(h => hourRow(h, false)).join('') : noData}
        </div>
      </div>
    </div>
    <div class="ins-divider"></div>
    <div class="ins-section">
      <div class="ins-section-title">Jours de pointe &amp; Jours creux</div>
      <div class="ins-cols">
        <div>
          <div class="ins-col-label ins-rush-label">Pointe</div>
          ${rushDays.length ? rushDays.map(d => dayRow(d, true)).join('') : noData}
        </div>
        <div>
          <div class="ins-col-label ins-dead-label">Creux</div>
          ${deadDays.length ? deadDays.map(d => dayRow(d, false)).join('') : noData}
        </div>
      </div>
    </div>
    <div class="ins-divider"></div>
    <div class="ins-section">
      <div class="ins-section-title">Top produits — Quantité vendue</div>
      ${topQty.length ? topQty.map(([name, v], i) => prodRow(name, v.qty, maxQty, `${v.qty} vendus`, i)).join('') : noData}
    </div>
    <div class="ins-divider"></div>
    <div class="ins-section" style="padding-bottom:0;">
      <div class="ins-section-title">Top produits — Chiffre d'affaires</div>
      ${topRev.length ? topRev.map(([name, v], i) => prodRow(name, v.revenue, maxRev, `${fmtMoney(v.revenue)} Dhs`, i)).join('') : noData}
    </div>`;
}

function renderRevenue() {
  if (_revStamp === _ordersStamp) return;
  _revStamp = _ordersStamp;

  document.getElementById('revenue-loading').style.display = 'none';
  document.getElementById('revenue-content').style.display = 'block';
  renderInsights();

  const now = new Date();

  // Single pass: build day map + month map together
  const dayRevMap = {};
  const monthMap = {};
  allOrders.forEach(o => {
    const dk = getDayKey(o.time);
    dayRevMap[dk] = (dayRevMap[dk] || 0) + o.total;
    const mk = `${o.time.getFullYear()}-${String(o.time.getMonth()+1).padStart(2,'0')}`;
    if (!monthMap[mk]) monthMap[mk] = { total: 0, count: 0 };
    monthMap[mk].total += o.total;
    monthMap[mk].count++;
  });

  // Last 7 days
  const weekDays = [];
  const weekRevs = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    weekDays.push(fmtDateShort(d));
    weekRevs.push(parseFloat((dayRevMap[getDayKey(d)] || 0).toFixed(2)));
  }

  if (chartWeek) {
    chartWeek.data.labels = weekDays;
    chartWeek.data.datasets[0].data = weekRevs;
    chartWeek.update('none');
  } else {
    chartWeek = new Chart(document.getElementById('chart-week'), {
      type: 'bar',
      data: {
        labels: weekDays,
        datasets: [{ data: weekRevs, backgroundColor: '#111', borderRadius: 6, borderSkipped: false }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { ticks: { font: { size: 10 }, autoSkip: true, maxTicksLimit: 7 }, grid: { display: false } }
        }
      }
    });
  }

  // This month by day
  const mLabels = [], mData = [];
  for (let d = 1; d <= now.getDate(); d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), d);
    mLabels.push(d);
    mData.push(parseFloat((dayRevMap[getDayKey(day)] || 0).toFixed(2)));
  }

  if (chartMonth) {
    chartMonth.data.labels = mLabels;
    chartMonth.data.datasets[0].data = mData;
    chartMonth.update('none');
  } else {
    chartMonth = new Chart(document.getElementById('chart-month'), {
      type: 'line',
      data: {
        labels: mLabels,
        datasets: [{
          data: mData,
          borderColor: '#111', backgroundColor: 'rgba(0,0,0,0.05)',
          borderWidth: 2, pointRadius: 3, fill: true, tension: 0.3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { ticks: { font: { size: 10 }, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } }
        }
      }
    });
  }

  // Monthly summary
  const monthEntries = Object.entries(monthMap).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  document.getElementById('rev-monthly').innerHTML = monthEntries.map(([mk, d]) => {
    const [y, m] = mk.split('-');
    const label = new Date(y, m-1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return `
      <div class="row">
        <div class="row-name">${label.charAt(0).toUpperCase() + label.slice(1)}</div>
        <div class="row-right">
          <div class="row-val">${fmtMoney(d.total)} Dhs</div>
          <div class="row-dim">${d.count} commandes</div>
        </div>
      </div>`;
  }).join('') || '<div class="empty">Aucune donnée</div>';
}
