import { useState, useEffect, useRef, useCallback } from 'react';
import { getItems, postItem, putItem, deleteItem as apiDelete, scrapeColors as apiScrape, pushCatalog, pullCatalog } from '../api/items';

export function useItems() {
  const [catalog, setCatalog] = useState({ items: [] });
  const [loading, setLoading] = useState(true);
  const saveTimers = useRef({});

  useEffect(() => {
    getItems().then(setCatalog).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Cancel pending debounced saves so a PUT can't fire after unmount.
  useEffect(() => {
    const timers = saveTimers.current;
    return () => { Object.values(timers).forEach(clearTimeout); };
  }, []);

  const createItem = useCallback(async () => {
    const item = await postItem({ name: 'New Item' });
    setCatalog(prev => ({ ...prev, items: [...prev.items, item] }));
    return item;
  }, []);

  const updateItem = useCallback((updated) => {
    setCatalog(prev => ({
      ...prev,
      items: prev.items.map(i => i.id === updated.id ? updated : i),
    }));
    clearTimeout(saveTimers.current[updated.id]);
    saveTimers.current[updated.id] = setTimeout(() => {
      putItem(updated.id, updated).catch(console.error);
    }, 400);
  }, []);

  const deleteItem = useCallback(async (id) => {
    await apiDelete(id);
    setCatalog(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
  }, []);

  const scrapeColors = useCallback(async (id) => {
    const result = await apiScrape(id);
    if (!result.error) {
      const fresh = await getItems();
      setCatalog(fresh);
    }
    return result;
  }, []);

  const pushToDrive = useCallback(() => pushCatalog(), []);

  const pullFromDrive = useCallback(async () => {
    const result = await pullCatalog();
    if (!result.error) setCatalog(result);
    return result;
  }, []);

  return { catalog, loading, createItem, updateItem, deleteItem, scrapeColors, pushToDrive, pullFromDrive };
}
