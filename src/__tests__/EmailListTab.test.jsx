import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmailListTab from '../components/EmailListTab';
import { getContacts, addContact, updateContact, runBackfill } from '../api/emailList';

vi.mock('../api/emailList', () => ({
  getContacts: vi.fn().mockResolvedValue({ contacts: [] }),
  addContact: vi.fn().mockResolvedValue({ contact: { name: 'Ann', email: 'ann@x.com', status: 'subscribed' } }),
  updateContact: vi.fn().mockResolvedValue({ contact: {} }),
  runBackfill: vi.fn().mockResolvedValue({ added: 2, total: 5 }),
}));

test('shows empty state and backfill button', async () => {
  render(<EmailListTab />);
  expect(await screen.findByText(/No contacts yet/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Import from existing orders/i })).toBeInTheDocument();
});

test('renders contacts and toggles unsubscribe', async () => {
  getContacts.mockResolvedValue({ contacts: [
    { name: 'Ann', email: 'ann@x.com', status: 'subscribed', addedAt: '2026-07-01T00:00:00Z', source: 'RMC-001-2026-07-01' },
  ] });
  render(<EmailListTab />);
  expect(await screen.findByText('ann@x.com')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Unsubscribe/i }));
  await waitFor(() => expect(updateContact).toHaveBeenCalledWith('ann@x.com', { status: 'unsubscribed' }));
});

test('adds a contact via the form', async () => {
  render(<EmailListTab />);
  await screen.findByText(/No contacts yet/i);
  await userEvent.type(screen.getByPlaceholderText(/Name/i), 'Ann');
  await userEvent.type(screen.getByPlaceholderText(/email@example.com/i), 'ann@x.com');
  await userEvent.click(screen.getByRole('button', { name: /^Add$/i }));
  await waitFor(() => expect(addContact).toHaveBeenCalledWith({ name: 'Ann', email: 'ann@x.com' }));
});

test('backfill button reports how many were imported', async () => {
  render(<EmailListTab />);
  await screen.findByText(/No contacts yet/i);
  await userEvent.click(screen.getByRole('button', { name: /Import from existing orders/i }));
  expect(await screen.findByText(/Imported 2 new contact/i)).toBeInTheDocument();
  expect(runBackfill).toHaveBeenCalled();
});
