/** Last-known agent metadata in this browser (models, fields, starters, data date), shown instantly on load
 *  while the app fetches fresh values (stale-while-revalidate). Only names and dates, never query results. */
const PREFIX = 'revsight-cache:';

export function readCache<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the app still works, just without the instant first paint */
  }
}
