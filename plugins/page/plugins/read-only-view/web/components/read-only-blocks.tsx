import type { ComponentType, CSSProperties, ReactNode } from "react";
import {
  MdImage,
  MdLink as MdLinkIcon,
  MdFunctions,
  MdBookmark,
  MdAudiotrack,
  MdVideocam,
  MdInsertDriveFile,
  MdWidgets,
} from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Overlay } from "@plugins/primitives/plugins/css/plugins/overlay/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Text, type TextVariant } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Inset, insetClass } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { CheckboxIndicator } from "@plugins/primitives/plugins/css/plugins/selection-indicator/web";
import { HighlightedCode } from "@plugins/primitives/plugins/syntax-highlight/web";
import { attachmentUrl } from "@plugins/primitives/plugins/text-editor/plugins/paste-images/web";
import {
  Editor,
  PageIcon,
  TextBlockLayout,
  useBlockAnchors,
  useFramedBlockTypes,
  BLOCK_INDENT,
  BLOCK_INSET,
  type BlockAnchorProps,
} from "@plugins/page/plugins/editor/web";
import { PAGE_BLOCK_TYPE } from "@plugins/page/plugins/editor/core";
import type { BlockHandle, BlockTextVariant } from "@plugins/page/plugins/editor/core";
import { RunsRenderer } from "./runs-renderer";
import { PlaceholderCard } from "./placeholder-card";
import type { BlockDiffKind, ReadOnlyNode } from "../node";

/**
 * `BlockTextVariant` is a superset of `TextVariant` only in name; the values are
 * identical strings. The cast is safe and keeps the mapping a no-op rather than a
 * hand-written switch.
 */
function asTextVariant(v: BlockTextVariant | undefined): TextVariant {
  return (v ?? "body") as TextVariant;
}

/**
 * One `Editor.Block` contribution as the slot's READ hook hands it over: its
 * `component` is sealed (wrapped in the framework's middleware chain), so this
 * is derived from the hook rather than named as the editor's own
 * `BlockContribution` — which types what a plugin WRITES.
 */
type BlockEntry = ReturnType<typeof Editor.Block.useContributions>[number];

/** A record-view of a block's `data`. */
function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

// ---------------------------------------------------------------------------
// Diff styling — semantic tokens only.
// ---------------------------------------------------------------------------

/**
 * Subtle, tasteful per-block diff treatment built from semantic tokens (no raw
 * colors): a left accent rail + faint tint, matching the version-history plan.
 *  - added    → success-tinted rail + bg
 *  - removed  → muted rail + faded, struck-through (still rendered inline)
 *  - modified → primary accent rail
 */
const DIFF_CLASS: Record<BlockDiffKind, string> = {
  added: "border-l-2 border-success bg-success/10",
  removed: "border-l-2 border-muted-foreground/40 bg-muted/40 opacity-60 line-through",
  modified: "border-l-2 border-primary bg-primary/5",
};

function DiffWrap({ kind, children }: { kind?: BlockDiffKind; children: ReactNode }) {
  if (!kind) return <>{children}</>;
  return (
    // eslint-disable-next-line radius/no-adhoc-radius -- rounded-sm is the token-driven small radius for the diff rail wrapper
    <div className={cn("rounded-sm", DIFF_CLASS[kind])}>{children}</div>
  );
}

// ---------------------------------------------------------------------------
// Block content renderers
// ---------------------------------------------------------------------------

/**
 * Renders one text-bearing block faithfully (text, headings, lists, to-do,
 * toggle, quote, prompt): the SAME `TextBlockLayout` skeleton the editable
 * surface uses, styled by the SAME per-type `chrome` off the block's
 * `Editor.Block` contribution — only the leaf differs (`RunsRenderer` instead of
 * the Lexical editor). It therefore names zero block types: the quote's border
 * and the prompt's raised box arrive as chrome, not as a branch here.
 *
 * The region props carry `pageId: null` (a snapshot is detached from any page),
 * `isFocused: false`, and — load-bearing — **no `editor`**: that absence IS the
 * read-only signal, and a region is expected to degrade to a static rendering or
 * render nothing rather than paint a control whose click no-ops.
 */
