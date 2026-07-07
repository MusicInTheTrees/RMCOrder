const EMAIL_RE = /[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/;

// Parse pasted text (one entry per line) into customer rows.
// Accepts "Name, email", "Name <email>", or a bare email.
export function parseCustomers(text) {
  const rows = [];
  const skipped = [];
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(EMAIL_RE);
    if (!match) { skipped.push({ line, reason: 'no email address found' }); continue; }
    const email = match[0].trim();
    let name = line
      .replace(email, '')
      .replace(/[<>]/g, '')
      .replace(/[,;]/g, ' ')
      .trim();
    rows.push({ name, email });
  }
  return { rows, skipped };
}
