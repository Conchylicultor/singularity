import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { TurnUnconfirmedPayloadSchema } from "@plugins/reports/plugins/turn-unconfirmed/core";

// One-line Debug → Reports summary for the turn-unconfirmed kind: the
// unconfirmed message's bounded text preview, how long the owner tab waited
// before declaring it unconfirmed, and the conversation id. No trace — the
// turn vanished between the POST ack and the transcript, not inside a server
// flight window.
export function TurnUnconfirmedKindView({ report }: { report: Report }) {
  const parsed = TurnUnconfirmedPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <span className="truncate" title={d.textPreview}>
        Turn not confirmed in transcript — {d.textPreview}
      </span>
      <span className="text-muted-foreground tabular-nums">
        after {Math.round(d.elapsedMs / 1000)}s
      </span>
      <span
        className="text-muted-foreground truncate font-mono"
        title={d.conversationId}
      >
        {d.conversationId}
      </span>
    </Inline>
  );
}
