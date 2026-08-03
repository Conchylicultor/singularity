import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { monthTitle } from "@plugins/primitives/plugins/date-picker/core";
import { DateEditor } from "../components/date-editor";

/**
 * The end-to-end half of this plugin's verification: the REAL
 * `DatePickerPopover`, so a day press travels the whole path the (currently
 * unreachable — see CLAUDE.md) UI would take. Its sibling `date-editor.test.tsx`
 * stands in a fake popover to pin the outcome wiring in isolation; this one
 * exists so a signature or ordering change in the primitive fails here rather
 * than silently in production.
 */
afterEach(cleanup);

// Mounting the real popover pulls in base-ui + the whole primitive tree, which
// is far slower under jsdom than the 5s default allows on a cold module graph.
const SLOW = 30_000;

const AUGUST_2026 = new Date(2026, 7, 14);

function renderEditor(value: Date | null) {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  render(
    <DateEditor
      value={value}
      field={{ id: "when", label: "When", type: "date", value: () => null }}
      onCommit={onCommit}
      onCommitValues={vi.fn()}
      onCancel={onCancel}
    />,
  );
  return { onCommit, onCancel };
}

describe("DateEditor — against the real date picker", () => {
  it("opens the calendar on the value's month", () => {
    renderEditor(AUGUST_2026);
    // Derived, not the literal "August 2026" — the title is `Intl`-formatted, so
    // hard-coding it would pin the test to the runtime's default locale.
    expect(screen.getByText(monthTitle(AUGUST_2026))).toBeTruthy();
  }, SLOW);

  it("pressing a day commits that local calendar day, exactly once", () => {
    const { onCommit, onCancel } = renderEditor(AUGUST_2026);

    // "20" is unambiguous: the 6x7 grid's adjacent-month cells are late July /
    // early September, so no second cell carries this number.
    fireEvent.click(screen.getByRole("button", { name: "20" }));

    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0]![0] as Date;
    expect(committed.getFullYear()).toBe(2026);
    expect(committed.getMonth()).toBe(7);
    expect(committed.getDate()).toBe(20);

    // The popover self-closes after reporting the pick; that close must not
    // also read as a cancel.
    expect(onCancel).not.toHaveBeenCalled();
  }, SLOW);
});
