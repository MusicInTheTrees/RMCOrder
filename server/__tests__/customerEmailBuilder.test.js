const { buildCustomerEmail, applyPlaceholders, stripEmoji, DEFAULT_TEMPLATES, headerImage, HEADER_CID } = require('../gmail/customerEmailBuilder');

test('applyPlaceholders uses customer name and order name when present', () => {
  const out = applyPlaceholders('Hello [customer name], order "[order name]"',
    { customerName: 'Jordan', genericName: 'Fellow Cat Lover', orderName: 'Summer Drop' });
  expect(out).toBe('Hello Jordan, order "Summer Drop"');
});

test('applyPlaceholders falls back to generic name when customer name blank', () => {
  const out = applyPlaceholders('Hello [customer name]',
    { customerName: '', genericName: 'Fellow Cat Lover', orderName: 'X' });
  expect(out).toBe('Hello Fellow Cat Lover');
});

test('stripEmoji removes emoji but keeps plain text', () => {
  expect(stripEmoji('Your RMC order is being made 🖨️')).toBe('Your RMC order is being made');
  expect(stripEmoji('On its way! 📦')).toBe('On its way!');
});

test('default subjects contain no emoji', () => {
  for (const state of ['sent', 'shipped', 'delayed']) {
    expect(DEFAULT_TEMPLATES[state].subject).toBe(stripEmoji(DEFAULT_TEMPLATES[state].subject));
  }
});

test('buildCustomerEmail strips emoji from the subject even if the template has one', () => {
  const { subject } = buildCustomerEmail({
    state: 'shipped', template: { subject: 'Shipped! 📦🚚', body: 'Hi [customer name]' },
    customerName: 'A', genericName: 'G', orderName: 'O',
  });
  expect(subject).toBe('Shipped!');
});

test('buildCustomerEmail references the header via inline cid by default', () => {
  const { html } = buildCustomerEmail({
    state: 'shipped', template: DEFAULT_TEMPLATES.shipped,
    customerName: 'Jordan', genericName: 'Fellow Cat Lover', orderName: 'Summer Drop',
  });
  expect(html).toContain(`cid:${HEADER_CID}`);
  expect(html).toContain('Hello Jordan');
  expect(html).toContain('Summer Drop');
  expect(html).toContain('Shipped'); // status label chrome
});

test('buildCustomerEmail uses a supplied imageSrc (preview URL) instead of cid', () => {
  const { html } = buildCustomerEmail({
    state: 'sent', template: DEFAULT_TEMPLATES.sent, customerName: '',
    genericName: 'Fellow Cat Lover', orderName: 'X', imageSrc: '/api/assets/email_header.jpg',
  });
  expect(html).toContain('/api/assets/email_header.jpg');
  expect(html).not.toContain(`cid:${HEADER_CID}`);
  expect(html).toContain('Hello Fellow Cat Lover');
});

test('buildCustomerEmail throws for a state with no template', () => {
  expect(() => buildCustomerEmail({ state: 'paid', customerName: 'A' })).toThrow();
});

test('headerImage returns a jpeg Buffer with the agreed cid', () => {
  const att = headerImage();
  expect(att.cid).toBe(HEADER_CID);
  expect(att.type).toBe('image/jpeg');
  expect(Buffer.isBuffer(att.content)).toBe(true);
  expect(att.content.length).toBeGreaterThan(0);
});
