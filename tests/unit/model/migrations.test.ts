import { describe, expect, it } from 'vitest';
import { migrate, NewerVersionError } from '@/model/migrations';
import { SCHEMA_VERSION } from '@/model/schema';
import { newProject } from '@/model/defaults';

describe('migrate', () => {
  it('upgrades a v0 document to the current version', () => {
    const { schemaVersion: _v, tourCompleted: _t, ...rest } = newProject('Old');
    const v0 = { ...rest, settings: { ...rest.settings, showMeKey: undefined, showMe: 'F4' } };
    const p = migrate(v0);
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    expect(p.settings.showMeKey).toBe('F4');
    expect(p.tourCompleted).toBe(false);
  });

  it('passes current documents through unchanged', () => {
    const p = newProject('Now');
    expect(migrate(structuredClone(p))).toEqual(p);
  });

  it('rejects documents from a newer StickWIX', () => {
    expect(() => migrate({ ...newProject(), schemaVersion: SCHEMA_VERSION + 1 })).toThrow(NewerVersionError);
  });

  it('rejects non-objects and invalid documents', () => {
    expect(() => migrate('hello')).toThrow();
    expect(() => migrate({ schemaVersion: 1, name: 'x' })).toThrow();
  });
});
