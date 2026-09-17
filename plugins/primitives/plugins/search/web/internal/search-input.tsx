import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";
import {
  cn,
  ControlSizeProvider,
  Input,
  type DensityControlled,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Kbd } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { MdClose, MdSearch } from "react-icons/md";

/**
 * How the field is drawn.
 *
 * - `field` (default) — a bordered input box with a leading search icon: the
 *   standalone search field of a toolbar or panel.
 * - `bare` — no box of its own: it fills the cell it is placed in (a pill that
 *   already draws the border) with a leading icon, a borderless input and a
 *   trailing `/` key hint. Escape clears the query and leaves the field.
 */
export type SearchInputAppearance = "field" | "bare";

// The `field` appearance is a compact field by construction: it declares the
// `sm` control size itself (as `Bar` does), so its height still follows the
// density preset's `control-sm` token while staying quieter than the content it
// filters. `bare` fills its host cell instead.
export type SearchInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> &
  DensityControlled & {
    wrapperClassName?: ClassName;
    appearance?: SearchInputAppearance;
    /** The `<input>` element — lets a host focus the field (e.g. on `/`). */
    ref?: React.Ref<HTMLInputElement>;
  };

export function SearchInput({
  className,
  wrapperClassName,
  appearance = "field",
  ...props
}: SearchInputProps) {
  const hasValue = typeof props.value === "string" && props.value.length > 0;

  const handleClear = () => {
    props.onChange?.({
      target: { value: "" },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  if (appearance === "bare") {
    const { onKeyDown, ...inputProps } = props;
    return (
      <Line
        className={cn(
          "h-full gap-sm px-sm text-muted-foreground",
          wrapperClassName,
        )}
      >
        <MdSearch className={cn("size-5", rigidClass())} aria-hidden />
        <Fill>
          <Input
            className={cn(
              "h-full rounded-none border-0 bg-transparent px-none text-body text-foreground shadow-none focus-visible:ring-0 dark:bg-transparent",
              className,
            )}
            {...inputProps}
            onKeyDown={(e) => {
              onKeyDown?.(e);
              if (e.defaultPrevented || e.key !== "Escape") return;
              e.preventDefault();
              if (hasValue) handleClear();
              e.currentTarget.blur();
            }}
          />
        </Fill>
        {hasValue ? (
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              "rounded-sm p-2xs text-muted-foreground hover:text-foreground focus:outline-none",
              rigidClass(),
            )}
            tabIndex={-1}
            aria-label="Clear filter"
          >
            <MdClose className="size-4" />
          </button>
        ) : (
          <Kbd className={rigidClass()}>/</Kbd>
        )}
      </Line>
    );
  }

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
      <ControlSizeProvider size="sm">
        <Input
          className={cn("pl-xl", hasValue && "pr-xl", className)}
          {...props}
        />
      </ControlSizeProvider>
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
