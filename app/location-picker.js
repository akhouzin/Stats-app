// ═══════════════════════════════════════
// LOCATION PICKER — multi-POS selector
// Saves named locations in localStorage so any device can switch between
// POS machines (each with its own Cloudflare tunnel).
//
// Storage:
//   cp_api_url    — active tunnel URL (used by local-api.js)
//   cp_locations  — JSON array of { name, url } saved entries
// ═══════════════════════════════════════

const _LOC_KEY = 'cp_locations';

function _getLocations() {
  try { return JSON.parse(localStorage.getItem(_LOC_KEY) || '[]'); } catch { return []; }
}
function _saveLocations(list) {
  localStorage.setItem(_LOC_KEY, JSON.stringify(list));
}

// Deterministic per-restaurant color + initial, used for the topbar switcher
// chip and every location row/card so multiple restaurants stay visually
// distinguishable at a glance (same idea as a Slack/Notion workspace avatar).
const _LOC_PALETTE = ['#1a7a3a', '#2f6690', '#8b5e3c', '#6a4c93', '#b8860b', '#3a6351', '#a4508b'];
function _locColor(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return _LOC_PALETTE[h % _LOC_PALETTE.length];
}
function _locInitial(name) {
  const s = String(name || '').trim();
  return s ? s.charAt(0).toUpperCase() : '?';
}

