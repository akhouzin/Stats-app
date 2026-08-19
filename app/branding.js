// ═══════════════════════════════════════
// BRANDING — universal-client theming.
// Pulls the connected POS's business name/tagline/logo + theme colors/fonts
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
  theme: { accent: '', bg: '', topbar: '', text: '', ui_font: '', brand_font: '' },
};

// Same Google Fonts map as legacy/app/branding.js's _GF_MAP — kept in sync so a
// POS's chosen fonts render identically on the Stats client.
const _STATS_GF_MAP = {
  'Inter':             'Inter:wght@300;400;700',
  'Poppins':           'Poppins:wght@300;400;600;700',
  'Raleway':           'Raleway:wght@300;400;600;700',
  'Open Sans':         'Open+Sans:wght@300;400;600;700',
  'Playfair Display':  'Playfair+Display:ital,wght@0,400;0,700;1,400',
  'Josefin Sans':      'Josefin+Sans:wght@300;400;600;700',
  'Montserrat':        'Montserrat:wght@300;400;600;700',
};

function _ensureStatsGoogleFont(name) {
  if (!name || !_STATS_GF_MAP[name]) return;
  const id = 'gf-' + name.replace(/\s+/g, '-').toLowerCase();
  if (document.getElementById(id)) return;
  const l = document.createElement('link');
  l.id = id; l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${_STATS_GF_MAP[name]}&display=swap`;
  document.head.appendChild(l);
}

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
  let css = rules.length ? `:root{${rules.join('')}}` : '';

  _ensureStatsGoogleFont(t.ui_font);
  _ensureStatsGoogleFont(t.brand_font);
  // ui_font mirrors legacy's body/controls scope; brand_font mirrors its
  // title/brand-surface scope (nav/logo/etc.) — here that's the topbar
  // title and the disconnected-screen mark, the two "brand name" surfaces.
  if (t.ui_font)    css += `body, button, input, select, textarea { font-family: '${t.ui_font}', sans-serif; }\n`;
  if (t.brand_font) css += `.topbar-title, .topbar-sub, .disc-mark, .disc-title { font-family: '${t.brand_font}', serif !important; }\n`;

  styleEl.textContent = css;
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
