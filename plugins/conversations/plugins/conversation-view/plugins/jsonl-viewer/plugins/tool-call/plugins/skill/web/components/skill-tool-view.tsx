import { MdOutlineDescription } from "react-icons/md";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { LinkChip } from "@plugins/primitives/plugins/link-chip/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";

type SkillInput = { skill: string; args?: string };

export function SkillToolView({ event }: ToolRendererProps) {
  const input = event.input as SkillInput;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; input is `as`-cast from unknown
  const skillName = input.skill ?? "";
  const args = typeof input.args === "string" ? input.args : "";
  const injected = event.injectedContext ?? [];

  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const openPane = useOpenPane();

  // Project skills live at `.claude/skills/<name>/SKILL.md` (git-tracked, so the
  // file-peek pane's fuzzy resolver finds them). Clicking the chip opens the
  // markdown file view in a side pane.
  const skillFilePath = `.claude/skills/${skillName}/SKILL.md`;
  const openSkillFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!conversation) return;
    openPane(
      filePeekPane,
      { worktree: conversation.attemptId, filePath: skillFilePath },
      { mode: "push" },
    );
  };

  const skillChip = (
    <LinkChip
      onClick={openSkillFile}
      mono
      leading={<MdOutlineDescription />}
      title={`Open ${skillFilePath}`}
    >
      {skillName}
    </LinkChip>
  );

  const summary = args ? (
    <span className="min-w-0 truncate text-muted-foreground">{args}</span>
  ) : undefined;

  return (
    <ToolCallCard event={event} summary={summary} leading={skillChip}>
      {(args || injected.length > 0) && (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the content stack from the card header
        <Stack gap="sm" className="mt-2">
          {args && (
            <pre className="text-caption whitespace-pre-wrap break-words rounded-md bg-muted/60 p-sm">
              {args}
            </pre>
          )}
          {injected.map((ctx, i) => (
            <pre
              key={i}
              className="text-caption max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/40 px-sm py-sm text-muted-foreground"
            >
              {ctx}
            </pre>
          ))}
        </Stack>
      )}
    </ToolCallCard>
  );
}
