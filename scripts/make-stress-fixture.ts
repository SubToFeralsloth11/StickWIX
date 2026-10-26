/**
 * Writes tests/fixtures/stress-200.stickwix: one scene with 200 patrolling,
 * animated objects on a floor (SC-004 performance fixture).
 * Run: pnpm tsx scripts/make-stress-fixture.ts
 */
import { writeFileSync } from 'node:fs';
import { Project, type ProjectInput } from '../src/model/schema';
import { exportProjectFile } from '../src/storage/project-file';

const W = 960;
const H = 540;
const cells: Record<string, number> = {};
for (let x = 0; x < W / 32; x++) cells[`${x},${Math.floor(H / 32) - 1}`] = 0;

const kinds = [
  { id: 'slime', look: 'builtin:img/slime', w: 32, h: 32 },
  { id: 'bee', look: 'builtin:img/bee', w: 32, h: 32 },
  { id: 'coin', look: 'builtin:img/coin', w: 32, h: 32 },
];

const objects = Array.from({ length: 200 }, (_, i) => {
  const k = kinds[i % kinds.length]!;
  return { id: `o${i}`, kindId: k.id, x: 16 + ((i * 47) % (W - 64)), y: 32 + Math.floor(i / 20) * 44, overrides: {} };
});

const input: ProjectInput = {
  id: 'stress',
  schemaVersion: 1,
  name: 'Stress 200',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  settings: { screenWidth: W, screenHeight: H },
  startSceneId: 'stress-scene',
  tileSets: [{ id: 'ts', name: 'Grass', assetId: 'builtin:tiles/grass', tileSize: 32, columns: 8, count: 152, solid: Array(152).fill(true), oneWay: Array(152).fill(false) }],
  kinds: kinds.map((k) => ({
    id: k.id,
    name: k.id[0]!.toUpperCase() + k.id.slice(1),
    lookId: k.look,
    size: { w: k.w, h: k.h },
    stickers: [
      { id: `${k.id}-patrol`, type: 'patrol', settings: { distance: 128, speed: 40 + (k.w % 7) * 5, axis: k.id === 'bee' ? 'y' : 'x', turnAtEdges: false } },
      { id: `${k.id}-anim`, type: 'animate', settings: { lookId: k.look, fps: 8, loop: true } },
    ],
  })),
  scenes: [{ id: 'stress-scene', name: 'Stress', width: W, height: H, tileLayer: { tileSetId: 'ts', cellSize: 32, cells }, objects }],
};

const project = Project.parse(input);
const zip = await exportProjectFile(project, async () => undefined);
writeFileSync(new URL('../tests/fixtures/stress-200.stickwix', import.meta.url), Buffer.from(await zip.arrayBuffer()));
console.log(`wrote tests/fixtures/stress-200.stickwix (${project.scenes[0]!.objects.length} objects)`);
