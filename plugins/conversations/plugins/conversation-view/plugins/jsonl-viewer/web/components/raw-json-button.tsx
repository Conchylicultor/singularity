import { MdDataObject } from "react-icons/md";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
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
      width="4xl"
      padding="none"
    >
      <Scroll axis="both" className="max-h-[60vh] rounded-md bg-muted/40 p-md">
        <Text as="pre" variant="caption">
          {JSON.stringify(event, null, 2)}
        </Text>
      </Scroll>
    </InlinePopover>
  );
}
