import { apiFetch } from './client';

export const computeBlankPlan = (payload) =>
  apiFetch('/blankorder/plan', { method: 'POST', body: payload });

export const getBlankOrderConfig = () => apiFetch('/blankorder/config');
