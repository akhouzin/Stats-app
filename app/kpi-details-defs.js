// ═══════════════════════════════════════
// KPI DETAILS — what each stat card shows when tapped (kpi-details.js).
// Every builder recomputes from the same globals and the same selected
// day/month the page itself uses (dayOffset, current month, _pmcDayOffset,
// _pmcMonthOffset, page-marc-stock.js's last rows), so a panel always agrees
// with the number on its card.
// ═══════════════════════════════════════

const _KD_WEEK = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']; // Monday-first
const _kdWd = d => (d.getDay() + 6) % 7;                             // Date → 0 = Monday

// ── Sales aggregation helpers ──
function _kdUnits(o) { return o.items.reduce((s, i) => s + i.qty, 0); }

function _kdArticles(orders) {
  const m = new Map();
  orders.forEach(o => o.items.forEach(i => {
    const a = m.get(i.name) || { name: i.name, qty: 0, rev: 0 };
    a.qty += i.qty; a.rev += i.qty * i.price;
    m.set(i.name, a);
  }));
  return [...m.values()];
}

function _kdCategories(orders) {
  const byName = _menuByName();
  const m = new Map();
  orders.forEach(o => o.items.forEach(i => {
    const mi = byName.get(i.name);
    const cat = mi && mi.cat ? mi.cat : 'Autre';
    const c = m.get(cat) || { name: cat, rev: 0, qty: 0, arts: new Set() };
    c.rev += i.qty * i.price; c.qty += i.qty; c.arts.add(i.name);
    m.set(cat, c);
  }));
  return [...m.values()].sort((a, b) => b.rev - a.rev);
}

function _kdThumb(name) {
  const mi = _menuByName().get(name);
  return mi && mi.image ? _blobUrlFor(`menu|${getApiBase()}|${mi.name}`, mi.image) : '';
}

function _kdOrdersOfDay(date, untilMinutes) {
  const dk = getDayKey(date);
  return allOrders.filter(o => getDayKey(o.time) === dk
    && (untilMinutes == null || o.time.getHours() * 60 + o.time.getMinutes() <= untilMinutes));
}

function _kdTodayCtx() {
  const day = new Date();
  day.setDate(day.getDate() + dayOffset);
  return { day, orders: _kdOrdersOfDay(day) };
}

// Same month the Rapport page shows (calendar month to date).
function _kdMonthCtx() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    now, start,
    orders: allOrders.filter(o => o.time >= start),
    prev: allOrders.filter(o => o.time >= prevStart && o.time < start),
    daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
  };
}

// Business hour index (0 = the POS's day-cycle start hour) so a shop open
// past midnight gets one continuous axis instead of 00h at the far left.
function _kdHourAxis(orders, valueOf) {
  const shift = getStatsDayCycleStartHour();
  const buckets = new Array(24).fill(0);
  orders.forEach(o => { buckets[(o.time.getHours() - shift + 24) % 24] += valueOf(o); });
  let lo = buckets.findIndex(v => v > 0), hi = 23 - [...buckets].reverse().findIndex(v => v > 0);
  if (lo < 0) return { values: [], labels: [], peak: -1 };
  const values = buckets.slice(lo, hi + 1);
  const labels = values.map((_, i) => { const h = (lo + i + shift) % 24; return i % 2 === 0 ? `${h}h` : ''; });
  const peakIdx = values.indexOf(Math.max(...values));
  return { values, labels, peak: peakIdx, peakHour: (lo + peakIdx + shift) % 24 };
}

function _kdDayTotals(orders) {
  const m = new Map();
  orders.forEach(o => {
    const dk = getDayKey(o.time);
    const d = m.get(dk) || { dk, rev: 0, count: 0 };
    d.rev += o.total; d.count++;
    m.set(dk, d);
  });
  return [...m.values()];
}

function _kdDayLabel(dk) {
  return parseDay(dk).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
}

function _kdBasketBuckets(orders) {
  const edges = [[0, 10, '< 10 Dhs'], [10, 20, '10 – 20 Dhs'], [20, 50, '20 – 50 Dhs'], [50, 100, '50 – 100 Dhs'], [100, Infinity, '100 Dhs et +']];
  return edges.map(([lo, hi, label]) => {
    const n = orders.filter(o => o.total >= lo && o.total < hi).length;
    return { label, value: n, display: `${n} cmd`, sub: _kdPct(n, orders.length) };
  }).filter(r => r.value > 0);
}

