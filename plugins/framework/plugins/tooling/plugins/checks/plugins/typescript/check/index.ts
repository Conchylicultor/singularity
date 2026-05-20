import { discoverTscTargets } from "@plugins/framework/plugins/tooling/plugins/checks/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

async function runTsc(cwd: string, args: string[]): Promise<{ ok: true } | { ok: false; errors: string }> {
  const proc = Bun.spawn([process.execPath, "x", "tsc", "--noEmit", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (exitCode === 0) return { ok: true };
  return { ok: false, errors: stdout.trim() };
}

const check: Check = {
  id: "typescript",
  description: "All framework plugins with a tsconfig.json pass tsc --noEmit",
  async run() {
    const root = await getRoot();
    const targets = discoverTscTargets(root);

    const results = await Promise.all(
      targets.map(async (t) => ({ target: t, result: await runTsc(t.dir, t.args) })),
    );

    const failures = results.filter((r) => !r.result.ok);
    if (failures.length === 0) return { ok: true };

    const sections = failures.map(({ target, result }) => {
      const errors = (result as { ok: false; errors: string }).errors;
      return `${target.name}:\n    ${errors.split("\n").join("\n    ")}`;
    });

    const combined = failures
      .map((r) => (r.result as { ok: false; errors: string }).errors)
      .join("\n");
    const hasMissingModule = /error TS2307: Cannot find module/.test(combined);
    const hint = hasMissingModule
      ? "A \"Cannot find module\" error for a dep you didn't touch is usually a missing workspace link — run ./singularity build first (it re-runs bun install) and re-push. Otherwise: fix type errors before pushing; if a cast is necessary, fix the type definition instead."
      : "Fix type errors before pushing. If a cast is necessary, fix the type definition instead.";

    return {
      ok: false,
      message: `TypeScript type errors:\n  ${sections.join("\n  ")}`,
      hint,
    };
  },
};

export default check;
