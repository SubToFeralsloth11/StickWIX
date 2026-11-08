import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

/** A plain yes/no dialog. Escape or clicking outside cancels. */
export function ConfirmDialog(props: {
  title: string;
  body: ReactNode;
  confirm: string;
  danger?: boolean;
  extra?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && props.onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-bg" />
        <Dialog.Content className="dialog" aria-describedby={undefined}>
          <Dialog.Title asChild>
            <h2>{props.title}</h2>
          </Dialog.Title>
          <div>{props.body}</div>
          <div className="actions">
            {props.extra}
            <button className="btn" onClick={props.onCancel}>
              Cancel
            </button>
            <button className={`btn ${props.danger ? 'danger solid' : 'primary'}`} onClick={props.onConfirm} autoFocus>
              {props.confirm}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
