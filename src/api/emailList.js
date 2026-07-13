import { apiFetch } from './client';

export const getContacts = () => apiFetch('/emaillist');
export const addContact = (data) => apiFetch('/emaillist', { method: 'POST', body: data });
export const updateContact = (email, fields) =>
  apiFetch(`/emaillist/${encodeURIComponent(email)}`, { method: 'PUT', body: fields });
export const runBackfill = () => apiFetch('/emaillist/backfill', { method: 'POST' });
