import { MdArticle } from "react-icons/md";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useConversationById } from "@plugins/conversations/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { ArtifactRow } from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/web";
import type { ArtifactItem } from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/core";
import { researchTitle } from "../internal/research-docs";

/** The design docs' glyph — the same one the conversation's Docs button uses. */
export const RESEARCH_ICON = MdArticle;

/**
 * The research docs this conversation wrote, changed or read, one per line.
 *
 * A click opens the doc in the file-peek pane beside the conversation, which is
 * where every other file in this app opens. The pane is addressed by the
 * conversation's own worktree, so the row shows the doc as this agent left it,
 * not as `main` has it.
 */
export function ResearchSection({ items }: { items: ArtifactItem[] }) {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const openPane = useOpenPane();

  // Until the conversation row arrives there is no worktree to open the doc in,
  // so the rows list but do not act. `ArtifactRow` disables a row with nowhere
  // to go — it does not silently swallow the click.
  const worktree = conversation?.attemptId;

  return (
    <Stack gap="none">
      {items.map((item) => (
        <ArtifactRow
          key={item.key}
          item={item}
          title={researchTitle(item.key)}
          icon={RESEARCH_ICON}
          onOpen={
            worktree === undefined
              ? undefined
              : () =>
                  openPane(
                    filePeekPane,
                    { worktree, filePath: item.key },
                    { mode: "push" },
                  )
          }
        />
      ))}
    </Stack>
  );
}
