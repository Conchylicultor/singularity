import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ActionFormProvider,
  type ItemFormChannel,
} from "@plugins/primitives/plugins/action-presentation/web";
import { usePortalForwardedAttrs } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { PopupOpenScope } from "@plugins/primitives/plugins/overlay/plugins/popup-open/web";
import {
  BarFormsContext,
  BarRegistryContext,
  type BarRegistry,
} from "./registry";

export interface AdaptiveBarItemProps {
  /**
   * Stable across the item's whole life. It keys the width ledger, so an id
   * that churns per render throws the measurements away every frame; a
   * DUPLICATE id makes "where is this node" unanswerable and `planMoves` throws
   * rather than silently moving the wrong element.
   */
  id: string;
  children: ReactNode;
}

/**
 * One occupant of an adaptive bar.
 *
 * Three states, and the branch is at the top so each is its own component and
 * the hook order inside is fixed:
 *
 * - **no bar above** — transparent. A primitive that only works in one place is
 *   a primitive nobody composes, and a host that wraps its actions in
 *   `AdaptiveBar.Item` unconditionally (a pane header does) must render the
 *   same thing outside a bar.
 * - **edit mode** — transparent, for the reason in {@link BarRegistry.editMode}.
 * - **otherwise** — the portalled host below.
 *
 * Crossing between transparent and portalled remounts the widget. That is not
 * avoidable and not hidden: the portal IS the identity-preserving mechanism, so
 * there is no version of "stop portalling" that keeps the instance. It only
 * happens on the edit-mode edge, which is a deliberate user gesture.
 */
export function AdaptiveBarItem({
  id,
  children,
}: AdaptiveBarItemProps): ReactElement {
  const registry = useContext(BarRegistryContext);
  if (registry === null || registry.editMode) return <>{children}</>;
  return (
    <PortaledBarItem registry={registry} id={id}>
      {children}
    </PortaledBarItem>
  );
}

/**
 * The item's DOM home: one plain `<div>`, created once, portalled into forever,
 * and MOVED between docks by the bar.
 *
 * This is the whole trick. React renders the widget through
 * `createPortal(children, container)`, so the portal target never changes
 * identity and the portal fiber is never torn down; placement then becomes a
 * DOM operation on a node React does not own. React never sees the move, so the
 * widget is never unmounted, never re-instantiated, and never rendered a second
 * time to be measured.
 *
 * The `createPortal` route is load-bearing in a way that is easy to get wrong:
 * React reconciles a portal by CONTAINER IDENTITY. Swapping a plain host
 * element for a portal at the same position — or changing a portal's container
 * — deletes the subtree and builds a new one. So the container must be minted
 * once and never replaced.
 */
