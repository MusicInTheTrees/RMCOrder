import { apiFetch } from './client';

export function refreshBlankStats() {
  return apiFetch('/stats/refresh', { method: 'POST' });
}
