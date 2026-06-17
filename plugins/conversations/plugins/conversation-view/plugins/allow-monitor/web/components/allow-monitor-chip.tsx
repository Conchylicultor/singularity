import { MdWarning } from "react-icons/md";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getAllowFiles } from "../../shared/endpoints";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export function AllowMonitorChip() {
  const { convId } = conversationPane.useParams();
  const { data } = useEndpoint(getAllowFiles, { id: convId }, { refetchInterval: 3_000 });

  const allowFiles = data?.allowFiles ?? [];
  if (allowFiles.length === 0) return null;

  return (
    <WithTooltip
      side="bottom"
      content={
        <>
          {/* eslint-disable-next-line spacing/no-adhoc-spacing -- heading offset inside a tooltip fragment with no flex parent to own the gap */}
          <p className="mb-1 font-semibold">Guard bypasses active:</p>
          {allowFiles.map((f) => (
            <Text as="p" variant="caption" key={f} className="font-mono">
              {f}
            </Text>
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
