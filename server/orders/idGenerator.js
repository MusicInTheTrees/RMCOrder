function generateOrderId(existingFolderNames) {
  const today = new Date().toISOString().slice(0, 10);
  let maxSeq = 0;
  for (const name of existingFolderNames) {
    const match = name.match(/^RMC-(\d{3})-/);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  }
  const next = String(maxSeq + 1).padStart(3, '0');
  return `RMC-${next}-${today}`;
}

module.exports = { generateOrderId };
