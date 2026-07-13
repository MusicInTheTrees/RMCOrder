const { upsertContacts } = require('./store');
const { syncEmailListSheet } = require('./sheet');

// Gathers { name, email } pairs from an order's customers + line items,
// deduped case-insensitively (customers win because they carry names).
function collectOrderEmails(order) {
  const seen = new Map();
  for (const c of order?.customers || []) {
    const email = (c.email || '').trim();
    if (email) seen.set(email.toLowerCase(), { name: (c.name || '').trim(), email });
  }
  for (const li of order?.lineItems || []) {
    const email = (li.customerEmail || '').trim();
    if (email && !seen.has(email.toLowerCase())) seen.set(email.toLowerCase(), { name: '', email });
  }
  return [...seen.values()];
}

// Fire-and-forget: never throws, never blocks an order save.
function captureOrderEmails(order) {
  try {
    const emails = collectOrderEmails(order);
    if (emails.length === 0) return;
    const source = order?.orderId || 'manual';
    const { added } = upsertContacts(emails.map(e => ({ ...e, source })));
    if (added.length > 0) {
      syncEmailListSheet().catch(err => console.warn('Email list sheet sync skipped:', err.message));
    }
  } catch (err) {
    console.warn('Email capture skipped:', err.message);
  }
}

module.exports = { collectOrderEmails, captureOrderEmails };