function TextLikeBlock({
  node,
  contribution,
  data,
  ordinal,
}: {
  node: ReadOnlyNode;
  contribution: BlockEntry;
  data: Record<string, unknown>;
  /** 1-based position among same-type siblings (for ordinal markers). */
  ordinal: number;
}) {
  const handle = contribution.block;
  const checked = handle.toggle ? Boolean(data[handle.toggle.field]) : false;

  let fallbackMarker: ReactNode = null;
  if (handle.toggle) {
    // Seat the checkbox on the first text line: the gutter shares the text's
    // top `py-xs`, so the indicator top-aligns without a raw margin offset.
    fallbackMarker = (
      <span className="py-xs">
        <CheckboxIndicator checked={checked} />
      </span>
    );
  } else if (handle.ordinalMarker) {
    fallbackMarker = (
      <Text as="span" variant="body" tone="muted" aria-hidden className="tabular-nums py-xs">
        {handle.ordinalMarker(ordinal)}
      </Text>
    );
  } else if (handle.marker) {
    fallbackMarker = (
      <Text as="span" variant="body" tone="muted" aria-hidden className="py-xs">
        {handle.marker}
      </Text>
    );
  }

  const doneClass =
    handle.toggle && checked
      ? (handle.toggle.doneClassName ?? "line-through text-muted-foreground")
      : undefined;

  return (
    <TextBlockLayout
      chrome={contribution.chrome}
      region={{
        // A read-only node may legitimately carry no id at all.
        id: node.id ?? "",
        type: node.type,
        pageId: null,
        data: node.data,
        isFocused: false,
        ordinal,
      }}
      fallbackMarker={fallbackMarker}
    >
      <Text
        as="div"
        variant={asTextVariant(handle.textVariant)}
        className={cn(
          insetClass({ r: BLOCK_INSET }),
          "py-xs whitespace-pre-wrap break-words",
          doneClass,
        )}
      >
        <RunsRenderer value={data.text} />
      </Text>
    </TextBlockLayout>
  );
}

/** Faithful media / structural blocks that don't need the editor API. */
function MediaBlock({
  type,
  data,
}: {
  type: string;
  data: Record<string, unknown>;
}): ReactNode {
  if (type === "divider") {
    return (
      <Inset x={BLOCK_INSET} y="sm">
        <hr className="border-border border-t" />
      </Inset>
    );
  }

  if (type === "code-block") {
    const code = typeof data.code === "string" ? data.code : "";
    const lang = typeof data.language === "string" ? data.language : null;
    return (
      <Inset x={BLOCK_INSET} y="xs">
        <HighlightedCode code={code} lang={lang} />
      </Inset>
    );
  }

  if (type === "image") {
    const attachmentId = typeof data.attachmentId === "string" ? data.attachmentId : null;
    const alt = typeof data.alt === "string" ? data.alt : "";
    const width = typeof data.width === "number" ? data.width : undefined;
    if (!attachmentId) {
      return <PlaceholderCard label="Image" icon={MdImage} caption="No image" />;
    }
    const style: CSSProperties = { width: width ? `${width}px` : undefined, maxWidth: "100%" };
    return (
      <Inset x={BLOCK_INSET} y="xs">
        <div className="inline-block max-w-full" style={style}>
          {/* eslint-disable-next-line radius/no-adhoc-radius -- rounded-md token matches the editor's image chrome */}
          <img src={attachmentUrl(attachmentId)} alt={alt} className="block w-full rounded-md" />
        </div>
      </Inset>
    );
  }

  return null;
}

/**
 * A sub-page rendered inert: icon + title, no navigation. Sub-pages are members
 * of a page's content forest (one ordering space), so a read-only render — the
 * public blog site, a version-history preview — sees them and must show
 * something honest rather than an "Unknown block: page" placeholder card. The
 * chip is deliberately not a link: a read-only surface has no page router, and
 * the target may not even be published.
 */
function SubPageChip({ data }: { data: Record<string, unknown> }) {
  const iconNodes = Array.isArray(data.iconSvgNodes)
    ? (data.iconSvgNodes as Parameters<typeof PageIcon>[0]["nodes"])
    : null;
  const title = typeof data.title === "string" && data.title ? data.title : "Untitled";
  return (
    <Inset x="md" y="xs">
      <Inline gap="xs">
        <PageIcon nodes={iconNodes} className="text-muted-foreground size-4" />
        <Text className="font-medium">{title}</Text>
      </Inline>
    </Inset>
  );
}

/** Exotic blocks → labeled placeholder card (documented fidelity gap). */
const PLACEHOLDER_ICONS: Record<string, typeof MdWidgets> = {
  embed: MdLinkIcon,
  equation: MdFunctions,
  bookmark: MdBookmark,
  audio: MdAudiotrack,
  video: MdVideocam,
  file: MdInsertDriveFile,
  "page-link": MdLinkIcon,
};

function captionFor(type: string, data: Record<string, unknown>): string | undefined {
  if (typeof data.filename === "string") return data.filename;
  if (type === "embed" && typeof data.url === "string") return data.url;
  if (type === "bookmark" && typeof data.title === "string") return data.title;
  if (type === "equation" && typeof data.expression === "string") return data.expression;
  return undefined;
}

const MEDIA_TYPES = new Set(["divider", "code-block", "image"]);

