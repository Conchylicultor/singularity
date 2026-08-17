import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type React from "react";
import { MdArrowBack } from "react-icons/md";

import { ControlPanelSection } from "./control-panel";
import { ControlPanelRow } from "./control-panel-row";

export interface PanelStackEntry {
  /** Identity of this level — a re-push with the same key replaces it. */
  key: string;
  /** Shown in the back header, so the user knows what popping returns to. */
  title: string;
  render: () => React.ReactNode;
}

export interface PanelStackApi {
  /** 0 while the root panel is showing. */
  depth: number;
  push: (entry: PanelStackEntry) => void;
  pop: () => void;
  /** Back to the root in one step — for a host closing and reopening the panel. */
  reset: () => void;
}

const PanelStackContext = createContext<PanelStackApi | null>(null);

/**
 * The panel stack a contribution pushes onto.
 *
 * It is published through CONTEXT rather than passed down because the third
 * consumer needs it that way: custom-columns' per-field editor is a nested
 * contribution rendered inside someone else's section, and has no prop path back
 * to whichever chrome is hosting the panel. Throws when there is no stack, which
 * is the honest answer — a component that pushes a sub-panel cannot render
 * correctly in a host that has nowhere to push it, and a silent no-op would show
 * as a dead click.
 */
export function usePanelStack(): PanelStackApi {
  const api = useContext(PanelStackContext);
  if (!api) {
    throw new Error(
      "usePanelStack() requires a <ControlPanel.Stack> ancestor. Panels rendered " +
        "through ControlPanelPopover already have one.",
    );
  }
  return api;
}

export interface ControlPanelStackProps {
  /** The depth-0 panel. */
  root: React.ReactNode;
  /**
   * Called when Escape is pressed at depth 0 — the level the stack cannot pop.
   * The key event is NOT swallowed there, so a host popover still closes on it;
   * this is for a host that needs to know as well.
   */
  onExhausted?: () => void;
  // No `className`: the stack's element is `display: contents` (below), a box the
  // layout does not generate, so a class here could not size, space or paint
  // anything a caller would expect it to.
}

/**
 * Panel navigation: a stack of panels rendered one at a time, with a back header
 * built out of the vocabulary itself rather than out of bespoke chrome.
 *
 * It lives in the primitive, not in any one consumer, because three independent
 * surfaces need it — the compact toolbar fold, the filter builder's nested
 * groups, and custom-columns' per-field editor.
 *
 * Pushing beats opening a popover from inside a popover, which is what these
 * surfaces do today: a nested group grows the panel horizontally past the pane,
 * and a second floating layer has its own width, its own clamp and its own
 * dismissal. A pushed panel is the same box, the same width and the same rails
 * at every depth.
 */
export function ControlPanelStack({
  root,
  onExhausted,
}: ControlPanelStackProps) {
  const [stack, setStack] = useState<PanelStackEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const push = useCallback((entry: PanelStackEntry) => {
    setStack((prev) =>
      prev.at(-1)?.key === entry.key ? prev : [...prev, entry],
    );
  }, []);
  const pop = useCallback(() => setStack((prev) => prev.slice(0, -1)), []);
  const reset = useCallback(() => setStack([]), []);

  const depth = stack.length;
  const api = useMemo<PanelStackApi>(
    () => ({ depth, push, pop, reset }),
    [depth, push, pop, reset],
  );

  // Escape pops one level and stops there; at depth 0 it falls through so the
  // host popover closes on the same key. The listener is NATIVE and on the
  // container, not a React `onKeyDown`: the dismissal handlers it has to beat
  // are registered on the document, and only stopping the real event as it
  // bubbles past this element reliably gets in front of them.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (depth === 0) {
        onExhausted?.();
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      pop();
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [depth, onExhausted, pop]);

  // On push, focus moves into the panel that just appeared — otherwise focus
  // stays on the row that pushed it, which has just unmounted, and the keyboard
  // user lands back at the document body. Only on the way DOWN: popping should
  // leave focus where the back button was.
  const prevDepth = useRef(depth);
  useEffect(() => {
    const grew = depth > prevDepth.current;
    prevDepth.current = depth;
    if (!grew) return;
    const first = containerRef.current?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  }, [depth]);

  const top = stack.at(-1);

  return (
    <PanelStackContext value={api}>
      {/* LAYOUT-TRANSPARENT on purpose. This div exists only to hold the keydown
          listener and the focus query — it is not a box in the panel, and it must
          not be one: `display: contents` generates no box, so the bands inside it
          are laid out by the enclosing `ControlPanel`'s own `cp-body` flex
          container, which is then the ONE box spacing bands and the ONE box
          cancelling the first band's rule.
          It used to carry `cp-body` itself, to re-create a `& > * + *` sibling
          rule the panel could not reach through it. That was a workaround for
          exactly one level of wrapping, and it silently stopped working at two
          (the framework's own `renderIsolated` lineage span is the next one down)
          — which is why the rule now belongs to the bands. Events and refs are
          unaffected by `display: contents`: the element is still in the DOM and
          still on the event path. */}
      <div ref={containerRef} style={{ display: "contents" }}>
        {top ? (
          <>
            <ControlPanelSection>
              <ControlPanelRow icon={<MdArrowBack />} onSelect={pop}>
                {top.title}
              </ControlPanelRow>
            </ControlPanelSection>
            {top.render()}
          </>
        ) : (
          root
        )}
      </div>
    </PanelStackContext>
  );
}
