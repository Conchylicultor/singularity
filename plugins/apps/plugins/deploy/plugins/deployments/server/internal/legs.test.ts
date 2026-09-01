import { describe, expect, test } from "bun:test";
import { legRunId, parseLegRunId } from "./legs";

// The run id is `drun-<ms>-<rand>` — full of dashes, and the reason the leg
// separator is a dot. These assert the boundary is found where it actually is.
const RUN_ID = "drun-1787890652933-wr3v6d";

describe("leg ids", () => {
  test("round-trip both legs", () => {
    for (const leg of ["converge", "ship"] as const) {
      expect(parseLegRunId(legRunId(RUN_ID, leg))).toEqual({
        runId: RUN_ID,
        leg,
      });
    }
  });

  test("the run id's own dashes are not separators", () => {
    expect(legRunId(RUN_ID, "ship")).toBe(`${RUN_ID}.ship`);
    expect(parseLegRunId(`${RUN_ID}.ship`)?.runId).toBe(RUN_ID);
  });

  // `build` is a PHASE of an update, not a leg: it spawns nothing of its own, it
  // awaits the release engine in-process. A leg id naming it would name an
  // artifact that cannot exist.
  test("a phase that spawns nothing is not a leg", () => {
    expect(parseLegRunId(`${RUN_ID}.build`)).toBeNull();
  });

  test("a bare run id is not a leg id", () => {
    expect(parseLegRunId(RUN_ID)).toBeNull();
    expect(parseLegRunId(".ship")).toBeNull();
  });
});
