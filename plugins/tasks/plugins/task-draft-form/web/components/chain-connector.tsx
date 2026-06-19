import { MdAdd, MdArrowDownward, MdLink, MdLinkOff } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { hoverRevealGroup, hoverRevealTarget } from "@plugins/primitives/plugins/hover-reveal/web";

export interface ChainConnectorProps {
  linked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  onInsert: () => void;
}

export function ChainConnector({ linked, onToggle, disabled, onInsert }: ChainConnectorProps) {
  if (!linked) {
    return (
      <div className={cn(hoverRevealGroup, "group/connector relative flex h-3 items-center justify-center")}>
        <div className="border-muted-foreground/20 w-full border-t border-dashed" />
        <span className="text-muted-foreground/40 absolute text-3xs uppercase tracking-wider transition-opacity group-hover/connector:opacity-0">
          ∥ parallel
        </span>
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label="Link tasks (run sequentially)"
          title="Link tasks (run sequentially)"
          className={cn(hoverRevealTarget, "text-muted-foreground hover:text-foreground absolute flex size-5 items-center justify-center rounded-full focus-visible:opacity-100 disabled:pointer-events-none")}
        >
          <MdLink className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn(hoverRevealGroup, "group/connector relative flex h-3 items-center justify-center")}>
      <div className="text-muted-foreground/60 flex items-center gap-2xs text-3xs uppercase tracking-wider transition-opacity group-hover/connector:opacity-0">
        <MdArrowDownward className="size-3" />
        <span>blocks</span>
      </div>
      <div className={cn(hoverRevealTarget, "absolute inset-0 flex items-center justify-center gap-lg")}>
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label="Unlink tasks (run in parallel)"
          title="Unlink tasks (run in parallel)"
          className="text-muted-foreground hover:text-foreground flex size-5 items-center justify-center rounded-full transition-colors disabled:pointer-events-none"
        >
          <MdLinkOff className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onInsert}
          disabled={disabled}
          aria-label="Insert task here"
          title="Insert task here"
          className="bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-full shadow disabled:pointer-events-none"
        >
          <MdAdd className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