/** Blocks the shared text layout can faithfully reproduce. */
function isTextLike(c: BlockEntry | undefined): c is BlockEntry {
  // Any block whose data carries `text` is text-bearing. The contribution's
  // handle metadata (marker/ordinalMarker/toggle/textVariant) and its `chrome`
  // are what we render from.
  return c !== undefined;
}

// ---------------------------------------------------------------------------
// Forest renderer
// ---------------------------------------------------------------------------

export interface ReadOnlyBlocksProps {
  /**
   * The block forest to render. A plain `SerializedBlock[]` is assignable here
   * (the extra `id` is optional); pass ids when diff highlighting is wanted.
   */
  forest: ReadOnlyNode[];
  /** Optional per-block diff tags, keyed by `ReadOnlyNode.id`. */
  diff?: Map<string, BlockDiffKind>;
}

/** Whether a block's `data` carries a rich-text `text` field. */
function hasText(data: Record<string, unknown>): boolean {
  return "text" in data;
}

function NodeView({
  node,
  ordinal,
  contributions,
  framedTypes,
  anchors,
  diff,
}: {
  node: ReadOnlyNode;
  ordinal: number;
  /**
   * The live `Editor.Block` contributions — kept whole rather than mapped down
   * to handles, because a text-bearing type's presentation (`chrome`) rides on
   * the contribution, not the handle.
   */
  contributions: BlockEntry[];
  /** Container block types, derived from the live `Editor.BlockFrame` registry. */
  framedTypes: ReadonlySet<string>;
  /** Container-anchor decorations, from the same `Editor.BlockFrame` registry. */
  anchors: ReadonlyMap<string, ComponentType<BlockAnchorProps>>;
  diff?: Map<string, BlockDiffKind>;
}) {
  const contribution = contributions.find((c) => c.block.type === node.type);
  const handle: BlockHandle<unknown> | undefined = contribution?.block;
  const data = asRecord(node.data);
  const kind = node.id ? diff?.get(node.id) : undefined;

  // Children always render expanded (read-only). Each child list restarts its
  // own ordinal counter, reset on type change (matches the editor's numbering).
  const children =
    node.children.length > 0 ? (
      // One depth of the editor's per-depth indent: the child forest's content
      // box starts `BLOCK_INDENT` right of this block's.
      <div style={{ paddingLeft: BLOCK_INDENT }}>
        <ForestView
          forest={node.children}
          contributions={contributions}
          framedTypes={framedTypes}
          anchors={anchors}
          diff={diff}
        />
      </div>
    ) : null;

  let body: ReactNode;
  if (node.type === PAGE_BLOCK_TYPE) {
    // Must precede the generic fallback: a sub-page's handle carries no `label`
    // and its data has no `text`, so it would otherwise land on the placeholder
    // card and leak "Unknown block: page" onto every read-only surface.
    body = (
      <>
        <SubPageChip data={data} />
        {children}
      </>
    );
  } else if (MEDIA_TYPES.has(node.type)) {
    body = (
      <>
        <MediaBlock type={node.type} data={data} />
        {children}
      </>
    );
  } else if (handle?.anchor === true) {
    // A container ANCHOR (the callout) renders NO line of its own: its content IS
    // its children, and all it paints is a decoration in the indent gutter left
    // of the first child. Must precede the text-like arm — an anchor's `data`
    // carries no `text`, so it would otherwise land on the "Unknown block"
    // placeholder card, exactly the trap `PAGE_BLOCK_TYPE` above documents.
    //
    // Generic, by design: this branch names no block type. The decoration comes
    // from the same `Editor.BlockFrame` registration that paints the box, so a
    // second container type needs zero changes here.
    //
    // The geometry falls out on this surface. There is no hover rail (`inset: 0`)
    // and children are already indented by one `BLOCK_INDENT`, so a zero-height
    // `relative` wrapper with the decoration pinned at its left edge puts the
    // glyph in exactly the column the editor puts it in — with none of the
    // control-collision the editable surface has to resolve.
    const Anchor = anchors.get(node.type);
    body = (
      <>
        {/* Zero height: an absolutely-pinned child contributes none, so the
            decoration and the first child share one visual line. */}
        <div className="relative">
          {Anchor ? (
            <Pin to="top-left" className="py-xs" style={{ width: BLOCK_INDENT }}>
              {/* Appearance and nothing else. An anchor's structural actions live
                  on the rail of the line the container borrows, which this
                  surface has none of — and it carries no id here either, since a
                  read-only node may legitimately have none. Omitting `editor` is
                  the read-only signal: the contribution degrades to a static
                  glyph rather than rendering a dead control. */}
              {/* eslint-disable-next-line react-hooks/static-components -- not a component CREATED during render: `Anchor` is a registry LOOKUP into the memoized `useBlockAnchors()` map, whose values are module-level slot contributions. Its identity is stable across renders, so no state can reset. */}
              <Anchor type={node.type} data={node.data} />
            </Pin>
          ) : null}
        </div>
        {children ?? (
          // Read-only children always render expanded, so `children` is null only
          // when the container is genuinely childless — and then both the row and
          // its frame would be zero height, i.e. an invisible box. One empty body
          // line is the same fallback the editor's anchored row renders. The
          // space below is a NON-BREAKING one: a lone collapsible space would
          // leave the div zero height, which is the very thing this fixes.
          <Inset l={BLOCK_INSET}>
            <Text as="div" variant="body" className="py-xs">
              {" "}
            </Text>
          </Inset>
        )}
      </>
    );
  } else if (isTextLike(contribution) && hasText(data)) {
    body = (
      <>
        <TextLikeBlock
          node={node}
          contribution={contribution}
          data={data}
          ordinal={ordinal}
        />
        {children}
      </>
    );
  } else {
    // Exotic / editor-API-only block → labeled placeholder card.
    const label = handle?.label ?? node.type;
    body = (
      <>
        <PlaceholderCard
          label={label}
          caption={captionFor(node.type, data)}
          icon={PLACEHOLDER_ICONS[node.type] ?? MdWidgets}
        />
        {children}
      </>
    );
  }

  // A container block type paints a frame over its own line AND its subtree.
  // The frame takes no children (it is a backdrop, never a wrapper — see
  // `BlockFrameProps`), so this surface positions it as a full-bleed layer
  // behind the node's content. `inset` is 0: there is no hover rail here, so
  // the content edge `C` is simply the renderer's left edge.
  //
  // `blockId` is passed through as-is and is `undefined` whenever the node is a
  // detached snapshot (a version-history preview, the public site) — that is the
  // documented degradation, not a gap: a frame reading a side table keyed by
  // block id falls back to its static appearance there.
  const framed = framedTypes.has(node.type) ? (
    <Overlay
      behind={
        <Editor.BlockFrame.Dispatch
          type={node.type}
          data={node.data}
          blockId={node.id}
          inset={0}
        />
      }
    >
      {body}
    </Overlay>
  ) : (
    body
  );

  return <DiffWrap kind={kind}>{framed}</DiffWrap>;
}

