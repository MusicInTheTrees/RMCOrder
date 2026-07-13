const {
  applyPlaceholders, stripEmoji, renderBodyHtml, HEADER_CID, DEFAULT_GENERIC_NAME,
} = require('../gmail/customerEmailBuilder');

const UNSUB_TEXT = `Don't want these emails? Reply to this email with "unsubscribe" and we'll take you off the list.`;

// contact: { name, email } — template tokens: [customer name]
function buildCampaignEmail({ subject, body, contact }) {
  const ctx = { customerName: contact?.name, orderName: '' };
  const finalSubject = stripEmoji(applyPlaceholders(subject, ctx));
  const bodyText = applyPlaceholders(body, ctx);

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#ffffff;">
  <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:500px;margin:0 auto;background:#fffdf7;border-radius:14px;overflow:hidden;border:1px solid #e6e0cf">
    <img src="cid:${HEADER_CID}" alt="Rocky Meowtain Co." style="display:block;width:100%;height:auto;border-bottom:3px solid #22402f">
    <div style="padding:20px 22px;color:#2b2b2b">
      ${renderBodyHtml(bodyText)}
      <p style="margin:18px 0 0;font-size:11px;color:#888">${UNSUB_TEXT}</p>
    </div>
    <div style="background:#22402f;color:#cdd8cd;padding:12px 22px;text-align:center;font-size:11px">Rocky Meowtain Company LLC · Made with 🐾 in the Rockies</div>
  </div></body></html>`;

  const plain = `${bodyText}\n\n${UNSUB_TEXT}\n\nRocky Meowtain Company LLC`;

  return { subject: finalSubject, html, plain };
}

module.exports = { buildCampaignEmail, UNSUB_TEXT };
