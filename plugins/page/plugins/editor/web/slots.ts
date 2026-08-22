import { useMemo, type ComponentType } from "react";
import { defineSlotFacade } from "@plugins/framework/plugins/web-sdk/core";
import {
  defineDispatchSlot,
  defineOrderedDispatchSlot,
  defineRenderSlot,
  type OrderedDispatchContribution,
} from "@plugins/primitives/plugins/slot-render/web";
import type { Block, BlockHandle, RichText } from "../core";
import type {
  BlockAnchorProps,
  BlockChrome,
  BlockEditorAPI,
  BlockFrameProps,
  BlockRendererProps,
} from "./types";
import { UnknownBlock } from "./components/unknown-block";
import { BlockTextRenderer } from "./components/block-text-renderer";

/**
 * Where the caret lives for a text-less block type — one that owns no editable
 * text, so nothing on screen blinks to say the caret is on it and no Lexical
 * instance registers a focus handle for it.
 *
 * There is deliberately **no third value meaning "nowhere"**. That state used to
 * exist as the absence of any declaration, and eight block types were in it:
 * image, video, audio, file, embed, bookmark, place and page-link registered no
 * focus handle at all, so `navigate()` — which walks the registered handles —
 * skipped straight over them. A user arrowing down a page jumped from the
 * paragraph above an image to the paragraph below it, while a click could still
 * focus parts of the same block, leaving the browser and the editor disagreeing
 * about where the user was. Nothing anywhere could say so, because forgetting
 * looked exactly like a block that had nothing to declare.
 */
export type BlockCaretPlacement =
  /**
   * The EDITOR mounts the caret host around this block's row. The renderer
   * writes no caret code at all: it is focusable, arrow-navigable, paints the
   * caret cue, and answers Backspace and Enter, for free. This is the answer for
   * every block whose content is an object the user looks at rather than types
   * into — all the media types, and the fallback for a type the editor does not
   * recognise.
   */
  | "editor"
  /**
   * The RENDERER registers its own handle through `useVoidCaret`, because it
   * owns the thing that must hold the caret and the editor cannot know what that
   * is: a `<textarea>` of source (code, equation), or a `Row`'s inner control,
   * which `Row` re-synthesizes the moment the row grows actions (sub-page).
   */
  | "renderer";

/** Block handle metadata carried alongside the dispatch fields (match, component). */
export interface BlockMeta {
  block: BlockHandle<unknown>;
  /**
   * Per-type presentation for a text-bearing type, applied by the shared
   * renderer onto a fixed element tree. Mutually exclusive with `component` —
   * see `BlockRegistration`.
   */
  chrome?: BlockChrome;
  /**
   * Where this text-less type's caret lives. Optional as STORED and required at
   * the write site, the same shape `chrome` has — see `BlockRegistration`, which
   * is where the requirement is expressed.
   */
  caret?: BlockCaretPlacement;
}

/**
 * Full contribution shape as STORED — block metadata plus ordered-dispatch
 * fields, `component` always resolved. What a plugin may WRITE is narrower; see
 * `BlockRegistration`.
 */
export type BlockContribution = OrderedDispatchContribution<
  BlockRendererProps,
  string
> &
  BlockMeta;

/** Dispatch fields every block registration carries. */
interface BlockRegistrationBase {
  id: string;
  match: string | RegExp | ((props: BlockRendererProps) => boolean);
}

/**
 * The compile-time discriminator between the two arms below. `defineBlock`
 * installs a REQUIRED `text` lens exactly when the schema carried the
 * `TextBearingSchema` brand, and types a void block's as `text?: undefined` — so
 * "does this block carry editable text" is readable from the handle's TYPE, with
 * no second flag to keep in sync. `data: never` only has to be a bottom type the
 * concrete lens is bivariantly assignable to; nothing calls it through here.
 */
