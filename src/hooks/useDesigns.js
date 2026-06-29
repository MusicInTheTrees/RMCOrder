import { useState, useEffect, useCallback } from 'react';
import { listDesigns, refreshDesigns } from '../api/designs';
import { useBugLog } from '../context/BugLogContext';

export function useDesigns() {
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const { logError } = useBugLog();

  useEffect(() => {
    listDesigns()
      .then(setDesigns)
      .catch(() => {
        const msg = "Couldn't reach Drive — showing cached designs";
        setToast(msg);
        logError(msg);
      });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await refreshDesigns();
      const updated = await listDesigns();
      setDesigns(updated);
    } catch {
      const msg = "Couldn't reach Drive — showing cached designs";
      setToast(msg);
      logError(msg);
    } finally {
      setLoading(false);
    }
  }, [logError]);

  return { designs, loading, toast, clearToast: () => setToast(null), refresh };
}
