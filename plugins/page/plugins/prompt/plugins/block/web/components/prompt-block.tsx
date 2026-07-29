import { MdAutoAwesome } from "react-icons/md";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { plainOf } from "@plugins/page/plugins/editor/core";
import {
  BLOCK_INSET,
  BlockTextEditor,
  type BlockRendererProps,
} from "@plugins/page/plugins/editor/web";
import { createPromptTask } from "@plugins/page/plugins/prompt/plugins/link/web";
import { promptBlock } from "../../core";
import { LaunchedConversations } from "./launched-conversations";

/**
 * The `/prompt` block: the shared block text editor in a raised box, with a
 * launch control and the conversations it has already launched.
 *
 * The prompt is ordinary page content — same Lexical editor, marks, inline
 * tokens, CRDT text and undo as any other text block — so it is editable,
 * versioned and searchable like the rest of the document, and feeding the
 * surrounding page in as context later needs no data migration.
 */
export function PromptBlock({ block, isFocused, editor }: BlockRendererProps) {
  const data = promptBlock.parse(block.data);
  // What the user SEES rendered. The launch sends this, never the server's own
  // copy: `data.text` is the block row's projection of the CRDT doc and lags it
  // by ~1s, so a launch right after typing would otherwise stamp stale text.
  // (It lags here too — the button stays disabled for that beat on a brand-new
  // block — but it can never send text the user didn't see.)
  const prompt = plainOf(data.text).trim();

  return (
    <Inset x={BLOCK_INSET} y="xs">
      <Surface level="raised">
        <BlockTextEditor
          block={block}
          isFocused={isFocused}
          editor={editor}
          textVariant="body"
          // The box already supplies the left inset; don't stack the page rail
          // inset on top of it.
          inset={false}
          marker={
            <Text as="span" variant="body" tone="muted" aria-hidden className="py-xs">
              <MdAutoAwesome className="icon-auto" />
            </Text>
          }
          placeholder="Ask an agent…"
        />
        {/* The action row pads itself rather than the box, so the box's first
            line stays exactly where `gutterFirstLineCenter` says it is. */}
        <Inset x="xs" b="xs">
          <ControlSizeProvider size="sm">
            <Line>
              <LaunchControl
                size="icon"
                openMode="push"
                // An empty prompt would create a task with no description, so
                // the control is inert until there is something to ask.
                disabled={prompt.length === 0}
                getRequest={async () => {
                  if (prompt.length === 0) {
                    throw new Error("Prompt block launched with empty text");
                  }
                  if (!block.pageId) {
                    throw new Error(
                      `Prompt block ${block.id} has no page — cannot stamp provenance`,
                    );
                  }
                  const { taskId } = await createPromptTask({
                    pageId: block.pageId,
                    blockId: block.id,
                    prompt,
                  });
                  return { taskId, prompt };
                }}
              />
              <Fill>
                <LaunchedConversations blockId={block.id} />
              </Fill>
            </Line>
          </ControlSizeProvider>
        </Inset>
      </Surface>
    </Inset>
  );
}
