import { describe, expect, test } from "bun:test";
import { tmuxHookCommands } from "./tmux-hooks";

describe("tmuxHookCommands", () => {
  test("one indexed global hook per session event, each touching the session's file", () => {
    expect(tmuxHookCommands("/d")).toEqual([
      [
        "set-hook",
        "-g",
        "session-created[73]",
        `run-shell -b "touch '/d/#{hook_session_name}'"`,
      ],
      [
        "set-hook",
        "-g",
        "session-closed[73]",
        `run-shell -b "touch '/d/#{hook_session_name}'"`,
      ],
      // pane-exited leaves #{hook_session_name} empty (tmux 3.6a).
      [
        "set-hook",
        "-g",
        "pane-exited[73]",
        `run-shell -b "touch '/d/#{session_name}'"`,
      ],
    ]);
  });

  test("a dir tmux or the shell would re-parse throws", () => {
    expect(() => tmuxHookCommands("/a/#{x}")).toThrow(/cannot be spliced/);
    expect(() => tmuxHookCommands("/a/'b")).toThrow(/cannot be spliced/);
  });
});
