import { describe, expect, it } from 'vitest';
import { register } from '@/editor/registry';

describe('register', () => {
  it('replaces an entry registered again under the same key (hot reload) instead of adding a copy', () => {
    const list: string[] = ['built-in'];
    register(list, 'help', 'help v1');
    register(list, 'export', 'export v1');
    register(list, 'help', 'help v2');
    expect(list).toEqual(['built-in', 'help v2', 'export v1']);
  });
});
