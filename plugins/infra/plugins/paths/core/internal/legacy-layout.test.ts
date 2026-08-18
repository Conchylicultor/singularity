import { expect, test } from "bun:test";
import { getDataDirs } from "./data-dir";
import { REPO_ROOT } from "./paths";
import {
  LEGACY_LAYOUT,
  legacyRootEntries,
  mustPrecede,
  planMigration,
  planningOrder,
  rowRootNames,
  simulateSteps,
  stagingName,
} from "./legacy-layout";
import type { FsEntry, MigrationStep } from "./legacy-layout";

// ── the table itself ─────────────────────────────────────────────────────────

test("every root name the table accounts for is unique", () => {
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const row of LEGACY_LAYOUT) {
    for (const name of rowRootNames(row)) {
      const owner = seen.get(name);
      if (owner !== undefined)
        dupes.push(`${name} (rows "${owner}" and "${row.from}")`);
      else seen.set(name, row.from);
    }
  }
  expect(dupes).toEqual([]);
});

test("every `to` names a <kind>/<name> that a declaration produces", async () => {
  // Evaluate every owner's `data-dirs/index.ts` — the `defineDataDir` calls in
  // them are what populate the registry.
  //
  // Discovered by globbing the tree rather than read off
  // `core/data-dirs.generated.ts`, deliberately: that file only regenerates on
  // `./singularity build`, so a test keyed on it would go red for a declaration
  // that IS written and correct, purely because codegen hasn't run. The claim
  // here is about the declarations, so it reads the declarations.
  const glob = new Bun.Glob("plugins/**/data-dirs/index.ts");
  for (const rel of glob.scanSync(REPO_ROOT)) {
    await import(`${REPO_ROOT}/${rel}`);
  }
  const declared = new Set(getDataDirs().keys());

  const undeclared = LEGACY_LAYOUT.filter(
    (row) => row.move !== "quarantine" && !declared.has(row.to),
  ).map((row) => `${row.from} → ${row.move === "quarantine" ? "" : row.to}`);

  expect(undeclared).toEqual([]);
});

test("a quarantine row has no destination declaration, and every other row does", () => {
  for (const entry of legacyRootEntries()) {
    if (entry.move === "quarantine")
      expect(entry.destination).toBe(`deprecated/${entry.name}`);
    else expect(entry.destination).not.toBeNull();
  }
});

// ── a tiny in-memory filesystem, so idempotency is asserted against the state
//    a plan actually produces rather than one hand-written twice. `simulateSteps`
//    is the SHARED model the script's dry run predicts with ────────────────────

function fs(...entries: FsEntry[]): FsEntry[] {
  return entries;
}
/** A directory whose children are all plain FILES (the ordinary fixture). */
const dir = (path: string, ...children: string[]): FsEntry => ({
  path,
  node: "dir",
  children: children.map((name) => ({ name, file: true })),
});
/** A directory the caller did NOT enumerate — `children` absent, not empty. */
const opaqueDir = (path: string): FsEntry => ({ path, node: "dir" });
const file = (path: string): FsEntry => ({ path, node: "file" });
const link = (path: string, target: string): FsEntry => ({
  path,
  node: "symlink",
  target,
});

function stepsFor(
  steps: readonly MigrationStep[],
  row: string,
): MigrationStep[] {
  return steps.filter((s) => s.row === row);
}

// ── behaviour 1: `logs/` nests into itself ───────────────────────────────────

test("the logs row performs the three-step staging dance and plants no shim", () => {
  const before = fs(dir("logs", "gateway.log", "singularity"));
  const steps = stepsFor(planMigration(before, "apply"), "logs");

  expect(steps).toEqual([
    { action: "rename", row: "logs", from: "logs", to: stagingName("logs") },
    { action: "mkdir", row: "logs", path: "logs" },
    {
      action: "rename",
      row: "logs",
      from: stagingName("logs"),
      to: "logs/gateway",
    },
  ]);
  // `logs` is a kind name: a symlink there would replace the kind directory.
  expect(steps.some((s) => s.action === "symlink")).toBe(false);
});

