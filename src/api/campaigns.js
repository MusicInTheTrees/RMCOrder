import { apiFetch } from './client';

export const getJobs = () => apiFetch('/campaigns/jobs');
export const createJob = (data) => apiFetch('/campaigns/jobs', { method: 'POST', body: data });
export const cancelJob = (id) => apiFetch(`/campaigns/jobs/${id}/cancel`, { method: 'POST' });
export const rescheduleJob = (id, sendAt) =>
  apiFetch(`/campaigns/jobs/${id}/reschedule`, { method: 'POST', body: { sendAt } });
