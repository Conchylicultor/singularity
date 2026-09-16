import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import type { CliAction } from "@plugins/framework/plugins/cli/core";
import {
  getMainRepoRoot,
  getWorktreeRoot,
} from "@plugins/infra/plugins/spawn/core";
import {
  checkoutNamespace,
  worktreeArtifacts,
  worktreeDataDir,
} from "@plugins/infra/plugins/paths/core";
import type { Namespace } from "@plugins/infra/plugins/namespace/core";
import {
  TOOLS,
  confirmedFailures,
  lockProblems,
  newFailures,
  parseMiseLock,
  parseMiseToolRequests,
  setLockedVersion,
  upgradeTarget,
  type GateResult,
  type ToolSpec,
} from "@plugins/toolchain/core";
import { mise } from "../../shared/mise";
import { retryGates, runAllGates } from "./gates";

const MINUTE = 60_000;

/** `toolchain-upgrade.json`: what this run moved and what it proved. */
interface UpgradeReceipt {
  pid: number;
  startedAt: string;
  finishedAt: string | null;
  /**
   * `running` until the end. `current`: nothing newer to move to. `upgraded`:
   * mise.lock moved and nothing regressed. `regressed`: something only the new
   * releases fail, twice — mise.lock was put back.
   */
  verdict: "running" | "current" | "upgraded" | "regressed";
  mise: { before: string; after: string | null };
  moves: Array<{ tool: string; from: string; to: string }>;
  baseline: GateResult[] | null;
  candidate: GateResult[] | null;
  regressions: GateResult[] | null;
}

function writeReceipt(slug: Namespace, receipt: UpgradeReceipt): void {
  mkdirSync(worktreeDataDir(slug), { recursive: true });
  const path = worktreeArtifacts.toolchainUpgrade(slug);
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(receipt, null, 2) + "\n");
  renameSync(tmp, path);
}

function miseVersion(output: string): string {
  return output.trim().split(/\s+/)[0] ?? "";
}

function printGates(title: string, results: readonly GateResult[]): void {
  console.log(`\n${title}`);
  for (const { gate, failures } of results) {
    console.log(
      `  ${gate}: ${failures.length === 0 ? "ok" : `${failures.length} failing`}`,
    );
    for (const f of failures.slice(0, 20)) console.log(`    • ${f}`);
    if (failures.length > 20) console.log(`    … ${failures.length - 20} more`);
  }
}

