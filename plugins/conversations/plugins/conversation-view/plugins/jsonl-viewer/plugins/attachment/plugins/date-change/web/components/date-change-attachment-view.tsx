import { MdEvent } from "react-icons/md";
import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

interface DateChangePayload {
  type: "date_change";
  newDate: string;
}

/** Format an ISO `YYYY-MM-DD` calendar date for display, parsing the parts by
 *  hand so a bare `new Date("2026-06-14")` (UTC midnight) can't shift the day
 *  backwards in a negative-offset timezone. Falls back to the raw string when
 *  the input isn't a well-formed calendar date. */
function formatCalendarDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const formatted = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
  ).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return formatted;
}

export function DateChangeAttachmentView({ event }: AttachmentRendererProps) {
  const att = event.attachment as DateChangePayload;

  return (
    <CollapsibleCard
      icon={<MdEvent className="size-3.5 shrink-0" />}
      label={
        <span>
          Date advanced to{" "}
          <span className="text-foreground">
            {formatCalendarDate(att.newDate)}
          </span>
        </span>
      }
    >
      <Text as="p" variant="caption" className="text-muted-foreground">
        The calendar date changed mid-conversation. The agent was notified that
        today is now{" "}
        <span className="font-mono">{att.newDate}</span> so date-relative
        reasoning stays accurate.
      </Text>
    </CollapsibleCard>
  );
}
