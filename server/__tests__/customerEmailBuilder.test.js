const { customerEmailDefaults, buildCustomerEmail, logoAttachment, LOGO_CID } = require('../gmail/customerEmailBuilder');

test('defaults resolve {orderName} in the body', () => {
  const { subject, body } = customerEmailDefaults('shipped', 'Summer Drop');
  expect(subject).toBe('Your RMC order is on its way! 📦');
  expect(body).toContain('"Summer Drop"');
  expect(body).not.toContain('{orderName}');
});

test('unknown state throws', () => {
  expect(() => customerEmailDefaults('paid', 'X')).toThrow();
});

test('html greets by name and embeds logo via cid', () => {
  const { html } = buildCustomerEmail({ state: 'sent', customerName: 'Jordan', subject: 'S', body: 'Body text.' });
  expect(html).toContain('Hi Jordan');
  expect(html).toContain(`cid:${LOGO_CID}`);
  expect(html).toContain('Body text.');
  expect(html).toContain('In Production'); // pill/status label for sent
});

test('html falls back to "Hi there" when name blank', () => {
  const { html, plain } = buildCustomerEmail({ state: 'shipped', customerName: '', subject: 'S', body: 'B' });
  expect(html).toContain('Hi there');
  expect(plain).toContain('Hi there');
});

test('subject passes through from caller (edited)', () => {
  const { subject } = buildCustomerEmail({ state: 'received', customerName: 'A', subject: 'Custom subject', body: 'B' });
  expect(subject).toBe('Custom subject');
});

test('logoAttachment returns a Buffer with the agreed cid', () => {
  const att = logoAttachment();
  expect(att.cid).toBe(LOGO_CID);
  expect(Buffer.isBuffer(att.content)).toBe(true);
  expect(att.content.length).toBeGreaterThan(0);
});
