const { buildRawRelated } = require('../gmail/client');

function decode(b64url) {
  return Buffer.from(b64url, 'base64url').toString('utf8');
}

test('buildRawRelated wraps html+plain with no images', () => {
  const raw = decode(buildRawRelated('a@x.com', 'Subj', '<b>hi</b>', 'hi', []));
  expect(raw).toContain('To: a@x.com');
  expect(raw).toContain('Subject: Subj');
  expect(raw).toContain('multipart/alternative');
  expect(raw).toContain('text/plain');
  expect(raw).toContain('text/html');
  expect(raw).not.toContain('multipart/related');
  expect(raw).toMatch(/\r\n/);
});

test('buildRawRelated adds a related image part with Content-ID', () => {
  const img = { cid: 'rmclogo', filename: 'rmc_logo.png', content: Buffer.from('PNGDATA') };
  const raw = decode(buildRawRelated('a@x.com', 'S', '<img src="cid:rmclogo">', 'p', [img]));
  expect(raw).toContain('multipart/related');
  expect(raw).toContain('Content-ID: <rmclogo>');
  expect(raw).toContain('Content-Disposition: inline; filename="rmc_logo.png"');
  expect(raw).toContain(Buffer.from('PNGDATA').toString('base64'));
  expect(raw).toMatch(/\r\n/);
});

test('buildRawRelated honors an image content type (e.g. jpeg)', () => {
  const img = { cid: 'rmcheader', filename: 'email_header.jpg', content: Buffer.from('JPGDATA'), type: 'image/jpeg' };
  const raw = decode(buildRawRelated('a@x.com', 'S', '<img>', 'p', [img]));
  expect(raw).toContain('Content-Type: image/jpeg; name="email_header.jpg"');
});

test('buildRawRelated RFC2047-encodes a non-ASCII subject', () => {
  const raw = decode(buildRawRelated('a@x.com', 'Café — déjà', '<p>h</p>', 'h', []));
  expect(raw).toContain('Subject: =?UTF-8?B?');
  expect(raw).not.toContain('Subject: Café');
});

test('buildRawRelated leaves a plain ASCII subject unencoded', () => {
  const raw = decode(buildRawRelated('a@x.com', 'Your RMC order is on its way!', '<p>h</p>', 'h', []));
  expect(raw).toContain('Subject: Your RMC order is on its way!');
});
