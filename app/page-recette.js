// ═══════════════════════════════════════
// RECETTE & CHARGES
// ═══════════════════════════════════════
let recMonthOffset = 0;

// recMonthOffset has no lower bound — a business can page back indefinitely
// — so this is the one navigation path in the whole app that can ask for
// order data older than data-loader.js's eager default (the current month —
// see _historyWindowStart()). ensureOrdersLoadedThrough() no-ops when the
// target month is already covered (the common case — most navigation stays
// recent), and otherwise extends allOrders backward before rendering, so
// renderRecette() never runs against a month it doesn't actually have data
// for.
async function changeRecMonth(dir) {
  recMonthOffset += dir;
  const now = new Date();
  const targetMonthStart = new Date(now.getFullYear(), now.getMonth() + recMonthOffset, 1);
  try {
    await ensureOrdersLoadedThrough(targetMonthStart);
  } catch (e) {
    // A failed fetch must not leave recMonthOffset (already incremented
    // above) out of sync with what's on screen — render with whatever's
    // currently loaded (that month may show as empty/incomplete) rather
    // than silently freezing the page on a network hiccup. The gap stays
    // unfetched, so the next navigation into it will simply retry.
    console.error('[recette] failed to load older history', e);
  }
  renderRecette();
}

function toggleRecForm() {
  const f = document.getElementById('rec-add-form');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
  if (f.style.display === 'block') document.getElementById('rec-new-name').focus();
}

async function addCharge() {
  const name = document.getElementById('rec-new-name').value.trim();
  if (!name) { document.getElementById('rec-new-name').focus(); return; }
  const id = Date.now().toString();
  await apiPost('/api/rec/charges', { id, name });
  _charges.push({ id, name });
  document.getElementById('rec-new-name').value = '';
  toggleRecForm();
  renderRecette();
}

let _recModalCallback = null;

function openRecModal(title, showInput, inputVal, confirmLabel, callback) {
  document.getElementById('rec-modal-title').textContent = title;
  const inputWrap = document.getElementById('rec-modal-input-wrap');
  const input = document.getElementById('rec-modal-input');
  if (showInput) {
    inputWrap.style.display = 'block';
    input.value = inputVal != null ? inputVal : '';
    setTimeout(() => input.focus(), 100);
  } else {
    inputWrap.style.display = 'none';
  }
  document.getElementById('rec-modal-confirm-btn').textContent = confirmLabel || 'Confirmer';
  _recModalCallback = callback;
  const modal = document.getElementById('rec-edit-modal');
  modal.style.display = 'flex';
}

function closeRecModal() {
  document.getElementById('rec-edit-modal').style.display = 'none';
  _recModalCallback = null;
}

function confirmRecModal() {
  const val = document.getElementById('rec-modal-input').value;
  const cb = _recModalCallback;
  closeRecModal();
  if (cb) cb(val);
}

async function renameCharge(id) {
  const charge = _charges.find(c => c.id === id);
  if (!charge) return;
  openRecModal('Renommer la charge', true, charge.name, 'Confirmer', async (val) => {
    const trimmed = (val || '').trim();
    if (!trimmed || trimmed === charge.name) return;
    await apiPut(`/api/rec/charges/${id}`, { name: trimmed });
    charge.name = trimmed;
    renderRecette();
  });
}

async function removeCharge(id) {
  openRecModal('Supprimer cette charge ?', false, null, 'Supprimer', async () => {
    await apiDelete(`/api/rec/charges/${id}`);
    _charges = _charges.filter(c => c.id !== id);
    delete _chargeDays[id];
    renderRecette();
  });
}

function editFixedCharge() {
  openRecModal('Charge fixe (Dhs/jour)', true, _fixedCharge !== null ? Math.round(_fixedCharge) : '', 'Confirmer', (val) => {
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) return;
    _fixedCharge = n;
    localStorage.setItem('fixedCharge', n);
    renderRecette();
  });
}

