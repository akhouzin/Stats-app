// ═══════════════════════════════════════
// KPI DETAILS — tap a stat card to expand it into a detail panel.
//
// The panel is inserted into the card's own .kpi-grid as a full-width item
// right after the card's ROW (not by widening the card itself, which would
// reflow/reorder the grid), visually attached to the card by a caret. Tap
// the card again (or another one) to close. Only one panel is open at a
// time. What each card shows is registered in kpi-details-defs.js:
//
//   _KD[key] = () => html     key = the card's data-kpi attribute, or the id
//                             of its .kpi-value element (static cards)
//
// The open panel follows the data live: a MutationObserver on the card
// re-renders it whenever the page re-renders that card's value (60 s/15 s
// refresh, day/month navigation), without the page renderers knowing about
// this file at all.
// ═══════════════════════════════════════

const _KD = {};
let _kdOpen = null; // { key, card, panel, observer, html }

function _kdKeyOf(card) {
  if (card.dataset.kpi) return card.dataset.kpi;
  const v = card.querySelector('.kpi-value[id]');
  return v ? v.id : null;
}

// Adds the tappable affordance (chevron, pointer) to every registered card
// currently in the DOM. Re-run by pages that rebuild their grids.
function _kdMarkExpandable(root) {
  (root || document).querySelectorAll('.kpi-grid > .kpi').forEach(card => {
    const key = _kdKeyOf(card);
    card.classList.toggle('kpi-expandable', !!(key && _KD[key]));
  });
}
document.addEventListener('DOMContentLoaded', () => _kdMarkExpandable());