function PortaledBarItem({
  registry,
  id,
  children,
}: {
  registry: BarRegistry;
  id: string;
  children: ReactNode;
}): ReactElement {
  const [container] = useState(() => {
    const el = document.createElement("div");
    // **An occupant's width is its own** — the axiom the whole width ledger
    // rests on (`core/width-cache.ts`), and the container is where it has to be
    // declared. An ordinary flex item is squeezed whenever its row is over-full,
    // which is exactly the state a pass measures in, and the squeezed number is
    // then stored as `exact` while `measureRowOverflow` goes blind.
    //
    // Not on the row as `[&>*]:shrink-0`, which is where it used to live: a
    // parent selector reaches DIRECT children, and this container is docked at
    // its own anchor — through `.Render` that is two or three `display: contents`
    // wrappers below the row. Still a flex item of the row, no longer a child of
    // it. On the node itself the declaration travels with it.
    //
    // It travels into the panel's column too, where `flex-shrink` is about
    // height rather than width. That is harmless and, if anything, right: the
    // panel is content-height, so there is no deficit for a shrink to take, and
    // a parked row that could be squashed vertically is not something anyone
    // wants either.
    el.className = rigidClass();
    return el;
  });
  const forwarded = usePortalForwardedAttrs();
  const forms = useContext(BarFormsContext);
  const form = forms.get(id) ?? "full";

  // Which forwarded keys are currently stamped, so a key that DISAPPEARS from
  // the bag (a pane id that is no longer in scope) is removed rather than left
  // behind as a stale lineage claim.
  const stampedRef = useRef<string[]>([]);

  useLayoutEffect(() => {
    // Stamped IMPERATIVELY and ALWAYS — not only when the item relocates.
    //
    // The container is not a React element, so nothing else can carry the
    // ancestry-derived signals (theme scope, plugin lineage, pane id) that a
    // portal severs. Doing it unconditionally is the point: a move-time branch
    // is a branch that can be wrong, and the symptom would be a widget that
    // renders in the wrong palette only after it has been relocated once.
    container.setAttribute("data-adaptive-bar-item", id);
    for (const key of stampedRef.current) {
      if (!(key in forwarded)) container.removeAttribute(key);
    }
    for (const [key, value] of Object.entries(forwarded)) {
      container.setAttribute(key, value);
    }
    stampedRef.current = Object.keys(forwarded);
  }, [container, id, forwarded]);

  useLayoutEffect(() => {
    // An occupant that renders nothing is hidden, and a hidden element reports
    // no resize when content appears inside it — so the child list is the one
    // signal that survives in both directions. Push-based and scoped to this
    // one node: no polling, and no walk of anyone else's DOM.
    const observer = new MutationObserver(() => registry.contentChanged(id));
    observer.observe(container, { childList: true });
    const release = registry.register(id, container);
    return () => {
      observer.disconnect();
      release();
      // Undock, never destroy. The container is this component's own node; the
      // widget inside it is being unmounted by React on the same commit.
      container.remove();
    };
  }, [registry, id, container]);

  // Named `declareLadder`, not `declare`: Bun's TS transform parses a statement
  // beginning with `declare` as an ambient declaration and erases it, leaving
  // `undefined` at runtime with no error anywhere (bun-safety/no-declare-identifier).
  const declareLadder = useCallback(
    (ladder: Parameters<BarRegistry["declare"]>[1]) =>
      registry.declare(id, ladder),
    [registry, id],
  );
  const hold = useCallback(() => registry.hold(id), [registry, id]);
  const channel = useMemo<ItemFormChannel>(
    () => ({ form, declare: declareLadder, hold }),
    [form, declareLadder, hold],
  );

  return (
    <>
      {/*
        The anchor: a zero-size marker React renders at the item's NATURAL
        position in the host's own children.

        It is what makes order an input rather than something the mechanics has
        to discover. The host may render its items through a slot whose reorder
        middleware sorts them, wrapped in whatever containers it likes; document
        order of the anchors is the order the author actually produced, and the
        bar docks each container immediately before its own anchor. A registry
        keyed on mount order would get an item inserted in the middle wrong, and
        a consumer-supplied order list would be a second source of truth.

        `hidden` (`display: none`) means it is not a flex item at all: no width,
        and — the part that is easy to miss — no gap either.
      */}
      <span hidden data-adaptive-bar-anchor={id} />
      {createPortal(
        <ActionFormProvider channel={channel}>
          <PopupOpenScope>
            {(popupOpen) => (
              <PopupPin registry={registry} id={id} open={popupOpen}>
                {children}
              </PopupPin>
            )}
          </PopupOpenScope>
        </ActionFormProvider>,
        container,
      )}
    </>
  );
}

/**
 * Pins the item while a popover of its own is open — with zero contributor
 * change, because `PopupOpenScope` is already how every ui-kit popup announces
 * itself.
 *
 * Mandatory, not polite: an open popover lives in the top layer, and a plain
 * re-parent drops it out of it. The popover would close (or worse, paint
 * underneath) the instant the row resized.
 */
function PopupPin({
  registry,
  id,
  open,
  children,
}: {
  registry: BarRegistry;
  id: string;
  open: boolean;
  children: ReactNode;
}): ReactElement {
  useEffect(() => {
    registry.setPopupOpen(id, open);
    // The release runs on close AND on unmount, so an item that leaves the tree
    // with its menu open cannot strand itself pinned in the bar's ledger.
    return () => registry.setPopupOpen(id, false);
  }, [registry, id, open]);
  return <>{children}</>;
}
