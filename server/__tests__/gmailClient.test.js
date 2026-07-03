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
});

test('buildRawRelated adds a related image part with Content-ID', () => {
  const img = { cid: 'rmclogo', filename: 'rmc_logo.png', content: Buffer.from('PNGDATA') };
  const raw = decode(buildRawRelated('a@x.com', 'S', '<img src="cid:rmclogo">', 'p', [img]));
  expect(raw).toContain('multipart/related');
  expect(raw).toContain('Content-ID: <rmclogo>');
  expect(raw).toContain('Content-Disposition: inline; filename="rmc_logo.png"');
  expect(raw).toContain(Buffer.from('PNGDATA').toString('base64'));
});
