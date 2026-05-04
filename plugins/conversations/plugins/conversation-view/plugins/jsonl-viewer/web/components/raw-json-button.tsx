import { MdDataObject } from "react-icons/md";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/shared";
import { rowActionClass } from "./row-action-button";

export function RawJsonAction({ event }: { event: JsonlEvent }) {
  return (
    <Popover>
      <PopoverTrigger
        className={rowActionClass()}
        title="View raw JSON"
        aria-label="View raw JSON"
        onClick={(e) => e.stopPropagation()}
      >
        <MdDataObject className="size-3" />
      </PopoverTrigger>
      <PopoverContent className="w-[640px] max-w-[90vw] p-0" align="end">
        <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted/40 p-3 text-xs leading-relaxed">
          {JSON.stringify(event, null, 2)}
        </pre>
      </PopoverContent>
    </Popover>
  );
}
