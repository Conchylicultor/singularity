import * as React from "react";

import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/lib/utils";
import {
  textareaSizeClassFor,
  useControlSize,
  type DensityControlled,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/control-size";
import { fieldChromeClass } from "./field-chrome";

// `Input`'s multi-line sibling: the same chrome (field-chrome.ts) and the same
// ambient density for padding and text — only the height is free, growing with
// `rows` and the user's vertical resize.
function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea"> & DensityControlled) {
  const density = useControlSize();
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldChromeClass,
        "resize-y",
        textareaSizeClassFor(density),
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
