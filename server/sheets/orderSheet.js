const { readRange, writeRange, clearRange, addSheet, getSheetNames } = require('./client');

function formatSizes(sizes) {
  return Object.entries(sizes || {})
    .filter(([, v]) => (v?.total ?? 0) > 0)
    .map(([label, v]) => `${label}×${v.total}`)
    .join(', ');
}

function parseSizes(str) {
  const sizes = {};
  if (!str) return sizes;
  for (const part of str.split(',')) {
    const trimmed = part.trim();
    const m = trimmed.match(/^(.+?)×(\d+)$/);
    if (m) sizes[m[1]] = { total: parseInt(m[2], 10), inventory: 0 };
  }
  return sizes;
}

async function initOrderSheet(sheetId, orderData) {
  await writeOrderToSheet(sheetId, orderData);
}

async function ensureSheets(sheetId) {
  const existingNames = await getSheetNames(sheetId);
  if (!existingNames.includes('Line Items')) await addSheet(sheetId, 'Line Items');
  if (!existingNames.includes('Designs')) await addSheet(sheetId, 'Designs');
}

async function writeOrderToSheet(sheetId, orderData) {
  await ensureSheets(sheetId);
  await clearRange(sheetId, 'Sheet1!A1:B10');
  await writeRange(sheetId, 'Sheet1!A1:B9', [
    ['Order ID',     orderData.orderId],
    ['Order Name',   orderData.orderName || ''],
    ['State',        orderData.state],
    ['Created',      orderData.created],
    ['Last Updated', new Date().toISOString().slice(0, 10)],
    ['Notes',        orderData.notes || ''],
    ['Sheet ID',     orderData.sheetId || ''],
    ['Draft ID',     orderData.draftId || ''],
    ['Folder ID',    orderData.folderId || ''],
  ]);

  await clearRange(sheetId, "'Line Items'!A1:Z1000");
  const liHeader = ['#', 'Item Type', 'Color', 'Sizes', 'Front Method', 'Front Notes', 'Back Method', 'Back Notes', 'Item Type ID'];
  const liRows = [liHeader];
  for (const item of orderData.lineItems || []) {
    const invSizes = Object.entries(item.sizes || {}).filter(([, v]) => (v?.inventory ?? 0) > 0);
    liRows.push([
      item.num,
      item.itemTypeName || item.apparelType || '',
      item.color || '',
      formatSizes(item.sizes),
      item.frontMethod || '',
      item.frontNotes || '',
      item.backMethod || '',
      item.backNotes || '',
      item.itemTypeId || '',
    ]);
    if (invSizes.length > 0) {
      const invStr = invSizes.map(([label, v]) => `${label}×${v.inventory}`).join(', ');
      liRows.push([`${item.num}-inv`, '(from stock)', '', invStr, '', '', '', '']);
    }
  }
  await writeRange(sheetId, "'Line Items'!A1", liRows, 'RAW');

  await clearRange(sheetId, 'Designs!A1:Z1000');
  const dHeader = ['Line Item #', 'Design #', 'Design File', 'Placement'];
  const dRows = [dHeader];
  for (const item of orderData.lineItems || []) {
    for (const d of item.frontDesigns || []) dRows.push([item.num, d.designNum, d.file, 'Front']);
    for (const d of item.backDesigns || []) dRows.push([item.num, d.designNum, d.file, 'Back']);
  }
  await writeRange(sheetId, 'Designs!A1', dRows, 'RAW');
}

function isNewFormat(headerRow) {
  return Array.isArray(headerRow) && headerRow.includes('Sizes');
}

async function readOrderFromSheet(sheetId) {
  const info    = await readRange(sheetId, 'Sheet1!A1:B10');
  const infoMap = Object.fromEntries(info.map(([k, v]) => [k, v]));

  const allLiRows = await readRange(sheetId, "'Line Items'!A1:Z1000");
  const [headerRow, ...liRows] = allLiRows;
  const newFmt = isNewFormat(headerRow);

  const lineItemsMap = {};
  const OLD_SIZE_COLS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  for (const row of liRows) {
    if (!row[0]) continue;
    const num = row[0];
    if (num.endsWith('-inv')) {
      const baseNum = num.replace('-inv', '');
      if (lineItemsMap[baseNum] && newFmt) {
        const invSizes = parseSizes(row[3]);
        for (const [label, v] of Object.entries(invSizes)) {
          if (lineItemsMap[baseNum].sizes[label]) {
            lineItemsMap[baseNum].sizes[label].inventory = v.total;
          }
        }
      } else if (lineItemsMap[baseNum] && !newFmt) {
        OLD_SIZE_COLS.forEach((s, i) => {
          if (lineItemsMap[baseNum].sizes[s]) {
            lineItemsMap[baseNum].sizes[s].inventory = parseInt(row[3 + i], 10) || 0;
          }
        });
      }
      continue;
    }
    if (newFmt) {
      const [, itemTypeName, color, sizesStr, frontMethod, frontNotes, backMethod, backNotes, itemTypeId] = row;
      lineItemsMap[num] = {
        num, itemTypeName, itemTypeId: itemTypeId || '',
        color,
        sizes: parseSizes(sizesStr),
        frontMethod: frontMethod || '', frontNotes: frontNotes || '',
        backMethod: backMethod || '', backNotes: backNotes || '',
        frontDesigns: [], backDesigns: [],
      };
    } else {
      // Legacy format: #, Apparel Type, Color, XS, S, M, L, XL, XXL, Front Notes, Back Notes
      const [, apparelType, color, ...rest] = row;
      const sizes = {};
      OLD_SIZE_COLS.forEach((s, i) => { sizes[s] = { total: parseInt(rest[i], 10) || 0, inventory: 0 }; });
      lineItemsMap[num] = {
        num, apparelType, color, sizes,
        frontMethod: '', frontNotes: rest[6] || '',
        backMethod: '', backNotes: rest[7] || '',
        frontDesigns: [], backDesigns: [],
      };
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
    orderId:     infoMap['Order ID']     || '',
    orderName:   infoMap['Order Name']   || '',
    state:       infoMap['State']        || 'building',
    created:     infoMap['Created']      || '',
    lastUpdated: infoMap['Last Updated'] || '',
    notes:       infoMap['Notes']        || '',
    sheetId:     infoMap['Sheet ID']     || sheetId,
    draftId:     infoMap['Draft ID']     || '',
    folderId:    infoMap['Folder ID']    || '',
    lineItems:   Object.values(lineItemsMap),
  };
}

module.exports = { initOrderSheet, writeOrderToSheet, readOrderFromSheet };
