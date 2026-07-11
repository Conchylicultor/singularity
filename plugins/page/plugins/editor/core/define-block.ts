import type { ComponentType } from "react";
import type { AnyZodObject, z } from "zod";

/**
 * The semantic typography roles an editable-text block can render at. Mirrors the
 * `TextVariant` set from `primitives/text`, redeclared here because core cannot
 * import from a web barrel — the web renderer maps each role to its `text-<role>`
 * utility. `body` is the default for ordinary text blocks.
 */
export type BlockTextVariant =
  | "title"
  | "heading"
  | "subheading"
  | "body"
  | "label"
  | "caption";

export interface BlockHandle<T> {
  type: string;
  schema: AnyZodObject;
  parse(data: unknown): T;
  /**
   * Whether this block type carries editable text — DERIVED once from the schema
   * (`"text" in schema.shape`), never inferred from a type name. Consumers use it
   * to decide whether to carry `text` through a type conversion: injecting `text`
   * into a void block type (audio, divider, …) whose schema never declared it would
   * write a key the write boundary now rejects with a 400.
   */
  acceptsText: boolean;
  /**
   * Optional insert-menu label (e.g. "Text", "Link to page"). A block type
   * without a `label` is not offered in the editor's "add block" menu.
   */
  label?: string;
  /**
   * Marks THE plain-paragraph type: the block the editor falls back to whenever
   * it must create text the user never picked a type for — Enter from the page
   * title, a click below the last block, a markdown paragraph on paste. Exactly
   * one block type declares it (`page/text`), and `defaultTextHandle` selects it
   * by this flag alone. Declared, never inferred: the old "no prefix, no marker,
   * no toggle, has a label" heuristic silently matched whichever void block type
   * (audio, bookmark, …) happened to register first.
   */
  defaultText?: boolean;
  /** Optional insert-menu icon. */
  icon?: ComponentType<{ className?: string }>;
  /**
   * Optional alternate search terms for the insert menus (e.g. `["hr", "rule"]`
   * for a divider). The block-type pickers match these in addition to `label`,
   * but rank them below label matches. Only meaningful for block types that also
   * declare a `label` (presence of `label` is what gates menu inclusion).
   */
  aliases?: string[];
  /** Returns the default `data` payload for a freshly inserted block. */
  empty?: () => T;
  /**
   * Leading text that auto-converts a block into this type (e.g. `["* ", "- "]`
   * for a bulleted list). The shared text editor strips the matched prefix and
   * converts via `BlockEditorAPI.convertTo`, preserving any trailing text.
   */
  markdownPrefixes?: string[];
  /**
   * Backspace at the very start of this block first converts it to this type
   * (keeping text + children) instead of merging — Notion's "reset block type".
   * A second Backspace then merges. Generic: the editor core never names a
   * specific block type (the target is supplied here, e.g. `"text"`).
   */
  resetToOnBackspaceAtStart?: string;
  /**
   * Enter on an EMPTY block of this type converts it to this type instead of
   * splitting — exits a list / breaks a quote out to a paragraph. Generic: the
   * editor core never names a specific block type.
   */
  breakOutOnEmptyEnter?: string;
  /**
   * For editable-text block types: a static glyph rendered to the left of the
   * text (e.g. `"•"` for a bullet). Text-like block types that share the editor
   * plugin's `BlockTextRenderer` all resolve to the *same* renderer function, so
   * converting between them reconciles in place (the live editor and its caret
   * survive) rather than remounting.
   */
  marker?: string;
  /**
   * For editable-text list blocks whose marker is its 1-based position among the
   * consecutive run of same-type siblings (an ordered list). The shared renderer
   * draws `ordinalMarker(n)` as the leading glyph; markdown paste routes N./N)
   * lines to this type and copy emits real sequential numbers. The
   * position-derived analogue of `marker` — generic, the editor core never names
   * a specific block type.
   */
  ordinalMarker?: (ordinal: number) => string;
  /** For editable-text block types: placeholder shown when empty and focused. */
  placeholder?: string;
  /** Semantic typography variant for the editable text (default "body"). */
  textVariant?: BlockTextVariant;
  /**
   * Where the gutter controls (+ / drag / chevron) seat vertically: a CSS length
   * from the block's TOP edge to the CENTER of its first rendered line, which is
   * where the controls center.
   *
   * The default suits a block that renders editable text through the shared
   * `BlockTextEditor` at the standard inset — `py-xs + textVariant-line-height/2`
   * — so ordinary text blocks omit this. A block that renders its first line at a
   * different offset (a padded box like the callout, an icon row like
   * link-to-page / sub-page, a rule like the divider) declares its real center
   * here so the rail tracks that line instead of a phantom text line. Media/void
   * blocks with no single line can omit it: the default seats the controls near
   * the block's top-left, the intended treatment for tall content.
   *
   * Express it in the same tokens the block's layout uses (e.g.
   * `calc(var(--space-xs) * 2 + var(--doc-lh-body) / 2)`) so it tracks the
   * density preset and can't drift from the padding it mirrors.
   */
  gutterFirstLineCenter?: string;
  /** Sibling block type produced when Enter splits this block at the END of its text (defaults to same type). */
  splitInto?: string;
  /**
   * For text block types with a boolean state: the shared text renderer renders
   * an interactive checkbox marker bound to `data[field]`, and applies
   * `doneClassName` (default: strikethrough + muted) to the text content when the
   * field is truthy. Generic — the renderer never names a specific block type.
   */
  toggle?: { field: string; doneClassName?: string };
  /**
   * When "always", the editor shows the collapse chevron for this block type even
   * when it has no children yet (used by the toggle block). Omitted = the chevron
   * appears only when the block actually has children.
   */
  collapsible?: "always";
  /**
   * Enter-split behavior. By default a block splits into a sibling of the same
   * type. A block with this set instead nests the split-off content as its FIRST
   * CHILD *when it is currently expanded* (a collapsed block still splits into a
   * sibling). `childType` is the type created for that child. Generic — used by
   * the toggle block; the editor core never names a block type.
   */
  splitChildWhenExpanded?: { childType: string };
}

