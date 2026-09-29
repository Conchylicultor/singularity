import type { ReportRow } from "@plugins/reports/server";
import { ResourceErrorPayloadSchema } from "../../core";
import type { ResourceErrorPayload } from "../../core";

// A failing read re-fails on every retry (reconnect, `online`, the tab coming
// back into view), so a standing failure would otherwise re-alert every 10
// minutes for one known problem — same 6h raise as live-state-stale-drop.
export const RESOURCE_ERROR_NOTIF_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function payloadOf(row: ReportRow): ResourceErrorPayload {
  // Validated by ResourceErrorPayloadSchema at ingest, so this is a total
  // parse; a failure would be a corrupted row (surfaced loudly).
  return ResourceErrorPayloadSchema.parse(row.data);
}

export function renderResourceErrorTask(row: ReportRow): {
  title: string;
  description: string;
} {
  const data = payloadOf(row);
  const noisePrefix = row.noise ? "[noise] " : "";
  const rawTitle = `${noisePrefix}[resource-error] ${data.key} — ${data.errorKind}: ${data.message}`;
  const title =
    rawTitle.length > 120 ? `${rawTitle.slice(0, 117)}...` : rawTitle;

  const lines: string[] = [];
  lines.push(
    `A live read of \`${data.key}\` **failed in a browser tab** (\`${data.errorKind}\`): ${data.message}. The read's surface shows it as an error with Retry, but the value it should show is missing until the failure is fixed.`,
  );
  lines.push("");
  lines.push(`**How to investigate**`);
  lines.push(
    data.errorKind === "not-found"
      ? `1. \`not-found\`: the server serves no resource under \`${data.key}\` for this build. Check that its \`liveValue\` / \`liveCollection\` is still served (\`serveValue\` / \`serveCollection\` in the owning plugin's server barrel), and that the tab and server run the same build (a skewed tab is reported as \`client-outdated\`, which files nothing).`
      : `1. \`loader-failed\`: the server threw loading \`${data.key}\`. The server side files its own \`crash\` report for the same failure — find it in Debug → Reports, with the stack.`,
  );
  lines.push(
    `2. Read the client trace: the \`live-state\` log channel of worktree \`${row.worktree}\` (\`logs/live-state.jsonl\`), grepping for \`error key=${data.key}\`.`,
  );
  lines.push("");
  lines.push(`**Read**`);
  lines.push(`- **Key:** \`${data.key}\``);
  const params = Object.entries(data.params)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  if (params.length > 0) lines.push(`- **Params:** \`${params}\``);
  lines.push(`- **Kind:** \`${data.errorKind}\``);
  lines.push(`- **Message:** ${data.message}`);
  lines.push("");
  lines.push(`**Report**`);
  lines.push(`- **Source:** ${row.source}`);
  lines.push(`- **Worktree:** ${row.worktree}`);
  lines.push(`- **Fingerprint:** ${row.fingerprint}`);
  lines.push(`- **Count:** ${row.count}`);
  lines.push(`- **First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`- **Last seen:** ${row.lastSeenAt.toISOString()}`);
  if (row.url) lines.push(`- **URL:** ${row.url}`);
  return { title, description: lines.join("\n") };
}
