import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
} from "react";
import type { ReactNode } from "react";
import { defineScopedStore } from "@plugins/primitives/plugins/scoped-store/web";

/**
 * The DOM node that belongs to ONE mounted instance.
 *
 * The app mounts the same surface more than once at a time, on three axes:
 * every open tab stays mounted (`apps-core/tab-surface` hides the unfocused
 * ones with `display:none`, so a ⌘-click on any in-app link is enough), several
 * floating windows are visible at once, and miller columns can show two panes of
 * one app side by side. So a component that reaches for the WHOLE DOCUMENT to
 * find something its own instance rendered can answer with another instance's
 * element — `document.querySelector` returns the first match in DOM order, which
 * may be a hidden background tab's node: all-zero rects, not hit-testable. The
 * failure is silent and total.
 *
 * When the asker OWNS the element, a plain ref settles it and this primitive is
 * not needed. This exists for the case where it does not: an overlay that renders
 * BESIDE a scroller cannot ref the node and cannot walk up to it, because it is
 * not a descendant. The element has to be published by a descendant and read by a
 * sibling, through a scope the common ancestor declares.
 *
 * `dom-scope` is `install-sink`'s discipline with `scoped-store`'s lifetime:
 *
 *  - from `install-sink` — `{ name, what }` so a missing host names itself, the
 *    rule that the only render-path presence answer is a SUBSCRIPTION (a callback
 *    ref fills one commit after a reader's first render, exactly like a late
 *    install), and the `peek…` naming that lets `install-sink/no-render-phase-peek`
 *    keep the imperative sample out of render with no new lint code;
 *  - from `scoped-store` — the lifetime. A module-level slot would have two
 *    mounted editors fighting over one value, which is the tearing `scoped-store`
 *    exists to prevent. State per `<Provider>` mount is the whole fix.
 *
 * `useSurfaceTabId()` cannot key this: miller columns live inside one tab, so two
 * editors on `/pages/page/:a/page/:a` share a `tabId`. React tree position is the
 * only key that separates all three axes, which is what a `<Provider>` is.
 */

export interface DomScopeOptions {
  /** Stable identity, used in every throw. E.g. `"page.block-content"`. */
  name: string;
  /** What the element is, and who publishes it — the second half of a throw. */
  what: string;
  /**
   * The DOM attributes this scope bounds, e.g. `["data-block-id"]`.
   *
   * Declaring them is what closes the loophole: the
   * `dom-scope:bounded-attr-not-document-wide` check collects every declared
   * `bounds` entry in the tree and fails any `document.querySelector*` naming
   * one. So the ban is derived from the declaration rather than from a list
   * somebody has to remember to extend — adding a scope adds enforcement.
   */
  bounds: readonly string[];
}

/**
 * What a reader gets. A discriminated union, never `HTMLElement | null`.
 *
 * Three situations have to stay apart: no `<Provider>` (a composition bug, which
 * throws), a Provider whose owner has not attached its node yet, and attached. A
 * nullable root merges the last two AT THE CALL SITE, because the collapse is one
 * character wide — `root?.querySelector(sel) ?? null` cannot tell "not attached"
 * from "no matching rows", which is the absorbable failure this codebase bans.
 *
 * The unattached arm carries no `root` field at all, so that spelling does not
 * typecheck. A caller must write `attached ? … : …` and therefore must say what
 * "not yet" means for its own consumer.
 */
export type DomScopeRoot<T extends HTMLElement = HTMLElement> =
  { readonly attached: true; readonly root: T } | { readonly attached: false };

/** The imperative sample, for event handlers and effects — never render. */
export interface DomScopeApi<T extends HTMLElement> {
  peekRoot(): T | null;
  peekRootOrThrow(): T;
}

