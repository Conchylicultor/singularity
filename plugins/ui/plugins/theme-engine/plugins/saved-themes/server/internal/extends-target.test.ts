import { describe, it, expect } from "bun:test";

import { checkExtendsTarget } from "./extends-target";

// saved id → its own `extends`
const saved = new Map<string, string | undefined>([
  ["tweakcn:ocean", undefined],
  ["custom:a", "tweakcn:ocean"],
  ["custom:b", "custom:a"],
  ["custom:on-code", "equin"],
]);

describe("checkExtendsTarget", () => {
  it("accepts a code theme id, which the server cannot see", () => {
    expect(checkExtendsTarget("custom:new", "default", saved)).toEqual({
      ok: true,
    });
  });

  it("accepts an existing saved theme, however deep its chain", () => {
    expect(checkExtendsTarget("custom:new", "custom:b", saved)).toEqual({
      ok: true,
    });
    expect(checkExtendsTarget("custom:new", "custom:on-code", saved)).toEqual({
      ok: true,
    });
  });

  it("refuses a saved-theme id with no row", () => {
    const check = checkExtendsTarget("custom:new", "custom:gone", saved);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toContain("no saved theme has that id");
  });

  it("refuses a chain that loops back to the theme being written", () => {
    // Re-importing tweakcn:ocean on top of its own descendant.
    const check = checkExtendsTarget("tweakcn:ocean", "custom:b", saved);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toContain("loop back");
    expect(checkExtendsTarget("custom:a", "custom:a", saved).ok).toBe(false);
  });

  it("refuses a chain that reaches a missing ancestor", () => {
    const broken = new Map([...saved, ["custom:c", "custom:vanished"]]);
    const check = checkExtendsTarget("custom:new", "custom:c", broken);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toContain("no longer exists");
  });
});
