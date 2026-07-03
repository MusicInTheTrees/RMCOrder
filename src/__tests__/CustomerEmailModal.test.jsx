import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect, beforeEach } from 'vitest';
import CustomerEmailModal from '../components/CustomerEmailModal';
import { previewCustomerEmail, sendCustomerEmail } from '../api/customerEmails';

vi.mock('../api/customerEmails', () => ({
  previewCustomerEmail: vi.fn().mockResolvedValue({ subject: 'Default subj', body: 'Default body' }),
  sendCustomerEmail: vi.fn().mockResolvedValue({ sent: 1, at: '2026-07-03T00:00:00Z', emails: ['b@x.com'] }),
}));

const customers = [
  { name: 'A', email: 'a@x.com', emailed: { shipped: '2026-07-01T00:00:00Z' } }, // already sent
  { name: 'B', email: 'b@x.com', emailed: {} },                                   // pending
];

beforeEach(() => vi.clearAllMocks());

test('loads defaults into editable fields', async () => {
  render(<CustomerEmailModal sheetId="s" state="shipped" orderName="Drop" customers={customers} onClose={() => {}} onSent={() => {}} />);
  expect(previewCustomerEmail).toHaveBeenCalledWith('s', 'shipped');
  expect(await screen.findByDisplayValue('Default subj')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Default body')).toBeInTheDocument();
});

test('pre-checks only not-yet-emailed recipients', async () => {
  render(<CustomerEmailModal sheetId="s" state="shipped" orderName="Drop" customers={customers} onClose={() => {}} onSent={() => {}} />);
  const already = await screen.findByLabelText(/a@x.com/);
  const pending = screen.getByLabelText(/b@x.com/);
  expect(already).not.toBeChecked();
  expect(pending).toBeChecked();
});

test('send posts checked recipients and edited content, then calls onSent', async () => {
  const onSent = vi.fn();
  const onClose = vi.fn();
  render(<CustomerEmailModal sheetId="s" state="shipped" orderName="Drop" customers={customers} onClose={onClose} onSent={onSent} />);
  const subj = await screen.findByDisplayValue('Default subj');
  await userEvent.clear(subj);
  await userEvent.type(subj, 'Edited');
  await userEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => expect(sendCustomerEmail).toHaveBeenCalledWith(
    's', 'shipped', [{ name: 'B', email: 'b@x.com' }], 'Edited', 'Default body',
  ));
  await waitFor(() => expect(onSent).toHaveBeenCalledWith('shipped', ['b@x.com'], '2026-07-03T00:00:00Z'));
  expect(onClose).toHaveBeenCalled();
});
