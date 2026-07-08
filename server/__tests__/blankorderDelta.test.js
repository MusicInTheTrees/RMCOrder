const fs = require('fs');
const path = require('path');
const { parseCsv, computeVelocity } = require('../blankorder/delta');

describe('parseCsv', () => {
  test('parses quoted fields, escaped quotes, and BOM', () => {
    const text = '﻿Item Name,Price\r\n"Shirt | UM | Logo","$25.00"\r\n"a ""q"" b","1"\r\n';
    const { fields, rows } = parseCsv(text);
    expect(fields).toEqual(['Item Name', 'Price']);
    expect(rows[0]['Item Name']).toBe('Shirt | UM | Logo');
    expect(rows[1]['Item Name']).toBe('a "q" b');
  });
});

describe('computeVelocity', () => {
  const QTY = 'Current Quantity Rocky Meowtain Company LLC';
  const header = `Token,Item Name,Variation Name,SKU,Option Value 1,Option Value 2,Price,${QTY}`;
  const oldCsv = `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,10\nT2,Sticker,,W2,,,${'$3.00'},5`;
  const newCsv = `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,6\nT2,Sticker,,W2,,,${'$3.00'},1`;

  test('computes units sold from quantity drop and flags apparel', () => {
    const feed = computeVelocity(oldCsv, newCsv);
    const shirt = feed.velocity.find(v => v.token === 'T1');
    expect(shirt.unitsSold).toBe(4);
    expect(shirt.itemType).toBe('Shirt');
    expect(shirt.style).toBe('UM');
    expect(shirt.color).toBe('Black');
    expect(shirt.size).toBe('L');
    expect(shirt.isApparel).toBe(true);
    expect(shirt.revenue).toBe(100);
    const sticker = feed.velocity.find(v => v.token === 'T2');
    expect(sticker.isApparel).toBe(false);
    expect(feed.meta.totalUnits).toBe(8);
  });

  test('negative new quantity flags a custom order', () => {
    const nc = `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,-2`;
    const oc = `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,3`;
    const feed = computeVelocity(oc, nc);
    expect(feed.velocity[0].customOrder).toBe(true);
    expect(feed.velocity[0].unitsSold).toBe(5);
  });
});

describe('parity with the Python feed fixture', () => {
  test('velocity array matches catalog_delta.json (order-independent)', () => {
    const dir = path.join(__dirname, 'fixtures', 'blankorder');
    const oldName = 'RMC_catalog-2026-07-04-0226.csv';
    const newName = 'RMC_catalog-2026-07-06-1817.csv';
    const src = 'C:/PERSONAL_INTEREST/RockyMeowtainCompanyLLC/Inventory';

    // Guard: skip gracefully if source CSVs don't exist
    if (!fs.existsSync(path.join(src, oldName)) || !fs.existsSync(path.join(src, newName))) {
      console.log(`[SKIPPED] Source CSVs not found at ${src}`);
      return;
    }

    if (!fs.existsSync(path.join(dir, 'catalog_delta.json'))) {
      console.log('[skip] catalog_delta.json fixture not found');
      return;
    }

    const csvOld = fs.readFileSync(path.join(src, oldName), 'utf8');
    const csvNew = fs.readFileSync(path.join(src, newName), 'utf8');
    const expected = JSON.parse(fs.readFileSync(path.join(dir, 'catalog_delta.json'), 'utf8'));
    const feed = computeVelocity(csvOld, csvNew);
    const key = v => `${v.token}`;
    const sortByToken = a => [...a].sort((x, y) => (key(x) < key(y) ? -1 : 1));
    const strip = v => ({ ...v }); // compare all velocity fields
    expect(sortByToken(feed.velocity).map(strip)).toEqual(sortByToken(expected.velocity).map(strip));
  });
});

const { fromCsvUpload, fromSquare } = require('../blankorder/demandSource');

describe('demandSource', () => {
  const QTY = 'Current Quantity Rocky Meowtain Company LLC';
  const header = `Token,Item Name,Variation Name,SKU,Option Value 1,Option Value 2,Price,${QTY}`;
  test('fromCsvUpload returns a velocity feed', () => {
    const feed = fromCsvUpload(
      `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,10`,
      `${header}\nT1,Shirt | UM | Logo,,W1,Black,L,$25.00,7`
    );
    expect(feed.velocity[0].unitsSold).toBe(3);
  });
  test('fromSquare is a Phase-2 stub', () => {
    expect(() => fromSquare({})).toThrow(/Phase 2/i);
  });
});
