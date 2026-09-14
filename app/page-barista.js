// ═══════════════════════════════════════
// RAPPORT BARISTA
// ═══════════════════════════════════════
function renderBaristaReport(todayOrders, dayLabelLower) {
  dayLabelLower = dayLabelLower || "aujourd'hui";

  // One row per Marchandise article linked (Inventaire → Liens) to a sold
  // item — no hardcoded consumable list. See page-inventory.js.
  const rows = [];
  _minvTrackedArticles().forEach(art => {
    const consumed = _minvStockOut(art, todayOrders);
    const hasStock = _marcAchats.some(a => a.article_id === art.id);
    const stock    = hasStock ? _minvStockIn(art) - _minvStockOut(art) : null;
    if (consumed === 0 && !hasStock) return; // skip completely untracked + unused
    rows.push({ label: art.nom, unit: art.unit_label || 'unité', consumed, stock, hasStock });
  });

  if (!rows.length) {
    document.getElementById('t-barista').innerHTML = `<div class="empty">Aucune activité ${dayLabelLower}</div>`;
    return;
  }

  function stockClass(stock, hasStock) {
    if (!hasStock || stock === null) return 'none';
    const s = Math.max(0, stock);
    if (s <= 0) return 'out';
    if (s < 5)  return 'low';
    return 'ok';
  }

  const header = `
    <div class="bsr-header">
      <div class="bsr-header-name">Article</div>
      <div class="bsr-header-col">Consommé</div>
      <div class="bsr-header-col">Stock restant</div>
    </div>`;

  const body = rows.map(r => {
    const cls     = stockClass(r.stock, r.hasStock);
    const stockDisp = !r.hasStock || r.stock === null ? '—' : fmtNum(Math.max(0, r.stock));
    const consDisp  = r.consumed > 0 ? fmtNum(r.consumed) : '—';
    const consCls   = r.consumed > 0 ? 'cons' : 'none';
    return `
      <div class="bsr-row">
        <div class="bsr-name">
          <div class="bsr-item-name">${r.label}</div>
          <div class="bsr-item-unit">${r.unit}</div>
        </div>
        <div class="bsr-col"><span class="bsr-val ${consCls}">${consDisp}</span></div>
        <div class="bsr-col">
          <span class="bsr-dot ${cls}"></span><span class="bsr-val ${cls}">${stockDisp}</span>
        </div>
      </div>`;
  }).join('');

  document.getElementById('t-barista').innerHTML = header + body;
}
