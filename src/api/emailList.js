import { apiFetch } from './client';

export const getContacts = () => apiFetch('/emaillist');
export const addContact = (data) => apiFetch('/emaillist', { method: 'POST', body: data });
export const updateContact = (email, fields) =>
  apiFetch(`/emaillist/${encodeURIComponent(email)}`, { method: 'PUT', body: fields });
export const runBackfill = () => apiFetch('/emaillist/backfill', { method: 'POST' });
export const deleteContact = (email) =>
  apiFetch(`/emaillist/${encodeURIComponent(email)}`, { method: 'DELETE' });
export const bulkAction = (emails, action) =>
  apiFetch('/emaillist/bulk', { method: 'POST', body: { emails, action } });
export const syncSheet = () => apiFetch('/emaillist/sync', { method: 'POST' });
