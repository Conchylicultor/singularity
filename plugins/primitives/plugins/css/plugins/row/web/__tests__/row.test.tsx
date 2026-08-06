import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { Row } from "../internal/row";

afterEach(cleanup);

// Pins the structural invariant the `Row` primitive exists to guarantee: a
// clickable row that carries interactive `actions` must NEVER emit a
// <button>/<a> nested inside another <button>/<a> (invalid DOM whose failure is
// silent — the action click is swallowed or falls through to the row). The
// element is inferred from props (href → a, onClick → button, else div); there
// is no `as`, so the bad combination cannot be expressed.
describe("Row — no nested interactive elements", () => {
  it("renders the action as a sibling of the row's primary button, never nested", () => {
    render(
      <Row onClick={() => {}} actions={<button data-testid="act">x</button>}>
        label
      </Row>,
    );
    const action = screen.getByTestId("act");
    // The action's nearest button ancestor is itself — it is not inside the
    // row's primary <button>.
    expect(action.closest("button")).toBe(action);
    // The row still exposes a real, keyboard-accessible primary button named by
    // its children.
    expect(screen.getByRole("button", { name: "label" })).toBeTruthy();
  });

  it("isolates the action click from the row onClick", () => {
    const rowClick = vi.fn();
    const actionClick = vi.fn();
    render(
      <Row onClick={rowClick} actions={<button data-testid="act">x</button>}>
        label
      </Row>,
    );
    fireEvent.click(screen.getByTestId("act"));
    expect(actionClick).toHaveBeenCalledTimes(0); // (sanity: separate spy)
    expect(rowClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "label" }));
    expect(rowClick).toHaveBeenCalledTimes(1);
  });

  it("fires the action's own handler when clicked", () => {
    const actionClick = vi.fn();
    render(
      <Row
        onClick={() => {}}
        actions={
          <button data-testid="act" onClick={actionClick}>
            x
          </button>
        }
      >
        label
      </Row>,
    );
    fireEvent.click(screen.getByTestId("act"));
    expect(actionClick).toHaveBeenCalledTimes(1);
  });
});

// Pins the convergence: `Row` owns the trailing slot's PLACEMENT and nothing
// else — the reveal itself belongs to the `row-actions` primitive, so a row's
// cluster cannot drift from a tree's or a table's. Asserting the rendered
// mechanism (the anchor group on the row, the coupled hidden state on the
// cluster) is what catches `Row` quietly re-acquiring a reveal of its own.
describe("Row — the trailing cluster is the row-actions primitive", () => {
  it("anchors the reveal on the row and hides the cluster inertly at rest", () => {
    const { container } = render(
      <Row onClick={() => {}} actions={<button data-testid="act">x</button>}>
        label
      </Row>,
    );
    // The reveal group + the positioning context the cluster pins against ride
    // the row box itself.
    expect(container.firstElementChild!.className).toContain(
      "group/row-actions",
    );
    // At rest the cluster is invisible AND inert — never one without the other,
    // or the hidden cluster parks a live click-target over the row's trailing
    // edge.
    const cluster = screen.getByTestId("act").closest(".opacity-0");
    expect(cluster).not.toBeNull();
    expect(cluster!.className).toContain("pointer-events-none");
  });

  it("keeps an actionsAlwaysVisible cluster visible and in flow", () => {
    render(
      <Row
        onClick={() => {}}
        actionsAlwaysVisible
        actions={<button data-testid="act">x</button>}
      >
        label
      </Row>,
    );
    const action = screen.getByTestId("act");
    expect(action.closest(".opacity-0")).toBeNull();
    // In flow at the row's trailing edge, not pinned over it.
    expect(action.closest(".ml-auto")).not.toBeNull();
    expect(action.closest(".absolute")).toBeNull();
  });
});

describe("Row — element inference (no `as` prop)", () => {
  it("href → <a>", () => {
    const { container } = render(<Row href="/x">link</Row>);
    expect(container.querySelector("a")).toBeTruthy();
    expect(container.querySelector("button")).toBeNull();
  });

  it("onClick → <button>", () => {
    const { container } = render(<Row onClick={() => {}}>btn</Row>);
    const root = container.firstElementChild!;
    expect(root.tagName).toBe("BUTTON");
  });

  it("disabled (no onClick) → still a <button>", () => {
    const { container } = render(<Row disabled>btn</Row>);
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("neither → non-interactive <div>", () => {
    const { container } = render(<Row>plain</Row>);
    const root = container.firstElementChild!;
    expect(root.tagName).toBe("DIV");
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

  it("no-actions interactive row is a single <button> (no split wrapper)", () => {
    const { container } = render(<Row onClick={() => {}}>solo</Row>);
    const root = container.firstElementChild!;
    expect(root.tagName).toBe("BUTTON");
    // No inner button wrapper — the row IS the button.
    expect(root.querySelector("button")).toBeNull();
  });
});
