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
  dayCycleStartHour: 0,
  theme: { accent: '', bg: '', topbar: '', text: '', ui_font: '', brand_font: '' },
};

// Connected POS's business-day cutover hour (legacy/app/branding.js:getDayCycleStartHour(),
// 0 = midnight = original behavior). Read by helpers.js:getDayKey() so Stats buckets
// orders into the same business-day boundaries the POS itself uses — a business open
// past midnight (e.g. cycle starts 06:00) should see a 01:30 order counted as part of
// the previous business day, same as it is in the POS's own Historique.
let _statsDayCycleStartHour = 0;
function getStatsDayCycleStartHour() { return _statsDayCycleStartHour; }

// Connected POS's configured brand font (cp_theme_brand_font — same value
// applyStatsBranding() below already applies to Stats' own topbar chrome).
// Exposed via a getter so receipt-export.js can render the printed/shared
// ticket in the CONNECTED POS's own chosen font too, rather than a single
// font baked in for every business. Empty string when unset.
let _statsBrandFont = '';
function getStatsBrandFont() { return _statsBrandFont; }

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

// Same fixed-delta lighten/darken as legacy/app/branding.js's _hexAdjust — Stats'
// default palette (--card/--green-mid/--green-light) was itself derived from the
// POS's own default bg using this exact formula, so reusing it here keeps a
// custom bg producing the same relative shades instead of leaving them stuck on
// the hardcoded defaults (the bug this fixes — most of the UI's surface area is
// painted with --card/--green-mid/--green-light, not --bg directly).
function _hexAdjustStats(hex, delta) {
  hex = (hex || '').replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const clamp = v => Math.max(0, Math.min(255, v));
  const r = clamp(parseInt(hex.slice(0, 2), 16) + delta);
  const g = clamp(parseInt(hex.slice(2, 4), 16) + delta);
  const b = clamp(parseInt(hex.slice(4, 6), 16) + delta);
  return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
}

function _applyStatsThemeVars(theme) {
  const t = theme || _STATS_DEFAULT_BRANDING.theme;
  const rules = [];
  if (t.accent) rules.push(`--green-dark:${t.accent};`);
  if (t.bg) {
    rules.push(`--bg:${t.bg};`);
    const card  = _hexAdjustStats(t.bg, 12);
    const mid   = _hexAdjustStats(t.bg, -7);
    const light = _hexAdjustStats(t.bg, -14);
    if (card)  rules.push(`--card:${card};`);
    if (mid)   rules.push(`--green-mid:${mid};`);
    if (light) rules.push(`--green-light:${light};`);
  }
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

// data: URI → object URL, cached per key. The POS ships logos and menu photos
// as base64 data URIs (30–90 KB each); putting those straight into src=""
// via innerHTML meant every re-render re-parsed megabytes of text (one copy
// per order line on the Commandes list). A short blob: URL is decoded once.
const _blobUrls = new Map(); // key → { src, url }
function _blobUrlFor(key, dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl || '';
  const hit = _blobUrls.get(key);
  if (hit && hit.src === dataUrl) return hit.url;
  try {
    const comma = dataUrl.indexOf(',');
    const meta  = dataUrl.slice(5, comma);
    const mime  = meta.split(';')[0] || 'application/octet-stream';
    let blob;
    if (meta.includes(';base64')) {
      const bin = atob(dataUrl.slice(comma + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      blob = new Blob([bytes], { type: mime });
    } else {
      blob = new Blob([decodeURIComponent(dataUrl.slice(comma + 1))], { type: mime });
    }
    if (hit) URL.revokeObjectURL(hit.url);
    const url = URL.createObjectURL(blob);
    _blobUrls.set(key, { src: dataUrl, url });
    return url;
  } catch {
    return dataUrl;
  }
}

let _appliedBrandingKey = null;
function applyStatsBranding(data) {
  const b = data || _STATS_DEFAULT_BRANDING;
  _statsDayCycleStartHour = Number(b.dayCycleStartHour) || 0;
  _statsBrandFont = (b.theme && b.theme.brand_font) || '';

  // Re-applied on every refresh and switch — skip the DOM work (and the logo
  // re-decode / theme <style> rewrite, which made the topbar flicker) when
  // nothing actually changed.
  const key = JSON.stringify([b.name, b.tagline, (b.logo || '').length, b.logo ? b.logo.slice(-64) : '', b.theme]);
  if (key === _appliedBrandingKey) return;
  _appliedBrandingKey = key;

  document.title = (b.name || _STATS_DEFAULT_BRANDING.name) + ' — Stats';
  const nameEl = document.getElementById('topbar-biz-name');
  const subEl  = document.getElementById('topbar-biz-sub');
  if (nameEl) nameEl.textContent = b.name    || _STATS_DEFAULT_BRANDING.name;
  if (subEl)  subEl.textContent  = b.tagline || _STATS_DEFAULT_BRANDING.tagline;

  const logoEl = document.getElementById('topbar-biz-logo');
  if (logoEl) {
    if (b.logo) {
      const src = _blobUrlFor('logo|' + b.name, b.logo);
      if (logoEl.getAttribute('src') !== src) {
        // Fade in once decoded (stats.css .topbar-logo / .is-loaded) instead
        // of popping in half-drawn.
        logoEl.classList.remove('is-loaded');
        logoEl.onload = () => logoEl.classList.add('is-loaded');
        logoEl.src = src;
        if (logoEl.complete) logoEl.classList.add('is-loaded');
      }
      logoEl.style.display = '';
    } else {
      logoEl.removeAttribute('src');
      logoEl.style.display = 'none';
    }
  }

  _applyStatsThemeVars(b.theme);
}

// Per-POS branding cache (base URL → { data, at }). /api/branding carries the
// logo as a data URI (~90 KB on a real shop), and loadData() runs every 60 s —
// re-downloading an identity that almost never changes was pure waste on a
// phone's data plan. Also lets a restaurant switch re-theme the topbar
// instantly from a prefetched copy (store-cache.js) instead of after a fetch.
const _BRANDING_TTL_MS = 10 * 60 * 1000;
const _brandingInFlight = new Map(); // base URL → Promise — concurrent callers share one request

// Persisted to localStorage (not IndexedDB like the data snapshots) on
// purpose: it's small (one logo per restaurant) and must be readable
// SYNCHRONOUSLY at boot, so the topbar is painted in the restaurant's own
// name/logo/colors on the very first frame instead of flashing the neutral
// ERPGEN default for the length of a network round trip.
const _BRANDING_STORE_KEY = 'cp_branding_cache';
const _brandingCache = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(_BRANDING_STORE_KEY) || '{}');
    return new Map(Object.entries(raw));
  } catch {
    return new Map();
  }
})();
function _persistBrandingCache() {
  try {
    const saved = new Set(JSON.parse(localStorage.getItem('cp_locations') || '[]').map(l => l.url));
    const obj = {};
    _brandingCache.forEach((v, k) => { if (saved.has(k)) obj[k] = v; });
    localStorage.setItem(_BRANDING_STORE_KEY, JSON.stringify(obj));
  } catch { /* quota / private mode — cache stays in memory only */ }
}

