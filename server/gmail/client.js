const crypto = require('crypto');
const { google } = require('googleapis');
const { getOAuth2Client } = require('../auth/oauth');

function buildRaw(to, subject, htmlBody, plainTextBody) {
  const boundary = 'boundary_speworderapp';
  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    plainTextBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ].join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

async function upsertDraft(to, subject, htmlBody, plainTextBody, existingDraftId = null) {
  const auth = getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth });
  const encoded = buildRaw(to, subject, htmlBody, plainTextBody);

  if (existingDraftId) {
    try {
      const res = await gmail.users.drafts.update({
        userId: 'me',
        id: existingDraftId,
        resource: { message: { raw: encoded } },
      });
      return res.data.id;
    } catch {
      // Draft was sent or deleted — fall through to create a new one
    }
  }

  const res = await gmail.users.drafts.create({
    userId: 'me',
    resource: { message: { raw: encoded } },
  });
  return res.data.id;
}

function wrap76(b64) {
  if (!b64) return '';
  return b64.match(/.{1,76}/g).join('\r\n');
}

function buildRawRelated(to, subject, htmlBody, plainTextBody, inlineImages = []) {
  const alt = `alt_${crypto.randomBytes(8).toString('hex')}`;
  const rel = `rel_${crypto.randomBytes(8).toString('hex')}`;
  const hasImages = inlineImages.length > 0;
  const lines = [`To: ${to}`, `Subject: ${subject}`, 'MIME-Version: 1.0'];

  if (hasImages) {
    lines.push(`Content-Type: multipart/related; boundary="${rel}"`, '', `--${rel}`);
  }
  lines.push(
    `Content-Type: multipart/alternative; boundary="${alt}"`, '',
    `--${alt}`, 'Content-Type: text/plain; charset=UTF-8', '', plainTextBody, '',
    `--${alt}`, 'Content-Type: text/html; charset=UTF-8', '', htmlBody, '',
    `--${alt}--`, '',
  );
  for (const img of inlineImages) {
    lines.push(
      `--${rel}`,
      `Content-Type: image/png; name="${img.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-ID: <${img.cid}>`,
      `Content-Disposition: inline; filename="${img.filename}"`,
      '',
      wrap76(img.content.toString('base64')),
      '',
    );
  }
  if (hasImages) lines.push(`--${rel}--`);
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

async function sendEmail(to, subject, htmlBody, plainTextBody, inlineImages = []) {
  const auth = getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth });
  const raw = buildRawRelated(to, subject, htmlBody, plainTextBody, inlineImages);
  const res = await gmail.users.messages.send({ userId: 'me', resource: { raw } });
  return res.data.id;
}

module.exports = { upsertDraft, sendEmail, buildRawRelated };
