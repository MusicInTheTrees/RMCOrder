const { readBlankOrderConfig, DEFAULTS } = require('../blankorder/config');

describe('readBlankOrderConfig', () => {
  test('returns a config with the expected policy keys', () => {
    const cfg = readBlankOrderConfig();
    expect(cfg.blendWeight).toBeDefined();
    expect(cfg.coreColors).toContain('Black');
    expect(cfg.sizeCurves.industry.M).toBe(23);
    expect(cfg.styleItemTypeMap).toBeDefined();
  });
  test('DEFAULTS includes core-color floor', () => {
    expect(DEFAULTS.coreColorFloorPct).toBe(0.1);
  });
});
