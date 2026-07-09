import { useMemo, type CSSProperties, type ReactNode } from "react";
import {
  MdImage,
  MdLink as MdLinkIcon,
  MdFunctions,
  MdBookmark,
  MdAudiotrack,
  MdVideocam,
  MdInsertDriveFile,
  MdWidgets,
  MdLightbulb,
} from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text, type TextVariant } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Inset, insetClass } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { CheckboxIndicator } from "@plugins/primitives/plugins/css/plugins/selection-indicator/web";
import { HighlightedCode } from "@plugins/primitives/plugins/syntax-highlight/web";
import { attachmentUrl } from "@plugins/primitives/plugins/text-editor/plugins/paste-images/web";
import {
  Editor,
  PageIcon,
  BLOCK_INDENT,
  BLOCK_INSET,
  MARKER_GUTTER,
} from "@plugins/page/plugins/editor/web";
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

/** Callout tint per semantic color — mirrors the callout block's COLOR_BG. */
const CALLOUT_BG: Record<string, string> = {
  default: "bg-muted",
  info: "bg-info/15",
  success: "bg-success/15",
  warning: "bg-warning/15",
  danger: "bg-destructive/15",
};
/** Callout icon color per semantic color — mirrors the callout block's COLOR_TEXT. */
const CALLOUT_TEXT: Record<string, string> = {
  default: "text-muted-foreground",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

/**
 * Renders one text-bearing block faithfully (text, headings, lists, to-do,
 * toggle, quote, callout): the structural chrome from handle metadata + the rich
 * text via RunsRenderer. Mirrors `BlockTextRenderer` + `BlockTextEditor`'s
 * marker-gutter layout. Two block types carry their own box chrome and are
 * matched by type here (the quote left-border, the callout tinted box) — the
 * editor renders them with the same dedicated wrappers.
 */
function TextLikeBlock({
  handle,
  data,
  children,
  ordinal,
}: {
  handle: BlockHandle<unknown>;
  data: Record<string, unknown>;
  /** Rendered children (nested blocks) of this block, already laid out. */
  children: ReactNode;
  /** 1-based position among same-type siblings (for ordinal markers). */
  ordinal: number;
}) {
  const checked = handle.toggle ? Boolean(data[handle.toggle.field]) : false;

  // The callout has its own leading-icon marker + tinted box.
  if (handle.type === "callout") {
    const color = typeof data.color === "string" ? data.color : "default";
    const iconNodes = Array.isArray(data.iconSvgNodes)
      ? (data.iconSvgNodes as Parameters<typeof PageIcon>[0]["nodes"])
      : null;
    return (
      <>
        <Inset x={BLOCK_INSET} y="xs">
          {/* eslint-disable-next-line radius/no-adhoc-radius -- rounded-md token matches the callout block chrome */}
          <div className={cn("rounded-md", CALLOUT_BG[color] ?? CALLOUT_BG.default)}>
            <Inset x={BLOCK_INSET} className="flex gap-xs">
              <div
                className={cn("flex flex-none select-none justify-center py-xs", CALLOUT_TEXT[color] ?? CALLOUT_TEXT.default)}
                style={{ minWidth: MARKER_GUTTER }}
              >
                <PageIcon nodes={iconNodes} fallback={MdLightbulb} className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <Text
                  as="div"
                  variant="body"
                  className={cn(insetClass({ r: BLOCK_INSET }), "py-xs whitespace-pre-wrap break-words")}
                >
                  <RunsRenderer value={data.text} />
                </Text>
              </div>
            </Inset>
          </div>
        </Inset>
        {children}
      </>
    );
  }

  let marker: ReactNode = null;
  if (handle.toggle) {
    // Seat the checkbox on the first text line: the gutter shares the text's
    // top `py-xs`, so the indicator top-aligns without a raw margin offset.
    marker = (
      <span className="py-xs">
        <CheckboxIndicator checked={checked} />
      </span>
    );
  } else if (handle.ordinalMarker) {
    marker = (
      <Text as="span" variant="body" tone="muted" aria-hidden className="tabular-nums py-xs">
        {handle.ordinalMarker(ordinal)}
      </Text>
    );
  } else if (handle.marker) {
    marker = (
      <Text as="span" variant="body" tone="muted" aria-hidden className="py-xs">
        {handle.marker}
      </Text>
    );
  }

  const doneClass =
    handle.toggle && checked
      ? (handle.toggle.doneClassName ?? "line-through text-muted-foreground")
      : undefined;

  const text = (
    <Inset l={BLOCK_INSET} className="flex gap-xs">
      {marker != null ? (
        <div
          className="flex flex-none select-none justify-center"
          style={{ minWidth: MARKER_GUTTER }}
        >
          {marker}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
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
      </div>
    </Inset>
  );

  // The quote block wraps the shared text in a left-border italic rail.
  if (handle.type === "quote") {
    return (
      <>
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- the quote rail's left border + italic chrome, mirroring the quote block */}
        <div className="border-muted-foreground/30 border-l-2 italic">{text}</div>
        {children}
      </>
    );
  }

  return (
    <>
      {text}
      {children}
    </>
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

/** Block types the shared text renderer can faithfully reproduce. */
function isTextLike(handle: BlockHandle<unknown> | undefined): handle is BlockHandle<unknown> {
  // Any block whose data carries `text` is text-bearing. The handle's text
  // metadata (marker/ordinalMarker/toggle/textVariant) is what we render from.
  return handle !== undefined;
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
  handles,
  diff,
}: {
  node: ReadOnlyNode;
  ordinal: number;
  handles: BlockHandle<unknown>[];
  diff?: Map<string, BlockDiffKind>;
}) {
  const handle = handles.find((h) => h.type === node.type);
  const data = asRecord(node.data);
  const kind = node.id ? diff?.get(node.id) : undefined;

  // Children always render expanded (read-only). Each child list restarts its
  // own ordinal counter, reset on type change (matches the editor's numbering).
  const children =
    node.children.length > 0 ? (
      // One depth of the editor's per-depth indent: the child forest's content
      // box starts `BLOCK_INDENT` right of this block's.
      <div style={{ paddingLeft: BLOCK_INDENT }}>
        <ForestView forest={node.children} handles={handles} diff={diff} />
      </div>
    ) : null;

  let body: ReactNode;
  if (MEDIA_TYPES.has(node.type)) {
    body = (
      <>
        <MediaBlock type={node.type} data={data} />
        {children}
      </>
    );
  } else if (isTextLike(handle) && hasText(data)) {
    body = (
      <TextLikeBlock handle={handle} data={data} ordinal={ordinal}>
        {children}
      </TextLikeBlock>
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

  return <DiffWrap kind={kind}>{body}</DiffWrap>;
}

function ForestView({
  forest,
  handles,
  diff,
}: {
  forest: ReadOnlyNode[];
  handles: BlockHandle<unknown>[];
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
          handles={handles}
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
 *    toggle, quote, callout) render fully faithfully — heading size, marker,
 *    checkbox, rich text.
 *  - Self-contained media (image, code-block, divider) render a faithful static
 *    equivalent.
 *  - Exotic blocks (embed, equation, bookmark, audio, video, file) render a clean
 *    labeled placeholder card — the documented fidelity gap.
 */
export function ReadOnlyBlocks({ forest, diff }: ReadOnlyBlocksProps) {
  const contributions = Editor.Block.useContributions();
  const handles = useMemo(
    () => contributions.map((c) => c.block as BlockHandle<unknown>),
    [contributions],
  );
  return <ForestView forest={forest} handles={handles} diff={diff} />;
}
