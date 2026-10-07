import { useCallback, useMemo } from "react";
import {
  Button,
  ButtonGroup,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { FloatingSurface } from "@plugins/primitives/plugins/overlay/plugins/floating-surface/web";
import { ConfigGearButton } from "@plugins/config_v2/plugins/config-link/web";
import { useConfig } from "@plugins/config_v2/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";
import {
  paneScrollScope,
  useTranscriptEvents,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { eventKey } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import {
  usePromptComposer,
  type PromptComposer,
} from "@plugins/conversations/plugins/conversation-view/web";
import { selectionAnswersConfig } from "../../shared/config";
import { quoteMarkdown, quotedAnswer } from "../internal/quote";
import {
  useTranscriptSelection,
  type TranscriptSelection,
} from "../internal/use-transcript-selection";

const quoteIcon = symbol("format-quote");
const editIcon = symbol("edit");
const sendIcon = symbol("send");

/** Every button keeps the transcript selection alive while it is pressed. */
const keepSelection = (e: React.MouseEvent) => e.preventDefault();

function clearSelection() {
  window.getSelection()?.removeAllRanges();
}

/**
 * The toolbar over a selection in an agent's reply. Only offered while this
 * pane has a prompt that takes a turn — a sub-agent's transcript, or a
 * conversation that is over, has nowhere for the quote to go.
 */
export function SelectionToolbar() {
  const composer = usePromptComposer();
  if (!composer?.canSend) return null;
  return <SelectionToolbarFor composer={composer} />;
}

function SelectionToolbarFor({ composer }: { composer: PromptComposer }) {
  const scroller = paneScrollScope.useRoot();
  const events = useTranscriptEvents();
  const agentRows = useMemo(
    () =>
      new Set(events.filter((e) => e.kind === "assistant-text").map(eventKey)),
    [events],
  );
  const accepts = useCallback((key: string) => agentRows.has(key), [agentRows]);
  const selection = useTranscriptSelection(
    scroller.attached ? scroller.root : null,
    accepts,
  );

  return (
    <FloatingSurface
      open={!!selection}
      anchor={selection?.anchor ?? null}
      side="top"
      align="center"
      sideOffset={6}
    >
      {selection && <Actions selection={selection} composer={composer} />}
    </FloatingSurface>
  );
}

function Actions({
  selection,
  composer,
}: {
  selection: TranscriptSelection;
  composer: PromptComposer;
}) {
  const { answers } = useConfig(selectionAnswersConfig);

  const act = (run: () => void) => () => {
    run();
    clearSelection();
  };

  return (
    <ControlSizeProvider size="xs">
      <Stack direction="row" gap="xs" align="center">
        <Button
          variant="ghost"
          onMouseDown={keepSelection}
          onClick={act(() =>
            composer.insert(`${quoteMarkdown(selection.text)}\n\n`),
          )}
        >
          <Icon icon={quoteIcon} className="size-3" />
          <span>Quote</span>
        </Button>
        {answers.map((a) => (
          <ButtonGroup key={a.id}>
            <Button
              variant="outline"
              onMouseDown={keepSelection}
              onClick={act(() =>
                composer.insert(quotedAnswer(selection.text, a.prompt)),
              )}
            >
              <Icon icon={editIcon} className="size-3" />
              <span>{a.title}</span>
            </Button>
            {/* eslint-disable-next-line icon-button/prefer-icon-button -- the send half of a split answer chip, not a standalone action: it shares the chip's outline seam, as the prompt-template chips do */}
            <Button
              variant="outline"
              aria-label={`Send: ${a.title}`}
              onMouseDown={keepSelection}
              onClick={act(() =>
                composer.send(quotedAnswer(selection.text, a.prompt)),
              )}
              className="px-split-arrow text-muted-foreground"
            >
              <Icon icon={sendIcon} className="size-3" />
            </Button>
          </ButtonGroup>
        ))}
        <ConfigGearButton
          descriptor={selectionAnswersConfig}
          label="Configure: Selection quick answers"
        />
      </Stack>
    </ControlSizeProvider>
  );
}
