import { createContext, useContext, useState, useEffect } from 'react';
import { getBugLog, appendBugLog, clearBugLog } from '../api/buglog';

const BugLogContext = createContext({ logError: () => {}, entries: [], clear: async () => {} });

export function BugLogProvider({ children }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    getBugLog().then(setEntries).catch(() => {});
  }, []);

  function logError(message) {
    const entry = { timestamp: new Date().toISOString(), message };
    setEntries(prev => [...prev, entry]);
    appendBugLog(entry).catch(() => {});
  }

  async function clear() {
    await clearBugLog();
    setEntries([]);
  }

  return (
    <BugLogContext.Provider value={{ logError, entries, clear }}>
      {children}
    </BugLogContext.Provider>
  );
}

export function useBugLog() {
  return useContext(BugLogContext);
}
