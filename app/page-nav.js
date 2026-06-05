// ═══════════════════════════════════════
// PAGE NAV
// ═══════════════════════════════════════
const PAGE_COUNT = 6;
let currentPage = 0;

const slider = document.getElementById('pages-slider');

function showPage(idx) {
  currentPage = idx;

  // ── 1. Start slide immediately — nothing before this ──
  slider.style.transition = 'transform 0.32s cubic-bezier(0.4,0,0.2,1)';
  slider.style.transform  = `translateX(${-idx * window.innerWidth}px)`;

  // ── 2. UI chrome updates on next frame (doesn't block the slide) ──
  requestAnimationFrame(() => {
    document.querySelectorAll('.bnav-tab').forEach((t, i) => t.classList.toggle('active', i === idx));

    const bp = document.getElementById('sal-bp');
    if (idx === 4) { bp.classList.add('sal-bp-show'); document.body.classList.add('sal-bp-active'); }
    else { bp.classList.remove('sal-bp-show', 'sal-bp-open'); document.body.classList.remove('sal-bp-active'); salPanelOpen = false; }

    const recBar = document.getElementById('rec-summary-bar');
    if (idx === 5) { recBar.style.display = 'block'; document.body.classList.add('rec-bar-active'); }
    else           { recBar.style.display = 'none';  document.body.classList.remove('rec-bar-active'); }

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
