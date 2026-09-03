// ═══════════════════════════════════════
// RECEIPT EXPORT — renders a list inside an <iframe> styled like the ticket
// the POS itself prints/sends to Telegram, full width of its container, no
// card styling of its own. Two consumers share this module:
//   - renderReceiptIframe()            — flat name/×qty/price rows
//     (page-today.js's daily "Articles Vendus", page-daily.js's monthly
//     "Articles vendus — ce mois", page-marchandise.js's monthly
//     "Achats du mois").
//   - renderMarchandiseReceiptIframe() — category-grouped rows with a qty
//     badge + unit price + per-category subtotal, matching
//     legacy/app/marchandise.js:printMarchandiseDuJour() row for row
//     (page-marchandise.js's daily view).
// Print/Share are small circular icon buttons (inline SVG, not emoji)
// overlaid on the ticket, hidden until the ticket itself is tapped
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
// Each iframe gets its own embedded <style>/<link> (srcdoc creates a fully
// separate document — it does NOT inherit stats.css or index.html's own
// font <link>), so only the outer chrome (.receipt-shell/
// .receipt-tap-overlay/.receipt-toolbar-mini/.receipt-icon-btn/
// .receipt-frame) lives in stats.css.
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
  /* @page controls the PRINTED page's own margin — browsers otherwise apply
     their own default (often ~12.7mm), which body padding alone can't
     override for contentWindow.print(). Kept modest so the ticket still
     reads as "full width", not stretched to a full A4/Letter sheet. */
  @page { margin: 6mm; }
  body { padding:10px 14px 4px; background:#fff; font-family:'Courier New',Courier,monospace; color:#000; }
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

// Common <head> bits every receipt document needs: charset, the real POS
// ticket fonts (see the top-of-file note — an iframe's srcdoc document is
// fully separate from the parent page and does NOT inherit its <link>
// tags), and a given <style> block.
function _recHead(styleCss) {
  return `<meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cinzel+Decorative:wght@400;700;900&display=swap" rel="stylesheet">
    <style>${styleCss}</style>`;
}

// Business name/logo — read live off the topbar (branding.js keeps these in
// sync with the connected POS), shared by every receipt variant below.
function _recBizIdentity() {
  const nameEl = document.getElementById('topbar-biz-name');
  const logoEl = document.getElementById('topbar-biz-logo');
  return {
    bizName: (nameEl && nameEl.textContent) || 'ERPGEN',
    logoSrc: logoEl && logoEl.src && logoEl.style.display !== 'none' ? logoEl.src : '',
  };
}

function _recPrintedAt() {
  const now = new Date();
  return now.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + now.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });
}

// rows: [{name, qty, amount}] — amount already fmtMoney()-formatted.
function _recBuildDoc(sectionTitle, periodLabel, rows, totalLabel, totalValue) {
  const { bizName, logoSrc } = _recBizIdentity();

  const itemsHtml = rows.length ? rows.map(r => `
    <div class="r-item-row">
      <span class="r-item-name">${r.name}</span>
      <span class="r-item-qty">×${r.qty}</span>
      <span class="r-item-price">${r.amount} Dhs</span>
    </div>`).join('') : '<div class="r-meta">Aucun article</div>';

  return `<!doctype html><html><head>${_recHead(_RECEIPT_IFRAME_STYLE)}</head><body>
    <div class="receipt-page">
      ${logoSrc ? `<div class="r-logo-wrap"><img src="${logoSrc}"></div>` : ''}
      <div class="r-brand">${bizName.toUpperCase()}</div>
      <hr class="r-divider-solid">
      <div class="r-section-title">${sectionTitle}</div>
      <div class="r-meta">${periodLabel}</div>
      <div class="r-meta">Imprimé le ${_recPrintedAt()}</div>
      <hr class="r-divider-solid">
      ${itemsHtml}
      <hr class="r-divider-solid">
      <div class="r-total-row"><span>${totalLabel}</span><span>${totalValue} Dhs</span></div>
      <div class="r-thank">— ERPGEN Stats —</div>
    </div>
  </body></html>`;
}

// Fills the iframe with a given HTML document and keeps its height
// continuously synced to the rendered content — an iframe has no natural
// height of its own otherwise. A single onload-time measurement isn't
// enough: the business logo (an <img> with no intrinsic size reserved) can
// still be loading when onload fires, so a one-shot scrollHeight read can
// under-measure and leave stale blank space once the image lands. A
// ResizeObserver on the iframe's own body reacts to that (and any other)
// later layout change instead of guessing at timing.
function _recFillIframe(iframe, htmlDoc) {
  if (!iframe) return;
  iframe.onload = () => {
    try {
      const body = iframe.contentDocument.body;
      const sync = () => { iframe.style.height = body.scrollHeight + 'px'; };
      sync();
      if (iframe._recHeightObserver) iframe._recHeightObserver.disconnect();
      const ro = new ResizeObserver(sync);
      ro.observe(body);
      iframe._recHeightObserver = ro;
    } catch (e) {}
  };
  iframe.srcdoc = htmlDoc;
}

function renderReceiptIframe(iframeId, sectionTitle, periodLabel, rows, totalLabel, totalValue) {
  _recFillIframe(document.getElementById(iframeId), _recBuildDoc(sectionTitle, periodLabel, rows, totalLabel, totalValue));
}

