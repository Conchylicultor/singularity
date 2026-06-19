import { useState, type ReactNode } from "react";
import {
  $getNodeByKey,
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { KatexMath } from "@plugins/page/plugins/math/plugins/render/web";

// Bare-string mono metric for the LaTeX-source field. Kept as a standalone const
// (not inlined into a cn(...) class context) so the typography rule treats it as
// the sanctioned out-of-scope mono/code metric rather than an ad-hoc size.
const MONO_FIELD = "font-mono text-xs leading-5";

type SerializedInlineMathNode = {
  type: "inline-math";
  version: 1;
  expression: string;
};

/**
 * An inline, non-editable-in-place LaTeX expression rendered with KaTeX. Lives
 * inside a text block's Lexical tree; persists as a `\(<latex>\)` token in the
 * block's text (see core's token helpers). Its own `getTextContent()` stays empty
 * so the token never leaks into live root-text reads (slash menu, the `$$` query
 * scan) — serialization happens via the extension's `serializeNode`.
 *
 * Clicking the rendered math opens a popover with a LaTeX source field + live
 * preview; edits update the node by key via the Lexical editor.
 */
export class InlineMathNode extends DecoratorNode<ReactNode> {
  __expression: string;

  static getType(): string {
    return "inline-math";
  }

  static clone(node: InlineMathNode): InlineMathNode {
    return new InlineMathNode(node.__expression, node.__key);
  }

  constructor(expression: string, key?: NodeKey) {
    super(key);
    this.__expression = expression;
  }

  static importJSON(json: SerializedInlineMathNode): InlineMathNode {
    return new InlineMathNode(json.expression);
  }

  exportJSON(): SerializedInlineMathNode {
    return { type: "inline-math", version: 1, expression: this.__expression };
  }

  isInline(): true {
    return true;
  }

  // Keep the token out of root-text reads — serialization is via the extension.
  getTextContent(): "" {
    return "";
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "inline-flex align-baseline";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  getExpression(): string {
    return this.__expression;
  }

  setExpression(expression: string): void {
    const writable = this.getWritable();
    writable.__expression = expression;
  }

  decorate(): ReactNode {
    return <InlineMathView nodeKey={this.__key} expression={this.__expression} />;
  }
}

function InlineMathView({
  nodeKey,
  expression,
}: {
  nodeKey: NodeKey;
  expression: string;
}) {
  const [lexicalEditor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(expression);

  function commit(value: string) {
    setDraft(value);
    lexicalEditor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isInlineMathNode(node)) node.setExpression(value);
    });
  }

  return (
    <InlinePopover
      open={open}
      onOpenChange={(next) => {
        setDraft(expression);
        setOpen(next);
      }}
      contentClassName="w-72 p-sm"
      trigger={
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "cursor-pointer rounded-sm px-xs",
            "hover:bg-muted",
            open && "bg-muted",
          )}
        >
          <KatexMath expression={expression} display={false} />
        </span>
      }
    >
      <Stack gap="sm">
        <Center className="min-h-6">
          {draft === "" ? (
            <Text variant="caption" tone="muted">
              Empty
            </Text>
          ) : (
            <KatexMath expression={draft} display={false} />
          )}
        </Center>
        <textarea
          value={draft}
          autoFocus
          onChange={(e) => commit(e.target.value)}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          placeholder="LaTeX… e.g. E = mc^2"
          className={cn(
            "border-border w-full resize-none rounded-sm border bg-transparent p-sm",
            "caret-foreground outline-none placeholder:text-muted-foreground",
            MONO_FIELD,
          )}
          rows={2}
        />
      </Stack>
    </InlinePopover>
  );
}

export function $createInlineMathNode(expression: string): InlineMathNode {
  return new InlineMathNode(expression);
}

export function $isInlineMathNode(
  node: LexicalNode | null | undefined,
): node is InlineMathNode {
  return node instanceof InlineMathNode;
}
