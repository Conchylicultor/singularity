import { ContainerCornerLabel } from "@plugins/page/plugins/container/web";
import type {
  BlockAnchorProps,
  BlockEditorAPI,
} from "@plugins/page/plugins/editor/web";
import {
  AgentNotesAuthors,
  useAgentNotesAuthors,
} from "@plugins/page/plugins/annotations/plugins/agent-notes/plugins/authorship/web";

/**
 * The agent-notes card's name, in the top-right corner of its box — and, once an
 * agent has written into the card, the way to WHICH conversations did.
 *
 * ## Why this one has `sections` where its siblings do not
 *
 * The family rule is that a container with nothing per-instance to show renders
 * a plain, non-interactive name, because a popover would open onto nothing. That
 * rule reads the block's `data`, and this card's is still `{}`. But provenance
 * does not live in `data` — it is a side table keyed by block id
 * ([`authorship`](../../plugins/authorship/CLAUDE.md)) — and it IS per-instance,
 * which is the premise the sibling cards' "nothing to show" rests on. So the
 * name is a trigger exactly when there is something behind it.
 *
 * The card's name carries no `action`: opening the authorship list is a READ, so
 * the word stays the word and simply brightens under the pointer. `/todo`'s
 * `▷ Launch` swap is for the one card whose decoration is an ACT.
 *
 * Structural actions are unaffected and still absent here: Collapse / Remove
 * agent notes / Delete come from the rail on the line the card borrows,
 * generically over `BlockHandle.anchor`.
 *
 * ## Three states, and the two degradations are the same one
 *
 * `blockId` and `editor` are both optional on `BlockAnchorProps` and both absent
 * on a read-only surface (the blog renderer, the version-history preview): a
 * read-only node may carry no id, and there is no block API to hand a popover.
 * Either one missing ⇒ the static name, revealed by that surface's own CSS
 * group. With both, the card subscribes to its own authorship — a
 * point-membership read, so only a MOUNTED card pays for one — and an unauthored
 * card (a human pasted an agent's output in by hand) still renders the plain
 * name.
 */
export function AgentNotesAnchor({ blockId, editor }: BlockAnchorProps) {
  if (!editor || blockId === undefined) return <AgentNotesName />;
  return <AuthoredAgentNotesAnchor blockId={blockId} editor={editor} />;
}

/** The card's fixed name. Its `data` is `{}`, so nothing here is per-instance. */
function AgentNotesName(props: { blockId?: string; editor?: BlockEditorAPI }) {
  return (
    <ContainerCornerLabel
      blockId={props.blockId}
      editor={props.editor}
      name="Agent notes"
      className="text-info"
    />
  );
}

/**
 * The editable-surface arm, split out so the authorship subscription is a hook
 * on a component that only ever mounts when there is a block id to key it by.
 */
function AuthoredAgentNotesAnchor({
  blockId,
  editor,
}: {
  blockId: string;
  editor: BlockEditorAPI;
}) {
  const authors = useAgentNotesAuthors(blockId);

  if (authors.length === 0)
    return <AgentNotesName blockId={blockId} editor={editor} />;

  return (
    <ContainerCornerLabel
      blockId={blockId}
      editor={editor}
      name="Agent notes"
      className="text-info"
      triggerLabel="Agent notes authorship"
      width="md"
      sections={({ close }) => (
        <AgentNotesAuthors authors={authors} onOpen={close} />
      )}
    />
  );
}
