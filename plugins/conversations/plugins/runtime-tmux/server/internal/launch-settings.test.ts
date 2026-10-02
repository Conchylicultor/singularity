import { describe, expect, test } from "bun:test";
import { resolveEffortSettings } from "@plugins/conversations/plugins/effort-provider/core";
import {
  mergeLaunchSettings,
  settingsFlag,
  signalHookSettings,
} from "./launch-settings";

const DIR = "/srv/data/state/tmux-signals";

describe("launch settings", () => {
  test("merges the thinking mode with the question hooks in one object", () => {
    const merged = mergeLaunchSettings(
      resolveEffortSettings("ultracode"),
      signalHookSettings(DIR),
    );
    expect(merged.ultracode).toBe(true);
    const hooks = merged.hooks as Record<string, unknown[]>;
    expect(Object.keys(hooks).sort()).toEqual([
      "PostToolUse",
      "PostToolUseFailure",
      "PreToolUse",
      "UserPromptSubmit",
    ]);
    expect(hooks.PreToolUse).toEqual([
      {
        matcher: "AskUserQuestion",
        hooks: [
          {
            type: "command",
            command: `touch "${DIR}/$SINGULARITY_CONVERSATION_ID"`,
          },
        ],
      },
    ]);
  });

  test("the flag is single-quoted JSON that contains no single quote", () => {
    const flag = settingsFlag(
      mergeLaunchSettings(
        resolveEffortSettings("ultracode"),
        signalHookSettings(DIR),
      ),
    );
    const json = flag.slice("--settings '".length, -1);
    expect(flag.startsWith("--settings '")).toBe(true);
    expect(flag.endsWith("'")).toBe(true);
    expect(json.includes("'")).toBe(false);
    expect(JSON.parse(json).hooks.UserPromptSubmit).toHaveLength(1);
  });

  test("a level without settings contributes nothing", () => {
    expect(
      mergeLaunchSettings(
        resolveEffortSettings("high"),
        signalHookSettings(DIR),
      ),
    ).toEqual(signalHookSettings(DIR));
  });

  test("two fragments setting one key throw", () => {
    expect(() =>
      mergeLaunchSettings({ hooks: {} }, signalHookSettings(DIR)),
    ).toThrow(/both set "hooks"/);
  });

  test("a single quote in a value throws instead of breaking the quoting", () => {
    expect(() => settingsFlag({ x: "it's" })).toThrow(/single quote/);
  });

  test("a signal dir unsafe to splice into a command throws", () => {
    expect(() => signalHookSettings("/srv/o'brien/x")).toThrow(
      /cannot be spliced/,
    );
  });
});
