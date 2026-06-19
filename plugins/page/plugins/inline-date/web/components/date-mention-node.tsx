import type { ReactNode } from "react";
import { MdCalendarToday, MdNotificationsActive } from "react-icons/md";
import { DecoratorNode, type LexicalNode, type NodeKey } from "lexical";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { formatMention } from "../internal/format-date";

type SerializedDateMentionNode = {
  type: "date-mention";
  version: 1;
  iso: string;
  reminderId: string | null;
};

/**
 * An inline, non-editable date mention rendered as a chip. Lives inside a text
 * block's Lexical tree; persists as a `[[date:<iso>]]` token, or — when it also
 * carries a `reminderId` — a `[[reminder:<id>:<iso>]]` token that the server
 * reconciler schedules a notification for (see core's token helpers). Its own
 * `getTextContent()` stays empty so the token never leaks into live root-text
 * reads (slash menu, the `@`/`[[` query scans) — serialization happens via the
 * block-text extension's `serializeNode`.
 */
export class DateMentionNode extends DecoratorNode<ReactNode> {
  __iso: string;
  __reminderId: string | null;

  static getType(): string {
    return "date-mention";
  }

  static clone(node: DateMentionNode): DateMentionNode {
    return new DateMentionNode(node.__iso, node.__reminderId, node.__key);
  }

  constructor(iso: string, reminderId: string | null, key?: NodeKey) {
    super(key);
    this.__iso = iso;
    this.__reminderId = reminderId;
  }

  static importJSON(json: SerializedDateMentionNode): DateMentionNode {
    return new DateMentionNode(json.iso, json.reminderId);
  }

  exportJSON(): SerializedDateMentionNode {
    return {
      type: "date-mention",
      version: 1,
      iso: this.__iso,
      reminderId: this.__reminderId,
    };
  }

  isInline(): true {
    return true;
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "inline-flex align-baseline";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  getIso(): string {
    return this.__iso;
  }

  getReminderId(): string | null {
    return this.__reminderId;
  }

  decorate(): ReactNode {
    return <DateMentionView iso={this.__iso} reminderId={this.__reminderId} />;
  }
}

function DateMentionView({ iso, reminderId }: { iso: string; reminderId: string | null }) {
  const date = new Date(iso);
  const isReminder = reminderId !== null;
  const Icon = isReminder ? MdNotificationsActive : MdCalendarToday;
  return (
    <LinkChip
      leading={
        <Center as="span" className="size-3.5">
          <Icon className="size-3.5" />
        </Center>
      }
      onClick={(e) => e.stopPropagation()}
    >
      {formatMention(date, isReminder)}
    </LinkChip>
  );
}

export function $createDateMentionNode(iso: string, reminderId: string | null = null): DateMentionNode {
  return new DateMentionNode(iso, reminderId);
}

export function $isDateMentionNode(
  node: LexicalNode | null | undefined,
): node is DateMentionNode {
  return node instanceof DateMentionNode;
}
