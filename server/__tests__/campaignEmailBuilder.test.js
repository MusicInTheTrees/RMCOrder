const { buildCampaignEmail, UNSUB_TEXT } = require('../campaigns/campaignEmailBuilder');

test('replaces [customer name] and falls back to generic name', () => {
  const named = buildCampaignEmail({
    subject: 'Hi [customer name]!', body: 'Hello [customer name],\n\nNew drop!',
    contact: { name: 'Ann', email: 'ann@x.com' },
  });
  expect(named.subject).toBe('Hi Ann!');
  expect(named.plain).toContain('Hello Ann,');
  const anon = buildCampaignEmail({
    subject: 'Hi', body: 'Hello [customer name],', contact: { name: '', email: 'x@x.com' },
  });
  expect(anon.plain).toContain('Hello Fellow Cat Lover,');
});

test('strips emoji from the subject only', () => {
  const r = buildCampaignEmail({ subject: 'New drop 🐱', body: 'Meow 🐱', contact: { name: 'A', email: 'a@x.com' } });
  expect(r.subject).toBe('New drop');
  expect(r.plain).toContain('🐱');
});

test('html has the branded wrapper and unsubscribe footer; plain has the unsub line', () => {
  const r = buildCampaignEmail({ subject: 'S', body: 'B', contact: { name: 'A', email: 'a@x.com' } });
  expect(r.html).toContain('cid:rmcheader');
  expect(r.html).toContain('Rocky Meowtain Company LLC');
  expect(r.html).toContain('unsubscribe');
  expect(r.plain).toContain(UNSUB_TEXT);
});
