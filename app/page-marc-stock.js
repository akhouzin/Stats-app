// ═══════════════════════════════════════
// MARCHANDISE → STOCK — consumption + "à commander" (added 2026-09-23)
// ═══════════════════════════════════════
// Third scope of the Marchandise tab (Jour | Mois | Stock). For every
// Marchandise article linked to Carte articles (POS → Inventaire → Liaisons)
// it shows how much was consumed (today / 7 days / 30 days), the theoretical
// stock left, the daily average and how many days that stock covers — then
// pulls the articles that are out or running low into an "À commander" list
// with a suggested purchase for _MST_TARGET_DAYS days.
//
// All the maths is page-inventory.js's (_minvTrackedArticles, _minvStockOut,
// _minvStockStatus, _minvStockStart, _minvFmtQty — the one consumption model
// shared with page-barista.js/page-daily.js and mirrored from the POS's
// marc-inventaire.js); this file only aggregates and renders. Loads after
// page-marchandise.js (setMarchScope() calls renderMarchStock()).

const _MST_TARGET_DAYS = 7;          // suggested purchase covers this many days
let _mstHistoryTarget = null;        // earliest date already requested from the loader
let _mstFilter = 'all';              // 'all' | 'order'

function _mstEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setMarchStockFilter(f) {
  _mstFilter = f;
  renderMarchStock();
}

// Stock is counted from each article's first purchase and the daily average
// over 14 days, both of which can reach back past what Stats preloads (the
// current month) — load that history once, then re-render. Same approach as
// page-barista.js.
function _mstEnsureHistory(tracked) {
  const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - 29);
  const starts = tracked.map(_minvStockStart).filter(Boolean);
  const earliest = new Date(Math.min(from, ...starts));
  const ready = typeof _historyLoadedFrom !== 'undefined' && _historyLoadedFrom && earliest >= _historyLoadedFrom;
  if (!ready && typeof ensureOrdersLoadedThrough === 'function'
      && (!_mstHistoryTarget || earliest < _mstHistoryTarget)) {
    _mstHistoryTarget = earliest;
    ensureOrdersLoadedThrough(earliest, 0)
      .then(() => { if (_pmcScope === 'stock') renderMarchStock(); })
      .catch(e => console.error('[marc-stock] history load failed:', e && e.message));
  }
  return ready;
}

// Suggested purchase to reach _MST_TARGET_DAYS of cover, expressed in the
// article's biggest purchase unit when one is configured (e.g. "≈ 3 Pkg"),
// else in its stock unit.
function _mstSuggestion(art, st) {
  if (!(st.daily > 0)) return null;
  const unit = art.unit_label || 'pièce';
  const raw  = st.daily * _MST_TARGET_DAYS - Math.max(0, st.stock);
  if (raw <= 0) return null;
  // Pieces are bought whole; weights/volumes keep 2 decimals.
  const need = _minvUnitInfo(unit).family === 'piece' ? Math.ceil(raw) : Math.ceil(raw * 100) / 100;
  const conv = [['Pkg', art.conv_pkg], ['Lot', art.conv_pl]].filter(([, c]) => c && c > 1).sort((a, b) => a[1] - b[1]);
  const pack = conv.find(([, c]) => need >= c * 0.5) || null;
  if (pack) return `≈ ${Math.ceil(need / pack[1])} ${pack[0]} (${_minvFmtQty(need, unit)})`;
  return `≈ ${_minvFmtQty(need, unit)}`;
}

