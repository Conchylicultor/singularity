import type { TranscriptRead } from "./types";

/**
 * Has the harness reported that a background task ended?
 *
 * A tool-level background run is tracked by the harness, and when it exits the
 * harness writes a notification into the transcript:
 *
 *   <task-notification>
 *   <task-id>bf3x85ny5</task-id>
 *   <tool-use-id>…</tool-use-id>
 *   <output-file>…/tasks/bf3x85ny5.output</output-file>
 *   <status>completed</status>
 *   …
 *
 * That notification is the ONLY authority on the question, and the transcript
 * is the only place it exists — the task directory holds just `<id>.output`,
 * which looks identical whether the writer is alive or long gone.
 *
 * Why it matters: the poll-loop guard denies a repeated look at a task's output
 * on the grounds that "you will be re-invoked when it finishes". Once the task
 * HAS finished that sentence is false, the wake-up already happened, and the
 * repeated looks are an agent mining a static result file — different `grep`,
 * different `sed`, different `jq` each time. Measured over 30 days of
 * transcripts, 20 of 36 denials were that case.
 *
 * Pure over the transcript text so it can be tested without a session, and so
 * `e2e/replay-transcripts.ts` can replay it over recorded ones.
 */
export type TaskReport =
  /** The harness announced this task ended, with the status it reported. */
  | { kind: "reported"; status: string }
  /** The transcript was readable and holds no notification for this task. */
  | { kind: "no-report" }
  /** No transcript to consult — the question was not answered either way. */
  | { kind: "unreadable"; why: string };

/**
 * Task ids are `[A-Za-z0-9]+`, but this one is interpolated into a regex, so it
 * is checked rather than trusted: the id reaches here parsed out of a watch
 * subject, which is derived from a command the agent wrote.
 */
const TASK_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The notification is one JSONL record, so its newlines arrive escaped as the
 * two characters `\n`. Matching across "anything but the closing tag" rather
 * than a specific separator keeps this independent of that encoding.
 */
function notificationPattern(taskId: string): RegExp {
  return new RegExp(
    `<task-id>${taskId}</task-id>(?:(?!</?task-notification>)[\\s\\S]){0,600}?<status>([a-z_-]+)</status>`,
  );
}

export function readTaskReport(
  transcript: TranscriptRead,
  taskId: string,
): TaskReport {
  if (transcript.kind === "unavailable")
    return { kind: "unreadable", why: transcript.why };
  if (!TASK_ID.test(taskId))
    return { kind: "unreadable", why: `not a task id: ${taskId}` };

  const match = notificationPattern(taskId).exec(transcript.text);
  return match
    ? { kind: "reported", status: match[1]! }
    : { kind: "no-report" };
}
