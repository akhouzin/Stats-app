// ═══════════════════════════════════════
// RECEIPT EXPORT — renders an "Articles vendus" list inside an <iframe>
// styled like the ticket the POS itself prints/sends to Telegram. Sits in a
// thin, sharp-edged black frame (.receipt-shell, in stats.css) — narrower
// than the surrounding card, like a photo thumbnail, not stretched full
// width. Print/Share are small circular icon buttons (inline SVG, not
// emoji) overlaid on the ticket, hidden until the ticket itself is tapped
// (toggleReceiptControls() below) — a lightbox/photo-viewer convention,
// deliberately not styled like this page's other (large, labeled) buttons.
//
// Share uses html2canvas (same library legacy/app/telegram.js uses to
// screenshot a receipt before posting it) to turn the iframe's receipt into
// an image, then hands it to the Web Share API so the user picks where it
// goes (Telegram, WhatsApp, etc. — whatever the OS share sheet offers).
// Stats is a public GitHub Pages site with no bot credentials of its own,
// so unlike the POS it can't auto-post to a specific Telegram chat; the
// user stays in the loop as the one choosing the destination. Falls back to
// downloading the PNG when the browser has no file-capable Web Share.
//
// The iframe gets its own embedded <style> (srcdoc creates a fully separate
// document — it does NOT inherit stats.css), so only the outer chrome
// (.receipt-shell/.receipt-tap-overlay/.receipt-toolbar-mini/
// .receipt-icon-btn/.receipt-frame) lives in stats.css.
// ═══════════════════════════════════════

// Tap-to-reveal — the ticket itself has no interactive content, so a
// full-size overlay (see .receipt-tap-overlay in stats.css) captures the
// tap in the PARENT document (a click inside the iframe's own document
// wouldn't bubble out to here) and toggles the toolbar's visibility.
function toggleReceiptControls(shellId) {
  const shell = document.getElementById(shellId);
  if (shell) shell.classList.toggle('controls-visible');
}

const _RECEIPT_IFRAME_STYLE = `
  * { box-sizing: border-box; }
  html, body { margin:0; }
  body { padding:10px 0 2px; background:#fff; font-family:'Courier New',Courier,monospace; color:#000; }
  .r-logo-wrap { text-align:center; margin-bottom:6px; }
  .r-logo-wrap img { max-width:120px; max-height:48px; object-fit:contain; }
  .r-brand { font-family:'Cinzel Decorative','Cinzel',serif; font-size:17px; font-weight:700; letter-spacing:4px; text-align:center; color:#000; display:block; margin:2px 0; }
  .r-divider { border:none; border-top:1px dashed #333; margin:8px 0; }
  .r-divider-solid { border:none; border-top:2px solid #000; margin:8px 0; }
  .r-meta { font-size:10px; color:#000; text-align:center; margin:2px 0; font-weight:bold; }
  .r-section-title { font-size:11px; letter-spacing:2px; text-transform:uppercase; font-weight:900; text-align:center; margin:4px 0; color:#000; }
  /* A flex row with a flex:1 name column leaves the qty hugging the price on
     the right, not sitting in the visual middle of the row — a fixed-track
     CSS Grid (name | qty | price, qty's own middle track) is what actually
     centers it regardless of name length. Same convention as Stats' own
     .ticket-item-row elsewhere in stats.css. */
  .r-item-row { display:grid; grid-template-columns:1fr 44px 1fr; align-items:baseline; gap:6px; margin:4px 0; font-size:12px; font-weight:bold; color:#000; }
  .r-item-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#000; font-weight:bold; }
  .r-item-qty { text-align:center; font-size:11px; color:#000; font-weight:bold; }
  .r-item-price { text-align:right; font-weight:900; color:#000; }
  .r-total-row { display:flex; justify-content:space-between; font-size:15px; font-weight:900; color:#000; margin:6px 0; }
  .r-thank { font-size:11px; text-align:center; color:#000; font-weight:bold; margin:6px 0 0; }
`;

// rows: [{name, qty, amount}] — amount already fmtMoney()-formatted.
function _recBuildDoc(sectionTitle, periodLabel, rows, totalLabel, totalValue) {
  const nameEl = document.getElementById('topbar-biz-name');
  const logoEl = document.getElementById('topbar-biz-logo');
  const bizName = (nameEl && nameEl.textContent) || 'ERPGEN';
  const logoVisible = !!(logoEl && logoEl.src && logoEl.style.display !== 'none');
  const now = new Date();
  const printedAt = now.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + now.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });

  const itemsHtml = rows.length ? rows.map(r => `
    <div class="r-item-row">
      <span class="r-item-name">${r.name}</span>
      <span class="r-item-qty">×${r.qty}</span>
      <span class="r-item-price">${r.amount} Dhs</span>
    </div>`).join('') : '<div class="r-meta">Aucun article</div>';

  return `<!doctype html><html><head><meta charset="utf-8"><style>${_RECEIPT_IFRAME_STYLE}</style></head><body>
    <div class="receipt-page">
      ${logoVisible ? `<div class="r-logo-wrap"><img src="${logoEl.src}"></div>` : ''}
      <div class="r-brand">${bizName.toUpperCase()}</div>
      <hr class="r-divider-solid">
      <div class="r-section-title">${sectionTitle}</div>
      <div class="r-meta">${periodLabel}</div>
      <div class="r-meta">Imprimé le ${printedAt}</div>
      <hr class="r-divider-solid">
      ${itemsHtml}
      <hr class="r-divider-solid">
      <div class="r-total-row"><span>${totalLabel}</span><span>${totalValue} Dhs</span></div>
      <div class="r-thank">— ERPGEN Stats —</div>
    </div>
  </body></html>`;
}

// Fills the iframe and auto-sizes its height to the rendered content — an
// iframe has no natural height of its own otherwise.
function renderReceiptIframe(iframeId, sectionTitle, periodLabel, rows, totalLabel, totalValue) {
  const iframe = document.getElementById(iframeId);
  if (!iframe) return;
  iframe.onload = () => {
    try { iframe.style.height = iframe.contentDocument.body.scrollHeight + 'px'; } catch (e) {}
  };
  iframe.srcdoc = _recBuildDoc(sectionTitle, periodLabel, rows, totalLabel, totalValue);
}

function printReceiptIframe(iframeId) {
  const iframe = document.getElementById(iframeId);
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
}

async function shareReceiptIframe(iframeId, fileName) {
  const iframe = document.getElementById(iframeId);
  if (!iframe || !iframe.contentDocument || typeof html2canvas === 'undefined') return;
  const target = iframe.contentDocument.querySelector('.receipt-page');
  if (!target) return;
  const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff' });
  canvas.toBlob(async blob => {
    if (!blob) return;
    const file = new File([blob], (fileName || 'articles-vendus') + '.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    // No file-capable Web Share on this browser (most desktop browsers) —
    // download the PNG so the user can share it manually.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 'image/png');
}