(function injectLocationPickerUI() {
  document.addEventListener('DOMContentLoaded', () => {
    const topbar = document.querySelector('.topbar-right') || document.querySelector('.topbar');
    if (topbar) {
      const btn = document.createElement('button');
      btn.id    = 'loc-settings-btn';
      btn.className = 'loc-avatar loc-settings-btn';
      btn.onclick = openLocationModal;
      topbar.prepend(btn);
      _renderSwitcherChip();
    }

    const modal = document.createElement('div');
    modal.id = 'loc-modal';
    modal.className = 'loc-modal';
    modal.innerHTML = `
      <div class="loc-modal-box">
        <div class="loc-modal-title">CHOISIR UN RESTAURANT</div>
        <div class="loc-modal-subtitle">Sélectionnez un POS ou ajoutez-en un nouveau.</div>

        <div id="loc-list" class="loc-list"></div>

        <div id="loc-disconnect-row" style="display:none;"></div>

        <div class="loc-add-section">
          <div class="loc-section-label">Ajouter un restaurant</div>

          <div id="loc-scan-section" class="loc-scan-section" style="display:none;">
            <div class="loc-scan-box">
              <video id="loc-scan-video" class="loc-scan-video" autoplay playsinline muted></video>
              <canvas id="loc-scan-canvas" style="display:none;"></canvas>
              <div class="loc-scan-frame"><div class="loc-scan-frame-box"></div></div>
            </div>
            <div class="loc-scan-foot">
              <span id="loc-scan-status" class="loc-scan-status">Pointez la caméra sur le QR code du POS</span>
              <button class="loc-btn-cancel-scan" onclick="stopQRScan()">✕ Annuler</button>
            </div>
          </div>

          <button onclick="startQRScan()" id="loc-scan-btn" class="loc-scan-btn">
            📷 Scanner le QR code du POS
          </button>
          <div id="loc-scan-msg" class="loc-test-result loc-scan-msg"></div>
          <div class="loc-or-sep">— ou entrez l'URL manuellement —</div>

          <input id="loc-name-input" class="loc-input" type="text" placeholder="Nom (ex: Barbeqa Agadir)">
          <input id="loc-url-input" class="loc-input" type="url" placeholder="https://stats.monrestaurant.com">
          <div id="loc-test-result" class="loc-test-result"></div>
          <div class="loc-actions">
            <button class="loc-btn-test" onclick="testLocationUrl()">Tester</button>
            <button class="loc-btn-add" onclick="addLocation()">+ Ajouter</button>
            <button class="loc-btn-close" onclick="closeLocationModal()">Fermer</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  });
})();

// ═══════════════════════════════════════
// SWITCH TRANSITION — brief full-screen overlay shown while loadData() fetches
// the newly-connected POS's data, so switching restaurants reads as one
// deliberate motion instead of the dashboard's numbers jumping mid-view.
// Self-contained (own injected styles/markup), same inline-JS convention as
// the rest of this file rather than stats.css classes.
// ═══════════════════════════════════════

function _switchTransitionEl() {
  let el = document.getElementById('loc-switch-transition');
  if (el) return el;

  const styleTag = document.createElement('style');
  styleTag.textContent = `@keyframes locSwitchSpin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(styleTag);

  el = document.createElement('div');
  el.id = 'loc-switch-transition';
  el.style.cssText = `
    position:fixed;inset:0;z-index:10001;background:#14261a;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    opacity:0;pointer-events:none;transition:opacity .28s ease;
  `;
  el.innerHTML = `
    <div style="width:34px;height:34px;border-radius:50%;
      border:3px solid rgba(255,255,255,0.18);border-top-color:#81c784;
      animation:locSwitchSpin .7s linear infinite;margin-bottom:14px;"></div>
    <div id="loc-switch-label" style="font-family:'Cinzel',serif;font-size:13px;
      letter-spacing:1px;color:#fff;opacity:.9;"></div>
  `;
  document.body.appendChild(el);
  return el;
}

function _showSwitchTransition(name) {
  const el = _switchTransitionEl();
  document.getElementById('loc-switch-label').textContent = name ? `Connexion à ${name}…` : 'Connexion…';
  el.style.pointerEvents = 'auto';
  requestAnimationFrame(() => { el.style.opacity = '1'; });
}

function _hideSwitchTransition() {
  const el = document.getElementById('loc-switch-transition');
  if (!el) return;
  el.style.opacity = '0';
  el.style.pointerEvents = 'none';
}

// Wraps loadData() with the overlay above, holding it visible for a minimum
// duration so a fast local response doesn't just flash the spinner. Only
// waits for loadData()'s FAST "today" phase, not its much heavier full-
// history phase (entire order table, needed for month nav — no fixed
// lookback limit, see data-loader.js) — that continues in the background
// after the overlay fades, same as it already did on the 60s auto-refresh.
// Waiting for the full phase here would mean every switch blocks on the
// slowest possible query regardless of how little the user actually needs
// right away.
async function _switchWithTransition(name) {
  const started = Date.now();
  _showSwitchTransition(name);
  await new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    loadData(finish).finally(finish);
  });
  const minShowMs = 450;
  const elapsed   = Date.now() - started;
  if (elapsed < minShowMs) await new Promise(r => setTimeout(r, minShowMs - elapsed));
  _hideSwitchTransition();
}

function _renderLocList() {
  const list    = _getLocations();
  const active  = localStorage.getItem('cp_api_url') || '';
  const el      = document.getElementById('loc-list');
  if (!el) return;

  if (list.length === 0) {
    el.innerHTML = `<div class="loc-empty">
      <span class="loc-empty-icon">📍</span>
      Aucun restaurant enregistré.<br>Ajoutez-en un ci-dessous.
    </div>`;
  } else {
    el.innerHTML = list.map((loc, i) => {
      const isActive = loc.url === active;
      const shareLink = `https://akhouzin.github.io/Stats-app/?add=${encodeURIComponent(loc.name)}&url=${encodeURIComponent(loc.url)}`;
      return `
        <div class="loc-item${isActive ? ' loc-item-active' : ''}">
          <div class="loc-item-row">
            <span class="loc-avatar" style="background:${_locColor(loc.name)}">${_locInitial(loc.name)}</span>
            <div class="loc-item-info">
              <div class="loc-item-name">${loc.name}${isActive ? ' <span class="loc-item-badge">Actif</span>' : ''}</div>
              <div class="loc-item-url">${loc.url}</div>
            </div>
            <button onclick="connectLocation(${i})" class="loc-btn-connect${isActive ? ' loc-btn-active' : ''}">
              ${isActive ? 'Actif' : 'Connecter'}
            </button>
            <button onclick="removeLocation(${i})" class="loc-btn-remove">✕</button>
          </div>
          <div class="loc-share-row">
            <input readonly value="${shareLink}" class="loc-share-input" onclick="this.select();" />
            <button onclick="navigator.clipboard.writeText('${shareLink.replace(/'/g,"\\'")}').then(()=>{this.textContent='✓';setTimeout(()=>this.textContent='Copier lien',1500)})" class="loc-btn-copy">
              Copier lien
            </button>
          </div>
        </div>`;
    }).join('');
  }

  // Disconnect button — only shown while an active connection exists, so the
  // user has a way back to the neutral/no-POS screen without deleting any of
  // their saved locations (removeLocation() deletes; this just stops using one).
  const discRow = document.getElementById('loc-disconnect-row');
  if (discRow) {
    discRow.style.display = active ? 'block' : 'none';
    discRow.innerHTML = active ? `
      <button onclick="disconnectLocation()" class="loc-disconnect-btn">
        🔌 Se déconnecter — revenir à l'écran par défaut
      </button>` : '';
  }

  _renderSwitcherChip();
}

// Topbar trigger: shows the active restaurant's monogram avatar so the
// current context is always visible at a glance, or a neutral ⚙ when
// nothing is connected. Kept in sync from every call site that touches the
// active connection, via _renderLocList() above.
function _renderSwitcherChip() {
  const btn = document.getElementById('loc-settings-btn');
  if (!btn) return;
  const active = localStorage.getItem('cp_api_url') || '';
  const loc = _getLocations().find(l => l.url === active);
  if (loc) {
    btn.style.background = _locColor(loc.name);
    btn.textContent = _locInitial(loc.name);
    btn.title = `${loc.name} — changer de restaurant`;
  } else {
    btn.style.background = '';
    btn.textContent = '⚙';
    btn.title = 'Choisir un restaurant';
  }
}

// Shows the neutral "no POS connected" screen (ERPGEN default branding, no
// data pages) and hides the dashboard. Used both on first launch with nothing
// configured (app-init.js) and when the user explicitly disconnects below.
function _showDisconnectedScreen() {
  _hideStartupChooser();
  const screen = document.getElementById('disconnected-screen');
  const wrap   = document.getElementById('pages-wrap');
  const nav    = document.querySelector('.bottom-nav');
  if (screen) screen.style.display = 'flex';
  if (wrap)   wrap.style.display   = 'none';
  if (nav)    nav.style.display    = 'none';
  const status = document.getElementById('live-status');
  if (status) status.textContent = 'Aucun POS configuré';
}

function _hideDisconnectedScreen() {
  _hideStartupChooser();
  const screen = document.getElementById('disconnected-screen');
  const wrap   = document.getElementById('pages-wrap');
  const nav    = document.querySelector('.bottom-nav');
  if (screen) screen.style.display = 'none';
  if (wrap)   wrap.style.display   = '';
  if (nav)    nav.style.display    = '';
}

// ═══════════════════════════════════════
// STARTUP CHOOSER — forces an explicit restaurant pick on every app open
// when 2+ are saved on this device, instead of silently reusing whatever
// cp_api_url happened to be active last. Wired from app-init.js's boot gate
// and from disconnectLocation() below (disconnecting with several saved
// restaurants should offer to pick a different one, not just go neutral).
// ═══════════════════════════════════════

function _renderStartupChooser() {
  const list   = _getLocations();
  const active = localStorage.getItem('cp_api_url') || '';
  const el     = document.getElementById('sc-list');
  if (!el) return;
  el.innerHTML = list.map((loc, i) => `
    <button class="sc-item" onclick="_chooseStartupLocation(${i})">
      <span class="loc-avatar" style="background:${_locColor(loc.name)}">${_locInitial(loc.name)}</span>
      <span class="sc-item-info">
        <span class="sc-item-name">${loc.name}</span>
        <span class="sc-item-url">${loc.url}</span>
      </span>
      ${loc.url === active ? '<span class="sc-item-last">Dernier</span>' : ''}
      <span class="sc-item-arrow">›</span>
    </button>
  `).join('');
}

function _showStartupChooser() {
  _renderStartupChooser();
  const screen = document.getElementById('startup-chooser-screen');
  const disc   = document.getElementById('disconnected-screen');
  const wrap   = document.getElementById('pages-wrap');
  const nav    = document.querySelector('.bottom-nav');
  if (disc)   disc.style.display   = 'none';
  if (screen) screen.style.display = 'flex';
  if (wrap)   wrap.style.display   = 'none';
  if (nav)    nav.style.display    = 'none';
}

function _hideStartupChooser() {
  const screen = document.getElementById('startup-chooser-screen');
  if (screen) screen.style.display = 'none';
}

async function _chooseStartupLocation(i) {
  const list = _getLocations();
  if (!list[i]) return;
  localStorage.setItem('cp_api_url', list[i].url);
  _hideDisconnectedScreen(); // also hides the chooser itself + reveals the dashboard
  _renderLocList();
  await _switchWithTransition(list[i].name);
}

// Clears the active connection (cp_api_url) without touching saved locations.
// With 2+ restaurants still saved, offers the startup chooser so the user can
// immediately pick a different one; otherwise falls back to the neutral
// ERPGEN-branded default screen, same one shown on a fresh install.
function disconnectLocation() {
  localStorage.removeItem('cp_api_url');
  loadStatsBranding(); // resets topbar name/logo/theme to the neutral ERPGEN default
  closeLocationModal();
  _renderLocList();
  if (_getLocations().length > 1) {
    _showStartupChooser();
  } else {
    _showDisconnectedScreen();
  }
}

function _setLocResult(msg, kind) {
  const el = document.getElementById('loc-test-result');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('loc-test-ok', 'loc-test-err');
  if (kind) el.classList.add(kind === 'ok' ? 'loc-test-ok' : 'loc-test-err');
}

function _setScanMsg(msg) {
  const el = document.getElementById('loc-scan-msg');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('loc-status-err', !!msg);
  el.style.display = msg ? 'flex' : 'none';
}

function openLocationModal() {
  stopQRScan();
  document.getElementById('loc-url-input').value  = '';
  document.getElementById('loc-name-input').value = '';
  _setLocResult('');
  _setScanMsg('');
  _renderLocList();
  document.getElementById('loc-modal').classList.add('loc-modal-open');
}

function closeLocationModal() {
  stopQRScan();
  document.getElementById('loc-modal').classList.remove('loc-modal-open');
}

async function connectLocation(i) {
  const list = _getLocations();
  if (!list[i]) return;
  localStorage.setItem('cp_api_url', list[i].url);
  _renderLocList();
  closeLocationModal();
  _hideDisconnectedScreen();
  await _switchWithTransition(list[i].name);
}

function removeLocation(i) {
  const list = _getLocations();
  const active = localStorage.getItem('cp_api_url') || '';
  if (list[i] && list[i].url === active) localStorage.removeItem('cp_api_url');
  list.splice(i, 1);
  _saveLocations(list);
  _renderLocList();
}

async function addLocation() {
  const name = document.getElementById('loc-name-input').value.trim();
  const url  = document.getElementById('loc-url-input').value.trim().replace(/\/$/, '');
  if (!name) { _setLocResult('Entrez un nom pour ce restaurant.', 'err'); return; }
  if (!url)  { _setLocResult("Entrez l'URL du tunnel Cloudflare.", 'err'); return; }
  const list = _getLocations();
  if (list.some(l => l.url === url)) { _setLocResult('Cette URL est déjà enregistrée.', 'err'); return; }
  list.push({ name, url });
  _saveLocations(list);
  document.getElementById('loc-name-input').value = '';
  document.getElementById('loc-url-input').value  = '';
  _setLocResult('');
  // Connect to the newly added location immediately — otherwise it just sits in
  // the bookmark list while cp_api_url (the active connection) stays on whatever
  // was connected before, and the dashboard keeps silently showing that old
  // location's data. Mirrors the direct-tunnel-URL QR-scan branch below, which
  // already auto-connects.
  localStorage.setItem('cp_api_url', url);
  _renderLocList();
  _hideDisconnectedScreen();
  await _switchWithTransition(name);
}

async function testLocationUrl() {
  const input = document.getElementById('loc-url-input');
  const url   = (input.value.trim().replace(/\/$/, '') || 'http://127.0.0.1:3721') + '/api/menu-items';
  _setLocResult('');
  const el = document.getElementById('loc-test-result');
  if (el) el.innerHTML = '<span class="loc-mini-spinner"></span> Test en cours…';
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, { signal: ctrl.signal });
    if (r.ok) {
      _setLocResult('✓ Connexion réussie', 'ok');
    } else {
      _setLocResult(`✗ Erreur ${r.status}`, 'err');
    }
  } catch {
    _setLocResult('✗ Impossible de se connecter', 'err');
  }
}

