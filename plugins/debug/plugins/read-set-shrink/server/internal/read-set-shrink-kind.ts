import { ReportKind } from "@plugins/reports/server";
import type { ReportRow } from "@plugins/reports/server";
import {
  ReadSetShrinkPayloadSchema,
  type ReadSetShrinkPayload,
} from "../../core";

// Re-alert the bell at most once per ~6h while a resource keeps shedding. A shed
// that recurs is a persistent condition (a conditional query that keeps failing to
// read a table on some FULL runs), so the cooldown re-surfaces it periodically
// without spamming — matching the live-state-noop / render-loop 6h re-arm.
const SHRINK_NOTIF_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// The `read-set-shrink` report kind. Dedups per distinct resource key
// (fingerprint `read-set-shrink:<resourceKey>`), so a resource that keeps shedding
// collapses to a single task whose `count` discriminates a one-time code-change
// shed (count 1) from a recurring conditional-query shed (count grows). Variant
// `warning`: the shed is safe if a code change removed the dependency, but risks a
// bounded cold-boot first-paint staleness if it's a conditional query — a human
// confirms which.
export const readSetShrinkKind = ReportKind({
  kind: "read-set-shrink",
  schema: ReadSetShrinkPayloadSchema,
  fingerprint: (d: ReadSetShrinkPayload) => `read-set-shrink:${d.resourceKey}`,
  meta: {
    tag: "[read-set]",
    notif: "Read-set shed a dependency",
    variant: "warning",
    notifCooldownMs: SHRINK_NOTIF_COOLDOWN_MS,
  },
  renderTask: (row: ReportRow) => {
    const d = ReadSetShrinkPayloadSchema.parse(row.data);
    return {
      title: `[read-set] Dependency shed: ${d.resourceKey}`,
      description: renderDescription(row, d),
    };
  },
});

function renderDescription(row: ReportRow, d: ReadSetShrinkPayload): string {
  const lines: string[] = [];
  lines.push(
    `The boot-critical live-state resource \`${d.resourceKey}\` just persisted a ` +
      `read-set that **drops** the table${d.droppedTables.length === 1 ? "" : "s"} ` +
      `\`${d.droppedTables.join("`, `")}\` — the durable \`tables_read\` shrank ` +
      `(a shed dependency).`,
  );
  lines.push("");
  lines.push(
    `This is **EXPECTED and safe** if a code change removed that dependency from ` +
      `the loader — the resource no longer reads the table, so shedding it is ` +
      `correct. In that case, dismiss this report.`,
  );
  lines.push("");
  lines.push(
    `It is **UNSAFE** if the loader issues a data-dependent conditional query that ` +
      `reads a dropped table only for some data states. On a FULL recompute where ` +
      `the condition didn't fire, the table is shed from the persisted set; if it ` +
      `then changes during downtime and this resource is hydrated-but-never-` +
      `subscribed that session, its cold-boot first paint could be briefly stale ` +
      `(bounded, self-healing on subscribe — see ` +
      `research/2026-07-08-global-read-set-shrink-guard.md).`,
  );
  lines.push("");
  lines.push(
    `**Discriminator — Occurrences below:** a count of **1** is most likely a ` +
      `one-time code-change shed (safe, dismiss). A **growing** count is most ` +
      `likely a conditional query firing intermittently → audit the loader and make ` +
      `the FULL path read the table **unconditionally** (e.g. a cheap ` +
      `\`EXISTS\`/count on a stable path) so the persisted read-set stays a ` +
      `superset.`,
  );
  lines.push("");
  lines.push(`**Resource key:** \`${d.resourceKey}\``);
  lines.push(`**Dropped tables:** ${d.droppedTables.join(", ")}`);
  lines.push(`**Old read-set:** ${d.oldTables.join(", ")}`);
  lines.push(`**New read-set:** ${d.newTables.join(", ")}`);
  lines.push("");
  lines.push(`**Occurrences:** ${row.count}`);
  lines.push(`**Worktree:** ${row.worktree}`);
  lines.push(`**First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`**Last seen:** ${row.lastSeenAt.toISOString()}`);
  return lines.join("\n");
}
