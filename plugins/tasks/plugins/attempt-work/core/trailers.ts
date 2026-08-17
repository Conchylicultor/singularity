/**
 * The READER half of the commit-trailer grammar: the two trailer key names, the
 * `git log --format=` fragment that emits them, and the parse of that output.
 *
 * One home instead of two copies. Both readers — the pushes ledger's ingest
 * (`tasks/server/internal/push-watcher.ts`) and the git-measured landed set
 * (`attempt-work/server/internal/measure.ts`) — ask git the same question, so the
 * format string and the parse that consumes it must move together.
 *
 * The WRITER half (`.githooks/prepare-commit-msg` and `cli/bin/commands/push.ts`)
 * keeps its own literals; the pre-push `conversation-trailer` check is what binds
 * writers to readers — it FAILS a push whose commits lack the conversation
 * trailer, so a trailer-bearing commit on `main` is an enforced invariant rather
 * than a convention.
 */

/** Written by `.githooks/prepare-commit-msg` from `SINGULARITY_CONVERSATION_ID`. */
export const CONVERSATION_TRAILER_KEY = "Singularity-Conversation";
/** Stamped per `./singularity push` invocation by the rebase `--exec`. */
export const PUSH_TRAILER_KEY = "Singularity-Push";

/**
 * `git log --format=` fragment: NUL-separated fields, each record terminated by
 * a NUL so `parseTrailerLog` can split records on `\0\n`.
 */
export const TRAILER_LOG_FORMAT =
  "%H%x00%cI%x00" +
  `%(trailers:key=${CONVERSATION_TRAILER_KEY},valueonly,separator=%x00)%x00` +
  `%(trailers:key=${PUSH_TRAILER_KEY},valueonly,separator=%x00)%x00` +
  "%s%x00";

/** One commit that carries BOTH trailers, as emitted by {@link TRAILER_LOG_FORMAT}. */
export interface TrailerCommit {
  sha: string;
  committedAt: Date;
  conversationId: string;
  pushId: string;
  subject: string;
}

// Trailer-only commits get rejected: the pushes table joins through the
// conversation/attempt graph, and a commit lacking either trailer (e.g. a
// `--from-main` push) can't be attributed. The git-watcher event still fires
// for those commits — auto-build runs regardless of trailers.
export function parseTrailerLog(raw: string): TrailerCommit[] {
  const records = raw.split("\0\n").filter((r) => r.length > 0);
  const out: TrailerCommit[] = [];
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
