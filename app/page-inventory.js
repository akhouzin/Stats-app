// ═══════════════════════════════════════
// INVENTAIRE — consumption math shared by page-barista.js / page-daily.js
// Entrées = marc_achats (converted via conv_pkg/conv_pl), Vendu = orders
// whose items are linked (marc_links) to a Marchandise article. A "tracked"
// article is any _marcArticles row with at least one _marcLinks entry —
// there is no hardcoded consumable list; everything is driven by whatever
// the gérant links in the POS's Inventaire → Liaisons UI.
//
// Mirrors the POS's legacy/app/marc-inventaire.js + marc-units.js (separate
// app, no shared code): quantity formatting by unit family, stock counted
// from each product's first purchase, "faible" under 3 days of stock.
// ═══════════════════════════════════════

function toISODate(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

const _MINV_LOW_DAYS = 3;
const _MINV_AVG_DAYS = 14;

// ── Units (mirror of legacy/app/marc-units.js) ──
const _MINV_UNIT_FACTORS = { g: ['weight', 1], kg: ['weight', 1000], ml: ['volume', 1], cl: ['volume', 10], L: ['volume', 1000] };
const _MINV_UNIT_ALIASES = {
  g: 'g', gr: 'g', grs: 'g', gramme: 'g', grammes: 'g', kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
  ml: 'ml', cl: 'cl', l: 'L', lt: 'L', litre: 'L', litres: 'L',
};
const _MINV_NF  = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const _MINV_NF3 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });

function _minvUnitInfo(unitLabel) {
  const raw = String(unitLabel == null ? '' : unitLabel).trim();
  const id = _MINV_UNIT_ALIASES[raw.toLowerCase()];
  if (id) return { family: _MINV_UNIT_FACTORS[id][0], unit: id, factor: _MINV_UNIT_FACTORS[id][1] };
  return { family: 'piece', unit: raw || 'pièce', factor: 1 };
}

// "1,5 kg", "12 cl", "3 bouteille"
function _minvFmtQty(value, unitLabel) {
  const v = Number(value) || 0;
  const info = _minvUnitInfo(unitLabel);
  if (info.family === 'piece') return `${_MINV_NF.format(v)} ${info.unit}`;
  const base = v * info.factor, abs = Math.abs(base);
  let unit;
  if (abs < 1e-9) unit = info.unit;
  else if (info.family === 'weight') unit = abs >= 1000 ? 'kg' : 'g';
  else if (abs >= 1000) unit = 'L';
  else unit = info.unit === 'ml' || abs < 10 || (abs % 10 !== 0 && abs < 100) ? 'ml' : 'cl';
  const shown = base / _MINV_UNIT_FACTORS[unit][1];
  return `${(unit === 'kg' || unit === 'L' ? _MINV_NF3 : _MINV_NF).format(shown)} ${unit}`;
}

// ── Stock math ──
function _minvTrackedArticles() {
  return _marcArticles.filter(a => _marcLinks.some(l => l.article_id === a.id));
}

function _minvStockIn(article, achats) {
  const convPkg = article.conv_pkg != null ? article.conv_pkg : 1;
  const convPl  = article.conv_pl  != null ? article.conv_pl  : 1;
  let total = 0;
  (achats || _marcAchats).forEach(a => {
    if (a.article_id !== article.id) return;
    total += (a.qty_pu || 0) + (a.qty_pkg || 0) * convPkg + (a.qty_pl || 0) * convPl;
  });
  return total;
}

function _minvStockOut(article, orders) {
  const ords = orders || allOrders || [];
  let total = 0;
  _marcLinks
    .filter(l => l.article_id === article.id)
    .forEach(link => {
      ords.forEach(o => {
        (o.items || []).forEach(item => {
          if (item.name === link.item_name) total += item.qty * (link.qty_per_sale || 0);
        });
      });
    });
  return total;
}

// Local midnight of the product's first purchase, or null (see the POS's
// marc-inventaire.js:_minvStockStart for why stock starts there).
function _minvStockStart(article) {
  let first = null;
  _marcAchats.forEach(a => {
    if (a.article_id === article.id && a.date && (!first || a.date < first)) first = a.date;
  });
  return first ? new Date(first + 'T00:00:00') : null;
}

// { stock, daily, cover, status: 'ok'|'low'|'out' } — needs allOrders loaded
// back to _minvStockStart(article) (page-barista.js makes sure of that).
function _minvStockStatus(article) {
  const start = _minvStockStart(article);
  const since = start ? allOrders.filter(o => o.time >= start) : allOrders;
  const stock = _minvStockIn(article) - _minvStockOut(article, since);
  const recentFrom = new Date(); recentFrom.setHours(0, 0, 0, 0);
  recentFrom.setDate(recentFrom.getDate() - (_MINV_AVG_DAYS - 1));
  const daily = _minvStockOut(article, allOrders.filter(o => o.time >= recentFrom)) / _MINV_AVG_DAYS;
  const cover = daily > 0 ? stock / daily : null;
  const status = stock <= 0 ? 'out' : (cover !== null && cover < _MINV_LOW_DAYS ? 'low' : 'ok');
  return { stock, daily, cover, status };
}