function saveLocationUrl() { addLocation(); } // backward compat

// ═══════════════════════════════════════
// QR SCANNER
// Uses BarcodeDetector (Chrome/Android) with jsQR CDN as fallback.
// Reads ERPGEN deep-link format: ?add=NAME&url=TUNNEL_URL
// ═══════════════════════════════════════

let _scanStream = null;
let _scanRaf    = null;

async function startQRScan() {
  _setScanMsg('');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    _setScanMsg('Caméra non disponible sur ce navigateur.');
    return;
  }
  try {
    _scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
    });
  } catch (e) {
    _setScanMsg('Accès caméra refusé : ' + e.message);
    return;
  }

  const video  = document.getElementById('loc-scan-video');
  const scanEl = document.getElementById('loc-scan-section');
  const scanBtn = document.getElementById('loc-scan-btn');
  video.srcObject = _scanStream;
  scanEl.style.display  = '';
  if (scanBtn) scanBtn.style.display = 'none';
  document.getElementById('loc-scan-status').textContent = 'Pointez la caméra sur le QR code du POS';

  if (typeof BarcodeDetector !== 'undefined') {
    _runBarcodeDetector(video);
  } else {
    _loadJsQR(() => _runJsQR(video));
  }
}

function stopQRScan() {
  if (_scanStream) { _scanStream.getTracks().forEach(t => t.stop()); _scanStream = null; }
  if (_scanRaf)    { cancelAnimationFrame(_scanRaf); _scanRaf = null; }
  const video   = document.getElementById('loc-scan-video');
  const scanEl  = document.getElementById('loc-scan-section');
  const scanBtn = document.getElementById('loc-scan-btn');
  if (video)   { video.srcObject = null; }
  if (scanEl)  { scanEl.style.display = 'none'; }
  if (scanBtn) { scanBtn.style.display = ''; }
}

