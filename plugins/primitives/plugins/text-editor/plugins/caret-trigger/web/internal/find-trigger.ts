import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type EditorState,
  type TextNode,
} from "lexical";
import { scanTrigger } from "./scan-trigger";
import type { Trigger } from "./trigger-state";

/** Context handed to `canOpen`, so a host can gate on node position or text. */
export interface CanOpenCtx {
  node: TextNode;
  triggerIndex: number;
  textBeforeCaret: string;
}

export interface FindTriggerOpts {
  trigger: string;
  canOpen?: (ctx: CanOpenCtx) => boolean;
  isQueryValid?: (query: string) => boolean;
}

/**
 * A thin Lexical `.read()` wrapper over `scanTrigger`. Collapses EVERY bail-out
 * — no selection, non-collapsed, not a text node, no trigger, `canOpen` fail,
 * invalid query — into a single `null`. That is the whole point: the empty
 * block (whose anchor is a ParagraphNode, not a TextNode) is no longer a special
 * branch that must remember to reset a latch — it is simply "no trigger".
 */
export function findTrigger(editorState: EditorState, opts: FindTriggerOpts): Trigger | null {
  return editorState.read(() => {
    const sel = $getSelection();
    if (!$isRangeSelection(sel) || !sel.isCollapsed()) return null;
    const node = sel.anchor.getNode();
    if (!$isTextNode(node)) return null;
    const textBeforeCaret = node.getTextContent().slice(0, sel.anchor.offset);
    const scan = scanTrigger(textBeforeCaret, opts.trigger);
    if (!scan) return null;
    const { triggerIndex, query } = scan;
    if (opts.canOpen && !opts.canOpen({ node, triggerIndex, textBeforeCaret })) return null;
    if (opts.isQueryValid && !opts.isQueryValid(query)) return null;
    return { nodeKey: node.getKey(), triggerIndex, query };
  });
}
