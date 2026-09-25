import { join } from "path";
import {
  spawnCaptured,
  spawnPassthrough,
} from "@plugins/infra/plugins/spawn/core";
import { runtimePath } from "@plugins/infra/plugins/launcher/core";
import type { Namespace } from "@plugins/infra/plugins/namespace/core";
import { readCheckProgress } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { readTestStatus } from "@plugins/framework/plugins/cli/plugins/test/core";
import type { GateResult, ToolSpec } from "@plugins/toolchain/core";

/**
 * The environment every gate runs in: this process's, with PATH as the runtime
 * sees it (mise's shims first). Each gate is a fresh process started through
 * those shims, so it runs on whatever `mise.lock` records AT THAT MOMENT — the
 * current releases for the baseline, the new ones for the candidate — never on
 * the Bun this command itself started on.
 */
function gateEnv(): Record<string, string | undefined> {
  return { ...process.env, PATH: runtimePath(process.env) };
}

async function singularity(root: string, args: string[]): Promise<number> {
  console.log(`\n$ ./singularity ${args.join(" ")}`);
  const { exitCode } = await spawnPassthrough(
    [join(root, "singularity"), ...args],
    {
      cwd: root,
      env: gateEnv(),
    },
  );
  return exitCode;
}

/**
 * Every check, uncached. `--no-cache` because a recorded PASS is keyed on the
 * tree, not on the toolchain that produced it — reusing one would let the
 * candidate inherit the baseline's verdicts.
 *
 * The verdicts are read back from the durable check-progress log (the one
 * machine-readable per-check record), picking the run this invocation started.
 */
export async function runChecks(
  root: string,
  slug: Namespace,
  ids: readonly string[] = [],
): Promise<GateResult> {
  const startedAt = new Date().toISOString();
  const exitCode = await singularity(root, ["check", "--no-cache", ...ids]);
  const run = readCheckProgress().find(
    (r) => r.worktree === slug && r.startedAt >= startedAt && r.done !== null,
  );
  if (run === undefined) {
    throw new Error(
      `\`./singularity check\` exited ${exitCode} but left no finished run in the check-progress log — cannot tell which checks failed.`,
    );
  }
  const failures = run.completed.filter((c) => !c.ok).map((c) => c.checkId);
  // Everything selected must have settled; one that never did failed too.
  for (const id of run.selected ?? []) {
    if (!run.completed.some((c) => c.checkId === id)) failures.push(id);
  }
  if (exitCode !== 0 && failures.length === 0)
    failures.push(`(check exited ${exitCode})`);
  return { gate: "checks", failures };
}

/** Every test (or only `paths`), read back from `test-status.json`. */
export async function runTests(
  root: string,
  slug: Namespace,
  paths: readonly string[] = [],
): Promise<GateResult> {
  const startedAt = new Date().toISOString();
  const exitCode = await singularity(root, ["test", ...paths]);
  const status = readTestStatus(slug);
  if (
    status === null ||
    status.startedAt < startedAt ||
    status.status === "running"
  ) {
    throw new Error(
      `\`./singularity test\` exited ${exitCode} but did not record a finished run in test-status.json — cannot tell which tests failed.`,
    );
  }
  // A file that stops reporting on the new toolchain most likely crashes while
  // loading, so the unreported set is compared alongside the failures.
  const failures = status.runners.flatMap((r) => [
    ...r.failures,
    ...r.unreported.map((file) => `${file} > (no test cases reported)`),
  ]);
  if (exitCode !== 0 && failures.length === 0)
    failures.push(`(test exited ${exitCode})`);
  return { gate: "tests", failures };
}

/** One tool's smoke test. A failure is the smoke test's own name. */
export async function runSmoke(
  root: string,
  smoke: ToolSpec["smoke"][number],
): Promise<GateResult> {
  console.log(`\n$ ${smoke.argv.join(" ")}   (smoke: ${smoke.name})`);
  const result = await spawnCaptured([...smoke.argv], {
    cwd: join(root, smoke.cwd ?? "."),
    env: gateEnv(),
    mergeStderr: true,
    timeoutMs: smoke.timeoutMs,
  });
  const ok = result.exitCode === 0;
  const tail = result.stdout.trim().split("\n").slice(-20).join("\n");
  console.log(
    ok
      ? "  ok"
      : `  FAILED (exit ${result.exitCode}${result.timedOut ? ", timed out" : ""})\n${tail}`,
  );
  return { gate: `smoke: ${smoke.name}`, failures: ok ? [] : [smoke.name] };
}

/** Every gate a toolchain change must pass: checks, tests, and the moved tools' smoke tests. */
export async function runAllGates(
  root: string,
  slug: Namespace,
  moved: readonly ToolSpec[],
): Promise<GateResult[]> {
  const results = [await runChecks(root, slug), await runTests(root, slug)];
  for (const tool of moved) {
    for (const smoke of tool.smoke) results.push(await runSmoke(root, smoke));
  }
  return results;
}

/** Re-run only what regressed, to tell a flaky failure from a real one. */
export async function retryGates(
  root: string,
  slug: Namespace,
  moved: readonly ToolSpec[],
  suspected: readonly GateResult[],
): Promise<GateResult[]> {
  const results: GateResult[] = [];
  for (const { gate, failures } of suspected) {
    if (gate === "checks") {
      // A synthetic `(check exited n)` names no check to re-run: re-run them all.
      const ids = failures.filter((f) => !f.startsWith("("));
      results.push(
        await runChecks(root, slug, ids.length === failures.length ? ids : []),
      );
    } else if (gate === "tests") {
      const files = [...new Set(failures.map((f) => f.split(" > ")[0] ?? f))];
      results.push(
        await runTests(
          root,
          slug,
          files.some((f) => f.startsWith("(")) ? [] : files,
        ),
      );
    } else {
      const smoke = moved
        .flatMap((t) => t.smoke)
        .find((s) => gate === `smoke: ${s.name}`);
      if (smoke === undefined)
        throw new Error(`No smoke test behind gate "${gate}"`);
      results.push(await runSmoke(root, smoke));
    }
  }
  return results;
}
