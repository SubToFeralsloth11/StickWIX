import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

/** A one-line plain-English explanation on hover or keyboard focus (FR-038). */
export function HelpTip({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        {children ?? (
          <button type="button" className="help-dot" aria-label={text}>
            ?
          </button>
        )}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6} collisionPadding={8}>
          {text}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
