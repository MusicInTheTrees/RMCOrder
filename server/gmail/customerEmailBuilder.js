const fs = require('fs');
const path = require('path');

// The header image already includes the Rocky Meowtain Co. logo composited
// over a mountain-lake scene, so it is the entire email header.
const HEADER_CID = 'rmcheader';
const HEADER_PATH = path.join(__dirname, '..', 'assets', 'email_header.jpg');

// Chrome (fixed, not user-editable): status pill + short status label per state.
const PILLS = {
  sent: '🖨️ In Production',
  pending: '🖨️ Pending Print',
  fulfilled: '👕 Printed',
  shipped: '📦 Shipped',
  delayed: '⏳ Delayed',
};
const STATUS_LABELS = {
  sent: 'In Production',
  pending: 'Pending Print',
  fulfilled: 'Printed',
  shipped: 'Shipped',
  delayed: 'Delayed',
};

// Editable per-status templates (subject + body). The body may use the
// placeholders [customer name] and [order name]. Subjects are kept emoji-free
// (email subject headers mangle emoji in many clients).
const DEFAULT_TEMPLATES = {
  sent: {
    subject: 'Your RMC order is being made',
    body: `Hello [customer name],\n\nYour order "[order name]" is now with our print shop getting made. We'll keep you posted as it moves along. Thanks for repping the Meowtain! 🐱`,
  },
  pending: {
    subject: 'We\'re prepping your RMC order',
    body: `Hello [customer name],\n\nYour order "[order name]" is with our print shop and we're lining up the blank garments for it. Once they're in and your order is printed, we'll let you know. Thanks for repping the Meowtain! 🐱`,
  },
  fulfilled: {
    subject: 'Your RMC order is printed!',
    body: `Hello [customer name],\n\nGreat news — your order "[order name]" is printed and moving toward shipment. We'll email again when it ships. Thanks for repping the Meowtain! 🐱`,
  },
  shipped: {
    subject: 'Your RMC order is on its way!',
    body: `Hello [customer name],\n\nYour order "[order name]" just left the den. Keep an eye out — your gear should reach you soon. Thanks for repping the Meowtain! 🐱`,
  },
  delayed: {
    subject: 'A quick update on your RMC order',
    body: `Hello [customer name],\n\nYour order "[order name]" is running a little behind schedule. We're sorry for the wait and are working to get it moving again — we'll let you know as soon as it's back on track. Thanks for your patience! 🐾`,
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

function formatItemSizes(sizes) {
  return Object.entries(sizes || {})
    .filter(([, v]) => (v?.total ?? 0) > 0)
    .map(([label, v]) => `${label}×${v.total}`)
    .join(', ');
}

function describeItem(item) {
  const type = item.itemTypeName || item.apparelType || 'Item';
  const front = (item.frontDesigns || []).map(d => d.file).join(', ') || 'blank (no print)';
  const parts = [item.color, formatItemSizes(item.sizes), front].filter(Boolean);
  return `${type} — ${parts.join(', ')}`;
}

function renderItemsHtml(items) {
  if (!items || items.length === 0) return '';
  const rows = items.map(i => `<li style="margin:0 0 6px;font-size:14px;color:#444">${describeItem(i)}</li>`).join('');
  return `<div style="margin-top:8px"><strong style="font-size:13px;color:#2b2b2b">Your items</strong>
    <ul style="margin:6px 0 12px;padding-left:20px">${rows}</ul></div>`;
}

function renderItemsPlain(items) {
  if (!items || items.length === 0) return '';
  return `\n\nYour items:\n${items.map(i => `- ${describeItem(i)}`).join('\n')}`;
}

// template: { subject, body } — from the store (or a default).
// imageSrc: how the header image is referenced. Defaults to the inline CID
// (for real emails); the preview passes an http URL the browser can load.
function buildCustomerEmail({ state, template, customerName, genericName, orderName, imageSrc, items }) {
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
      ${renderItemsHtml(items)}
      <div style="background:#f4f0e4;border-left:4px solid #e07a3f;padding:10px 13px;border-radius:6px;font-size:13px;color:#555"><strong>Status:</strong> ${status}</div>
    </div>
    <div style="background:#22402f;color:#cdd8cd;padding:12px 22px;text-align:center;font-size:11px">Rocky Meowtain Company LLC · Made with 🐾 in the Rockies</div>
  </div></body></html>`;

  const plain = `${bodyText}${renderItemsPlain(items)}\n\nStatus: ${status}\n\nRocky Meowtain Company LLC`;

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
