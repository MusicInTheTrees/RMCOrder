import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect } from 'vitest';
import CustomersPanel from '../components/CustomersPanel';

test('pasting adds parsed rows via onChange', async () => {
  const onChange = vi.fn();
  render(<CustomersPanel customers={[]} onChange={onChange} onSend={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /paste/i }));
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
  render(<CustomersPanel customers={customers} onChange={onChange} onSend={() => {}} />);
  await userEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
  expect(onChange).toHaveBeenCalledWith([{ name: 'B', email: 'b@x.com', emailed: {} }]);
});

test('send button fires onSend with the state', async () => {
  const onSend = vi.fn();
  render(<CustomersPanel customers={[{ name: 'A', email: 'a@x.com', emailed: {} }]} onChange={() => {}} onSend={onSend} />);
  await userEvent.click(screen.getByRole('button', { name: /send shipped/i }));
  expect(onSend).toHaveBeenCalledWith('shipped');
});

test('shows how many still need each email', () => {
  const customers = [
    { name: 'A', email: 'a@x.com', emailed: { sent: '2026-07-03T00:00:00Z' } },
    { name: 'B', email: 'b@x.com', emailed: {} },
  ];
  render(<CustomersPanel customers={customers} onChange={() => {}} onSend={() => {}} />);
  expect(screen.getByTestId('pending-sent')).toHaveTextContent('1 of 2 not yet emailed');
});
