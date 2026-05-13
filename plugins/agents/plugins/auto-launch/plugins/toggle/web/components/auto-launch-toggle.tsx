import { MdRocketLaunch } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { agentAutoLaunchResource } from "@plugins/agents/plugins/auto-launch/plugins/toggle/shared/resources";
import { cn } from "@/lib/utils";

async function patchAutoLaunch(agentId: string, enabled: boolean) {
  await fetch(`/api/agent-auto-launch/${agentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export function AutoLaunchToggle({ agentId }: { agentId: string }) {
  const { data: rows } = useResource(agentAutoLaunchResource);
  const enabled = rows.find((r) => r.parentId === agentId)?.enabled ?? false;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void patchAutoLaunch(agentId, !enabled);
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
