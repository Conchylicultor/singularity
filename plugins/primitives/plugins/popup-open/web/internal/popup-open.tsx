import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * The registry a scope hands down to its descendants. Two balanced calls, never
 * a boolean: several popups can be open under one scope at once, so the scope
 * counts them rather than latching a flag one closer could clear for all.
 */
interface PopupOpenSink {
  register: () => void;
  unregister: () => void;
}

/**
 * No enclosing scope ⇒ reporting is a silent no-op (same tolerance as
 * `sync-status`' sink context). A popup must stay usable outside a row — unit
 * tests and plain page chrome mount one all the time.
 */
const NO_SCOPE: PopupOpenSink = { register: () => {}, unregister: () => {} };

const PopupOpenContext = createContext<PopupOpenSink>(NO_SCOPE);

/**
 * Aggregates every popup registered inside it and hands the result to its
 * render-prop child. Renders no DOM of its own.
 *
 * The render prop is deliberate: providing the scope and reading the aggregate
 * are one component, so a consumer cannot wire half of it (a scope with no
 * reader, or a reader with no scope, would both look fine at author time).
 *
 * Nested scopes: a popup reports to its NEAREST scope only, so an inner scope
 * never leaks its open state into the outer one.
 */
export function PopupOpenScope({
  children,
}: {
  children: (open: boolean) => ReactNode;
}): ReactNode {
  const [openCount, setOpenCount] = useState(0);

  // Stable across the scope's whole life — the sink is context, and a churning
  // value would re-run every descendant's registration effect.
  const sink = useMemo<PopupOpenSink>(
    () => ({
      register: () => setOpenCount((n) => n + 1),
      unregister: () => setOpenCount((n) => n - 1),
    }),
    [],
  );

  return (
    <PopupOpenContext.Provider value={sink}>
      {children(openCount > 0)}
    </PopupOpenContext.Provider>
  );
}

/**
 * Publishes a popup's open state to the enclosing {@link PopupOpenScope}.
 * Called by the ui-kit `Root` wrappers — a feature plugin never calls it
 * directly.
 *
 * The registration IS the effect's subscription, so the release is the effect's
 * cleanup: closing and unmounting-while-open both go through the same path. An
 * unmount that skipped the release would latch its scope open forever.
 */
export function useReportPopupOpen(open: boolean): void {
  const sink = useContext(PopupOpenContext);

  useEffect(() => {
    if (!open) return;
    sink.register();
    return () => sink.unregister();
  }, [sink, open]);
}
