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

async function setChargeAmount(chargeId, dayKey, val) {
  const amount = parseFloat(val);
  if (isNaN(amount) || val.trim() === '') {
    await apiDelete(`/api/rec/charge-days?charge_id=${chargeId}&day_key=${dayKey}`);
    if (_chargeDays[chargeId]) delete _chargeDays[chargeId][dayKey];
  } else {
    await apiPut('/api/rec/charge-days', { charge_id: chargeId, day_key: dayKey, amount });
    if (!_chargeDays[chargeId]) _chargeDays[chargeId] = {};
    _chargeDays[chargeId][dayKey] = amount;
  }
  // Re-render so the day's Bénéfice and the month totals follow the edit,
  // then give focus back to whichever charge cell the user tabbed into.
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

  let totalRec = 0, totalSal = 0, totalMarc = 0, totalOther = 0, totalBen = 0, activeDays = 0;
  const exportRows = [];
  const byCharge = _charges.map(c => ({ id: c.id, name: c.name, total: 0 }));
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
    let other = 0;
    _charges.forEach((c, ci) => {
      const amt = (_chargeDays[c.id] || {})[dayKey] || 0;
      other += amt;
      byCharge[ci].total += amt;
    });
    const ben = rec - sal - marc - other;
    const hasAny = rec || sal || marc || other;
    totalRec += rec; totalSal += sal; totalMarc += marc; totalOther += other;
    totalBen += ben;
    if (rec > 0) activeDays++;
    exportRows.push({
      dayLabel, isToday, isWeekend, hasAny, rec, sal, marc, ben,
      charges: _charges.map(c => (_chargeDays[c.id] || {})[dayKey] || 0),
    });

    html += `<tr class="${trCls}">`;
    html += `<td class="rec-td-day">${dayLabel}</td>`;
    html += isFuture ? `<td class="rec-td rec-td-rec">${dash}</td>` : cell(rec, ' rec-td-rec');
    html += cell(sal);
    html += cell(marc);
    _charges.forEach(c => {
      const amt = (_chargeDays[c.id] || {})[dayKey];
      html += `<td class="rec-td rec-charge-cell"><input class="rec-charge-input" type="number" inputmode="decimal" min="0" step="1"
          data-c="${c.id}" data-d="${dayKey}" value="${amt != null ? amt : ''}" placeholder="—"
          onchange="setChargeAmount('${c.id}','${dayKey}',this.value)"></td>`;
    });
    html += !hasAny
      ? `<td class="rec-td rec-td-ben">${dash}</td>`
      : `<td class="rec-td rec-td-ben ${ben >= 0 ? 'is-pos' : 'is-neg'}">${_recFmt(ben)}</td>`;
    html += '</tr>';
  }
  html += '</tbody>';

  // Month totals footer — same columns as the body.
  html += `<tfoot><tr>
    <td class="rec-td-day">Total</td>
    <td class="rec-td rec-td-rec">${_recFmt(totalRec)}</td>
    <td class="rec-td">${_recFmt(totalSal)}</td>
    <td class="rec-td">${_recFmt(totalMarc)}</td>
    ${byCharge.map(c => `<td class="rec-td">${_recFmt(c.total)}</td>`).join('')}
    <td class="rec-td rec-td-ben ${totalBen >= 0 ? 'is-pos' : 'is-neg'}">${_recFmt(totalBen)}</td>
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

function _recBuildExportHtml() {
  const { label, rows, totalBen } = _recExportState;
  const { totalRec, totalSal, totalMarc, totalOther, byCharge, activeDays } = _recSummaryState;
  const { bizName, logoSrc } = _recBizIdentity();
  const totalChg = totalSal + totalMarc + totalOther;
  const net = totalRec - totalChg;
  const margin = totalRec > 0 ? Math.round(net / totalRec * 100) : null;
  const green = '#2e6b45', red = '#b3261e', dim = '#9a978c';
  const th = 'padding:7px 9px;text-align:right;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:#1f4a30;border-bottom:2px solid #1f4a30;white-space:nowrap;background:#f4f2ea;';
  const td = 'padding:5px 9px;text-align:right;border-bottom:1px solid #ebe8de;white-space:nowrap;';
  const num = v => v > 0 ? _recFmt(v) : `<span style="color:${dim}">—</span>`;

  let head = `<th style="${th}text-align:left;">Jour</th><th style="${th}color:${green};">Recette</th>`
    + `<th style="${th}">Salaires</th><th style="${th}">Marchandise</th>`
    + _charges.map(c => `<th style="${th}">${_recEsc(c.name)}</th>`).join('')
    + `<th style="${th}">Bénéfice</th>`;

  const body = rows.map(r => {
    const bg = r.isToday ? 'background:#fffbe8;' : '';
    const ben = r.hasAny
      ? `<td style="${td}${bg}font-weight:700;color:${r.ben >= 0 ? green : red};">${_recFmt(r.ben)}</td>`
      : `<td style="${td}${bg}">${num(0)}</td>`;
    return `<tr>
      <td style="${td}${bg}text-align:left;font-weight:600;text-transform:capitalize;${r.isWeekend ? `color:${red};` : ''}">${r.dayLabel}</td>
      <td style="${td}${bg}font-weight:700;color:${green};">${num(r.rec)}</td>
      <td style="${td}${bg}">${num(r.sal)}</td>
      <td style="${td}${bg}">${num(r.marc)}</td>
      ${r.charges.map(a => `<td style="${td}${bg}">${num(a)}</td>`).join('')}
      ${ben}
    </tr>`;
  }).join('');

  const ft = 'padding:8px 9px;text-align:right;font-weight:700;border-top:2px solid #1f4a30;background:#f4f2ea;white-space:nowrap;';
  const foot = `<tr>
    <td style="${ft}text-align:left;text-transform:uppercase;">Total</td>
    <td style="${ft}color:${green};">${_recFmt(totalRec)}</td>
    <td style="${ft}">${_recFmt(totalSal)}</td>
    <td style="${ft}">${_recFmt(totalMarc)}</td>
    ${byCharge.map(c => `<td style="${ft}">${_recFmt(c.total)}</td>`).join('')}
    <td style="${ft}color:${totalBen >= 0 ? green : red};">${_recFmt(totalBen)}</td>
  </tr>`;

  const tile = (t, v, sub) => `<div style="flex:1;min-width:120px;border:1px solid #e3e0d5;border-radius:8px;padding:8px 10px;">
      <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${dim};">${t}</div>
      <div style="font-size:18px;font-weight:700;margin-top:2px;">${_recFmt(v)} <small style="font-size:11px;font-weight:400;">Dhs</small></div>
      ${sub ? `<div style="font-size:10px;color:${dim};margin-top:2px;">${sub}</div>` : ''}
    </div>`;
  const pct = v => totalRec > 0 ? `${Math.round(v / totalRec * 100)}% de la recette` : '';

  return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
      ${logoSrc ? `<img src="${logoSrc}" style="max-height:42px;max-width:110px;object-fit:contain;">` : ''}
      <div>
        <div style="font-size:18px;font-weight:800;letter-spacing:2px;">${_recEsc(bizName.toUpperCase())}</div>
        <div style="font-size:13px;color:#555;">Recette & Charges — ${_recEsc(label)}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;">
      ${tile('Recette', totalRec, activeDays ? `${activeDays} jours · moy. ${_recFmt(totalRec / activeDays)}/j` : '')}
      ${tile('Salaires', totalSal, pct(totalSal))}
      ${tile('Marchandise', totalMarc, pct(totalMarc))}
      ${tile('Autres charges', totalOther, pct(totalOther))}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:9px 12px;border-radius:8px;margin-bottom:14px;color:#fff;background:${net >= 0 ? '#1f4a30' : '#8e2a20'};">
      <span style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">Bénéfice</span>
      <span style="font-size:20px;font-weight:700;">${_recFmt(net)} Dhs${margin !== null ? `<small style="font-size:11px;font-weight:400;"> · marge ${margin}%</small>` : ''}</span>
    </div>
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
      <tfoot>${foot}</tfoot>
    </table>
    <div style="font-size:10px;color:${dim};text-align:right;margin-top:10px;">Généré le ${_recPrintedAt()} — ERPGEN Stats</div>`;
}

let _recSharing = false;
async function shareRecetteImage() {
  if (_recSharing || !_recExportState) return;
  _recSharing = true;
  const btn = document.getElementById('rec-share-btn');
  if (btn) btn.disabled = true;
  const node = document.createElement('div');
  node.style.cssText = 'position:fixed;left:-10000px;top:0;width:max-content;min-width:560px;padding:20px;background:#fff;color:#222;font-family:Arial,Helvetica,sans-serif;font-variant-numeric:tabular-nums;';
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
