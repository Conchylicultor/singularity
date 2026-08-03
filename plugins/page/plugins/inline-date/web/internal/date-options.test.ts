import { expect, test } from "bun:test";
import { buildMenu } from "./date-options";

// Fixed reference instant so chrono resolves deterministically (local time).
const NOW = new Date("2026-06-16T10:00:00");

test("empty query offers the relative presets", () => {
  const m = buildMenu("", NOW);
  expect(m.open).toBe(true);
  expect(m.hint).toBe(false);
  expect(m.options.map((o) => o.label)).toEqual(["Today", "Tomorrow", "Yesterday"]);
  expect(m.options.every((o) => o.kind === "date")).toBe(true);
});

test("every preset row carries the absolute day as its detail", () => {
  const today = buildMenu("", NOW).options[0]!;
  expect(today.label).toBe("Today");
  expect(today.detail).toBe("Tue, Jun 16");
});

test("a preset stays pressable while the query is only a prefix of it", () => {
  const m = buildMenu("tod", NOW);
  expect(m.open).toBe(true);
  // The whole point: `@tod` is a real, committable row — not the dead hint state.
  expect(m.hint).toBe(false);
  expect(m.options).toHaveLength(1);
  expect(m.options[0]!.label).toBe("Today");
  expect(m.options[0]!.date.getDate()).toBe(16);
});

test("a prefix matching several presets offers all of them", () => {
  expect(buildMenu("t", NOW).options.map((o) => o.label)).toEqual(["Today", "Tomorrow"]);
  expect(buildMenu("yes", NOW).options.map((o) => o.label)).toEqual(["Yesterday"]);
});

test("preset matching ignores case", () => {
  expect(buildMenu("TOM", NOW).options.map((o) => o.label)).toEqual(["Tomorrow"]);
});

test("a parseable query yields a date row and a reminder row", () => {
  const m = buildMenu("tomorrow", NOW);
  expect(m.open).toBe(true);
  expect(m.options).toHaveLength(2);
  expect(m.options[0]!.kind).toBe("date");
  expect(m.options[1]!.kind).toBe("reminder");
  expect(m.options[1]!.label.startsWith("Remind me")).toBe(true);
  // Tomorrow = Jun 17; no explicit time -> reminder defaults to 09:00 local.
  const r = m.options[1]!.date;
  expect(r.getDate()).toBe(17);
  expect(r.getHours()).toBe(9);
  expect(r.getMinutes()).toBe(0);
});

test("@today reads as Today, with the absolute day as detail, exactly once", () => {
  const m = buildMenu("today", NOW);
  const dates = m.options.filter((o) => o.kind === "date");
  // The parsed row and the `Today` preset are the same day — one row, not two.
  expect(dates).toHaveLength(1);
  expect(dates[0]!.label).toBe("Today");
  expect(dates[0]!.detail).toBe("Tue, Jun 16");
});

test("a parsed day with no relative name keeps its absolute label, undetailed", () => {
  const m = buildMenu("jun 24", NOW);
  const date = m.options.find((o) => o.kind === "date")!;
  expect(date.label).toBe("Wed, Jun 24");
  // The label already IS the day — no detail, so the row never says it twice.
  expect(date.detail).toBeUndefined();
});

test("an explicit time is preserved on the reminder (no 09:00 override)", () => {
  const m = buildMenu("next friday 3pm", NOW);
  const reminder = m.options.find((o) => o.kind === "reminder")!;
  expect(reminder.date.getHours()).toBe(15);
});

test("unrelated prose closes the menu (does not hijack @)", () => {
  expect(buildMenu("john", NOW).open).toBe(false);
  expect(buildMenu("everyone please", NOW).open).toBe(false);
});

test("a keyword prefix with nothing resolved keeps the menu open with a hint", () => {
  const m = buildMenu("nex", NOW); // prefix of "next", matches no preset
  expect(m.open).toBe(true);
  expect(m.hint).toBe(true);
  expect(m.options).toHaveLength(0);
});

test("a digit start keeps the menu open (e.g. a typed date)", () => {
  expect(buildMenu("2026-12-25", NOW).open).toBe(true);
});
