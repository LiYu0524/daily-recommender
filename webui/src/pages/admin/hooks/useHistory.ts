import { useCallback, useState } from 'react';
import type { HistoryEntry } from '../../../lib/types';
import { getHistory } from '../../../lib/api';

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getHistory();
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { entries, loading, reload };
}
