import { MdWarning } from "react-icons/md";
import { useQuery } from "@tanstack/react-query";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";

export function AllowMonitorChip() {
  const { convId } = conversationPane.useParams();
  const { data } = useQuery<{ allowFiles: string[] }>({
    queryKey: ["allow-files", convId],
    queryFn: () =>
      fetch(
        `/api/conversations/${encodeURIComponent(convId)}/allow-files`,
      ).then((r) => r.json()),
    refetchInterval: 3_000,
  });

  const allowFiles = data?.allowFiles ?? [];
  if (allowFiles.length === 0) return null;

  return (
    <WithTooltip
      side="bottom"
      content={
        <>
          <p className="mb-1 font-semibold">Guard bypasses active:</p>
          {allowFiles.map((f) => (
            <p key={f} className="font-mono text-xs">
              {f}
            </p>
          ))}
        </>
      }
    >
      <Badge
        as="button"
        colorClass="bg-destructive/90 text-white hover:bg-destructive"
        icon={<MdWarning />}
        className="animate-pulse cursor-default"
        aria-label="Security bypass active"
      >
        BYPASS ACTIVE
      </Badge>
    </WithTooltip>
  );
}
