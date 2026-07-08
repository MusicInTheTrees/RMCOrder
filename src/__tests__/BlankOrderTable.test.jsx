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
import { createOrder, getOrderBySheet, saveOrderToSheet } from '../api/orders';
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
  beforeEach(() => { navigate.mockClear(); createOrder.mockClear(); getOrderBySheet.mockClear(); saveOrderToSheet.mockClear(); });

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

  test('custom row qty typed before the fields survives into the generated line items', async () => {
    renderTable();
    // Seed base Working so Generate is enabled and the base rows are present.
    fireEvent.click(screen.getByRole('button', { name: /use blended/i }));
    fireEvent.click(screen.getByRole('button', { name: /add custom row/i }));
    // Type the QTY FIRST, before filling type/color/size.
    fireEvent.change(screen.getByLabelText(/custom working qty 0/i), { target: { value: '9' } });
    // Now fill the identity fields (this used to re-key and lose the qty).
    fireEvent.change(screen.getByLabelText(/custom type 0/i), { target: { value: 'Unisex Shirt' } });
    fireEvent.change(screen.getByLabelText(/custom color 0/i), { target: { value: 'Red' } });
    fireEvent.change(screen.getByLabelText(/custom size 0/i), { target: { value: 'S' } });
    fireEvent.click(screen.getByRole('button', { name: /generate order/i }));
    await waitFor(() => expect(saveOrderToSheet).toHaveBeenCalled());
    const savedItems = saveOrderToSheet.mock.calls[0][1].lineItems;
    const redItem = savedItems.find(li => li.color === 'Red');
    expect(redItem).toBeTruthy();
    expect(redItem.sizes).toEqual({ S: { total: 9, inventory: 0 } });
  });
});
