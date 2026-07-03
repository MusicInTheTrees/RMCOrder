import { describe, test, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from '../api/client';
import { previewCustomerEmail, sendCustomerEmail } from '../api/customerEmails';
import { EMAIL_STATES } from '../emailStates';

vi.mock('../api/client', () => ({ apiFetch: vi.fn().mockResolvedValue({}) }));

beforeEach(() => vi.clearAllMocks());

test('EMAIL_STATES is the agreed set', () => {
  expect(EMAIL_STATES).toEqual(['sent', 'fulfilled', 'received', 'shipped']);
});

test('previewCustomerEmail POSTs sheetId + state', () => {
  previewCustomerEmail('s', 'shipped');
  expect(apiFetch).toHaveBeenCalledWith('/gmail/customer-email/preview', { method: 'POST', body: { sheetId: 's', state: 'shipped' } });
});

test('sendCustomerEmail POSTs the full payload', () => {
  const recips = [{ name: 'A', email: 'a@x.com' }];
  sendCustomerEmail('s', 'sent', recips, 'Subj', 'Body');
  expect(apiFetch).toHaveBeenCalledWith('/gmail/customer-email/send', { method: 'POST', body: { sheetId: 's', state: 'sent', recipients: recips, subject: 'Subj', body: 'Body' } });
});
