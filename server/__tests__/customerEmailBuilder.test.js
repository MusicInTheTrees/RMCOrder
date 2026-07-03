const { buildCustomerEmail, applyPlaceholders, DEFAULT_TEMPLATES, logoAttachment, LOGO_CID } = require('../gmail/customerEmailBuilder');

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

test('applyPlaceholders is case-insensitive and tolerant of internal spacing', () => {
  const out = applyPlaceholders('Hi [Customer  Name] / [ORDER NAME]',
    { customerName: 'A', genericName: 'G', orderName: 'O' });
  expect(out).toBe('Hi A / O');
});

test('buildCustomerEmail renders template with logo cid, pill, and resolved placeholders', () => {
  const { subject, html, plain } = buildCustomerEmail({
    state: 'shipped', template: DEFAULT_TEMPLATES.shipped,
    customerName: 'Jordan', genericName: 'Fellow Cat Lover', orderName: 'Summer Drop',
  });
  expect(subject).toContain('on its way');
  expect(html).toContain(`cid:${LOGO_CID}`);
  expect(html).toContain('Hello Jordan');
  expect(html).toContain('Summer Drop');
  expect(html).toContain('Shipped'); // status label chrome
  expect(plain).toContain('Hello Jordan');
});

test('buildCustomerEmail uses generic name when customer name blank', () => {
  const { html } = buildCustomerEmail({
    state: 'sent', template: DEFAULT_TEMPLATES.sent,
    customerName: '', genericName: 'Fellow Cat Lover', orderName: 'X',
  });
  expect(html).toContain('Hello Fellow Cat Lover');
});

test('buildCustomerEmail throws for a state with no template', () => {
  expect(() => buildCustomerEmail({ state: 'paid', customerName: 'A' })).toThrow();
});

test('logoAttachment returns a Buffer with the agreed cid', () => {
  const att = logoAttachment();
  expect(att.cid).toBe(LOGO_CID);
  expect(Buffer.isBuffer(att.content)).toBe(true);
  expect(att.content.length).toBeGreaterThan(0);
});
