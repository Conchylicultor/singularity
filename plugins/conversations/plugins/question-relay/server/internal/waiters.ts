// The await long-poll's wake-up: an in-process map from tool-use id to the
// requests held on it. The write that resolves a question (answer, release,
// abandon) wakes them; nothing re-checks on a timer. A request held here and a
// write landing on ANOTHER backend (a hot swap mid-hold) meet at the hold's cap,
// which re-reads the row.

const waiters = new Map<string, Set<() => void>>();

/**
 * Register a wait on `toolUseId` BEFORE reading the row (so a write landing in
 * between still wakes it). Resolves on {@link wakeQuestion}, `capMs`, or
 * `signal` (the client went away) — whichever is first. `cancel` drops it.
 */
export function waitForQuestion(
  toolUseId: string,
  capMs: number,
  signal: AbortSignal,
): { done: Promise<void>; cancel: () => void } {
  let wake!: () => void;
  const done = new Promise<void>((resolve) => {
    wake = resolve;
  });
  const set = waiters.get(toolUseId) ?? new Set();
  waiters.set(toolUseId, set);
  const timer = setTimeout(() => cancel(), capMs);
  const onAbort = () => cancel();
  signal.addEventListener("abort", onAbort, { once: true });
  function cancel(): void {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    set.delete(cancel);
    if (set.size === 0 && waiters.get(toolUseId) === set) {
      waiters.delete(toolUseId);
    }
    wake();
  }
  set.add(cancel);
  return { done, cancel };
}

/** Wake every request held on `toolUseId`. */
export function wakeQuestion(toolUseId: string): void {
  const set = waiters.get(toolUseId);
  if (!set) return;
  for (const cancel of [...set]) cancel();
}
