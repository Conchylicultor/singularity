import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { BouncingDots } from "@plugins/primitives/plugins/css/plugins/bouncing-dots/web";
import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useReportSync } from "@plugins/primitives/plugins/sync-status/web";
import {
  dismissPendingTurn,
  retryPendingTurn,
  type PendingTurnRecord,
} from "../internal/store";

// Restore the record's text into the conversation's shared prompt draft.
// persistent-draft exposes no non-hook setter, so this mirrors use-draft.ts's
// storage envelope + sync event exactly (key `singularity:draft:<key>:<scope>`,
// `{v, ts}` envelope, `singularity:draft-updated` custom event) — the editor's
// own useDraft hook picks the write up through that event.
function copyToDraft(conversationId: string, text: string): void {
  const sKey = `singularity:draft:conversation:prompt:${conversationId}`;
  try {
    localStorage.setItem(sKey, JSON.stringify({ v: text, ts: Date.now() }));
    // eslint-disable-next-line promise-safety/no-bare-catch -- quota exceeded: the failed card still holds the text; mirrors use-draft.ts
  } catch {
    // Quota exceeded — silently ignore
  }
  window.dispatchEvent(
    new CustomEvent("singularity:draft-updated", { detail: { storageKey: sKey } }),
  );
}

/**
 * Renders one pending-turn record by state (replace, never duplicate): a card
 * only for `sending | posted | failed-post | unconfirmed`, a text-less 1.5s
 * flash for `sent`, and nothing for `queued` — there the native queue-op row
 * (and for `sent` the real user-text row) has taken over the display.
 */
export function PendingTurnCard({
  conversationId,
  record,
}: {
  conversationId: string;
  record: PendingTurnRecord;
}) {
  const inFlight = record.state === "sending" || record.state === "posted";
  const failed = record.state === "failed-post" || record.state === "unconfirmed";
  useReportSync({
    phase: failed ? "error" : inFlight ? "syncing" : "idle",
    label: "message",
    retry: failed ? () => retryPendingTurn(conversationId, record.id) : undefined,
    savedAt: record.matchedAt ?? null,
  });

  if (record.state === "queued") return null;

  if (record.state === "sent") {
    // Text-less by design: the real user-text row shows the message, so the
    // flash can never double it.
    return (
      <Text as="div" variant="caption" className="px-xs py-xs text-muted-foreground/60">
        Sent ✓
      </Text>
    );
  }

  if (inFlight) {
    // Card chrome mirrors UserTextRow in a dimmed "pending" treatment, with the
    // shared BouncingDots activity indicator below (former PendingTurnEcho).
    return (
      <Stack gap="sm" className="opacity-70">
        <div className="relative rounded-md border border-border/60 bg-background px-md py-sm">
          <Text as="div" variant="body" className="whitespace-pre-wrap break-words">
            {record.text}
          </Text>
          <Text as="div" variant="caption" className="text-muted-foreground/60">
            {record.state === "sending" ? "Sending…" : "Sent to CLI — confirming…"}
          </Text>
        </div>
        <Stack direction="row" gap="sm" align="center" className="px-xs py-xs">
          <BouncingDots />
        </Stack>
      </Stack>
    );
  }

  // failed-post | unconfirmed
  const destructive = record.state === "failed-post";
  const caption = destructive
    ? `Failed to send${record.errorMessage ? ` — ${record.errorMessage}` : ""}`
    : (record.errorMessage ??
      "Not confirmed — the agent may not have received this message. Check the terminal.");
  return (
    <div
      className={cn(
        "rounded-md border px-md py-sm",
        destructive
          ? "border-destructive/40 bg-destructive/5"
          : "border-warning/40 bg-warning/5",
      )}
    >
      <Stack gap="xs">
        <Text as="div" variant="body" className="whitespace-pre-wrap break-words">
          {record.text}
        </Text>
        <Text
          as="div"
          variant="caption"
          className={destructive ? "text-destructive" : "text-warning"}
        >
          {caption}
        </Text>
        <Stack direction="row" gap="sm">
          <Button
            variant="outline"
            onClick={() => retryPendingTurn(conversationId, record.id)}
          >
            Retry
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              copyToDraft(conversationId, record.text);
              dismissPendingTurn(conversationId, record.id);
            }}
          >
            Copy to draft
          </Button>
        </Stack>
      </Stack>
    </div>
  );
}
