import { useCallback, useRef, useState } from 'react';
import type { AdminConfig } from '../../../lib/types';
import { getConfig, saveConfig } from '../../../lib/api';

const DEFAULT_CONFIG: AdminConfig = {
  desktop_python_path: '',
  provider: 'openai',
  model: 'gpt-4o-mini',
  base_url: '',
  api_key: '',
  temperature: 0.5,
  smtp_server: '',
  smtp_port: 465,
  sender: '',
  receiver: '',
  smtp_password: '',
  gh_languages: 'all',
  gh_since: 'daily',
  gh_max_repos: 30,
  hf_content_types: ['papers', 'models'],
  hf_max_papers: 30,
  hf_max_models: 15,
  description: '',
  researcher_profile: '',
  x_rapidapi_key: '',
  x_accounts: '',
  arxiv_categories: 'cs.AI',
  arxiv_max_entries: 100,
  arxiv_max_papers: 60,
  ss_max_results: 60,
  ss_max_papers: 30,
  ss_year: '',
  ss_api_key: '',
  schedule_enabled: false,
  schedule_frequency: 'daily',
  schedule_time: '08:00',
  schedule_sources: [],
  schedule_generate_report: false,
  schedule_generate_ideas: false,
};

export function useConfig() {
  const [config, setConfig] = useState<AdminConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const loadedRef = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getConfig();
      setConfig({ ...DEFAULT_CONFIG, ...data });
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
      loadedRef.current = true;
    }
  }, []);

  const update = useCallback((patch: Partial<AdminConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await saveConfig(config);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, [config]);

  return { config, loading, saving, update, save, reload };
}
