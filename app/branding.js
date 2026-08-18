// ═══════════════════════════════════════
// BRANDING — universal-client theming.
// Pulls the connected POS's business name/tagline/logo + theme colors
// (via stats-server.js's /api/branding) and applies them to the Stats UI,
// so any device that scans a POS's Cloudflare QR code sees that business's
// identity. Falls back to a neutral default when no POS is connected
// (no cp_api_url — first run on GitHub Pages/APK) or the fetch fails.
//
// Mirrors legacy/app/branding.js's cp_biz_*/cp_theme_* keys, but reads them
// over HTTP instead of localStorage — Stats runs on a different device/origin
// than the POS.
// ═══════════════════════════════════════

const _STATS_DEFAULT_BRANDING = {
  name: 'ERPGEN',
  tagline: 'Statistiques',
  logo: '',
  theme: { accent: '', bg: '', topbar: '', text: '' },
};

function _applyStatsThemeVars(theme) {
  const t = theme || _STATS_DEFAULT_BRANDING.theme;
  const rules = [];
  if (t.accent) rules.push(`--green-dark:${t.accent};`);
  if (t.bg)     rules.push(`--bg:${t.bg};`);
  if (t.topbar) rules.push(`--topbar-bg:${t.topbar};`);
  if (t.text)   rules.push(`--text:${t.text};`);

  let styleEl = document.getElementById('stats-theme');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'stats-theme';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = rules.length ? `:root{${rules.join('')}}` : '';
}

function applyStatsBranding(data) {
  const b = data || _STATS_DEFAULT_BRANDING;
  document.title = (b.name || _STATS_DEFAULT_BRANDING.name) + ' — Stats';

  const nameEl = document.getElementById('topbar-biz-name');
  const subEl  = document.getElementById('topbar-biz-sub');
  if (nameEl) nameEl.textContent = b.name    || _STATS_DEFAULT_BRANDING.name;
  if (subEl)  subEl.textContent  = b.tagline || _STATS_DEFAULT_BRANDING.tagline;

  const logoEl = document.getElementById('topbar-biz-logo');
  if (logoEl) {
    if (b.logo) { logoEl.src = b.logo; logoEl.style.display = ''; }
    else        { logoEl.removeAttribute('src'); logoEl.style.display = 'none'; }
  }

  _applyStatsThemeVars(b.theme);
}

async function loadStatsBranding() {
  if (!getApiBase()) { applyStatsBranding(_STATS_DEFAULT_BRANDING); return; }
  try {
    const data = await apiGet('/api/branding');
    applyStatsBranding(data);
  } catch {
    applyStatsBranding(_STATS_DEFAULT_BRANDING);
  }
}
