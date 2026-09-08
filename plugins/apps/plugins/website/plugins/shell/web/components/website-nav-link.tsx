import type { ComponentProps } from "react";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Standard-look nav link for the shared site header. Page plugins wrap it in
 * their `WebsiteHeader` contributions so every nav entry matches.
 *
 * Two emphases, and the split is about destination rather than importance:
 * `quiet` (the default) is a place on this site, and there are several of them,
 * so they must not compete with each other. `strong` is the one entry that leaves
 * the site — writing an email — and there is exactly one of it, which is what
 * earns it a filled pill.
 */
export function WebsiteNavLink({
  label,
  emphasis = "quiet",
  ...rest
}: {
  label: string;
  /** `quiet` = a page of this site. `strong` = the one entry that leaves it. */
  emphasis?: "quiet" | "strong";
} & Omit<ComponentProps<typeof Button>, "variant" | "shape" | "children">) {
  return emphasis === "strong" ? (
    <Button variant="default" shape="pill" {...rest}>
      {label}
    </Button>
  ) : (
    <Button variant="ghost" {...rest}>
      {label}
    </Button>
  );
}
