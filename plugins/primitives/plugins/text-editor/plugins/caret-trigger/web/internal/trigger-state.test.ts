import { describe, expect, test } from "bun:test";
import {
  atWordBoundary,
  isOpen,
  reduceTriggerState,
  triggerId,
  type MenuState,
  type Trigger,
} from "./trigger-state";

const trig = (over: Partial<Trigger> = {}): Trigger => ({
  nodeKey: "n1",
  triggerIndex: 0,
  query: "",
  ...over,
});

describe("reduceTriggerState", () => {
  test("the null transition clears dismissedId (the reported bug)", () => {
    const prev: MenuState = { trigger: trig({ query: "foo" }), dismissedId: "n1:0" };
    const next = reduceTriggerState(prev, null);
    expect(next).toEqual({ trigger: null, dismissedId: null });
  });

  test("dismissal survives query typing (same nodeKey+triggerIndex, different query)", () => {
    const prev: MenuState = { trigger: trig({ query: "fo" }), dismissedId: "n1:0" };
    const next = reduceTriggerState(prev, trig({ query: "foo" }));
    // dismissedId carried forward → the menu stays dismissed while the query grows.
    expect(next.dismissedId).toBe("n1:0");
    expect(next.trigger?.query).toBe("foo");
    expect(isOpen(next)).toBe(false);
  });

  test("dismissal does NOT survive a null transition and a retype at the same position", () => {
    const dismissed: MenuState = { trigger: trig({ query: "" }), dismissedId: "n1:0" };
    const cleared = reduceTriggerState(dismissed, null); // trigger text removed
    const retyped = reduceTriggerState(cleared, trig({ query: "" })); // typed `/` again
    expect(retyped.dismissedId).toBeNull();
    expect(isOpen(retyped)).toBe(true);
  });

  test("returns prev by reference when nothing changed (React bailout)", () => {
    // Same trigger identity + same query → identical object out.
    const prev: MenuState = { trigger: trig({ query: "foo" }), dismissedId: null };
    expect(reduceTriggerState(prev, trig({ query: "foo" }))).toBe(prev);
    // Already-empty state + null → identical object out.
    const empty: MenuState = { trigger: null, dismissedId: null };
    expect(reduceTriggerState(empty, null)).toBe(empty);
  });

  test("a new trigger clears no dismissal that was for a different identity", () => {
    const prev: MenuState = { trigger: trig({ triggerIndex: 3 }), dismissedId: "n1:3" };
    const next = reduceTriggerState(prev, trig({ triggerIndex: 11 }));
    // dismissedId is carried (identity excludes query), but the new trigger's id
    // differs, so the menu is open for the new position.
    expect(next.dismissedId).toBe("n1:3");
    expect(isOpen(next)).toBe(true);
  });
});

describe("triggerId", () => {
  test("excludes the query", () => {
    expect(triggerId(trig({ query: "a" }))).toBe(triggerId(trig({ query: "bbb" })));
    expect(triggerId(trig({ triggerIndex: 5 }))).toBe("n1:5");
  });
});

describe("atWordBoundary", () => {
  test("true at triggerIndex 0 (does not read text[-1])", () => {
    expect(atWordBoundary({ triggerIndex: 0, textBeforeCaret: "/" })).toBe(true);
  });

  test("true after whitespace, false after a word char", () => {
    expect(atWordBoundary({ triggerIndex: 3, textBeforeCaret: "go /x" })).toBe(true);
    expect(atWordBoundary({ triggerIndex: 3, textBeforeCaret: "ab/x" })).toBe(false);
  });
});
