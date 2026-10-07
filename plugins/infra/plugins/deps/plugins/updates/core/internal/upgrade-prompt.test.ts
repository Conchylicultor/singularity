import { describe, expect, test } from "bun:test";
import { upgradeTaskDescription, type OutdatedUpdater } from "./upgrade-prompt";

const batch: OutdatedUpdater[] = [
  {
    updaterId: "mise",
    outdated: [{ name: "bun", current: "1.3.12", latest: "1.3.13" }],
    holdsFile: "mise.holds.jsonc",
  },
];

const AUTHORIZATION = "You are authorized to push";

describe("upgradeTaskDescription", () => {
  test("autoPush on: authorizes the push, scoped to an upgraded verdict", () => {
    const text = upgradeTaskDescription(batch, { autoPush: true });
    expect(text).toContain(AUTHORIZATION);
    expect(text).toContain("./singularity push -m");
    expect(text).toContain("- bun 1.3.12 → 1.3.13");
  });

  test("autoPush off: no authorization, no push command, stop and flag", () => {
    const text = upgradeTaskDescription(batch, { autoPush: false });
    expect(text).not.toContain(AUTHORIZATION);
    expect(text).not.toContain("./singularity push");
    expect(text).not.toContain("land it");
    expect(text).toContain("Then stop: do NOT push.");
    expect(text).toContain("Raise a flag for review");
    expect(text).toContain("- bun 1.3.12 → 1.3.13");
  });
});
