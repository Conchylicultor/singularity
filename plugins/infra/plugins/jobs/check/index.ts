import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// The one file allowed to insert a `jobs.run` row. Everything else goes through
// `job.enqueue(...)`, which routes here.
const REGISTRY = "plugins/infra/plugins/jobs/server/internal/registry.ts";

// The class table — the one file that may SPELL a graphile task identifier.
const HOLD = "plugins/infra/plugins/jobs/core/hold.ts";

// This check's own source names every banned token, in code, to describe them.
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

// The second half of the check: who may SPELL the legacy task identifier.
// `core/hold.ts` declares it (`LEGACY_JOB_TASK`); everyone else imports that.
const TASK_LITERAL_ALLOWED = [HOLD, SELF];

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
//
// ── The same argument, one field later: the task identifier ────────────────
//
// A row's graphile task identifier is now the other half of that same "property
// of the registered job, never a caller argument" rule. Since hold classes
// landed there is one task per class (`jobs.run.instant` / `.seconds` /
// `.minutes`), derived by `taskFor(job.hold)`, and each is served by a different
// subset of the three runners — that partition at FETCH is the whole reservation
// mechanism. `"jobs.run"` is the pre-class legacy identifier, kept registered on
// the widest runner forever so no row can strand on a task nobody serves.
//
// So a hand-typed `"jobs.run"` anywhere else is a row that silently lands in the
// widest tier and escapes its class's reservation — no type error, no runtime
// error, and no symptom beyond latency nobody attributes to it. The literal is
// therefore confined to `core/hold.ts`, which declares it as `LEGACY_JOB_TASK`;
// everything else imports that name and gets a tsc error when it is wrong.
const check: Check = {
  id: "jobs:no-raw-addjob",
  description:
    "Only jobs/registry.ts may insert graphile rows (`utils.addJob` / `graphile_worker.add_job`), so every enqueue carries the job's serialization queue and its hold class's task identifier — which only `core/hold.ts` may spell",
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

    // The third token is a bare string literal, so strings must stay visible
    // (as for the SQL call) and the quotes are part of the pattern — that is
    // what keeps `"jobs.run.instant"` and friends, which are the CLASS tasks
    // `hold.ts` composes, from matching. Comments are masked either way, so the
    // paragraphs above naming it do not trip their own check.
    const taskLiteralMatches = await grepCode({
      root,
      pattern: /["'`]jobs\.run["'`]/,
      grepArg: "jobs.run",
      fixed: true,
      maskStrings: false,
      pathspecs: ["*.ts"],
    });

    const insertOffenders = [...jsMatches, ...sqlMatches]
      .filter((m) => !ALLOWED.includes(m.path))
      .map((m) => `${m.path}:${m.line}:${m.text.trim()}`)
      .sort();

    const taskOffenders = taskLiteralMatches
      .filter((m) => !TASK_LITERAL_ALLOWED.includes(m.path))
      .map((m) => `${m.path}:${m.line}:${m.text.trim()}`)
      .sort();

    if (insertOffenders.length === 0 && taskOffenders.length === 0)
      return { ok: true };

    const messages: string[] = [];
    const hints: string[] = [];
    if (insertOffenders.length > 0) {
      messages.push(
        `${insertOffenders.length} graphile job insertion(s) outside ${REGISTRY}:\n    ${insertOffenders.join("\n    ")}`,
      );
      hints.push(
        `Enqueue through the registered job — \`job.enqueue(input, opts)\` — or, inside the jobs plugin, build the spec with \`graphileSpecFor(job, …)\` from ${REGISTRY}. A hand-written addJob omits the job's \`serial\` queue name, so that one path escapes serialization silently.`,
      );
    }
    if (taskOffenders.length > 0) {
      messages.push(
        `${taskOffenders.length} hand-typed \`jobs.run\` task identifier(s) outside ${HOLD}:\n    ${taskOffenders.join("\n    ")}`,
      );
      hints.push(
        `Import \`LEGACY_JOB_TASK\` from the jobs barrel instead. A row's task identifier is a property of the registered job — \`taskFor(job.hold)\` — and each class's task is served by a different set of runners; a hand-typed \`jobs.run\` lands the row in the widest tier, escaping its class's reserved slots with no type error and no symptom.`,
      );
    }

    return {
      ok: false,
      message: messages.join("\n\n  "),
      hint: hints.join("\n\n"),
    };
  },
};

export default check;
