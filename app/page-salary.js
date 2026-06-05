// ═══════════════════════════════════════
// SALAIRE
// ═══════════════════════════════════════
let salMonthOffset = 0;
let salPanelOpen = false;

function toggleSalPanel() {
  salPanelOpen = !salPanelOpen;
  document.getElementById('sal-bp').classList.toggle('sal-bp-open', salPanelOpen);
}

// status field is "paid", "advance", "absent", or "paid:150" / "advance:80" (custom amount encoded)
function parseSalStatus(raw) {
  if (!raw) return { base: null, amount: null };
  const idx = raw.indexOf(':');
  if (idx === -1) return { base: raw, amount: null };
  return { base: raw.slice(0, idx), amount: parseFloat(raw.slice(idx + 1)) };
}

const SAL_CYCLE_BASES = [null, 'paid', 'advance', 'absent'];

function getSalDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function changeSalMonth(dir) {
  salMonthOffset += dir;
  renderSalaire();
}

// ── Staff storage ──
function getSalStaff() { return _salStaff; }
function getStaffDays(id) { return _salDays[id] || {}; }

// ── UI helpers ──
function toggleSalForm() {
  const f = document.getElementById('sal-add-form');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
  if (f.style.display === 'block') document.getElementById('sal-new-name').focus();
}

async function addSalStaff() {
  const name = document.getElementById('sal-new-name').value.trim();
  const rate = parseFloat(document.getElementById('sal-new-rate').value) || 0;
  if (!name) { document.getElementById('sal-new-name').focus(); return; }
  const id = Date.now().toString();
  await apiPost('/api/sal/staff', { id, name, rate });
  _salStaff.push({ id, name, rate });
  document.getElementById('sal-new-name').value = '';
  document.getElementById('sal-new-rate').value = '';
  toggleSalForm();
  renderSalaire();
}

async function removeSalStaff(id) {
  if (!confirm('Supprimer cet employé ?')) return;
  await apiDelete(`/api/sal/staff/${id}`);
  _salStaff = _salStaff.filter(s => s.id !== id);
  delete _salDays[id];
  renderSalaire();
}

async function updateStaffRate(id, val) {
  const rate = parseFloat(val) || 0;
  await apiPut(`/api/sal/staff/${id}`, { rate });
  const s = _salStaff.find(s => s.id === id);
  if (s) { s.rate = rate; renderSalaire(); }
}

// ── Day amount override modal ──
let _dayModal = { staffId: null, key: null, defaultRate: 0 };
let _modalStatus = null; // current status selected in modal

function setModalStatus(status) {
  _modalStatus = status;
  // Highlight active button
  ['blank','paid','advance','absent'].forEach(s => {
    const btn = document.getElementById(`sms-${s}`);
    if (!btn) return;
    const active = (s === 'blank' && status === null) || s === status;
    btn.style.background = active ? (
      s === 'paid' ? '#e8f5e9' : s === 'advance' ? '#fff3e0' : s === 'absent' ? '#ffcdd2' : '#f0f0f0'
    ) : '';
    btn.style.borderColor = active ? (
      s === 'paid' ? '#1b5e20' : s === 'advance' ? '#b45309' : s === 'absent' ? 'var(--red)' : '#999'
    ) : 'var(--border)';
    btn.style.fontWeight = active ? '700' : '400';
  });
  // Show amount input only for paid/advance
  document.getElementById('sal-modal-amount-wrap').style.display =
    (status === 'paid' || status === 'advance') ? 'block' : 'none';
}

async function openDayModal(staffId, key, dateLabel, defaultRate) {
  const { base, amount } = parseSalStatus((_salDays[staffId] || {})[key]);
  _dayModal = { staffId, key, defaultRate };
  document.getElementById('sal-day-input').value = amount != null ? amount : defaultRate;
  document.getElementById('sal-modal-date').textContent = dateLabel;
  document.getElementById('sal-modal-hint').textContent = `Taux standard: ${defaultRate} Dhs`;
  setModalStatus(base || null);
  document.getElementById('sal-hours-modal').style.display = 'flex';
}

