/**
 * Simple shared state for the discover filter page.
 * Uses a module-level ref so filter state survives navigation transitions.
 * In a larger app this would be Zustand/Jotai, but a plain module ref is fine here.
 */
import { useState, useEffect } from 'react';

export type DiscoverFilters = {
  sport?: string;
  teams?: string[];
  after?: string;
  before?: string;
  venue?: string;
  useFavourites?: boolean;
};

let _filters: DiscoverFilters = {};
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

export function getFilters() {
  return _filters;
}

export function setFiltersGlobal(next: DiscoverFilters) {
  _filters = next;
  notify();
}

export function clearFiltersGlobal() {
  _filters = {};
  notify();
}

export function useDiscoverFilters() {
  const [, rerender] = useState(0);

  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  }, []);

  return {
    filters: _filters,
    setFilters: (next: DiscoverFilters) => setFiltersGlobal(next),
    clearFilters: clearFiltersGlobal,
  };
}

export function activeFilterCount(f: DiscoverFilters) {
  return (
    (f.sport ? 1 : 0) +
    (f.teams?.length ?? 0) +
    (f.after ? 1 : 0) +
    (f.before ? 1 : 0) +
    (f.venue ? 1 : 0) +
    (f.useFavourites ? 1 : 0)
  );
}
