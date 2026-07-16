import { useState, useEffect, useCallback } from 'react';
import { getInventory } from '../api/inventory';
import { normalizeColor } from '../utils/colorUtils';

export function useInventory() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    getInventory().then(setRows).catch(() => {});
  }, []);

  // Returns count in stock for a given (item, color, style, size).
  // item/color/style matching is case-insensitive; size is exact.
  const getStock = useCallback((item, color, style, size) => {
    const match = rows.find(r =>
      r.item === (item || '').toLowerCase().trim() &&
      normalizeColor(r.color) === normalizeColor(color) &&
      r.style === (style || '').toLowerCase().trim() &&
      r.size === (size || '').trim()
    );
    return match ? match.inStock : 0;
  }, [rows]);

  return { getStock };
}
