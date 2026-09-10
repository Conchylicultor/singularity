import type { ComponentProps } from "react";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Standard-look nav link for the shared site header. Page plugins wrap it in
 * their `WebsiteHeader` contributions so every nav entry matches.
 *
 * Two emphases, and the split is about destination rather than importance:
 * `quiet` (the default) is a place on this site, and there are several of them,
 * so they must not compete with each other — they sit in the secondary grey and
 * come up to full foreground under the pointer, with no hover box: the colour
 * change is the whole affordance, as in running text. `strong` is the one entry that
 * leaves the site — writing an email — and there is exactly one of it, which is
 * what earns it a filled pill.
 *
 * The filled pill is the site's INVERTED fill (the foreground colour, with dark
 * type), which the site's palette carries as `secondary`; the brand accent
 * (`primary`) is reserved for identity and hover.
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
    <Button
      variant="secondary"
      shape="pill"
      className="font-semibold"
      {...rest}
    >
      {label}
    </Button>
  ) : (
    <Button
      variant="ghost"
      className="text-muted-foreground hover:text-foreground hover:bg-transparent"
      {...rest}
    >
      {label}
    </Button>
  );
}
