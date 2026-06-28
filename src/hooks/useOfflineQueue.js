import { useState, useEffect, useRef, useCallback } from 'react';

export function useOfflineQueue() {
  const [online, setOnline] = useState(navigator.onLine);
  const queue = useRef([]);
  const flushing = useRef(false);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (online && queue.current.length > 0 && !flushing.current) {
      flushing.current = true;
      const items = [...queue.current];
      queue.current = [];
      Promise.all(items.map(fn => fn())).finally(() => { flushing.current = false; });
    }
  }, [online]);

  const enqueue = useCallback((fn) => {
    queue.current.push(fn);
  }, []);

  return { online, enqueue, queueLength: queue.current.length };
}
