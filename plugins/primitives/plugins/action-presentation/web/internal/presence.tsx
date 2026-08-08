import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * A region collecting "did any action actually render inside me?". `null` (the
 * default) means nobody is asking, so {@link useReportActionPresence} is inert
 * at every ordinary call site.
 */
const ActionPresenceContext = createContext<((delta: number) => void) | null>(
  null,
);

/**
 * Counts the actions that really rendered below it, and hands the answer to its
 * child as a boolean.
 *
 * An action decides *per row* whether it applies — an item action returns `null`
 * for a row it has nothing to do with — so a region holding a set of actions
 * cannot know whether it is empty until they have run. Pairing this with the
 * `probe` presentation mode makes that knowable without painting anything: the
 * members render once under `<ActionPresentation mode="probe">`, draw no DOM,
 * and simply announce themselves.
 *
 * ```tsx
 * <ActionPresenceScope>
 *   {(hasActions) => (
 *     <>
 *       <ActionPresentation mode="probe">{children}</ActionPresentation>
 *       {hasActions ? <TheChromeThatHoldsThem /> : null}
 *     </>
 *   )}
 * </ActionPresenceScope>
 * ```
 *
 * Mirrors `PopupOpenScope` (`primitives/popup-open`): a render-prop scope that
 * aggregates a typed signal from an opaque subtree, rather than a CSS selector
 * guessing at the markup its members happen to produce.
 */
export function ActionPresenceScope({
  children,
}: {
  children: (hasActions: boolean) => ReactNode;
}) {
  const [count, setCount] = useState(0);
  // Stable identity: it is an effect dependency in every member below.
  const report = useCallback((delta: number) => {
    setCount((c) => c + delta);
  }, []);
  return (
    <ActionPresenceContext.Provider value={report}>
      {children(count > 0)}
    </ActionPresenceContext.Provider>
  );
}

/**
 * Announces to the enclosing {@link ActionPresenceScope} that this component
 * rendered a real action, for as long as `active` holds. A no-op with no scope
 * above it, which is every ordinary call site.
 *
 * Called by `IconButton` — the one generic `{ icon, label, onClick }` action
 * component — so every action built on it counts itself, exactly as they all
 * already switch presentation together.
 */
export function useReportActionPresence(active: boolean): void {
  const report = useContext(ActionPresenceContext);
  useEffect(() => {
    if (!active || !report) return;
    report(1);
    return () => report(-1);
  }, [active, report]);
}
