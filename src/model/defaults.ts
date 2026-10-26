import { newId } from './ids';
import { Kind, Project, Scene, SCHEMA_VERSION, type Rule, type Trigger, type Action } from './schema';

export function newScene(name = 'Level 1', width = 960, height = 540): Scene {
  return Scene.parse({ id: newId('s'), name, width, height });
}

export function newProject(name = 'My Game'): Project {
  const now = new Date().toISOString();
  const scene = newScene();
  return Project.parse({
    id: newId('p'),
    schemaVersion: SCHEMA_VERSION,
    name,
    createdAt: now,
    updatedAt: now,
    startSceneId: scene.id,
    scenes: [scene],
  });
}

export function newKind(name: string, lookId: string | null = null, w = 32, h = 32): Kind {
  return Kind.parse({ id: newId('k'), name, lookId, size: { w, h } });
}

/** A new rule whose blanks are all unset (state `incomplete`). */
export function newRule(trigger: Trigger, actions: Action[]): Rule {
  return { id: newId('r'), enabled: true, trigger, conditions: { join: 'all', items: [] }, actions };
}
