import { apiFetch } from './client';

export const previewCustomerEmail = (sheetId, state) =>
  apiFetch('/gmail/customer-email/preview', { method: 'POST', body: { sheetId, state } });

export const sendCustomerEmail = (sheetId, state, recipients, subject, body) =>
  apiFetch('/gmail/customer-email/send', { method: 'POST', body: { sheetId, state, recipients, subject, body } });
