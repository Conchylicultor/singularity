import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";

const DOCTOR = join(import.meta.dir, "..", "doctor.sh");

/**
 * A machine the doctor can see nothing of but what a scenario puts there: PATH
 * is ONLY a directory of stub executables (the doctor's probes are builtins
 * plus the tools it checks), and HOME is empty.
 */
interface Machine {
  home: string;
  bin: string;
  shims: string;
}

const made: string[] = [];

function machine(): Machine {
  const home = mkdtempSync(join(tmpdir(), "sg-doctor-"));
  made.push(home);
  const bin = join(home, "stub-bin");
  const shims = join(home, ".local", "share", "mise", "shims");
  mkdirSync(bin, { recursive: true });
  mkdirSync(shims, { recursive: true });
  return { home, bin, shims };
}

function stub(dir: string, name: string, body: string): void {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

/** A healthy macOS user; each scenario then breaks one thing. */
function healthy(m: Machine): void {
  stub(m.bin, "id", "echo 501");
  stub(m.bin, "uname", "echo Darwin");
  stub(m.bin, "xcode-select", "echo /Library/Developer/CommandLineTools");
  stub(m.bin, "git", "echo 'git version 2.50.0'");
  stub(m.bin, "mise", "exit 0");
  stub(m.bin, "claude", `echo '{ "loggedIn": true }'`);
}

async function doctor(m: Machine, path: string[] = [m.bin, m.shims]) {
  const result = await spawnCaptured(["/bin/sh", DOCTOR], {
    cwd: m.home,
    env: { HOME: m.home, PATH: path.join(":"), SHELL: "/bin/zsh" },
    timeoutMs: 30_000,
  });
  return { code: result.exitCode, out: result.stdout + result.stderr };
}

afterEach(() => {
  for (const dir of made.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("doctor.sh", () => {
  test("a healthy machine passes", async () => {
    const m = machine();
    healthy(m);
    const { code, out } = await doctor(m);
    expect(out).toContain("all required present");
    expect(out).not.toContain("recommended");
    expect(code).toBe(0);
  });

  test("a clean Mac: every missing prerequisite is named in ONE run", async () => {
    const m = machine();
    stub(m.bin, "id", "echo 501");
    stub(m.bin, "uname", "echo Darwin");
    // No xcode-select success, no mise, no claude.
    stub(m.bin, "xcode-select", "exit 2");
    const { code, out } = await doctor(m, [m.bin]);
    expect(code).toBe(1);
    expect(out).toContain("2 missing");
    expect(out).toContain("xcode-select --install");
    expect(out).toContain("curl https://mise.run | sh");
    expect(out).toContain("1 recommended");
    expect(out).toContain("https://claude.ai/install.sh");
  });

  test("root is refused", async () => {
    const m = machine();
    healthy(m);
    stub(m.bin, "id", "echo 0");
    const { code, out } = await doctor(m);
    expect(code).toBe(1);
    expect(out).toContain("Running as root");
  });

  test("mise installed but not active in the shell", async () => {
    const m = machine();
    healthy(m);
    rmSync(join(m.bin, "mise"));
    const local = join(m.home, ".local", "bin");
    mkdirSync(local, { recursive: true });
    stub(local, "mise", "exit 0");
    const { code, out } = await doctor(m, [m.bin]);
    expect(code).toBe(1);
    expect(out).toContain("1 missing");
    expect(out).toContain("not active in your shell");
    expect(out).toContain("mise activate zsh");
  });

  test("names the missing locked tools, and advises on a signed-out Claude Code", async () => {
    const m = machine();
    healthy(m);
    stub(
      m.bin,
      "mise",
      [
        'case "$1 $2" in',
        '  "install --dry-run-code") exit 1 ;;',
        '  "ls --missing") echo "go    1.27.1"; echo "rust  1.95.0" ;;',
        "esac",
      ].join("\n"),
    );
    stub(m.bin, "claude", `echo '{ "loggedIn": false }'; exit 1`);
    const { code, out } = await doctor(m);
    expect(code).toBe(1);
    expect(out).toContain("1 missing");
    expect(out).toContain("go@1.27.1 rust@1.95.0");
    expect(out).toContain("1 recommended");
    expect(out).toContain("claude auth login");
  });

  test("Claude Code absent or signed out is advice, not a failure", async () => {
    const m = machine();
    healthy(m);
    stub(m.bin, "claude", `echo '{ "loggedIn": false }'; exit 1`);
    const signedOut = await doctor(m);
    expect(signedOut.code).toBe(0);
    expect(signedOut.out).toContain("all required present");
    expect(signedOut.out).toContain("Claude Code is not signed in");
    expect(signedOut.out).toContain("claude auth login");

    rmSync(join(m.bin, "claude"));
    const absent = await doctor(m);
    expect(absent.code).toBe(0);
    expect(absent.out).toContain("1 recommended");
    expect(absent.out).toContain("https://claude.ai/install.sh");
  });

  test("looks for claude where the server does (paths/server bins.ts)", () => {
    const bins = readFileSync(
      join(
        import.meta.dir,
        "../../../../../../infra/plugins/paths/server/internal/bins.ts",
      ),
      "utf8",
    );
    const claudeBlock = bins.slice(
      bins.indexOf("export const CLAUDE_CANDIDATES"),
    );
    const candidates = [
      ...claudeBlock
        .slice(0, claudeBlock.indexOf("];"))
        .matchAll(/[`"]([^`"]*\/claude)[`"]/g),
    ].map(([, p]) => p!.replace(/^\$\{[^}]*\}/, "$HOME"));
    expect(candidates.length).toBeGreaterThan(0);
    const script = readFileSync(DOCTOR, "utf8");
    expect(script).toContain("SINGULARITY_CLAUDE_BIN");
    for (const p of candidates) expect(script).toContain(`"${p}"`);
  });
});
