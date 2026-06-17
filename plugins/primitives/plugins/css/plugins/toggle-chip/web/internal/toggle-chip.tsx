import { cn, type ControlSize, useControlSize } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import type React from "react";

export type ToggleChipVariant = "solid" | "ghost";
export type ToggleChipSize = "sm" | "md";

// The chip's two-level scale sits one notch under the control scale by design
// (chips read slightly smaller than the buttons beside them): "sm" → control-xs,
// "md" → control-sm. Map the ambient 4-level density onto it so an unsized chip in
// a toolbar matches a same-density button's height as closely as the scale allows
// (`sm` density → "md" → control-sm = a `sm` button). Above `sm` it caps at "md".
function chipSizeForDensity(density: ControlSize): ToggleChipSize {
  return density === "xs" ? "sm" : "md";
}

const VARIANT_CLASS: Record<
  ToggleChipVariant,
  { active: string; inactive: string }
> = {
  // stats look: filled primary when on, bordered background when off
  solid: {
    active: "border border-primary bg-primary text-primary-foreground",
    inactive:
      "border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
  },
  // filter look: accent fill when on, transparent ghost when off
  ghost: {
    active: "bg-accent text-accent-foreground",
    inactive: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
  },
};

export interface ToggleChipProps {
  /** Whether the chip reads as selected/on. Drives the active vs inactive color pair. */
  active: boolean;
  /** Color treatment. "solid" = filled-primary (controls); "ghost" = accent (filters). Default "solid". */
  variant?: ToggleChipVariant;
  /** Size token. md → text-xs px-3 py-1; sm → text-2xs px-2 py-0.5. Default "md". */
  size?: ToggleChipSize;
  /** Leading icon, rendered before children. */
  icon?: React.ReactNode;
  /** Element to render. Default "button"; pass "a" for link-style chips. */
  as?: React.ElementType;
  disabled?: boolean;
  className?: string;
  title?: string;
  children: React.ReactNode;
  /** Permissive passthrough for the rendered element (onClick, href, …). */
  [key: string]: unknown;
}

export function ToggleChip({
  active,
  variant = "solid",
  size,
  icon,
  as: As = "button",
  disabled,
  className,
  children,
  ...rest
}: ToggleChipProps) {
  // No explicit `size` → inherit the ambient density (defaults to "md" → "md").
  const density = useControlSize();
  const effectiveSize = size ?? chipSizeForDensity(density);
  const isButton = As === "button";
  // Auto toggle semantics for plain buttons; defer to the caller's role
  // (e.g. SegmentedControl's role="radio" + aria-checked) when one is supplied.
  const ariaPressed =
    isButton && rest.role === undefined ? active : undefined;
  return (
    <Badge
      as={As}
      shape="pill"
      icon={icon}
      colorClass={
        active ? VARIANT_CLASS[variant].active : VARIANT_CLASS[variant].inactive
      }
      type={isButton ? "button" : undefined}
      disabled={isButton ? disabled : undefined}
      aria-pressed={ariaPressed}
      className={cn(
        // ToggleChip's identity over the shared chip shell: a control that
        // height-matches the buttons beside it, with hover/disabled transitions.
        "transition-colors disabled:pointer-events-none disabled:opacity-50",
        effectiveSize === "sm" && "control-xs p-chip text-2xs",
        effectiveSize === "md" && "control-sm p-control text-caption",
        className,
      )}
      {...rest}
    >
      {children}
    </Badge>
  );
}

export interface SegmentedOption<T extends string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Forwarded to each chip. Default "solid". */
  variant?: ToggleChipVariant;
  size?: ToggleChipSize;
  /** Wrapper override (e.g. spacing). */
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  variant = "solid",
  size,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" className={cn("flex shrink-0 flex-nowrap gap-xs", className)}>
      {options.map((opt) => (
        <ToggleChip
          key={opt.id}
          role="radio"
          aria-checked={opt.id === value}
          active={opt.id === value}
          variant={variant}
          size={size}
          icon={opt.icon}
          title={opt.title}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </ToggleChip>
      ))}
    </div>
  );
}
