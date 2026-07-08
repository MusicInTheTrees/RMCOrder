export function blankRowsToLineItems(rows, styleItemTypeMap = {}) {
  const groups = new Map();
  for (const r of rows || []) {
    if (!r || (r.qty ?? 0) <= 0) continue;
    const mapped = styleItemTypeMap[r.itemType] || {};
    const itemTypeName = mapped.name || r.itemType;
    const itemTypeId = mapped.id || '';
    const key = `${itemTypeId} ${itemTypeName} ${r.color}`;
    let g = groups.get(key);
    if (!g) { g = { itemTypeName, itemTypeId, color: r.color, sizes: {} }; groups.set(key, g); }
    const prev = g.sizes[r.size]?.total || 0;
    g.sizes[r.size] = { total: prev + r.qty, inventory: 0 };
  }
  return [...groups.values()].map((g, i) => ({
    num: String(i + 1).padStart(2, '0'),
    itemTypeName: g.itemTypeName,
    itemTypeId: g.itemTypeId,
    color: g.color,
    sizes: g.sizes,
    frontDesigns: [],
    backDesigns: [],
    frontMethod: '',
    backMethod: '',
    frontNotes: '',
    backNotes: '',
  }));
}
