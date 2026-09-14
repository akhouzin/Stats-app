// ═══════════════════════════════════════
// RAPPORT BARISTA
// ═══════════════════════════════════════
let _bsrHistoryTarget = null; // earliest purchase date already requested from the loader

function renderBaristaReport(todayOrders, dayLabelLower) {
  dayLabelLower = dayLabelLower || "aujourd'hui";

  // Stock counts from each product's first purchase, which can be older than
  // the orders Stats preloads (current month) — load back to it once, then
  // re-render. Until then the stock column shows "…" instead of a wrong value.
  const tracked = _minvTrackedArticles();
  const starts = tracked.map(_minvStockStart).filter(Boolean);
  const earliest = starts.length ? new Date(Math.min(...starts)) : null;
  const historyReady = !earliest || (typeof _historyLoadedFrom !== 'undefined' && _historyLoadedFrom && earliest >= _historyLoadedFrom);
  if (!historyReady && typeof ensureOrdersLoadedThrough === 'function'
      && (!_bsrHistoryTarget || earliest < _bsrHistoryTarget)) {
    _bsrHistoryTarget = earliest;
    ensureOrdersLoadedThrough(earliest, 0)
      // renderToday() rather than these arguments: the day shown may have changed meanwhile.
      .then(() => (typeof renderToday === 'function' ? renderToday() : renderBaristaReport(todayOrders, dayLabelLower)))
      .catch(e => console.error('[barista] history load failed:', e && e.message));
  }

  // One row per Marchandise article linked (Inventaire → Liaisons) to a sold
  // item — no hardcoded consumable list. See page-inventory.js.
  const rows = [];
  tracked.forEach(art => {
    const consumed = _minvStockOut(art, todayOrders);
    const hasStock = _marcAchats.some(a => a.article_id === art.id);
    const st       = hasStock && historyReady ? _minvStockStatus(art) : null;
    if (consumed === 0 && !hasStock) return; // skip completely untracked + unused
    rows.push({ label: art.nom, unit: art.unit_label || 'pièce', consumed, hasStock, st });
  });

  if (!rows.length) {
    document.getElementById('t-barista').innerHTML = `<div class="empty">Aucune activité ${dayLabelLower}</div>`;
    return;
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const header = `
    <div class="bsr-header">
      <div class="bsr-header-name">Article</div>
      <div class="bsr-header-col">Consommé</div>
      <div class="bsr-header-col">Stock restant</div>
    </div>`;

  const body = rows.map(r => {
    const cls       = !r.hasStock ? 'none' : (r.st ? r.st.status : 'none');
    const stockDisp = !r.hasStock ? '—' : (r.st ? esc(_minvFmtQty(r.st.stock, r.unit)) : '…');
    const consDisp  = r.consumed > 0 ? esc(_minvFmtQty(r.consumed, r.unit)) : '—';
    const consCls   = r.consumed > 0 ? 'cons' : 'none';
    const cover     = r.st && r.st.cover !== null ? (r.st.cover < 1 ? '< 1 j' : `≈ ${Math.floor(r.st.cover)} j`) : '';
    return `
      <div class="bsr-row">
        <div class="bsr-name">
          <div class="bsr-item-name">${esc(r.label)}</div>
          <div class="bsr-item-unit">${r.st && r.st.status === 'out' ? 'Rupture' : (cover ? cover + ' de stock' : esc(r.unit))}</div>
        </div>
        <div class="bsr-col"><span class="bsr-val ${consCls}">${consDisp}</span></div>
        <div class="bsr-col">
          <span class="bsr-dot ${cls}"></span><span class="bsr-val ${cls}">${stockDisp}</span>
        </div>
      </div>`;
  }).join('');

  document.getElementById('t-barista').innerHTML = header + body;
}
