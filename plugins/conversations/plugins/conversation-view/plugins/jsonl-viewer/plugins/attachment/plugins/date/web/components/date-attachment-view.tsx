import { MdCalendarToday, MdEvent } from "react-icons/md";
import { EventLine } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

/** Claude Code ≥ 2.1.260: one attachment for both the routine stamp and the
 *  crossing, told apart by `changed`. */
interface DatePayload {
  type: "date";
  date?: string;
  changed?: boolean;
}

/** The pre-2.1.260 spelling, still present in every older transcript. It only
 *  ever announced a crossing, so it IS `changed: true`. */
interface DateChangePayload {
  type: "date_change";
  newDate?: string;
}

interface DateNotice {
  /** The calendar date the agent was told, as the raw `YYYY-MM-DD` it came in. */
  iso: string;
  /** True when the date advanced mid-conversation (it ran past midnight). */
  changed: boolean;
}

/** Read either payload spelling into the one shape the row renders. Throws on a
 *  payload carrying no date at all: the row's job is to name a date, and an
 *  empty one would read as a stamp that says nothing. The dispatch slot wraps
 *  every renderer in its own error boundary, so this surfaces on the row that
 *  caused it and leaves the rest of the transcript alone. */
function readDateNotice(attachment: unknown): DateNotice {
  const payload = attachment as DatePayload | DateChangePayload;
  if (payload.type === "date_change") {
    if (!payload.newDate) {
      throw new Error("date_change attachment carries no `newDate`");
    }
    return { iso: payload.newDate, changed: true };
  }
  if (!payload.date) {
    throw new Error("date attachment carries no `date`");
  }
  return { iso: payload.date, changed: payload.changed === true };
}

/** Format an ISO `YYYY-MM-DD` calendar date for display, parsing the parts by
 *  hand so a bare `new Date("2026-06-14")` (UTC midnight) can't shift the day
 *  backwards in a negative-offset timezone. Falls back to the raw string when
 *  the input isn't a well-formed calendar date. */
function formatCalendarDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
  ).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * The harness telling the agent what day it is. Two facts in the ambient
 * one-line grammar the other lifecycle rows use:
 *
 * - the stamp — routine, fully muted, glanced past;
 * - the crossing — the conversation ran past midnight, so the label says so
 *   and the new date is the row's one emphasized value.
 *
 * The weekday is what this row adds over the payload: `2026-09-08` alone tells
 * a reader scrolling a long transcript nothing, `Tuesday, September 8, 2026`
 * orients them. There is nothing else to show, so there is nothing to expand.
 */
export function DateAttachmentView({ event }: AttachmentRendererProps) {
  const { iso, changed } = readDateNotice(event.attachment);
  const formatted = formatCalendarDate(iso);

  return (
    <EventLine
      icon={
        changed ? (
          <MdEvent className="size-3.5" />
        ) : (
          <MdCalendarToday className="size-3.5" />
        )
      }
      label={changed ? "Date changed" : "Date"}
    >
      <span className={changed ? "truncate text-foreground" : "truncate"}>
        {formatted}
      </span>
    </EventLine>
  );
}