function renderMarchStock() {
  const host = document.getElementById('marc-stock-body');
  if (!host) return;

  const tracked = _minvTrackedArticles();
  const unlinked = _marcArticles.length - tracked.length;
  if (!tracked.length) {
    host.innerHTML = `<div class="card"><div class="empty">Aucun article suivi.<br>
      Liez vos articles Marchandise aux articles de la Carte dans le POS
      (Gestion → Inventaire → Liaisons) pour suivre leur consommation.</div></div>`;
    return;
  }

  const ready = _mstEnsureHistory(tracked);
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const d7 = new Date(today0); d7.setDate(d7.getDate() - 6);
  const d30 = new Date(today0); d30.setDate(d30.getDate() - 29);
  const ordersToday = allOrders.filter(o => o.time >= today0);
  const orders7 = allOrders.filter(o => o.time >= d7);
  const orders30 = allOrders.filter(o => o.time >= d30);

  const rows = tracked.map(art => {
    const unit = art.unit_label || 'pièce';
    const hasStock = _marcAchats.some(a => a.article_id === art.id);
    const st = hasStock && ready ? _minvStockStatus(art) : null;
    return {
      art, unit, hasStock, st,
      today: _minvStockOut(art, ordersToday),
      week: _minvStockOut(art, orders7),
      month: _minvStockOut(art, orders30),
      suggestion: st && st.status !== 'ok' ? _mstSuggestion(art, st) : null,
    };
  });

  const toOrder = rows.filter(r => r.st && (r.st.status === 'out' || r.st.status === 'low'));
  const outCount = rows.filter(r => r.st && r.st.status === 'out').length;
  const lowCount = rows.filter(r => r.st && r.st.status === 'low').length;
  const noPurchase = rows.filter(r => !r.hasStock).length;

  // Most urgent first: rupture, then fewest days of cover, then the rest by name.
  const rank = r => !r.st ? 3 : r.st.status === 'out' ? 0 : r.st.status === 'low' ? 1 : 2;
  rows.sort((a, b) => rank(a) - rank(b)
    || ((a.st && a.st.cover != null ? a.st.cover : 1e9) - (b.st && b.st.cover != null ? b.st.cover : 1e9))
    || a.art.nom.localeCompare(b.art.nom));

  const kpis = `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Articles suivis</div><div class="kpi-value">${tracked.length}</div><div class="kpi-sub">${unlinked > 0 ? `${unlinked} non liés` : 'tous liés'}</div></div>
      <div class="kpi"><div class="kpi-label">À commander</div><div class="kpi-value${toOrder.length ? ' red' : ' green'}">${ready ? toOrder.length : '…'}</div><div class="kpi-sub">pour ${_MST_TARGET_DAYS} jours</div></div>
      <div class="kpi"><div class="kpi-label">En rupture</div><div class="kpi-value">${ready ? outCount : '…'}</div><div class="kpi-sub">stock ≤ 0</div></div>
      <div class="kpi"><div class="kpi-label">Stock faible</div><div class="kpi-value">${ready ? lowCount : '…'}</div><div class="kpi-sub">&lt; ${_MINV_LOW_DAYS} j de stock</div></div>
    </div>`;

  const orderCard = !ready ? '' : toOrder.length ? `
    <div class="card mst-order-card">
      <div class="card-title">À commander — pour ${_MST_TARGET_DAYS} jours</div>
      ${toOrder.map(r => `
        <div class="mst-order-row">
          <div class="mst-order-name">
            <span class="bsr-dot ${r.st.status}"></span>${_mstEsc(r.art.nom)}
            <div class="mst-sub">${r.st.status === 'out' ? 'Rupture' : `≈ ${Math.max(0, Math.floor(r.st.cover))} j de stock`} · stock ${_mstEsc(_minvFmtQty(r.st.stock, r.unit))}</div>
          </div>
          <div class="mst-order-qty">${r.suggestion ? _mstEsc(r.suggestion) : '—'}</div>
        </div>`).join('')}
    </div>` : `
    <div class="card mst-order-card"><div class="card-title">À commander</div>
      <div class="empty">Rien à commander — tous les articles suivis ont au moins ${_MINV_LOW_DAYS} jours de stock.</div></div>`;

  const shown = _mstFilter === 'order' ? rows.filter(r => r.st && r.st.status !== 'ok') : rows;
  const list = shown.map(r => {
    const f = v => v > 0 ? _mstEsc(_minvFmtQty(v, r.unit)) : '—';
    const stockTxt = !r.hasStock ? 'Aucun achat' : r.st ? _mstEsc(_minvFmtQty(r.st.stock, r.unit)) : '…';
    const coverTxt = !r.st ? '' : r.st.status === 'out' ? 'Rupture'
      : r.st.cover == null ? 'Pas de vente récente' : r.st.cover < 1 ? '< 1 j' : `≈ ${Math.floor(r.st.cover)} j`;
    const cls = !r.st ? 'none' : r.st.status;
    return `
      <div class="mst-row">
        <div class="mst-row-head">
          <span class="bsr-dot ${cls}"></span>
          <span class="mst-name">${_mstEsc(r.art.nom)}</span>
          <span class="mst-stock ${cls}">${stockTxt}</span>
        </div>
        <div class="mst-grid">
          <div><span>Aujourd'hui</span><b>${f(r.today)}</b></div>
          <div><span>7 jours</span><b>${f(r.week)}</b></div>
          <div><span>30 jours</span><b>${f(r.month)}</b></div>
          <div><span>Moy./jour</span><b>${r.st && r.st.daily > 0 ? _mstEsc(_minvFmtQty(r.st.daily, r.unit)) : '—'}</b></div>
        </div>
        ${coverTxt ? `<div class="mst-sub">${coverTxt}${r.suggestion ? ` · commander ${_mstEsc(r.suggestion)}` : ''}</div>` : ''}
      </div>`;
  }).join('') || `<div class="empty">Aucun article en alerte.</div>`;

  host.innerHTML = kpis + orderCard + `
    <div class="card">
      <div class="card-title mst-list-title">
        <span>Consommation par article</span>
        <span class="mst-filter">
          <button class="${_mstFilter === 'all' ? 'active' : ''}" onclick="setMarchStockFilter('all')">Tous</button>
          <button class="${_mstFilter === 'order' ? 'active' : ''}" onclick="setMarchStockFilter('order')">Alertes</button>
        </span>
      </div>
      ${list}
      ${noPurchase ? `<div class="mst-note">${noPurchase} article${noPurchase > 1 ? 's' : ''} suivi${noPurchase > 1 ? 's' : ''} sans aucun achat enregistré — le stock commence au premier achat.</div>` : ''}
    </div>`;
}
