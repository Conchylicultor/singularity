import { useCallback, useEffect, useRef, useState } from "react";
import { MdPlayArrow } from "react-icons/md";
import { useResource } from "@core";
import { Button } from "@/components/ui/button";
import { agentsResource } from "../../shared/resources";
import { AgentLaunches } from "./agent-launches";
import { AgentStatus } from "./agent-status";
import { useConversationPane } from "./conversation-pane-context";

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
  const convPane = useConversationPane();

  const [name, setName] = useState(agent?.name ?? "");
  const [description, setDescription] = useState(agent?.description ?? "");
  const [prompt, setPrompt] = useState(agent?.prompt ?? "");
  const [model, setModel] = useState<string | null>(agent?.model ?? null);
  const [launching, setLaunching] = useState(false);

  const nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!agent) return;
    if (!nameTimer.current) setName(agent.name);
    if (!descTimer.current) setDescription(agent.description ?? "");
    if (!promptTimer.current) setPrompt(agent.prompt ?? "");
    setModel(agent.model ?? null);
  }, [agent?.name, agent?.description, agent?.prompt, agent?.model]);

  const save = useCallback(
    async (patch: Patch) => {
      await patchAgent(agentId, patch);
    },
    [agentId],
  );

  const onNameChange = (v: string) => {
    setName(v);
    if (nameTimer.current) clearTimeout(nameTimer.current);
    nameTimer.current = setTimeout(() => {
      nameTimer.current = null;
      void save({ name: v.trim() || "Untitled" });
    }, 500);
  };
  const onDescriptionChange = (v: string) => {
    setDescription(v);
    if (descTimer.current) clearTimeout(descTimer.current);
    descTimer.current = setTimeout(() => {
      descTimer.current = null;
      void save({ description: v });
    }, 500);
  };
  const onPromptChange = (v: string) => {
    setPrompt(v);
    if (promptTimer.current) clearTimeout(promptTimer.current);
    promptTimer.current = setTimeout(() => {
      promptTimer.current = null;
      void save({ prompt: v });
    }, 500);
  };

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
      // Flush pending debounced writes before launch.
      if (promptTimer.current) {
        clearTimeout(promptTimer.current);
        promptTimer.current = null;
        await save({ prompt });
      }
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
      // Brief wait for the conversations resource to include the new row so
      // the pane finds the conversation on open.
      if (convPane) convPane.open(conversationId);
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
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Untitled"
          className="placeholder:text-muted-foreground flex-1 bg-transparent text-xl font-semibold outline-none focus:ring-0"
        />
      </div>
      <textarea
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
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
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Instructions the agent runs with…"
          rows={12}
          className="placeholder:text-muted-foreground focus:ring-ring min-h-56 w-full resize-y rounded border bg-transparent p-3 font-mono text-sm outline-none focus:ring-1"
        />
      </div>
      <div className="flex justify-end">
        <Button
          onClick={launch}
          disabled={launching || !prompt.trim()}
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
