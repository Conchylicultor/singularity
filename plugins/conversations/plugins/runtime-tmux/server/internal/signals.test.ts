import { describe, expect, test } from "bun:test";
import { opSignalSlugs } from "./signals";

describe("opSignalSlugs", () => {
  const dir = "/data/state/worktree-op-signals";

  test("a touched file names its worktree, once per batch", () => {
    expect(
      opSignalSlugs([
        { type: "create", path: `${dir}/att-1-x` },
        { type: "update", path: `${dir}/att-1-x` },
        { type: "update", path: `${dir}/singularity` },
      ]),
    ).toEqual(["att-1-x", "singularity"]);
  });

  test("a deletion (the prune job) is not a signal", () => {
    expect(opSignalSlugs([{ type: "delete", path: `${dir}/att-1-x` }])).toEqual(
      [],
    );
  });
});
