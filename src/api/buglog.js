import { apiFetch } from './client';

export const getBugLog = () => apiFetch('/buglog');
export const appendBugLog = (entry) => apiFetch('/buglog/append', { method: 'POST', body: entry });
export const clearBugLog = () => apiFetch('/buglog', { method: 'DELETE' });
