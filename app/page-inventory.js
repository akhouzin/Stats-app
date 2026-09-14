// ═══════════════════════════════════════
// INVENTAIRE — consumption math shared by page-barista.js / page-daily.js
// Entrées = marc_achats (converted via conv_pkg/conv_pl), Vendu = orders
// whose items are linked (marc_links) to a Marchandise article. A "tracked"
// article is any _marcArticles row with at least one _marcLinks entry —
// there is no hardcoded consumable list; everything is driven by whatever
// the gérant links in the POS's Inventaire → Liens UI.
// ═══════════════════════════════════════

function toISODate(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fmtNum(n) { return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1); }
function _minvFmt(n) {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

function _minvTrackedArticles() {
  return _marcArticles.filter(a => _marcLinks.some(l => l.article_id === a.id));
}

function _minvStockIn(article, achats) {
  const convPkg = article.conv_pkg != null ? article.conv_pkg : 1;
  const convPl  = article.conv_pl  != null ? article.conv_pl  : 1;
  let total = 0;
  (achats || _marcAchats).forEach(a => {
    if (a.article_id !== article.id) return;
    total += (a.qty_pu || 0) + (a.qty_pkg || 0) * convPkg + (a.qty_pl || 0) * convPl;
  });
  return total;
}

function _minvStockOut(article, orders) {
  const ords = orders || allOrders || [];
  let total = 0;
  _marcLinks
    .filter(l => l.article_id === article.id)
    .forEach(link => {
      ords.forEach(o => {
        (o.items || []).forEach(item => {
          if (item.name === link.item_name) total += item.qty * (link.qty_per_sale || 0);
        });
      });
    });
  return total;
}
