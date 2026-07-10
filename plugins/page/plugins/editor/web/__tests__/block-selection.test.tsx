import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useEffect, useMemo, useRef } from "react";
import {
  MultiSelectProvider,
  useMultiSelect,
} from "@plugins/primitives/plugins/multi-select/web";
import { SelectionControlProvider, useSelectionControl } from "../selection-control";
import {
  useBlockSelection,
  type BlockSelectionActions,
} from "../internal/use-block-selection";

afterEach(cleanup);

const IDS = ["b1", "b2", "b3", "b4"] as const;

/**
 * Stands in for a block's Lexical text editor. The fidelity that matters is the
 * SHAPE of the dispatch, not the editor: `KeyboardPlugin` reaches
 * `enterSelectionMode` from a Lexical command, which Lexical dispatches from its
 * own NATIVE keydown listener on the block's `contenteditable`. So this listener
 * is native (not a React prop), runs before React's delegated root listener, and
 * moves DOM focus to the container mid-dispatch — leaving the still-bubbling
 * keydown to reach the container while `document.activeElement` already points at
 * it. That is the trap the origin guard exists for.
 */
function FakeBlockEditor({ id }: { id: string }) {
  const control = useSelectionControl();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !control) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        control.enterSelectionMode(id);
      } else if (e.key === "ArrowUp" && e.shiftKey) {
        e.preventDefault();
        control.enterSelectionMode(id, "up");
      }
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [control, id]);

  return (
    <div
      ref={ref}
      data-testid={`block-${id}`}
      contentEditable
      suppressContentEditableWarning
      tabIndex={0}
    />
  );
}

