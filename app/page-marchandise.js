// ═══════════════════════════════════════
// MARCHANDISE — read-only mirror of the POS's daily merchandise purchases
// ═══════════════════════════════════════
// Replaces the old Inventaire (stock-balance) tab on the bottom nav. Shows,
// for one selected day, every article purchased that day (qty_pu/pkg/pl) and
// its cost at the article's current catalog price (pu/pkg/pl) — the stats-
// server's read-only /api/marc/achats mirror does not expose per-day price
// overrides (see legacy/app/marchandise.js:_marcEffectivePrice()), so a day
// that used an override may show a slightly different total here than the
// POS's own printed "Marchandise du jour" ticket. page-inventory.js stays
// loaded (CONSUMABLES/MANUAL_KEYWORDS/fmtNum are still used by
// page-barista.js/page-recette.js) — this file only replaces its PAGE, not
// its data. Reuses page-inventory.js's toISODate()/_minvFmt() (loads earlier).

let _pmcDayOffset = 0;

function _pmcDateForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

function changeMarchDay(dir) {
  const next = _pmcDayOffset + dir;
  if (next > 0) return; // can't navigate into the future
  _pmcDayOffset = next;
  renderMarchandise();
}

function renderMarchandise() {
  const day = _pmcDateForOffset(_pmcDayOffset);
  const iso = toISODate(day);

  document.getElementById('marc-day-label').textContent = getDayKey(day);
  document.getElementById('marc-day-next').disabled = _pmcDayOffset >= 0;

  const wrap = document.getElementById('marc-table-wrap');
  const totalEl = document.getElementById('marc-day-total');

  if (_marcArticles.length === 0) {
    wrap.innerHTML = '<div class="empty">Aucun article configuré dans Marchandise.</div>';
    totalEl.textContent = fmtMoney(0);
    return;
  }

  const dayAchats = _marcAchats.filter(a => a.date === iso);
  if (dayAchats.length === 0) {
    wrap.innerHTML = '<div class="empty">Aucun achat ce jour-là.</div>';
    totalEl.textContent = fmtMoney(0);
    return;
  }

  const artMap = Object.fromEntries(_marcArticles.map(a => [a.id, a]));
  const catMap = Object.fromEntries(_marcCategories.map(c => [c.id, c]));

  const byArticle = {};
  dayAchats.forEach(a => {
    const cur = byArticle[a.article_id] || { qty_pu: 0, qty_pkg: 0, qty_pl: 0 };
    cur.qty_pu  += a.qty_pu  || 0;
    cur.qty_pkg += a.qty_pkg || 0;
    cur.qty_pl  += a.qty_pl  || 0;
    byArticle[a.article_id] = cur;
  });

  let dayTotal = 0;
  const groups = {};
  const nocat = [];
  Object.keys(byArticle).forEach(id => {
    const art = artMap[id];
    if (!art) return; // article since deleted in the POS
    const q = byArticle[id];
    const cost = (q.qty_pu || 0) * (art.pu || 0) + (q.qty_pkg || 0) * (art.pkg || 0) + (q.qty_pl || 0) * (art.pl || 0);
    dayTotal += cost;
    const row = { art, q, cost };
    if (art.cat_id && catMap[art.cat_id]) (groups[art.cat_id] = groups[art.cat_id] || []).push(row);
    else nocat.push(row);
  });

  const buildRow = ({ art, q, cost }) => {
    const unit = art.unit_label || 'unité';
    const parts = [];
    if (q.qty_pu)  parts.push(`${_minvFmt(q.qty_pu)} ${unit}`);
    if (q.qty_pkg) parts.push(`${_minvFmt(q.qty_pkg)} pkg`);
    if (q.qty_pl)  parts.push(`${_minvFmt(q.qty_pl)} pl`);
    return `
      <div class="minv-row">
        <div class="minv-row-main">
          <div class="minv-name">${art.nom}<span class="minv-unit">${parts.join(', ')}</span></div>
          <div class="minv-stats">
            <div class="minv-stat"><span class="minv-stat-val">${fmtMoney(cost)}</span><span class="minv-stat-label">Coût</span></div>
          </div>
        </div>
      </div>`;
  };

  const sorted = [..._marcCategories].sort((a, b) => a.sort_order - b.sort_order);
  let html = '';
  sorted.forEach(cat => {
    const rows = groups[cat.id];
    if (!rows || rows.length === 0) return;
    html += `<div class="minv-cat-row">${cat.nom}</div>`;
    rows.slice().sort((a, b) => a.art.nom.localeCompare(b.art.nom)).forEach(r => html += buildRow(r));
  });
  if (nocat.length > 0) {
    html += `<div class="minv-cat-row">Sans catégorie</div>`;
    nocat.slice().sort((a, b) => a.art.nom.localeCompare(b.art.nom)).forEach(r => html += buildRow(r));
  }

  wrap.innerHTML = html;
  totalEl.textContent = fmtMoney(dayTotal);
}