function _handleQRResult(rawValue) {
  try {
    const u    = new URL(rawValue);
    const name = u.searchParams.get('add');
    const url  = u.searchParams.get('url');
    if (name && url) {
      // Legacy deep-link: ?add=NAME&url=TUNNEL_URL
      stopQRScan();
      document.getElementById('loc-name-input').value = name;
      document.getElementById('loc-url-input').value  = url;
      addLocation();
      return;
    }

    if (u.protocol === 'https:' || u.protocol === 'http:') {
      // Direct tunnel URL — auto-save with hostname as name and connect immediately.
      // Keep any path segment (e.g. /db/<id>) — that's how a non-default database
      // on a shared tunnel is addressed, see legacy/stats-server/stats-server.js.
      stopQRScan();
      const tunnelUrl = u.origin + u.pathname.replace(/\/$/, '');
      const autoName  = u.hostname;
      const list = _getLocations();
      if (!list.some(l => l.url === tunnelUrl)) {
        list.push({ name: autoName, url: tunnelUrl });
        _saveLocations(list);
      }
      localStorage.setItem('cp_api_url', tunnelUrl);
      closeLocationModal();
      _hideDisconnectedScreen();
      _renderLocList();
      _switchWithTransition(autoName);
      return;
    }

    document.getElementById('loc-scan-status').textContent = 'QR non reconnu — utilisez le QR du POS';
  } catch {
    const s = document.getElementById('loc-scan-status');
    if (s) s.textContent = 'QR non reconnu';
  }
}

function _runBarcodeDetector(video) {
  const detector = new BarcodeDetector({ formats: ['qr_code'] });
  async function tick() {
    if (!_scanStream) return;
    try {
      const codes = await detector.detect(video);
      if (codes.length > 0) { _handleQRResult(codes[0].rawValue); return; }
    } catch {}
    _scanRaf = requestAnimationFrame(tick);
  }
  _scanRaf = requestAnimationFrame(tick);
}

function _loadJsQR(cb) {
  if (window.jsQR) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
  s.onload  = cb;
  s.onerror = () => {
    const el = document.getElementById('loc-scan-status');
    if (el) el.textContent = 'Impossible de charger le scanner QR';
  };
  document.head.appendChild(s);
}

function _runJsQR(video) {
  const canvas = document.getElementById('loc-scan-canvas');
  const ctx    = canvas.getContext('2d');
  function tick() {
    if (!_scanStream) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (code) { _handleQRResult(code.data); return; }
    }
    _scanRaf = requestAnimationFrame(tick);
  }
  _scanRaf = requestAnimationFrame(tick);
}
