import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";
import { FilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/file-path/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

interface InstructionFile {
  path?: string;
  /** The harness's own word for where the file came from — "Project" for a repo
   *  CLAUDE.md. Shown as-is; it is a label, not a closed set of ours. */
  type?: string;
  content?: string;
}

interface InstructionsPayload {
  type: "instructions";
  files?: InstructionFile[];
}

/**
 * The instruction files (CLAUDE.md) the harness loaded at launch. The sibling
 * `nested-memory` renderer is the same idea for ONE file picked up mid-session,
 * and this is its opening-of-the-session plural twin — same card, same
 * `FilePath`, same capped pre-wrapped body — so the two read as one family
 * rather than as two unrelated rows.
 *
 * Collapsed by default: the content is long and standing, so the collapsed line
 * answers "which files, how many" and the body waits for a reader who asks.
 */
export function InstructionsView({ event }: AttachmentRendererProps) {
  const payload = event.attachment as InstructionsPayload;
  const files = payload.files ?? [];
  if (files.length === 0) {
    throw new Error("instructions attachment carries no `files`");
  }

  // With a single file the path belongs on the collapsed line, where it
  // identifies the row; the body then never repeats it.
  const asidePath = files.length === 1 ? files[0]?.path : undefined;

  return (
    <CollapsibleCard
      label="Project instructions"
      note={`· ${files.length} file${files.length === 1 ? "" : "s"}`}
      aside={asidePath ? <FilePath filePath={asidePath} /> : undefined}
    >
      <Stack gap="sm">
        {files.map((file, index) => (
          <Stack key={file.path ?? index} gap="2xs">
            <Stack direction="row" gap="xs" align="baseline">
              {!asidePath && file.path && <FilePath filePath={file.path} />}
              {file.type && (
                <Text
                  as="span"
                  variant="caption"
                  className="text-muted-foreground/60"
                >
                  {file.type}
                </Text>
              )}
            </Stack>
            {file.content ? (
              <Scroll className="max-h-64">
                <Text
                  as="pre"
                  variant="caption"
                  className="whitespace-pre-wrap break-words font-mono text-muted-foreground"
                >
                  {file.content}
                </Text>
              </Scroll>
            ) : (
              <Text
                as="p"
                variant="caption"
                className="text-muted-foreground/60 italic"
              >
                Empty file.
              </Text>
            )}
          </Stack>
        ))}
      </Stack>
    </CollapsibleCard>
  );
}
