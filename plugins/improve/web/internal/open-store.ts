/**
 * Module-level store owning the Improve popover's open state + seed text.
 *
 * Replaces the former `Improve.OpenWithText` command: cross-plugin callers invoke
 * the plain exported `openImproveWithText(text)` setter, and the single always-mounted
 * `ImproveButton` (`ActionBar.Item` — the global action bar mounts its two locations
 * mutually-exclusively, so it is never double-mounted) renders the popover as
 * controlled state read via `useSyncExternalStore`. The store is the single source of
 * truth — no local `useState`/effect in the button — so there is no setState-in-effect.
 *
 * The snapshot is a stable object ref (a fresh object only on a real state change), so
 * `useSyncExternalStore` never loops — mirrors the composition/imperative-dialog stores.
 */
interface ImproveOpenState {
  open: boolean;
  text: string;
}

let state: ImproveOpenState = { open: false, text: "" };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Open the Improve popover seeded with `text`. Fire-and-forget setter. */
export function openImproveWithText(text: string): void {
  state = { open: true, text };
  emit();
}

/** Controlled `onOpenChange` handler: opening keeps the current seed, closing clears it. */
export function setImproveOpen(open: boolean): void {
  if (open === state.open) return;
  state = open ? { open: true, text: state.text } : { open: false, text: "" };
  emit();
}

/** `useSyncExternalStore` subscribe. */
export function subscribeImproveOpen(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `useSyncExternalStore` snapshot — the current open state (stable ref between changes). */
export function getImproveOpenState(): ImproveOpenState {
  return state;
}
