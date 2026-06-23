import type { ReactNode } from "react";

/**
 * One open imperative dialog: its stable id, the already-rendered content node,
 * and the resolver that settles the `openDialog()` promise when it closes.
 */
interface DialogEntry {
  id: number;
  node: ReactNode;
  resolve: () => void;
}

let nextId = 1;
let entries: readonly DialogEntry[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** `useSyncExternalStore` subscribe. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `useSyncExternalStore` snapshot — the current open-dialog list (stable ref between changes). */
export function getOpenDialogs(): readonly DialogEntry[] {
  return entries;
}

/** Close one dialog by id, settling its `openDialog()` promise. Idempotent. */
export function closeDialog(id: number): void {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  entries = entries.filter((e) => e.id !== id);
  emit();
  entry.resolve();
}

/**
 * Mount a modal dialog imperatively from any callback (no JSX host, no ref).
 * `render` receives a `close` callback to dismiss the dialog from inside its
 * content; the returned promise resolves once the dialog closes (via `close`,
 * Escape, or backdrop). Mirrors the toaster's global-host pattern: a single
 * `ImperativeDialogHost` (Core.Root) renders whatever is pushed here.
 */
export function openDialog(
  render: (close: () => void) => ReactNode,
): Promise<void> {
  const id = nextId++;
  return new Promise<void>((resolve) => {
    const node = render(() => closeDialog(id));
    entries = [...entries, { id, node, resolve }];
    emit();
  });
}

export type { DialogEntry };
