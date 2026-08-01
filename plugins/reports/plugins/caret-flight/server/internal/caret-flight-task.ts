import type { ReportRow } from "@plugins/reports/server";
import { CaretFlightPayloadSchema } from "../../core";
import type { CaretFlightPayload } from "../../core";

// Notification re-arm window: an abort is user-visible (their typing jumped back
// to the previous block, or vanished), so it resurfaces every 6h rather than
// once-forever — same policy as optimistic-divergence / live-state-stale-drop.
// Lives here (not the barrel) per barrel-purity.
export const CARET_FLIGHT_NOTIF_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function payloadOf(row: ReportRow): CaretFlightPayload {
  // The row's data was validated by CaretFlightPayloadSchema at ingest, so this
  // is a total parse; failure would be a corrupted row (surfaced loudly).
  return CaretFlightPayloadSchema.parse(row.data);
}

export function renderCaretFlightTask(row: ReportRow): {
  title: string;
  description: string;
} {
  return { title: renderTitle(row), description: renderDescription(row) };
}

function renderTitle(row: ReportRow): string {
  const data = payloadOf(row);
  const noisePrefix = row.noise ? "[noise] " : "";
  const outcome = data.replayedInto === null ? "LOST" : "recovered";
  const raw = `${noisePrefix}[caret-flight] ${data.reason} — ${data.buffered} buffered keystrokes ${outcome}`;
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

function renderDescription(row: ReportRow): string {
  const data = payloadOf(row);
  const lines: string[] = [];

  lines.push(
    `The page editor's **caret authority** gave up on a claimed landing. The authority holds one authoritative caret location and takes the keyboard while the caret is in flight to a block whose editor has not mounted yet (typically the block an Enter just created), buffering what the user types. This flight never landed, so ${data.buffered} buffered input unit(s) ${data.replayedInto === null ? "**could not be replayed anywhere and were LOST**" : `were replayed back into the origin block \`${data.replayedInto}\``}.`,
  );
  lines.push("");
  lines.push(`**What \`${data.reason}\` means**`);
  lines.push(reasonExplanation(data));
  lines.push("");
  lines.push(`**How to investigate**`);
  lines.push(
    `1. Read the invariant first: the "The caret authority (input follows the model, not the DOM)" section of \`plugins/page/plugins/editor/CLAUDE.md\`, and \`research/2026-07-31-page-caret-authority.md\`.`,
  );
  lines.push(
    `2. The deterministic reproduction harness is \`plugins/page/plugins/editor/web/__tests__/caret-authority.test.tsx\` (\`bun run test:dom plugins/page/plugins/editor\`) — it can hold a flight open indefinitely by withholding the target's handle, which is the state this report describes.`,
  );
  lines.push(
    `3. The fast-path gate is \`bun plugins/page/plugins/editor/e2e/split-typing-verify.ts\` against a deployed worktree.`,
  );
  lines.push(
    data.replayedInto === null
      ? `4. A **lost** buffer is the serious variant: the origin block had no registered handle (it unmounted too), so there was nowhere to put the user's characters. Establish which surface was tearing down.`
      : `4. A **recovered** buffer means no input was lost — the user saw their typing land in the previous block instead of the new one. Still a defect, but not data loss.`,
  );
  lines.push("");
  lines.push(`**Flight**`);
  lines.push(`- **Reason:** \`${data.reason}\``);
  lines.push(`- **Target block:** \`${data.targetId}\``);
  lines.push(`- **Origin block:** \`${data.originId ?? "none"}\``);
  lines.push(`- **Buffered input units:** ${data.buffered}`);
  lines.push(`- **Replayed into:** \`${data.replayedInto ?? "nothing — LOST"}\``);
  lines.push("");
  lines.push(`**Report**`);
  lines.push(`- **Source:** ${row.source}`);
  lines.push(`- **Worktree:** ${row.worktree}`);
  lines.push(`- **Fingerprint:** ${row.fingerprint}`);
  lines.push(`- **Count:** ${row.count}`);
  lines.push(`- **First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`- **Last seen:** ${row.lastSeenAt.toISOString()}`);
  if (row.url) lines.push(`- **URL:** ${row.url}`);
  if (row.userAgent) lines.push(`- **User-Agent:** ${row.userAgent}`);
  return lines.join("\n");
}

function reasonExplanation(data: CaretFlightPayload): string {
  switch (data.reason) {
    case "target-never-rendered":
      return `No commit ever rendered a visible line for \`${data.targetId}\`. Either the op that would have created the block was refused or dropped by the reducer, or it landed somewhere unrenderable (inside a collapsed ancestor) — in both cases no editor can mount, so the landing was impossible rather than merely late.`;
    case "focus-left-surface":
      return `DOM focus moved to an element outside the block list while the caret was still in flight — a click elsewhere, or a stray programmatic focus. Expected occasionally when the user simply clicks away mid-Enter; a repeating row means something is stealing focus.`;
    case "target-cannot-hold-input":
      return `\`${data.targetId}\` mounted but registered no \`replayInput\`, i.e. it is a void block (image, divider, embed …) with nowhere to put typed characters. A caret landing was claimed for a block that can never accept typing — look at which caller created it.`;
    case "surface-detached":
      return `The block list's interaction surface was detached mid-flight (the editor unmounted — a page navigation, a pane swap). Expected if the user navigated away mid-keystroke; a repeating row means the surface is remounting under normal editing.`;
  }
}
