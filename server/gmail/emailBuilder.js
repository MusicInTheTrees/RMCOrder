const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

function groupByCategory(lineItems) {
  const groups = {};
  for (const item of lineItems) {
    const cat = item.apparelType || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  return groups;
}

function sizeBreakdown(item) {
  return SIZES
    .filter(s => (item.sizes?.[s]?.total ?? 0) > 0)
    .map(s => {
      const total  = item.sizes[s].total;
      const inv    = item.sizes[s].inventory ?? 0;
      const toOrder = total - inv;
      if (inv > 0 && toOrder > 0) return `${s}: ${total} (${inv} from stock, order ${toOrder})`;
      if (inv === total)           return `${s}: ${total} (all from stock)`;
      return `${s}: ${total}`;
    })
    .join(', ');
}

function buildEmailHtml(orderData, _settings) {
  const groups = groupByCategory(orderData.lineItems || []);
  const title = orderData.orderName
    ? `RMC Order: ${orderData.orderName} (${orderData.orderId})`
    : `${orderData.orderId} — Order Request`;

  let html = `<h2>${title}</h2>`;

  for (const [category, items] of Object.entries(groups)) {
    html += `<h3>${category}</h3><table border="1" cellpadding="6" cellspacing="0">`;
    html += '<tr><th>#</th><th>Color</th><th>Sizes</th><th>Front Designs</th><th>Front Notes</th><th>Back Designs</th><th>Back Notes</th></tr>';
    for (const item of items) {
      const frontList = (item.frontDesigns || []).map(d => d.file).join('<br>') || '—';
      const backList  = (item.backDesigns  || []).map(d => d.file).join('<br>') || '—';
      html += `<tr>
        <td>${item.num}</td>
        <td>${item.color || '—'}</td>
        <td>${sizeBreakdown(item)}</td>
        <td>${frontList}</td>
        <td>${item.frontNotes || ''}</td>
        <td>${backList}</td>
        <td>${item.backNotes || ''}</td>
      </tr>`;
    }
    html += '</table>';
  }

  html += `<p>📁 Design files: see order folder in Google Drive (Order ID: ${orderData.orderId})</p>`;
  return html;
}

function buildEmailPlainText(orderData, _settings) {
  const groups = groupByCategory(orderData.lineItems || []);
  const title = orderData.orderName
    ? `RMC Order: ${orderData.orderName} (${orderData.orderId})`
    : `${orderData.orderId} — Order Request`;
  let text = `${title}\n\n`;

  for (const [category, items] of Object.entries(groups)) {
    text += `${category}\n${'—'.repeat(category.length)}\n`;
    for (const item of items) {
      text += `• #${item.num} | ${item.color || ''} | ${sizeBreakdown(item)}\n`;
      const frontList = (item.frontDesigns || []).map(d => `  ${d.file}`).join('\n');
      if (frontList) text += `  Front:\n${frontList}\n`;
      if (item.frontNotes) text += `  Front notes: ${item.frontNotes}\n`;
      const backList = (item.backDesigns || []).map(d => `  ${d.file}`).join('\n');
      if (backList) text += `  Back:\n${backList}\n`;
      if (item.backNotes) text += `  Back notes: ${item.backNotes}\n`;
    }
    text += '\n';
  }
  text += `Design files: Order folder in Google Drive (${orderData.orderId})\n`;
  return text;
}

module.exports = { buildEmailHtml, buildEmailPlainText };
