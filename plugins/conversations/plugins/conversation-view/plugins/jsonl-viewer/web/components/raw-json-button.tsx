import { MdDataObject } from "react-icons/md";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
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
      contentClassName="w-[640px] max-w-[90vw] p-0"
    >
      <ContentScope>
        <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted/40 p-3 text-xs leading-relaxed">
          {JSON.stringify(event, null, 2)}
        </pre>
      </ContentScope>
    </InlinePopover>
  );
}
