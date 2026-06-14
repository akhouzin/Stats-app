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

// ── Event-sourced restock log (used by Rapport Barista / Recette) ──
function getRestocks(key) {
  return (_restocks[key] || []).slice();
}
function toISODate(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
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

function fmtNum(n) { return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1); }

// Weighted average price per unit across all restocks that have a price
function weightedAvgPrice(key) {
  const r = getRestocks(key).filter(e => e.price && e.price > 0);
  if (!r.length) return null;
  const totalAmt = r.reduce((s, e) => s + e.amount, 0);
  const totalVal = r.reduce((s, e) => s + e.amount * e.price, 0);
  return totalAmt > 0 ? totalVal / totalAmt : null;
}

// ═══════════════════════════════════════
// INVENTAIRE — read-only mirror of the POS Marchandise/Inventaire page.
// Entrées = marc_achats (converted via conv_pkg/conv_pl), Vendu = closedOrders
// items linked via marc_links, Variation = Entrées − Vendu. No editing here —
// articles, achats and links are managed in the POS.
// ═══════════════════════════════════════
let invPeriod = 'today';

function setInvPeriod(period, btn) {
  invPeriod = period;
  document.querySelectorAll('.inv-period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderInventaire();
}

function _minvWeekRange() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
  const sunday  = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { monday, sunday };
}

function _minvOrdersInPeriod(period) {
  const now = new Date();
  if (period === 'today') {
    const key = getDayKey(now);
    return allOrders.filter(o => getDayKey(o.time) === key);
  }
  if (period === 'week') {
    const { monday, sunday } = _minvWeekRange();
    const nextMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
    return allOrders.filter(o => o.time >= monday && o.time < nextMonday);
  }
  return allOrders.filter(o =>
    o.time.getFullYear() === now.getFullYear() && o.time.getMonth() === now.getMonth());
}

function _minvAchatsInPeriod(period) {
  const now = new Date();
  if (period === 'today') {
    const todayISO = toISODate(now);
    return _marcAchats.filter(a => a.date === todayISO);
  }
  if (period === 'week') {
    const { monday, sunday } = _minvWeekRange();
    const fromISO = toISODate(monday), toISO = toISODate(sunday);
    return _marcAchats.filter(a => a.date >= fromISO && a.date <= toISO);
  }
  const prefix = toISODate(now).slice(0, 7); // YYYY-MM
  return _marcAchats.filter(a => a.date && a.date.startsWith(prefix));
}

function _minvPeriodLabel(period) {
  const now = new Date();
  if (period === 'today') return getDayKey(now);
  if (period === 'week') {
    const { monday, sunday } = _minvWeekRange();
    return `${getDayKey(monday)} – ${getDayKey(sunday)}`;
  }
  const raw = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function _minvFmt(n) {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

function _minvStockIn(article, achats) {
  const convPkg = article.conv_pkg != null ? article.conv_pkg : 1;
  const convPl  = article.conv_pl  != null ? article.conv_pl  : 1;
  let total = 0;
  achats.forEach(a => {
    if (a.article_id !== article.id) return;
    total += (a.qty_pu || 0) + (a.qty_pkg || 0) * convPkg + (a.qty_pl || 0) * convPl;
  });
  return total;
}

function _minvStockOut(article, orders) {
  let total = 0;
  _marcLinks
    .filter(l => l.article_id === article.id)
    .forEach(link => {
      orders.forEach(o => {
        (o.items || []).forEach(item => {
          if (item.name === link.item_name) total += item.qty * (link.qty_per_sale || 0);
        });
      });
    });
  return total;
}

function renderInventaire() {
  document.getElementById('inv-period-label').textContent = _minvPeriodLabel(invPeriod);

  const wrap = document.getElementById('minv-table-wrap');
  if (_marcArticles.length === 0) {
    wrap.innerHTML = '<div class="empty">Aucun article configuré dans Marchandise.</div>';
    return;
  }

  const catMap = Object.fromEntries(_marcCategories.map(c => [c.id, c]));
  const groups = {};
  const nocat  = [];
  _marcArticles.forEach(a => {
    if (a.cat_id && catMap[a.cat_id]) (groups[a.cat_id] = groups[a.cat_id] || []).push(a);
    else nocat.push(a);
  });

  const periodOrders = _minvOrdersInPeriod(invPeriod);
  const periodAchats = _minvAchatsInPeriod(invPeriod);

  const buildRow = art => {
    const unit  = art.unit_label || 'unité';
    const inQty = _minvStockIn(art, periodAchats);
    const out   = _minvStockOut(art, periodOrders);
    const solde = inQty - out;
    const links = _marcLinks.filter(l => l.article_id === art.id);

    let badgeClass = 'minv-badge-ok';
    if (solde < 0) badgeClass = 'minv-badge-out';
    else if (solde === 0) badgeClass = 'minv-badge-low';

    const soldeText = solde > 0 ? `+${_minvFmt(solde)}` : _minvFmt(solde);

    const linksHtml = links.length
      ? links.map(l => `<span class="minv-link-chip">${l.item_name} ×${_minvFmt(l.qty_per_sale)}</span>`).join('')
      : '<span class="minv-link-none">—</span>';

    return `
      <div class="minv-row">
        <div class="minv-row-main">
          <div class="minv-name">${art.nom}<span class="minv-unit">${unit}</span></div>
          <div class="minv-stats">
            <div class="minv-stat"><span class="minv-stat-val">${_minvFmt(inQty)}</span><span class="minv-stat-label">Entrées</span></div>
            <div class="minv-stat"><span class="minv-stat-val">${_minvFmt(out)}</span><span class="minv-stat-label">Vendu</span></div>
            <div class="minv-stat"><span class="minv-badge ${badgeClass}">${soldeText}</span><span class="minv-stat-label">Variation</span></div>
          </div>
        </div>
        <div class="minv-links-cell">${linksHtml}</div>
      </div>`;
  };

  const sorted = [..._marcCategories].sort((a, b) => a.sort_order - b.sort_order);
  let html = '';
  sorted.forEach(cat => {
    const arts = groups[cat.id];
    if (!arts || arts.length === 0) return;
    html += `<div class="minv-cat-row">${cat.nom}</div>`;
    arts.slice().sort((a, b) => a.nom.localeCompare(b.nom)).forEach(a => html += buildRow(a));
  });
  if (nocat.length > 0) {
    html += `<div class="minv-cat-row">Sans catégorie</div>`;
    nocat.slice().sort((a, b) => a.nom.localeCompare(b.nom)).forEach(a => html += buildRow(a));
  }

  wrap.innerHTML = html;
}