test("the logs dance resumes from a staging directory left by an interrupted run", () => {
  const mid = fs(dir(stagingName("logs"), "gateway.log"));
  const steps = stepsFor(planMigration(mid, "apply"), "logs");

  expect(steps).toEqual([
    { action: "mkdir", row: "logs", path: "logs" },
    {
      action: "rename",
      row: "logs",
      from: stagingName("logs"),
      to: "logs/gateway",
    },
  ]);
});

test("the logs row is done once logs/gateway exists", () => {
  const after = fs(dir("logs", "gateway"), dir("logs/gateway", "gateway.log"));
  expect(stepsFor(planMigration(after, "apply"), "logs")).toEqual([]);
});

test("the logs dance STOPS on ANY child of logs/ that is not a plain file", () => {
  // The live root's shape. `op-log/` and `check-progress/` are new-code sinks;
  // `fd-monitor-incidents/` is a launchd script's, has NO legacy row, and would
  // be on no list derived from the table — the invariant catches it anyway,
  // because every legitimate child of the legacy logs/ is a plain file.
  const before = fs({
    path: "logs",
    node: "dir",
    children: [
      { name: "att-1778489784.log", file: true },
      { name: "gateway.log", file: true },
      { name: "op-log", file: false },
      { name: "check-progress", file: false },
      { name: "fd-monitor-incidents", file: false },
    ],
  });
  const steps = stepsFor(planMigration(before, "apply"), "logs");

  expect(steps.map((s) => s.action)).toEqual(["blocked", "blocked", "blocked"]);
  expect(steps.map((s) => (s.action === "blocked" ? s.path : ""))).toEqual([
    "logs/op-log",
    "logs/check-progress",
    "logs/fd-monitor-incidents",
  ]);
  for (const step of steps)
    expect(step).toMatchObject({ remedy: "discard-destination" });
  // And nothing else — no rename was planned alongside the refusal.
  expect(steps.some((s) => s.action === "rename")).toBe(false);
});

test("a logs/ of nothing but plain files (rotations included) dances cleanly", () => {
  const before = fs(dir("logs", "gateway.log", "att-1.log", "att-1.log.1"));
  const steps = stepsFor(planMigration(before, "apply"), "logs");
  expect(steps.map((s) => s.action)).toEqual(["rename", "mkdir", "rename"]);
});

// ── behaviour 2: a non-empty destination stops the run ───────────────────────

test("a destination that already holds content stops the run, keeping neither side", () => {
  const before = fs(
    dir("config", "singularity", "main-worktree"),
    dir("state/config", "singularity"),
  );
  const steps = stepsFor(planMigration(before, "apply"), "config");

  expect(steps).toHaveLength(1);
  expect(steps[0]).toMatchObject({
    action: "blocked",
    path: "state/config",
    remedy: "discard-destination",
  });
  // No rename, no shim, no partial move: the whole row does nothing.
  expect(steps.some((s) => s.action !== "blocked")).toBe(false);
});

test("an EMPTY destination is removed and the rename takes its place", () => {
  const before = fs(dir("config", "singularity"), dir("state/config"));
  expect(stepsFor(planMigration(before, "apply"), "config")).toEqual([
    {
      action: "unlink",
      row: "config",
      path: "state/config",
      reason:
        "the empty destination new code created, so the rename can take its place",
    },
    { action: "rename", row: "config", from: "config", to: "state/config" },
    { action: "symlink", row: "config", at: "config", target: "state/config" },
  ]);
});

test("an un-enumerated destination is treated as non-empty, never as empty", () => {
  // `children` absent means "not enumerated". Reading that as empty would rmdir
  // a directory nobody looked inside.
  const before = fs(dir("config", "singularity"), opaqueDir("state/config"));
  const steps = stepsFor(planMigration(before, "apply"), "config");
  expect(steps).toHaveLength(1);
  expect(steps[0]?.action).toBe("blocked");
});

