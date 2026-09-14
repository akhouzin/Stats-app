// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
// Mirrors legacy/app/render-history.js's authoritative getDayKey() — shifts the
// input Date back by the connected POS's day-cycle-start hour (branding.js:
// getStatsDayCycleStartHour(), 0 by default) before formatting, so a business
// open past midnight buckets Stats' "commandes"/history the same way the POS
// itself does instead of splitting one continuous shift across two calendar days.
//
// Manual DD/MM/YYYY formatting instead of toLocaleDateString('fr-MA', {...}) —
// found via live profiling to be the actual bottleneck behind Stats "getting
// stuck" on a POS with a few thousand orders loaded: this is called once per
// order (often more than once — every page that groups by day calls it), and
// Date.prototype.toLocaleDateString() with Intl formatting options measured
// well over 1ms/call at scale (thousands of calls blocking the main thread
// for over a second — this exact freeze is what read as "stuck during
// section navigation"). The manual version produces byte-identical output
// (verified against the Intl version across thousands of dates, including
// month/year boundaries) in a fraction of a percent of the time — Date
// getters are cheap; Intl.DateTimeFormat construction/lookup is not.
function getDayKey(date) {
  const h = (typeof getStatsDayCycleStartHour === 'function') ? getStatsDayCycleStartHour() : 0;
  const d = h > 0 ? new Date(date.getTime() - h * 3600000) : date;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
function fmtMoney(n) { return n.toFixed(2); }
function fmtTime(date) { return date.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' }); }
function fmtDate(date) { return date.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); }
function fmtDateShort(date) { return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); }

function getUniqueDays(orders) {
  const days = new Set(orders.map(o => getDayKey(o.time)));
  return [...days].sort((a, b) => {
    const pa = a.split('/'), pb = b.split('/');
    return new Date(pb[2], pb[1]-1, pb[0]) - new Date(pa[2], pa[1]-1, pa[0]);
  });
}

function parseDay(key) {
  const p = key.split('/');
  return new Date(p[2], p[1]-1, p[0]);
}

function getMonthStart() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
}

// Consumption is now computed from Marchandise article links (marc_links) —
// see page-inventory.js's minvStockIn()/minvStockOut(), fed by state.js's
// _marcArticles/_marcLinks/_marcAchats. No hardcoded keyword/category list here.

// ═══════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();