document.addEventListener('click', e => {
  const card = e.target.closest('.kpi-grid > .kpi');
  if (!card) return;
  const key = _kdKeyOf(card);
  if (!key || !_KD[key]) return;
  if (_kdOpen && _kdOpen.card === card) _kdClose();
  else _kdOpenCard(card, key);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') _kdClose(); });

// quiet: re-attaching after a page rebuilt the grid — no animation, no scroll.
function _kdOpenCard(card, key, quiet) {
  _kdClose(true);
  const grid = card.parentElement;
  const cards = [...grid.children].filter(c => c.classList.contains('kpi'));
  const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
  const i = cards.indexOf(card);
  const col = i % cols;
  const rowEnd = cards[Math.min(cards.length - 1, i - col + cols - 1)];

  const panel = document.createElement('div');
  panel.className = 'kpi-detail';
  panel.style.setProperty('--kd-caret', `${((col + 0.5) / cols) * 100}%`);
  panel.innerHTML = '<div class="kd-clip"><div class="kd-body"></div></div>';
  rowEnd.after(panel);
  card.classList.add('kpi-open');

  const observer = new MutationObserver(() => _kdScheduleRender());
  observer.observe(card, { subtree: true, childList: true, characterData: true });
  _kdOpen = { key, card, panel, observer, html: null };
  _kdRender();

  if (quiet) { panel.classList.add('open', 'kd-instant'); return; }
  // Force a layout of the collapsed state, then open — not rAF, which Chromium
  // pauses while the window is covered (the panel would stay collapsed).
  void panel.offsetHeight;
  panel.classList.add('open');
  setTimeout(() => {
    if (_kdOpen && _kdOpen.panel === panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 300);
}

function _kdClose(instant) {
  if (!_kdOpen) return;
  const { card, panel, observer } = _kdOpen;
  _kdOpen = null;
  observer.disconnect();
  card.classList.remove('kpi-open');
  if (instant || !panel.isConnected) { panel.remove(); return; }
  panel.classList.remove('open');
  setTimeout(() => panel.remove(), 280);
}

let _kdRenderQueued = false;
function _kdScheduleRender() {
  if (_kdRenderQueued) return;
  _kdRenderQueued = true;
  setTimeout(() => { _kdRenderQueued = false; _kdRender(); }, 0); // batches a burst of card mutations
}

function _kdRender() {
  if (!_kdOpen) return;
  // The page rebuilt its grid (Stock view re-renders it whole) — re-open the
  // panel on the new card with the same key, without the opening animation.
  if (!_kdOpen.card.isConnected) {
    const key = _kdOpen.key;
    const card = [...document.querySelectorAll('.kpi-grid > .kpi')].find(c => _kdKeyOf(c) === key);
    _kdClose(true);
    if (card) _kdOpenCard(card, key, true);
    return;
  }
  let html;
  try {
    html = _KD[_kdOpen.key]();
  } catch (e) {
    console.error('[kpi-details]', _kdOpen.key, e);
    html = _kdEmpty('Détails indisponibles');
  }
  if (html === _kdOpen.html) return;
  _kdOpen.html = html;
  _kdOpen.panel.querySelector('.kd-body').innerHTML = html;
}

// Called by live-refresh.js when new data lands — covers details whose card
// value didn't itself change (e.g. a category mix shifting).
function _kdRefresh() { _kdScheduleRender(); }

// ═══ Render helpers (shared by kpi-details-defs.js) ═══

const _KD_COLORS = ['#1a7a3a', '#2f6690', '#b8860b', '#8b5e3c', '#6a4c93', '#3a6351', '#a4508b', '#c0392b', '#5d6d7e'];

function _kdEmpty(msg) { return `<div class="kd-empty">${_escHtml(msg || 'Aucune donnée')}</div>`; }

function _kdSection(title, body) {
  return `<div class="kd-sec">${title ? `<div class="kd-sec-title">${_escHtml(title)}</div>` : ''}${body}</div>`;
}

// pairs: [[label, value, cls?]] — small 2-column fact grid.
function _kdStats(pairs) {
  return `<div class="kd-stats">${pairs.filter(Boolean).map(([l, v, cls]) =>
    `<div><span>${_escHtml(l)}</span><b class="${cls || ''}">${v}</b></div>`).join('')}</div>`;
}

// rows: [{ label, value (number, bar length), display (html), sub?, img? }]
// Shows `limit` rows, then a "Voir tout" button for the rest.
function _kdBars(rows, limit = 8) {
  if (!rows.length) return _kdEmpty();
  const max = Math.max(...rows.map(r => r.value), 0) || 1;
  // `img: ''` (vs no img key) = "this list has photos, this row has none":
  // an initial tile keeps every label in the list aligned.
  const thumb = r => r.img
    ? `<img class="kd-thumb" src="${r.img}" alt="" loading="lazy" decoding="async">`
    : `<span class="kd-thumb kd-thumb-none">${_escHtml(String(r.label).trim().charAt(0).toUpperCase())}</span>`;
  const body = rows.map((r, i) => `
    <div class="kd-bar-row${i >= limit ? ' kd-extra' : ''}">
      ${'img' in r ? thumb(r) : ''}
      <div class="kd-bar-main">
        <div class="kd-bar-top"><span class="kd-bar-label">${_escHtml(r.label)}</span><span class="kd-bar-val">${r.display}</span></div>
        <div class="kd-bar-track"><span style="width:${Math.max(2, (r.value / max) * 100).toFixed(1)}%${r.color ? `;background:${r.color}` : ''}"></span></div>
        ${r.sub ? `<div class="kd-bar-sub">${r.sub}</div>` : ''}
      </div>
    </div>`).join('');
  const more = rows.length > limit
    ? `<button class="kd-more-btn" onclick="event.stopPropagation();this.previousElementSibling.classList.add('kd-all');this.remove()">Voir tout (${rows.length})</button>`
    : '';
  return `<div class="kd-bars">${body}</div>${more}`;
}

// Mini column chart. values: numbers; labels: short strings ('' to hide).
function _kdCols(values, labels, { highlight = -1, fmt = v => v } = {}) {
  if (!values.length || !values.some(v => v > 0)) return _kdEmpty();
  const max = Math.max(...values) || 1;
  return `<div class="kd-cols">${values.map((v, i) => `
    <div class="kd-col${i === highlight ? ' kd-col-hl' : ''}" title="${_escHtml(String(labels[i] || ''))} · ${_escHtml(String(fmt(v)))}">
      <span class="kd-col-bar" style="height:${v > 0 ? Math.max(4, (v / max) * 100) : 0}%"></span>
      <span class="kd-col-lbl">${_escHtml(String(labels[i] || ''))}</span>
    </div>`).join('')}</div>`;
}

// 100% stacked bar + legend. parts: [{ label, value }] (sorted desc).
function _kdStack(parts, maxParts = 6) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return _kdEmpty();
  let shown = parts.slice(0, maxParts);
  if (parts.length > maxParts) {
    shown = shown.concat([{ label: 'Autres', value: parts.slice(maxParts).reduce((s, p) => s + p.value, 0) }]);
  }
  const color = i => _KD_COLORS[i % _KD_COLORS.length];
  return `
    <div class="kd-stack">${shown.map((p, i) => `<span style="width:${(p.value / total) * 100}%;background:${color(i)}"></span>`).join('')}</div>
    <div class="kd-legend">${shown.map((p, i) => `
      <span><i style="background:${color(i)}"></i>${_escHtml(p.label)} <b>${((p.value / total) * 100).toFixed(0)}%</b></span>`).join('')}
    </div>`;
}

// "+12%" / "−8%" chip. invert: a rise is bad (costs).
function _kdDelta(cur, prev, invert) {
  if (!prev) return '<span class="kd-delta">—</span>';
  const d = (cur - prev) / prev * 100;
  const good = invert ? d <= 0 : d >= 0;
  return `<span class="kd-delta ${good ? 'up' : 'down'}">${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(0)}%</span>`;
}

function _kdPct(part, total) { return total ? `${((part / total) * 100).toFixed(0)}%` : '—'; }
function _kdMoney(v) { return `${fmtMoney(v)} Dhs`; }