export interface DomScopeHandle<T extends HTMLElement = HTMLElement> {
  readonly name: string;
  readonly bounds: readonly string[];
  /** Declares "one owner below here publishes THE <what> for this subtree". */
  Provider: (props: { children: ReactNode }) => ReactNode;
  /**
   * The owner's half: the callback ref to put on the element that IS this
   * scope's root. Throws outside the Provider.
   *
   * Returns the function itself rather than an object carrying it. A `.ref`
   * property read in render is what `react-hooks/refs` exists to catch, and it
   * cannot tell this one from a `useRef` handle — so the object shape made every
   * owner an error at the one place the ref is supposed to go. An owner that also
   * needs the imperative sample takes `useScopeApi()` beside this.
   */
  usePublishRef(): (node: T | null) => void;
  /** The ONLY render-path read. Subscribed. Throws outside the Provider. */
  useRoot(): DomScopeRoot<T>;
  /** The imperative half, for a reader's event handlers. Throws outside. */
  useScopeApi(): DomScopeApi<T>;
}

/** One frozen identity, so an unattached reader never re-renders on identity. */
const NOT_ATTACHED: DomScopeRoot<never> = Object.freeze({
  attached: false as const,
});

export function defineDomScope<T extends HTMLElement = HTMLElement>({
  name,
  what,
  bounds,
}: DomScopeOptions): DomScopeHandle<T> {
  const store = defineScopedStore<T | null>(null);

  // A marker beside the store, purely so a missing Provider throws a message
  // naming THIS scope rather than scoped-store's generic one. Both contexts are
  // provided together, so they can never disagree.
  const Present = createContext(false);

  const unattached = (): never => {
    throw new Error(
      `dom-scope "${name}": read before its element attached — ${what}. ` +
        `An imperative peek runs after mount by definition; if you need this ` +
        `during render, use useRoot() and handle the { attached: false } arm.`,
    );
  };

  /** Assert the Provider is above us, with a message that names the scope. */
  function useScopePresent(): void {
    const present = useContext(Present);
    if (!present) {
      throw new Error(
        `dom-scope "${name}": no <Provider> above this component — ${what}. ` +
          `Mount <${name}.Provider> on the common ancestor of the element's ` +
          `owner and its readers.`,
      );
    }
  }

  function Provider({ children }: { children: ReactNode }): ReactNode {
    return createElement(
      store.Provider,
      null,
      createElement(Present.Provider, { value: true }, children),
    );
  }

  function usePublishRef(): (node: T | null) => void {
    useScopePresent();
    const api = store.useStoreApi();

    // A callback ref, not a `useState` fan-out: publishing must not re-render
    // the owner (it is typically the whole document body), only its subscribers.
    // The identity is stable for the mount, so React never detaches and
    // reattaches spuriously.
    return useCallback(
      (node: T | null): void => {
        if (node !== null) {
          const current = api.getState();
          // Two elements in one scope has no defined answer, and every reader is
          // already wrong. `isConnected` keeps an ordinary reparent — where React
          // can attach the new node before detaching the old — from tripping it.
          if (current !== null && current !== node && current.isConnected) {
            throw new Error(
              `dom-scope "${name}": two elements published into one scope — ` +
                `${what}. A nested owner must wrap itself in its own ` +
                `<${name}.Provider>.`,
            );
          }
        }
        api.setState(node);
      },
      [api],
    );
  }

  function useRoot(): DomScopeRoot<T> {
    useScopePresent();
    const root = store.useStore();
    // Memoised on the element so a `resolve` callback built from this stays
    // referentially stable — the outline rail re-enrols its observer otherwise.
    return useMemo(
      () =>
        root === null
          ? (NOT_ATTACHED as DomScopeRoot<T>)
          : { attached: true as const, root },
      [root],
    );
  }

  function useScopeApi(): DomScopeApi<T> {
    useScopePresent();
    const api = store.useStoreApi();
    return useMemo(
      () => ({
        peekRoot: () => api.getState(),
        peekRootOrThrow: () => api.getState() ?? unattached(),
      }),
      [api],
    );
  }

  return { name, bounds, Provider, usePublishRef, useRoot, useScopeApi };
}
