import { describe, expect, test } from "bun:test";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import {
  isTotalTokensReminder,
  parseBudgetAttachment,
  parseBudgetText,
  readBudget,
} from "./budget";

function reminder(remaining: number): JsonlEvent {
  return {
    kind: "attachment",
    at: `t${remaining}`,
    subtype: "total_tokens_reminder",
    attachment: {
      type: "total_tokens_reminder",
      text: `<total_tokens>${remaining} tokens left</total_tokens>`,
    },
  };
}

describe("parseBudgetText", () => {
  test("reads the number out of the harness's wording", () => {
    expect(
      parseBudgetText("<total_tokens>15000000 tokens left</total_tokens>"),
    ).toEqual({ ok: true, remaining: 15_000_000 });
  });

  test("tolerates thousands separators and stray whitespace", () => {
    expect(
      parseBudgetText("<total_tokens> 14,912,164 tokens left </total_tokens>"),
    ).toEqual({ ok: true, remaining: 14_912_164 });
  });

  test("unreadable wording surfaces the raw text instead of a number", () => {
    expect(parseBudgetText("<total_tokens>plenty</total_tokens>")).toEqual({
      ok: false,
      raw: "<total_tokens>plenty</total_tokens>",
    });
  });
});

describe("parseBudgetAttachment", () => {
  test("a payload with no readable text is not a budget", () => {
    expect(parseBudgetAttachment({ type: "total_tokens_reminder" }).ok).toBe(
      false,
    );
    expect(parseBudgetAttachment(null).ok).toBe(false);
  });
});

describe("isTotalTokensReminder", () => {
  test("matches only the harness's budget reminder", () => {
    expect(isTotalTokensReminder(reminder(1))).toBe(true);
    expect(
      isTotalTokensReminder({
        kind: "attachment",
        at: "t",
        subtype: "date_change",
        attachment: {},
      }),
    ).toBe(false);
    expect(
      isTotalTokensReminder({ kind: "user-text", at: "t", text: "hi" }),
    ).toBe(false);
  });
});

describe("readBudget", () => {
  test("a stretch with no reminder has nothing to report", () => {
    expect(readBudget([])).toBeNull();
    expect(readBudget([{ kind: "user-text", at: "t", text: "hi" }])).toBeNull();
  });

  test("reports the last reading, the ceiling, and what got spent", () => {
    expect(readBudget([reminder(1000), reminder(900), reminder(250)])).toEqual({
      remaining: 250,
      budget: 1000,
      share: 0.25,
      spent: 750,
    });
  });

  test("the first reading has spent nothing yet", () => {
    expect(readBudget([reminder(1000)])).toEqual({
      remaining: 1000,
      budget: 1000,
      share: 1,
      spent: 0,
    });
  });

  test("a mid-transcript refresh does not erase what was already spent", () => {
    // 1000 → 250 (750 spent), budget refreshed to 1000, → 900 (100 more).
    // `first - last` would claim 100; summing the drops keeps both stretches.
    expect(
      readBudget([
        reminder(1000),
        reminder(250),
        reminder(1000),
        reminder(900),
      ]),
    ).toEqual({ remaining: 900, budget: 1000, share: 0.9, spent: 850 });
  });

  test("unreadable reminders are skipped, not counted as zero left", () => {
    const broken: JsonlEvent = {
      kind: "attachment",
      at: "t-broken",
      subtype: "total_tokens_reminder",
      attachment: { type: "total_tokens_reminder", text: "who knows" },
    };
    expect(readBudget([reminder(1000), broken, reminder(400)])).toEqual({
      remaining: 400,
      budget: 1000,
      share: 0.4,
      spent: 600,
    });
  });

  test("an exhausted budget is a zero share, never a divide-by-zero", () => {
    expect(readBudget([reminder(0)])?.share).toBe(0);
  });
});