function _kdMedian(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Day-of-month 1..N series for a month's orders (by business day).
function _kdMonthSeries(orders, daysShown, valueOf) {
  const vals = new Array(daysShown).fill(0);
  orders.forEach(o => {
    const d = parseDay(getDayKey(o.time)).getDate();
    if (d >= 1 && d <= daysShown) vals[d - 1] += valueOf(o);
  });
  return vals;
}
const _kdDayNumLabels = n => Array.from({ length: n }, (_, i) => (i === 0 || (i + 1) % 5 === 0 ? String(i + 1) : ''));

// Weeks of the month as 1–7, 8–14, … (plain and stable for a phone screen).
function _kdWeekOfMonth(date) { return Math.floor((date.getDate() - 1) / 7); }
const _kdWeekLabel = (w, dim) => `${w * 7 + 1} – ${Math.min(dim, w * 7 + 7)}`;

// ═══ COMMANDES (day view) ═══

_KD['t-orders'] = () => {
  const { day, orders } = _kdTodayCtx();
  if (!orders.length) return _kdEmpty('Aucune commande ce jour');
  const sorted = [...orders].sort((a, b) => a.time - b.time);
  const hours = _kdHourAxis(orders, () => 1);
  const prevDay = new Date(day); prevDay.setDate(prevDay.getDate() - 1);
  const isToday = dayOffset === 0;
  const now = new Date();
  const prev = _kdOrdersOfDay(prevDay, isToday ? now.getHours() * 60 + now.getMinutes() : null);
  const servers = new Map();
  orders.forEach(o => servers.set(o.server, (servers.get(o.server) || 0) + 1));
  return _kdStats([
    ['Première commande', fmtTime(sorted[0].time)],
    ['Dernière commande', fmtTime(sorted[sorted.length - 1].time)],
    ['Heure de pointe', `${hours.peakHour}h · ${hours.values[hours.peak]} cmd`],
    [isToday ? 'Hier à cette heure' : 'Veille', `${prev.length} ${_kdDelta(orders.length, prev.length)}`],
  ])
  + _kdSection('Commandes par heure', _kdCols(hours.values, hours.labels, { highlight: hours.peak, fmt: v => `${v} cmd` }))
  + (servers.size > 1 ? _kdSection('Par serveur', _kdBars([...servers].sort((a, b) => b[1] - a[1])
      .map(([name, n]) => ({ label: name, value: n, display: `${n} cmd`, sub: _kdPct(n, orders.length) })))) : '');
};

_KD['t-revenue'] = () => {
  const { day, orders } = _kdTodayCtx();
  if (!orders.length) return _kdEmpty('Aucune vente ce jour');
  const total = orders.reduce((s, o) => s + o.total, 0);
  const isToday = dayOffset === 0;
  const now = new Date();
  const until = isToday ? now.getHours() * 60 + now.getMinutes() : null;
  const sum = list => list.reduce((s, o) => s + o.total, 0);
  const d1 = new Date(day); d1.setDate(d1.getDate() - 1);
  const d7 = new Date(day); d7.setDate(d7.getDate() - 7);
  const prev1 = sum(_kdOrdersOfDay(d1, until)), prev7 = sum(_kdOrdersOfDay(d7, until));
  const cats = _kdCategories(orders);
  const servers = new Map();
  orders.forEach(o => servers.set(o.server, (servers.get(o.server) || 0) + o.total));
  return _kdStats([
    [isToday ? 'Hier à cette heure' : 'Veille', `${fmtMoney(prev1)} ${_kdDelta(total, prev1)}`],
    [`${_KD_WEEK[_kdWd(d7)]}. dernier${isToday ? ' (même heure)' : ''}`, `${fmtMoney(prev7)} ${_kdDelta(total, prev7)}`],
  ])
  + _kdSection('Par catégorie', _kdBars(cats.map(c => ({ label: c.name, value: c.rev, display: fmtMoney(c.rev), sub: `${_kdPct(c.rev, total)} · ${c.qty} articles` })), 6))
  + (servers.size > 1 ? _kdSection('Par serveur', _kdBars([...servers].sort((a, b) => b[1] - a[1])
      .map(([name, v]) => ({ label: name, value: v, display: fmtMoney(v), sub: _kdPct(v, total) })))) : '');
};

_KD['t-avg'] = () => {
  const { orders } = _kdTodayCtx();
  if (!orders.length) return _kdEmpty('Aucune commande ce jour');
  const totals = orders.map(o => o.total);
  const max = orders.reduce((a, b) => (b.total > a.total ? b : a));
  const min = orders.reduce((a, b) => (b.total < a.total ? b : a));
  // Basket over the 7 days before the selected one, for context.
  const ref = new Date(); ref.setDate(ref.getDate() + dayOffset);
  let s = 0, n = 0;
  for (let k = 1; k <= 7; k++) {
    const d = new Date(ref); d.setDate(d.getDate() - k);
    _kdOrdersOfDay(d).forEach(o => { s += o.total; n++; });
  }
  const avg = totals.reduce((a, b) => a + b, 0) / orders.length;
  return _kdStats([
    ['Panier médian', _kdMoney(_kdMedian(totals))],
    ['Moyenne 7 jours préc.', n ? `${fmtMoney(s / n)} ${_kdDelta(avg, s / n)}` : '—'],
    ['Plus grosse commande', `${_kdMoney(max.total)} · N° ${String(max.num).padStart(4, '0')}`],
    ['Plus petite commande', _kdMoney(min.total)],
  ])
  + _kdSection('Répartition des paniers', _kdBars(_kdBasketBuckets(orders)));
};

_KD['t-items'] = () => {
  const { orders } = _kdTodayCtx();
  const arts = _kdArticles(orders).sort((a, b) => b.qty - a.qty || b.rev - a.rev);
  if (!arts.length) return _kdEmpty('Aucun article vendu ce jour');
  const units = arts.reduce((s, a) => s + a.qty, 0);
  return _kdStats([
    ['Articles différents', arts.length],
    ['Par commande', (units / orders.length).toFixed(1)],
  ])
  + _kdSection('Détail des articles', _kdBars(arts.map(a => ({
      label: a.name, value: a.qty, img: _kdThumb(a.name),
      display: `${a.qty} ×`, sub: `${fmtMoney(a.rev)} Dhs · ${_kdPct(a.qty, units)} des unités`,
    })), 10));
};

// ═══ RAPPORT — Résumé ═══

_KD['r-orders'] = () => {
  const m = _kdMonthCtx();
  if (!m.orders.length) return _kdEmpty();
  const days = _kdDayTotals(m.orders);
  const busiest = days.reduce((a, b) => (b.count > a.count ? b : a));
  const shown = m.now.getDate();
  const wd = new Array(7).fill(0), wdDays = new Array(7).fill(0);
  days.forEach(d => { const i = _kdWd(parseDay(d.dk)); wd[i] += d.count; wdDays[i]++; });
  return _kdStats([
    ['Moyenne / jour actif', (m.orders.length / days.length).toFixed(1)],
    ['Jour le plus chargé', `${_kdDayLabel(busiest.dk)} · ${busiest.count}`],
  ])
  + _kdSection('Commandes par jour', _kdCols(_kdMonthSeries(m.orders, shown, () => 1), _kdDayNumLabels(shown), { highlight: shown - 1, fmt: v => `${v} cmd` }))
  + _kdSection('Moyenne par jour de la semaine', _kdBars(_KD_WEEK.map((l, i) => ({
      label: l, value: wdDays[i] ? wd[i] / wdDays[i] : 0, display: wdDays[i] ? `${(wd[i] / wdDays[i]).toFixed(0)} cmd` : '—',
    })), 7));
};

_KD['r-total'] = () => {
  const m = _kdMonthCtx();
  if (!m.orders.length) return _kdEmpty();
  const total = m.orders.reduce((s, o) => s + o.total, 0);
  const elapsed = m.now.getDate();
  const weeks = new Array(Math.ceil(m.daysInMonth / 7)).fill(0);
  m.orders.forEach(o => { weeks[_kdWeekOfMonth(parseDay(getDayKey(o.time)))] += o.total; });
  const cats = _kdCategories(m.orders);
  return _kdStats([
    ['Moyenne / jour', _kdMoney(total / elapsed)],
    ['Projection fin de mois', _kdMoney(total / elapsed * m.daysInMonth), 'green'],
  ])
  + _kdSection('Par semaine', _kdBars(weeks.map((v, w) => ({ label: `Du ${_kdWeekLabel(w, m.daysInMonth)}`, value: v, display: fmtMoney(v) })).filter((r, w) => w * 7 < elapsed), 6))
  + _kdSection('Par catégorie', _kdStack(cats.map(c => ({ label: c.name, value: c.rev }))));
};

_KD['r-avg'] = () => {
  const m = _kdMonthCtx();
  if (!m.orders.length) return _kdEmpty();
  const wd = new Array(7).fill(0), wdN = new Array(7).fill(0);
  m.orders.forEach(o => { const i = _kdWd(parseDay(getDayKey(o.time))); wd[i] += o.total; wdN[i]++; });
  const prevAvg = m.prev.length ? m.prev.reduce((s, o) => s + o.total, 0) / m.prev.length : 0;
  const avg = m.orders.reduce((s, o) => s + o.total, 0) / m.orders.length;
  return _kdStats([
    ['Panier médian', _kdMoney(_kdMedian(m.orders.map(o => o.total)))],
    ['Mois dernier', prevAvg ? `${fmtMoney(prevAvg)} ${_kdDelta(avg, prevAvg)}` : '—'],
  ])
  + _kdSection('Par jour de la semaine', _kdBars(_KD_WEEK.map((l, i) => ({
      label: l, value: wdN[i] ? wd[i] / wdN[i] : 0, display: wdN[i] ? _kdMoney(wd[i] / wdN[i]) : '—',
    })), 7))
  + _kdSection('Répartition des paniers', _kdBars(_kdBasketBuckets(m.orders)));
};

_KD['r-units'] = () => {
  const m = _kdMonthCtx();
  const arts = _kdArticles(m.orders).sort((a, b) => b.qty - a.qty);
  if (!arts.length) return _kdEmpty();
  const units = arts.reduce((s, a) => s + a.qty, 0);
  return _kdStats([['Articles différents', arts.length], ['Unités / jour', (units / m.now.getDate()).toFixed(0)]])
  + _kdSection('Articles du mois', _kdBars(arts.map(a => ({
      label: a.name, value: a.qty, img: _kdThumb(a.name), display: `${a.qty} ×`, sub: `${fmtMoney(a.rev)} Dhs · ${_kdPct(a.qty, units)}`,
    })), 10));
};

// ═══ RAPPORT — Tendances ═══

_KD['r-day-avg'] = () => {
  const m = _kdMonthCtx();
  const days = _kdDayTotals(m.orders);
  if (!days.length) return _kdEmpty();
  const shown = m.now.getDate();
  const best = days.reduce((a, b) => (b.rev > a.rev ? b : a));
  const worst = days.reduce((a, b) => (b.rev < a.rev ? b : a));
  return _kdStats([
    ['Jour médian', _kdMoney(_kdMedian(days.map(d => d.rev)))],
    ['Jours sans vente', String(shown - days.length)],
    ['Meilleur', `${_kdDayLabel(best.dk)}`],
    ['Plus faible', `${_kdDayLabel(worst.dk)} · ${fmtMoney(worst.rev)}`],
  ])
  + _kdSection('Encaissé par jour', _kdCols(_kdMonthSeries(m.orders, shown, o => o.total), _kdDayNumLabels(shown), { highlight: shown - 1, fmt: v => `${fmtMoney(v)} Dhs` }));
};

_KD['r-items-per-order'] = () => {
  const m = _kdMonthCtx();
  if (!m.orders.length) return _kdEmpty();
  const wk = new Map();
  m.orders.forEach(o => {
    const w = _kdWeekOfMonth(parseDay(getDayKey(o.time)));
    const c = wk.get(w) || { u: 0, n: 0 };
    c.u += _kdUnits(o); c.n++;
    wk.set(w, c);
  });
  const prevIpo = m.prev.length ? m.prev.reduce((s, o) => s + _kdUnits(o), 0) / m.prev.length : 0;
  const ipo = m.orders.reduce((s, o) => s + _kdUnits(o), 0) / m.orders.length;
  return _kdStats([['Mois dernier', prevIpo ? `${prevIpo.toFixed(1)} ${_kdDelta(ipo, prevIpo)}` : '—']])
  + _kdSection('Articles par commande, par semaine', _kdBars([...wk].sort((a, b) => a[0] - b[0]).map(([w, c]) => ({
      label: `Du ${_kdWeekLabel(w, m.daysInMonth)}`, value: c.u / c.n, display: (c.u / c.n).toFixed(2), sub: `${c.n} commandes`,
    })), 6));
};

_KD['r-best-day'] = () => {
  const m = _kdMonthCtx();
  const days = _kdDayTotals(m.orders).sort((a, b) => b.rev - a.rev);
  if (!days.length) return _kdEmpty();
  return _kdSection('Meilleurs jours du mois', _kdBars(days.map(d => ({
    label: _kdDayLabel(d.dk), value: d.rev, display: fmtMoney(d.rev), sub: `${d.count} commandes · panier ${fmtMoney(d.rev / d.count)}`,
  })), 7));
};

_KD['r-trend-ca'] = () => {
  const m = _kdMonthCtx();
  if (!m.prev.length) return _kdEmpty('Pas de données pour le mois dernier');
  // Fair comparison: the same days of last month (1 → today's date), not the
  // whole of a finished month against a month still in progress.
  const cutDay = m.now.getDate();
  const prevSame = m.prev.filter(o => parseDay(getDayKey(o.time)).getDate() <= cutDay);
  const agg = list => {
    const rev = list.reduce((s, o) => s + o.total, 0), units = list.reduce((s, o) => s + _kdUnits(o), 0);
    return { rev, n: list.length, avg: list.length ? rev / list.length : 0, units };
  };
  const a = agg(m.orders), b = agg(prevSame), full = agg(m.prev);
  const row = (label, cur, prev, f) => `<tr><td>${label}</td><td>${f(cur)}</td><td>${f(prev)}</td><td>${_kdDelta(cur, prev)}</td></tr>`;
  const money = v => fmtMoney(v), int = v => String(Math.round(v));
  return _kdSection(`Ce mois vs mois dernier (1 → ${cutDay})`, `
    <table class="kd-table">
      <thead><tr><th></th><th>Ce mois</th><th>M-1</th><th>Écart</th></tr></thead>
      <tbody>
        ${row("Chiffre d'affaires", a.rev, b.rev, money)}
        ${row('Commandes', a.n, b.n, int)}
        ${row('Panier moyen', a.avg, b.avg, money)}
        ${row('Articles vendus', a.units, b.units, int)}
      </tbody>
    </table>`)
  + _kdStats([['Mois dernier complet', _kdMoney(full.rev)], ['Reste à faire pour l\'égaler', _kdMoney(Math.max(0, full.rev - a.rev))]]);
};

// ═══ RAPPORT — Ventes ═══

_KD['r-top-article'] = () => {
  const m = _kdMonthCtx();
  const arts = _kdArticles(m.orders).sort((a, b) => b.rev - a.rev);
  if (!arts.length) return _kdEmpty();
  const total = arts.reduce((s, a) => s + a.rev, 0);
  return _kdSection('Classement par chiffre d\'affaires', _kdBars(arts.map(a => ({
    label: a.name, value: a.rev, img: _kdThumb(a.name), display: fmtMoney(a.rev), sub: `${a.qty} vendus · ${_kdPct(a.rev, total)} du CA`,
  })), 10));
};

_KD['r-top-category'] = () => {
  const m = _kdMonthCtx();
  const cats = _kdCategories(m.orders);
  if (!cats.length) return _kdEmpty();
  const total = cats.reduce((s, c) => s + c.rev, 0);
  return _kdSection('Répartition', _kdStack(cats.map(c => ({ label: c.name, value: c.rev }))))
  + _kdSection('Toutes les catégories', _kdBars(cats.map((c, i) => ({
      label: c.name, value: c.rev, color: _KD_COLORS[i % _KD_COLORS.length], display: fmtMoney(c.rev),
      sub: `${_kdPct(c.rev, total)} · ${c.qty} vendus · ${c.arts.size} articles`,
    })), 10));
};

_KD['r-avg-item-price'] = () => {
  const m = _kdMonthCtx();
  const arts = _kdArticles(m.orders);
  if (!arts.length) return _kdEmpty();
  const bands = [[0, 10, '< 10 Dhs'], [10, 20, '10 – 20 Dhs'], [20, 35, '20 – 35 Dhs'], [35, 60, '35 – 60 Dhs'], [60, Infinity, '60 Dhs et +']];
  const units = arts.reduce((s, a) => s + a.qty, 0);
  const rows = bands.map(([lo, hi, label]) => {
    const inBand = arts.filter(a => { const p = a.rev / a.qty; return p >= lo && p < hi; });
    const q = inBand.reduce((s, a) => s + a.qty, 0);
    return { label, value: q, display: `${q} ×`, sub: `${_kdPct(q, units)} des unités · ${inBand.length} articles` };
  }).filter(r => r.value > 0);
  const priced = arts.map(a => ({ ...a, p: a.rev / a.qty }));
  const hi = priced.reduce((a, b) => (b.p > a.p ? b : a)), lo = priced.reduce((a, b) => (b.p < a.p ? b : a));
  return _kdStats([['Le plus cher vendu', `${_escHtml(hi.name)} · ${fmtMoney(hi.p)}`], ['Le moins cher', `${_escHtml(lo.name)} · ${fmtMoney(lo.p)}`]])
  + _kdSection('Unités vendues par gamme de prix', _kdBars(rows));
};

_KD['r-multi-item-pct'] = () => {
  const m = _kdMonthCtx();
  if (!m.orders.length) return _kdEmpty();
  const sizes = [1, 2, 3, 4].map(k => [k, m.orders.filter(o => _kdUnits(o) === k).length]);
  sizes.push(['5+', m.orders.filter(o => _kdUnits(o) >= 5).length]);
  // Articles most often bought together in the same order.
  const pairs = new Map();
  m.orders.forEach(o => {
    const names = [...new Set(o.items.map(i => i.name))].sort();
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const k = names[i] + ' + ' + names[j];
      pairs.set(k, (pairs.get(k) || 0) + 1);
    }
  });
  const topPairs = [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return _kdSection('Articles par commande', _kdBars(sizes.filter(([, n]) => n > 0).map(([k, n]) => ({
      label: `${k} article${k === 1 ? '' : 's'}`, value: n, display: `${n} cmd`, sub: _kdPct(n, m.orders.length),
    })), 5))
  + _kdSection('Souvent achetés ensemble', topPairs.length
      ? _kdBars(topPairs.map(([k, n]) => ({ label: k, value: n, display: `${n} fois` })), 6)
      : _kdEmpty('Pas encore de commandes à plusieurs articles'));
};

// ═══ MARCHANDISE (purchases) ═══

function _kdMarcMaps() {
  return {
    artMap: Object.fromEntries(_marcArticles.map(a => [a.id, a])),
    catMap: Object.fromEntries(_marcCategories.map(c => [c.id, c])),
  };
}
function _kdCatName(art, catMap) { return art.cat_id && catMap[art.cat_id] ? catMap[art.cat_id].nom : 'Sans catégorie'; }

// Achat rows enriched with their article, category and cost.
function _kdAchatRows(achats) {
  const { artMap, catMap } = _kdMarcMaps();
  return achats.map(a => {
    const art = artMap[a.article_id];
    return art ? { a, art, cat: _kdCatName(art, catMap), cost: _pmcAchatCost(art, a) } : null;
  }).filter(Boolean);
}
function _kdGroup(rows, keyOf) {
  const m = new Map();
  rows.forEach(r => {
    const k = keyOf(r);
    const g = m.get(k) || { key: k, cost: 0, n: 0, arts: new Set(), rows: [] };
    g.cost += r.cost; g.n++; g.arts.add(r.art.id); g.rows.push(r);
    m.set(k, g);
  });
  return [...m.values()].sort((a, b) => b.cost - a.cost);
}
function _kdQtyText(r) {
  const unit = r.art.unit_label || 'u';
  return [[r.a.qty_pu, unit], [r.a.qty_pkg, 'Pkg'], [r.a.qty_pl, 'Lot']]
    .filter(([q]) => q > 0).map(([q, l]) => `${+Number(q).toFixed(2)} ${l}`).join(' + ') || '—';
}
function _kdTotal(rows) { return rows.reduce((s, r) => s + r.cost, 0); }

function _kdMarcDayRows(offset) { return _kdAchatRows(_marcAchats.filter(a => a.date === toISODate(_pmcDateForOffset(offset)))); }

function _kdMarcMonthCtx(offset) {
  const d = _pmcMonthDate(offset);
  const from = toISODate(d), to = toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return {
    date: d, dim,
    elapsed: offset === 0 ? new Date().getDate() : dim,
    rows: _kdAchatRows(_marcAchats.filter(a => a.date >= from && a.date < to)),
  };
}
const _kdIsoLabel = iso => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });

// Day scope
_KD['marc-kpi-total'] = () => {
  const rows = _kdMarcDayRows(_pmcDayOffset);
  if (!rows.length) return _kdEmpty('Aucun achat ce jour');
  const total = _kdTotal(rows);
  const prev = _kdTotal(_kdMarcDayRows(_pmcDayOffset - 1));
  // Average spend over active purchase days of the previous 30 days.
  let s = 0, n = 0;
  for (let k = 1; k <= 30; k++) { const t = _kdTotal(_kdMarcDayRows(_pmcDayOffset - k)); if (t > 0) { s += t; n++; } }
  return _kdStats([
    ['Veille', `${fmtMoney(prev)} ${_kdDelta(total, prev, true)}`],
    ['Moy. jour d\'achat (30 j)', n ? `${fmtMoney(s / n)} ${_kdDelta(total, s / n, true)}` : '—'],
  ])
  + _kdSection('Par catégorie', _kdBars(_kdGroup(rows, r => r.cat).map(g => ({ label: g.key, value: g.cost, display: fmtMoney(g.cost), sub: _kdPct(g.cost, total) }))));
};

_KD['marc-kpi-count'] = () => {
  const rows = _kdMarcDayRows(_pmcDayOffset).sort((a, b) => b.cost - a.cost);
  if (!rows.length) return _kdEmpty('Aucun achat ce jour');
  return _kdSection('Lignes d\'achat', _kdBars(rows.map(r => ({
    label: r.art.nom, value: r.cost, display: fmtMoney(r.cost), sub: `${_escHtml(_kdQtyText(r))} · ${_escHtml(r.cat)}`,
  })), 10));
};

