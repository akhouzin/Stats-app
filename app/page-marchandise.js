// ═══════════════════════════════════════
// MARCHANDISE — read-only mirror of the POS's daily merchandise purchases
// ═══════════════════════════════════════
// Replaces the old Inventaire (stock-balance) tab on the bottom nav. Shows,
// for one selected day, every article purchased that day (qty_pu/pkg/pl) and
// its cost — same per-line price-override rule as the POS
// (legacy/app/marchandise.js:_marcEffectivePrice()): a purchase's own
// price_pu/pkg/pl (marc_achats, 2026-09-01) wins when set, else the article's
// current catalog price (pu/pkg/pl). page-inventory.js stays loaded
// (CONSUMABLES/MANUAL_KEYWORDS/fmtNum are still used by
// page-barista.js/page-recette.js) — this file only replaces its PAGE, not
// its data. Reuses page-inventory.js's toISODate()/_minvFmt() (loads earlier).

let _pmcDayOffset = 0;
let _pmcScope = 'day';        // 'day' | 'month' — top-level toggle, mirrors page-inventory.js's period-bar convention
let _pmcMonthOffset = 0;      // months back from the current one, for the Month scope's own nav
let _pmcMonthView = 'simple'; // 'simple' | 'cats' | 'trends' — mirrors page-daily.js's Rapport view-mode tabs

function _pmcEffectivePrice(art, achat, type) {
  const override = achat[`price_${type}`];
  return (override !== null && override !== undefined) ? override : (art[type] || 0);
}

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

