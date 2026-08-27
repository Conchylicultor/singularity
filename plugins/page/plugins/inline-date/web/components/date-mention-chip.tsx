import type React from "react";
import { MdCalendarToday, MdNotificationsActive } from "react-icons/md";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import type { DateMentionFields } from "../../core";
import { formatMention } from "../internal/format-date";

/**
 * The date-mention token as a chip, and nothing else — no popover, no editing,
 * no Lexical.
 *
 * Three surfaces render exactly this: the live editor's own decorator (with the
 * picker wrapped AROUND it), a non-editable editor, and every surface that
 * mounts no Lexical at all (page history, diffs, the public site) through the
 * `renderToken` half of `../internal/register`. One component, so the read-only
 * spelling of a date mention cannot drift from the editable one — and so it
 * cannot be MISSING, which is what it was: `[[date:…]]` rendered as literal
 * brackets on every read surface, because that renderer named its two token
 * types by hand and nobody added the third.
 *
 * `onClick` is required rather than defaulted, because the two callers want
 * genuinely opposite things and neither is the obvious default: the editable
 * chip must let the press BUBBLE to the popover trigger that owns it, and the
 * read-only chip must stop it from reaching whatever it is embedded in.
 */
export function DateMentionChip({
  iso,
  reminderId,
  onClick,
}: DateMentionFields & { onClick: (e: React.MouseEvent) => void }) {
  const isReminder = reminderId !== null;
  const Icon = isReminder ? MdNotificationsActive : MdCalendarToday;
  return (
    <LinkChip
      leading={
        <Center as="span" className="size-3.5">
          <Icon className="size-3.5" />
        </Center>
      }
      onClick={onClick}
    >
      {/* The label stays ABSOLUTE — a chip sitting in prose has to say which day
          it means; only the `@` menu's options carry relative labels. */}
      {formatMention(new Date(iso), isReminder)}
    </LinkChip>
  );
}
