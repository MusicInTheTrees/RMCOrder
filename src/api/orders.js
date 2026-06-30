import { apiFetch } from './client';

export const listOrders = () => apiFetch('/orders');
export const createOrder = () => apiFetch('/orders', { method: 'POST' });
export const getOrderBySheet = (sheetId) => apiFetch(`/sheets/order/${sheetId}`);
export const saveOrderToSheet = (sheetId, data, full = false) =>
  apiFetch(`/sheets/order/${sheetId}${full ? '?full=1' : ''}`, { method: 'PUT', body: data });
export const updateOrderState = (sheetId, state, data) =>
  saveOrderToSheet(sheetId, { ...data, state });
