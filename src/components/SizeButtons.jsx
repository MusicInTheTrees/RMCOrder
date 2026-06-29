export default function SizeButtons({ sizeLabels = [], sizes = {}, onChange, stockForSize = null }) {
  function getVal(size, key) {
    return sizes[size]?.[key] ?? 0;
  }

  function setTotal(size, rawValue) {
    const next = Math.max(0, parseInt(rawValue, 10) || 0);
    const stock = stockForSize ? stockForSize(size) : 0;
    const inv = next === 0 ? 0 : Math.min(next, stock);
    onChange({ ...sizes, [size]: { total: next, inventory: inv } });
  }

  function adjustInv(size, delta) {
    const total = getVal(size, 'total');
    const next = Math.max(0, Math.min(total, getVal(size, 'inventory') + delta));
    onChange({ ...sizes, [size]: { total, inventory: next } });
  }

  return (
    <div className="size-buttons">
      {sizeLabels.map(size => {
        const total = getVal(size, 'total');
        const inv   = getVal(size, 'inventory');
        return (
          <div key={size} className={`size-row${total > 0 ? ' active' : ''}`}>
            <span className="size-label">{size}</span>
            <div className="size-total-row">
              <button
                className="size-adj"
                onClick={() => setTotal(size, total - 1)}
                disabled={total === 0}
              >−</button>
              <input
                className="size-input"
                type="number"
                min="0"
                value={total || ''}
                placeholder="0"
                onChange={e => setTotal(size, e.target.value)}
              />
              <button
                className="size-adj"
                onClick={() => setTotal(size, total + 1)}
              >+</button>
            </div>
            {total > 0 && (
              <div className="size-inv-row">
                <span className="inv-label">inv</span>
                <button
                  className="size-adj"
                  onClick={() => adjustInv(size, -1)}
                  disabled={inv === 0}
                >−</button>
                <span className="inv-count">{inv}</span>
                <button
                  className="size-adj"
                  onClick={() => adjustInv(size, 1)}
                  disabled={inv >= total}
                >+</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
