import { create } from 'zustand';

interface ToastState {
  message: string | null;
  error: boolean;
  seq: number;
}

export const useToast = create<ToastState>(() => ({ message: null, error: false, seq: 0 }));

let timer: ReturnType<typeof setTimeout> | undefined;

/** Shows a short message at the bottom of the screen. */
export function toast(message: string, opts: { error?: boolean; ms?: number } = {}) {
  clearTimeout(timer);
  useToast.setState((s) => ({ message, error: !!opts.error, seq: s.seq + 1 }));
  timer = setTimeout(() => useToast.setState({ message: null }), opts.ms ?? (opts.error ? 5000 : 2600));
}
