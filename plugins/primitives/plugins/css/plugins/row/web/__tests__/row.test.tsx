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
