import { MdRocketLaunch } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { agentsResource } from "@plugins/agents/web";
import { cn } from "@/lib/utils";

async function patchAutoLaunch(agentId: string, autoLaunch: boolean) {
  await fetch(`/api/agents/${agentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ autoLaunch }),
  });
}

export function AutoLaunchToggle({ agentId }: { agentId: string }) {
  const { data: agents } = useResource(agentsResource);
  const agent = agents?.find((a) => a.id === agentId);
  const enabled = agent?.autoLaunch ?? false;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        patchAutoLaunch(agentId, !enabled);
      }}
      title={enabled ? "Auto-launch: on" : "Auto-launch: off"}
      aria-label="Toggle auto-launch"
      aria-pressed={enabled}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded hover:bg-background/60",
        enabled ? "text-blue-500" : "opacity-40",
      )}
    >
      <MdRocketLaunch className="size-4" />
    </button>
  );
}
