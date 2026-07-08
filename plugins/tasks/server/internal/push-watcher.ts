import { z } from "zod";
import {
  listAttempts,
  insertPush,
  getConversation,
  listPushShasIn,
} from "@plugins/tasks/plugins/tasks-core/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { defineWarmup } from "@plugins/infra/plugins/warmup/server";
import { GIT } from "@plugins/infra/plugins/paths/server";

const FORMAT =
  "%H%x00%cI%x00" +
  "%(trailers:key=Singularity-Conversation,valueonly,separator=%x00)%x00" +
  "%(trailers:key=Singularity-Push,valueonly,separator=%x00)%x00" +
  "%s%x00";

interface ParsedCommit {
  sha: string;
  committedAt: Date;
  conversationId: string;
  pushId: string;
  subject: string;
}

async function runGit(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn([GIT, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(" ")} failed: ${err.trim()}`);
  }
  return text;
}

// Trailer-only commits get rejected: the pushes table joins through the
// conversation/attempt graph, and a commit lacking either trailer (e.g. a
// `--from-main` push) can't be attributed. The git-watcher event still fires
// for those commits — auto-build runs regardless of trailers.
function parseLog(raw: string): ParsedCommit[] {
  const records = raw.split("\0\n").filter((r) => r.length > 0);
  const out: ParsedCommit[] = [];
  for (const record of records) {
    const fields = record.split("\0");
    if (fields.length < 5) continue;
    const [sha, cIso, convRaw, pushRaw, subject] = fields;
    if (!sha || !cIso) continue;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    const conversationId = (convRaw ?? "").trim();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    const pushId = (pushRaw ?? "").trim();
    if (!conversationId || !pushId) continue;
    out.push({
      sha,
      committedAt: new Date(cIso),
      conversationId,
      pushId,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      subject: subject ?? "",
    });
  }
  return out;
}

async function readCommitsInRange(
  range: string,
  cwd: string,
): Promise<ParsedCommit[]> {
  const raw = await runGit(
    ["log", "--no-color", `--format=${FORMAT}`, range],
    cwd,
  );
  return parseLog(raw);
}

async function readAllMainCommits(cwd: string): Promise<ParsedCommit[]> {
  const raw = await runGit(
    ["log", "--no-color", `--format=${FORMAT}`, "refs/heads/main"],
    cwd,
  );
  return parseLog(raw);
}

async function recordCommits(commits: ParsedCommit[]): Promise<boolean> {
  if (commits.length === 0) return false;
  const existing = await listAttempts();
  const localAttemptIds = new Set(existing.map((a) => a.id));
  let inserted = false;
  for (const commit of [...commits].reverse()) {
    const conv = await getConversation(commit.conversationId);
    if (!conv) continue;
    if (!localAttemptIds.has(conv.attemptId)) continue;
    const didInsert = await insertPush({
      id: `${commit.pushId}:${commit.sha}`,
      attemptId: conv.attemptId,
      conversationId: commit.conversationId,
      sha: commit.sha,
      pushId: commit.pushId,
      message: commit.subject,
      createdAt: commit.committedAt,
    });
    if (didInsert) inserted = true;
  }
  return inserted;
}

// Filter to commits not already in the DB before re-running per-commit
// conversation/attempt resolution. One indexed SELECT keeps the heal scan
// cheap in the steady state — bounded by the trigger event's previousSha
// window.
async function recordMissing(commits: ParsedCommit[]): Promise<boolean> {
  if (commits.length === 0) return false;
  const have = await listPushShasIn(commits.map((c) => c.sha));
  const missing = commits.filter((c) => !have.has(c.sha));
  return recordCommits(missing);
}

// One-shot reconcile run at server boot. Walks the entire local-main history
// and records anything missing from the DB. Cheap on a fresh worktree DB
// (forked from main has most pushes already).
export async function runInitialReconcile(): Promise<void> {
  let cwd: string;
  try {
    cwd = await ensureMainWorktreeRoot();
  } catch (err) {
    console.error("[tasks.push-watcher] cannot resolve main worktree", err);
    return;
  }
  try {
    const commits = await readAllMainCommits(cwd);
    await recordMissing(commits);
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch (err) {
    console.error("[tasks.push-watcher] initial reconcile failed", err);
  }
}

// Host-scoped boot warm-up: the one-shot catch-up runs ONLY on the main backend
// (the every-worktree full-history walk was pure redundancy — worktree DBs are
// forked from main and already hold the rows), deferred past serving-ready and
// throttled by the warmup executor instead of competing with first requests on
// onReady. Steady-state ingestion continues to flow through the git.refAdvanced
// trigger; this warm-up only heals commits that landed while the server was down.
export const pushReconcileWarmup = defineWarmup({
  name: "tasks.push-reconcile",
  scope: "host",
  run: () => runInitialReconcile(),
});

// Trigger handler bound to git.refAdvanced. Walks the commit range
// (previousSha..sha] and ingests any trailer-bearing commits.
export const pushIngestJob = defineJob({
  name: "tasks.push-ingest",
  input: z.object({}),
  dedup: "none",
  event: z.object({
    refName: z.string(),
    sha: z.string(),
    previousSha: z.string().nullable(),
  }),
  run: async ({ event }) => {
    if (!event) return;
    if (event.refName !== "refs/heads/main") return;
    let cwd: string;
    try {
      cwd = await ensureMainWorktreeRoot();
    } catch (err) {
      console.error("[tasks.push-ingest] cannot resolve main worktree", err);
      return;
    }
    try {
      // No previousSha (first emit after fresh boot) → fall back to the full
      // history. recordMissing dedups against the DB so re-running the
      // reconcile is idempotent.
      const commits = event.previousSha
        ? await readCommitsInRange(`${event.previousSha}..${event.sha}`, cwd)
        : await readAllMainCommits(cwd);
      await recordMissing(commits);
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch (err) {
      console.error("[tasks.push-ingest] ingest failed", err);
    }
  },
});
