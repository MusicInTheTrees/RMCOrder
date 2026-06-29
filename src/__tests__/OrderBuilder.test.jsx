import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OrderBuilder from '../components/OrderBuilder';
import * as ordersApi from '../api/orders';

vi.mock('../api/orders');
vi.mock('../api/gmail', () => ({ createDraft: vi.fn() }));
vi.mock('../api/designs', () => ({ listDesigns: vi.fn(() => Promise.resolve([])), refreshDesigns: vi.fn() }));
vi.mock('../hooks/useItems', () => ({
  useItems: () => ({
    catalog: { items: [] },
    loading: false,
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    scrapeColors: vi.fn(),
    pushToDrive: vi.fn(),
    pullFromDrive: vi.fn(),
  }),
}));

const MOCK_ORDER = {
  orderId: 'RMC-001-2026-06-28',
  state: 'building',
  created: '2026-06-28',
  notes: '',
  sheetId: 'sheet123',
  lineItems: [],
};

function renderBuilder() {
  ordersApi.getOrderBySheet.mockResolvedValue(MOCK_ORDER);
  ordersApi.saveOrderToSheet.mockResolvedValue({ ok: true });
  return render(
    <MemoryRouter initialEntries={['/orders/RMC-001-2026-06-28?sheetId=sheet123']}>
      <Routes>
        <Route path="/orders/:orderId" element={<OrderBuilder />} />
      </Routes>
    </MemoryRouter>
  );
}

test('renders order ID in top bar', async () => {
  renderBuilder();
  await waitFor(() => expect(screen.getByText('RMC-001-2026-06-28')).toBeInTheDocument());
});

test('adds line item on button click', async () => {
  renderBuilder();
  await waitFor(() => screen.getByText('+ Add Line Item'));
  await userEvent.click(screen.getByText('+ Add Line Item'));
  await waitFor(() => expect(screen.getByText('#01')).toBeInTheDocument());
});

test('order notes textarea is rendered', async () => {
  renderBuilder();
  await waitFor(() => expect(screen.getByPlaceholderText(/Order notes/i)).toBeInTheDocument());
});
