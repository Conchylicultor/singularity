import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";
import type { ComponentProps } from "react";
import { MdKeyboardArrowDown } from "react-icons/md";

export interface ControlPanelFieldProps extends Omit<
  ComponentProps<typeof Button>,
  "children" | "variant" | "aspect" | "shape"
> {
  /** Leading glyph — typically the picked field's type icon. */
  icon?: React.ReactNode;
  /**
   * The current value, as text. Pass `null` when there is none: the field then
   * shows `placeholder` in the muted tone, so "unset" reads differently from
   * "set to something short".
   */
  label: React.ReactNode;
  placeholder?: string;
}

/**
 * The ONE control shape inside a rule row — the box a field, an operator or a
 * value is picked from. It fills its grid cell (`w-full`) and truncates its
 * label, so a long value shortens the box's text instead of widening the panel:
 * a builder whose panel grows when you pick a longer value is a builder that
 * resizes as you use it, which is the measurement-driven width this vocabulary
 * exists to remove.
 *
 * It is a `Button variant="outline"`, so it inherits the app's control height,
 * focus ring, hover and disabled treatment rather than re-deriving them. Every
 * remaining prop is forwarded, which is what lets a caller hand it to a
 * `PopoverTrigger` via base-ui's `render` prop.
 */
export function ControlPanelField({
  icon,
  label,
  placeholder = "Select…",
  className,
  ref,
  ...rest
}: ControlPanelFieldProps) {
  const empty = label == null || label === "";
  return (
    <Button
      ref={ref}
      variant="outline"
      data-empty={empty ? "" : undefined}
      className={cn("w-full justify-between font-normal", className)}
      {...rest}
    >
      <span className="flex min-w-0 items-center gap-2xs">
        {icon != null ? (
          <span className="flex shrink-0 items-center text-muted-foreground">
            {icon}
          </span>
        ) : null}
        <span className={cn("truncate", empty && "text-muted-foreground")}>
          {empty ? placeholder : label}
        </span>
      </span>
      <MdKeyboardArrowDown className="shrink-0 text-muted-foreground" />
    </Button>
  );
}
