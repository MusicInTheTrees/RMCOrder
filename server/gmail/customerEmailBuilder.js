const fs = require('fs');
const path = require('path');

const LOGO_CID = 'rmclogo';
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'rmc_logo.png');

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
// placeholders [customer name] and [order name]. These are the defaults;
// the saved values live in status-email-templates.json (see statusEmailStore).
const DEFAULT_TEMPLATES = {
  sent: {
    subject: 'Your RMC order is being made 🖨️',
    body: `Hello [customer name],\n\nYour order "[order name]" is now with our print shop getting made. We'll keep you posted as it moves along. Thanks for repping the Meowtain! 🐱`,
  },
  fulfilled: {
    subject: 'Your RMC order is printed ✅',
    body: `Hello [customer name],\n\nGreat news — your order "[order name]" is finished at the print shop and we're heading out to pick it up. You're almost at the summit! 🏔️`,
  },
  received: {
    subject: 'Your RMC order is in-hand 📥',
    body: `Hello [customer name],\n\nYour order "[order name]" has arrived at RMC and we're getting it packed up and ready for you. We'll let you know the moment it's on its way. 🐾`,
  },
  shipped: {
    subject: 'Your RMC order is on its way! 📦',
    body: `Hello [customer name],\n\nYour order "[order name]" just left the den. Keep an eye out — your gear should reach you soon. Thanks for repping the Meowtain! 🐱`,
  },
};

const DEFAULT_GENERIC_NAME = 'Fellow Cat Lover';

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

// template: { subject, body } — from the store (or a default). Returns the
// fully-rendered email with placeholders resolved for this customer.
function buildCustomerEmail({ state, template, customerName, genericName, orderName }) {
  const tpl = template || DEFAULT_TEMPLATES[state];
  if (!tpl) throw new Error(`No customer email template for state "${state}"`);
  const ctx = { customerName, genericName, orderName };
  const subject = applyPlaceholders(tpl.subject, ctx);
  const bodyText = applyPlaceholders(tpl.body, ctx);
  const pill = PILLS[state] || '';
  const status = STATUS_LABELS[state] || state;

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#eef1ea;">
  <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:500px;margin:0 auto;background:#fffdf7;border-radius:14px;overflow:hidden">
    <div style="background:#f3ecd9;padding:16px 22px;text-align:center;border-bottom:3px solid #22402f">
      <img src="cid:${LOGO_CID}" alt="Rocky Meowtain Co." style="max-width:230px;width:70%;height:auto;display:block;margin:0 auto">
    </div>
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

function logoAttachment() {
  return { cid: LOGO_CID, filename: 'rmc_logo.png', content: fs.readFileSync(LOGO_PATH) };
}

module.exports = {
  PILLS,
  STATUS_LABELS,
  DEFAULT_TEMPLATES,
  DEFAULT_GENERIC_NAME,
  applyPlaceholders,
  buildCustomerEmail,
  logoAttachment,
  LOGO_CID,
};
