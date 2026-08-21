// ═══════════════════════════════════════
// RECETTE & CHARGES
// ═══════════════════════════════════════
let recMonthOffset = 0;

// recMonthOffset has no lower bound — a business can page back indefinitely
// — so this is the one navigation path in the whole app that can ask for
// order data older than data-loader.js's default HISTORY_WINDOW_MONTHS.
// ensureOrdersLoadedThrough() no-ops when the target month is already
// covered (the common case — most navigation stays recent), and otherwise
// extends allOrders backward before rendering, so renderRecette() never
// runs against a month it doesn't actually have data for.
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
  renderRecetteSummary();
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

function getDayConsoCost(y, m, d) {
  const dayStart = new Date(y, m, d);
  const dayEnd   = new Date(y, m, d + 1);
  const orders   = allOrders.filter(o => o.time >= dayStart && o.time < dayEnd);
  if (!orders.length) return 0;
  const conso = calcConsumption(orders);
  const keys  = ['coffeeG', 'milkCl', 'theG', 'water'];
  return keys.reduce((sum, key) => {
    const qty  = conso[key] || 0;
    const cost = weightedAvgPrice(key);
    return sum + (cost != null ? qty * cost : 0);
  }, 0);
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

let _recSummaryState = { totalRec: 0, totalChg: 0, byCharge: [] };

function renderRecetteSummary() {
  const { totalRec, totalChg, byCharge } = _recSummaryState;
  const net = totalRec - totalChg;
  const netColor = net >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('rec-summary-card').innerHTML = `
    <div style="font-family:'Cinzel',serif;font-size:9px;letter-spacing:1.5px;color:var(--green-dark);text-transform:uppercase;margin-bottom:8px;">Récapitulatif du mois</div>
    <div class="rec-bar-cols">
      <div class="rec-bar-item">
        <div class="rec-bar-label">Recette</div>
        <div class="rec-bar-val" style="color:var(--green);">${Math.round(totalRec)} <span style="font-size:10px;">Dhs</span></div>
      </div>
      <div class="rec-bar-sep">−</div>
      <div class="rec-bar-item">
        <div class="rec-bar-label">Charges</div>
        <div class="rec-bar-val" style="color:var(--red);">${Math.round(totalChg)} <span style="font-size:10px;">Dhs</span></div>
      </div>
      <div class="rec-bar-sep">=</div>
      <div class="rec-bar-item">
        <div class="rec-bar-label">Bénéfice</div>
        <div class="rec-bar-val" style="color:${netColor};font-size:20px;">${Math.round(net)} <span style="font-size:10px;">Dhs</span></div>
      </div>
    </div>`;
}

function renderRecette() {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth() + recMonthOffset;
  const monthDate   = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today       = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const rawLabel = monthDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  document.getElementById('rec-month-label').textContent = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
  document.getElementById('rec-prev').disabled = false;
  document.getElementById('rec-next').disabled = recMonthOffset >= 0;
  document.getElementById('rec-sheet-title').textContent =
    'Recette & Charges — ' + rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

  // Build table
  let html = '<thead><tr>';
  html += '<th class="sal-sheet-th-day">Jour</th>';
  html += '<th class="sal-sheet-th" style="color:#1b5e20;">Recette</th>';
  html += '<th class="sal-sheet-th" style="color:var(--red);">Salaire</th>';
  _charges.forEach(c => {
    html += `<th class="sal-sheet-th" style="color:var(--red);">${c.name}<br>
      <span onclick="renameCharge('${c.id}')" style="font-size:10px;cursor:pointer;color:var(--text-dim);">✎</span>
      <span onclick="removeCharge('${c.id}')" style="font-size:10px;cursor:pointer;color:var(--red);margin-left:4px;">✕</span></th>`;
  });
  html += '<th class="sal-sheet-th">Total charges</th>';
  html += '<th class="sal-sheet-th" style="color:var(--green-dark);">Bénéfice</th>';
  html += '</tr></thead><tbody>';

  let totalRec = 0, totalChg = 0;
  const byCharge = _charges.map(c => ({ id: c.id, name: c.name, total: 0 }));

  for (let d = 1; d <= daysInMonth; d++) {
    const date      = new Date(y, m, d);
    const dayKey    = getSalDayKeyRec(y, m, d);
    const isToday   = date.getTime() === today.getTime();
    const isFuture  = date > today;
    const dow       = date.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const dayLabel  = date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' });

    const trCls = ['sal-sheet-tr', isToday ? 'sal-tr-today' : '', isWeekend ? 'sal-tr-weekend' : ''].filter(Boolean).join(' ');

    const rec = isFuture ? 0 : getDayRevenue(y, m, d);
    totalRec += rec;
    const daySal = isFuture ? 0 : getDaySalaire(y, m, d);
    let dayTotalChg = daySal;
    _charges.forEach((c, ci) => {
      const amt = (_chargeDays[c.id] || {})[dayKey] || 0;
      dayTotalChg += amt;
      byCharge[ci].total += amt;
    });
    totalChg += dayTotalChg;
    const ben = rec - dayTotalChg;
    const benColor = ben >= 0 ? '#1b5e20' : 'var(--red)';

    html += `<tr class="${trCls}">`;
    html += `<td class="sal-sheet-td-day">${dayLabel}</td>`;
    // Recette cell
    html += `<td class="sal-sheet-cell" style="background:${isFuture?'#fff':'#e8f5e9'};color:#1b5e20;font-weight:700;">${isFuture ? '—' : (rec > 0 ? Math.round(rec) : '0')}</td>`;
    // Salaire cell
    html += `<td class="sal-sheet-cell" style="background:#fff3e0;color:#b45309;font-weight:700;">${daySal > 0 ? Math.round(daySal) : '—'}</td>`;
    // Charge input cells
    _charges.forEach(c => {
      const amt = (_chargeDays[c.id] || {})[dayKey];
      html += `<td class="rec-charge-cell">
        <input class="rec-charge-input" type="number" min="0" step="1"
          value="${amt != null ? amt : ''}" placeholder="0"
          onchange="setChargeAmount('${c.id}','${dayKey}',this.value)"
          ${isFuture ? 'style="opacity:0.4;"' : ''}>
      </td>`;
    });
    // Totals
    html += `<td class="sal-sheet-cell" style="background:#fff3e0;color:#b45309;font-weight:700;">${Math.round(dayTotalChg)}</td>`;
    html += `<td class="sal-sheet-cell" style="background:${ben<0?'#ffcdd2':'#f1f8e9'};color:${benColor};font-weight:700;">${isFuture ? '—' : Math.round(ben)}</td>`;
    html += '</tr>';
  }
  html += '</tbody>';
  document.getElementById('rec-sheet').innerHTML = html;

  // Summary
  _recSummaryState = { totalRec, totalChg, byCharge };
  renderRecetteSummary();
}
