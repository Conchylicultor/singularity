import { expect, test } from "bun:test";
import {
  MENTION_TOKEN_PATTERN,
  REMINDER_TOKEN_PATTERN,
  dateToken,
  reminderToken,
  scanReminderTokens,
  stripInlineTokens,
} from "./tokens";

const ISO = "2026-06-17T09:00:00.000Z";
const ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

test("dateToken / reminderToken serialize to the documented shapes", () => {
  expect(dateToken(ISO)).toBe(`[[date:${ISO}]]`);
  expect(reminderToken(ID, ISO)).toBe(`[[reminder:${ID}:${ISO}]]`);
});

test("MENTION_TOKEN_PATTERN distinguishes date vs reminder by capture group", () => {
  const date = MENTION_TOKEN_PATTERN.exec(dateToken(ISO))!;
  expect(date[1]).toBe(ISO); // date iso
  expect(date[2]).toBeUndefined(); // not a reminder

  const rem = MENTION_TOKEN_PATTERN.exec(reminderToken(ID, ISO))!;
  expect(rem[1]).toBeUndefined(); // not a plain date
  expect(rem[2]).toBe(ID);
  expect(rem[3]).toBe(ISO);
});

test("the createNodeFromMatch branch reproduces iso/id round-trip", () => {
  // Mirrors register.ts: m[1] -> date node, else reminder node from m[2]/m[3].
  const fromToken = (token: string) => {
    const m = MENTION_TOKEN_PATTERN.exec(token)!;
    return m[1] ? { iso: m[1], reminderId: null } : { iso: m[3], reminderId: m[2] };
  };
  expect(fromToken(dateToken(ISO))).toEqual({ iso: ISO, reminderId: null });
  expect(fromToken(reminderToken(ID, ISO))).toEqual({ iso: ISO, reminderId: ID });
});

test("scanReminderTokens finds every reminder (and ignores plain dates)", () => {
  const id2 = "11111111-2222-3333-4444-555555555555";
  const iso2 = "2026-12-25T08:30:00.000Z";
  const text = `note ${dateToken(ISO)} then ${reminderToken(ID, ISO)} and ${reminderToken(id2, iso2)}`;
  expect(scanReminderTokens(text)).toEqual([
    { id: ID, iso: ISO },
    { id: id2, iso: iso2 },
  ]);
});

test("REMINDER_TOKEN_PATTERN does not match a plain date token", () => {
  expect(REMINDER_TOKEN_PATTERN.test(dateToken(ISO))).toBe(false);
});

test("stripInlineTokens removes all [[…]] tokens for a clean notification snippet", () => {
  const text = `Ship it ${dateToken(ISO)} then review ${reminderToken(ID, ISO)}`;
  expect(stripInlineTokens(text)).toBe("Ship it then review");
  // page-link tokens are stripped too
  expect(stripInlineTokens("see [[block-123-abc]] now")).toBe("see now");
});
