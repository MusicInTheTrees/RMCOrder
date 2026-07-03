import { apiFetch } from './client';

export const previewCustomerEmail = (sheetId, state) =>
  apiFetch('/gmail/customer-email/preview', { method: 'POST', body: { sheetId, state } });

export const generateCustomerDrafts = (sheetId, state) =>
  apiFetch('/gmail/customer-email/draft', { method: 'POST', body: { sheetId, state } });

export const sendCustomerEmail = (sheetId, state, recipients) =>
  apiFetch('/gmail/customer-email/send', { method: 'POST', body: { sheetId, state, recipients } });

export const getStatusEmailTemplates = () =>
  apiFetch('/gmail/customer-email/templates');

export const saveStatusEmailTemplates = (data) =>
  apiFetch('/gmail/customer-email/templates', { method: 'PUT', body: data });
