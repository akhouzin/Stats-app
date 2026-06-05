// ═══════════════════════════════════════
// INVENTAIRE
// ═══════════════════════════════════════

// Consumables tracked automatically from orders
const CONSUMABLES = [
  { key: 'water',     label: 'Eau minérale 33cl',   unit: 'bouteilles', packSize: 12,   packUnit: 'pack'    },
  { key: 'water50',   label: 'Eau minérale 50cl',   unit: 'bouteilles', packSize: 12,   packUnit: 'pack'    },
  { key: 'oulmes',    label: 'Eau gazeuse Oulmes',  unit: 'bouteilles', packSize: 12,   packUnit: 'pack'    },
  { key: 'oulmesFr',  label: 'Eau Oulmes fruitées', unit: 'bouteilles', packSize: 12,   packUnit: 'pack'    },
  { key: 'sodas',     label: 'Sodas',               unit: 'unités',     packSize: 24,   packUnit: 'pack'    },
  { key: 'coffeeG',   label: 'Café',                unit: 'g',          packSize: 1000, packUnit: 'sachet'  },
  { key: 'milkCl',    label: 'Lait',                unit: 'cl',         packSize: 50,   packUnit: 'sachet'  },
  { key: 'theG',      label: 'Thé Marocain',        unit: 'g',          packSize: 500,  packUnit: 'boîtier' },
  { key: 'sucreTHe',  label: 'Sucre thé',           unit: 'pcs',        packSize: 36,   packUnit: 'boîtier' },
  { key: 'sucreCafe', label: 'Sucre café',          unit: 'pcs',        packSize: 225,  packUnit: 'boîtier' },
];

// Items tracked manually (stock entered by hand)
const MANUAL_ITEMS = [
  { key: 'orange',   label: 'Oranges',    unit: 'pcs' },
  { key: 'citron',   label: 'Citrons',    unit: 'pcs' },
  { key: 'banane',   label: 'Bananes',    unit: 'pcs' },
  { key: 'pomme',    label: 'Pommes',     unit: 'pcs' },
  { key: 'ananas',   label: 'Ananas',     unit: 'pcs' },
  { key: 'mangue',   label: 'Mangues',    unit: 'pcs' },
  { key: 'fraise',   label: 'Fraises',    unit: 'g' },
  { key: 'avocat',   label: 'Avocats',    unit: 'pcs' },
  { key: 'oeuf',     label: 'Oeufs',      unit: 'pcs' },
  { key: 'fromage',  label: 'Fromage',    unit: 'g' },
  { key: 'chocolat', label: 'Chocolat',   unit: 'g' },
];

let invPeriod = 'today';
let invOffset = 0;
let invOpenKey = null;

