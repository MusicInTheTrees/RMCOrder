import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmailListTab from '../components/EmailListTab';
import {
  getContacts, addContact, updateContact, deleteContact, bulkAction, runBackfill, syncEmailList,
} from '../api/emailList';

vi.mock('../api/emailList', () => ({
  getContacts: vi.fn().mockResolvedValue({ contacts: [] }),
  addContact: vi.fn().mockResolvedValue({ contact: { name: 'Ann', email: 'ann@x.com', status: 'subscribed' } }),
  updateContact: vi.fn().mockResolvedValue({ contact: {} }),
  deleteContact: vi.fn().mockResolvedValue({ removed: 1 }),
  bulkAction: vi.fn().mockResolvedValue({ affected: 2 }),
  runBackfill: vi.fn().mockResolvedValue({ added: 2, total: 5 }),
  syncEmailList: vi.fn().mockResolvedValue({ ok: true, added: 3, total: 47 }),
}));

beforeEach(() => {
  getContacts.mockResolvedValue({ contacts: [] });
});

const TWO_CONTACTS = [
  { name: 'Ann', email: 'ann@x.com', status: 'subscribed', addedAt: '2026-01-01T00:00:00Z', source: 'manual' },
  { name: 'Bo', email: 'bo@x.com', status: 'unsubscribed', addedAt: '2026-02-01T00:00:00Z', source: 'backfill' },
];

test('shows empty state and backfill button', async () => {
  render(<EmailListTab />);
  expect(await screen.findByText(/No contacts yet/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Import from existing orders/i })).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/email@example.com/i)).toHaveAttribute('type', 'email');
  expect(screen.getByPlaceholderText(/email@example.com/i)).toBeRequired();
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

test('sorts by Added newest-first by default and toggles on header click', async () => {
  getContacts.mockResolvedValue({ contacts: TWO_CONTACTS });
  render(<EmailListTab />);
  await screen.findByText('ann@x.com');

  let rows = screen.getAllByRole('row'); // rows[0] is the header
  expect(rows[1]).toHaveTextContent('bo@x.com');  // newest first
  expect(rows[2]).toHaveTextContent('ann@x.com');

  await userEvent.click(screen.getByRole('button', { name: /^Added/ }));
  rows = screen.getAllByRole('row');
  expect(rows[1]).toHaveTextContent('ann@x.com'); // ascending = oldest first

  await userEvent.click(screen.getByRole('button', { name: /^Status/ }));
  rows = screen.getAllByRole('row');
  expect(rows[1]).toHaveTextContent('ann@x.com'); // subscribed < unsubscribed
});

test('select-all shows bulk bar and bulk unsubscribe hits the API', async () => {
  getContacts.mockResolvedValue({ contacts: TWO_CONTACTS });
  render(<EmailListTab />);
  await screen.findByText('ann@x.com');

  await userEvent.click(screen.getByLabelText('Select all'));
  expect(screen.getByText('2 selected')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Unsubscribe selected' }));
  await waitFor(() => expect(bulkAction).toHaveBeenCalledWith(
    expect.arrayContaining(['ann@x.com', 'bo@x.com']), 'unsubscribe'));
  expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
});

test('row delete asks for confirmation; confirm deletes, cancel does not', async () => {
  getContacts.mockResolvedValue({ contacts: [TWO_CONTACTS[0]] });
  render(<EmailListTab />);
  await screen.findByText('ann@x.com');

  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(screen.getByText(/permanently removes ann@x.com/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(deleteContact).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(deleteContact).toHaveBeenCalledWith('ann@x.com'));
});

test('bulk delete confirms with a count and calls the bulk API', async () => {
  getContacts.mockResolvedValue({ contacts: TWO_CONTACTS });
  render(<EmailListTab />);
  await screen.findByText('ann@x.com');

  await userEvent.click(screen.getByLabelText('Select all'));
  await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  expect(screen.getByText(/permanently removes 2 contacts/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(bulkAction).toHaveBeenCalledWith(
    expect.arrayContaining(['ann@x.com', 'bo@x.com']), 'delete'));
});

test('sync button merges with Drive and reports counts', async () => {
  render(<EmailListTab />);
  await screen.findByText(/No contacts yet/i);
  await userEvent.click(screen.getByRole('button', { name: /Sync with Drive/i }));
  expect(await screen.findByText(/3 new contact\(s\) pulled in, 47 total/i)).toBeInTheDocument();
  expect(syncEmailList).toHaveBeenCalled();
});
