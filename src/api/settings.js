import { apiFetch } from './client';

export const getSettings = () => apiFetch('/settings');
export const saveSettings = (data) => apiFetch('/settings', { method: 'PUT', body: data });
