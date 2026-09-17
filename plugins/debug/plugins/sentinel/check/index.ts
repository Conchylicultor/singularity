import type { Check } from "@plugins/framework/plugins/tooling/core";
import { importClosure } from "@plugins/framework/plugins/tooling/plugins/import-closure/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

const WORKER_ENTRY =
  "plugins/debug/plugins/sentinel/server/internal/worker/entry.ts";

/**
 * Subtrees the sentinel worker's static closure may never reach. Each one runs
 * work at module load that needs a plugin runtime the worker thread does not
 * have: config_v2's server side reads the process namespace to find its config
 * dir, the jobs and database server barrels build the pool and job queue, and
 * server-core is the plugin runtime itself.
 */
const FORBIDDEN_PREFIXES = [
  "plugins/config_v2/server/",
  "plugins/infra/plugins/jobs/server/",
  "plugins/database/server/",
  "plugins/framework/plugins/server-core/",
];

/**
 * The sentinel worker (`server/internal/worker/entry.ts`) runs on its own Bun
 * thread so it keeps ticking — and keeps renewing the duress latch — while
 * main's event loop is wedged. A thread has no plugin runtime: nothing declares
 * its namespace, loads config, or opens the pool. So every module it loads must
 * be safe to evaluate bare.
 *
 * One convenience import broke that before: `worker/sample.ts` took two zod
 * schemas from health-monitor's SERVER barrel, which pulled in config_v2's
 * server side and the job queue (466 modules), and the worker died at load
 * reading a namespace nobody declared. This check makes the lean closure a
 * measured fact rather than a sentence in the CLAUDE.md.
 *
 * Measured with dynamic imports cut: the subject is what evaluates before the
 * worker's first statement. The failure prints the shortest import chain to the
 * first offending module under each forbidden prefix.
 */
const workerClosureLeanCheck: Check = {
  id: "sentinel:worker-closure-lean",
  description:
    "the sentinel worker's static import closure reaches no config_v2/server, jobs/server, database/server or server-core module — the worker thread has no plugin runtime to evaluate them in",
  async run() {
    const root = await getWorktreeRoot();
    const closure = await importClosure(root, WORKER_ENTRY, {
      dynamicImports: "cut",
    });

    const findings: string[] = [];
    for (const prefix of FORBIDDEN_PREFIXES) {
      const offenders = [...closure.modules].filter((m) =>
        m.startsWith(prefix),
      );
      if (offenders.length === 0) continue;
      const shortest = offenders
        .map((m) => closure.importChain(m))
        .reduce((a, b) => (b.length < a.length ? b : a));
      findings.push(
        `${prefix} — ${offenders.length} module(s), shortest chain:\n        ` +
          shortest.join("\n      → "),
      );
    }

    if (findings.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        `${WORKER_ENTRY} statically loads ${closure.modules.size} modules, including forbidden ones:\n    ` +
        findings.join("\n    "),
      hint:
        "Import what the worker needs from a leaf `core` barrel instead of a `server` barrel (move the " +
        "value into the owning plugin's core/ if it only lives in server/ or shared/). A server barrel " +
        "evaluates its plugin's whole server side, and the worker thread has no namespace, config or " +
        "pool for it to run against.",
    };
  },
};

export default [workerClosureLeanCheck];
