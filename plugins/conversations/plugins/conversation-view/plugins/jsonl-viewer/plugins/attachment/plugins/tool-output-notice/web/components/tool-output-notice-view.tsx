import { MdContentCut, MdVisibilityOff } from "react-icons/md";
import { EventLine } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

interface ReadTruncationPayload {
  type: "read_truncation_notice";
  banner?: string;
}

const TRUNCATION_PREFIX = "[Truncated: ";

/**
 * Drop the brackets the harness wraps its banner in. The row already says the
 * read was truncated, so `[Truncated: …]` repeats the label in punctuation.
 * Everything inside is left exactly as written — the line counts, the token
 * counts and the suggested next call are the harness's to phrase, and
 * re-parsing them here would break the day it rewords them.
 */
function unwrapBanner(banner: string): string {
  const trimmed = banner.trim();
  if (!trimmed.startsWith(TRUNCATION_PREFIX) || !trimmed.endsWith("]")) {
    return banner;
  }
  return trimmed.slice(TRUNCATION_PREFIX.length, -1);
}

/**
 * The harness annotating a tool result rather than announcing an event of its
 * own: this Read came back partial, or the user never saw that Bash output.
 * Both attach to the tool call named by `toolUseID` — an opaque id a reader
 * cannot use for anything, so it is never rendered; the row states the meaning
 * instead.
 *
 * `EventLine` for both. There is nothing to expand: one is a single sentence
 * the harness already wrote, the other carries no text at all and is entirely
 * its own label.
 */
export function ToolOutputNoticeView({ event }: AttachmentRendererProps) {
  if (event.subtype === "bash_output_audience_note") {
    return (
      <EventLine
        icon={<MdVisibilityOff className="size-3.5" />}
        label="Output not shown to the user"
      >
        <span className="truncate">
          only the agent saw that command&apos;s output
        </span>
      </EventLine>
    );
  }

  const att = event.attachment as ReadTruncationPayload;
  if (!att.banner) {
    throw new Error("read_truncation_notice attachment carries no `banner`");
  }

  return (
    <EventLine
      icon={<MdContentCut className="size-3.5" />}
      label="Read truncated"
    >
      <span className="truncate">{unwrapBanner(att.banner)}</span>
    </EventLine>
  );
}
