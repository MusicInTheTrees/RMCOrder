import { useState, useEffect, useCallback } from 'react';
import { getOrderBySheet, saveOrderToSheet } from '../api/orders';
import { useOfflineQueue } from './useOfflineQueue';

export function useOrder(sheetId) {
  const [order, setOrderState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const { online, enqueue } = useOfflineQueue();

  useEffect(() => {
    if (!sheetId) return;
    getOrderBySheet(sheetId).then(data => {
      setOrderState(data);
      if (data._fromCache) setFromCache(true);
    }).catch(console.error);
  }, [sheetId]);

  const setOrder = useCallback((updater) => {
    setOrderState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;

      const save = () => {
        setSaving(true);
        return saveOrderToSheet(sheetId, next)
          .then(() => setSyncPending(false))
          .catch(() => {
            setSyncPending(true);
            enqueue(() => saveOrderToSheet(sheetId, next).then(() => setSyncPending(false)));
          })
          .finally(() => setSaving(false));
      };

      save();
      return next;
    });
  }, [sheetId, enqueue]);

  return { order, setOrder, saving, offline: !online, syncPending, fromCache };
}
