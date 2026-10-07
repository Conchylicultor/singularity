import { describe, expect, test } from "bun:test";
import { parsePaneRows } from "./pane-rows";

function row(
  session: string,
  pid = "100",
  paneId = "%1",
  title = "✳ Fix it",
): string {
  return [session, pid, paneId, "0", "/wt/att-1", title].join("\t");
}

describe("parsePaneRows", () => {
  test("keeps only the sessions this runtime manages", () => {
    // `spike-auq` is a hand-made session an agent started with `claude` in it:
    // the tmux-side filter this replaced let it through, and main adopted it.
    const panes = parsePaneRows(
      [
        row("conv-1791321671-ov6h", "1", "%1"),
        row("claude-1787000000-abcd", "2", "%2"),
        row("spike-auq", "3", "%3"),
        row("main", "4", "%4"),
      ].join("\n"),
    );
    expect([...panes.keys()]).toEqual([
      "conv-1791321671-ov6h",
      "claude-1787000000-abcd",
    ]);
  });

  test("parses one pane, the title keeping its tabs", () => {
    const panes = parsePaneRows(`${row("conv-1-a", "42", "%7", "✳ a\tb")}\n`);
    expect(panes.get("conv-1-a")).toEqual({
      panePid: 42,
      paneId: "%7",
      dead: false,
      worktreePath: "/wt/att-1",
      rawTitle: "✳ a\tb",
    });
  });

  test("first pane of a session wins; malformed lines are skipped", () => {
    const panes = parsePaneRows(
      [
        row("conv-1-a", "1", "%1"),
        row("conv-1-a", "2", "%2"),
        row("conv-1-b", "not-a-pid", "%3"),
        "conv-1-c",
      ].join("\n"),
    );
    expect([...panes.keys()]).toEqual(["conv-1-a"]);
    expect(panes.get("conv-1-a")?.paneId).toBe("%1");
  });

  test("empty output is no panes", () => {
    expect(parsePaneRows("").size).toBe(0);
  });
});
