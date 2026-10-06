import { describe, expect, test } from "bun:test";
import { questionRelayHook } from "./hook";

describe("questionRelayHook", () => {
  test("runs the script with bun, never timing out, with its spinner text", () => {
    expect(questionRelayHook({ scriptPath: "/srv/x/ask-relay.ts" })).toEqual({
      type: "command",
      command: 'bun "/srv/x/ask-relay.ts"',
      timeout: 2_000_000,
      statusMessage: "Waiting for your answer in Singularity…",
    });
  });

  test("a relative or unsafe script path throws", () => {
    for (const scriptPath of [
      "bin/ask-relay.ts",
      '/srv/a"b/ask-relay.ts',
      "/srv/o'brien/ask-relay.ts",
      "/srv/$HOME/ask-relay.ts",
    ]) {
      expect(() => questionRelayHook({ scriptPath })).toThrow(
        /must be absolute/,
      );
    }
  });
});
