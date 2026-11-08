const registered = new WeakMap<unknown[], Map<string, unknown>>();

/**
 * Adds `item` to an extension list under `key`, replacing an earlier entry with
 * the same key. Registration modules re-run on hot reload; plain `push` would
 * stack duplicates (eight Help buttons).
 */
export function register<T>(list: T[], key: string, item: T): void {
  let byKey = registered.get(list);
  if (!byKey) registered.set(list, (byKey = new Map()));
  const old = byKey.get(key) as T | undefined;
  const i = old === undefined ? -1 : list.indexOf(old);
  if (i >= 0) list[i] = item;
  else list.push(item);
  byKey.set(key, item);
}
