import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { Fragment, useState } from "react";
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

  if (editing) {
    return (
      <div
        onFocus={onFocus}
        onBlur={(e) => {
          // Only collapse back to display when focus leaves the whole editor —
          // not when moving between Lexical's internal nodes.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setEditing(false);
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
        />
      </div>
    );
  }

  return (
    <Text
      as="div"
      variant="body"
      className="group relative min-h-48 w-full cursor-text rounded-md border p-md"
      onClick={() => setEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") setEditing(true);
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
        className="absolute top-1 right-1 size-6 opacity-0 transition-opacity group-hover:opacity-100"
        title="Edit description"
        onClick={() => setEditing(true)}
      >
        <MdEdit className="size-3.5" />
      </Button>
    </Text>
  );
}

// Render the body as plain text + inline widgets (file-links, active-data
// chips), with attachment image refs replaced by inline thumbnails. We don't
// run a full markdown renderer here — task descriptions today are plain text
// with the occasional pasted image, so this lighter pass keeps the display
// fast and predictable.
function DescriptionDisplay({ text }: { text: string }) {
  const segments: Array<
    { kind: "text"; value: string } | { kind: "image"; id: string; alt: string }
  > = [];
  let lastIdx = 0;
  const re = new RegExp(ATTACHMENT_MARKDOWN_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = isAttachmentUrl(m[2]!);
    if (!id) continue;
    if (m.index > lastIdx) {
      segments.push({ kind: "text", value: text.slice(lastIdx, m.index) });
    }
    segments.push({ kind: "image", id, alt: m[1] ?? "" });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIdx) });
  }
  if (segments.length === 0) {
    segments.push({ kind: "text", value: text });
  }

  return (
    <p className="break-words whitespace-pre-wrap">
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <InlineText key={i} text={seg.value} />
        ) : (
          <Fragment key={i}>
            <AttachmentThumbnail attachmentId={seg.id} alt={seg.alt} />
          </Fragment>
        ),
      )}
    </p>
  );
}
