import { existsSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import type { CliAction } from "@plugins/framework/plugins/cli/core";
import { withDirectOp } from "@plugins/framework/plugins/cli/plugins/op-runtime/cli";
import { cpuBudget } from "@plugins/infra/plugins/host/plugins/host-admission/core";
import {
  getWorktreeRoot,
  spawnPassthrough,
} from "@plugins/infra/plugins/spawn/core";
import {
  TEST_FILE_GLOB,
  isTestFilePath,
  partitionTestPaths,
} from "@plugins/framework/plugins/tooling/plugins/test-layout/core";

// No args ⇒ every test in the repo. `plugins/` is the whole of it: both runners
// are scoped to that tree (vitest's `include` literally starts `plugins/**`).
const DEFAULT_TARGET = "plugins";

/**
 * One user-supplied path (file or directory), resolved to a repo-relative path
 * plus the repo-relative `*.test.ts(x)` files under it.
 *
 * The enumeration exists ONLY to classify — which runners have work — never to
 * be handed to a runner. Both runners take path filters of their own, so they
 * get `rel` and re-enumerate; see the action below.
 */
async function enumerateTests(
  root: string,
  target: string,
): Promise<{ rel: string; files: string[] }> {
  const abs = resolve(process.cwd(), target);
  if (!existsSync(abs)) {
    console.error(`No such path: ${target}`);
    process.exit(1);
  }
  // `""` is the repo root itself (`./singularity test .`), which as a runner
  // path filter would match nothing rather than everything.
  const rel = relative(root, abs) || ".";
  if (rel.startsWith("..")) {
    console.error(`Path is outside the repo: ${target}`);
    process.exit(1);
  }

  if (statSync(abs).isFile()) {
    return { rel, files: isTestFilePath(rel) ? [rel] : [] };
  }

  const files: string[] = [];
  for await (const hit of new Bun.Glob(TEST_FILE_GLOB).scan({
    cwd: abs,
    onlyFiles: true,
  })) {
    // `scan` walks into `node_modules`; a dependency's own test files belong to
    // neither runner's scope and would misreport both buckets.
    if (hit.split("/").includes("node_modules")) continue;
    files.push(join(rel, hit));
  }
  return { rel, files };
}

// Run one runner to completion, its output inherited (interleaving two runners'
// output would be unreadable, so the caller keeps these sequential). The banner
// is what makes a concatenated transcript attributable to a runner. `env`
// carries the host grant, so a runner that spawns workers of its own spends
// the units this op holds rather than acquiring host-wide again.
async function runRunner(
  name: string,
  argv: string[],
  root: string,
  env: Record<string, string | undefined>,
): Promise<number> {
  console.log(`\n── ${name} ──`);
  const { exitCode } = await spawnPassthrough(argv, { cwd: root, env });
  return exitCode;
}

const run: CliAction<[string[]], object> = async (paths) => {
  const root = await getWorktreeRoot();
  const targets = paths.length > 0 ? paths : [DEFAULT_TARGET];

  // Classify first: which buckets have files decides which runners run at
  // all, and the counts are what the closing summary reports.
  const runnerArgs: string[] = [];
  // A Set, because overlapping args (`test plugins plugins/page`) enumerate
  // the same file twice and the runners deduplicate — the counts must too.
  const found = new Set<string>();
  for (const target of targets) {
    const { rel, files } = await enumerateTests(root, target);
    // Repo-relative rather than the literal argv the user typed, because
    // both runners are spawned with `cwd: root` (that is where bunfig.toml
    // and vitest.config.ts live). From the repo root — where the CLI is
    // normally invoked — the two are the same string.
    runnerArgs.push(rel);
    for (const file of files) found.add(file);
  }
  const { bun, dom, orphan } = partitionTestPaths([...found]);

  // A path in NEITHER runner's scope. `test-layout:runner-split` rule (c)
  // rejects these repo-wide, so this can only fire on a file the check has
  // not seen yet — and it must be loud, because such a file looks tested
  // and never runs. Refused HERE, before the op below: this is a
  // classification failure, not a test outcome, and it must not queue for a
  // host CPU slot (minutes, under load) just to be told the path was wrong.
  // Same for an empty selection.
  if (orphan.length > 0) {
    console.error(
      `\nIn neither runner's scope (these tests would NOT run):\n  ${orphan.join("\n  ")}\n` +
        "Run `./singularity check test-layout:runner-split` for the rule.",
    );
    process.exit(1);
  }

  // Nothing to run at all. Reporting that as success would be the same lie
  // the command exists to prevent — a green result for tests that never ran —
  // so it is an explicit failure naming the paths (vitest's own default for
  // "no test files found" is likewise non-zero).
  if (found.size === 0) {
    console.error(`\nNo test files under: ${runnerArgs.join(", ")}`);
    process.exit(1);
  }

  // A test run is an OP, like a direct check: it takes a host CPU grant (its
  // queue time visible as a `host-grant` wait), plants the worktree op marker
  // (the conversation reads "working", the banner reads "Test in progress")
  // and lands an op-log record. The lifecycle is shared with `check` and the
  // e2e branch of `run` — see op-runtime/cli/direct-op.ts; what is this
  // command's own is which runners to spawn and what their exits mean.
  //
  // The grant is the elastic share (`cpuBudget().B` is a ceiling; the acquire
  // hands back what it could get, `>= 1`), and it is spent by exactly ONE of
  // the runners. `bun test` runs its files in one process (`--parallel` is
  // opt-in, so there is nothing to bound); vitest's default `forks` pool is
  // sized to the core count, so `--maxWorkers=<units>` is what makes the
  // grant real. This asymmetry is deliberate — do not "fix" it into symmetry
  // by capping bun, which would cap nothing.
  const outcome = await withDirectOp(
    "test",
    { max: cpuBudget().B },
    async (grant) => {
      const env = { ...process.env, ...grant.env() };
      const bunExit =
        bun.length > 0
          ? await runRunner(
              "bun:test",
              [process.execPath, "test", ...runnerArgs],
              root,
              env,
            )
          : null;
      // `bun x vitest` resolves the repo's own vitest and honors its
      // `#!/usr/bin/env node` shebang — the same runtime `bun run test:dom`
      // gives it. `vitest run` picks up the root `vitest.config.ts` from `cwd`.
      const domExit =
        dom.length > 0
          ? await runRunner(
              "vitest",
              [
                process.execPath,
                "x",
                "vitest",
                "run",
                `--maxWorkers=${grant.units}`,
                ...runnerArgs,
              ],
              root,
              env,
            )
          : null;

      // The summary names BOTH buckets, always — an empty one is stated, never
      // implied by silence. That line is the whole reason this command exists:
      // `bun test <plugin-dir>` is green and partial in exactly the case where
      // this prints "no jsdom tests under this path".
      const where = targets.length > 1 ? "these paths" : "this path";
      const report = (
        label: string,
        exit: number | null,
        count: number,
        empty: string,
      ) =>
        console.log(
          exit === null
            ? `${label.padEnd(10)}${empty} under ${where}`
            : `${label.padEnd(10)}${count} ${count === 1 ? "file " : "files"}   exit ${exit}`,
        );
      console.log("");
      report("bun:test", bunExit, bun.length, "no bun:test files");
      report("vitest", domExit, dom.length, "no jsdom tests");

      const failed = [
        bunExit !== null && bunExit !== 0 ? "bun:test" : null,
        domExit !== null && domExit !== 0 ? "vitest" : null,
      ].filter((name): name is string => name !== null);
      if (failed.length === 0) return "success";
      console.error(`\nFAILED: ${failed.join(", ")}`);
      return "failed";
    },
  );
  if (outcome !== "success") process.exit(1);
};

export default run;
