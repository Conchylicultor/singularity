import { useCallback, useEffect, useState } from "react";
import { MdPlayArrow } from "react-icons/md";
import { useEditableField, useResource } from "@core";
import { Button } from "@/components/ui/button";
import { agentsResource } from "../../shared/resources";
import { agentConversationPane } from "../panes";
import { AgentLaunches } from "./agent-launches";
import { AgentStatus } from "./agent-status";

type Patch = Partial<{
  name: string;
  description: string | null;
  prompt: string | null;
  model: string | null;
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

export function AgentDetail({ agentId }: { agentId: string }) {
  const { data } = useResource(agentsResource);
  const agent = data?.find((a) => a.id === agentId) ?? null;

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

  const nameField = useEditableField({
    value: agent?.name ?? "",
    onSave: (v) => save({ name: v.trim() || "Untitled" }),
  });
  const descField = useEditableField({
    value: agent?.description ?? "",
    onSave: (v) => save({ description: v }),
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
      const { conversationId } = (await res.json()) as {
        launchId: string;
        taskId: string;
        conversationId: string;
      };
      agentConversationPane.open({ id: agentId, convId: conversationId });
    } finally {
      setLaunching(false);
    }
  };

  if (!agent) {
    return <div className="text-muted-foreground p-6 text-sm">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <AgentStatus agentId={agentId} size="md" />
        <input
          value={nameField.value}
          onChange={(e) => nameField.onChange(e.target.value)}
          onFocus={nameField.onFocus}
          onBlur={nameField.onBlur}
          placeholder="Untitled"
          className="placeholder:text-muted-foreground flex-1 bg-transparent text-xl font-semibold outline-none focus:ring-0"
        />
      </div>
      <textarea
        value={descField.value}
        onChange={(e) => descField.onChange(e.target.value)}
        onFocus={descField.onFocus}
        onBlur={descField.onBlur}
        placeholder="Describe what this agent does…"
        rows={2}
        className="placeholder:text-muted-foreground focus:ring-ring w-full resize-y rounded border bg-transparent p-2 text-sm outline-none focus:ring-1"
      />
      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground text-xs uppercase tracking-wide">
          Model
        </label>
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
        <label className="text-muted-foreground text-xs uppercase tracking-wide">
          Prompt
        </label>
        <textarea
          value={promptField.value}
          onChange={(e) => promptField.onChange(e.target.value)}
          onFocus={promptField.onFocus}
          onBlur={promptField.onBlur}
          placeholder="Instructions the agent runs with…"
          rows={12}
          className="placeholder:text-muted-foreground focus:ring-ring min-h-56 w-full resize-y rounded border bg-transparent p-3 font-mono text-sm outline-none focus:ring-1"
        />
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