_KD['marc-kpi-articles'] = () => {
  const rows = _kdMarcDayRows(_pmcDayOffset);
  if (!rows.length) return _kdEmpty('Aucun achat ce jour');
  const total = _kdTotal(rows);
  return _kdSection('Articles achetés', _kdBars(_kdGroup(rows, r => r.art.nom).map(g => ({
    label: g.key, value: g.cost, display: fmtMoney(g.cost), sub: `${_kdPct(g.cost, total)} · ${g.n} ligne${g.n > 1 ? 's' : ''}`,
  })), 10));
};

_KD['marc-kpi-cat'] = () => {
  const rows = _kdMarcDayRows(_pmcDayOffset);
  if (!rows.length) return _kdEmpty('Aucun achat ce jour');
  const total = _kdTotal(rows);
  const groups = _kdGroup(rows, r => r.cat);
  return _kdSection('Répartition', _kdStack(groups.map(g => ({ label: g.key, value: g.cost }))))
  + _kdSection('Toutes les catégories', _kdBars(groups.map((g, i) => ({
      label: g.key, value: g.cost, color: _KD_COLORS[i % _KD_COLORS.length], display: fmtMoney(g.cost),
      sub: `${_kdPct(g.cost, total)} · ${g.arts.size} article${g.arts.size > 1 ? 's' : ''}`,
    }))));
};

