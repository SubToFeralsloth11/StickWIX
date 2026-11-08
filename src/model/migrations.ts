import { Project, SCHEMA_VERSION } from './schema';

export class NewerVersionError extends Error {
  constructor(version: number) {
    super(`This project was made with a newer StickWIX (version ${version}).`);
  }
}

type Doc = Record<string, unknown>;

/**
 * Upgrade steps keyed by the version they upgrade FROM.
 * v0 (pre-release) stored `settings.showMeKey` as `showMe` and had no tourCompleted.
 */
const STEPS: Record<number, (doc: Doc) => Doc> = {
  0: (doc) => {
    const settings = { ...((doc.settings as Doc) ?? {}) };
    if ('showMe' in settings) {
      settings.showMeKey = settings.showMe;
      delete settings.showMe;
    }
    return { ...doc, settings, tourCompleted: doc.tourCompleted ?? false, schemaVersion: 1 };
  },
};

/** Runs migrations up to SCHEMA_VERSION, then validates. Throws on newer versions or invalid documents. */
export function migrate(raw: unknown): Project {
  if (typeof raw !== 'object' || raw === null) throw new Error('Not a StickWIX project.');
  let doc = raw as Doc;
  let version = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 0;
  if (version > SCHEMA_VERSION) throw new NewerVersionError(version);
  while (version < SCHEMA_VERSION) {
    const step = STEPS[version];
    if (!step) throw new Error(`No migration from schema version ${version}.`);
    doc = step(doc);
    version = doc.schemaVersion as number;
  }
  return Project.parse(doc);
}
