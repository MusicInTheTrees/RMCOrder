const fs = require('fs');
const path = require('path');

// The header image already includes the Rocky Meowtain Co. logo composited
// over a mountain-lake scene, so it is the entire email header.
const HEADER_CID = 'rmcheader';
const HEADER_PATH = path.join(__dirname, '..', 'assets', 'email_header.jpg');

// Chrome (fixed, not user-editable): status pill + short status label per state.
const PILLS = {
  sent: '🖨️ In Production',
  fulfilled: '✅ Printed',
  received: '📥 In-Hand',
  shipped: '📦 Shipped',
};
const STATUS_LABELS = {
  sent: 'In Production',
  fulfilled: 'Printed',
  received: 'In-Hand',
  shipped: 'Shipped',
};

// Editable per-status templates (subject + body). The body may use the
// placeholders [customer name] and [order name]. Subjects are kept emoji-free
// (email subject headers mangle emoji in many clients).
const DEFAULT_TEMPLATES = {
  sent: {
    subject: 'Your RMC order is being made',
    body: `Hello [customer name],\n\nYour order "[order name]" is now with our print shop getting made. We'll keep you posted as it moves along. Thanks for repping the Meowtain! 🐱`,
  },
  fulfilled: {
    subject: 'Your RMC order is printed',
    body: `Hello [customer name],\n\nGreat news — your order "[order name]" is finished at the print shop and we're heading out to pick it up. You're almost at the summit! 🏔️`,
  },
  received: {
    subject: 'Your RMC order is in-hand',
    body: `Hello [customer name],\n\nYour order "[order name]" has arrived at RMC and we're getting it packed up and ready for you. We'll let you know the moment it's on its way. 🐾`,
  },
  shipped: {
    subject: 'Your RMC order is on its way!',
    body: `Hello [customer name],\n\nYour order "[order name]" just left the den. Keep an eye out — your gear should reach you soon. Thanks for repping the Meowtain! 🐱`,
  },
};

const DEFAULT_GENERIC_NAME = 'Fellow Cat Lover';

// Strip emoji / pictographs / dingbats / variation selectors. Used on subjects.
function stripEmoji(str) {
  return String(str || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Replace [customer name] and [order name] tokens (case-insensitive, tolerant
// of internal whitespace). Customer name falls back to the generic name.
function applyPlaceholders(text, { customerName, genericName, orderName }) {
  const name = (customerName && customerName.trim()) ? customerName.trim() : (genericName || DEFAULT_GENERIC_NAME);
  return String(text || '')
    .replace(/\[\s*customer\s+name\s*\]/gi, name)
    .replace(/\[\s*order\s+name\s*\]/gi, orderName || 'your order');
}

function renderBodyHtml(body) {
  return String(body || '')
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#444">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// template: { subject, body } — from the store (or a default).
// imageSrc: how the header image is referenced. Defaults to the inline CID
// (for real emails); the preview passes an http URL the browser can load.
function buildCustomerEmail({ state, template, customerName, genericName, orderName, imageSrc }) {
  const tpl = template || DEFAULT_TEMPLATES[state];
  if (!tpl) throw new Error(`No customer email template for state "${state}"`);
  const ctx = { customerName, genericName, orderName };
  const subject = stripEmoji(applyPlaceholders(tpl.subject, ctx));
  const bodyText = applyPlaceholders(tpl.body, ctx);
  const pill = PILLS[state] || '';
  const status = STATUS_LABELS[state] || state;
  const headerSrc = imageSrc || `cid:${HEADER_CID}`;

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#ffffff;">
  <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:500px;margin:0 auto;background:#fffdf7;border-radius:14px;overflow:hidden;border:1px solid #e6e0cf">
    <img src="${headerSrc}" alt="Rocky Meowtain Co." style="display:block;width:100%;height:auto;border-bottom:3px solid #22402f">
    <div style="padding:20px 22px;color:#2b2b2b">
      <span style="display:inline-block;background:#e07a3f;color:#fff;font-size:11px;font-weight:700;padding:4px 11px;border-radius:20px;text-transform:uppercase;letter-spacing:1px">${pill}</span>
      <div style="margin-top:14px">${renderBodyHtml(bodyText)}</div>
      <div style="background:#f4f0e4;border-left:4px solid #e07a3f;padding:10px 13px;border-radius:6px;font-size:13px;color:#555"><strong>Status:</strong> ${status}</div>
    </div>
    <div style="background:#22402f;color:#cdd8cd;padding:12px 22px;text-align:center;font-size:11px">Rocky Meowtain Company LLC · Made with 🐾 in the Rockies</div>
  </div></body></html>`;

  const plain = `${bodyText}\n\nStatus: ${status}\n\nRocky Meowtain Company LLC`;

  return { subject, html, plain };
}

function headerImage() {
  return { cid: HEADER_CID, filename: 'email_header.jpg', content: fs.readFileSync(HEADER_PATH), type: 'image/jpeg' };
}

module.exports = {
  PILLS,
  STATUS_LABELS,
  DEFAULT_TEMPLATES,
  DEFAULT_GENERIC_NAME,
  stripEmoji,
  applyPlaceholders,
  buildCustomerEmail,
  headerImage,
  HEADER_CID,
};
