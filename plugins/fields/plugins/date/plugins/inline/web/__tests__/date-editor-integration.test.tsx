import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import {
  dayLabel,
  monthTitle,
} from "@plugins/primitives/plugins/date-picker/core";
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
const PICKED = new Date(2026, 7, 20);

// This suite's own "today", deliberately months away from the value's month.
// Everything asserted below is then a statement about the VALUE alone: the
// calendar opened on August 2026 because that is where the value lives, and the
// cell pressed is August 20 because that is the cell asked for. With "today"
// parked in March 2027, the picked cell can never happen to be today's cell and
// the Today / Tomorrow / Yesterday presets can never collide with it. (The
// shared setup already pins the clock so no suite drifts with the calendar;
// this makes the separation deliberate rather than incidental.)
const ELSEWHERE = new Date(2027, 2, 5, 9, 0); // Friday 5 March 2027, morning

beforeEach(() => {
  vi.setSystemTime(ELSEWHERE);
});

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
  it(
    "opens the calendar on the value's month",
    () => {
      renderEditor(AUGUST_2026);
      // Derived, not the literal "August 2026" — the title is `Intl`-formatted, so
      // hard-coding it would pin the test to the runtime's default locale.
      expect(screen.getByText(monthTitle(AUGUST_2026))).toBeTruthy();
    },
    SLOW,
  );

  it(
    "pressing a day commits that local calendar day, exactly once",
    () => {
      const { onCommit, onCancel } = renderEditor(AUGUST_2026);

      // Queried by the cell's full date, not the visible "20". "20" is the cell's
      // TEXT; its accessible NAME is the whole day — the calendar labels every
      // cell that way because a screen-reader user arrives on one by arrow key,
      // with no view of the month around it. The bare number was never an identity
      // in the first place: the 6x7 grid pads with adjacent-month days, so one
      // number can appear twice.
      //
      // The name is DERIVED from `dayLabel`, the same function the component
      // labels with, and neither side passes a locale — so both resolve against
      // the one runtime locale, and a change to the label's wording can never
      // again orphan this query in silence.
      fireEvent.click(screen.getByRole("button", { name: dayLabel(PICKED) }));

      expect(onCommit).toHaveBeenCalledTimes(1);
      const committed = onCommit.mock.calls[0]![0] as Date;
      expect(committed.getFullYear()).toBe(2026);
      expect(committed.getMonth()).toBe(7);
      expect(committed.getDate()).toBe(20);

      // The popover self-closes after reporting the pick; that close must not
      // also read as a cancel.
      expect(onCancel).not.toHaveBeenCalled();
    },
    SLOW,
  );
});