function ForestView({
  forest,
  contributions,
  framedTypes,
  anchors,
  diff,
}: {
  forest: ReadOnlyNode[];
  contributions: BlockEntry[];
  framedTypes: ReadonlySet<string>;
  anchors: ReadonlyMap<string, ComponentType<BlockAnchorProps>>;
  diff?: Map<string, BlockDiffKind>;
}) {
  const ordinals: number[] = [];
  let prev: string | null = null;
  let n = 0;
  for (const node of forest) {
    n = node.type === prev ? n + 1 : 1;
    prev = node.type;
    ordinals.push(n);
  }
  return (
    <>
      {forest.map((node, i) => (
        <NodeView
          key={node.id ?? i}
          node={node}
          ordinal={ordinals[i] ?? 1}
          contributions={contributions}
          framedTypes={framedTypes}
          anchors={anchors}
          diff={diff}
        />
      ))}
    </>
  );
}

/**
 * Faithful, non-editable renderer for a block forest, with optional per-block
 * diff highlighting. Dispatches on `block.type` using the live `Editor.Block`
 * handle metadata (no Lexical, no editor providers).
 *
 * Fidelity:
 *  - Text-bearing blocks (text, heading-1/2/3, bulleted/numbered list, to-do,
 *    toggle, quote) render fully faithfully — heading size, marker, checkbox,
 *    rich text.
 *  - Container blocks render through the SAME `Editor.BlockFrame` contribution
 *    the editor uses: the box as a full-bleed backdrop, and — for a void
 *    container ANCHOR (the callout) — its decoration pinned in the gutter left of
 *    its first child. No block type is named here.
 *  - Self-contained media (image, code-block, divider) render a faithful static
 *    equivalent, and sub-pages render as an inert icon+title chip.
 *  - Exotic blocks (embed, equation, bookmark, audio, video, file) render a clean
 *    labeled placeholder card — the documented fidelity gap.
 */
export function ReadOnlyBlocks({ forest, diff }: ReadOnlyBlocksProps) {
  // The contributions are kept WHOLE (not mapped down to handles): a
  // text-bearing type's presentation — the quote's border, the prompt's raised
  // box and its regions — lives on the contribution's `chrome`, and this surface
  // renders it through the same `TextBlockLayout` the editor uses.
  const contributions = Editor.Block.useContributions();
  const framedTypes = useFramedBlockTypes();
  const anchors = useBlockAnchors();
  return (
    <ForestView
      forest={forest}
      contributions={contributions}
      framedTypes={framedTypes}
      anchors={anchors}
      diff={diff}
    />
  );
}