test("an absent destination is a plain rename plus the shim", () => {
  const before = fs(dir("reports", "singularity.jsonl"));
  expect(stepsFor(planMigration(before, "apply"), "reports")).toEqual([
    { action: "rename", row: "reports", from: "reports", to: "state/reports" },
    {
      action: "symlink",
      row: "reports",
      at: "reports",
      target: "state/reports",
    },
  ]);
});

test("a rotating log whose destination file exists stops the run rather than stranding history", () => {
  // The live case: new code wrote a few KB at logs/op-log/op-log.jsonl while
  // 7.8 MB of history was still at the root. Keeping the destination would have
  // left the history unshimmed at the root, for --drop-legacy to sweep as a stray.
  const before = fs(file("op-log.jsonl"), dir("logs/op-log", "op-log.jsonl"));
  const steps = stepsFor(planMigration(before, "apply"), "op-log.jsonl");

  expect(steps).toEqual([
    {
      action: "blocked",
      row: "op-log.jsonl",
      path: "logs/op-log/op-log.jsonl",
      reason: expect.stringContaining("no correct automatic merge"),
      remedy: "discard-destination",
    },
  ]);
});

test("a lock-slot directory never half-moves — the shim is all-or-nothing", () => {
  // The quiet one: a merge that left cpu-slots non-empty would have suppressed
  // its shim, so old code flocks cpu-slots/* and new code flocks locks/cpu/*.
  // Two disjoint namespaces, and the host CPU bound silently doubles.
  const before = fs(
    dir("cpu-slots", "slot-0.lock", "slot-1.lock"),
    dir("locks/cpu", "slot-0.lock"),
  );
  const steps = stepsFor(planMigration(before, "apply"), "cpu-slots");
  expect(steps).toHaveLength(1);
  expect(steps[0]?.action).toBe("blocked");
  expect(steps.some((s) => s.action === "symlink")).toBe(false);
});

// ── behaviour 3: transient rows are never shimmed and never moved ────────────

test("a transient file present at the root produces no apply step at all", () => {
  const before = fs(file("duress.latch"), file("push-holder.json"));
  const steps = planMigration(before, "apply");

  expect(stepsFor(steps, "duress.latch")).toEqual([]);
  expect(stepsFor(steps, "push-holder.json")).toEqual([]);
});

test("an absent transient file is nothing to do, never an error", () => {
  expect(planMigration(fs(), "apply")).toEqual([]);
  expect(planMigration(fs(), "drop-legacy")).toEqual([]);
});

test("drop-legacy sweeps a stale transient file left by pre-move code", () => {
  const steps = stepsFor(
    planMigration(fs(file("duress.latch")), "drop-legacy"),
    "duress.latch",
  );
  expect(steps).toEqual([
    {
      action: "unlink",
      row: "duress.latch",
      path: "duress.latch",
      reason:
        "stale transient file left by pre-move code; the live one is locks/duress/duress.latch",
    },
  ]);
});

// ── behaviour 4: idempotent, both ways ───────────────────────────────────────

test("re-planning against the state an apply produced yields zero steps", () => {
  const before = fs(
    dir("config", "singularity"),
    dir("reports", "singularity.jsonl"),
    dir("logs", "gateway.log"),
    dir("prototypes", "tasks-v2"),
    dir("push-slots", "slot-0.lock"),
    file("op-log.jsonl"),
    file("op-log.jsonl.1"),
    file("database.json"),
    file("push.lock"),
    dir("forensics"),
  );

  const first = planMigration(before, "apply");
  expect(first.length).toBeGreaterThan(0);
  expect(first.some((s) => s.action === "blocked")).toBe(false);

  const after = simulateSteps(before, first);
  expect(planMigration(after, "apply")).toEqual([]);
});

