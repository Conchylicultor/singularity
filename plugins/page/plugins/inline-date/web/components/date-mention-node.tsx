import { useState, type ReactNode } from "react";
import {
  MdCalendarToday,
  MdDeleteOutline,
  MdNotificationsActive,
} from "react-icons/md";
import {
  $getNodeByKey,
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { DatePickerPanel } from "@plugins/primitives/plugins/date-picker/web";
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
 *
 * Clicking the chip opens a date picker; edits update the node by key via the
 * Lexical editor. There is no server call on either edit — reminders are
 * reconciled from the block's text on every `page.blocksChanged`, so rewriting
 * the token IS the whole operation.
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

  setIso(iso: string): void {
    const writable = this.getWritable();
    writable.__iso = iso;
  }

  getReminderId(): string | null {
    return this.__reminderId;
  }

  setReminderId(reminderId: string | null): void {
    const writable = this.getWritable();
    writable.__reminderId = reminderId;
  }

  decorate(): ReactNode {
    return (
      <DateMentionView
        nodeKey={this.__key}
        iso={this.__iso}
        reminderId={this.__reminderId}
      />
    );
  }
}

function DateMentionView({
  nodeKey,
  iso,
  reminderId,
}: {
  nodeKey: NodeKey;
  iso: string;
  reminderId: string | null;
}) {
  const [lexicalEditor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);
  const date = new Date(iso);
  const isReminder = reminderId !== null;
  const Icon = isReminder ? MdNotificationsActive : MdCalendarToday;

  function mutate(apply: (node: DateMentionNode) => void) {
    lexicalEditor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isDateMentionNode(node)) apply(node);
    });
  }

  // The chip label stays ABSOLUTE — a chip sitting in prose has to say which day
  // it means; only the `@` menu's options carry relative labels.
  const chip = (
    <LinkChip
      leading={
        <Center as="span" className="size-3.5">
          <Icon className="size-3.5" />
        </Center>
      }
      // The popover owns the press: it must BUBBLE to the trigger below, whose
      // base-ui handler is the only thing that knows about the outside-press
      // that just closed the panel (a stopPropagation + setOpen here would
      // reopen the panel on the click that dismissed it).
      onClick={() => {}}
    >
      {formatMention(date, isReminder)}
    </LinkChip>
  );

  // Read-only render (history preview, non-editable editor): the bare chip.
  if (!lexicalEditor.isEditable()) return chip;

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      width="content"
      padding="sm"
      trigger={
        // A real element for the popover to anchor to (LinkChip forwards no ref).
        // The editor must not see the click as a click on the block's text.
        <Inline gap="none" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          {chip}
        </Inline>
      }
    >
      <Stack gap="sm">
        <DatePickerPanel
          value={date}
          onChange={(next: Date) => mutate((node) => node.setIso(next.toISOString()))}
          // A reminder fires at an instant, so it needs a time-of-day; a plain
          // date mention does not.
          withTime={isReminder}
        />
        <Line>
          <ToggleChip
            active={isReminder}
            variant="ghost"
            icon={<MdNotificationsActive />}
            // Minting/clearing the id is the ENTIRE reminder operation — the
            // server reconciles reminders from the block text on the next
            // `page.blocksChanged`.
            onClick={() =>
              mutate((node) =>
                node.setReminderId(isReminder ? null : crypto.randomUUID()),
              )
            }
          >
            Remind me
          </ToggleChip>
          <Fill />
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false);
              mutate((node) => node.remove());
            }}
          >
            <MdDeleteOutline />
            Remove
          </Button>
        </Line>
      </Stack>
    </InlinePopover>
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
