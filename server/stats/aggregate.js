const COUNTED_STATES = ['sent', 'pending', 'paid', 'fulfilled', 'received'];

function buildCatalogIndex(catalog) {
  const byId = new Map();
  const byName = new Map();
  for (const item of (catalog && catalog.items) || []) {
    if (item.id) byId.set(item.id, item);
    if (item.name) byName.set(item.name.toLowerCase(), item);
  }
  return { byId, byName };
}

function isShirt(lineItem, index) {
  const match =
    (lineItem.itemTypeId && index.byId.get(lineItem.itemTypeId)) ||
    (lineItem.itemTypeName && index.byName.get(lineItem.itemTypeName.toLowerCase()));
  return !!(match && match.stockBlanks === true);
}

function sortRows(rows) {
  return rows.sort((a, b) =>
    b.total - a.total ||
    a.itemType.localeCompare(b.itemType) ||
    a.color.localeCompare(b.color) ||
    a.size.localeCompare(b.size)
  );
}

function mapToRows(map) {
  return sortRows(Array.from(map.values()));
}

function aggregate(orders, catalog) {
  const index = buildCatalogIndex(catalog);
  const shirtMap = new Map(); // key -> Row
  const otherMap = new Map();

  for (const order of orders || []) {
    if (!COUNTED_STATES.includes(order.state)) continue;
    for (const li of order.lineItems || []) {
      const itemType = li.itemTypeName || li.apparelType || '(unknown)';
      const color = li.color || '(no color)';
      const target = isShirt(li, index) ? shirtMap : otherMap;
      for (const [size, v] of Object.entries(li.sizes || {})) {
        const total = (v && v.total) || 0;
        if (total <= 0) continue;
        const key = `${itemType}\x00${color}\x00${size}`;
        const row = target.get(key) || { itemType, color, size, total: 0 };
        row.total += total;
        target.set(key, row);
      }
    }
  }

  return { shirts: mapToRows(shirtMap), other: mapToRows(otherMap) };
}

module.exports = { aggregate, COUNTED_STATES };
