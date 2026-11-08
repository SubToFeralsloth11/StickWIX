import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useState } from 'react';
import type { StickerType } from '@/model/sticker-settings';
import { STICKERS } from '@/runtime/stickers';
import { ConfirmDialog } from '../ConfirmDialog';
import { editorStore } from '../store';
import * as ops from '../store/world-ops';

const GROUPS: { cat: string; title: string }[] = [
  { cat: 'controller', title: 'Movement (pick one)' },
  { cat: 'physics', title: 'Physics' },
  { cat: 'gameplay', title: 'Gameplay' },
  { cat: 'input', title: 'Mouse' },
  { cat: 'visual', title: 'Camera & looks' },
];

/** Adds a sticker; a second controller asks to replace the first (FR-012). */
export function AddStickerMenu({ kindId, kindName, have }: { kindId: string; kindName: string; have: StickerType[] }) {
  const [conflict, setConflict] = useState<{ type: StickerType; current: StickerType } | null>(null);
  const add = (type: StickerType, replace = false) => {
    let result: ops.AddStickerResult | null = null;
    editorStore.getState().edit(`Add ${STICKERS[type].label}`, (d) => void (result = ops.addSticker(d, kindId, type, { replace })));
    const r = result as ops.AddStickerResult | null;
    if (r && !r.ok) setConflict({ type, current: r.conflict.type });
  };
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} data-testid="add-sticker" data-tour="add-sticker">
            ＋ Add a sticker
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="pop" sideOffset={6} align="start">
            {GROUPS.map((g) => (
              <DropdownMenu.Group key={g.cat}>
                <h6>{g.title}</h6>
                {Object.values(STICKERS)
                  .filter((m) => m.category === g.cat)
                  .map((m) => (
                    <DropdownMenu.Item key={m.type} className="opt" disabled={have.includes(m.type)} onSelect={() => add(m.type)} data-testid={`add-${m.type}`}>
                      <span>
                        {m.label}
                        {have.includes(m.type) && ' ✓'}
                        <small>{m.help}</small>
                      </span>
                    </DropdownMenu.Item>
                  ))}
              </DropdownMenu.Group>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {conflict && (
        <ConfirmDialog
          title="Only one way to move"
          body={
            <p>
              {kindName} already has the <b>{STICKERS[conflict.current].label}</b>. An object can only have one movement sticker. Replace it with the{' '}
              <b>{STICKERS[conflict.type].label}</b>?
            </p>
          }
          confirm="Replace it"
          onCancel={() => setConflict(null)}
          onConfirm={() => {
            const t = conflict.type;
            setConflict(null);
            add(t, true);
          }}
        />
      )}
    </>
  );
}
