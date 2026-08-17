import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// The one file allowed to insert a `jobs.run` row. Everything else goes through
// `job.enqueue(...)`, which routes here.
const REGISTRY = "plugins/infra/plugins/jobs/server/internal/registry.ts";

// This check's own source names both banned tokens, in code, to describe them.
const SELF = "plugins/infra/plugins/jobs/check/index.ts";

// The cron-dedup regression harness. It is not an enqueue path: it inserts a row
// under a literal job key an hour in the future, asserts graphile's upsert
// behaviour under the `job_key` / `job_key_mode` arguments the cron path passes,
// and removes the row before it returns — no plugin ever routes work through it.
// Driving `add_job` directly is the only way to make that assertion without a
// permanently-installed `* * * * *` schedule and a multi-minute wait; see the
// file's header for the trade-off it accepts. Listed here rather than left to
// slip through, so the exemption is enumerated like every other one.
const CRON_DEDUP_HARNESS =
  "plugins/infra/plugins/events-test/server/internal/cron-dedup.ts";

const ALLOWED = [REGISTRY, SELF, CRON_DEDUP_HARNESS];

// Why this exists rather than a comment saying "remember to pass the queue name".
//
// A job declaring `serial` (see registry.ts `SerialSpec`) is serialized by
// graphile's `queue_name`, and graphile refuses to FETCH a job whose queue is
// busy — that is what makes waiting free, and what stops one wedged job from
// costing more than one worker slot. But the guarantee is carried by the row: an
// insertion that omits the queue name produces a row with `job_queue_id IS NULL`,
// which graphile fetches regardless of who else is running. One forgetful call
// site silently un-serializes that path, with no type error, no runtime error,
// and no symptom until two of them run at once.
//
// So the queue name is derived from the registered job inside `registry.ts`
// (`queueNameFor` / `graphileSpecFor`) and is never a caller argument — and this
// check keeps that true by making the alternative unspellable: `utils.addJob(`
// and `graphile_worker.add_job` exist in exactly one file. There were five
// insertion sites when `serial` landed (two in `registry.ts`, `resume-job.ts`'s
// target re-enqueue, and `worker.ts`'s `scheduleResume` + cron items); the point
// of the check is that a sixth cannot be added without noticing.
const check: Check = {
  id: "jobs:no-raw-addjob",
  description:
    "Only jobs/registry.ts may insert graphile rows (`utils.addJob` / `graphile_worker.add_job`), so every enqueue carries the job's serialization queue",
  async run() {
    const root = await getWorktreeRoot();

    // Two greps because the tokens live in different lexical contexts.
    // `utils.addJob(` is code, so string literals are masked as well as comments
    // — a doc comment mentioning it must not fail the build. The SQL call
    // legitimately lives INSIDE a string (that is the only way to write it), so
    // strings must stay visible for it; comments are masked either way.
    const jsMatches = await grepCode({
      root,
      pattern: /\.addJob\(/,
      grepArg: ".addJob(",
      fixed: true,
      maskStrings: true,
      pathspecs: ["*.ts"],
    });
    const sqlMatches = await grepCode({
      root,
      pattern: /graphile_worker\.add_job/,
      grepArg: "graphile_worker.add_job",
      fixed: true,
      maskStrings: false,
      pathspecs: ["*.ts"],
    });

    const offenders = [...jsMatches, ...sqlMatches]
      .filter((m) => !ALLOWED.includes(m.path))
      .map((m) => `${m.path}:${m.line}:${m.text.trim()}`)
      .sort();

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `${offenders.length} graphile job insertion(s) outside ${REGISTRY}:\n    ${offenders.join("\n    ")}`,
      hint: `Enqueue through the registered job — \`job.enqueue(input, opts)\` — or, inside the jobs plugin, build the spec with \`graphileSpecFor(job, …)\` from ${REGISTRY}. A hand-written addJob omits the job's \`serial\` queue name, so that one path escapes serialization silently.`,
    };
  },
};

export default check;