function closeHoursModal() {
  document.getElementById('sal-hours-modal').style.display = 'none';
  _dayModal = { staffId: null, key: null, defaultRate: 0 };
}

function adjustDayBy(delta) {
  const inp = document.getElementById('sal-day-input');
  inp.value = Math.max(0, (parseFloat(inp.value) || 0) + delta);
}

async function confirmHours() {
  const { staffId, key, defaultRate } = _dayModal;
  if (!staffId || !key) return;
  if (_modalStatus === null) {
    await apiDelete(`/api/sal/days?staff_id=${staffId}&day_key=${key}`);
    if (_salDays[staffId]) delete _salDays[staffId][key];
  } else if (_modalStatus === 'absent') {
    await apiPut('/api/sal/days', { staff_id: staffId, day_key: key, status: 'absent' });
    if (!_salDays[staffId]) _salDays[staffId] = {};
    _salDays[staffId][key] = 'absent';
  } else {
    const amount = parseFloat(document.getElementById('sal-day-input').value);
    const encoded = isNaN(amount) || amount === defaultRate ? _modalStatus : `${_modalStatus}:${amount}`;
    await apiPut('/api/sal/days', { staff_id: staffId, day_key: key, status: encoded });
    if (!_salDays[staffId]) _salDays[staffId] = {};
    _salDays[staffId][key] = encoded;
  }
  closeHoursModal();
  renderSalaire();
}

function resetHours() {
  document.getElementById('sal-day-input').value = _dayModal.defaultRate;
}

// Long-press detection for table cells
let _lpTimer = null;
let _lpFired = false;
let _lpMoved = false;
let _lpStartX = 0, _lpStartY = 0;
function startLongPress(e, staffId, key, dateLabel, defaultRate) {
  _lpFired = false;
  _lpMoved = false;
  _lpStartX = e.touches[0].clientX;
  _lpStartY = e.touches[0].clientY;
  _lpTimer = setTimeout(() => {
    _lpFired = true;
    openDayModal(staffId, key, dateLabel, defaultRate);
  }, 600);
}
function moveLongPress(e) {
  if (_lpMoved) return;
  const dx = e.touches[0].clientX - _lpStartX;
  const dy = e.touches[0].clientY - _lpStartY;
  if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
    _lpMoved = true;
    cancelLongPress();
  }
}
function endLongPress(e, staffId, key) {
  cancelLongPress();
  if (!_lpFired) e.preventDefault(); // always suppress synthetic click
}
function cancelLongPress() { clearTimeout(_lpTimer); _lpTimer = null; }

async function cycleSalDay(staffId, key) {
  const raw  = (_salDays[staffId] || {})[key] || null;
  const { base } = parseSalStatus(raw);
  const nextBase = SAL_CYCLE_BASES[(SAL_CYCLE_BASES.indexOf(base) + 1) % SAL_CYCLE_BASES.length];
  if (nextBase === null) {
    await apiDelete(`/api/sal/days?staff_id=${staffId}&day_key=${key}`);
    if (_salDays[staffId]) delete _salDays[staffId][key];
  } else {
    await apiPut('/api/sal/days', { staff_id: staffId, day_key: key, status: nextBase });
    if (!_salDays[staffId]) _salDays[staffId] = {};
    _salDays[staffId][key] = nextBase;
  }
  renderSalaire();
}

// ── Stats calculator ──
function calcStaffStats(staffId, y, m, today, rate) {
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const data = getStaffDays(staffId);
  let stats = { paid: 0, advance: 0, absent: 0, pending: 0, paidAmount: 0, advanceAmount: 0 };
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const key = getSalDayKey(date);
    const { base, amount } = parseSalStatus(data[key] || null);
    const dayAmt = amount != null ? amount : rate;
    if (base === 'paid')         { stats.paid++;    stats.paidAmount    += dayAmt; }
    else if (base === 'advance') { stats.advance++; stats.advanceAmount += dayAmt; }
    else if (base === 'absent')  stats.absent++;
    else if (date <= today)      stats.pending++;
  }
  return stats;
}