/** The real `useBlockSelection`, wired to the real `MultiSelectProvider`. */
function Surface({ actions }: { actions: BlockSelectionActions }) {
  const { selectedIds, selectedCount } = useMultiSelect();
  // The editor derives these from the block forest; a flat harness has no tree,
  // so every selected block is its own root.
  const roots = useMemo(() => [...selectedIds], [selectedIds]);

  const { containerRef, control, onKeyDown, onFocusCapture } = useBlockSelection({
    orderedIds: IDS,
    roots,
    focusedBlockId: null,
    actions,
  });

  return (
    <>
      <div data-testid="count">{selectedCount}</div>
      <div data-testid="selected">{roots.join(",")}</div>
      <div
        data-testid="container"
        ref={containerRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onFocusCapture={onFocusCapture}
      >
        <SelectionControlProvider value={control}>
          {IDS.map((id) => (
            <FakeBlockEditor key={id} id={id} />
          ))}
        </SelectionControlProvider>
      </div>
    </>
  );
}

function setup() {
  const actions: BlockSelectionActions = {
    indent: vi.fn(),
    outdent: vi.fn(),
    remove: vi.fn(),
    duplicate: vi.fn(),
    focusBlock: vi.fn(),
    moveSelection: vi.fn(),
  };
  const view = render(
    <MultiSelectProvider orderedIds={IDS}>
      <Surface actions={actions} />
    </MultiSelectProvider>,
  );
  const el = (id: string) => view.getByTestId(id);
  return {
    actions,
    container: el("container"),
    block: (id: string) => el(`block-${id}`),
    count: () => Number(el("count").textContent),
    selected: () => el("selected").textContent,
  };
}

/**
 * Enter selection mode the way the editor does: a keydown consumed by the block's
 * own native listener, which applies the range and focuses the container.
 *
 * Afterwards the harness sits in exactly the state a real browser reaches
 * MID-DISPATCH on any block keystroke — `document.activeElement` is the container
 * and a selection is live — which is what makes the buggy `activeElement` guard
 * claim keys it never owned.
 *
 * jsdom cannot reproduce that state WITHIN one dispatch: React schedules the
 * reducer update on a microtask that cannot run while the synchronous dispatch is
 * still unwinding, so the container's stale closure bails at `!isActive` before
 * the bad guard can do damage. A real browser re-renders in time (`focusin` is
 * discrete) and the guard fires. Reaching the same state across two keystrokes
 * gives the same discrimination without depending on React's flush timing;
 * `e2e/block-selection-verify.mjs` covers the single-dispatch symptom for real.
 */
function inSelectionMode(id: string) {
  const t = setup();
  t.block(id).focus();
  fireEvent.keyDown(t.block(id), { key: "Escape" });
  return t;
}

describe("block-selection mode entry points", () => {
  it("Escape inside a block selects that block and focuses the container", () => {
    const t = inSelectionMode("b2");

    expect(t.count()).toBe(1);
    expect(t.selected()).toBe("b2");
    expect(document.activeElement).toBe(t.container);
  });

  // The reported bug, in the state jsdom can reach: an `activeElement`-guarded
  // handler claims the Escape the block just consumed, and clears the selection
  // that Escape created.
  it("Escape in another block re-selects it instead of clearing", () => {
    const t = inSelectionMode("b2");

    fireEvent.keyDown(t.block("b4"), { key: "Escape" });

    expect(t.count()).toBe(1);
    expect(t.selected()).toBe("b4");
  });

  // Same double-handling, different key: the container's own `ArrowUp + shift`
  // branch would extend the range a SECOND time off the one keypress (3 blocks).
  it("Shift+ArrowUp at a block edge extends by exactly one block", () => {
    const t = inSelectionMode("b2");

    fireEvent.keyDown(t.block("b3"), { key: "ArrowUp", shiftKey: true });

    expect(t.count()).toBe(2);
    expect(t.selected()).toBe("b2,b3");
  });

  // The branch the origin guard must NOT break: once the container itself holds
  // the caret, Escape is its own and clears the selection.
  it("Escape on the focused container clears the selection", () => {
    const t = inSelectionMode("b2");

    fireEvent.keyDown(t.container, { key: "Escape" });

    expect(t.count()).toBe(0);
  });

  // Focusing back into a block's editor drops the selection — but only because
  // the focus event's target is the block, not the container.
  it("focusing a block's editor drops the selection", () => {
    const t = inSelectionMode("b2");

    fireEvent.focus(t.block("b3"));

    expect(t.count()).toBe(0);
  });

  // Keys typed into a block editor are never the container's, even while a
  // selection is live (the container is an ancestor, so they bubble through it).
  it("keys targeted at a block editor never reach the container handler", () => {
    const t = inSelectionMode("b2");

    fireEvent.keyDown(t.block("b4"), { key: "Backspace" });
    fireEvent.keyDown(t.block("b4"), { key: "Tab" });

    expect(t.actions.remove).not.toHaveBeenCalled();
    expect(t.actions.indent).not.toHaveBeenCalled();
    expect(t.count()).toBe(1);
  });
});

describe("block-selection mode keyboard", () => {
  it("Tab / Shift+Tab indent and outdent the selection roots", () => {
    const t = inSelectionMode("b2");

    fireEvent.keyDown(t.container, { key: "Tab" });
    expect(t.actions.indent).toHaveBeenCalledWith(["b2"]);

    fireEvent.keyDown(t.container, { key: "Tab", shiftKey: true });
    expect(t.actions.outdent).toHaveBeenCalledWith(["b2"]);
  });

  it("Arrow moves the single selection, Shift+Arrow extends it", () => {
    const t = inSelectionMode("b2");

    fireEvent.keyDown(t.container, { key: "ArrowDown" });
    expect(t.selected()).toBe("b3");
    expect(t.count()).toBe(1);

    fireEvent.keyDown(t.container, { key: "ArrowDown", shiftKey: true });
    expect(t.selected()).toBe("b3,b4");
  });

  it("Alt+Shift+Arrow nudges the selection instead of extending it", () => {
    const t = inSelectionMode("b2");

    fireEvent.keyDown(t.container, { key: "ArrowDown", altKey: true, shiftKey: true });

    expect(t.actions.moveSelection).toHaveBeenCalledWith("down");
    expect(t.selected()).toBe("b2");
  });

  it("Backspace deletes the selection and leaves selection mode", () => {
    const t = inSelectionMode("b2");

    fireEvent.keyDown(t.container, { key: "Backspace" });

    expect(t.actions.remove).toHaveBeenCalledWith(["b2"]);
    expect(t.count()).toBe(0);
  });

  it("Enter puts the caret back into the head block", () => {
    const t = inSelectionMode("b2");

    fireEvent.keyDown(t.container, { key: "Enter" });

    expect(t.actions.focusBlock).toHaveBeenCalledWith("b2");
    expect(t.count()).toBe(0);
  });

  it("Cmd+A selects every block, Cmd+D duplicates the selection", () => {
    const t = inSelectionMode("b2");

    fireEvent.keyDown(t.container, { key: "a", metaKey: true });
    expect(t.count()).toBe(IDS.length);

    fireEvent.keyDown(t.container, { key: "d", metaKey: true });
    expect(t.actions.duplicate).toHaveBeenCalledWith([...IDS]);
  });
});
