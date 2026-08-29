// ═══════════════════════════════════════
// PAGE NAV
// ═══════════════════════════════════════
const PAGE_COUNT = 5;
let currentPage = 0;

const slider = document.getElementById('pages-slider');
const pagesWrap = document.getElementById('pages-wrap');
const pageEls = Array.from(slider.children);

// Each .page is position:absolute (stats.css) so its natural content height
// no longer stretches to match its siblings' — previously all pages sat
// side by side as flex-row items, which (via flexbox's default cross-axis
// stretch) made every page as tall as the single tallest one, letting a
// user scroll a short page down into blank space reserved for a much
// taller sibling. Pin each page at its own horizontal slot up front...
pageEls.forEach((el, i) => { el.style.left = (i * 100) + 'vw'; });

// ...and keep #pages-wrap's own height in sync with whichever page is
// currently active via ResizeObserver, so ANY content change — a full
// showPage() navigation, a tab switch within a page (setRapportViewMode()),
// a form toggling open — is picked up automatically without every such call
// site needing to know about this mechanism. Re-pointed at the new active
// page on every showPage(); the observer itself never needs to change.
const _pageHeightObserver = new ResizeObserver(() => {
  const el = pageEls[currentPage];
  if (el) pagesWrap.style.height = el.scrollHeight + 'px';
});
function _watchActivePageHeight(idx) {
  const el = pageEls[idx];
  if (!el) return;
  pagesWrap.style.height = el.scrollHeight + 'px';
  _pageHeightObserver.disconnect();
  _pageHeightObserver.observe(el);
}
_watchActivePageHeight(0); // page-today is visible by default at boot — showPage(0) is never called

function showPage(idx) {
  currentPage = idx;
  _watchActivePageHeight(idx);

  // ── 1. Start slide immediately — nothing before this ──
  slider.style.transition = 'transform 0.32s cubic-bezier(0.4,0,0.2,1)';
  slider.style.transform  = `translateX(${-idx * window.innerWidth}px)`;

  // ── 2. UI chrome updates on next frame (doesn't block the slide) ──
  requestAnimationFrame(() => {
    document.querySelectorAll('.bnav-tab').forEach((t, i) => t.classList.toggle('active', i === idx));

    const bp = document.getElementById('sal-bp');
    if (idx === 2) { bp.classList.add('sal-bp-show'); document.body.classList.add('sal-bp-active'); }
    else { bp.classList.remove('sal-bp-show', 'sal-bp-open'); document.body.classList.remove('sal-bp-active'); salPanelOpen = false; }

    window.scrollTo(0, 0);
  });

  // ── 3. Render page content AFTER the slide animation finishes ──
  setTimeout(() => renderPage(idx), 330);
}

// Swipe gesture — live drag + snap
(function() {
  let startX = 0, startY = 0, dragging = false, dirLocked = false, isHorizontal = false;
  const wrap = document.getElementById('pages-wrap');

  function baseOffset() { return -currentPage * window.innerWidth; }

  // Returns true if el (or any ancestor up to wrap) can scroll horizontally
  function insideHScrollable(el) {
    while (el && el !== wrap) {
      if (el.scrollWidth > el.clientWidth + 2) return true;
      el = el.parentElement;
    }
    return false;
  }

  wrap.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    // Don't intercept gestures that start inside a horizontal scroll area
    if (insideHScrollable(e.target)) { dragging = false; return; }
    dragging = true;
    dirLocked = false;
    isHorizontal = false;
    slider.style.transition = 'none';
  }, { passive: true });

  wrap.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!dirLocked) {
      if (Math.abs(dx) > 16 || Math.abs(dy) > 16) {
        isHorizontal = Math.abs(dx) > Math.abs(dy) * 2.2;
        dirLocked = true;
      }
      return;
    }
    if (!isHorizontal) return;
    // rubber-band resistance at edges
    let offset = baseOffset() + dx;
    if ((currentPage === 0 && dx > 0) || (currentPage === PAGE_COUNT - 1 && dx < 0)) {
      offset = baseOffset() + dx * 0.2;
    }
    slider.style.transform = `translateX(${offset}px)`;
  }, { passive: true });

  function onEnd(e) {
    if (!dragging) return;
    dragging = false;
    if (!isHorizontal) return;
    const dx = (e.changedTouches ? e.changedTouches[0].clientX : startX) - startX;
    const threshold = window.innerWidth * 0.30;
    if (dx < -threshold && currentPage < PAGE_COUNT - 1) showPage(currentPage + 1);
    else if (dx > threshold && currentPage > 0) showPage(currentPage - 1);
    else showPage(currentPage);
  }

  wrap.addEventListener('touchend', onEnd, { passive: true });
  wrap.addEventListener('touchcancel', onEnd, { passive: true });
})();

// ── Instant nav tap: touchend fires immediately, preventDefault blocks the
//    300ms-delayed click so showPage is never called twice ──
document.querySelectorAll('.bnav-tab').forEach((btn, i) => {
  btn.addEventListener('touchend', e => {
    e.preventDefault();
    showPage(i);
  }, { passive: false });
});