// ── Shared sheet table ──
function buildSharedTable(staff, y, m, today) {
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const staffData   = staff.map(s => getStaffDays(s.id));

  let html = '<thead><tr>';
  html += '<th class="sal-sheet-th-day">Jour</th>';
  staff.forEach(s => { html += `<th class="sal-sheet-th">${s.name}</th>`; });
  html += '</tr></thead><tbody>';

  for (let d = 1; d <= daysInMonth; d++) {
    const date    = new Date(y, m, d);
    const key     = getSalDayKey(date);
    const isToday = date.getTime() === today.getTime();
    const isFuture = date > today;
    const dow     = date.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6;
    const dayLabel = date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' });
    const trCls = [
      'sal-sheet-tr',
      isToday   ? 'sal-tr-today'   : '',
      isWeekend ? 'sal-tr-weekend' : ''
    ].filter(Boolean).join(' ');

    html += `<tr class="${trCls}"><td class="sal-sheet-td-day">${dayLabel}</td>`;

    staff.forEach((s, i) => {
      const raw = staffData[i][key] || null;
      const { base: status, amount: customAmt } = parseSalStatus(raw);
      const rate = s.rate || 0;
      const dayPay = customAmt != null ? customAmt : rate;
      const hasCustom = (status === 'paid' || status === 'advance') && customAmt != null;
      const delta = customAmt != null ? customAmt - rate : 0;
      const badge = hasCustom
        ? `<div class="sal-hours-badge ${delta >= 0 ? 'sal-hb-plus' : 'sal-hb-minus'}">${delta >= 0 ? '+' : ''}${Math.round(delta)}</div>`
        : '';
      const rateDisp = rate > 0 ? Math.round(dayPay) : '—';
      let cls, sym;
      if (status === 'paid')         { cls = 'sal-sc-paid';   sym = `${rateDisp}${badge}`; }
      else if (status === 'advance') { cls = 'sal-sc-adv';    sym = `${rateDisp}${badge}`; }
      else if (status === 'absent')  { cls = 'sal-sc-abs';    sym = 'ABS'; }
      else if (isFuture)             { cls = 'sal-sc-future'; sym = '—'; }
      else if (isToday)              { cls = 'sal-sc-today';  sym = '—'; }
      else                           { cls = 'sal-sc-future'; sym = '—'; }
      html += `<td class="sal-sheet-cell ${cls}"
        ontouchstart="startLongPress(event,'${s.id}','${key}','${dayLabel}',${rate})"
        ontouchend="endLongPress(event,'${s.id}','${key}')"
        ontouchmove="moveLongPress(event)"
        oncontextmenu="openDayModal('${s.id}','${key}','${dayLabel}',${rate});return false;"
      >${sym}</td>`;
    });

    html += '</tr>';
  }
  html += '</tbody>';
  return html;
}