const run: CliAction<[], { tool?: string }> = async (opts) => {
  const root = await getWorktreeRoot();
  if (root === (await getMainRepoRoot())) {
    console.error(
      "Refusing to upgrade the toolchain in the main checkout. Main's backend runs on its mise.lock; " +
        "a new release is proven in a worktree and reaches main through `./singularity push`.",
    );
    process.exit(1);
  }
  const slug = await checkoutNamespace(root);

  const only = opts.tool?.split(",").map((t) => t.trim());
  const unknown = only?.filter((t) => !TOOLS.some((s) => s.name === t)) ?? [];
  if (unknown.length > 0) {
    console.error(
      `Unknown --tool ${unknown.join(", ")}. Tools: ${TOOLS.map((t) => t.name).join(", ")}.`,
    );
    process.exit(1);
  }

  const lockPath = join(root, "mise.lock");
  const originalLock = readFileSync(lockPath, "utf8");
  const problems = lockProblems(
    parseMiseToolRequests(readFileSync(join(root, "mise.toml"), "utf8")),
    parseMiseLock(originalLock),
  );
  if (problems.length > 0) {
    console.error(
      `mise.toml / mise.lock are not sound; fix them first (\`./singularity check toolchain:resolved\`):\n  ${problems.join("\n  ")}`,
    );
    process.exit(1);
  }
  const locked = parseMiseLock(originalLock);

  const receipt: UpgradeReceipt = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    verdict: "running",
    mise: {
      before: miseVersion(await mise(root, ["--version"], MINUTE)),
      after: null,
    },
    moves: [],
    baseline: null,
    candidate: null,
    regressions: null,
  };
  writeReceipt(slug, receipt);
  console.log(`Receipt: ${worktreeArtifacts.toolchainUpgrade(slug)}`);

  // mise itself is part of the toolchain: an old mise resolves, installs and
  // locks with old bugs. It has no lock entry, so it simply moves to latest.
  console.log("Updating mise itself…");
  await mise(root, ["self-update", "--yes"], 10 * MINUTE);
  receipt.mise.after = miseVersion(await mise(root, ["--version"], MINUTE));
  console.log(`  mise ${receipt.mise.before} → ${receipt.mise.after}`);

  const moved: ToolSpec[] = [];
  for (const spec of TOOLS) {
    if (only !== undefined && !only.includes(spec.name)) continue;
    const from = locked.get(spec.name)?.[0] ?? "";
    const available = (await mise(root, ["ls-remote", spec.name], 5 * MINUTE))
      .split("\n")
      .map((l) => l.trim());
    const to = upgradeTarget(spec.name, available);
    if (to === null)
      throw new Error(
        `mise lists no usable release of ${spec.name} (every exact release is held, or ls-remote returned none).`,
      );
    console.log(
      `  ${spec.name}: ${from}${to === from ? " (latest)" : ` → ${to}`}`,
    );
    if (to === from) continue;
    receipt.moves.push({ tool: spec.name, from, to });
    moved.push(spec);
  }
  if (moved.length === 0) {
    receipt.verdict = "current";
    receipt.finishedAt = new Date().toISOString();
    writeReceipt(slug, receipt);
    console.log("\nEvery tool is on its latest release. Nothing to prove.");
    return;
  }

  // BASELINE — the current releases, so a failure the repo already has is not
  // blamed on the new ones.
  console.log("\n── Baseline: current releases ──");
  receipt.baseline = await runAllGates(root, slug, moved);
  writeReceipt(slug, receipt);

  // MOVE — install side by side (nothing is uninstalled: main and every other
  // worktree keep running their own locked releases), then record them.
  console.log("\n── Installing the new releases ──");
  let nextLock = originalLock;
  for (const { tool, to } of receipt.moves) {
    await mise(root, ["install", `${tool}@${to}`], 30 * MINUTE);
    nextLock = setLockedVersion(nextLock, tool, to);
  }
  // From here until the verdict, mise.lock names releases nothing has proven
  // yet: any way out other than "upgraded" puts the original back.
  const restore = () => writeFileSync(lockPath, originalLock);
  try {
    writeFileSync(lockPath, nextLock);
    await mise(root, ["lock"], 10 * MINUTE);
    const relocked = parseMiseLock(readFileSync(lockPath, "utf8"));
    for (const { tool, to } of receipt.moves) {
      const got = relocked.get(tool);
      if (got?.length !== 1 || got[0] !== to)
        throw new Error(
          `\`mise lock\` recorded ${tool} as ${JSON.stringify(got)} instead of ${to}.`,
        );
    }

    // CANDIDATE — the same gates on the new releases.
    console.log("\n── Candidate: new releases ──");
    receipt.candidate = await runAllGates(root, slug, moved);
    writeReceipt(slug, receipt);

    const suspected = newFailures(receipt.baseline, receipt.candidate);
    receipt.regressions =
      suspected.length === 0
        ? []
        : confirmedFailures(
            suspected,
            await retryGates(root, slug, moved, suspected),
          );

    printGates("Baseline (current releases):", receipt.baseline);
    printGates("Candidate (new releases):", receipt.candidate);
    receipt.finishedAt = new Date().toISOString();

    if (receipt.regressions.length > 0) {
      restore();
      receipt.verdict = "regressed";
      writeReceipt(slug, receipt);
      printGates(
        "REGRESSIONS (fail only on the new releases, twice):",
        receipt.regressions,
      );
      console.error(
        "\nmise.lock was put back. Find the tool responsible with `--tool <name>`, one tool at a time.",
      );
      process.exit(1);
    }
  } catch (err) {
    restore();
    console.error("\nmise.lock was put back.");
    throw err;
  }

  receipt.verdict = "upgraded";
  writeReceipt(slug, receipt);
  console.log(
    `\nUPGRADED: ${receipt.moves.map((m) => `${m.tool} ${m.from} → ${m.to}`).join(", ")}. ` +
      "No regression against the current releases. mise.lock is updated — commit it.",
  );
};

export default run;
