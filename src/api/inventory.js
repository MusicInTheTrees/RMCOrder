import { apiFetch } from './client';

export const getInventory = () => apiFetch('/inventory');

export const getInventoryStyles = () => apiFetch('/inventory/styles');

export const decrementInventory = (items) =>
  apiFetch('/inventory/decrement', { method: 'POST', body: items });
