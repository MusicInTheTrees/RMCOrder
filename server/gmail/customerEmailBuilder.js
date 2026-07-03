const fs = require('fs');
const path = require('path');

const LOGO_CID = 'rmclogo';
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'rmc_logo.png');

// tagline = the part after "Hi {name} — " in the headline. status = the pill label.
const STATE_EMAILS = {
  sent: {
    subject: 'Your RMC order is being made 🖨️',
    pill: '🖨️ In Production', status: 'In Production',
    tagline: "your order's in the works!",
    body: `Your order "{orderName}" is now with our print shop getting made. We'll keep you posted as it moves along. Thanks for repping the Meowtain! 🐱`,
  },
  fulfilled: {
    subject: 'Your RMC order is printed ✅',
    pill: '✅ Printed', status: 'Printed',
    tagline: "your order's printed!",
    body: `Great news — "{orderName}" is finished at the print shop and we're heading out to pick it up. You're almost at the summit! 🏔️`,
  },
  received: {
    subject: 'Your RMC order is in-hand 📥',
    pill: '📥 In-Hand', status: 'In-Hand',
    tagline: 'your order made it back to the den!',
    body: `Your order "{orderName}" has arrived at RMC and we're getting it packed up and ready for you. We'll let you know the moment it's on its way. 🐾`,
  },
  shipped: {
    subject: 'Your RMC order is on its way! 📦',
    pill: '📦 Shipped', status: 'Shipped',
    tagline: "it's on its way!",
    body: `Your order "{orderName}" just left the den. Keep an eye out — your gear should reach you soon. Thanks for repping the Meowtain! 🐱`,
  },
};

function customerEmailDefaults(state, orderName) {
  const t = STATE_EMAILS[state];
  if (!t) throw new Error(`No customer email template for state "${state}"`);
  return { subject: t.subject, body: t.body.replaceAll('{orderName}', orderName || 'your order') };
}

function buildCustomerEmail({ state, customerName, subject, body }) {
  const t = STATE_EMAILS[state];
  if (!t) throw new Error(`No customer email template for state "${state}"`);
  const greetName = (customerName && customerName.trim()) ? customerName.trim() : 'there';

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#eef1ea;">
  <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:500px;margin:0 auto;background:#fffdf7;border-radius:14px;overflow:hidden">
    <div style="background:#f3ecd9;padding:16px 22px;text-align:center;border-bottom:3px solid #22402f">
      <img src="cid:${LOGO_CID}" alt="Rocky Meowtain Co." style="max-width:230px;width:70%;height:auto;display:block;margin:0 auto">
    </div>
    <div style="padding:20px 22px;color:#2b2b2b">
      <span style="display:inline-block;background:#e07a3f;color:#fff;font-size:11px;font-weight:700;padding:4px 11px;border-radius:20px;text-transform:uppercase;letter-spacing:1px">${t.pill}</span>
      <h3 style="margin:13px 0 6px;font-size:18px;color:#22402f">Hi ${greetName} — ${t.tagline}</h3>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#444">${body}</p>
      <div style="background:#f4f0e4;border-left:4px solid #e07a3f;padding:10px 13px;border-radius:6px;font-size:13px;color:#555"><strong>Status:</strong> ${t.status}</div>
    </div>
    <div style="background:#22402f;color:#cdd8cd;padding:12px 22px;text-align:center;font-size:11px">Rocky Meowtain Company LLC · Made with 🐾 in the Rockies</div>
  </div></body></html>`;

  const plain = `Hi ${greetName} — ${t.tagline}\n\n${body}\n\nStatus: ${t.status}\n\nRocky Meowtain Company LLC`;

  return { subject, html, plain };
}

function logoAttachment() {
  return { cid: LOGO_CID, filename: 'rmc_logo.png', content: fs.readFileSync(LOGO_PATH) };
}

module.exports = { STATE_EMAILS, customerEmailDefaults, buildCustomerEmail, logoAttachment, LOGO_CID };