function getCachedBranding(base) {
  const hit = _brandingCache.get(base);
  return hit ? hit.data : null;
}

// Fetches (or reuses, while fresh) one POS's branding. Never touches the UI —
// callers decide whether the result belongs to the active restaurant.
async function fetchBrandingFor(base, { force = false } = {}) {
  const hit = _brandingCache.get(base);
  if (hit && !force && Date.now() - hit.at < _BRANDING_TTL_MS) return hit.data;
  if (_brandingInFlight.has(base)) return _brandingInFlight.get(base);
  const p = apiGetFrom(base, '/api/branding')
    .then(data => {
      _brandingCache.set(base, { data, at: Date.now() });
      _persistBrandingCache();
      if (typeof _autoNameLocation === 'function') _autoNameLocation(base, data && data.name);
      return data;
    })
    .finally(() => _brandingInFlight.delete(base));
  _brandingInFlight.set(base, p);
  return p;
}

// Paint the active restaurant's saved identity the moment this script runs —
// earlier than app-init.js (which waits for every page script to download),
// so on a slow connection the topbar is branded while the rest still loads.
(function paintCachedBrandingEarly() {
  try {
    const base = getApiBase();
    const cached = base && getCachedBranding(base);
    if (cached) applyStatsBranding(cached);
  } catch { /* topbar keeps the neutral default until loadStatsBranding() */ }
})();

// Awaited by data-loader.js:loadData() before it renders, because
// helpers.js:getDayKey() depends on the POS's day-cycle hour carried here —
// rendering first and theming after (the old fire-and-forget call) could
// bucket a just-after-midnight order into the wrong business day.
async function loadStatsBranding() {
  const base = getApiBase();
  if (!base) { applyStatsBranding(_STATS_DEFAULT_BRANDING); return; }
  // Snapshot which POS connection this call belongs to (state.js:_locationEpoch,
  // bumped on every restaurant switch by location-picker.js) — a slow response
  // from the restaurant just switched AWAY from must not revert the topbar
  // title/logo/theme back to the wrong restaurant's identity.
  const myEpoch = _locationEpoch;
  // Paint the last known identity right away (synchronously — this runs
  // before first paint at boot); the fetch below only updates it if stale.
  const cached = getCachedBranding(base);
  if (cached) applyStatsBranding(cached);
  try {
    const data = await fetchBrandingFor(base);
    if (myEpoch !== _locationEpoch) return; // stale — a different POS is now active
    applyStatsBranding(data);
  } catch {
    if (myEpoch !== _locationEpoch) return;
    // Keep whatever this POS's last known identity was rather than flashing
    // the neutral ERPGEN default on a transient failure.
    applyStatsBranding(getCachedBranding(base) || _STATS_DEFAULT_BRANDING);
  }
}
