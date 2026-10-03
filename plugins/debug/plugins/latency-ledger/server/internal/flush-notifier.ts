// The summary value's change source, as a pure object so its rules are
// testable without a resource runtime: which windows are subscribed (each with
// the notify for its tuple), and the monotonic minute guard. summary-resource
// binds `subscribe` to serveValue's `whileSubscribed` and the recorder calls
// `flushed` after every minute it writes.

/** Stops what `subscribe` began. */
export type Unsubscribe = () => void;

export interface FlushNotifier<W> {
  /** A tab subscribed to `window`; the returned stop runs when the last leaves. */
  subscribe(window: W, notify: () => void): Unsubscribe;
  /** A minute was written: notify every subscribed window, once per minute. */
  flushed(minuteStart: number): void;
}

export function createFlushNotifier<W>(): FlushNotifier<W> {
  // The windows someone is looking at — so a flush touches only those.
  const subscribed = new Map<W, () => void>();
  // The last minute written. In memory: after a restart the first flush always
  // notifies, and a card mounting before it loads current truth anyway.
  let lastFlushedMinute = 0;
  return {
    subscribe(window, notify) {
      subscribed.set(window, notify);
      return () => {
        subscribed.delete(window);
      };
    },
    flushed(minuteStart) {
      if (minuteStart <= lastFlushedMinute) return;
      lastFlushedMinute = minuteStart;
      for (const notify of subscribed.values()) notify();
    },
  };
}
