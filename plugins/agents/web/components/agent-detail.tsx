import { useCallback, useEffect, useMemo, useState } from "react";
import { MdPlayArrow } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { PromptEditor } from "@plugins/primitives/plugins/prompt-editor/web";
import {
  Avatar,
  AvatarPicker,
  DEFAULT_AGENT_AVATAR,
  type SvgNode,
} from "@plugins/primitives/plugins/avatar/web";
import { CONV_STATUS_DOT } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { Button } from "@/components/ui/button";
import { agentLaunchesResource, agentsResource } from "../../shared/resources";
import { AgentLaunches } from "./agent-launches";

type Patch = Partial<{
  name: string;
  prompt: string | null;
  model: string | null;
  icon: string | null;
  iconColor: string | null;
  iconSvgNodes: string | null;
}>;

const MODELS = [
  { value: null, label: "Default" },
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
] as const;

async function patchAgent(id: string, patch: Patch) {
  await fetch(`/api/agents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

function parseSvgNodes(raw: string | null | undefined): SvgNode[] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as SvgNode[]; } catch { return null; }
}

export function AgentDetail({ agentId }: { agentId: string }) {
  const { data } = useResource(agentsResource);
  const agent = data.find((a) => a.id === agentId) ?? null;
  const launchesQ = useResource(agentLaunchesResource);
  const [model, setModel] = useState<string | null>(agent?.model ?? null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    setModel(agent?.model ?? null);
  }, [agent?.model]);

  const save = useCallback(
    async (patch: Patch) => {
      await patchAgent(agentId, patch);
    },
    [agentId],
  );

  const latestStatus = useMemo(() => {
    const launches = launchesQ.data;
    const latest = launches
      .filter((l) => l.agentId === agentId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    return latest?.latestConversationStatus ?? null;
  }, [launchesQ.data, agentId]);

  const nameField = useEditableField({
    value: agent?.name ?? "",
    onSave: (v) => save({ name: v.trim() || "Untitled" }),
  });
  const promptField = useEditableField({
    value: agent?.prompt ?? "",
    onSave: (v) => save({ prompt: v }),
  });

  const onModelChange = async (v: string) => {
    const newModel = v === "" ? null : v;
    setModel(newModel);
    await save({ model: newModel });
  };

  const launch = async () => {
    if (!agent || !agent.prompt) return;
    if (launching) return;
    setLaunching(true);
    try {
      await promptField.flush();
      const res = await fetch(`/api/agents/${agentId}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
    } finally {
      setLaunching(false);
    }
  };

  if (!agent) {
    return <Placeholder>Loading…</Placeholder>;
  }

  const agentSvgNodes = parseSvgNodes(agent.iconSvgNodes) ?? DEFAULT_AGENT_AVATAR.svgNodes;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
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
        <input
          value={nameField.value}
          onChange={(e) => nameField.onChange(e.target.value)}
          onFocus={nameField.onFocus}
          onBlur={nameField.onBlur}
          placeholder="Untitled"
          className="placeholder:text-muted-foreground flex-1 bg-transparent text-xl font-semibold outline-none focus:ring-0"
        />
      </div>
      <div className="flex flex-col gap-1">
        <SectionLabel as="label">
          Model
        </SectionLabel>
        <select
          value={model ?? ""}
          onChange={(e) => void onModelChange(e.target.value)}
          className="focus:ring-ring w-fit rounded border bg-transparent px-2 py-1 text-sm outline-none focus:ring-1"
        >
          {MODELS.map((m) => (
            <option key={String(m.value)} value={m.value ?? ""}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
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
          <PromptEditor
            value={promptField.value}
            onChange={promptField.onChange}
            placeholder="Instructions the agent runs with…"
            minRows={12}
            namespace={`agent-prompt-${agentId}`}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          onClick={launch}
          disabled={launching || !promptField.value.trim()}
          className="gap-1"
        >
          <MdPlayArrow className="size-4" />
          {launching ? "Launching…" : "Launch"}
        </Button>
      </div>
      <AgentLaunches agentId={agentId} />
    </div>
  );
}
