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

/** One updater a run moves, restricted to `only` (names it knows) when given. */
export interface UpgradeSelection {
  updater: Updater;
  only?: readonly string[];
}

/** A move, with the updater that makes it. */
export interface UpdaterMove extends Move {
  updater: string;
}

/**
 * `deps-upgrade-<updater>.json` (one updater) or `deps-upgrade.json` (every
 * updater at once): what this run moved and what it proved.
 */
export interface UpgradeReceipt {
  updaters: string[];
  pid: number;
  startedAt: string;
  finishedAt: string | null;
  verdict: UpgradeVerdict;
  /** What each updater's `prepare` recorded (mise: its own version before and after), by updater id. */
  notes: Record<string, Record<string, string>>;
  moves: UpdaterMove[];
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

export function formatMove(m: UpdaterMove): string {
  return m.from === null
    ? `${m.updater} ${m.name} (new) → ${m.to}`
    : `${m.updater} ${m.name} ${m.from} → ${m.to}`;
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
 * One upgrade, the gated way, over one or several updaters at once. The loop
 * `plugins/toolchain` proved, made generic over the updater:
 *
 * 1. Each updater's `prepare` (mise updates itself), then `plan` the moves.
 *    None anywhere → `current`.
 * 2. BASELINE — every gate on the current inputs, so a failure the repo already
 *    has is not blamed on the new ones.
 * 3. MOVE — snapshot every updater's files, `apply` each updater's moves in turn.
 * 4. CANDIDATE — the same gates on the moved inputs.
 * 5. A failure only the candidate has is retried; one that fails AGAIN is a
 *    regression: every file is put back → `regressed`. Otherwise `upgraded`.
 *
 * Batching costs one baseline and one candidate however many updaters move;
 * the price is that a regression is not attributed — the caller narrows it by
 * running one updater, then one name, at a time.
 *
 * Any throw after the move puts the files back too: from the move until the
 * verdict, the files name releases nothing has proven yet.
 *
 * Pure of process state: the caller resolves the checkout, the receipt path and
 * the gates (the real ones spawn `./singularity check` / `test`).
 */
export async function runUpgrade(args: {
  selection: readonly UpgradeSelection[];
  root: string;
  receiptPath: string;
  gates: Gates;
  log: (line: string) => void;
}): Promise<UpgradeReceipt> {
  const { selection, root, receiptPath, gates, log } = args;
  if (selection.length === 0) throw new Error("No updater to run.");
  const receipt: UpgradeReceipt = {
    updaters: selection.map((s) => s.updater.id),
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

  // Every updater's moves, planned before any gate runs.
  const planned: { updater: Updater; moves: Move[] }[] = [];
  for (const { updater, only } of selection) {
    if (updater.prepare !== undefined) {
      receipt.notes[updater.id] = { ...(await updater.prepare(root, log)) };
      writeReceipt(receiptPath, receipt);
    }
    const moves = await updater.plan(root, only);
    if (moves.length === 0) {
      log(`${updater.id}: everything is on its latest release.`);
      continue;
    }
    planned.push({ updater, moves });
    receipt.moves.push(...moves.map((m) => ({ updater: updater.id, ...m })));
  }
  if (planned.length === 0) {
    receipt.verdict = "current";
    receipt.finishedAt = new Date().toISOString();
    writeReceipt(receiptPath, receipt);
    log("\nEverything is on its latest release. Nothing to prove.");
    return receipt;
  }
  writeReceipt(receiptPath, receipt);
  for (const m of receipt.moves) log(`  ${formatMove(m)}`);

  const smoke: UpdaterSmoke[] = [];
  for (const { updater, moves } of planned)
    smoke.push(...(await updater.smoke(root, moves)));
  const dup = smoke.find(
    (s, i) => smoke.findIndex((t) => t.name === s.name) !== i,
  );
  if (dup !== undefined) {
    // A smoke test's name is its identity, before and after the move.
    throw new Error(`Two smoke tests are named "${dup.name}".`);
  }

  log("\n── Baseline: current releases ──");
  receipt.baseline = await gates.all(smoke);
  writeReceipt(receiptPath, receipt);

  const files: string[] = [];
  for (const { updater } of planned) files.push(...(await updater.files(root)));
  const saved = snapshot(root, [...new Set(files)]);
  try {
    log("\n── Moving ──");
    for (const { updater, moves } of planned)
      await updater.apply(root, moves, log);

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
      `\n${[...saved.keys()].join(", ")} put back. Find the input responsible ` +
        (planned.length > 1
          ? "by running one updater at a time, then `--only <name>`."
          : "with `--only <name>`, one at a time."),
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
