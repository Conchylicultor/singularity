import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  confirmedFailures,
  newFailures,
  type GateResult,
} from "../../core/internal/compare";
import type { Gates } from "./gates";
import type { Move, Updater, UpdaterSmoke } from "../../core/internal/updater";

/**
 * `running` until the end. `current`: nothing newer to move to. `upgraded`: the
 * files moved and nothing regressed. `regressed`: something only the moved
 * inputs fail, twice — the files were put back.
 */
export type UpgradeVerdict = "running" | "current" | "upgraded" | "regressed";

/** `deps-upgrade-<updater>.json`: what this run moved and what it proved. */
export interface UpgradeReceipt {
  updater: string;
  pid: number;
  startedAt: string;
  finishedAt: string | null;
  verdict: UpgradeVerdict;
  /** What `prepare` recorded (mise: its own version before and after). */
  notes: Record<string, string>;
  moves: Move[];
  baseline: GateResult[] | null;
  candidate: GateResult[] | null;
  regressions: GateResult[] | null;
}

function writeReceipt(path: string, receipt: UpgradeReceipt): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(receipt, null, 2) + "\n");
  renameSync(tmp, path);
}

export function formatMove(m: Move): string {
  return m.from === null
    ? `${m.name} (new) → ${m.to}`
    : `${m.name} ${m.from} → ${m.to}`;
}

function printGates(
  log: (line: string) => void,
  title: string,
  results: readonly GateResult[],
): void {
  log(`\n${title}`);
  for (const { gate, failures } of results) {
    log(
      `  ${gate}: ${failures.length === 0 ? "ok" : `${failures.length} failing`}`,
    );
    for (const f of failures.slice(0, 20)) log(`    • ${f}`);
    if (failures.length > 20) log(`    … ${failures.length - 20} more`);
  }
}

/** The files an updater may rewrite, as they are now (`null`: absent). */
function snapshot(
  root: string,
  files: readonly string[],
): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const rel of files) {
    const path = join(root, rel);
    out.set(rel, existsSync(path) ? readFileSync(path, "utf8") : null);
  }
  return out;
}

function restore(
  root: string,
  saved: ReadonlyMap<string, string | null>,
): void {
  for (const [rel, content] of saved) {
    const path = join(root, rel);
    if (content === null) rmSync(path, { force: true });
    else writeFileSync(path, content);
  }
}

/**
 * One upgrade, the gated way. The loop `plugins/toolchain` proved, made
 * generic over the updater:
 *
 * 1. `prepare` (mise updates itself), then `plan` the moves. None → `current`.
 * 2. BASELINE — every gate on the current inputs, so a failure the repo already
 *    has is not blamed on the new ones.
 * 3. MOVE — snapshot the updater's files, `apply`.
 * 4. CANDIDATE — the same gates on the moved inputs.
 * 5. A failure only the candidate has is retried; one that fails AGAIN is a
 *    regression: the files are put back → `regressed`. Otherwise `upgraded`.
 *
 * Any throw after the move puts the files back too: from the move until the
 * verdict, the files name releases nothing has proven yet.
 *
 * Pure of process state: the caller resolves the checkout, the receipt path and
 * the gates (the real ones spawn `./singularity check` / `test`).
 */
export async function runUpgrade(args: {
  updater: Updater;
  only: readonly string[] | undefined;
  root: string;
  receiptPath: string;
  gates: Gates;
  log: (line: string) => void;
}): Promise<UpgradeReceipt> {
  const { updater, only, root, receiptPath, gates, log } = args;
  const receipt: UpgradeReceipt = {
    updater: updater.id,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    verdict: "running",
    notes: {},
    moves: [],
    baseline: null,
    candidate: null,
    regressions: null,
  };
  writeReceipt(receiptPath, receipt);
  log(`Receipt: ${receiptPath}`);

  if (updater.prepare !== undefined) {
    receipt.notes = { ...(await updater.prepare(root, log)) };
    writeReceipt(receiptPath, receipt);
  }

  receipt.moves = await updater.plan(root, only);
  if (receipt.moves.length === 0) {
    receipt.verdict = "current";
    receipt.finishedAt = new Date().toISOString();
    writeReceipt(receiptPath, receipt);
    log(
      `\n${updater.id}: everything is on its latest release. Nothing to prove.`,
    );
    return receipt;
  }
  for (const m of receipt.moves) log(`  ${formatMove(m)}`);
  const smoke: readonly UpdaterSmoke[] = await updater.smoke(
    root,
    receipt.moves,
  );

  log("\n── Baseline: current releases ──");
  receipt.baseline = await gates.all(smoke);
  writeReceipt(receiptPath, receipt);

  const saved = snapshot(root, await updater.files(root));
  try {
    log("\n── Moving ──");
    await updater.apply(root, receipt.moves, log);

    log("\n── Candidate: new releases ──");
    receipt.candidate = await gates.all(smoke);
    writeReceipt(receiptPath, receipt);

    const suspected = newFailures(receipt.baseline, receipt.candidate);
    receipt.regressions =
      suspected.length === 0
        ? []
        : confirmedFailures(suspected, await gates.retry(smoke, suspected));
  } catch (err) {
    restore(root, saved);
    log(`\n${[...saved.keys()].join(", ")} put back.`);
    throw err;
  }

  printGates(log, "Baseline (current releases):", receipt.baseline);
  printGates(log, "Candidate (new releases):", receipt.candidate);
  receipt.finishedAt = new Date().toISOString();

  if (receipt.regressions.length > 0) {
    restore(root, saved);
    receipt.verdict = "regressed";
    writeReceipt(receiptPath, receipt);
    printGates(
      log,
      "REGRESSIONS (fail only on the new releases, twice):",
      receipt.regressions,
    );
    log(
      `\n${[...saved.keys()].join(", ")} put back. Find the input responsible with \`--only <name>\`, one at a time.`,
    );
    return receipt;
  }

  receipt.verdict = "upgraded";
  writeReceipt(receiptPath, receipt);
  log(
    `\nUPGRADED: ${receipt.moves.map(formatMove).join(", ")}. ` +
      `No regression against the current releases. ${[...saved.keys()].join(", ")} updated — commit it.`,
  );
  return receipt;
}
