import { useSyncExternalStore } from "react";

/** Sonner's own id type for a toast. */
export type ToastId = number | string;

/**
 * The plugin's own ledger of the toasts it has put on screen.
 *
 * Sonner keeps two independent copies of the toast list — the `<Toaster/>`'s,
 * which is what you see, and `useSonner()`'s, which is a separate subscriber
 * state pruned *only* by an observer `dismiss` event delivered through a
 * `requestAnimationFrame` hop. Counting the second one means counting something
 * that is at best eventually consistent with the first, and permanently wrong
 * whenever that hop is dropped (a deferred removal landing after the Toaster
 * unmounted never publishes at all) — with no repair path, since nothing else
 * ever prunes it. That is how a "Dismiss all (20)" survives an empty corner.
 *
 * So the affordance counts what *we* handed to sonner instead: one entry per
 * `showToast`, removed on the toast's own exit callbacks. Every exit path a
 * toast has — its timer, the close button, a swipe, a programmatic dismiss —
 * fires `onAutoClose` or `onDismiss`; the action button is the one sonner does
 * not report, and `showToast` owns that handler, so it untracks there itself.
 */
const liveIds = new Set<ToastId>();
const listeners = new Set<() => void>();

/**
 * Snapshot must be a stable primitive: `useSyncExternalStore` compares by identity.
 */
// eslint-disable-next-line scoped-store/no-module-mutable-store -- the toast stack IS page-global: one <ToasterHost/> at Core.Root, one corner, and showToast() is a module-level imperative API callable from anywhere. Per-surface state would count a window's toasts against another window's stack.
let count = 0;

function publish(): void {
  count = liveIds.size;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): number {
  return count;
}

export function trackToast(id: ToastId): void {
  liveIds.add(id);
  publish();
}

export function untrackToast(id: ToastId): void {
  if (liveIds.delete(id)) publish();
}

/**
 * Drop the whole ledger. Called when the stack is swept, and on either edge of
 * the host's lifetime: a freshly mounted `<Toaster/>` starts with an empty list
 * (toasts fired before it subscribed have no renderer), and an unmounted one
 * leaves nothing on screen to count.
 */
export function clearTrackedToasts(): void {
  if (liveIds.size === 0) return;
  liveIds.clear();
  publish();
}

/** Number of toasts currently on screen, as this plugin put them there. */
export function useLiveToastCount(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}