type TextBearingHandle = BlockHandle<unknown> & { text(data: never): RichText };
type TextLessHandle = BlockHandle<unknown> & { text?: undefined };
/**
 * A container ANCHOR, the one text-less shape that renders no LINE of its own —
 * `BlockRow` returns before the dispatch for it, so it has no row for a caret to
 * land on and its children hold the caret instead.
 *
 * The proof comes from `defineContainerBlock`, whose return type states
 * `anchor: true` as a certainty. The handle's own field is `anchor?: true` (i.e.
 * `true | undefined`), which no amount of setting it by hand can narrow — so
 * this arm is inhabitable only by a type that went through the factory that
 * makes it a container. That is deliberately the same trick `audience` uses to
 * prove a block went through `defineAnnotationBlock`.
 */
type AnchorHandle = TextLessHandle & { anchor: true };

/**
 * What a plugin writes at an `Editor.Block` call site — a union with exactly one
 * inhabitable arm per handle:
 *
 * - **text-bearing** (text, headings, lists, to-do, toggle, quote, prompt) → the
 *   SLOT supplies the renderer; the contribution may only declare `chrome`.
 *   Naming a `component` here is a compile error, and that is the point: quote
 *   and prompt used to own their own dispatch components, so converting into
 *   them unmounted the `LexicalComposer` (and the Yjs↔Lexical binding) holding
 *   the user's caret — the reason the `/quote` bug was reported for those types
 *   and no other. Every text type now dispatches ONE function reference, so
 *   every text↔text conversion reconciles in place. See
 *   `research/2026-07-29-page-text-block-presentation-api.md`.
 * - **text-less** (divider, image, code-block, embed, media, sub-page, the
 *   callout anchor, …) → owns its component outright. Converting text → divider
 *   SHOULD tear the editor down; there is no caret on the other side to keep.
 *
 * **`excludeFromReorder` is on the TEXT-LESS arm only**, and that is a real hole
 * being closed rather than hygiene: `ReorderItemMiddleware`
 * (`plugins/reorder/web/internal/dnd-item-middleware.tsx`) early-returns
 * `<>{children}</>` where it otherwise renders `<SortableReorderItem>`,
 * discriminating on exactly that field — an element-type flip on an ANCESTOR of
 * the composer, keyed per contribution. A text-bearing type setting it would
 * remount Lexical on every conversion into or out of it: the reported bug,
 * reached through a field the union would otherwise permit. No block sets it
 * today, which is why the shared-renderer fix would otherwise be complete in
 * fact rather than by construction.
 */
export type BlockRegistration =
  | (BlockRegistrationBase & {
      block: TextBearingHandle;
      chrome?: BlockChrome;
      component?: never;
      caret?: never;
      excludeFromReorder?: never;
    })
  // A container anchor: no line, so no caret to place. Listed BEFORE the general
  // text-less arm so a container matches it rather than being asked for a
  // `caret` it could not honour.
  | (BlockRegistrationBase & {
      block: AnchorHandle;
      component: ComponentType<BlockRendererProps>;
      chrome?: never;
      caret?: never;
      excludeFromReorder?: boolean;
    })
  | (BlockRegistrationBase & {
      block: TextLessHandle;
      component: ComponentType<BlockRendererProps>;
      chrome?: never;
      /**
       * REQUIRED, and that is the whole point: a text-less block type has no
       * editable text to hold the caret, so *something* has to, and there is no
       * longer any way to leave the question unanswered. See
       * {@link BlockCaretPlacement} for the two answers and for the eight block
       * types that silently had neither.
       */
      caret: BlockCaretPlacement;
      excludeFromReorder?: boolean;
    });

// Ordered-dispatch: renders one contribution per block via `.Dispatch`, but
// each contribution carries an `id` so the slot enters the reorderable-slots
// manifest and owes an authored config override. The grouped block menus read
// that config order (groups + labels) through `useReorderedEntries`; the slot
// itself stays pure single-match dispatch.
const blockSlot = defineOrderedDispatchSlot<
  BlockRendererProps,
  string,
  BlockMeta
