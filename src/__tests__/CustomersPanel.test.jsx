import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach } from 'vitest';
import CustomersPanel from '../components/CustomersPanel';
import { generateCustomerDrafts } from '../api/customerEmails';

vi.mock('../api/customerEmails', () => ({
  previewCustomerEmail: vi.fn().mockResolvedValue({ subject: 'S', html: '<p>hi</p>' }),
  generateCustomerDrafts: vi.fn().mockResolvedValue({ drafted: 2 }),
}));

beforeEach(() => vi.clearAllMocks());

const base = { sheetId: 's', orderState: 'shipped', autoSend: false, onToggleAutoSend: () => {} };

test('Add Customer adds a row via onChange and clears the email input', async () => {
  const onChange = vi.fn();
  render(<CustomersPanel customers={[]} onChange={onChange} {...base} />);
  await userEvent.type(screen.getByPlaceholderText('Name'), 'Jordan');
  const emailInput = screen.getByPlaceholderText('email@example.com');
  await userEvent.type(emailInput, 'jordan@x.com');
  await userEvent.click(screen.getByRole('button', { name: 'Add Customer' }));
  expect(onChange).toHaveBeenCalledWith([{ name: 'Jordan', email: 'jordan@x.com', emailed: {} }]);
  expect(emailInput).toHaveValue('');
});

test('Paste Customer Info (CSV) parses rows into the list', async () => {
  const onChange = vi.fn();
  render(<CustomersPanel customers={[]} onChange={onChange} {...base} />);
  await userEvent.click(screen.getByRole('button', { name: /Paste Customer Info \(CSV\)/i }));
  await userEvent.type(screen.getByPlaceholderText(/one per line/i), 'Jordan, jordan@x.com\nsam@x.com');
  await userEvent.click(screen.getByRole('button', { name: /add to list/i }));
  expect(onChange).toHaveBeenCalledWith([
    { name: 'Jordan', email: 'jordan@x.com', emailed: {} },
    { name: '', email: 'sam@x.com', emailed: {} },
  ]);
});

test('removing a row fires onChange without it', async () => {
  const onChange = vi.fn();
  const customers = [{ name: 'A', email: 'a@x.com', emailed: {} }, { name: 'B', email: 'b@x.com', emailed: {} }];
  render(<CustomersPanel customers={customers} onChange={onChange} {...base} />);
  await userEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
  expect(onChange).toHaveBeenCalledWith([{ name: 'B', email: 'b@x.com', emailed: {} }]);
});

test('turning ON auto-send asks for confirmation, then calls onToggleAutoSend(true)', async () => {
  const onToggleAutoSend = vi.fn();
  render(<CustomersPanel customers={[]} onChange={() => {}} {...base} onToggleAutoSend={onToggleAutoSend} />);
  await userEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByText(/Turn ON automatic sending/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(onToggleAutoSend).toHaveBeenCalledWith(true);
});

test('Generate Draft is disabled while auto-send is on', () => {
  render(<CustomersPanel customers={[{ name: 'A', email: 'a@x.com', emailed: {} }]} onChange={() => {}} {...base} autoSend={true} />);
  expect(screen.getByRole('button', { name: /Generate Draft — Shipped/i })).toBeDisabled();
});

test('Generate Draft calls the API for the current state', async () => {
  render(<CustomersPanel customers={[{ name: 'A', email: 'a@x.com', emailed: {} }]} onChange={() => {}} {...base} />);
  await userEvent.click(screen.getByRole('button', { name: /Generate Draft — Shipped/i }));
  await waitFor(() => expect(generateCustomerDrafts).toHaveBeenCalledWith('s', 'shipped'));
});

test('Generate Draft is disabled and relabeled when order is not in an emailing state', () => {
  render(<CustomersPanel customers={[{ name: 'A', email: 'a@x.com', emailed: {} }]} onChange={() => {}} {...base} orderState="building" />);
  expect(screen.getByRole('button', { name: /order not in an emailing state/i })).toBeDisabled();
});
