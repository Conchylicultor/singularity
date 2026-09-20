import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import type {
  ArtifactHit,
  ArtifactItem,
} from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/core";

/**
 * One kind of artifact a conversation can produce — prototypes, pages, research
 * docs, screenshots, skills, and whatever comes next.
 *
 * The contribution is split in two halves on purpose, and the split is what
 * makes the button possible at all:
 *
 * - `extract` is a **pure function**, not a component. The host runs it over
 *   every transcript event before anything renders, because the count on the
 *   closed button has to exist before any section is mounted. It must not call
 *   hooks, fetch, or read anything outside the event it is handed.
 * - `Section` is the component. A kind's titles usually need a lookup (the
 *   prototypes list, a page's name), and a lookup is a hook — so it lives here,
 *   inside the kind's own component, mounted only while the popover is open.
 */
export interface ArtifactKind {
  /** Section heading — plural, e.g. "Prototypes". */
  label: string;
  /** The kind's glyph, drawn at the left of each of its rows. */
  icon: ComponentType<{ className?: string }>;
  /**
   * PURE. Called once per transcript event, outside React. Return every
   * artifact of this kind the event touched — one hit per sighting; the host
   * folds repeats together. Every hit's `kind` must be this contribution's own
   * `id`.
   */
  extract: (event: JsonlEvent) => ArtifactHit[];
  /**
   * Renders this kind's items in its own layout (rows, a thumbnail grid, name
   * chips) and decides where a click goes. Only ever mounted with a non-empty
   * list — the host skips a kind that found nothing.
   */
  Section: ComponentType<{ items: ArtifactItem[] }>;
}

export const ConversationArtifacts = {
  Kind: defineRenderSlot<ArtifactKind>({ docLabel: (kind) => kind.label }),
};