// Month scope — Résumé
_KD['marc-m-total'] = () => {
  const m = _kdMarcMonthCtx(_pmcMonthOffset);
  if (!m.rows.length) return _kdEmpty('Aucun achat ce mois');
  const total = _kdTotal(m.rows);
  const prev = _kdTotal(_kdMarcMonthCtx(_pmcMonthOffset - 1).rows);
  const weeks = new Array(Math.ceil(m.dim / 7)).fill(0);
  m.rows.forEach(r => { weeks[_kdWeekOfMonth(new Date(r.a.date + 'T12:00:00'))] += r.cost; });
  return _kdStats([
    ['Mois précédent', `${fmtMoney(prev)} ${_kdDelta(total, prev, true)}`],
    _pmcMonthOffset === 0 ? ['Projection fin de mois', _kdMoney(total / m.elapsed * m.dim)] : null,
  ])
  + _kdSection('Par semaine', _kdBars(weeks.map((v, w) => ({ label: `Du ${_kdWeekLabel(w, m.dim)}`, value: v, display: fmtMoney(v) })).filter((r, w) => w * 7 < m.elapsed), 6))
  + _kdSection('Par catégorie', _kdStack(_kdGroup(m.rows, r => r.cat).map(g => ({ label: g.key, value: g.cost }))));
};

