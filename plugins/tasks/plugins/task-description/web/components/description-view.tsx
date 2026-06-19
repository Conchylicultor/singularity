import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { hoverRevealGroup, hoverRevealTarget } from "@plugins/primitives/plugins/hover-reveal/web";
import { useRef, useState } from "react";
import { MdEdit } from "react-icons/md";
import { TextEditor } from "@plugins/primitives/plugins/text-editor/web";
import {
  AttachmentThumbnail,
  ATTACHMENT_MARKDOWN_RE,
  isAttachmentUrl,
} from "@plugins/primitives/plugins/text-editor/plugins/paste-images/web";
import { InlineText } from "@plugins/primitives/plugins/inline-text/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

// Two-mode description editor:
//   - Display: text rendered with inline widgets via <InlineText> (file-path
//     links routed to file-peek, active-data chips for conv/task/ui-context
//     refs) and image refs rendered as inline thumbnails.
//   - Edit: Lexical-based PromptEditor with paste-image support.
// Click anywhere on the display to edit; blur returns to display.
export function DescriptionView({
  value,
  onChange,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  // Selection (raw-string char range) captured from a display-mode drag, handed
  // to the editor so it opens with that span already selected.
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

  const enterEdit = (selection: { start: number; end: number } | null) => {
    pendingSelectionRef.current = selection;
    setEditing(true);
  };

  if (editing) {
    return (
      <div
        onFocus={onFocus}
        onBlur={(e) => {
          // Only collapse back to display when focus leaves the whole editor —
          // not when moving between Lexical's internal nodes.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setEditing(false);
          pendingSelectionRef.current = null;
          onBlur?.();
        }}
      >
        <TextEditor
          value={value}
          onChange={onChange}
          placeholder="Add a description…"
          autoFocus
          minRows={8}
          namespace="task-description"
          initialSelection={pendingSelectionRef.current}
        />
      </div>
    );
  }

  return (
    <Text
      as="div"
      variant="body"
      className={cn(hoverRevealGroup, "relative min-h-48 w-full cursor-text rounded-md border p-md")}
      // Enter edit on mouse-up so a drag-select (which suppresses `click`) still
      // switches to edit mode — carrying the selected range into the editor so
      // the user can immediately replace it. A plain click resolves to null and
      // just opens the editor with the caret.
      onMouseUp={(e) => enterEdit(domSelectionToValueRange(e.currentTarget))}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") enterEdit(null);
      }}
    >
      {value ? (
        <DescriptionDisplay text={value} />
      ) : (
        <span className="text-muted-foreground">Add a description…</span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className={cn(hoverRevealTarget, "absolute top-1 right-1 size-6")}
        title="Edit description"
        onClick={() => enterEdit(null)}
      >
        <MdEdit className="size-3.5" />
      </Button>
    </Text>
  );
}

// Map the current window selection (if any non-collapsed range fully inside the
// display container) to a character range in the raw description string. Each
// rendered segment carries its raw start offset via `data-vstart`, so we resolve
// a DOM point by measuring text from its segment's start and adding that base —
// keeping offsets aligned with the source even across inline image thumbnails.
function domSelectionToValueRange(
  container: HTMLElement,
): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const { anchorNode, anchorOffset, focusNode, focusOffset } = sel;
  if (!anchorNode || !focusNode) return null;
  if (!container.contains(anchorNode) || !container.contains(focusNode)) return null;
  const a = resolveRawOffset(container, anchorNode, anchorOffset);
  const b = resolveRawOffset(container, focusNode, focusOffset);
  if (a === null || b === null || a === b) return null;
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

function resolveRawOffset(
  container: HTMLElement,
  node: Node,
  offset: number,
): number | null {
  const el =
    node.nodeType === Node.TEXT_NODE
      ? node.parentElement
      : (node as Element);
  const seg = el?.closest<HTMLElement>("[data-vstart]");
  if (!seg || !container.contains(seg)) return null;
  const base = Number(seg.dataset.vstart);
  if (Number.isNaN(base)) return null;
  const range = document.createRange();
  range.setStart(seg, 0);
  range.setEnd(node, offset);
  return base + range.toString().length;
}

// Render the body as plain text + inline widgets (file-links, active-data
// chips), with attachment image refs replaced by inline thumbnails. We don't
// run a full markdown renderer here — task descriptions today are plain text
// with the occasional pasted image, so this lighter pass keeps the display
// fast and predictable.
function DescriptionDisplay({ text }: { text: string }) {
  const segments: Array<
    | { kind: "text"; value: string; start: number }
    | { kind: "image"; id: string; alt: string; start: number }
  > = [];
  let lastIdx = 0;
  const re = new RegExp(ATTACHMENT_MARKDOWN_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = isAttachmentUrl(m[2]!);
    if (!id) continue;
    if (m.index > lastIdx) {
      segments.push({ kind: "text", value: text.slice(lastIdx, m.index), start: lastIdx });
    }
    segments.push({ kind: "image", id, alt: m[1] ?? "", start: m.index });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIdx), start: lastIdx });
  }
  if (segments.length === 0) {
    segments.push({ kind: "text", value: text, start: 0 });
  }

  // Each segment span carries its raw start offset (`data-vstart`) so a display
  // drag-selection can be mapped back to source character offsets.
  return (
    <p className="break-words whitespace-pre-wrap">
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <span key={i} data-vstart={seg.start}>
            <InlineText text={seg.value} />
          </span>
        ) : (
          <span key={i} data-vstart={seg.start}>
            <AttachmentThumbnail attachmentId={seg.id} alt={seg.alt} />
          </span>
        ),
      )}
    </p>
  );
}