export function defineBlock<S extends AnyZodObject>(opts: {
  type: string;
  schema: S;
  label?: string;
  defaultText?: boolean;
  icon?: ComponentType<{ className?: string }>;
  aliases?: string[];
  empty?: () => z.infer<S>;
  markdownPrefixes?: string[];
  resetToOnBackspaceAtStart?: string;
  breakOutOnEmptyEnter?: string;
  marker?: string;
  ordinalMarker?: (ordinal: number) => string;
  placeholder?: string;
  textVariant?: BlockTextVariant;
  gutterFirstLineCenter?: string;
  splitInto?: string;
  toggle?: { field: string; doneClassName?: string };
  collapsible?: "always";
  splitChildWhenExpanded?: { childType: string };
}): BlockHandle<z.infer<S>> {
  return {
    type: opts.type,
    schema: opts.schema,
    // Computed once at definition: text-bearing-ness is a fact of the schema.
    acceptsText: "text" in opts.schema.shape,
    parse: (data) => opts.schema.parse(data),
    label: opts.label,
    defaultText: opts.defaultText,
    icon: opts.icon,
    aliases: opts.aliases,
    empty: opts.empty,
    markdownPrefixes: opts.markdownPrefixes,
    resetToOnBackspaceAtStart: opts.resetToOnBackspaceAtStart,
    breakOutOnEmptyEnter: opts.breakOutOnEmptyEnter,
    marker: opts.marker,
    ordinalMarker: opts.ordinalMarker,
    placeholder: opts.placeholder,
    textVariant: opts.textVariant,
    gutterFirstLineCenter: opts.gutterFirstLineCenter,
    splitInto: opts.splitInto,
    toggle: opts.toggle,
    collapsible: opts.collapsible,
    splitChildWhenExpanded: opts.splitChildWhenExpanded,
  };
}