function removeFixedCharge() {
  openRecModal('Supprimer la charge fixe ?', false, null, 'Supprimer', () => {
    _fixedCharge = null;
    localStorage.removeItem('fixedCharge');
    renderRecette();
  });
}

function restoreFixedCharge() {
  openRecModal('Charge fixe (Dhs/jour)', true, '400', 'Confirmer', (val) => {
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) return;
    _fixedCharge = n;
    localStorage.setItem('fixedCharge', n);
    renderRecette();
  });
}

// "Autres charges" are monthly, not per-day: one amount per charge per
// month, stored on the month's LAST day key (the backend still keys by day).
// Months entered back when charges were per-day can have amounts spread over
// several days — the monthly row shows their sum, and the first edit folds
// them into the single last-day entry.
function _recMonthChargeTotal(chargeId, prefix) {
  const days = _chargeDays[chargeId] || {};
  return Object.keys(days).reduce((s, k) => k.startsWith(prefix) ? s + (days[k] || 0) : s, 0);
}

async function setMonthChargeAmount(chargeId, lastDayKey, val) {
  const prefix = lastDayKey.slice(0, 8); // 'YYYY-MM-'
  const days = _chargeDays[chargeId] || {};
  for (const k of Object.keys(days)) {
    if (k.startsWith(prefix) && k !== lastDayKey) {
      await apiDelete(`/api/rec/charge-days?charge_id=${chargeId}&day_key=${k}`);
      delete days[k];
    }
  }
  const amount = parseFloat(val);
  if (isNaN(amount) || val.trim() === '') {
    await apiDelete(`/api/rec/charge-days?charge_id=${chargeId}&day_key=${lastDayKey}`);
    if (_chargeDays[chargeId]) delete _chargeDays[chargeId][lastDayKey];
  } else {
    await apiPut('/api/rec/charge-days', { charge_id: chargeId, day_key: lastDayKey, amount });
    if (!_chargeDays[chargeId]) _chargeDays[chargeId] = {};
    _chargeDays[chargeId][lastDayKey] = amount;
  }
  // Re-render so the month's Bénéfice and totals follow the edit, then give
  // focus back to whichever charge cell the user tabbed into.
  const active = document.activeElement;
  const refocus = active && active.classList && active.classList.contains('rec-charge-input')
    ? { c: active.dataset.c, d: active.dataset.d } : null;
  renderRecette();
  if (refocus) {
    const el = document.querySelector(`.rec-charge-input[data-c="${refocus.c}"][data-d="${refocus.d}"]`);
    if (el) el.focus();
  }
}

function getDaySalaire(y, m, d) {
  const key = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  let total = 0;
  _salStaff.forEach(s => {
    const raw = (_salDays[s.id] || {})[key] || null;
    const { base, amount } = parseSalStatus(raw);
    if (base === 'paid' || base === 'advance') {
      total += amount != null ? amount : (s.rate || 0);
    }
  });
  return total;
}

function getDayRevenue(y, m, d) {
  const dayStart = new Date(y, m, d);
  const dayEnd   = new Date(y, m, d + 1);
  return allOrders
    .filter(o => o.time >= dayStart && o.time < dayEnd)
    .reduce((sum, o) => sum + (o.total || 0), 0);
}

