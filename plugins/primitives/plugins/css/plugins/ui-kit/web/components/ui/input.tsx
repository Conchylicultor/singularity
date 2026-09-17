import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/lib/utils";
import {
  fieldSizeClassFor,
  useControlSize,
  type DensityControlled,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/control-size";

// Height, inline padding, gap and text size come from the ambient control
// density (`fieldSizeClassFor`), exactly like `Button` — never a per-instance
// `size` or height class, so a field always matches the buttons beside it.
function Input({
  className,
  type,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & DensityControlled) {
  const density = useControlSize();
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "focus-ring w-full min-w-0 rounded-lg border border-input bg-transparent transition-colors file:inline-flex file:h-full file:border-0 file:bg-transparent file:text-label file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        fieldSizeClassFor(density),
        className,
      )}
      {...props}
    />
  );
}

export { Input };
