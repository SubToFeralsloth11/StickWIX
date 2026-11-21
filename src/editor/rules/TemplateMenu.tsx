import * as Popover from '@radix-ui/react-popover';
import { useMemo, useState, type ReactNode } from 'react';
import { grouped, type Template } from '@/model/rule-templates';
import '../features.css';

/** Lower-case words; "touching" matches "touches" through a shared 5-letter start. */
function matches(query: string, hay: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const h = hay.toLowerCase();
  return words.every((w) => h.includes(w) || (w.length > 4 && h.includes(w.slice(0, 5))));
}

/**
 * A searchable menu of rule parts (triggers, checks or actions), grouped by
 * section. Typing filters every group at once; Enter picks the first match.
 */
export function TemplateMenu<T>({
  trigger,
  templates,
  onPick,
  title,
  open: openProp,
  onOpenChange,
  stayOpen,
}: {
  trigger: ReactNode;
  templates: Record<string, Template<T>>;
  onPick: (key: string) => void;
  title?: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  /** Picking keeps the menu open (multi-step menus swap `templates` instead). */
  stayOpen?: boolean;
}) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own;
  const setOpen = (o: boolean) => {
    setOwn(o);
    onOpenChange?.(o);
    if (!o) setQuery('');
  };
  const [query, setQuery] = useState('');
  const groups = useMemo(() => grouped(templates), [templates]);
  const shown = groups
    .map(([g, items]) => [g, items.filter(([, t]) => !query || matches(query, `${t.label} ${t.help} ${g}`))] as const)
    .filter(([, items]) => items.length);
  const first = shown[0]?.[1][0]?.[0];
  const choose = (k: string) => {
    if (stayOpen) setQuery('');
    else setOpen(false);
    onPick(k);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pop tmenu" sideOffset={6} align="start" collisionPadding={10}>
          {title && <h6>{title}</h6>}
          <input
            className="field tmenu-search"
            placeholder="Search… (e.g. mouse, break, sound)"
            value={query}
            autoFocus
            aria-label="Search"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && first) {
                e.preventDefault();
                choose(first);
              }
            }}
          />
          <div className="tmenu-groups">
            {shown.map(([g, items]) => (
              <section key={g}>
                <h6>{g}</h6>
                {items.map(([k, t]) => (
                  <button key={k} className="opt" onClick={() => choose(k)}>
                    <span>
                      {t.label}
                      <small>{t.help}</small>
                    </span>
                  </button>
                ))}
              </section>
            ))}
            {!shown.length && <div className="dim" style={{ padding: 8 }}>Nothing matches “{query}”.</div>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
