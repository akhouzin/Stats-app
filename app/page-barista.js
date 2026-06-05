// ═══════════════════════════════════════
// RAPPORT BARISTA
// ═══════════════════════════════════════
function renderBaristaReport(todayOrders) {
  const now = new Date();
  const cons = calcConsumption(todayOrders);

  // Build unified item list: consumables (auto-calc) + manual items (keyword-counted)
  const rows = [];

  CONSUMABLES.forEach(c => {
    const consumed  = cons[c.key] || 0;
    const hasStock  = getLatestSnapshot(c.key, now) !== null;
    const stock     = hasStock ? stockBalanceAt(c.key, now) : null;
    if (consumed === 0 && !hasStock) return; // skip completely untracked + unused
    rows.push({ label: c.label, unit: c.unit, consumed, stock, hasStock });
  });

  MANUAL_ITEMS.forEach(m => {
    const kw       = MANUAL_KEYWORDS[m.key] || [];
    const consumed = kw.length ? countSoldItems(todayOrders, kw) : 0;
    const hasStock = getLatestSnapshot(m.key, now) !== null;
    const stock    = hasStock ? stockBalanceAt(m.key, now) : null;
    if (consumed === 0 && !hasStock) return;
    rows.push({ label: m.label, unit: m.unit, consumed, stock, hasStock });
  });

  if (!rows.length) {
    document.getElementById('t-barista').innerHTML = '<div class="empty">Aucune activité aujourd\'hui</div>';
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
