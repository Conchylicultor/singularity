import { describe, expect, test } from "bun:test";
import { GIT } from "@plugins/infra/plugins/paths/server";
import { parsePsOutput } from "./process-snapshot";

const WT = "/repo/.claude/worktrees";

describe("parsePsOutput", () => {
  test("parses pid, ppid and a command containing spaces", () => {
    // Built from the resolved GIT binary rather than a hardcoded /usr/bin/git:
    // the path differs per machine (homebrew vs system), and hardcoding one is
    // what `paths:no-hardcoded-paths` exists to stop.
    const command = `${GIT} worktree remove /x --force`;
    const out = parsePsOutput(`  501   1 ${command}\n`, []);
    expect(out).toEqual([{ pid: 501, ppid: 1, command }]);
  });

  test("keeps a process whose command mentions the vanished checkout", () => {
    // No suspect binary here on purpose — this asserts the NEEDLE path.
    const stdout = `900 1 some-tool --path ${WT}/att-1-aaaa\n`;
    expect(parsePsOutput(stdout, [`${WT}/att-1-aaaa`])).toHaveLength(1);
  });

  test("drops unrelated processes", () => {
    const out = parsePsOutput(
      "700 1 /Applications/Music.app/Contents/MacOS/Music\n",
      [],
    );
    expect(out).toEqual([]);
  });

  test("keeps suspect commands even with no needle match", () => {
    const out = parsePsOutput("800 1 /bin/rm -rf /somewhere\n", []);
    expect(out.map((p) => p.pid)).toEqual([800]);
  });

  test("skips malformed lines rather than throwing", () => {
    const out = parsePsOutput("garbage\n\n  \n501 1 /bin/rm -rf /x\n", []);
    expect(out.map((p) => p.pid)).toEqual([501]);
  });

  test("truncates a pathological command line", () => {
    const out = parsePsOutput(`1 1 /bin/rm ${"x".repeat(5_000)}\n`, []);
    expect(out[0]!.command.length).toBe(200);
  });

  test("caps the number of candidates", () => {
    const stdout = Array.from(
      { length: 100 },
      (_, i) => `${i + 1} 1 /bin/rm -rf /x`,
    ).join("\n");
    expect(parsePsOutput(stdout, [])).toHaveLength(40);
  });
});
