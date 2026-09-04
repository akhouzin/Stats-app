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
// Each iframe gets its own embedded <style>, font included as a base64
// data: URI (srcdoc creates a fully separate document — it does NOT inherit
// stats.css or index.html's own font <link>, and a network fetch for the
// font from inside the iframe turned out to be unreliable for Print/Share
// specifically — see _CINZEL_DECORATIVE_700_BASE64 below), so only the
// outer chrome (.receipt-shell/.receipt-tap-overlay/.receipt-toolbar-mini/
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

// Cinzel Decorative (weight 700, Latin subset — the only face/weight the
// ticket actually uses) embedded as a base64 data: URI instead of a
// fonts.googleapis.com <link>. Two real, confirmed failure modes this
// closes: (1) html2canvas's canvas-tainting rules bar it from reading a
// cross-origin font file (fonts.gstatic.com) without useCORS, silently
// falling back even when document.fonts confirms the font is 'loaded';
// (2) some Android WebView print pipelines rasterize a PDF through a
// context that doesn't carry the same network/cross-origin access as the
// live page, dropping any externally-fetched font in the printed output
// even though the on-screen page renders it correctly. An inline data URI
// needs no network fetch in either path — the font bytes are already part
// of this very document. Source: fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700
// (latin subset only — this ticket's business names are French/Latin text).
const _CINZEL_DECORATIVE_700_BASE64 = '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';

const _RECEIPT_IFRAME_STYLE = `
  * { box-sizing: border-box; }
  @font-face {
    font-family: 'Cinzel Decorative';
    font-style: normal;
    font-weight: 700;
    src: url(data:font/woff2;base64,${_CINZEL_DECORATIVE_700_BASE64}) format('woff2');
  }
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

// Common <head> bits every receipt document needs: charset and a given
// <style> block (which embeds the real POS ticket font itself — see
// _CINZEL_DECORATIVE_700_BASE64 above; an iframe's srcdoc document is fully
// separate from the parent page, so a network <link> here would need its
// own fetch, and did, unreliably — this needs none).
function _recHead(styleCss) {
  return `<meta charset="utf-8">
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
  // _recLoadPromise resolves once THIS srcdoc has actually finished loading
  // (a real navigation — its <link rel=stylesheet> included, per the load
  // event's own spec) — printReceiptIframe()/shareReceiptIframe() await it
  // before touching contentDocument at all. Without this, a fast tap on the
  // (always-visible, not gated by iframe.onload) tap-to-reveal overlay could
  // fire Print/Share while contentDocument is still the previous — or even
  // the initial about:blank — document, in which case fonts.ready resolves
  // instantly with nothing queued to wait for, not because the font is
  // ready but because the real document hasn't started loading it yet.
  iframe._recLoadPromise = new Promise(resolve => {
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
      resolve();
    };
  });
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
  /* Qty badge stays on the LEFT, matching the real printed ticket's own
     layout (badge, then name, then unit price, then total) — a centered
     badge was tried and reverted per feedback; only the unit price sits in
     its own middle-ish track, badge and name share the row's left side. */
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

// Both Print and Share fire the instant the user taps the button, which —
// since the tap-to-reveal overlay is visible from the moment the page
// loads, not gated by the iframe's own load — can land before the iframe's
// srcdoc has even finished navigating, let alone before its Google Fonts
// <link> has downloaded. Three steps, in order, each closing a gap the
// previous one doesn't cover:
//   1. iframe._recLoadPromise — waits for the srcdoc's own load event (its
//      <link rel=stylesheet> included), so contentDocument is guaranteed to
//      be the real receipt document, not a stale/blank one. Skipping this
//      is why checking fonts.ready alone wasn't enough: on a document that
//      hasn't loaded yet, fonts.ready can resolve immediately with nothing
//      queued to wait for.
//   2. document.fonts.load(...) — explicitly requests the exact face the
//      ticket uses (rather than hoping layout already triggered the fetch),
//      and actually awaits the network fetch completing.
//   3. document.fonts.ready — final settle once queued loads resolve.
async function _recAwaitFonts(iframe) {
  if (iframe._recLoadPromise) { try { await iframe._recLoadPromise; } catch (e) {} }
  try {
    const fonts = iframe.contentDocument.fonts;
    await Promise.all([
      fonts.load('700 17px "Cinzel Decorative"'),
      fonts.load('900 11px "Cinzel Decorative"'),
    ]);
    await fonts.ready;
  } catch (e) {}
}

async function printReceiptIframe(iframeId) {
  const iframe = document.getElementById(iframeId);
  if (!iframe || !iframe.contentWindow) return;
  await _recAwaitFonts(iframe);
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
}

async function shareReceiptIframe(iframeId, fileName) {
  const iframe = document.getElementById(iframeId);
  if (!iframe || !iframe.contentDocument || typeof html2canvas === 'undefined') return;
  await _recAwaitFonts(iframe);
  // Capture <body>, not .receipt-page — the side/top margin around the
  // ticket is body's own padding; .receipt-page has none of its own, so
  // screenshotting it directly always came out edge-to-edge no matter what
  // body's padding was set to, unlike the on-screen iframe (which shows
  // body+page together) and the printed page (which prints the whole
  // document, body padding included).
  const target = iframe.contentDocument.body;
  if (!target) return;
  // useCORS/allowTaint — the Cinzel Decorative/Cinzel font FILES load from
  // fonts.gstatic.com, cross-origin relative to this iframe (the srcdoc
  // stylesheet only points there, it isn't same-origin with it). Without
  // these, html2canvas's canvas-based renderer is barred by the browser's
  // canvas-tainting security rules from reading that cross-origin font data
  // at all and silently falls back to a default font — even though
  // document.fonts confirms it's fully loaded and the native on-screen
  // renderer (not subject to canvas tainting) already displays it
  // correctly. This is exactly why the on-screen ticket looked right while
  // the captured/shared image didn't. Same two options
  // legacy/app/telegram.js's own (already working) html2canvas call uses
  // for this exact reason.
  const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true, allowTaint: true });
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
