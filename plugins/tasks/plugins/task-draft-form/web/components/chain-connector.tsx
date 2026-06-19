import { MdAdd, MdArrowDownward, MdLink, MdLinkOff } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { hoverRevealGroup, hoverRevealTarget } from "@plugins/primitives/plugins/hover-reveal/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";

export interface ChainConnectorProps {
  linked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  onInsert: () => void;
}

export function ChainConnector({ linked, onToggle, disabled, onInsert }: ChainConnectorProps) {
  if (!linked) {
    return (
      <Center className={cn(hoverRevealGroup, "group/connector relative h-3")}>
        <div className="border-muted-foreground/20 w-full border-t border-dashed" />
        <Pin
          to="center"
          as="span"
          className="text-muted-foreground/40 text-3xs uppercase tracking-wider transition-opacity group-hover/connector:opacity-0"
        >
          ∥ parallel
        </Pin>
        <Pin to="center">
          <button
            type="button"
            onClick={onToggle}
            disabled={disabled}
            aria-label="Link tasks (run sequentially)"
            title="Link tasks (run sequentially)"
            className={cn(hoverRevealTarget, "text-muted-foreground hover:text-foreground size-5 rounded-full focus-visible:opacity-100 disabled:pointer-events-none")}
          >
            <Center className="size-full">
              <MdLink className="size-3.5" />
            </Center>
          </button>
        </Pin>
      </Center>
    );
  }

  return (
    <Center className={cn(hoverRevealGroup, "group/connector relative h-3")}>
      <Inline
        gap="2xs"
        className="text-muted-foreground/60 text-3xs uppercase tracking-wider transition-opacity group-hover/connector:opacity-0"
      >
        <MdArrowDownward className="size-3" />
        <span>blocks</span>
      </Inline>
      <Pin to="center" className={hoverRevealTarget}>
        <Inline gap="lg">
          <button
            type="button"
            onClick={onToggle}
            disabled={disabled}
            aria-label="Unlink tasks (run in parallel)"
            title="Unlink tasks (run in parallel)"
            className="text-muted-foreground hover:text-foreground size-5 rounded-full transition-colors disabled:pointer-events-none"
          >
            <Center className="size-full">
              <MdLinkOff className="size-3.5" />
            </Center>
          </button>
          <button
            type="button"
            onClick={onInsert}
            disabled={disabled}
            aria-label="Insert task here"
            title="Insert task here"
            className="bg-primary text-primary-foreground size-5 rounded-full shadow disabled:pointer-events-none"
          >
            <Center className="size-full">
              <MdAdd className="size-3.5" />
            </Center>
          </button>
        </Inline>
      </Pin>
    </Center>
  );
}