// ── Main render ──
function renderSalaire() {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth() + salMonthOffset;
  const monthDate = new Date(y, m, 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const rawLabel = monthDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  document.getElementById('sal-month-label').textContent = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
  document.getElementById('sal-prev').disabled = false;
  document.getElementById('sal-next').disabled = salMonthOffset >= 3;

  const staff = getSalStaff();
  const sheetCard = document.getElementById('sal-sheet-card');

  if (!staff.length) {
    sheetCard.style.display = 'none';
    document.getElementById('sal-bp-staff').innerHTML = '<div class="empty" style="padding:20px 0;">Aucun employé</div>';
    document.getElementById('sal-bp-peek-nums').innerHTML = '';
    document.getElementById('sal-bp-footer').innerHTML = '';
    return;
  }

  // Shared sheet table
  sheetCard.style.display = 'block';
  document.getElementById('sal-sheet-title').textContent =
    'Présence — ' + rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
  document.getElementById('sal-sheet').innerHTML = buildSharedTable(staff, y, m, today);

  // ── Bottom panel ──
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  let totalDuMois = 0, totalDejaPayé = 0, totalReste = 0;

  document.getElementById('sal-bp-staff').innerHTML = staff.map(s => {
    const rate      = s.rate || 0;
    const stats     = calcStaffStats(s.id, y, m, today, rate);
    const duMois    = rate > 0 ? daysInMonth * rate : 0;
    const dejaPayé  = stats.paidAmount + stats.advanceAmount;
    const reste     = duMois - dejaPayé;
    totalDuMois   += duMois;
    totalDejaPayé += dejaPayé;
    totalReste    += reste;
    const resteColor = reste > 0 ? 'var(--red)' : 'var(--green)';
    return `
      <div class="sal-bp-staff-item">
        <div class="sal-bp-staff-head">
          <div class="sal-bp-staff-name">${s.name}</div>
          <button class="sal-del-btn" onclick="removeSalStaff('${s.id}')">✕</button>
        </div>
        <div class="sal-bp-staff-rate">
          <input class="inv-input" type="number" min="0" value="${rate||''}" placeholder="Dhs/j"
            style="width:80px;" onchange="updateStaffRate('${s.id}',this.value)">
          <span style="font-size:11px;color:var(--text-dim);">Dhs / jour</span>
        </div>
        <div style="font-size:10px;color:var(--text-dim);margin-bottom:6px;">
          Appui long sur une cellule payée pour modifier le montant
        </div>
        <div class="sal-summary">
          <span class="sal-sum-chip sal-chip-paid">Payé ${stats.paid}j</span>
          <span class="sal-sum-chip sal-chip-advance">Avance ${stats.advance}j</span>
          <span class="sal-sum-chip sal-chip-absent">Absent ${stats.absent}j</span>
        </div>
        ${rate > 0 ? `
        <div class="sal-bp-staff-fin">
          <div class="sal-bp-fin-item"><div class="sal-bp-fin-label">Total du mois</div><div class="sal-bp-fin-val">${fmtMoney(duMois)} <span style="font-size:11px;">Dhs</span></div></div>
          <div class="sal-bp-fin-item"><div class="sal-bp-fin-label">Déjà payé</div><div class="sal-bp-fin-val" style="color:var(--green);">${fmtMoney(dejaPayé)} <span style="font-size:11px;">Dhs</span></div></div>
          <div class="sal-bp-fin-item"><div class="sal-bp-fin-label">Reste à payer</div><div class="sal-bp-fin-val" style="color:${resteColor};">${fmtMoney(reste)} <span style="font-size:11px;">Dhs</span></div></div>
        </div>` : ''}
      </div>`;
  }).join('');

  // Daily totals for today
  const todayKey = getSalDayKey(today);
  let dailyTotal = 0, dailyPaid = 0;
  staff.forEach(s => {
    const rate = s.rate || 0;
    if (!rate) return;
    dailyTotal += rate;
    const { base, amount } = parseSalStatus((_salDays[s.id] || {})[todayKey] || null);
    if (base === 'paid' || base === 'advance') {
      dailyPaid += amount != null ? amount : rate;
    }
  });
  const dailyReste = dailyTotal - dailyPaid;

  const resteColor = totalReste > 0 ? 'var(--red)' : 'var(--green)';

  // Peek bar — always visible, shows the récapitulatif table
  document.getElementById('sal-bp-peek-nums').innerHTML = `
    <table class="sal-bp-summary" style="margin-top:6px;">
      <thead>
        <tr>
          <th></th>
          <th>À payer</th>
          <th>Payé</th>
          <th>Reste</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Aujourd'hui</td>
          <td class="col-du">${fmtMoney(dailyTotal)}</td>
          <td class="col-pay">${fmtMoney(dailyPaid)}</td>
          <td class="${dailyReste > 0 ? 'col-rest-red' : 'col-rest-ok'}">${fmtMoney(dailyReste)}</td>
        </tr>
        <tr>
          <td>Ce mois</td>
          <td class="col-du">${fmtMoney(totalDuMois)}</td>
          <td class="col-pay">${fmtMoney(totalDejaPayé)}</td>
          <td class="${totalReste > 0 ? 'col-rest-red' : 'col-rest-ok'}">${fmtMoney(totalReste)}</td>
        </tr>
      </tbody>
    </table>`;

  document.getElementById('sal-bp-footer').innerHTML = '';
}
