import { cn, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { MdClose, MdSearch } from "react-icons/md";

export interface SearchInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  wrapperClassName?: string;
}

export function SearchInput({
  className,
  wrapperClassName,
  ...props
}: SearchInputProps) {
  const hasValue = typeof props.value === "string" && props.value.length > 0;

  const handleClear = () => {
    props.onChange?.({
      target: { value: "" },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  return (
    <div className={cn("relative", wrapperClassName)}>
      {/* off-ramp inset: left-2 (0.5rem) is not on the semantic spacing ramp */}
      <Pin
        to="left"
        decorative
        style={{ left: "0.5rem" }}
        className="text-muted-foreground"
      >
        <MdSearch className="size-3.5" />
      </Pin>
      <Input
        className={cn("h-7 pl-xl text-caption", hasValue && "pr-xl", className)}
        {...props}
      />
      {hasValue && (
        // off-ramp inset: right-1.5 (0.375rem) is not on the semantic spacing ramp
        <Pin to="right" style={{ right: "0.375rem" }}>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-sm p-2xs text-muted-foreground hover:text-foreground focus:outline-none"
            tabIndex={-1}
            aria-label="Clear filter"
          >
            <MdClose className="size-3" />
          </button>
        </Pin>
      )}
    </div>
  );
}
