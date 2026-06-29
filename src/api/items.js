import { apiFetch } from './client';

export const getItems      = ()        => apiFetch('/items');
export const postItem      = (data)    => apiFetch('/items', { method: 'POST', body: data });
export const putItem       = (id, data)=> apiFetch(`/items/${id}`, { method: 'PUT', body: data });
export const deleteItem    = (id)      => apiFetch(`/items/${id}`, { method: 'DELETE' });
export const scrapeColors  = (id)      => apiFetch(`/items/${id}/scrape-colors`, { method: 'POST' });
export const pushCatalog   = ()        => apiFetch('/items/push', { method: 'POST' });
export const pullCatalog   = ()        => apiFetch('/items/pull', { method: 'POST' });
