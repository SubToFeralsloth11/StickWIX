import type { TileSet } from '@/model/schema';
import { editorStore } from '../store';
import * as ops from '../store/world-ops';

type Kind = 'none' | 'solid' | 'oneWay';

/** Marks the chosen tile as passable, solid or jump-through for every scene using this tile set (FR-007). */
export function TileSetEditor({ tileSet, index }: { tileSet: TileSet; index: number }) {
  const current: Kind = tileSet.oneWay[index] ? 'oneWay' : tileSet.solid[index] ? 'solid' : 'none';
  const set = (k: Kind) =>
    editorStore.getState().edit('Change tile', (d) => ops.setTileSolid(d, tileSet.id, index, k !== 'none', k === 'oneWay'));
  return (
    <div className="section">
      <h4>Tile {index + 1} is…</h4>
      <div className="row" role="radiogroup" aria-label="Tile behaviour">
        {(
          [
            ['none', 'Background', 'Things pass through it'],
            ['solid', 'Solid', 'Walls and floors: nothing passes through'],
            ['oneWay', 'Jump-through', 'Stand on top, jump up through it from below'],
          ] as const
        ).map(([k, label, help]) => (
          <button key={k} role="radio" aria-checked={current === k} className={`btn small ${current === k ? 'on' : ''}`} title={help} onClick={() => set(k)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