test("a shim planted by apply is exactly what the check expects to find", () => {
  const before = fs(
    dir("cost-usage", "index.json"),
    file("central-routes.json"),
  );
  const after = simulateSteps(before, planMigration(before, "apply"));
  const byPath = new Map(after.map((e) => [e.path, e]));

  for (const entry of legacyRootEntries()) {
    if (entry.expect.kind !== "symlink") continue;
    const node = byPath.get(entry.name);
    if (!node) continue; // this fixture does not carry that row
    expect(node).toEqual(link(entry.name, entry.expect.target));
  }
});

test("drop-legacy removes the shims an apply planted, then is itself a no-op", () => {
  const before = fs(
    dir("cost-usage", "index.json"),
    file("central-routes.json"),
  );
  const applied = simulateSteps(before, planMigration(before, "apply"));

  const drop = planMigration(applied, "drop-legacy");
  expect(drop).toEqual([
    {
      action: "unlink",
      row: "cost-usage",
      path: "cost-usage",
      reason: "compatibility shim → state/cost-usage",
    },
    {
      action: "unlink",
      row: "central-routes.json",
      path: "central-routes.json",
      reason: "compatibility shim → state/gateway/central-routes.json",
    },
  ]);

  const dropped = simulateSteps(applied, drop);
  expect(planMigration(dropped, "drop-legacy")).toEqual([]);
  // And pass 1 is done for those rows too — `from` absent ⇒ nothing to move.
  expect(planMigration(dropped, "apply")).toEqual([]);
});

// ── drop-legacy refuses what it cannot safely delete ─────────────────────────

test("drop-legacy blocks on a legacy name that is a real directory", () => {
  const steps = stepsFor(
    planMigration(fs(dir("releases", "run-1")), "drop-legacy"),
    "releases",
  );
  expect(steps).toHaveLength(1);
  expect(steps[0]).toMatchObject({
    action: "blocked",
    path: "releases",
    remedy: "inspect",
  });
});

test("drop-legacy never touches the logs kind directory", () => {
  const after = fs(
    dir("logs", "gateway", "op-log"),
    dir("logs/gateway", "gateway.log"),
  );
  expect(stepsFor(planMigration(after, "drop-legacy"), "logs")).toEqual([]);
});

test("drop-legacy sweeps a rotated log that landed at the root and a dangling link", () => {
  const state = fs(
    file("op-log.jsonl.1"), // pre-move code rotated the live file
    link("op-log.jsonl", "logs/op-log/op-log.jsonl"),
  );
  const steps = stepsFor(planMigration(state, "drop-legacy"), "op-log.jsonl");
  expect(steps.map((s) => s.action)).toEqual(["unlink", "unlink"]);
  expect(steps).toContainEqual({
    action: "unlink",
    row: "op-log.jsonl",
    path: "op-log.jsonl",
    reason: "compatibility shim → logs/op-log/op-log.jsonl",
  });
});

// ── rotating log families move together ──────────────────────────────────────

test("a rotating family moves every sibling into one directory, each shimmed", () => {
  const before = fs(
    file("op-log.jsonl"),
    file("op-log.jsonl.1"),
    file("op-log.jsonl.3"), // .2 absent: a gap is not an error
  );
  const steps = stepsFor(planMigration(before, "apply"), "op-log.jsonl");

  expect(steps[0]).toEqual({
    action: "mkdir",
    row: "op-log.jsonl",
    path: "logs/op-log",
  });
  const renames = steps.filter((s) => s.action === "rename");
  expect(renames).toEqual([
    {
      action: "rename",
      row: "op-log.jsonl",
      from: "op-log.jsonl",
      to: "logs/op-log/op-log.jsonl",
    },
    {
      action: "rename",
      row: "op-log.jsonl",
      from: "op-log.jsonl.1",
      to: "logs/op-log/op-log.jsonl.1",
    },
    {
      action: "rename",
      row: "op-log.jsonl",
      from: "op-log.jsonl.3",
      to: "logs/op-log/op-log.jsonl.3",
    },
  ]);
  expect(steps.filter((s) => s.action === "symlink")).toHaveLength(3);
});

