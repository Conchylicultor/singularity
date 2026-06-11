import { cn, Input } from "@plugins/primitives/plugins/ui-kit/web";
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
      <MdSearch className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        className={cn("h-7 pl-7 text-caption", hasValue && "pr-6", className)}
        {...props}
      />
      {hasValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus:outline-none"
          tabIndex={-1}
          aria-label="Clear filter"
        >
          <MdClose className="size-3" />
        </button>
      )}
    </div>
  );
}
