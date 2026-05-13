import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicMeta } from '../../../lib/types';
import { getMeta } from '../../../lib/api';

const DEFAULT_META: PublicMeta = {
  github_url: 'https://github.com/LiYu0524/daily-recommender',
  twitter_enabled: false,
  mail_enabled: false,
};

export function useBackendHealth() {
  const [connected, setConnected] = useState<boolean | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch('/api/public/meta');
      setConnected(res.ok);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [check]);

  return { connected, check };
}

export function useMeta() {
  const [meta, setMeta] = useState<PublicMeta>(DEFAULT_META);
  const [loading, setLoading] = useState(true);
  const notified = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getMeta()
      .then((data) => { if (!cancelled) setMeta(data); })
      .catch(() => {
        if (!cancelled && !notified.current) {
          notified.current = true;
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { meta, loading };
}