// ── quarantine ───────────────────────────────────────────────────────────────

test("an orphan moves into deprecated/ with its reason, and only once", () => {
  const before = fs(dir("forensics"));
  const steps = stepsFor(planMigration(before, "apply"), "forensics");
  expect(steps).toHaveLength(1);
  expect(steps[0]).toMatchObject({
    action: "quarantine",
    from: "forensics",
    to: "deprecated/forensics",
  });

  expect(planMigration(simulateSteps(before, steps), "apply")).toEqual([]);
});

test("a quarantine that would overwrite an earlier one is blocked", () => {
  const before = fs(file("push.lock"), file("deprecated/push.lock"));
  const steps = stepsFor(planMigration(before, "apply"), "push.lock");
  expect(steps).toHaveLength(1);
  expect(steps[0]).toMatchObject({ action: "blocked", remedy: "inspect" });
});

test("a quarantined name that came back is reported by drop-legacy, not deleted", () => {
  const steps = stepsFor(
    planMigration(fs(file("push.lock")), "drop-legacy"),
    "push.lock",
  );
  expect(steps).toHaveLength(1);
  expect(steps[0]).toMatchObject({ action: "blocked", remedy: "inspect" });
});

// ── pass 2 has a precondition: pass 1 must have run ─────────────────────────

test("drop-legacy on an un-migrated root refuses, and plans NO removals at all", () => {
  // The dangerous case. `check-progress.jsonl` here is the ORIGINAL 868 KB file,
  // not a stray left by a rotation across a shim — there is no shim. Classifying
  // it as a stray planned a real unlink of the only copy.
  const root = fs(
    file("check-progress.jsonl"),
    file("op-log.jsonl"),
    dir("config", "singularity"),
    dir("backups", "dump.sql"),
  );
  const steps = planMigration(root, "drop-legacy");

  expect(steps.every((s) => s.action === "blocked")).toBe(true);
  expect(steps.some((s) => s.action === "unlink")).toBe(false);
  const blockedPaths = steps.flatMap((s) =>
    s.action === "blocked" ? [s.path] : [],
  );
  expect(blockedPaths.sort()).toEqual([
    "check-progress.jsonl",
    "config",
    "op-log.jsonl",
  ]);
  for (const step of steps)
    expect(step).toMatchObject({
      reason: expect.stringContaining("Pass 1 has not run"),
    });
});

test("the un-migrated refusal replaces the per-row pass, so nothing is misclassified", () => {
  // `backups` is a quarantine row. Pre-pass-1 the per-row pass called it "back at
  // the root — something recreated it", which is nonsense: it was never
  // quarantined. The precondition short-circuits before any row is judged.
  const steps = planMigration(
    fs(dir("backups", "dump.sql"), file("op-log.jsonl")),
    "drop-legacy",
  );
  expect(steps.some((s) => s.row === "backups")).toBe(false);
});

test("a rotation stray IS swept, but only when a shim exists to have rotated across", () => {
  const withShim = fs(
    link("op-log.jsonl", "logs/op-log/op-log.jsonl"),
    file("op-log.jsonl.1"), // pre-move code rotated the live file: the link moved
  );
  const steps = stepsFor(
    planMigration(withShim, "drop-legacy"),
    "op-log.jsonl",
  );
  expect(steps.map((s) => s.action)).toEqual(["unlink", "unlink"]);

  // Same file, no shim anywhere in the family ⇒ it is the original, not a stray.
  const noShim = fs(file("op-log.jsonl.1"));
  const blocked = planMigration(noShim, "drop-legacy");
  expect(blocked.every((s) => s.action === "blocked")).toBe(true);
});

