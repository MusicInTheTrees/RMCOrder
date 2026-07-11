// Legacy `paid` orders migrate to `fulfilled` on read (self-healing; no batch
// script). Applied wherever an order's state is read/consumed on the backend.
function normalizeState(state) {
  return state === 'paid' ? 'fulfilled' : state;
}

module.exports = { normalizeState };