_KD['marc-m-count'] = () => {
  const m = _kdMarcMonthCtx(_pmcMonthOffset);
  if (!m.rows.length) return _kdEmpty('Aucun achat ce mois');
  const groups = _kdGroup(m.rows, r => r.art.nom).sort((a, b) => b.n - a.n || b.cost - a.cost);
  return _kdSection('Articles les plus souvent achetés', _kdBars(groups.map(g => ({
    label: g.key, value: g.n, display: `${g.n} fois`, sub: `${fmtMoney(g.cost)} Dhs`,
  })), 10));
};

_KD['marc-m-active-days'] = () => {
  const m = _kdMarcMonthCtx(_pmcMonthOffset);
  const byDay = new Map();
  m.rows.forEach(r => byDay.set(r.a.date, (byDay.get(r.a.date) || 0) + r.cost));
  const max = Math.max(0, ...byDay.values()) || 1;
  const lead = _kdWd(new Date(m.date.getFullYear(), m.date.getMonth(), 1));
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="kd-cal-pad"></span>');
  for (let d = 1; d <= m.dim; d++) {
    const iso = toISODate(new Date(m.date.getFullYear(), m.date.getMonth(), d));
    const v = byDay.get(iso) || 0;
    const future = d > m.elapsed;
    const level = v ? Math.ceil((v / max) * 4) : 0;
    cells.push(`<span class="kd-cal-day lv${level}${future ? ' future' : ''}" title="${v ? fmtMoney(v) + ' Dhs' : 'aucun achat'}">${d}</span>`);
  }
  return _kdSection('Calendrier des achats', `
    <div class="kd-cal">${_KD_WEEK.map(w => `<span class="kd-cal-head">${w[0]}</span>`).join('')}${cells.join('')}</div>
    <div class="kd-cal-key"><span class="kd-cal-day lv0"></span>aucun <span class="kd-cal-day lv1"></span><span class="kd-cal-day lv4"></span>plus dépensé</div>`);
};