function setInvPeriod(period, btn) {
  invPeriod = period;
  invOffset = 0;
  document.querySelectorAll('.inv-period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderInventaire();
}

function changeInvOffset(dir) {
  invOffset = Math.max(0, invOffset + dir);
  renderInventaire();
}

function getWeekStart(date) {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7; // days since Monday (Mon=0,...,Sun=6)
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getInvPeriodBounds() {
  const now = new Date();
  if (invPeriod === 'today') {
    const d = new Date(now);
    d.setDate(d.getDate() - invOffset);
    d.setHours(0, 0, 0, 0);
    const end = new Date(d); end.setHours(23, 59, 59, 999);
    const label = invOffset === 0 ? "Aujourd'hui" : fmtDate(d);
    return { from: d, to: end, label };
  } else if (invPeriod === 'week') {
    const currentMon = getWeekStart(now);
    const weekMon = new Date(currentMon);
    weekMon.setDate(weekMon.getDate() - invOffset * 7);
    const weekSun = new Date(weekMon);
    weekSun.setDate(weekSun.getDate() + 6);
    weekSun.setHours(23, 59, 59, 999);
    const label = `${fmtDateShort(weekMon)} – ${fmtDateShort(weekSun)}`;
    return { from: weekMon, to: weekSun, label };
  } else {
    const y = now.getFullYear();
    const m = now.getMonth() - invOffset;
    const from = new Date(y, m, 1);
    const to = new Date(y, m + 1, 0, 23, 59, 59, 999);
    const raw = from.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return { from, to, label: raw.charAt(0).toUpperCase() + raw.slice(1) };
  }
}

function getInvOrders() {
  const { from, to } = getInvPeriodBounds();
  return allOrders.filter(o => o.time >= from && o.time <= to);
}

// ── Event-sourced restock log ──
function getRestocks(key) {
  return (_restocks[key] || []).slice();
}
function toISODate(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
async function addRestock(key, dateStr, amount, price) {
  amount = parseFloat(amount);
  if (!amount || amount <= 0) return;
  price = parseFloat(price) || null;
  const id = Date.now().toString();
  const row = { id, key, date: dateStr, amount };
  if (price) row.price_per_unit = price;
  const { error } = await sb.from('inv_restocks').insert(row);
  if (error) { console.error('addRestock:', error.message); return; }
  if (!_restocks[key]) _restocks[key] = [];
  _restocks[key].push({ id, date: dateStr, amount, price });
  _restocks[key].sort((a, b) => a.date.localeCompare(b.date));
  renderInventaire();
}
async function deleteRestock(key, id) {
  await sb.from('inv_restocks').delete().eq('id', id);
  if (_restocks[key]) _restocks[key] = _restocks[key].filter(e => e.id !== id);
  renderInventaire();
}
async function submitRestock(key) {
  const di = document.getElementById('inv-rf-date-'  + key);
  const ai = document.getElementById('inv-rf-amt-'   + key);
  const pi = document.getElementById('inv-rf-price-' + key);
  const amount = parseFloat(ai ? ai.value : 0);
  if (!amount || amount <= 0) { if (ai) ai.focus(); return; }
  const dateStr = di ? di.value : toISODate(new Date());
  const price   = pi ? pi.value : '';
  await addRestock(key, dateStr, amount, price);
  if (ai) ai.value = '';
  if (pi) pi.value = '';
}
function toggleInvForm(key) {
  invOpenKey = invOpenKey === key ? null : key;
  renderInventaire();
}

// Count items sold matching keywords in a set of orders
function countSoldItems(orders, keywords) {
  let qty = 0;
  orders.forEach(o => o.items.forEach(i => {
    const nl = i.name.toLowerCase();
    if (keywords.some(k => nl.includes(k))) qty += i.qty;
  }));
  return qty;
}

const MANUAL_KEYWORDS = {
  orange:   ['orange'],
  citron:   ['citron'],
  banane:   ['banane'],
  pomme:    ['pomme'],
  ananas:   ['ananas'],
  mangue:   ['mangue'],
  fraise:   ['fraise'],
  avocat:   ['avocat'],
  oeuf:     ['omelette'],
  fromage:  ['fromage'],
  sucre:    [],
  chocolat: ['chocolat'],
};

// All keys that are auto-calculated by calcConsumption (not keyword-counted)
const CALC_KEYS = ['water','water50','oulmes','oulmesFr','sodas','coffeeG','milkCl','theG','sucreTHe','sucreCafe'];

// Cache for consumedBetween — keyed by "from-to" timestamp string, cleared on data refresh
let _consumptionRangeCache = new Map();
let _filteredOrdersRangeCache = new Map();

function clearConsumptionCache() {
  _consumptionRangeCache = new Map();
  _filteredOrdersRangeCache = new Map();
}

// Consumption between two Date objects (inclusive)
function consumedBetween(key, fromDate, toDate) {
  const rangeKey = `${fromDate.getTime()}-${toDate.getTime()}`;
  if (!_filteredOrdersRangeCache.has(rangeKey)) {
    _filteredOrdersRangeCache.set(rangeKey, allOrders.filter(o => o.time >= fromDate && o.time <= toDate));
  }
  const orders = _filteredOrdersRangeCache.get(rangeKey);
  if (CALC_KEYS.includes(key)) {
    if (!_consumptionRangeCache.has(rangeKey)) {
      _consumptionRangeCache.set(rangeKey, calcConsumption(orders));
    }
    return _consumptionRangeCache.get(rangeKey)[key] || 0;
  }
  const kw = MANUAL_KEYWORDS[key] || [];
  return kw.length ? countSoldItems(orders, kw) : 0;
}

// Latest inventory snapshot on or before a given date (entries are physical counts, not additions)
function getLatestSnapshot(key, date) {
  const isoDate = toISODate(date);
  const snaps = getRestocks(key).filter(r => r.date <= isoDate);
  return snaps.length ? snaps[snaps.length - 1] : null;
}

// Running balance at end of a day: snapshot amount minus consumption since snapshot date
function stockBalanceAt(key, date) {
  const snap = getLatestSnapshot(key, date);
  if (!snap) return 0;
  const snapStart = new Date(snap.date + 'T00:00:00');
  const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);
  return snap.amount - consumedBetween(key, snapStart, endOfDay);
}

// Period stats: opening balance, consumed in period, current balance
function periodStockStats(key, from, to) {
  const snap = getLatestSnapshot(key, to);
  if (!snap) return { opening: 0, consumed: 0, current: 0 };
  const dayBefore = new Date(from); dayBefore.setDate(dayBefore.getDate() - 1);
  const opening = stockBalanceAt(key, dayBefore);
  const current = stockBalanceAt(key, to);
  const snapStart = new Date(snap.date + 'T00:00:00');
  const effectiveFrom = snapStart > from ? snapStart : from;
  const consumed = consumedBetween(key, effectiveFrom, to);
  return { opening, consumed, current };
}

function fmtNum(n) { return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1); }

// Weighted average price per unit across all restocks that have a price
function weightedAvgPrice(key) {
  const r = getRestocks(key).filter(e => e.price && e.price > 0);
  if (!r.length) return null;
  const totalAmt = r.reduce((s, e) => s + e.amount, 0);
  const totalVal = r.reduce((s, e) => s + e.amount * e.price, 0);
  return totalAmt > 0 ? totalVal / totalAmt : null;
}

function renderInventaire() {
  const bounds = getInvPeriodBounds();
  document.getElementById('inv-period-label').textContent = bounds.label;
  document.getElementById('inv-next').disabled = invOffset <= 0;
  document.getElementById('inv-cons-period').textContent = bounds.label;
  document.getElementById('inv-man-period').textContent  = bounds.label;

  const { from, to } = bounds;
  const todayISO = toISODate(new Date());

  function buildRow(key, label, unit, packSize, packUnit) {
    const stats   = periodStockStats(key, from, to);
    const hasData = getLatestSnapshot(key, to) !== null;

    const openDisp  = hasData ? fmtNum(Math.max(0, stats.opening))  : '—';
    const currDisp  = hasData ? fmtNum(Math.max(0, stats.current))  : '—';
    const currCls   = !hasData ? 'none' : stats.current <= 0 ? 'out' : stats.current < stats.opening * 0.2 + 1 ? 'low' : 'ok';
    const consDisp  = fmtNum(stats.consumed);

    const isOpen  = invOpenKey === key;
    const restocks = getRestocks(key).slice().reverse();
    const avgPrice = weightedAvgPrice(key);
    const currVal  = (avgPrice && hasData) ? Math.max(0, stats.current) * avgPrice : null;
    const consVal  = (avgPrice && hasData) ? stats.consumed * avgPrice : null;

    const histHtml = restocks.length
      ? restocks.map(e => `
          <div class="inv-hist-item">
            <span class="inv-hist-date">${e.date}</span>
            <span class="inv-hist-amt">${fmtNum(e.amount)} <span style="font-size:10px;font-weight:400;">${unit}</span>${e.price ? ` · <span style="font-size:10px;color:var(--green);">${fmtMoney(e.price)} Dhs/${unit}</span>` : ''}</span>
            <button class="inv-hist-del" onclick="deleteRestock('${key}','${e.id}')">✕</button>
          </div>`).join('')
      : `<div class="inv-hist-empty">Aucun inventaire enregistré</div>`;

    return `
      <div class="inv-row">
        <div class="inv-main-line">
          <div class="inv-name">${label}<span class="inv-unit">${unit}</span></div>
          <div class="inv-right">
            <div style="text-align:right;">
              <span class="inv-num ${currCls}">${currDisp}</span>
              ${currVal !== null ? `<div class="inv-val-tag">≈ ${fmtMoney(currVal)} Dhs</div>` : ''}
              ${(() => {
                if (!packSize || !hasData) return '';
                const curr = Math.max(0, stats.current);
                const full = Math.floor(curr / packSize);
                const rem  = Math.round(curr % packSize);
                const txt  = rem > 0 ? `${full} ${packUnit} + ${rem} ${unit}` : `${full} ${packUnit}`;
                return `<div class="inv-pack-info">${txt}</div>`;
              })()}
            </div>
            <button class="inv-open-btn${isOpen ? ' active' : ''}" onclick="toggleInvForm('${key}')">${isOpen ? '✕' : '+'}</button>
          </div>
        </div>
        <div class="inv-sub-line">${hasData
          ? `Ouverture : ${openDisp} &nbsp;·&nbsp; Consommé : <span style="color:var(--red);font-weight:700;">${consDisp}</span>${consVal !== null ? ` <span style="color:var(--red);font-size:10px;">(≈ ${fmtMoney(consVal)} Dhs)</span>` : ''}`
          : 'Appuyez sur <b>+</b> pour enregistrer le stock actuel'}</div>
        ${isOpen ? `
        <div class="inv-restock-zone">
          <div class="inv-restock-form">
            <input class="inv-rf-input inv-rf-date" type="date" id="inv-rf-date-${key}" value="${todayISO}">
            <input class="inv-rf-input inv-rf-amt" type="number" min="0" step="any" id="inv-rf-amt-${key}" placeholder="Stock actuel">
            <input class="inv-rf-input inv-rf-price" type="number" min="0" step="any" id="inv-rf-price-${key}" placeholder="Prix/unité">
            <button class="inv-rf-btn" onclick="submitRestock('${key}')">Enregistrer</button>
          </div>
          ${restocks.length ? '<div class="inv-hist-title">Historique des inventaires</div>' : ''}
          ${histHtml}
        </div>` : ''}
      </div>`;
  }

  document.getElementById('inv-consumables').innerHTML =
    CONSUMABLES.map(c => buildRow(c.key, c.label, c.unit, c.packSize, c.packUnit)).join('');

  document.getElementById('inv-manual').innerHTML =
    MANUAL_ITEMS.map(m => buildRow(m.key, m.label, m.unit)).join('');

  // ── Bilan totals ──
  const allKeys = [...CONSUMABLES.map(c => c.key), ...MANUAL_ITEMS.map(m => m.key)];
  let totalCons = 0, totalLeft = 0, hasAny = false;
  allKeys.forEach(key => {
    const avg = weightedAvgPrice(key);
    if (!avg) return;
    hasAny = true;
    const stats = periodStockStats(key, from, to);
    totalCons += Math.max(0, stats.consumed) * avg;
    totalLeft += Math.max(0, stats.current) * avg;
  });

  document.getElementById('inv-totals').innerHTML = hasAny ? `
    <div class="inv-totals">
      <div class="inv-total-cell">
        <div class="inv-total-label">Consommé</div>
        <div class="inv-total-val" style="color:var(--red);">${fmtMoney(totalCons)}</div>
        <div class="inv-total-sub">Dhs</div>
      </div>
      <div class="inv-total-cell">
        <div class="inv-total-label">En stock</div>
        <div class="inv-total-val" style="color:var(--green);">${fmtMoney(totalLeft)}</div>
        <div class="inv-total-sub">Dhs</div>
      </div>
    </div>` : '<div class="empty" style="padding:10px 0;font-size:11px;">Ajoutez des prix lors des inventaires pour voir le bilan</div>';
}
