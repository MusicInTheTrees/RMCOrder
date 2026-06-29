const { readRange, writeRange, clearRange, addSheet, getSheetNames } = require('./client');

const SIZE_COLS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

async function initOrderSheet(sheetId, orderData) {
  const existingNames = await getSheetNames(sheetId);
  if (!existingNames.includes('Line Items')) await addSheet(sheetId, 'Line Items');
  if (!existingNames.includes('Designs')) await addSheet(sheetId, 'Designs');
  await writeOrderToSheet(sheetId, orderData);
}

async function writeOrderToSheet(sheetId, orderData) {
  // Tab 1: Order Info
  await clearRange(sheetId, 'Sheet1!A1:B10');
  await writeRange(sheetId, 'Sheet1!A1:B7', [
    ['Order ID',   orderData.orderId],
    ['Order Name', orderData.orderName || ''],
    ['State',      orderData.state],
    ['Created',    orderData.created],
    ['Last Updated', new Date().toISOString().slice(0, 10)],
    ['Notes',      orderData.notes || ''],
    ['Sheet ID',   orderData.sheetId || ''],
  ]);

  // Tab 2: Line Items — columns: #, Apparel Type, Color, XS..XXL, Front Notes, Back Notes
  await clearRange(sheetId, 'Line Items!A1:Z1000');
  const liHeader = ['#', 'Apparel Type', 'Color', ...SIZE_COLS, 'Front Notes', 'Back Notes'];
  const liRows = [liHeader];
  for (const item of orderData.lineItems || []) {
    const sizes    = SIZE_COLS.map(s => item.sizes?.[s]?.total     ?? 0);
    const invSizes = SIZE_COLS.map(s => item.sizes?.[s]?.inventory ?? 0);
    liRows.push([item.num, item.apparelType || '', item.color || '', ...sizes,
      item.frontNotes || '', item.backNotes || '']);
    if (invSizes.some(v => v > 0)) {
      liRows.push([`${item.num}-inv`, '(from stock)', '', ...invSizes, '', '']);
    }
  }
  await writeRange(sheetId, 'Line Items!A1', liRows, 'RAW');

  // Tab 3: Designs — columns: Line Item #, Design #, Design File, Placement
  await clearRange(sheetId, 'Designs!A1:Z1000');
  const dHeader = ['Line Item #', 'Design #', 'Design File', 'Placement'];
  const dRows = [dHeader];
  for (const item of orderData.lineItems || []) {
    for (const d of item.frontDesigns || []) {
      dRows.push([item.num, d.designNum, d.file, 'Front']);
    }
    for (const d of item.backDesigns || []) {
      dRows.push([item.num, d.designNum, d.file, 'Back']);
    }
  }
  await writeRange(sheetId, 'Designs!A1', dRows, 'RAW');
}

async function readOrderFromSheet(sheetId) {
  const info    = await readRange(sheetId, 'Sheet1!A1:B10');
  const infoMap = Object.fromEntries(info.map(([k, v]) => [k, v]));

  const liRows = await readRange(sheetId, 'Line Items!A2:Z1000');
  const lineItemsMap = {};
  for (const row of liRows) {
    const [num, apparelType, color, ...rest] = row;
    if (!num) continue;
    if (num.endsWith('-inv')) {
      const baseNum = num.replace('-inv', '');
      if (lineItemsMap[baseNum]) {
        SIZE_COLS.forEach((s, i) => {
          lineItemsMap[baseNum].sizes[s] = lineItemsMap[baseNum].sizes[s] || { total: 0, inventory: 0 };
          lineItemsMap[baseNum].sizes[s].inventory = parseInt(rest[i], 10) || 0;
        });
      }
    } else {
      const sizes = {};
      SIZE_COLS.forEach((s, i) => { sizes[s] = { total: parseInt(rest[i], 10) || 0, inventory: 0 }; });
      const frontNotes = rest[SIZE_COLS.length]     || '';
      const backNotes  = rest[SIZE_COLS.length + 1] || '';
      lineItemsMap[num] = { num, apparelType, color, sizes, frontNotes, backNotes,
        frontDesigns: [], backDesigns: [] };
    }
  }

  const dRows = await readRange(sheetId, 'Designs!A2:D1000');
  for (const [lineItemNum, designNum, file, placement] of dRows) {
    if (lineItemsMap[lineItemNum]) {
      const arr = placement === 'Back' ? 'backDesigns' : 'frontDesigns';
      lineItemsMap[lineItemNum][arr].push({ designNum, file });
    }
  }

  return {
    orderId:     infoMap['Order ID']   || '',
    orderName:   infoMap['Order Name'] || '',
    state:       infoMap['State']      || 'building',
    created:     infoMap['Created']    || '',
    lastUpdated: infoMap['Last Updated'] || '',
    notes:       infoMap['Notes']      || '',
    sheetId:     infoMap['Sheet ID']   || sheetId,
    lineItems:   Object.values(lineItemsMap),
  };
}

module.exports = { initOrderSheet, writeOrderToSheet, readOrderFromSheet };
