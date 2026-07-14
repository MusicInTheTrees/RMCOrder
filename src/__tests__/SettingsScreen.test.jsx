import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SettingsScreen from '../components/SettingsScreen';
import { getItems, putItem } from '../api/items';

vi.mock('../api/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({ brandName: '', spewEmail: '', defaultBackDesign: '', defaultBackNotes: '' }),
  saveSettings: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('../api/auth', () => ({
  getAuthStatus: vi.fn().mockResolvedValue({ email: 'test@example.com' }),
  logout: vi.fn().mockResolvedValue({}),
}));
vi.mock('../api/items', () => ({
  getItems: vi.fn().mockResolvedValue({ items: [] }),
  postItem: vi.fn(),
  putItem: vi.fn(),
  deleteItem: vi.fn(),
  scrapeColors: vi.fn(),
  pushCatalog: vi.fn(),
  pullCatalog: vi.fn(),
}));
vi.mock('../api/designs', () => ({
  listDesigns: vi.fn().mockResolvedValue([]),
  refreshDesigns: vi.fn().mockResolvedValue({}),
}));
test('Settings screen shows System and Items tabs', async () => {
  render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Items' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Email List' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Campaigns' })).not.toBeInTheDocument();
});

test('clicking Items tab shows item catalog UI', async () => {
  render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Items' }));
  expect(screen.getByText(/Push to Drive/i)).toBeInTheDocument();
});

test('clicking → on active color moves it to inactive', async () => {
  getItems.mockResolvedValue({
    items: [{
      id: 'item1', name: 'Tee', supplierUrl: '',
      colors: [{ name: 'White', hex: '#ffffff', active: true }],
      sizes: [], decorationMethods: [],
    }],
  });
  putItem.mockResolvedValue({});
  render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Items' }));
  await userEvent.click(await screen.findByText('Tee'));
  // The active column should show White with a → button
  const moveBtn = await screen.findByTitle('Move to inactive');
  await userEvent.click(moveBtn);
  await waitFor(() => expect(putItem).toHaveBeenCalledWith('item1', expect.objectContaining({
    colors: expect.arrayContaining([expect.objectContaining({ name: 'White', active: false })]),
  })), { timeout: 1000 });
});

test('clicking → on active size moves it to inactive', async () => {
  getItems.mockResolvedValue({
    items: [{
      id: 'item1', name: 'Tee', supplierUrl: '', colors: [],
      sizes: [{ label: 'M', active: true, order: 0 }],
      decorationMethods: [],
    }],
  });
  putItem.mockResolvedValue({});
  render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'Items' }));
  await userEvent.click(await screen.findByText('Tee'));
  const moveBtn = await screen.findByTitle('Move to inactive');
  await userEvent.click(moveBtn);
  await waitFor(() => expect(putItem).toHaveBeenCalledWith('item1', expect.objectContaining({
    sizes: expect.arrayContaining([expect.objectContaining({ label: 'M', active: false })]),
  })), { timeout: 1000 });
});