function getSalDayKeyRec(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// Marchandise bought per day (Dhs) for one month, keyed 'YYYY-MM-DD' —
// costed with page-marchandise.js's _pmcAchatCost() (catalog price unless the
// purchase carries its own price of the day), so the Recette column always
// equals the Marchandise tab's day total.
function getMonthMarchandise(y, m) {
  const prefix = `${y}-${String(m+1).padStart(2,'0')}-`;
  const artMap = Object.fromEntries(_marcArticles.map(a => [a.id, a]));
  const byDay = {};
  _marcAchats.forEach(a => {
    if (!a.date || !a.date.startsWith(prefix)) return;
    const art = artMap[a.article_id];
    if (!art) return;
    byDay[a.date] = (byDay[a.date] || 0) + _pmcAchatCost(art, a);
  });
  return byDay;
}

let _recSummaryState = { totalRec: 0, totalSal: 0, totalMarc: 0, totalOther: 0, byCharge: [], activeDays: 0 };

function _recFmt(n) {
  return Math.round(n).toLocaleString('fr-FR');
}

function _recSigned(n, sign) {
  return (n ? sign + ' ' : '') + _recFmt(n);
}

function _recEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderRecetteSummary() {
  const { totalRec, totalSal, totalMarc, totalOther, activeDays } = _recSummaryState;
  const totalChg = totalSal + totalMarc + totalOther;
  const net = totalRec - totalChg;
  const margin = totalRec > 0 ? Math.round(net / totalRec * 100) : null;
  const tile = (label, val, cls, sub) => `
    <div class="rec-tile${cls ? ' ' + cls : ''}">
      <div class="rec-tile-label">${label}</div>
      <div class="rec-tile-val">${_recFmt(val)}<small> Dhs</small></div>
      ${sub ? `<div class="rec-tile-sub">${sub}</div>` : ''}
    </div>`;
  const pct = v => totalRec > 0 ? `${Math.round(v / totalRec * 100)}% de la recette` : '';
  document.getElementById('rec-summary-card').innerHTML = `
    <div class="rec-summary-title">Récapitulatif du mois</div>
    <div class="rec-tiles">
      ${tile('Recette', totalRec, 'rec-tile--rec', activeDays ? `${activeDays} jours · moy. ${_recFmt(totalRec / activeDays)}/j` : '')}
      ${tile('Salaires', totalSal, '', pct(totalSal))}
      ${tile('Marchandise', totalMarc, '', pct(totalMarc))}
      ${tile('Autres charges', totalOther, '', pct(totalOther))}
    </div>
    <div class="rec-net ${net >= 0 ? 'is-pos' : 'is-neg'}">
      <span>Bénéfice</span>
      <span class="rec-net-val">${_recFmt(net)} Dhs${margin !== null ? `<small> · marge ${margin}%</small>` : ''}</span>
    </div>`;
}

function renderRecette() {
  const now = new Date();
  const monthDate = new Date(now.getFullYear(), now.getMonth() + recMonthOffset, 1);
  const my = monthDate.getFullYear(), mm = monthDate.getMonth();
  const daysInMonth = new Date(my, mm + 1, 0).getDate();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const rawLabel = monthDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
  document.getElementById('rec-month-label').textContent = label;
  document.getElementById('rec-prev').disabled = false;
  document.getElementById('rec-next').disabled = recMonthOffset >= 0;
  document.getElementById('rec-sheet-title').textContent = 'Recette & Charges — ' + label;

  const marcByDay = getMonthMarchandise(my, mm);

  // Columns: Jour | Recette | Salaires | Marchandise | <charges…> | Bénéfice.
  // (The old "Total charges" column was removed — Bénéfice already nets
  // every cost, and the month totals sit in the footer row + summary card.)
  let html = '<thead><tr>';
  html += '<th class="rec-th rec-th-day">Jour</th>';
  html += '<th class="rec-th rec-th-rec">Recette</th>';
  html += '<th class="rec-th">Salaires</th>';
  html += '<th class="rec-th">Marchandise</th>';
  _charges.forEach(c => {
    html += `<th class="rec-th rec-th-charge">
      <div class="rec-th-name">${_recEsc(c.name)}</div>
      <div class="rec-th-actions">
        <button onclick="renameCharge('${c.id}')" title="Renommer">✎</button>
        <button onclick="removeCharge('${c.id}')" title="Supprimer">✕</button>
      </div></th>`;
  });
  html += '<th class="rec-th rec-th-ben">Bénéfice</th>';
  html += '</tr></thead><tbody>';

  let totalRec = 0, totalSal = 0, totalMarc = 0, totalBen = 0, activeDays = 0;
  const exportRows = [];
  const monthPrefix = `${my}-${String(mm+1).padStart(2,'0')}-`;
  const lastDayKey = getSalDayKeyRec(my, mm, daysInMonth);
  const byCharge = _charges.map(c => ({ id: c.id, name: c.name, total: _recMonthChargeTotal(c.id, monthPrefix) }));
  const totalOther = byCharge.reduce((s, c) => s + c.total, 0);
  const dash = '<span class="rec-zero">—</span>';
  const cell = (v, cls = '') => `<td class="rec-td${cls}">${v > 0 ? _recFmt(v) : dash}</td>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const date      = new Date(my, mm, d);
    const dayKey    = getSalDayKeyRec(my, mm, d);
    const isToday   = date.getTime() === today.getTime();
    const isFuture  = date > today;
    const dow       = date.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const dayLabel  = date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' });

    const trCls = ['rec-tr', isToday ? 'rec-tr-today' : '', isWeekend ? 'rec-tr-weekend' : '', isFuture ? 'rec-tr-future' : '']
      .filter(Boolean).join(' ');

    const rec  = isFuture ? 0 : getDayRevenue(my, mm, d);
    const sal  = isFuture ? 0 : getDaySalaire(my, mm, d);
    const marc = marcByDay[dayKey] || 0;
    const ben = rec - sal - marc;
    const hasAny = rec || sal || marc;
    totalRec += rec; totalSal += sal; totalMarc += marc;
    totalBen += ben;
    if (rec > 0) activeDays++;
    exportRows.push({ dayLabel, isToday, isWeekend, hasAny, rec, sal, marc, ben });

    html += `<tr class="${trCls}">`;
    html += `<td class="rec-td-day">${dayLabel}</td>`;
    html += isFuture ? `<td class="rec-td rec-td-rec">${dash}</td>` : cell(rec, ' rec-td-rec');
    html += cell(sal);
    html += cell(marc);
    html += _charges.map(() => '<td class="rec-td rec-td-chg-day"></td>').join('');
    html += !hasAny
      ? `<td class="rec-td rec-td-ben">${dash}</td>`
      : `<td class="rec-td rec-td-ben ${ben >= 0 ? 'is-pos' : 'is-neg'}">${_recFmt(ben)}</td>`;
    html += '</tr>';
  }

  // Monthly "autres charges" row, right under the last day.
  if (_charges.length) {
    html += `<tr class="rec-tr rec-tr-month">
      <td class="rec-td-day">Charges du mois</td>
      <td class="rec-td"></td><td class="rec-td"></td><td class="rec-td"></td>`;
    byCharge.forEach(c => {
      html += `<td class="rec-td rec-charge-cell"><input class="rec-charge-input" type="number" inputmode="decimal" min="0" step="1"
          data-c="${c.id}" data-d="${lastDayKey}" value="${c.total ? c.total : ''}" placeholder="—"
          onchange="setMonthChargeAmount('${c.id}','${lastDayKey}',this.value)"></td>`;
    });
    html += `<td class="rec-td rec-td-ben ${totalOther ? 'is-neg' : ''}">${totalOther ? '−' + _recFmt(totalOther) : dash}</td></tr>`;
  }
  html += '</tbody>';

  totalBen -= totalOther;

  // Month totals footer — signed, so the row reads as the calculation:
  // + Recette − Salaires − Marchandise − each charge = Bénéfice.
  html += `<tfoot><tr>
    <td class="rec-td-day">Total</td>
    <td class="rec-td rec-td-rec">${_recSigned(totalRec, '+')}</td>
    <td class="rec-td">${_recSigned(totalSal, '−')}</td>
    <td class="rec-td">${_recSigned(totalMarc, '−')}</td>
    ${byCharge.map(c => `<td class="rec-td">${_recSigned(c.total, '−')}</td>`).join('')}
    <td class="rec-td rec-td-ben ${totalBen >= 0 ? 'is-pos' : 'is-neg'}">= ${totalBen < 0 ? '−' : ''}${_recFmt(Math.abs(totalBen))}</td>
  </tr></tfoot>`;

  document.getElementById('rec-sheet').innerHTML = html;

  _recSummaryState = { totalRec, totalSal, totalMarc, totalOther, byCharge, activeDays };
  _recExportState = { label, rows: exportRows, totalBen };
  renderRecetteSummary();
}

// ── Share as JPEG ────────────────────────────────────────────────────────
// The on-screen sheet can't be screenshotted as-is: it scrolls inside a
// max-height box, has sticky cells, ✎/✕ buttons and <input> cells. So the
// image is built from the numbers renderRecette() just computed, as a plain
// static table in an off-screen node, then rasterized with html2canvas
// (lazy-loaded by receipt-export.js) and handed to shareCanvasImage().
// System fonts only — the page's Google Fonts are cross-origin and
// html2canvas can silently drop them (see receipt-export.js).
let _recExportState = null;

// Layout: a compact day table (Jour | Recette | Salaires | Marchandise |
// Bénéfice) on the left; on the right the month's "autres charges" and the
// signed calculation down to the Bénéfice — a panel of their own instead of
// charge columns that would sit empty on every day row.
function _recBuildExportHtml() {
  const { label, rows } = _recExportState;
  const { totalRec, totalSal, totalMarc, totalOther, byCharge, activeDays } = _recSummaryState;
  const { bizName, logoSrc } = _recBizIdentity();
  const net = totalRec - totalSal - totalMarc - totalOther;
  const margin = totalRec > 0 ? Math.round(net / totalRec * 100) : null;
  const dayBen = totalRec - totalSal - totalMarc;
  const green = '#2e6b45', red = '#b3261e', dim = '#9a978c', ink = '#1f4a30';
  const th = `padding:3px 8px;text-align:right;font-size:9.5px;letter-spacing:0.5px;text-transform:uppercase;color:${ink};border-bottom:2px solid ${ink};white-space:nowrap;background:#f4f2ea;`;
  const td = 'padding:0 8px;line-height:15px;height:15px;text-align:right;border-bottom:1px solid #ebe8de;white-space:nowrap;';
  const num = v => v > 0 ? _recFmt(v) : `<span style="color:${dim}">—</span>`;
  const signed = v => (v < 0 ? '−' : '') + _recFmt(Math.abs(v));

  const head = `<th style="${th}text-align:left;">Jour</th><th style="${th}color:${green};">Recette</th>`
    + `<th style="${th}">Salaires</th><th style="${th}">March.</th><th style="${th}">Bénéfice</th>`;

  const body = rows.map((r, i) => {
    const bg = r.isToday ? 'background:#fffbe8;' : (i % 2 ? 'background:#f7f6f1;' : '');
    const ben = r.hasAny
      ? `<td style="${td}${bg}font-weight:700;color:${r.ben >= 0 ? green : red};">${signed(r.ben)}</td>`
      : `<td style="${td}${bg}">${num(0)}</td>`;
    return `<tr>
      <td style="${td}${bg}text-align:left;font-weight:600;text-transform:capitalize;${r.isWeekend ? `color:${red};` : ''}">${r.dayLabel}</td>
      <td style="${td}${bg}font-weight:700;color:${green};">${num(r.rec)}</td>
      <td style="${td}${bg}">${num(r.sal)}</td>
      <td style="${td}${bg}">${num(r.marc)}</td>
      ${ben}
    </tr>`;
  }).join('');

  const ft = `padding:3px 8px;text-align:right;font-weight:700;border-top:2px solid ${ink};background:#f4f2ea;white-space:nowrap;`;
  const foot = `<tr>
    <td style="${ft}text-align:left;text-transform:uppercase;">Total</td>
    <td style="${ft}color:${green};">${_recFmt(totalRec)}</td>
    <td style="${ft}">${_recFmt(totalSal)}</td>
    <td style="${ft}">${_recFmt(totalMarc)}</td>
    <td style="${ft}color:${dayBen >= 0 ? green : red};">${signed(dayBen)}</td>
  </tr>`;

  const panelTitle = `font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${ink};font-weight:700;border-bottom:2px solid ${ink};padding:0 0 4px;margin-bottom:4px;`;
  const line = (name, val, extra = '') => `<div style="display:flex;justify-content:space-between;gap:14px;padding:1px 0;line-height:16px;border-bottom:1px solid #ebe8de;white-space:nowrap;${extra}">
      <span>${name}</span><span style="font-weight:700;">${val}</span></div>`;
  const pct = v => totalRec > 0 ? ` <small style="color:${dim};font-weight:400;">${Math.round(v / totalRec * 100)}%</small>` : '';

  const chargesPanel = byCharge.length ? `
      <div style="${panelTitle}">Charges du mois</div>
      ${byCharge.map(c => line(_recEsc(c.name), num(c.total))).join('')}
      ${line('Total', _recFmt(totalOther), 'border-bottom:none;font-weight:700;')}
      <div style="height:14px;"></div>` : '';

  return `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      ${logoSrc ? `<img src="${logoSrc}" style="max-height:36px;max-width:90px;object-fit:contain;">` : ''}
      <div>
        <div style="font-size:16px;font-weight:800;letter-spacing:2px;">${_recEsc(bizName.toUpperCase())}</div>
        <div style="font-size:12px;color:#555;">Recette & Charges — ${_recEsc(label)}</div>
      </div>
    </div>
    <div style="display:flex;align-items:flex-start;gap:18px;">
      <table style="border-collapse:collapse;font-size:11.5px;">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot>${foot}</tfoot>
      </table>
      <div style="min-width:200px;font-size:12.5px;">
        ${chargesPanel}
        <div style="${panelTitle}">Calcul du mois</div>
        ${line('Recette', `<span style="color:${green};">+ ${_recFmt(totalRec)}</span>`)}
        ${line('Salaires', `− ${_recFmt(totalSal)}${pct(totalSal)}`)}
        ${line('Marchandise', `− ${_recFmt(totalMarc)}${pct(totalMarc)}`)}
        ${line('Autres charges', `− ${_recFmt(totalOther)}${pct(totalOther)}`)}
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:14px;margin-top:8px;padding:8px 10px;border-radius:8px;color:#fff;background:${net >= 0 ? ink : '#8e2a20'};white-space:nowrap;">
          <span style="font-size:11px;letter-spacing:1px;text-transform:uppercase;">Bénéfice</span>
          <span style="font-size:17px;font-weight:700;">= ${signed(net)} Dhs</span>
        </div>
        ${margin !== null ? `<div style="font-size:11px;color:${dim};text-align:right;margin-top:3px;">marge ${margin}%</div>` : ''}
        ${activeDays ? `<div style="font-size:11px;color:${dim};margin-top:12px;">${activeDays} jours de recette · moy. ${_recFmt(totalRec / activeDays)} Dhs/j</div>` : ''}
      </div>
    </div>
    <div style="font-size:10px;color:${dim};text-align:right;margin-top:8px;">Généré le ${_recPrintedAt()} — ERPGEN Stats</div>`;
}

let _recSharing = false;
async function shareRecetteImage() {
  if (_recSharing || !_recExportState) return;
  _recSharing = true;
  const btn = document.getElementById('rec-share-btn');
  if (btn) btn.disabled = true;
  const node = document.createElement('div');
  node.style.cssText = 'position:fixed;left:-10000px;top:0;width:max-content;padding:14px 16px;background:#fff;color:#222;font-family:Arial,Helvetica,sans-serif;font-variant-numeric:tabular-nums;';
  try {
    await _ensureHtml2canvas();
    node.innerHTML = _recBuildExportHtml();
    document.body.appendChild(node);
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true, allowTaint: true });
    const slug = _recExportState.label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '-');
    shareCanvasImage(canvas, 'recette-charges-' + slug, 'image/jpeg');
  } catch (e) {
    console.error('[recette] share failed', e);
  } finally {
    node.remove();
    if (btn) btn.disabled = false;
    _recSharing = false;
  }
}
