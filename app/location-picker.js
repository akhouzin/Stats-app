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

(function injectLocationPickerUI() {
  document.addEventListener('DOMContentLoaded', () => {
    const topbar = document.querySelector('.topbar-right') || document.querySelector('.topbar');
    if (topbar) {
      const btn = document.createElement('button');
      btn.id    = 'loc-settings-btn';
      btn.title = 'Changer de restaurant';
      btn.textContent = '⚙';
      btn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;opacity:0.6;padding:4px 8px;';
      btn.onclick = openLocationModal;
      topbar.prepend(btn);
    }

    const modal = document.createElement('div');
    modal.id = 'loc-modal';
    modal.style.cssText = `
      display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);
      z-index:9999;align-items:center;justify-content:center;
    `;
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:min(440px,92vw);box-shadow:0 8px 32px rgba(0,0,0,0.2);max-height:90vh;overflow-y:auto;">
        <div style="font-family:'Cinzel',serif;font-size:13px;letter-spacing:1px;color:#1a2a1a;margin-bottom:4px;">
          CHOISIR UN RESTAURANT
        </div>
        <div style="font-size:11px;color:#999;margin-bottom:16px;">
          Sélectionnez un POS ou ajoutez-en un nouveau.
        </div>

        <div id="loc-list" style="margin-bottom:16px;"></div>

        <div style="border-top:1px solid #eee;padding-top:14px;">
          <div style="font-size:12px;font-weight:600;color:#444;margin-bottom:8px;">Ajouter un restaurant</div>

          <div id="loc-scan-section" style="display:none;margin-bottom:12px;">
            <div style="position:relative;border-radius:8px;overflow:hidden;background:#000;">
              <video id="loc-scan-video" autoplay playsinline muted style="width:100%;display:block;max-height:220px;object-fit:cover;"></video>
              <canvas id="loc-scan-canvas" style="display:none;"></canvas>
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;">
                <div style="width:160px;height:160px;border:2px solid rgba(255,255,255,0.85);border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,0.38);"></div>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:7px;">
              <span id="loc-scan-status" style="font-size:12px;color:#666;">Pointez la caméra sur le QR code du POS</span>
              <button onclick="stopQRScan()" style="padding:5px 12px;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:12px;background:#fff;white-space:nowrap;">✕ Annuler</button>
            </div>
          </div>

          <button onclick="startQRScan()" id="loc-scan-btn"
            style="width:100%;box-sizing:border-box;padding:11px 10px;border:1.5px dashed #bbb;border-radius:8px;cursor:pointer;background:#fafafa;font-size:13px;color:#555;margin-bottom:10px;text-align:center;font-family:inherit;">
            📷 Scanner le QR code du POS
          </button>
          <div style="text-align:center;font-size:11px;color:#ccc;margin:-4px 0 10px 0;">— ou entrez l'URL manuellement —</div>

          <input id="loc-name-input" type="text" placeholder="Nom (ex: Barbeqa Agadir)"
            style="width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-bottom:8px;">
          <input id="loc-url-input" type="url" placeholder="https://stats.monrestaurant.com"
            style="width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-bottom:8px;">
          <div id="loc-test-result" style="font-size:12px;min-height:16px;margin-bottom:10px;color:#666;"></div>
          <div style="display:flex;gap:8px;">
            <button onclick="testLocationUrl()" style="padding:8px 14px;border:1px solid #ddd;border-radius:6px;cursor:pointer;background:#f5f5f5;font-size:13px;">
              Tester
            </button>
            <button onclick="addLocation()" style="flex:1;padding:8px 14px;border:none;border-radius:6px;cursor:pointer;background:#1a2a1a;color:#fff;font-size:13px;font-weight:600;">
              + Ajouter
            </button>
            <button onclick="closeLocationModal()" style="padding:8px 14px;border:1px solid #ddd;border-radius:6px;cursor:pointer;background:#f5f5f5;font-size:13px;">
              Fermer
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  });
})();

