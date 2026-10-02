import type TS from "typescript";
import { isTestCodePath } from "@plugins/framework/plugins/plugin-id/core";
import { listCandidateSources } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import {
  findProducedWrites,
  findProducerDecls,
  resolveTableNames,
  type Source,
} from "./producer-writes";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  inputKeyed?: boolean;
  run(): Promise<CheckResult>;
};

// `typescript`'s module object is invariant for the process's lifetime, so a
// per-process memo is safe. Loaded lazily, so the check runner's "load every
// check" burst does not pay its eval cost.
let tsPromise: Promise<typeof TS> | undefined;
function loadTypescript(): Promise<typeof TS> {
  return (tsPromise ??= import("typescript").then((m) => m.default));
}

// Where a write that bypasses the producer is legitimate, each with its reason.
// Nothing here runs inside the serving backend on a live table:
//  - test code (`*.test.ts`, `__tests__/`, `<runtime>/testing/`): a DB fixture
//    seeds and clears rows of a throwaway database no live reader subscribes
//    to, and a suite defines its own fixture producers;
//  - the migration runner and its SQL: schema DDL and data migrations run in
//    the boot barrier, before any subscriber exists, and every client loads in
//    full after the deploy anyway.
function exempt(path: string): boolean {
  return (
    isTestCodePath(path.split("/")) ||
    path.startsWith("plugins/database/plugins/migrations/")
  );
}

const check: Check = {
  id: "change-feed:producer-writes",
  // INPUT-KEYED: a pure scan over tracked sources.
  inputKeyed: true,
  description:
    "Every write to a table with a change producer (`defineChangeProducer`) goes through the producer's `mutate` — the only write that reaches live readers, since a produced table has no trigger. Flags a drizzle insert / update / delete on the table's binding (under any alias) that is not the builder a producer's `mutate` callback returns, and a raw SQL write (insert / update / delete / truncate / merge) naming the table. Test fixtures and the migration runner are exempt. See research/2026-10-01-global-scoped-change-routing-p5-p8.md (A11).",
  async run() {
    const ts = await loadTypescript();
    const pathspecs = ["plugins/**/*.ts", "plugins/**/*.tsx"];
    const declSources = (
      await listCandidateSources({ grepArg: "defineChangeProducer", pathspecs })
    ).filter((s) => !exempt(s.rel));
    const decls = findProducerDecls(ts, declSources);
    if (decls.length === 0) return { ok: true };

    const bindings = new Set(decls.map((d) => d.binding));
    const alternation = (words: Iterable<string>): string =>
      `(${[...words].map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`;
    const bindingSources = await listCandidateSources({
      grepArg: alternation(bindings),
      pathspecs,
    });
    const tables = resolveTableNames(ts, bindingSources, bindings);
    const unresolved = decls.filter((d) => !tables.has(d.binding));
    if (unresolved.length > 0) {
      // A producer whose table this scan cannot name would make every check of
      // it vacuous: fail rather than pass on a scan that saw nothing.
      return {
        ok: false,
        message: `Cannot resolve the table of ${unresolved.length} change producer(s) — no \`const <binding> = …pgTable("<name>", …)\` found:\n    ${unresolved.map((d) => `${d.path}:${d.line}  table: ${d.binding}`).join("\n    ")}`,
        hint: "Pass `defineChangeProducer` the table's own binding (the identifier its `pgTable(…)` declaration is assigned to), not an alias or an expression.",
      };
    }

    const names = new Set([...tables.values()].flatMap((s) => [...s]));
    const writeSources: Source[] = (
      await listCandidateSources({
        grepArg: alternation([...bindings, ...names]),
        pathspecs,
      })
    ).filter((s) => !exempt(s.rel));
    const producers = new Set(
      decls.flatMap((d) => (d.producer === null ? [] : [d.producer])),
    );
    const writes = findProducedWrites(ts, writeSources, tables, producers);
    if (writes.length === 0) return { ok: true };
    return {
      ok: false,
      message: `${writes.length} write(s) to a produced table bypass its change producer — they reach no live reader:\n    ${writes
        .map((w) => `${w.path}:${w.line}  [${w.kind} → ${w.table}]  ${w.text}`)
        .join("\n    ")}`,
      hint: "Run the write through the table's producer: `producer.mutate(db, (q, t) => q.update(t).set(…).where(…), { latency })` — it returns the touched PKs and routes them. A raw SQL write has no producer form: express it as a drizzle builder inside `mutate`.",
    };
  },
};

export default check;