_KD['marc-m-day-avg'] = () => {
  const m = _kdMarcMonthCtx(_pmcMonthOffset);
  if (!m.rows.length) return _kdEmpty('Aucun achat ce mois');
  const byDay = _kdGroup(m.rows, r => r.a.date);
  const wd = new Array(7).fill(0), wdN = new Array(7).fill(0);
  byDay.forEach(g => { const i = _kdWd(new Date(g.key + 'T12:00:00')); wd[i] += g.cost; wdN[i]++; });
  return _kdStats([['Jour d\'achat médian', _kdMoney(_kdMedian(byDay.map(g => g.cost)))]])
  + _kdSection('Moyenne par jour de la semaine', _kdBars(_KD_WEEK.map((l, i) => ({
      label: l, value: wdN[i] ? wd[i] / wdN[i] : 0, display: wdN[i] ? fmtMoney(wd[i] / wdN[i]) : '—', sub: wdN[i] ? `${wdN[i]} jour${wdN[i] > 1 ? 's' : ''} d'achat` : '',
    })), 7));
};

// Month scope — Catégories
_KD['marc-m-top-cat'] = () => {
  const m = _kdMarcMonthCtx(_pmcMonthOffset);
  if (!m.rows.length) return _kdEmpty('Aucun achat ce mois');
  const total = _kdTotal(m.rows);
  return _kdSection('Toutes les catégories', _kdBars(_kdGroup(m.rows, r => r.cat).map((g, i) => ({
    label: g.key, value: g.cost, color: _KD_COLORS[i % _KD_COLORS.length], display: fmtMoney(g.cost),
    sub: `${_kdPct(g.cost, total)} · ${g.n} achats · ${g.arts.size} articles`,
  })), 10));
};

_KD['marc-m-top-cat-pct'] = () => {
  const m = _kdMarcMonthCtx(_pmcMonthOffset);
  if (!m.rows.length) return _kdEmpty('Aucun achat ce mois');
  return _kdSection('Part de chaque catégorie', _kdStack(_kdGroup(m.rows, r => r.cat).map(g => ({ label: g.key, value: g.cost })), 8));
};

_KD['marc-m-top-art'] = () => {
  const m = _kdMarcMonthCtx(_pmcMonthOffset);
  if (!m.rows.length) return _kdEmpty('Aucun achat ce mois');
  const total = _kdTotal(m.rows);
  return _kdSection('Articles par coût', _kdBars(_kdGroup(m.rows, r => r.art.nom).map(g => ({
    label: g.key, value: g.cost, display: fmtMoney(g.cost), sub: `${_kdPct(g.cost, total)} · ${g.n} achat${g.n > 1 ? 's' : ''} · ${_escHtml(g.rows[0].cat)}`,
  })), 10));
};

_KD['marc-m-cat-count'] = () => {
  const m = _kdMarcMonthCtx(_pmcMonthOffset);
  if (!m.rows.length) return _kdEmpty('Aucun achat ce mois');
  return _kdSection('Articles achetés par catégorie', _kdBars(_kdGroup(m.rows, r => r.cat).map(g => ({
    label: g.key, value: g.arts.size, display: `${g.arts.size} article${g.arts.size > 1 ? 's' : ''}`,
    sub: [...new Set(g.rows.map(r => r.art.nom))].slice(0, 4).map(_escHtml).join(', ') + (g.arts.size > 4 ? '…' : ''),
  })), 10));
};