function _renderLocList() {
  const list    = _getLocations();
  const active  = localStorage.getItem('cp_api_url') || '';
  const el      = document.getElementById('loc-list');
  if (!el) return;

  if (list.length === 0) {
    el.innerHTML = `<div style="font-size:12px;color:#bbb;text-align:center;padding:12px 0;">
      Aucun restaurant enregistré.<br>Ajoutez-en un ci-dessous.
    </div>`;
    return;
  }

  el.innerHTML = list.map((loc, i) => {
    const isActive = loc.url === active;
    const shareLink = `https://akhouzin.github.io/Stats-app/?add=${encodeURIComponent(loc.name)}&url=${encodeURIComponent(loc.url)}`;
    return `
      <div style="border-radius:8px;margin-bottom:8px;background:${isActive ? '#f0f7f0' : '#fafafa'};border:1px solid ${isActive ? '#81c784' : '#eee'};">
        <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;color:#1a2a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${isActive ? '✓ ' : ''}${loc.name}
            </div>
            <div style="font-size:10px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${loc.url}</div>
          </div>
          <button onclick="connectLocation(${i})"
            style="padding:6px 12px;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;
              background:${isActive ? '#4caf50' : '#1a2a1a'};color:#fff;">
            ${isActive ? 'Actif' : 'Connecter'}
          </button>
          <button onclick="removeLocation(${i})"
            style="padding:6px 8px;border:1px solid #eee;border-radius:6px;cursor:pointer;font-size:12px;background:#fff;color:#c62828;">
            ✕
          </button>
        </div>
        <div style="border-top:1px solid ${isActive ? '#c8e6c9' : '#eee'};padding:8px 12px;display:flex;align-items:center;gap:8px;">
          <input readonly value="${shareLink}"
            style="flex:1;font-size:10px;font-family:monospace;padding:5px 7px;border:1px solid #ddd;border-radius:5px;background:#fff;color:#666;min-width:0;"
            onclick="this.select();" />
          <button onclick="navigator.clipboard.writeText('${shareLink.replace(/'/g,"\\'")}').then(()=>{this.textContent='✓';setTimeout(()=>this.textContent='Copier lien',1500)})"
            style="padding:5px 10px;border:1px solid #ddd;border-radius:5px;cursor:pointer;font-size:11px;background:#fff;white-space:nowrap;">
            Copier lien
          </button>
        </div>
      </div>`;
  }).join('');
}

function openLocationModal() {
  stopQRScan();
  document.getElementById('loc-url-input').value  = '';
  document.getElementById('loc-name-input').value = '';
  document.getElementById('loc-test-result').textContent = '';
  _renderLocList();
  document.getElementById('loc-modal').style.display = 'flex';
}

function closeLocationModal() {
  stopQRScan();
  document.getElementById('loc-modal').style.display = 'none';
}

function connectLocation(i) {
  const list = _getLocations();
  if (!list[i]) return;
  localStorage.setItem('cp_api_url', list[i].url);
  _renderLocList();
  closeLocationModal();
  loadData();
}

function removeLocation(i) {
  const list = _getLocations();
  const active = localStorage.getItem('cp_api_url') || '';
  if (list[i] && list[i].url === active) localStorage.removeItem('cp_api_url');
  list.splice(i, 1);
  _saveLocations(list);
  _renderLocList();
}

function addLocation() {
  const name = document.getElementById('loc-name-input').value.trim();
  const url  = document.getElementById('loc-url-input').value.trim().replace(/\/$/, '');
  if (!name) { alert('Entrez un nom pour ce restaurant.'); return; }
  if (!url)  { alert('Entrez l\'URL du tunnel Cloudflare.'); return; }
  const list = _getLocations();
  if (list.some(l => l.url === url)) { alert('Cette URL est déjà enregistrée.'); return; }
  list.push({ name, url });
  _saveLocations(list);
  document.getElementById('loc-name-input').value = '';
  document.getElementById('loc-url-input').value  = '';
  document.getElementById('loc-test-result').textContent = '';
  _renderLocList();
}

async function testLocationUrl() {
  const input  = document.getElementById('loc-url-input');
  const result = document.getElementById('loc-test-result');
  const url    = (input.value.trim().replace(/\/$/, '') || 'http://127.0.0.1:3721') + '/api/menu-items';
  result.textContent = 'Test en cours…';
  result.style.color = '#666';
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, { signal: ctrl.signal });
    if (r.ok) {
      result.textContent = '✓ Connexion réussie';
      result.style.color = '#1b5e20';
    } else {
      result.textContent = `✗ Erreur ${r.status}`;
      result.style.color = '#c62828';
    }
  } catch {
    result.textContent = '✗ Impossible de se connecter';
    result.style.color = '#c62828';
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
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Caméra non disponible sur ce navigateur.');
    return;
  }
  try {
    _scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
    });
  } catch (e) {
    alert('Accès caméra refusé : ' + e.message);
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
      // Direct tunnel URL — auto-save with hostname as name and connect immediately
      stopQRScan();
      const tunnelUrl = u.origin;
      const autoName  = u.hostname;
      const list = _getLocations();
      if (!list.some(l => l.url === tunnelUrl)) {
        list.push({ name: autoName, url: tunnelUrl });
        _saveLocations(list);
      }
      localStorage.setItem('cp_api_url', tunnelUrl);
      closeLocationModal();
      loadData();
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
