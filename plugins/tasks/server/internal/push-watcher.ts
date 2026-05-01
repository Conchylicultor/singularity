import {
  listAttempts,
  insertPush,
  getConversation,
  listPushShasIn,
} from "@plugins/tasks-core/server";
import { ensureMainWorktreeRoot } from "@server/worktree";

import { GIT } from "@plugins/infra/plugins/paths/server";
const TICK_MS = 1000;
// Periodic self-heal scan: a bounded recent window reconciled against
// the DB. Catches commits the delta path missed, e.g. a process restart
// during a `./singularity push` merge where `lastSha` got seeded just
// before main advanced.
const HEAL_LIMIT = 200;
const HEAL_INTERVAL_MS = 60_000;

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

function parseLog(raw: string): ParsedCommit[] {
  const records = raw.split("\0\n").filter((r) => r.length > 0);
  const out: ParsedCommit[] = [];
  for (const record of records) {
    const fields = record.split("\0");
    if (fields.length < 5) continue;
    const [sha, cIso, convRaw, pushRaw, subject] = fields;
    if (!sha || !cIso) continue;
    const conversationId = (convRaw ?? "").trim();
    const pushId = (pushRaw ?? "").trim();
    if (!conversationId || !pushId) continue;
    out.push({
      sha,
      committedAt: new Date(cIso),
      conversationId,
      pushId,
      subject: subject ?? "",
    });
  }
  return out;
}

async function resolveMainSha(cwd: string): Promise<string> {
  const text = await runGit(["rev-parse", "refs/heads/main"], cwd);
  return text.trim();
}

async function readCommits(
  range: string | null,
  cwd: string,
): Promise<ParsedCommit[]> {
  const args = ["log", "--no-color", `--format=${FORMAT}`];
  args.push(range ?? "main");
  const raw = await runGit(args, cwd);
  return parseLog(raw);
}

async function readRecentCommits(
  cwd: string,
  limit: number,
): Promise<ParsedCommit[]> {
  const raw = await runGit(
    ["log", "--no-color", "-n", String(limit), `--format=${FORMAT}`, "main"],
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
// conversation/attempt resolution. One indexed SELECT keeps the heal
// scan cheap in the steady state.
async function recordMissing(commits: ParsedCommit[]): Promise<boolean> {
  if (commits.length === 0) return false;
  const have = await listPushShasIn(commits.map((c) => c.sha));
  const missing = commits.filter((c) => !have.has(c.sha));
  return recordCommits(missing);
}

let lastSha: string | null = null;
let lastHealAt = 0;

async function tick(cwd: string): Promise<void> {
  let head: string;
  try {
    head = await resolveMainSha(cwd);
  } catch (err) {
    console.error("[tasks.push-watcher] rev-parse failed", err);
    return;
  }
  const headChanged = head !== lastSha;
  const dueForHeal = Date.now() - lastHealAt >= HEAL_INTERVAL_MS;
  if (!headChanged && !dueForHeal) return;
  try {
    if (dueForHeal) {
      const commits = await readRecentCommits(cwd, HEAL_LIMIT);
      await recordMissing(commits);
      lastHealAt = Date.now();
    } else {
      const range = lastSha ? `${lastSha}..${head}` : null;
      const commits = await readCommits(range, cwd);
      await recordCommits(commits);
    }
    lastSha = head;
  } catch (err) {
    console.error("[tasks.push-watcher] tick failed", err);
  }
}

export async function startPushWatcher(): Promise<void> {
  let cwd: string;
  try {
    cwd = await ensureMainWorktreeRoot();
  } catch (err) {
    console.error("[tasks.push-watcher] cannot resolve main worktree", err);
    return;
  }
  // Initial reconcile: full main history diffed against the DB. The
  // only unbounded scan; subsequent ticks use the bounded HEAL_LIMIT
  // window. One-time cost on a fresh DB; near-zero on a DB forked from
  // main where most pushes are already present.
  try {
    const commits = await readCommits(null, cwd);
    await recordMissing(commits);
    lastSha = await resolveMainSha(cwd);
    lastHealAt = Date.now();
  } catch (err) {
    console.error("[tasks.push-watcher] initial reconcile failed", err);
  }
  setInterval(() => {
    tick(cwd).catch((err) =>
      console.error("[tasks.push-watcher] tick threw", err),
    );
  }, TICK_MS);
}