function setMarchScope(scope) {
  _pmcScope = scope;
  document.getElementById('marc-scope-btn-day').classList.toggle('active', scope === 'day');
  document.getElementById('marc-scope-btn-month').classList.toggle('active', scope === 'month');
  document.getElementById('marc-view-day').style.display = scope === 'day' ? 'block' : 'none';
  document.getElementById('marc-view-month').style.display = scope === 'month' ? 'block' : 'none';
  if (scope === 'month') renderMarchMonth();
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
    _pmcRenderKpis(0, 0, 0, null, 0);
    if (_pmcScope === 'month') renderMarchMonth();
    return;
  }

  const dayAchats = _marcAchats.filter(a => a.date === iso);
  if (dayAchats.length === 0) {
    wrap.innerHTML = '<div class="empty">Aucun achat ce jour-là.</div>';
    totalEl.textContent = fmtMoney(0);
    _pmcRenderKpis(0, 0, 0, null, 0);
    if (_pmcScope === 'month') renderMarchMonth();
    return;
  }

  const artMap = Object.fromEntries(_marcArticles.map(a => [a.id, a]));
  const catMap = Object.fromEntries(_marcCategories.map(c => [c.id, c]));

  const byArticle = {};
  dayAchats.forEach(a => {
    const art = artMap[a.article_id];
    if (!art) return; // article since deleted in the POS
    const cur = byArticle[a.article_id] || { qty_pu: 0, qty_pkg: 0, qty_pl: 0, cost: 0 };
    cur.qty_pu  += a.qty_pu  || 0;
    cur.qty_pkg += a.qty_pkg || 0;
    cur.qty_pl  += a.qty_pl  || 0;
    cur.cost += (a.qty_pu  || 0) * _pmcEffectivePrice(art, a, 'pu')
              + (a.qty_pkg || 0) * _pmcEffectivePrice(art, a, 'pkg')
              + (a.qty_pl  || 0) * _pmcEffectivePrice(art, a, 'pl');
    byArticle[a.article_id] = cur;
  });

  let dayTotal = 0;
  const groups = {};
  const nocat = [];
  const catCost = {}; // cat_id (or '__nocat__') -> cost, for the "Catégorie Vedette" KPI
  Object.keys(byArticle).forEach(id => {
    const art = artMap[id];
    const q = byArticle[id];
    dayTotal += q.cost;
    const row = { art, q, cost: q.cost };
    const catKey = (art.cat_id && catMap[art.cat_id]) ? art.cat_id : '__nocat__';
    catCost[catKey] = (catCost[catKey] || 0) + q.cost;
    if (catKey === '__nocat__') nocat.push(row);
    else (groups[catKey] = groups[catKey] || []).push(row);
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

  let topCatKey = null, topCatCost = -1;
  Object.keys(catCost).forEach(k => { if (catCost[k] > topCatCost) { topCatKey = k; topCatCost = catCost[k]; } });
  const topCatName = topCatKey === null ? null : (topCatKey === '__nocat__' ? 'Sans catégorie' : catMap[topCatKey].nom);
  _pmcRenderKpis(dayTotal, dayAchats.length, Object.keys(byArticle).length, topCatName, topCatCost);

  if (_pmcScope === 'month') renderMarchMonth();
}

function _pmcRenderKpis(total, lineCount, articleCount, topCatName, topCatCost) {
  document.getElementById('marc-kpi-total').textContent = fmtMoney(total);
  document.getElementById('marc-kpi-count').textContent = lineCount;
  document.getElementById('marc-kpi-articles').textContent = articleCount;
  document.getElementById('marc-kpi-cat').textContent = topCatName || '—';
  document.getElementById('marc-kpi-cat-sub').textContent = topCatName ? fmtMoney(topCatCost) : '—';
}

// ═══════════════════════════════════════
// MONTH SCOPE — mirrors page-daily.js's Rapport: a month-nav plus several
// specialized KPI-tab views (Résumé/Catégories/Tendances), each reading the
// same already-loaded _marcAchats (fetchMarcAchats() has no date filter —
// the whole purchase history is in memory, so month aggregation needs no
// extra fetch, unlike allOrders which is lazy-loaded per month).
// ═══════════════════════════════════════

function _pmcMonthDate(offset) {
  const d = new Date();
  d.setDate(1); // pin to day 1 first so setMonth() can't overflow into the wrong month on a 29-31 day source date
  d.setMonth(d.getMonth() + offset);
  return d;
}

function changeMarchMonth(dir) {
  const next = _pmcMonthOffset + dir;
  if (next > 0) return; // can't navigate into the future
  _pmcMonthOffset = next;
  renderMarchMonth();
}

function setMarchMonthView(mode) {
  _pmcMonthView = mode;
  document.getElementById('marc-mview-btn-simple').classList.toggle('active', mode === 'simple');
  document.getElementById('marc-mview-btn-cats').classList.toggle('active', mode === 'cats');
  document.getElementById('marc-mview-btn-trends').classList.toggle('active', mode === 'trends');
  document.getElementById('marc-mkpi-simple').style.display = mode === 'simple' ? 'grid' : 'none';
  document.getElementById('marc-mkpi-cats').style.display = mode === 'cats' ? 'grid' : 'none';
  document.getElementById('marc-mkpi-trends').style.display = mode === 'trends' ? 'grid' : 'none';
}

// Per-line cost for one achat row, using the same catalog-price-unless-overridden
// rule as the day view (_pmcEffectivePrice) and the printed POS receipt.
function _pmcAchatCost(art, achat) {
  return (achat.qty_pu  || 0) * _pmcEffectivePrice(art, achat, 'pu')
       + (achat.qty_pkg || 0) * _pmcEffectivePrice(art, achat, 'pkg')
       + (achat.qty_pl  || 0) * _pmcEffectivePrice(art, achat, 'pl');
}

// Aggregates a set of achats into total cost + per-category + per-article cost/count maps.
// artCount is how many separate purchase entries (achat rows) exist for that article —
// "how many times it was bought", not the summed quantity. Categoryless articles are
// bucketed under '__nocat__' (mirrors the day view's `nocat` list).
function _pmcAggregate(achats, artMap, catMap) {
  let total = 0;
  const catCost = {};
  const artCost = {};
  const artCount = {};
  achats.forEach(a => {
    const art = artMap[a.article_id];
    if (!art) return; // article since deleted in the POS
    const cost = _pmcAchatCost(art, a);
    total += cost;
    artCost[a.article_id] = (artCost[a.article_id] || 0) + cost;
    artCount[a.article_id] = (artCount[a.article_id] || 0) + 1;
    const catKey = (art.cat_id && catMap[art.cat_id]) ? art.cat_id : '__nocat__';
    catCost[catKey] = (catCost[catKey] || 0) + cost;
  });
  return { total, catCost, artCost, artCount };
}

function renderMarchMonth() {
  const monthDate = _pmcMonthDate(_pmcMonthOffset);
  const monthLabel = monthDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  document.getElementById('marc-month-label').textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  document.getElementById('marc-month-next').disabled = _pmcMonthOffset >= 0;

  const artMap = Object.fromEntries(_marcArticles.map(a => [a.id, a]));
  const catMap = Object.fromEntries(_marcCategories.map(c => [c.id, c]));

  const monthStartIso = toISODate(monthDate);
  const nextMonthIso = toISODate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1));
  const monthAchats = _marcAchats.filter(a => a.date >= monthStartIso && a.date < nextMonthIso);

  const catListEl = document.getElementById('marc-m-cat-list');

  if (monthAchats.length === 0) {
    document.getElementById('marc-m-total').textContent = fmtMoney(0);
    document.getElementById('marc-m-count').textContent = '0';
    document.getElementById('marc-m-active-days').textContent = '0';
    document.getElementById('marc-m-active-days-sub').textContent = '—';
    document.getElementById('marc-m-day-avg').textContent = fmtMoney(0);
    document.getElementById('marc-m-top-cat').textContent = '—';
    document.getElementById('marc-m-top-cat-sub').textContent = '—';
    document.getElementById('marc-m-top-cat-pct').textContent = '—';
    document.getElementById('marc-m-top-art').textContent = '—';
    document.getElementById('marc-m-top-art-sub').textContent = '—';
    document.getElementById('marc-m-cat-count').textContent = '0';
    document.getElementById('marc-m-trend').textContent = '—';
    document.getElementById('marc-m-trend').className = 'kpi-value';
    document.getElementById('marc-m-trend-sub').textContent = '—';
    document.getElementById('marc-m-best-day').textContent = '—';
    document.getElementById('marc-m-best-day-sub').textContent = '—';
    document.getElementById('marc-m-avg-line').textContent = fmtMoney(0);
    document.getElementById('marc-m-idle-days').textContent = '—';
    document.getElementById('marc-m-idle-days-sub').textContent = '—';
    catListEl.innerHTML = '<div class="empty">Aucun achat ce mois-ci.</div>';
    setMarchMonthView(_pmcMonthView);
    return;
  }

  const { total, catCost, artCost, artCount } = _pmcAggregate(monthAchats, artMap, catMap);
  const activeDays = new Set(monthAchats.map(a => a.date)).size;
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const isCurrentMonth = _pmcMonthOffset === 0;
  const daysElapsed = isCurrentMonth ? new Date().getDate() : daysInMonth;

  // Résumé
  document.getElementById('marc-m-total').textContent = fmtMoney(total);
  document.getElementById('marc-m-count').textContent = monthAchats.length;
  document.getElementById('marc-m-active-days').textContent = activeDays;
  document.getElementById('marc-m-active-days-sub').textContent = `sur ${daysElapsed} jours`;
  document.getElementById('marc-m-day-avg').textContent = fmtMoney(total / activeDays);

  // Catégories
  const rankedCats = Object.entries(catCost).sort((a, b) => b[1] - a[1]);
  const [topCatKey, topCatCost] = rankedCats[0];
  const topCatName = topCatKey === '__nocat__' ? 'Sans catégorie' : catMap[topCatKey].nom;
  document.getElementById('marc-m-top-cat').textContent = topCatName;
  document.getElementById('marc-m-top-cat-sub').textContent = `${fmtMoney(topCatCost)} Dhs`;
  document.getElementById('marc-m-top-cat-pct').textContent = `${(topCatCost / total * 100).toFixed(0)}%`;
  document.getElementById('marc-m-cat-count').textContent = rankedCats.filter(([k]) => k !== '__nocat__').length;

  const rankedArts = Object.entries(artCost).sort((a, b) => b[1] - a[1]);
  const [topArtId, topArtCost] = rankedArts[0];
  const topArt = artMap[topArtId];
  document.getElementById('marc-m-top-art').textContent = topArt ? topArt.nom : '—';
  document.getElementById('marc-m-top-art-sub').textContent = `${fmtMoney(topArtCost)} Dhs`;

  // Tendances
  const prevMonthDate = _pmcMonthDate(_pmcMonthOffset - 1);
  const prevMonthStartIso = toISODate(prevMonthDate);
  const prevMonthAchats = _marcAchats.filter(a => a.date >= prevMonthStartIso && a.date < monthStartIso);
  const trendEl = document.getElementById('marc-m-trend');
  const trendSubEl = document.getElementById('marc-m-trend-sub');
  if (prevMonthAchats.length) {
    const prevTotal = _pmcAggregate(prevMonthAchats, artMap, catMap).total;
    const delta = prevTotal > 0 ? ((total - prevTotal) / prevTotal * 100) : null;
    // Spending going UP is the "bad" direction for a cost report (opposite of Rapport's revenue trend).
    trendEl.textContent = delta === null ? '—' : (delta >= 0 ? '+' : '') + delta.toFixed(0) + '%';
    trendEl.className = 'kpi-value' + (delta === null ? '' : (delta >= 0 ? ' red' : ' green'));
    trendSubEl.textContent = `vs ${fmtMoney(prevTotal)} Dhs`;
  } else {
    trendEl.textContent = '—';
    trendEl.className = 'kpi-value';
    trendSubEl.textContent = 'Pas de données';
  }

  const dayTotals = {};
  monthAchats.forEach(a => {
    const art = artMap[a.article_id];
    if (!art) return;
    dayTotals[a.date] = (dayTotals[a.date] || 0) + _pmcAchatCost(art, a);
  });
  const [bestDayIso, bestDayCost] = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];
  const bestDayDate = new Date(bestDayIso + 'T00:00:00');
  document.getElementById('marc-m-best-day').textContent = bestDayDate.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
  document.getElementById('marc-m-best-day-sub').textContent = `${fmtMoney(bestDayCost)} Dhs`;

  document.getElementById('marc-m-avg-line').textContent = fmtMoney(total / monthAchats.length);
  document.getElementById('marc-m-idle-days').textContent = Math.max(0, daysElapsed - activeDays);
  document.getElementById('marc-m-idle-days-sub').textContent = `sur ${daysElapsed} jours`;

  // Category-grouped, per-article breakdown — same row shape as the day view's
  // buildRow() (.minv-row/.minv-name/.minv-unit/.minv-stats), so each article shows
  // how many separate purchases it had this month (artCount) plus both its cost and
  // its share of the month's total (artCost / total), grouped under category headers
  // sorted the same way the day list is (catCategories.sort_order, "Sans catégorie" last).
  const artIdsByCat = {};
  const artIdsNocat = [];
  Object.keys(artCost).forEach(id => {
    const art = artMap[id];
    if (!art) return;
    const catKey = (art.cat_id && catMap[art.cat_id]) ? art.cat_id : null;
    if (catKey) (artIdsByCat[catKey] = artIdsByCat[catKey] || []).push(id);
    else artIdsNocat.push(id);
  });
  const buildMonthArtRow = (id) => {
    const art = artMap[id];
    const cost = artCost[id];
    const count = artCount[id];
    const pct = (cost / total * 100).toFixed(0);
    return `
      <div class="minv-row">
        <div class="minv-row-main">
          <div class="minv-name">${art.nom}<span class="minv-unit">×${count} achat${count > 1 ? 's' : ''}</span></div>
          <div class="minv-stats">
            <div class="minv-stat"><span class="minv-stat-val">${pct}%</span><span class="minv-stat-label">Part</span></div>
            <div class="minv-stat"><span class="minv-stat-val">${fmtMoney(cost)}</span><span class="minv-stat-label">Coût</span></div>
          </div>
        </div>
      </div>`;
  };
  const catSorted = [..._marcCategories].sort((a, b) => a.sort_order - b.sort_order);
  let listHtml = '';
  catSorted.forEach(cat => {
    const ids = artIdsByCat[cat.id];
    if (!ids || ids.length === 0) return;
    listHtml += `<div class="minv-cat-row">${cat.nom}</div>`;
    ids.slice().sort((a, b) => artCost[b] - artCost[a]).forEach(id => listHtml += buildMonthArtRow(id));
  });
  if (artIdsNocat.length > 0) {
    listHtml += `<div class="minv-cat-row">Sans catégorie</div>`;
    artIdsNocat.slice().sort((a, b) => artCost[b] - artCost[a]).forEach(id => listHtml += buildMonthArtRow(id));
  }
  catListEl.innerHTML = listHtml;

  setMarchMonthView(_pmcMonthView);
}
