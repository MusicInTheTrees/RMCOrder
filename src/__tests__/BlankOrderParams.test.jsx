import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlankOrderParams from '../components/BlankOrderParams';

const config = {
  excludedSizes: ['XS', 'S'],
  coreColors: ['Black'],
  coreColorFloorPct: 0.1,
  blendWeight: 0.5,
  colorAliases: {},
  excludedColors: [],
};
const stockBlankItems = [{ id: 'i1', name: 'Unisex Shirt' }];

describe('BlankOrderParams', () => {
  test('seeds size-restriction checkboxes from config.excludedSizes', () => {
    render(<BlankOrderParams config={config} stockBlankItems={stockBlankItems} onCompute={() => {}} />);
    expect(screen.getByLabelText('Unisex Shirt exclude XS')).toBeChecked();
  });

  test('compute reports seeded restrictions and empty policy excludedSizes', () => {
    const onCompute = vi.fn();
    render(<BlankOrderParams config={config} stockBlankItems={stockBlankItems} onCompute={onCompute} />);
    fireEvent.change(screen.getByLabelText(/older csv/i), { target: { value: 'OLD' } });
    fireEvent.change(screen.getByLabelText(/newer csv/i), { target: { value: 'NEW' } });
    fireEvent.change(screen.getByLabelText(/total blanks/i), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /compute/i }));

    expect(onCompute).toHaveBeenCalledTimes(1);
    const payload = onCompute.mock.calls[0][0];
    expect(payload.perTypeSizeRestrictions['Unisex Shirt']).toContain('XS');
    expect(payload.policyOverrides.excludedSizes).toEqual([]);
  });
});
