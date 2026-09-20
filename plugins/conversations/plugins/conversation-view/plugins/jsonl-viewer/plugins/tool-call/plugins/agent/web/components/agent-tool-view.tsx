import { MdArticle } from "react-icons/md";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { useJsonlConversationId } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import {
  SubagentDuration,
  SubagentLastStep,
  subagentStateDisplay,
  useSubagentStatus,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/subagents/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { familyClass } from "@plugins/conversations/plugins/model-provider/web";
import {
  MODEL_TIERS,
  modelDisplayLabel,
} from "@plugins/conversations/plugins/model-provider/core";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { agentReportPane } from "../panes";

interface AgentInput {
  prompt: string;
  description?: string;
  subagent_type?: string;
  model?: string;
  isolation?: string;
  run_in_background?: boolean;
}

function ModelBadge({ model }: { model: string }) {
  const tier = MODEL_TIERS.find((t) => model.includes(t));
  const colors = tier ? familyClass(tier) : "bg-muted text-muted-foreground";
  return (
    <Badge colorClass={colors} className="font-mono">
      {modelDisplayLabel(model)}
    </Badge>
  );
}

function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="muted" className="tracking-wider">
      {children}
    </Badge>
  );
}

export function AgentToolView({ event }: ToolRendererProps) {
  const input = event.input as AgentInput;
  const agentType = input.subagent_type ?? "general-purpose";
  const description = input.description ?? "";
  const prompt = input.prompt ?? "";
  const result = event.result;

  // The sub-agent behind this card. The join is the tool-use id, and every card
  // in the conversation reads the same conversation-keyed resource — one query,
  // one subscription, however many sub-agents were launched.
  const conversationId = useJsonlConversationId();
  const status = useSubagentStatus({
    conversationId,
    toolUseId: event.toolUseId,
    agentToolEvent: event,
  });
  const display =
    status.kind === "known"
      ? subagentStateDisplay(status.state, {
          isError: result?.isError === true,
        })
      : null;

  const openPane = useOpenPane();

  const openReport = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    openPane(agentReportPane, { toolUseId: event.toolUseId }, { mode: "push" });
  };

  // Always openable, whether or not a result has landed: while it runs the pane
  // is where you watch it, and if it died without reporting the pane is the only
  // place its work survives at all.
  const openLabel = display?.openLabel ?? "Open sub-agent";
  const OpenIcon = display?.icon ?? MdArticle;

  const summary = (
    <Line as="span" className="gap-sm">
      <Badge
        colorClass="bg-categorical-6/15 text-categorical-6"
        className="font-mono"
      >
        {agentType}
      </Badge>
      {input.model && <ModelBadge model={input.model} />}
      {input.run_in_background && <MetaBadge>Background</MetaBadge>}
      {input.isolation === "worktree" && <MetaBadge>Worktree</MetaBadge>}
      {/* Only the state that nothing else on the card can show: running has its
          dots, finished has its report, but "it stopped and never said so" is
          the absence of a signal and has to be spelled out. */}
      {display?.notable && (
        <Badge variant={display.variant} className={rigidClass()}>
          {display.label}
        </Badge>
      )}
      {description && (
        <Text className="text-muted-foreground">{description}</Text>
      )}
      {status.kind === "known" && (
        <SubagentDuration
          startedAt={status.startedAt}
          endedAt={status.endedAt}
          className={cn(rigidClass(), "font-mono tabular-nums")}
        />
      )}
    </Line>
  );

  // The report affordance must be a header *sibling*, not part of `summary`:
  // summary content is click-through (pointer-events-none, toggles the card).
  // `aside` is auto-wrapped in CardHeaderAction by CollapsibleCard, restoring
  // its own click.
  const aside = (
    <IconButton icon={OpenIcon} label={openLabel} onClick={openReport} />
  );

  return (
    <Stack gap="2xs">
      <ToolCallCard
        event={event}
        summary={summary}
        aside={aside}
        // `result` is a launch acknowledgement for a backgrounded Agent, so the
        // card must not read it as "done" — the sub-agent's own state does.
        running={
          status.kind === "known" ? status.state.kind === "running" : undefined
        }
      >
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the body from the ToolCallCard header inside its collapsible region; not a Stack-owned gap */}
        <Stack gap="sm" className="mt-2">
          {/* Prompt */}
          <Scroll axis="both" className="max-h-96 px-md py-sm">
            <div className="prose-xs text-caption">
              <Markdown>{prompt}</Markdown>
            </div>
          </Scroll>

          <Row
            size="sm"
            hover="muted"
            bordered
            onClick={openReport}
            className="rounded-md border-border/40 text-muted-foreground"
            icon={<OpenIcon />}
          >
            <span className="font-medium">{openLabel}</span>
          </Row>
        </Stack>
      </ToolCallCard>
      {/* What it is doing right now, under the card rather than inside it: the
          body is collapsed by default, and this is the line you want without
          opening anything. Once it has reported, the report is the answer. */}
      {status.kind === "known" && status.state.kind !== "finished" && (
        <SubagentLastStep
          row={status.row}
          state={status.state}
          className="px-md"
        />
      )}
    </Stack>
  );
}
