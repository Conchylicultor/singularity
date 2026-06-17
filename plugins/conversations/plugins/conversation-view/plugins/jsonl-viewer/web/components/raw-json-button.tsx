import { MdDataObject } from "react-icons/md";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { rowActionClass } from "./row-action-button";

export function RawJsonAction({ event }: { event: JsonlEvent }) {
  return (
    <InlinePopover
      trigger={
        <button
          className={rowActionClass()}
          title="View raw JSON"
          aria-label="View raw JSON"
          onClick={(e) => e.stopPropagation()}
        >
          <MdDataObject className="size-3" />
        </button>
      }
      align="end"
      contentClassName="w-[640px] max-w-[90vw] p-none"
    >
      <Text as="pre" variant="caption" className="max-h-[60vh] overflow-auto rounded-md bg-muted/40 p-md">
        {JSON.stringify(event, null, 2)}
      </Text>
    </InlinePopover>
  );
}