>({
  key: (props) => props.block.type,
  fallback: UnknownBlock,
  docLabel: (c) => c.block?.type,
});

/**
 * Extra fields carried alongside a container frame's dispatch fields.
 *
 * Both ride on the frame registration rather than getting slots of their own on
 * purpose: containerhood is already derived from *who actually paints a box*
 * (`useFramedBlockTypes`), precisely so it cannot drift from a second flag; a
 * separate anchor (or menu) slot would reintroduce exactly that drift in a new
 * coat — a type could claim a decoration while framing nothing, or frame
 * without one.
 *
 * The two are **different surfaces of one container**, and the split is the
 * user's stated model:
 *
 * - `anchor` is the leading decoration (the callout's icon), rendered by the
 *   surface in the ROW layer — see `BlockAnchorProps`. It is the container's
 *   APPEARANCE affordance.
 * - `menu` is contributed sections inside the rail popover the container owns on
 *   its BORROWED line (`BlockActionsMenu`'s container arm) — where the
 *   STRUCTURAL actions (Collapse, Remove, Delete) live. A container with nothing
 *   per-instance to configure (the context card, whose payload is `{}`)
 *   contributes none and still gets those actions, so this field says nothing
 *   about containerhood.
 *
 * Appearance is deliberately reachable from BOTH: the same component renders in
 * the glyph's popover and in the rail's menu. The rail is where a user looks for
 * block actions; the glyph is where they look for the glyph.
 *
 * The honest cost: only a field literally named `component` goes through the
 * framework's sealed-component middleware chain (error boundary, reorder), so an
 * `anchor`/`menu` component is UNSEALED — a crash inside it is not contained to
 * the slot. Precedent: `BlockHandle.icon` is rendered raw today. Documented, not
 * discovered.
 */
export interface BlockFrameMeta {
  anchor?: ComponentType<BlockAnchorProps>;
  /**
   * Sections this container contributes to the rail popover, above the generic
   * structural actions. The prop shape is `Editor.TurnInto`'s verbatim, so
   * "menu sections contributed by a plugin" is ONE convention in this editor
   * rather than two that drift.
   */
  menu?: ComponentType<{
    block: Block;
    api: BlockEditorAPI;
    close: () => void;
  }>;
}

export const Editor = {
  /**
   * Register a block type's renderer. Callable + the slot's own members
   * (`id` / `useContributions` / `Dispatch`), so it stays slot-shaped for the
   * facet walk and every reading consumer; only the CALL signature is narrowed,
   * to `BlockRegistration`'s union.
   */
  Block: defineSlotFacade(
    (reg: BlockRegistration) =>
      blockSlot({
        ...reg,
        // The one and only binding of the shared text renderer to a block type.
        // A text-bearing registration cannot name a `component` (typed `never`),
        // so this default is unconditional for all of them — which is precisely
        // what keeps a type change chrome-only.
        component: reg.component ?? BlockTextRenderer,
      } as BlockContribution),
    blockSlot,
  ),
  /**
   * A block type's CONTAINER FRAME: the decorated box painted around the
   * container's own row PLUS its whole visible subtree (the callout's tint).
   * Contributing here is what makes a block type a container — the surfaces
   * derive the framed-type set from this slot's registered matches
   * (`useFramedBlockTypes`), so there is no second "I am a container" flag to
   * drift from it.
   *
   * Deliberately NOT a fallback dispatch: a type with no contribution is not
   * framed at all and its subtree stays flat, so `.Dispatch` is only ever
   * rendered for a type known to match. `match` must be a plain string (the
   * block type) — the membership set is read off it, so a RegExp or predicate
   * contribution would paint but never be grouped.
   */
  BlockFrame: defineDispatchSlot<BlockFrameProps, string, BlockFrameMeta>({
    key: (props) => props.type,
    docLabel: (c) => (typeof c.match === "string" ? c.match : undefined),
  }),
  /**
   * Extra "Turn into" targets in the block-actions menu, contributed by plugins
   * that span more than the editor can know (e.g. turn-into-page, which creates
   * a page + a page-link). Rendered inside the menu's "Turn into" section. The
   * contribution receives the block, its editor API, and a `close` callback.
   */
  TurnInto: defineRenderSlot<{
    component: ComponentType<{
      block: Block;
      api: BlockEditorAPI;
      close: () => void;
    }>;
  }>(),
  /**
   * Toolbar controls for the floating selection format bar. Each contribution
   * renders one control (typically a `<MarkButton/>` reading `useFormatToolbar()`
   * for live active state). The bar is rendered by `FormatToolbarPlugin` only when
   * a non-collapsed range selection exists; contributions never see the editor
   * directly — they dispatch Lexical commands through the context. Reorder
   * middleware applies automatically (the bar is reorderable, by design).
   */
  FormatAction: defineRenderSlot<{ component: ComponentType }>(),
};

