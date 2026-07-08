// src/__tests__/BlankOrderTable.test.jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
vi.mock('../api/orders', () => ({
  createOrder: vi.fn(() => Promise.resolve({ orderId: 'RMC-009-2026-07-07', sheetId: 'sh1' })),
  getOrderBySheet: vi.fn(() => Promise.resolve({ orderId: 'RMC-009-2026-07-07', sheetId: 'sh1', folderId: 'f1', state: 'building', lineItems: [] })),
  saveOrderToSheet: vi.fn(() => Promise.resolve({ ok: true })),
}));
import { createOrder, saveOrderToSheet } from '../api/orders';
import BlankOrderTable from '../components/BlankOrderTable';

const plan = {
  industry: [
    { itemType: 'Unisex Shirt', color: 'Black', size: 'M', qty: 7 },
    { itemType: 'Unisex Shirt', color: 'Black', size: 'L', qty: 5 },
  ],
  blended: [
    { itemType: 'Unisex Shirt', color: 'Black', size: 'M', qty: 6 },
    { itemType: 'Unisex Shirt', color: 'Black', size: 'L', qty: 6 },
  ],
  effectiveTotal: 12,
};
const map = { 'Unisex Shirt': { id: 'i1', name: 'Unisex Shirt' } };

function renderTable() {
  return render(<MemoryRouter><BlankOrderTable plan={plan} styleItemTypeMap={map} onBack={() => {}} /></MemoryRouter>);
}

describe('BlankOrderTable', () => {
  beforeEach(() => { navigate.mockClear(); createOrder.mockClear(); saveOrderToSheet.mockClear(); });

  test('Generate is disabled until Working has values', () => {
    renderTable();
    expect(screen.getByRole('button', { name: /generate order/i })).toBeDisabled();
  });

  test('Use Industry fills Working and enables Generate', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /use industry/i }));
    const inputs = screen.getAllByLabelText(/working qty/i);
    expect(inputs[0].value).toBe('7');
    expect(screen.getByRole('button', { name: /generate order/i })).not.toBeDisabled();
  });

  test('Generate creates an order with collapsed blank line items and navigates', async () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /use blended/i }));
    fireEvent.click(screen.getByRole('button', { name: /generate order/i }));
    await waitFor(() => expect(createOrder).toHaveBeenCalled());
    const savedArgs = saveOrderToSheet.mock.calls[0];
    expect(savedArgs[0]).toBe('sh1');
    const savedItems = savedArgs[1].lineItems;
    expect(savedItems).toHaveLength(1); // one Black Unisex Shirt line item
    expect(savedItems[0].sizes).toEqual({ M: { total: 6, inventory: 0 }, L: { total: 6, inventory: 0 } });
    expect(savedArgs[2]).toBe(true); // full save
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders/RMC-009-2026-07-07?sheetId=sh1'));
  });
});
