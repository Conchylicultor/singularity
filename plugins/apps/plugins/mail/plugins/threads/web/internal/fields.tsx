import { useMemo, type ReactNode } from "react";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import type { FieldDef, FieldValue } from "@plugins/primitives/plugins/data-view/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  mailLabelsResource,
  type MailLabel,
  type MailThread,
} from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { MAIL_THREAD_FIELDS } from "../../core";

// Comparable projection for one field id. Drives the toolbar sort/filter pills
// (search/filter/sort actually run server-side; this powers the chrome). The
// list body itself is fully owned by `renderRow` (ThreadRow), so no cell is
// needed for display — only the `date` cell exists so a future non-renderRow
// consumer of these fields still shows a friendly date.
function fieldValue(t: MailThread, id: string): FieldValue {
  switch (id) {
    case "subject":
      return t.subject;
    case "lastMessageAt":
      return t.lastMessageAt;
    case "unread":
      return t.unread;
    case "starred":
      return t.starred;
    case "important":
      return t.important;
    case "hasAttachments":
      return t.hasAttachments;
    case "messageCount":
      return t.messageCount;
    default:
      return null;
  }
}

function cellFor(id: string, type: string): ((t: MailThread) => ReactNode) | undefined {
  if (type === "date") {
    return (t: MailThread) => {
      const v = fieldValue(t, id);
      return v instanceof Date ? <RelativeTime date={v} /> : null;
    };
  }
  return undefined;
}

type LabelOption = { value: string; label: string };

// The Gmail-issued system label ids the authored mailbox tabs are written
// against (`config/apps/mail/threads/mail-threads.jsonc`), paired with their
// human titles — so the Inbox tab's filter chip reads "Inbox", not "INBOX".
//
// A display-name lookup, not a data set: an id missing from it renders as its own
// raw id, so this list being short is a cosmetic gap, never a wrong result.
const SYSTEM_LABEL_OPTIONS: LabelOption[] = [
  { value: "INBOX", label: "Inbox" },
  { value: "SENT", label: "Sent" },
  { value: "DRAFT", label: "Drafts" },
  { value: "SPAM", label: "Spam" },
  { value: "TRASH", label: "Trash" },
  { value: "UNREAD", label: "Unread" },
  { value: "STARRED", label: "Starred" },
  { value: "IMPORTANT", label: "Important" },
];

// Module-level (so it is reference-stable) derived slice: the labels resource is
// a live list, but this surface only ever wants its id→name projection. Reading
// it through `select` narrows re-renders to a genuine name change AND is the
// sanctioned shape for the pending fallback below.
const selectLabelOptions = (rows: MailLabel[]): LabelOption[] =>
  rows.map((l) => ({ value: l.id, label: l.name }));

/**
 * The web `FieldDef[]`, derived from the shared `MAIL_THREAD_FIELDS` vocabulary
 * so it can never drift from the server's `FieldColumnMap`.
 *
 * A hook rather than a constant because the `labels` field's `options` are live:
 * they map each Gmail label id to a friendly name, which every mailbox tab's
 * filter chip renders — so "Label_12" never reaches the screen. The user labels
 * come from `mail-core`'s labels resource.
 */
export function useMailThreadFieldDefs(): FieldDef<MailThread>[] {
  const userLabels = useResource(mailLabelsResource, undefined, {
    select: selectLabelOptions,
  });
  // `options` is a display-name LOOKUP, not a data set: a label id missing from
  // it renders as its own raw id — the same thing an unsynced id already does. So
  // the pending arm is a smaller lookup table, never a fake-empty collection, and
  // it can't produce a confidently-wrong empty state.
  const labelOptions = useMemo(
    () =>
      userLabels.pending
        ? SYSTEM_LABEL_OPTIONS
        : [...SYSTEM_LABEL_OPTIONS, ...userLabels.data],
    [userLabels],
  );

  return useMemo(
    () =>
      MAIL_THREAD_FIELDS.map((spec) => {
        const base = {
          id: spec.id,
          label: spec.label,
          type: spec.type,
          primary: spec.primary,
          sortable: spec.sortable,
          filterable: spec.filterable,
          align: spec.align,
        };
        // `tags` fields project through `values` (array-aware), not `value`, and
        // carry the id→name mapping the chips render.
        return spec.id === "labels"
          ? {
              ...base,
              values: (t: MailThread) => t.labelIds,
              options: labelOptions,
            }
          : {
              ...base,
              value: (t: MailThread) => fieldValue(t, spec.id),
              cell: cellFor(spec.id, spec.type),
            };
      }),
    [labelOptions],
  );
}
