import { describe, it, expect } from "bun:test";

import { planDelete, type ThemeSelection } from "./delete-plan";

const theme = { id: "custom:mine", label: "Mine" };
const selections: ThemeSelection[] = [
  { themeId: "custom:mine" }, // the desktop
  { scopeId: "app:website", themeId: "equin" },
  { scopeId: "app:mail", themeId: "custom:mine" },
];

describe("planDelete", () => {
  it("refuses while any scope selects the theme, naming each one", () => {
    const plan = planDelete(theme, selections, false);
    expect(plan.kind).toBe("refuse");
    if (plan.kind !== "refuse") return;
    expect(plan.inUse.usedBy).toEqual([{}, { scopeId: "app:mail" }]);
    expect(plan.inUse.message).toContain("the desktop, app:mail");
  });

  it("with reassign, deletes and moves exactly those scopes to Default", () => {
    expect(planDelete(theme, selections, true)).toEqual({
      kind: "delete",
      reassign: [{}, { scopeId: "app:mail" }],
    });
  });

  it("deletes an unused theme outright", () => {
    expect(
      planDelete({ id: "custom:unused", label: "U" }, selections, false),
    ).toEqual({
      kind: "delete",
      reassign: [],
    });
  });
});
