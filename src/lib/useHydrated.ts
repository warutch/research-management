import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';

/**
 * Returns true once:
 *  1. Component is mounted on client (avoids hydration mismatch)
 *  2. Store has finished loading data from Supabase
 *
 * If AuthGuard already handles loading, this just returns mounted state.
 */
export function useHydrated() {
  const [mounted, setMounted] = useState(false);
  const dataLoaded = useStore((s) => s.dataLoaded);

  useEffect(() => { setMounted(true); }, []);
  return mounted && dataLoaded;
}
