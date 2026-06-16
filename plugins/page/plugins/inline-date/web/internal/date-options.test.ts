import { expect, test } from "bun:test";
import { buildMenu } from "./date-options";

// Fixed reference instant so chrono resolves deterministically (local time).
const NOW = new Date("2026-06-16T10:00:00");

test("empty query offers Today / Tomorrow date quick-picks", () => {
  const m = buildMenu("", NOW);
  expect(m.open).toBe(true);
  expect(m.hint).toBe(false);
  expect(m.options.map((o) => o.label)).toEqual(["Today", "Tomorrow"]);
  expect(m.options.every((o) => o.kind === "date")).toBe(true);
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

test("an explicit time is preserved on the reminder (no 09:00 override)", () => {
  const m = buildMenu("next friday 3pm", NOW);
  const reminder = m.options.find((o) => o.kind === "reminder")!;
  expect(reminder.date.getHours()).toBe(15);
});

test("unrelated prose closes the menu (does not hijack @)", () => {
  expect(buildMenu("john", NOW).open).toBe(false);
  expect(buildMenu("everyone please", NOW).open).toBe(false);
});

test("a keyword prefix keeps the menu open with a hint while typing", () => {
  const m = buildMenu("nex", NOW); // prefix of "next"
  expect(m.open).toBe(true);
  expect(m.hint).toBe(true);
  expect(m.options).toHaveLength(0);
});

test("a digit start keeps the menu open (e.g. a typed date)", () => {
  expect(buildMenu("2026-12-25", NOW).open).toBe(true);
});
