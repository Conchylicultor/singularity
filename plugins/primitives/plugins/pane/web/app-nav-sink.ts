import { useSyncExternalStore } from "react";

/**
 * The seam through which a pane reaches ANOTHER app.
 *
 * A pane can name its home app (`Pane.define({ app })`), so promoting one that
 * is being hosted by a different app has to hand an app-rooted URL to whoever
 * owns the tab set. That owner is `apps-core/tabs` — which imports this
 * primitive, so this primitive cannot import it back. Hence a sink, exactly
 * like {@link HistoryAdapter}: tabs installs its `navigate` at provider mount,
 * and the pane layer calls it without knowing tabs exists.
 *
 * Unset by default. A composition that mounts panes with no tab manager (a
 * test surface, a single-app release) simply has no cross-app destination, and
 * Expand falls back to re-rooting inside the current app rather than painting a
 * control that would do nothing.
 */
export interface AppNavigator {
  /** Put an app-rooted URL on screen — in this tab, or a new one. */
  (url: string, opts?: { newTab?: boolean }): void;
}

// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: the ONE installed cross-app navigator, mirroring the history adapter sink beside it. Written once by the tab manager at provider mount, read from event handlers outside any surface tree.
let navigator: AppNavigator | null = null;
const subscribers = new Set<() => void>();

/**
 * Install the cross-app navigator (tabs, at `TabsProvider` mount).
 *
 * Subscribers are notified because installation happens in an EFFECT, i.e. a
 * commit after the first render. Panes that mounted in that same commit had
 * already asked "is there anywhere to go?" and been told no; without a
 * notification their answer would be cached for the life of the pane, and
 * whether Expand appeared would come down to whether a pane's plugin happened
 * to load before or after the tab provider. That is exactly the kind of
 * mount-order-dependent behavior a subscription removes.
 */
export function setAppNavigator(fn: AppNavigator | null): void {
  if (navigator === fn) return;
  navigator = fn;
  for (const notify of subscribers) notify();
}

/** Non-hook read — for plain-function callers that cannot subscribe. */
export function canNavigateApp(): boolean {
  return navigator !== null;
}

/**
 * Reactive "is there a cross-app destination?" — the form every render path
 * must use, so installing the navigator re-renders the panes that asked early.
 */
export function useCanNavigateApp(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    canNavigateApp,
    () => false,
  );
}

/**
 * Navigate to an app-rooted URL. Throws when no navigator is installed: every
 * caller checks first, so reaching here is a real bug (a control was painted
 * that had nowhere to go), and a loud failure is caught by the crash collector
 * rather than manifesting as a dead click.
 */
export function navigateApp(url: string, opts?: { newTab?: boolean }): void {
  if (!navigator) {
    throw new Error(
      `navigateApp("${url}") with no navigator installed — nothing owns the tab set in this composition.`,
    );
  }
  navigator(url, opts);
}
