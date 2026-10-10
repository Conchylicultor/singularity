import { useCallback, useEffect, useRef, useState } from "react";
import { useResizeObserver } from "@plugins/primitives/plugins/dom/plugins/element-size/web";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  type LexicalEditor,
} from "lexical";
import { goMarkerWebNode } from "./marker-node";

// Painted onto the editor's own DOM — classes and the root's background, never
// nodes — so the draft's text, and therefore what is sent, is untouched.
const INLINE_CLASSES = ["bg-primary/10", "text-primary-text", "rounded-sm"];
const BLOCK_TEXT_CLASSES = ["text-primary-text"];

interface Region {
  open: string;
  close: string;
  /** Keys of everything between the markers. */
  inner: string[];
  /** Spans lines (paragraphs, or line breaks inside one): drawn as a box. */
  block: boolean;
}

interface Scan {
  regions: Region[];
  /** Markers with no partner (the user deleted the other edge). */
  orphans: string[];
}

function $scan(): Scan {
  const out: Scan = { regions: [], orphans: [] };
  let open: (Omit<Region, "close"> & { para: number }) | null = null;
  $getRoot()
    .getChildren()
    .forEach((para, p) => {
      if (!$isElementNode(para)) return;
      if (open && open.para !== p) open.block = true;
      for (const child of para.getChildren()) {
        const token = goMarkerWebNode.is(child)
          ? goMarkerWebNode.token(child)
          : null;
        if (token === "<go>") {
          if (open) out.orphans.push(open.open);
          open = { open: child.getKey(), inner: [], block: false, para: p };
        } else if (token === "</go>") {
          if (!open) out.orphans.push(child.getKey());
          else
            out.regions.push({
              open: open.open,
              close: child.getKey(),
              inner: open.inner,
              block: open.block,
            });
          open = null;
        } else if (open) {
          if ($isLineBreakNode(child)) open.block = true;
          open.inner.push(child.getKey());
        }
      }
    });
  if (open) out.orphans.push((open as { open: string }).open);
  return out;
}

/** A rounded tint as a background layer: `color` is the theme's primary. */
function boxLayer(color: string, w: number, h: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" rx="6" fill="${color}" fill-opacity="0.1"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * The boxes of the block regions, as background layers on the editor root —
 * the root scrolls its own content and Lexical owns its children, so a box
 * cannot be an element in it. `background-attachment: local` makes the layers
 * scroll with the text.
 */
function paintBoxes(editor: LexicalEditor, regions: Region[]) {
  const root = editor.getRootElement();
  if (!root) return;
  const style = getComputedStyle(root);
  const color = style.getPropertyValue("--primary").trim() || "currentColor";
  const rootRect = root.getBoundingClientRect();
  const padL = parseFloat(style.paddingLeft);
  const padR = parseFloat(style.paddingRight);
  const layers: string[] = [];
  const positions: string[] = [];
  for (const region of regions) {
    if (!region.block) continue;
    const a = editor.getElementByKey(region.open);
    const b = editor.getElementByKey(region.close);
    if (!a || !b) continue;
    const range = document.createRange();
    range.setStartBefore(a);
    range.setEndAfter(b);
    const rect = range.getBoundingClientRect();
    const x = Math.max(0, padL - 6);
    const y = rect.top - rootRect.top + root.scrollTop - 3;
    const w = root.clientWidth - x - Math.max(0, padR - 6);
    const h = rect.height + 6;
    layers.push(boxLayer(color, w, h));
    positions.push(`${x}px ${y}px`);
  }
  root.style.backgroundImage = layers.join(", ");
  root.style.backgroundPosition = positions.join(", ");
  root.style.backgroundRepeat = "no-repeat";
  root.style.backgroundAttachment = "local";
}

/**
 * Paints each `<go>` region of a draft — the text between its two marker
 * tokens — in the suggestion highlight: a one-line region tinted in the line,
 * a multi-line one as a box. A marker whose partner was deleted turns back into
 * its literal text, so deleting the GO tab ends the region rather than leaving
 * an invisible `</go>` behind.
 */
export function GoRegionPlugin() {
  const [editor] = useLexicalComposerContext();
  const regions = useRef<Region[]>([]);
  const marked = useRef<Array<[HTMLElement, string[]]>>([]);
  const [root, setRoot] = useState<HTMLElement | null>(null);

  const repaint = useCallback(() => {
    for (const [el, classes] of marked.current) el.classList.remove(...classes);
    marked.current = [];
    for (const region of regions.current) {
      const classes = region.block ? BLOCK_TEXT_CLASSES : INLINE_CLASSES;
      for (const key of region.inner) {
        const el = editor.getElementByKey(key);
        if (!el) continue;
        el.classList.add(...classes);
        marked.current.push([el, classes]);
      }
    }
    paintBoxes(editor, regions.current);
  }, [editor]);

  useEffect(() => editor.registerRootListener(setRoot), [editor]);

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        const scan = editorState.read($scan);
        if (scan.orphans.length > 0) {
          editor.update(() => {
            for (const key of scan.orphans) {
              const node = $getNodeByKey(key);
              const token = node ? goMarkerWebNode.token(node) : null;
              if (node && token !== null) node.replace($createTextNode(token));
            }
          });
          return;
        }
        regions.current = scan.regions;
        repaint();
      }),
    [editor, repaint],
  );

  // A width change rewraps the lines under a box.
  useResizeObserver(() => root, repaint, { deps: [root] });

  return null;
}
