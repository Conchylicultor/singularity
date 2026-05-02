import { MdWarning } from "react-icons/md";
import { useQuery } from "@tanstack/react-query";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AllowMonitorChip() {
  const { conversation } = conversationPane.useData();
  const { data } = useQuery<{ allowFiles: string[] }>({
    queryKey: ["allow-files", conversation.id],
    queryFn: () =>
      fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/allow-files`,
      ).then((r) => r.json()),
    refetchInterval: 3_000,
  });

  const allowFiles = data?.allowFiles ?? [];
  if (allowFiles.length === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            className="inline-flex animate-pulse cursor-default items-center gap-1.5 rounded-md bg-red-500/90 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500"
            aria-label="Security bypass active"
          >
            <MdWarning className="size-3.5" />
            BYPASS ACTIVE
          </button>
        }
      />
      <TooltipContent side="bottom">
        <p className="mb-1 font-semibold">Guard bypasses active:</p>
        {allowFiles.map((f) => (
          <p key={f} className="font-mono text-xs">
            {f}
          </p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