test("a freshly-applied root sweeps no strays — every pass-2 removal is a shim", () => {
  // The combined dry run simulates pass 1 and then plans pass 2 on the result.
  // Nothing can have rotated across a shim planted seconds earlier, so every
  // removal must be a shim removal and none may be a stray sweep.
  const before = fs(
    dir("config", "singularity"),
    dir("push-slots", "slot-0.lock"),
    file("op-log.jsonl"),
    file("op-log.jsonl.1"),
    file("database.json"),
    dir("logs", "gateway.log"),
    dir("forensics"),
  );
  const applyPlan = planMigration(before, "apply");
  expect(applyPlan.some((s) => s.action === "blocked")).toBe(false);

  const dropPlan = planMigration(
    simulateSteps(before, applyPlan),
    "drop-legacy",
  );
  expect(dropPlan.some((s) => s.action === "blocked")).toBe(false);
  for (const step of dropPlan) {
    expect(step.action).toBe("unlink");
    if (step.action === "unlink")
      expect(step.reason).toStartWith("compatibility shim → ");
  }
  // And it really does remove them: every shimmed name is gone afterwards.
  const final = simulateSteps(simulateSteps(before, applyPlan), dropPlan);
  expect(planMigration(final, "drop-legacy")).toEqual([]);
  expect(planMigration(final, "apply")).toEqual([]);
});

test("simulateSteps refuses to execute a blocked plan", () => {
  const before = fs(dir("config", "a"), dir("state/config", "a"));
  const plan = planMigration(before, "apply");
  expect(() => simulateSteps(before, plan)).toThrow(
    /blocked plan is never executed/,
  );
});

// ── the table is an unordered set: the planner imposes the order ────────────

test("planningOrder satisfies every ordering constraint the rows imply", () => {
  const order = planningOrder();
  expect(order).toHaveLength(LEGACY_LAYOUT.length);
  expect(new Set(order).size).toBe(LEGACY_LAYOUT.length);

  const index = new Map(order.map((row, i) => [row, i]));
  const violations: string[] = [];
  for (const a of LEGACY_LAYOUT)
    for (const b of LEGACY_LAYOUT)
      if (mustPrecede(a, b) && index.get(a)! > index.get(b)!)
        violations.push(`${a.from} must precede ${b.from}`);
  expect(violations).toEqual([]);
});

test("the two real constraints are actually present, so the sort is not vacuous", () => {
  const order = planningOrder().map((r) => r.from);
  const at = (from: string): number => order.indexOf(from);

  // (1) the directory that becomes state/secrets, before the blob moving into it
  expect(at("secrets")).toBeLessThan(at("secrets.json.enc"));
  // (2) the row that frees `logs/`, before anything landing under it
  for (const name of [
    "op-log.jsonl",
    "signal-origin.jsonl",
    "build-progress.jsonl",
    "check-progress.jsonl",
  ])
    expect(at("logs")).toBeLessThan(at(name));
});

test("the ordering holds even if the table were written the other way round", () => {
  // The point of the sort: `LEGACY_LAYOUT` is a declaration table, so its
  // written order must not decide whether a run works. Planning a fixture that
  // exercises both constrained pairs must produce the dir/ancestor steps first
  // regardless of where those rows sit in the file.
  const before = fs(
    dir("secrets", ".key"),
    file("secrets.json.enc"),
    dir("logs", "gateway.log"),
    file("op-log.jsonl"),
  );
  const steps = planMigration(before, "apply");
  const firstIndexOf = (pred: (s: MigrationStep) => boolean): number =>
    steps.findIndex(pred);

  expect(
    firstIndexOf((s) => s.action === "rename" && s.to === "state/secrets"),
  ).toBeLessThan(
    firstIndexOf(
      (s) => s.action === "rename" && s.to === "state/secrets/secrets.json.enc",
    ),
  );
  expect(
    firstIndexOf((s) => s.action === "rename" && s.to === "logs/gateway"),
  ).toBeLessThan(
    firstIndexOf((s) => s.action === "mkdir" && s.path === "logs/op-log"),
  );

  // And the whole thing still round-trips.
  expect(planMigration(simulateSteps(before, steps), "apply")).toEqual([]);
});
