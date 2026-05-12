import { MdAdd, MdArrowDownward, MdLink, MdLinkOff } from "react-icons/md";

export interface ChainConnectorProps {
  linked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  onInsert: () => void;
}

export function ChainConnector({ linked, onToggle, disabled, onInsert }: ChainConnectorProps) {
  if (!linked) {
    return (
      <div className="group/connector relative flex h-3 items-center justify-center">
        <div className="border-muted-foreground/20 w-full border-t border-dashed" />
        <span className="text-muted-foreground/40 absolute text-[10px] uppercase tracking-wider transition-opacity group-hover/connector:opacity-0">
          ∥ parallel
        </span>
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label="Link tasks (run sequentially)"
          title="Link tasks (run sequentially)"
          className="text-muted-foreground hover:text-foreground absolute flex size-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover/connector:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none"
        >
          <MdLink className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="group/connector relative flex h-3 items-center justify-center">
      <div className="text-muted-foreground/60 flex items-center gap-0.5 text-[10px] uppercase tracking-wider transition-opacity group-hover/connector:opacity-0">
        <MdArrowDownward className="size-3" />
        <span>blocks</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center gap-4 opacity-0 transition-opacity group-hover/connector:opacity-100">
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
