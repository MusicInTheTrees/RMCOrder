import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/blankOrder', () => ({
  getBlankOrderConfig: vi.fn(() => Promise.resolve({
    config: {
      sizeCurves: { industry: { M: 23, L: 31, XL: 23 } }, blendWeight: 0.5,
      coreColors: ['Black', 'White'], coreColorFloorPct: 0.1,
      colorAliases: {}, excludedColors: [], excludedSizes: [], manualHistory: [],
      styleItemTypeMap: {},
    },
    stockBlankItems: [{ id: 'i1', name: 'Unisex Shirt' }],
  })),
  computeBlankPlan: vi.fn(() => Promise.resolve({
    industry: [{ itemType: 'Unisex Shirt', color: 'Black', size: 'M', qty: 12 }],
    blended: [{ itemType: 'Unisex Shirt', color: 'Black', size: 'M', qty: 12 }],
    effectiveTotal: 12, feedMeta: { totalUnits: 20 },
  })),
}));
import { computeBlankPlan } from '../api/blankOrder';

function renderFlow() {
  return render(<MemoryRouter><BlankOrderFlowWrapper /></MemoryRouter>);
}
import BlankOrderFlow from '../components/BlankOrderFlow';
function BlankOrderFlowWrapper() { return <BlankOrderFlow />; }

describe('BlankOrderFlow', () => {
  beforeEach(() => computeBlankPlan.mockClear());
  test('computes a plan and advances to the table', async () => {
    renderFlow();
    await screen.findByLabelText(/total blanks/i);
    // Provide CSV contents directly via the hidden inputs' onChange handlers.
    fireEvent.change(screen.getByLabelText(/older csv/i), { target: { value: 'OLD' } });
    fireEvent.change(screen.getByLabelText(/newer csv/i), { target: { value: 'NEW' } });
    fireEvent.change(screen.getByLabelText(/total blanks/i), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /compute/i }));
    await waitFor(() => expect(computeBlankPlan).toHaveBeenCalled());
    // Step 2 shows the compare table headers.
    await screen.findByText(/industry/i);
  });
});
