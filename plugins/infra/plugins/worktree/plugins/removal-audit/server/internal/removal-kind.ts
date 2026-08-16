import { z } from "zod";
import { ReportKind } from "@plugins/reports/server";
import type { ReportRow } from "@plugins/reports/server";

/**
 * Payload of the `worktree-removed-externally` report.
 *
 * `candidateProcesses` is nullable on purpose and the null is meaningful: the
 * process probe returning "could not look" is a different fact from "looked,
 * found nothing", and collapsing them would quietly weaken the evidence.
 */
export const ExternalRemovalPayloadSchema = z.object({
  name: z.string(),
  path: z.string(),
  candidates: z
    .array(z.object({ pid: z.number(), ppid: z.number(), command: z.string() }))
    .nullable(),
  /** Why the probe produced no list, when it produced none. */
  probeError: z.string().nullable(),
});
export type ExternalRemovalPayload = z.infer<
  typeof ExternalRemovalPayloadSchema
>;

// Re-alert at most once per hour. A burst of external deletions (the 2026-08-09
// event removed 22 checkouts) must collapse onto one task rather than filing 22
// notifications, but a condition that keeps recurring has to resurface — this is
// data loss, not a warning.
const NOTIF_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * The `worktree-removed-externally` report kind.
 *
 * Dedup is per worktree name, so repeated observations of the same checkout
 * collapse onto one row whose `count` grows. Variant `error`, not `warning`: a
 * checkout deleted by something outside this app is uncommitted work made
 * unreachable, and the last time it happened the first anyone knew was a trust
 * prompt for `$HOME` a week later.
 */
export const externalRemovalKind = ReportKind({
  kind: "worktree-removed-externally",
  schema: ExternalRemovalPayloadSchema,
  fingerprint: (d: ExternalRemovalPayload) =>
    `worktree-removed-externally:${d.name}`,
  meta: {
    tag: "[worktree]",
    notif: "Worktree checkout deleted by something outside the app",
    variant: "error",
    notifCooldownMs: NOTIF_COOLDOWN_MS,
  },
  renderTask: (row: ReportRow) => {
    const d = ExternalRemovalPayloadSchema.parse(row.data);
    return {
      title: `[worktree] Checkout deleted externally: ${d.name}`,
      description: renderDescription(row, d),
    };
  },
});

function renderDescription(row: ReportRow, d: ExternalRemovalPayload): string {
  const lines: string[] = [];
  lines.push(
    `The worktree checkout \`${d.path}\` disappeared, and **no \`removeWorktree\` ` +
      `call in this backend accounts for it**. Every in-app removal announces ` +
      `itself on the \`worktree-removal\` channel before it runs, so the absence ` +
      `of a matching \`in-app\` line is positive evidence of an external actor — ` +
      `not an inference.`,
  );
  lines.push("");
  lines.push(
    `**Why this matters:** the branch \`claude-web/${d.name}\` normally survives, ` +
      `but the checkout does not. Any uncommitted work in it is gone, and a ` +
      `conversation resuming into the missing directory is the failure this ` +
      `report exists to make visible immediately rather than a week later.`,
  );
  lines.push("");
  lines.push(
    `**Recovery:** \`git worktree add ${d.path} claude-web/${d.name}\``,
  );
  lines.push("");
  if (d.candidates === null) {
    lines.push(
      `**Candidate processes:** the probe could not run${d.probeError ? ` (${d.probeError})` : ""}, ` +
        `so this is "could not look", not "found nothing".`,
    );
  } else if (d.candidates.length === 0) {
    lines.push(
      `**Candidate processes:** none. The probe ran and matched nothing — the ` +
        `deleter had already exited by the time the disappearance was observed.`,
    );
  } else {
    lines.push(`**Candidate processes** (alive at detection):`);
    for (const c of d.candidates) {
      lines.push(`- \`${c.pid}\` (parent \`${c.ppid}\`) — \`${c.command}\``);
    }
  }
  lines.push("");
  lines.push(`**Occurrences:** ${row.count}`);
  lines.push(`**Worktree:** ${row.worktree}`);
  lines.push(`**First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`**Last seen:** ${row.lastSeenAt.toISOString()}`);
  return lines.join("\n");
}
