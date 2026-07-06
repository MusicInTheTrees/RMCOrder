import { test, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from '../api/client';
import { previewCustomerEmail, sendCustomerEmail, generateCustomerDrafts, getStatusEmailTemplates, saveStatusEmailTemplates } from '../api/customerEmails';
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

test('generateCustomerDrafts POSTs sheetId + state', () => {
  generateCustomerDrafts('s', 'shipped');
  expect(apiFetch).toHaveBeenCalledWith('/gmail/customer-email/draft', { method: 'POST', body: { sheetId: 's', state: 'shipped' } });
});

test('sendCustomerEmail POSTs recipients (no subject/body)', () => {
  const recips = [{ name: 'A', email: 'a@x.com' }];
  sendCustomerEmail('s', 'sent', recips);
  expect(apiFetch).toHaveBeenCalledWith('/gmail/customer-email/send', { method: 'POST', body: { sheetId: 's', state: 'sent', recipients: recips } });
});

test('getStatusEmailTemplates GETs templates', () => {
  getStatusEmailTemplates();
  expect(apiFetch).toHaveBeenCalledWith('/gmail/customer-email/templates');
});

test('saveStatusEmailTemplates PUTs the payload', () => {
  const data = { templates: {}, genericCustomerName: 'Cat Pal' };
  saveStatusEmailTemplates(data);
  expect(apiFetch).toHaveBeenCalledWith('/gmail/customer-email/templates', { method: 'PUT', body: data });
});
