const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Short random id, unique within a project in practice (36^10 space). */
export function newId(prefix = ''): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let s = prefix;
  for (const b of bytes) s += ALPHABET[b % 36];
  return s;
}

/** Returns `base`, or `base 2`, `base 3`, ... - the first name not already taken (case-insensitive). */
export function uniqueName(base: string, taken: Iterable<string>, max = 40): string {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base.slice(0, max);
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const name = base.slice(0, max - suffix.length) + suffix;
    if (!used.has(name.toLowerCase())) return name;
  }
}