// ── Marchandise variant — category-grouped rows with a qty badge + unit
//    price (name / ×qty / × unit-price / line-total) plus a per-category
//    subtotal, matching legacy/app/marchandise.js:printMarchandiseDuJour()
//    row for row (same classes, same 5-column grid, same inline badge
//    sizing) — the real printed Marchandise ticket, not an approximation.
const _RECEIPT_MARCH_EXTRA_STYLE = `
  .rp-marchandise-table .r-item-row.r-item-detailed {
    display:grid; grid-template-columns:30px 1fr 44px 1fr 82px; column-gap:5px;
    align-items:center; margin:4px 0;
  }
  .rp-marchandise-table .r-item-qtybadge {
    display:block; width:30px; min-width:30px; line-height:20px; text-align:center; padding:0;
    background:#000; color:#fff; font-size:11px; font-weight:900; border-radius:5px;
  }
  /* white-space/text-overflow reset — the base .r-item-name (for the flat
     Articles Vendus row shape) truncates with an ellipsis on one line;
     legacy/styles/pos.css's real marchandise ticket instead wraps a long
     name onto a second line (overflow-wrap:break-word), which needs
     white-space:normal to actually take effect here. */
  .rp-marchandise-table .r-item-name { font-size:11px; min-width:0; white-space:normal; overflow:visible; text-overflow:clip; overflow-wrap:break-word; color:#000; font-weight:bold; }
  .rp-marchandise-table .r-item-variant { font-weight:normal; font-style:italic; font-size:10px; }
  .rp-marchandise-table .r-item-unitprice { grid-column:3; min-width:0; text-align:center; font-size:10px; font-weight:600; color:#555; }
  .rp-marchandise-table .r-item-price { grid-column:5; min-width:0; text-align:right; font-weight:900; color:#000; }
  .rp-marchandise-table .marc-tot-mod { color:#c98a1c; font-weight:700; font-style:normal; }
  .r-subtotal-row { display:flex; justify-content:space-between; font-size:11px; color:#000; font-weight:bold; margin:2px 0 8px; }
`;

// sections: [{ catLabel, catTotal (formatted), rows: [{name, variant, qty, unitPrice (formatted), lineTotal (formatted), mod}] }]
function _recBuildMarchandiseDoc(periodLabel, sections, grandTotal, anyMod) {
  const { bizName, logoSrc } = _recBizIdentity();

  const sectionsHtml = sections.length ? sections.map(sec => `
      <div class="r-section-title">— ${sec.catLabel} —</div>
      ${sec.rows.map(r => `
        <div class="r-item-row r-item-detailed">
          <span class="r-item-qtybadge">${r.qty}</span>
          <span class="r-item-name">${r.name}${r.variant ? ` <span class="r-item-variant">(${r.variant})</span>` : ''}</span>
          <span class="r-item-unitprice${r.mod ? ' marc-tot-mod' : ''}">× ${r.unitPrice}</span>
          <span class="r-item-price">${r.lineTotal} Dhs</span>
        </div>`).join('')}
      <div class="r-subtotal-row"><span>Sous total ${sec.catLabel}</span><span>${sec.catTotal} Dhs</span></div>
    `).join('') : '<div class="r-meta">Aucun achat</div>';

  return `<!doctype html><html><head>${_recHead(_RECEIPT_IFRAME_STYLE + _RECEIPT_MARCH_EXTRA_STYLE)}</head><body>
    <div class="receipt-page">
      ${logoSrc ? `<div class="r-logo-wrap"><img src="${logoSrc}"></div>` : ''}
      <div class="r-brand">${bizName.toUpperCase()}</div>
      <hr class="r-divider-solid">
      <div class="r-section-title" style="font-size:13px;margin:8px 0 4px;font-weight:900;">ACHATS MARCHANDISE</div>
      <div class="r-meta">${periodLabel}</div>
      <div class="r-meta">Imprimé le ${_recPrintedAt()}</div>
      <hr class="r-divider">
      <div class="rp-marchandise-table">
        ${sectionsHtml}
      </div>
      <hr class="r-divider-solid">
      <div class="r-total-row"><span>TOTAL GÉNÉRAL</span><span>${grandTotal} Dhs</span></div>
      ${anyMod ? '<div class="r-meta" style="font-size:9px;font-style:italic;font-weight:normal;">* prix du jour, différent du prix catalogue habituel</div>' : ''}
      <div class="r-thank">— ERPGEN Stats —</div>
    </div>
  </body></html>`;
}

function renderMarchandiseReceiptIframe(iframeId, periodLabel, sections, grandTotal, anyMod) {
  _recFillIframe(document.getElementById(iframeId), _recBuildMarchandiseDoc(periodLabel, sections, grandTotal, anyMod));
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
  // Capture <body>, not .receipt-page — the side/top margin around the
  // ticket is body's own padding; .receipt-page has none of its own, so
  // screenshotting it directly always came out edge-to-edge no matter what
  // body's padding was set to, unlike the on-screen iframe (which shows
  // body+page together) and the printed page (which prints the whole
  // document, body padding included).
  const target = iframe.contentDocument.body;
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
