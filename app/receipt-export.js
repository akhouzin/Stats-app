// ═══════════════════════════════════════
// RECEIPT EXPORT — renders an "Articles vendus" list inside an <iframe>
// styled to match the POS's own printed reports (legacy/app/reports.js's
// printed "Articles vendus" section — .receipt-page/.r-item-row/.r-total-row
// etc., legacy/styles/pos.css), each with a Print button (native iframe
// print) and a Share button.
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
// document — it does NOT inherit stats.css), so this file needs no CSS
// changes elsewhere; .receipt-toolbar/.receipt-btn/.receipt-frame (the
// parent-page chrome around the iframe) live in stats.css instead.
// ═══════════════════════════════════════

const _RECEIPT_IFRAME_STYLE = `
  * { box-sizing: border-box; }
  body { margin:0; padding:14px 16px; background:#fff; font-family:'Courier New',Courier,monospace; color:#000; }
  .r-logo-wrap { text-align:center; margin-bottom:6px; }
  .r-logo-wrap img { max-width:120px; max-height:48px; object-fit:contain; }
  .r-brand { font-family:'Cinzel Decorative','Cinzel',serif; font-size:17px; font-weight:700; letter-spacing:4px; text-align:center; color:#000; display:block; margin:2px 0; }
  .r-divider { border:none; border-top:1px dashed #333; margin:8px 0; }
  .r-divider-solid { border:none; border-top:2px solid #000; margin:8px 0; }
  .r-meta { font-size:10px; color:#000; text-align:center; margin:2px 0; font-weight:bold; }
  .r-section-title { font-size:11px; letter-spacing:2px; text-transform:uppercase; font-weight:900; text-align:center; margin:4px 0; color:#000; }
  .r-item-row { display:flex; justify-content:space-between; align-items:baseline; gap:6px; font-size:12px; font-weight:bold; margin:4px 0; color:#000; }
  .r-item-name { flex:1; min-width:0; }
  .r-item-qty { flex-shrink:0; font-size:11px; }
  .r-item-price { flex-shrink:0; font-weight:900; text-align:right; }
  .r-total-row { display:flex; justify-content:space-between; font-size:15px; font-weight:900; color:#000; margin:6px 0; }
  .r-thank { font-size:11px; text-align:center; color:#000; font-weight:bold; margin:6px 0; }
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
    try { iframe.style.height = (iframe.contentDocument.body.scrollHeight + 4) + 'px'; } catch (e) {}
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