/**
 * The set of block types that are container frames, derived from the
 * `Editor.BlockFrame` registrations themselves. A surface asks "should I group
 * this block's subtree under it?" and gets an answer that cannot disagree with
 * who actually paints a frame — adding or removing a container plugin updates
 * every surface with zero code changes.
 */
export function useFramedBlockTypes(): ReadonlySet<string> {
  const contributions = Editor.BlockFrame.useContributions();
  return useMemo(
    () =>
      new Set(
        contributions
          .map((c) => c.match)
          .filter((m): m is string => typeof m === "string"),
      ),
    [contributions],
  );
}

/**
 * Block type → its container ANCHOR component, derived from the same
 * `Editor.BlockFrame` registrations `useFramedBlockTypes()` reads. Twin of that
 * hook, on the same single source of truth: a type has a decoration exactly when
 * the registration that makes it a container also supplies one.
 *
 * A `BlockHandle` declaring `anchor: true` whose plugin supplies no component
 * here is a real disagreement (the reducer would treat the type as a void
 * container while the surface paints nothing) — `./singularity check
 * page-editor:anchor-has-decoration` fails on it.
 */
export function useBlockAnchors(): ReadonlyMap<
  string,
  ComponentType<BlockAnchorProps>
> {
  const contributions = Editor.BlockFrame.useContributions();
  return useMemo(() => {
    const out = new Map<string, ComponentType<BlockAnchorProps>>();
    for (const c of contributions) {
      if (typeof c.match === "string" && c.anchor) out.set(c.match, c.anchor);
    }
    return out;
  }, [contributions]);
}

/**
 * Block type → the sections it contributes to the rail popover, derived from the
 * same `Editor.BlockFrame` registrations the two hooks above read. Twin of
 * `useBlockAnchors()` on the same single source of truth, for the same reason:
 * the menu a container hangs off its borrowed line's rail cannot drift from the
 * registration that makes it a container in the first place.
 *
 * Unlike `anchor` there is no `page-editor:anchor-has-decoration`-style pairing
 * check to owe, and deliberately so: a missing anchor is an INVISIBLE container,
 * while a missing menu is a container with no per-instance appearance — the
 * context card's normal, correct state. The container arm of `BlockActionsMenu`
 * is therefore selected by the CORE fact `BlockHandle.anchor`, never by
 * membership of this map.
 */
export function useBlockFrameMenus(): ReadonlyMap<
  string,
  ComponentType<{ block: Block; api: BlockEditorAPI; close: () => void }>
> {
  const contributions = Editor.BlockFrame.useContributions();
  return useMemo(() => {
    const out = new Map<
      string,
      ComponentType<{ block: Block; api: BlockEditorAPI; close: () => void }>
    >();
    for (const c of contributions) {
      if (typeof c.match === "string" && c.menu) out.set(c.match, c.menu);
    }
    return out;
  }, [contributions]);
}
