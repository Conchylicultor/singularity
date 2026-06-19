import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MdPlayArrow } from "react-icons/md";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { TextEditor } from "@plugins/primitives/plugins/text-editor/web";
import {
  Avatar,
  AvatarPicker,
  DEFAULT_AGENT_AVATAR,
} from "@plugins/primitives/plugins/avatar/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import { CONV_STATUS_DOT } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { launchAgent, updateAgent } from "@plugins/conversations/plugins/agents/core";
import { useVisibleModels } from "@plugins/conversations/plugins/model-provider/web";
import { MODEL_REGISTRY } from "@plugins/conversations/plugins/model-provider/core";
import { agentLaunchesResource, agentsResource } from "../../shared/resources";
import type { Agent } from "../../shared/resources";
import { AgentLaunches } from "./agent-launches";

type Patch = Partial<{
  name: string;
  prompt: string | null;
  model: string | null;
  icon: string | null;
  iconColor: string | null;
  iconSvgNodes: string | null;
}>;

async function patchAgent(id: string, patch: Patch) {
  await fetchEndpoint(updateAgent, { id }, { body: patch });
}

function parseSvgNodes(raw: string | null | undefined): SvgNode[] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as SvgNode[]; } catch (err) { if (!(err instanceof SyntaxError)) throw err; return null; }
}

export function AgentDetail({ agentId }: { agentId: string }) {
  const agentsResult = useResource(agentsResource);
  return (
    <ResourceView resource={agentsResult} fallback={<Loading variant="text" />}>
      {(agents) => {
        const agent = agents.find((a) => a.id === agentId) ?? null;
        if (!agent) return <Loading />;
        return <AgentDetailInner agentId={agentId} agent={agent} />;
      }}
    </ResourceView>
  );
}

function AgentDetailInner({ agentId, agent }: { agentId: string; agent: Agent }) {
  const launchesQ = useResource(agentLaunchesResource);
  const visibleModels = useVisibleModels();
  const [model, setModel] = useState<string | null>(agent.model ?? null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    setModel(agent.model ?? null);
  }, [agent.model]);

  const save = useCallback(
    async (patch: Patch) => {
      await patchAgent(agentId, patch);
    },
    [agentId],
  );

  const latestStatus = useMemo(() => {
    if (launchesQ.pending) return null;
    const latest = launchesQ.data
      .filter((l) => l.agentId === agentId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    return latest?.latestConversationStatus ?? null;
  }, [launchesQ, agentId]);

  const nameField = useEditableField({
    value: agent.name ?? "",
    onSave: (v) => save({ name: v.trim() || "Untitled" }),
  });
  const promptField = useEditableField({
    value: agent.prompt ?? "",
    onSave: (v) => save({ prompt: v }),
  });

  const onModelChange = async (v: string) => {
    const newModel = v === "" ? null : v;
    setModel(newModel);
    await save({ model: newModel });
  };

  const launch = async () => {
    if (!agent.prompt) return;
    if (launching) return;
    setLaunching(true);
    try {
      await promptField.flush();
      await fetchEndpoint(launchAgent, { id: agentId }, { body: {} });
    } finally {
      setLaunching(false);
    }
  };

  const agentSvgNodes = parseSvgNodes(agent.iconSvgNodes) ?? DEFAULT_AGENT_AVATAR.svgNodes;

  return (
    <Inset pad="xl">
      <Stack gap="lg">
      <Frame
        align="center"
        gap="md"
        leading={
          <AvatarPicker
            value={{
              icon: agent.icon ?? DEFAULT_AGENT_AVATAR.icon,
              color: agent.iconColor ?? DEFAULT_AGENT_AVATAR.color,
              svgNodes: agentSvgNodes,
            }}
            onChange={(next) => save({
              icon: next.icon,
              iconColor: next.color,
              iconSvgNodes: next.svgNodes ? JSON.stringify(next.svgNodes) : null,
            })}
            triggerLabel="Pick agent avatar"
          >
            <Avatar
              icon={agent.icon ?? DEFAULT_AGENT_AVATAR.icon}
              color={agent.iconColor ?? DEFAULT_AGENT_AVATAR.color}
              svgNodes={agentSvgNodes}
              size="lg"
              statusDot={latestStatus ? CONV_STATUS_DOT[latestStatus] : null}
              fallbackKey={agent.id}
            />
          </AvatarPicker>
        }
        content={
          <input
            value={nameField.value}
            onChange={(e) => nameField.onChange(e.target.value)}
            onFocus={nameField.onFocus}
            onBlur={nameField.onBlur}
            placeholder="Untitled"
            className="placeholder:text-muted-foreground w-full bg-transparent text-title outline-none focus:ring-0"
          />
        }
      />
      <Stack gap="xs">
        <SectionLabel as="label">
          Model
        </SectionLabel>
        <select
          value={model ?? ""}
          onChange={(e) => void onModelChange(e.target.value)}
          className="focus:ring-ring w-fit rounded-md border bg-transparent px-sm py-xs text-body outline-none focus:ring-1"
        >
          <option key="" value="">Default</option>
          {visibleModels.map((m) => (
            <option key={m} value={m}>
              {MODEL_REGISTRY[m].label}
            </option>
          ))}
        </select>
      </Stack>
      <Stack gap="xs">
        <SectionLabel as="label">
          Prompt
        </SectionLabel>
        <div
          onFocus={promptField.onFocus}
          onBlur={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            promptField.onBlur();
          }}
        >
          <TextEditor
            value={promptField.value}
            onChange={promptField.onChange}
            placeholder="Instructions the agent runs with…"
            minRows={12}
            namespace={`agent-prompt-${agentId}`}
          />
        </div>
      </Stack>
      <Stack gap="none" direction="row" justify="end">
        <Button
          onClick={launch}
          loading={launching}
          disabled={!promptField.value.trim()}
          className="gap-xs"
        >
          <MdPlayArrow className="size-4" />
          Launch
        </Button>
      </Stack>
      <AgentLaunches agentId={agentId} />
      </Stack>
    </Inset>
  );
}