// Month scope — Tendances
_KD['marc-m-trend'] = () => {
  const cur = _kdMarcMonthCtx(_pmcMonthOffset), prev = _kdMarcMonthCtx(_pmcMonthOffset - 1);
  if (!prev.rows.length) return _kdEmpty('Pas d\'achats le mois précédent');
  const p = new Map(_kdGroup(prev.rows, r => r.cat).map(g => [g.key, g.cost]));
  const c = new Map(_kdGroup(cur.rows, r => r.cat).map(g => [g.key, g.cost]));
  const keys = [...new Set([...c.keys(), ...p.keys()])];
  return _kdSection('Par catégorie vs mois précédent', _kdBars(keys.map(k => ({
    label: k, value: c.get(k) || 0, display: `${fmtMoney(c.get(k) || 0)} ${_kdDelta(c.get(k) || 0, p.get(k) || 0, true)}`,
    sub: `mois préc. ${fmtMoney(p.get(k) || 0)} Dhs`,
  })).sort((a, b) => b.value - a.value), 10));
};

_KD['marc-m-best-day'] = () => {
  const m = _kdMarcMonthCtx(_pmcMonthOffset);
  if (!m.rows.length) return _kdEmpty('Aucun achat ce mois');
  return _kdSection('Plus gros jours d\'achat', _kdBars(_kdGroup(m.rows, r => r.a.date).map(g => ({
    label: _kdIsoLabel(g.key), value: g.cost, display: fmtMoney(g.cost),
    sub: `${g.n} ligne${g.n > 1 ? 's' : ''} · ${_escHtml(_kdGroup(g.rows, r => r.cat)[0].key)}`,
  })), 7));
};

_KD['marc-m-avg-line'] = () => {
  const m = _kdMarcMonthCtx(_pmcMonthOffset);
  if (!m.rows.length) return _kdEmpty('Aucun achat ce mois');
  return _kdStats([['Ligne médiane', _kdMoney(_kdMedian(m.rows.map(r => r.cost)))]])
  + _kdSection('Plus grosses lignes d\'achat', _kdBars([...m.rows].sort((a, b) => b.cost - a.cost).map(r => ({
      label: r.art.nom, value: r.cost, display: fmtMoney(r.cost), sub: `${_kdIsoLabel(r.a.date)} · ${_escHtml(_kdQtyText(r))}`,
    })), 7));
};

_KD['marc-m-idle-days'] = () => {
  const m = _kdMarcMonthCtx(_pmcMonthOffset);
  const active = new Set(m.rows.map(r => r.a.date));
  const idle = [];
  let streak = 0, best = 0;
  for (let d = 1; d <= m.elapsed; d++) {
    const iso = toISODate(new Date(m.date.getFullYear(), m.date.getMonth(), d));
    if (active.has(iso)) { streak = 0; continue; }
    idle.push(iso); streak++; best = Math.max(best, streak);
  }
  if (!idle.length) return _kdEmpty('Des achats ont été faits chaque jour');
  return _kdStats([['Plus longue période sans achat', `${best} jour${best > 1 ? 's' : ''}`], ['Jours sans achat', `${idle.length} / ${m.elapsed}`]])
  + _kdSection('Jours sans achat', `<div class="kd-chips">${idle.map(iso => `<span>${_kdIsoLabel(iso)}</span>`).join('')}</div>`);
};

// ═══ MARCHANDISE — Stock (cards built by page-marc-stock.js, data-kpi keys) ═══

function _kdStockRows(filter) {
  const rows = (typeof _mstLastRows !== 'undefined' && _mstLastRows) || [];
  return rows.filter(filter);
}
function _kdStockList(rows, emptyMsg) {
  if (!rows.length) return _kdEmpty(emptyMsg);
  return `<div class="kd-list">${rows.map(r => {
    const cls = !r.st ? 'none' : r.st.status;
    const stock = !r.hasStock ? 'Aucun achat' : r.st ? _minvFmtQty(r.st.stock, r.unit) : '…';
    const cover = !r.st ? '' : r.st.status === 'out' ? 'Rupture' : r.st.cover == null ? 'pas de vente récente' : `≈ ${Math.max(0, Math.floor(r.st.cover))} j de stock`;
    return `<div class="kd-list-row"><span class="bsr-dot ${cls}"></span>
      <span class="kd-list-main"><b>${_escHtml(r.art.nom)}</b><small>${_escHtml(cover)}${r.suggestion ? ` · commander ${_escHtml(r.suggestion)}` : ''}</small></span>
      <span class="kd-list-val">${_escHtml(stock)}</span></div>`;
  }).join('')}</div>`;
}
_KD['mst-tracked'] = () => _kdStockList(_kdStockRows(() => true), 'Aucun article suivi');
_KD['mst-order']   = () => _kdStockList(_kdStockRows(r => r.st && r.st.status !== 'ok'), 'Rien à commander');
_KD['mst-out']     = () => _kdStockList(_kdStockRows(r => r.st && r.st.status === 'out'), 'Aucun article en rupture');
_KD['mst-low']     = () => _kdStockList(_kdStockRows(r => r.st && r.st.status === 'low'), 'Aucun article en stock faible');
