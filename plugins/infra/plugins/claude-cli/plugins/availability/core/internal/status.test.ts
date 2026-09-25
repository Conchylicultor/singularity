import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLAUDE_CODE_FIX, claudeCodeBlockMessage } from "./status";

describe("Claude Code fix commands", () => {
  test("match what the prerequisite doctor prints", () => {
    const doctor = readFileSync(
      join(
        import.meta.dir,
        "../../../../../../../framework/plugins/cli/plugins/doctor/doctor.sh",
      ),
      "utf8",
    );
    expect(doctor).toContain(`"${CLAUDE_CODE_FIX.install}"`);
    expect(doctor).toContain(`"${CLAUDE_CODE_FIX.signIn}"`);
  });

  test("the refusal names the problem and every command, in order", () => {
    expect(claudeCodeBlockMessage({ kind: "missing", searched: [] })).toBe(
      "Claude Code is not installed, so no agent can start. Run `curl -fsSL https://claude.ai/install.sh | bash` then `claude auth login` in a terminal, then try again.",
    );
    expect(claudeCodeBlockMessage({ kind: "signed-out", version: "1" })).toBe(
      "Claude Code is not signed in, so no agent can start. Run `claude auth login` in a terminal, then try again.",
    );
  });
});
