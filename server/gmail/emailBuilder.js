function formatSizes(sizes) {
  return Object.entries(sizes || {})
    .filter(([, v]) => (v?.total ?? 0) > 0)
    .map(([label, v]) => {
      const total   = v.total;
      const inv     = v.inventory ?? 0;
      const toOrder = total - inv;
      if (inv > 0 && toOrder > 0) return `${label}: ${total} (${inv} from stock, order ${toOrder})`;
      if (inv === total)           return `${label}: ${total} (all from stock)`;
      return `${label}: ${total}`;
    })
    .join(', ');
}

function isBlank(item) {
  return (item.frontDesigns || []).length === 0 && (item.backDesigns || []).length === 0;
}

function groupByCategory(lineItems) {
  const groups = {};
  for (const item of lineItems) {
    const cat = item.itemTypeName || item.apparelType || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  return groups;
}

function buildEmailHtml(orderData, _settings, catalogByName = {}) {
  const allItems = orderData.lineItems || [];
  const groups = groupByCategory(allItems.filter(i => !isBlank(i)));
  const blankItems = allItems.filter(isBlank);
  const title = orderData.orderName
    ? `RMC Order: ${orderData.orderName} (${orderData.orderId})`
    : `${orderData.orderId} — Order Request`;

  let html = `<h2>${title}</h2>`;

  if (orderData.notes) {
    html += `<p><strong>Order Notes:</strong> ${orderData.notes}</p>`;
  }

  for (const [category, items] of Object.entries(groups)) {
    html += `<h3>${category}</h3>`;
    const catalogItem = catalogByName[(category || '').toLowerCase()];
    if (catalogItem?.publicNotes) {
      html += `<p><em>${catalogItem.publicNotes}</em></p>`;
    }
    html += '<table border="1" cellpadding="6" cellspacing="0">';
    html += '<tr><th>#</th><th>Color</th><th>Sizes</th><th>Front Method</th><th>Front Designs</th><th>Front Notes</th><th>Back Method</th><th>Back Designs</th><th>Back Notes</th></tr>';
    for (const item of items) {
      const frontList = (item.frontDesigns || []).map(d => d.file).join('<br>') || '—';
      const backList  = (item.backDesigns  || []).map(d => d.file).join('<br>') || '—';
      html += `<tr>
        <td>${item.num}</td>
        <td>${item.color || '—'}</td>
        <td>${formatSizes(item.sizes)}</td>
        <td>${item.frontMethod || '—'}</td>
        <td>${frontList}</td>
        <td>${item.frontNotes || ''}</td>
        <td>${item.backMethod || '—'}</td>
        <td>${backList}</td>
        <td>${item.backNotes || ''}</td>
      </tr>`;
    }
    html += '</table>';
  }

  if (blankItems.length > 0) {
    html += `<h3>Blank Items (no decoration)</h3>`;
    html += '<table border="1" cellpadding="6" cellspacing="0">';
    html += '<tr><th>#</th><th>Item Type</th><th>Color</th><th>Sizes</th></tr>';
    for (const item of blankItems) {
      html += `<tr>
        <td>${item.num}</td>
        <td>${item.itemTypeName || item.apparelType || '—'}</td>
        <td>${item.color || '—'}</td>
        <td>${formatSizes(item.sizes)}</td>
      </tr>`;
    }
    html += '</table>';
  }

  html += `<p>📁 Design files: see order folder in Google Drive (Order ID: ${orderData.orderId})</p>`;
  return html;
}

function buildEmailPlainText(orderData, _settings, catalogByName = {}) {
  const allItems = orderData.lineItems || [];
  const groups = groupByCategory(allItems.filter(i => !isBlank(i)));
  const blankItems = allItems.filter(isBlank);
  const title = orderData.orderName
    ? `RMC Order: ${orderData.orderName} (${orderData.orderId})`
    : `${orderData.orderId} — Order Request`;
  let text = `${title}\n\n`;

  if (orderData.notes) text += `Order Notes: ${orderData.notes}\n\n`;

  for (const [category, items] of Object.entries(groups)) {
    text += `${category}\n${'—'.repeat(category.length)}\n`;
    const catalogItem = catalogByName[(category || '').toLowerCase()];
    if (catalogItem?.publicNotes) text += `Note: ${catalogItem.publicNotes}\n`;
    for (const item of items) {
      text += `• #${item.num} | ${item.color || ''} | ${formatSizes(item.sizes)}\n`;
      const frontList = (item.frontDesigns || []).map(d => `  ${d.file}`).join('\n');
      if (item.frontMethod) text += `  Front method: ${item.frontMethod}\n`;
      if (frontList) text += `  Front:\n${frontList}\n`;
      if (item.frontNotes) text += `  Front notes: ${item.frontNotes}\n`;
      const backList = (item.backDesigns || []).map(d => `  ${d.file}`).join('\n');
      if (item.backMethod) text += `  Back method: ${item.backMethod}\n`;
      if (backList) text += `  Back:\n${backList}\n`;
      if (item.backNotes) text += `  Back notes: ${item.backNotes}\n`;
    }
    text += '\n';
  }
  if (blankItems.length > 0) {
    text += `Blank Items (no decoration)\n${'—'.repeat(26)}\n`;
    for (const item of blankItems) {
      text += `• #${item.num} | ${item.itemTypeName || item.apparelType || ''} | ${item.color || ''} | ${formatSizes(item.sizes)}\n`;
    }
    text += '\n';
  }

  text += `Design files: Order folder in Google Drive (${orderData.orderId})\n`;
  return text;
}

module.exports = { buildEmailHtml, buildEmailPlainText };
