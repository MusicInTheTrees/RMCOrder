// src/utils/buildOrderPreviewText.js
import { compileLineItems } from './compileLineItems';

function formatSizes(sizes) {
  return Object.entries(sizes || {})
    .filter(([, v]) => (v?.total ?? 0) > 0)
    .map(([label, v]) => {
      const total = v.total, inv = v.inventory ?? 0, toOrder = total - inv;
      if (inv > 0 && toOrder > 0) return `${label}: ${total} (${inv} from stock, order ${toOrder})`;
      if (inv === total && total > 0) return `${label}: ${total} (all from stock)`;
      return `${label}: ${total}`;
    })
    .join(', ');
}

const isBlank = i => (i.frontDesigns || []).length === 0 && (i.backDesigns || []).length === 0;

export function buildOrderPreviewText(order) {
  const allItems = order.lineItems || [];
  const printItems = compileLineItems(allItems.filter(i => !isBlank(i)));
  const blankItems = compileLineItems(allItems.filter(isBlank));
  const title = order.orderName
    ? `RMC Order: ${order.orderName} (${order.orderId})`
    : `${order.orderId} — Order Request`;
  let text = `${title}\n\n`;
  if (order.notes) text += `Order Notes: ${order.notes}\n\n`;

  const groups = {};
  for (const item of printItems) {
    const cat = item.itemTypeName || item.apparelType || 'Other';
    (groups[cat] = groups[cat] || []).push(item);
  }
  for (const [category, items] of Object.entries(groups)) {
    text += `${category}\n${'—'.repeat(category.length)}\n`;
    for (const item of items) {
      text += `• #${item.nums.join(', ')} | ${item.color || ''} | ${formatSizes(item.sizes)}\n`;
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
      text += `• #${item.nums.join(', ')} | ${item.itemTypeName || item.apparelType || ''} | ${item.color || ''} | ${formatSizes(item.sizes)}\n`;
    }
    text += '\n';
  }
  if (order.folderId) text += `Order folder (design files):\nhttps://drive.google.com/drive/folders/${order.folderId}\n`;
  if (order.sheetId) text += `Order sheet:\nhttps://docs.google.com/spreadsheets/d/${order.sheetId}\n`;
  return text;
}
