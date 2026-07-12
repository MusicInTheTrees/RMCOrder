import { useState, useEffect, useRef, useCallback } from 'react';

const FLUSH_INTERVAL_MS = 10000;

// Queue of pending saves keyed by target (e.g. sheetId). Saves are last-write-wins,
// so only the latest snapshot per key is kept. Flushes run sequentially, only while
// online, and a failed save stays queued for the next attempt.
export function useOfflineQueue() {
  const [online, setOnline] = useState(navigator.onLine);
  const [queueLength, setQueueLength] = useState(0);
  const queue = useRef(new Map());
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current || queue.current.size === 0 || !navigator.onLine) return;
    flushing.current = true;
    try {
      const entries = [...queue.current.entries()];
      queue.current.clear();
      for (const [key, fn] of entries) {
        try {
          await fn();
        } catch {
          // Keep the failed save for the next flush unless a newer one arrived.
          if (!queue.current.has(key)) queue.current.set(key, fn);
        }
      }
    } finally {
      flushing.current = false;
      setQueueLength(queue.current.size);
    }
  }, []);

  useEffect(() => {
    const goOnline = () => { setOnline(true); flush(); };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [flush]);

  useEffect(() => {
    const interval = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [flush]);

  const enqueue = useCallback((key, fn) => {
    queue.current.set(key, fn);
    setQueueLength(queue.current.size);
  }, []);

  return { online, enqueue, queueLength };
}
