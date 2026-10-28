// ═══════════════════════════════════════
// STORE SWITCHER — quick bottom sheet for jumping between saved restaurants.
//
// Opened from the topbar avatar chip and (with 2+ restaurants) the topbar
// business name — see location-picker.js:_renderSwitcherChip(). One tap on a
// row switches; each row shows that restaurant's live status / today's
// totals from store-cache.js. Adding, renaming, sharing and removing stay in
// location-picker.js's "Mes restaurants" modal, reached from the footer —
// switching is the frequent action, so it no longer has to go through the
// management screen.
// ═══════════════════════════════════════

function _storeSheetEl() {
  let el = document.getElementById('store-sheet');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'store-sheet';
  el.className = 'store-sheet';
  el.innerHTML = `
    <div class="store-sheet-backdrop" onclick="closeStoreSheet()"></div>
    <div class="store-sheet-panel" role="dialog" aria-label="Changer de restaurant">
      <div class="store-sheet-grip"></div>
      <div class="store-sheet-title">Mes restaurants</div>
      <div id="store-sheet-list" class="store-sheet-list"></div>
      <div class="store-sheet-foot">
        <button class="store-sheet-btn" onclick="openLocationModal({ add: true })">+ Ajouter</button>
        <button class="store-sheet-btn" onclick="openLocationModal()">⚙ Gérer</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  return el;
}

function _renderStoreSheet() {
  const listEl = document.getElementById('store-sheet-list');
  if (!listEl) return;
  const active = getApiBase();
  listEl.innerHTML = _getLocations().map((loc, i) => {
    const isActive = loc.url === active;
    return `
      <button class="store-row${isActive ? ' store-row-active' : ''}" onclick="_pickStoreFromSheet(${i})">
        ${_locAvatarHtml(loc)}
        <span class="store-row-info">
          <span class="store-row-name">${_escHtml(loc.name)}</span>
          <span class="store-row-status">${_locStatusHtml(loc)}</span>
        </span>
        <span class="store-row-mark">${isActive ? '✓' : '›'}</span>
      </button>`;
  }).join('');
}

function _renderStoreSheetIfOpen() {
  const el = document.getElementById('store-sheet');
  if (el && el.classList.contains('store-sheet-open')) _renderStoreSheet();
}

function openStoreSheet() {
  const el = _storeSheetEl();
  _renderStoreSheet();
  // Fill in any restaurant whose status isn't known yet (or failed a while ago).
  _prefetchOtherStores();
  requestAnimationFrame(() => el.classList.add('store-sheet-open'));
}

function closeStoreSheet() {
  const el = document.getElementById('store-sheet');
  if (el) el.classList.remove('store-sheet-open');
}

function _pickStoreFromSheet(i) {
  const loc = _getLocations()[i];
  closeStoreSheet();
  if (!loc) return;
  if (loc.url === getApiBase() && historyLoaded) return; // already showing it
  connectLocation(i);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeStoreSheet(); });
