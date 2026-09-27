import { useLive } from "@plugins/network/plugins/live/web";
import { allowFiles } from "../../shared";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { WithTooltip } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const warningIcon = symbol("warning");

export function AllowMonitorChip() {
  const { convId } = conversationPane.useParams();
  const result = useLive(allowFiles, { id: convId });
  // An alarm, not a data display: nothing to show until the server has said a
  // bypass file exists.
  if (result.pending) return null;
  const files = result.data.allowFiles;
  if (files.length === 0) return null;

  return (
    <WithTooltip
      side="bottom"
      content={
        <>
          {/* eslint-disable-next-line spacing/no-adhoc-spacing -- heading offset inside a tooltip fragment with no flex parent to own the gap */}
          <p className="mb-1 font-semibold">Guard bypasses active:</p>
          {files.map((f) => (
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
        icon={<Icon icon={warningIcon} />}
        className="animate-pulse cursor-default"
        aria-label="Security bypass active"
      >
        BYPASS ACTIVE
      </Badge>
    </WithTooltip>
  );
}
