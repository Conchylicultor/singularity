import { MdAccountTree, MdCode } from "react-icons/md";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { HighlightedCode } from "@plugins/primitives/plugins/syntax-highlight/web";
import { useCollapsible } from "@plugins/primitives/plugins/collapsible/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import {
  parseWorkflowMeta,
  parseWorkflowResult,
} from "../internal/parse-workflow";
import { useWorkflowTrace } from "../internal/use-workflow-trace";
import { WorkflowGraph } from "./workflow-graph";
import { workflowNodePane } from "../panes";

interface WorkflowInput {
  script?: string;
  scriptPath?: string;
  name?: string;
  args?: unknown;
}

function PhaseList({
  phases,
}: {
  phases: { title?: string; detail?: string }[];
}) {
  return (
    <Stack as="ol" gap="xs">
      {phases.map((phase, i) => (
        <Frame
          as="li"
          key={i}
          gap="sm"
          align="start"
          leading={
            // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-0.5 optically centers the number badge to the first text line
            <Center className="mt-0.5 size-4 rounded-full bg-categorical-6/15 font-mono text-3xs text-categorical-6">
              {i + 1}
            </Center>
          }
          content={
            <Text as="div" variant="caption">
              <span className="font-medium text-foreground">
                {phase.title ?? "(untitled phase)"}
              </span>
              {phase.detail && (
                // eslint-disable-next-line spacing/no-adhoc-spacing -- ml-1.5 separates the inline detail from the phase title
                <span className="ml-1.5 text-muted-foreground">
                  {phase.detail}
                </span>
              )}
            </Text>
          }
        />
      ))}
    </Stack>
  );
}

function ScriptSection({ script }: { script: string }) {
  const { open, triggerProps, contentId } = useCollapsible({
    defaultOpen: false,
  });
  return (
    <div className="rounded-md border border-border/40">
      <Stack
        as="button"
        direction="row"
        gap="xs"
        align="center"
        {...triggerProps}
        className="w-full px-md py-xs text-left text-caption text-muted-foreground hover:text-foreground"
      >
        <MdCode className="size-3.5" />
        <span className="font-medium">{open ? "Hide" : "View"} script</span>
        <span className="text-3xs opacity-60">
          ({script.split("\n").length} lines)
        </span>
      </Stack>
      {open && (
        <Scroll axis="both" id={contentId} className="max-h-96 px-md pb-sm">
          <HighlightedCode code={script} lang="ts" />
        </Scroll>
      )}
    </div>
  );
}

export function WorkflowToolView({ event }: ToolRendererProps) {
  const input = event.input as WorkflowInput;
  const script = input.script ?? "";
  const meta = script ? parseWorkflowMeta(script) : null;
  const name = meta?.name ?? input.name;
  const description = meta?.description;
  const phases = meta?.phases ?? [];

  const { graph, status } = useWorkflowTrace(script, input.args);

  const openPane = useOpenPane();
  const convId = conversationPane.useRouteEntry()?.params.convId;
  const openNode = (nodeId: string) => {
    openPane(
      workflowNodePane,
      { toolUseId: event.toolUseId, nodeId },
      { mode: "push", input: convId ? { convId } : undefined },
    );
  };

  const result = event.result;
  const parsedResult =
    result && !result.isError ? parseWorkflowResult(result.content) : null;

  const agentCount = graph?.nodes.length ?? 0;
  const summary = (
    <Frame
      gap="sm"
      leading={
        <>
          <Badge colorClass="bg-categorical-6/15 text-categorical-6" icon={<MdAccountTree />} className="font-mono">
            {name ?? "workflow"}
          </Badge>
          {phases.length > 0 && (
            <Badge variant="muted" className="tracking-wider">
              {phases.length} {phases.length === 1 ? "phase" : "phases"}
            </Badge>
          )}
          {agentCount > 0 && (
            <Badge variant="muted" className="tracking-wider">
              {agentCount} {agentCount === 1 ? "agent" : "agents"}
            </Badge>
          )}
        </>
      }
      content={
        description ? (
          <Text className="text-muted-foreground">
            {description}
          </Text>
        ) : undefined
      }
    />
  );

  return (
    <ToolCallCard event={event} summary={summary}>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the body from the card header */}
      <Text as="div" variant="caption" className="mt-2">
        <Stack gap="md">
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}

          {status === "ready" && graph ? (
            <WorkflowGraph graph={graph} onOpenNode={openNode} />
          ) : (
            phases.length > 0 && <PhaseList phases={phases} />
          )}

          {script ? (
            <ScriptSection script={script} />
          ) : input.scriptPath ? (
            <div className="rounded-md border border-border/40 px-md py-xs font-mono text-2xs text-muted-foreground">
              {input.scriptPath}
            </div>
          ) : null}

          {parsedResult && (
            // eslint-disable-next-line spacing/no-adhoc-spacing -- space-y-1 spaces the summary line from the id row inside this bordered result box
            <div className="space-y-1 rounded-md border border-border/40 bg-muted/30 px-md py-sm">
              {parsedResult.summary && (
                <div className="text-foreground">{parsedResult.summary}</div>
              )}
              <Cluster gap="lg" className="text-2xs text-muted-foreground">
                {parsedResult.runId && (
                  <span>
                    Run <span className="font-mono">{parsedResult.runId}</span>
                  </span>
                )}
                {parsedResult.taskId && (
                  <span>
                    Task <span className="font-mono">{parsedResult.taskId}</span>
                  </span>
                )}
              </Cluster>
            </div>
          )}

          {result?.isError && (
            <Scroll
              as="pre"
              className="max-h-96 whitespace-pre-wrap break-words rounded-md bg-destructive/10 p-sm text-destructive"
            >
              {result.content || "(empty)"}
            </Scroll>
          )}
        </Stack>
      </Text>
    </ToolCallCard>
  );
}
