import { useState, useEffect, useCallback, useRef } from 'react';
import { getOrderBySheet, saveOrderToSheet } from '../api/orders';
import { useOfflineQueue } from './useOfflineQueue';

export function useOrder(sheetId, { onError } = {}) {
  const [order, setOrderState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const { online, enqueue } = useOfflineQueue();
  const pendingDataRef = useRef(null);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    if (!sheetId) return;
    getOrderBySheet(sheetId).then(data => {
      setOrderState(data);
      if (data._fromCache) setFromCache(true);
    }).catch(console.error);
  }, [sheetId]);

  const doSave = useCallback((data, { full = false } = {}) => {
    setSaving(true);
    return saveOrderToSheet(sheetId, data, full)
      .then(() => setSyncPending(false))
      .catch((err) => {
        setSyncPending(true);
        onError?.(err.message);
        enqueue(() => saveOrderToSheet(sheetId, data).then(() => setSyncPending(false)));
      })
      .finally(() => setSaving(false));
  }, [sheetId, enqueue, onError]);

  const setOrder = useCallback((updater) => {
    setOrderState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      pendingDataRef.current = next;
      return next;
    });

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (pendingDataRef.current) {
        doSave(pendingDataRef.current, { full: false });
      }
    }, 500);
  }, [doSave]);

  const saveNow = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    const data = pendingDataRef.current;
    if (data) return doSave(data, { full: true });
    return Promise.resolve({ skipped: true });
  }, [doSave]);

  return { order, setOrder, saving, offline: !online, syncPending, fromCache, saveNow };
}
