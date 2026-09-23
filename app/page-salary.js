// ═══════════════════════════════════════
// SALAIRE — read-only display
// Salary data is managed in the POS:
//   Intégrations → Gestion des Employés → Salaire
// This page only displays the data served by the stats-server.
// ═══════════════════════════════════════
let salMonthOffset = 0;
let salPanelOpen = false;

function toggleSalPanel() {
  salPanelOpen = !salPanelOpen;
  document.getElementById('sal-bp').classList.toggle('sal-bp-open', salPanelOpen);
}

function parseSalStatus(raw) {
  if (!raw) return { base: null, amount: null };
  const idx = raw.indexOf(':');
  if (idx === -1) return { base: raw, amount: null };
  return { base: raw.slice(0, idx), amount: parseFloat(raw.slice(idx + 1)) };
}

function getSalDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function changeSalMonth(dir) {
  salMonthOffset += dir;
  renderSalaire();
}

function getSalStaff()      { return _salStaff; }
function getStaffDays(id)   { return _salDays[id] || {}; }

// ── Stats calculator ──
function calcStaffStats(staffId, y, m, today, rate) {
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const data = getStaffDays(staffId);
  let stats = { paid: 0, advance: 0, absent: 0, worked: 0, pending: 0, paidAmount: 0, advanceAmount: 0, workedAmount: 0 };
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const key = getSalDayKey(date);
    let { base, amount } = parseSalStatus(data[key] || null);
    // Unmarked past/today days default to "Travaillé" — mirrors legacy/app/employee-manager.js
    if (base === null && date <= today) base = 'worked';
    const dayAmt = amount != null ? amount : rate;
    if (base === 'paid')         { stats.paid++;    stats.paidAmount    += dayAmt; }
    else if (base === 'advance') { stats.advance++; stats.advanceAmount += dayAmt; }
    else if (base === 'worked')  { stats.worked++;  stats.workedAmount  += dayAmt; }
    else if (base === 'absent')  stats.absent++;
    else                          stats.pending++;
  }
  return stats;
}

// Money over the month — mirrors legacy/app/employee-manager.js:_empSalMoney().
// A Payé/Avance day is still a worked day (the status records the payment
// handed over that day), so the month's wages count every worked day and the
// payments are subtracted from THAT, not from the unpaid days only:
//   earned = (Travaillé + Payé + Avance days) × rate
//   paidOut = Payé + Avance amounts · reste = earned − paidOut
//   projected = earned + remaining future days × rate
function salMoney(stats, rate) {
  const days    = stats.worked + stats.paid + stats.advance;
  const earned  = days * rate;
  const paidOut = stats.paidAmount + stats.advanceAmount;
  return { days, earned, paidOut, reste: earned - paidOut, projected: earned + stats.pending * rate };
}

// ── Shared sheet table (read-only — no click handlers) ──
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
    const dow     = date.getDay();
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
      let { base: status, amount: customAmt } = parseSalStatus(raw);
      // Unmarked past/today days default to "Travaillé" — mirrors legacy/app/employee-manager.js
      if (status === null && !isFuture) status = 'worked';
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
      else if (status === 'worked')  { cls = 'sal-sc-worked'; sym = 'T'; }
      else if (status === 'absent')  { cls = 'sal-sc-abs';    sym = 'ABS'; }
      else                           { cls = 'sal-sc-future'; sym = '—'; }
      // Read-only cell — no touch/click handlers
      html += `<td class="sal-sheet-cell ${cls}">${sym}</td>`;
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
  let totalEarned = 0, totalDejaPayé = 0, totalReste = 0, totalProjected = 0;
  const line = (label, val, cls = '') =>
    `<div class="sal-line${cls}"><span>${label}</span><span>${val}</span></div>`;

  document.getElementById('sal-bp-staff').innerHTML = staff.map((s, i) => {
    const rate  = s.rate || 0;
    const stats = calcStaffStats(s.id, y, m, today, rate);
    const money = salMoney(stats, rate);
    totalEarned    += money.earned;
    totalDejaPayé  += money.paidOut;
    totalReste     += money.reste;
    totalProjected += money.projected;
    return `
      <div class="sal-bp-staff-item">
        <div class="sal-bp-staff-head">
          <div class="sal-bp-staff-name"><span class="sal-rank">${i + 1}.</span> ${s.name}</div>
          <span style="font-size:11px;color:var(--text-dim);">${rate} Dhs/j</span>
        </div>
        <div class="sal-days-line">
          ${money.days} j travaillés${stats.absent ? ` · ${stats.absent} abs.` : ''}${stats.pending ? ` · ${stats.pending} à venir` : ''}${stats.paid || stats.advance ? ` · dont ${stats.paid} payés, ${stats.advance} avances` : ''}
        </div>
        ${rate > 0 || money.paidOut > 0 ? `
        <div class="sal-lines">
          ${line(`Salaire gagné <small>(${money.days} × ${rate})</small>`, fmtMoney(money.earned))}
          ${line('Déjà payé', fmtMoney(money.paidOut))}
          ${line(money.reste >= 0 ? 'Reste à payer' : 'Trop-perçu', fmtMoney(Math.abs(money.reste)) + ' Dhs', ' sal-line--strong')}
          ${stats.pending ? line('Prévu fin de mois', fmtMoney(money.projected), ' sal-line--dim') : ''}
        </div>` : ''}
      </div>`;
  }).join('');

  // Today: wages of everyone not marked absent vs. what was handed over today.
  const todayKey = getSalDayKey(today);
  let dailyTotal = 0, dailyPaid = 0;
  staff.forEach(s => {
    const rate = s.rate || 0;
    const { base, amount } = parseSalStatus((_salDays[s.id] || {})[todayKey] || null);
    if (base !== 'absent') dailyTotal += rate;
    if (base === 'paid' || base === 'advance') dailyPaid += amount != null ? amount : rate;
  });
  const dailyReste = dailyTotal - dailyPaid;

  document.getElementById('sal-bp-peek-nums').innerHTML = `
    <table class="sal-bp-summary" style="margin-top:6px;">
      <thead>
        <tr>
          <th></th>
          <th>Gagné</th>
          <th>Payé</th>
          <th>Reste</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Aujourd'hui</td>
          <td>${fmtMoney(dailyTotal)}</td>
          <td>${fmtMoney(dailyPaid)}</td>
          <td><b>${fmtMoney(dailyReste)}</b></td>
        </tr>
        <tr>
          <td>Ce mois</td>
          <td>${fmtMoney(totalEarned)}</td>
          <td>${fmtMoney(totalDejaPayé)}</td>
          <td><b>${fmtMoney(totalReste)}</b></td>
        </tr>
        ${totalProjected !== totalEarned ? `<tr class="sal-row-dim">
          <td>Prévu fin de mois</td>
          <td>${fmtMoney(totalProjected)}</td>
          <td></td>
          <td>${fmtMoney(totalProjected - totalDejaPayé)}</td>
        </tr>` : ''}
      </tbody>
    </table>`;

  document.getElementById('sal-bp-footer').innerHTML = '';
}
