import type { ComponentProps } from "react";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Standard-look nav link for the shared site header. Section plugins wrap it
 * in their `WebsiteToolbar.End` contributions so every nav entry matches:
 * ghost for regular links, `primary` for the one call-to-action (Download).
 */
export function WebsiteNavLink({
  label,
  primary = false,
  ...rest
}: {
  label: string;
  /** Render as the site's single primary CTA instead of a ghost link. */
  primary?: boolean;
} & Omit<ComponentProps<typeof Button>, "variant" | "children">) {
  return (
    <Button variant={primary ? "default" : "ghost"} {...rest}>
      {label}
    </Button>
  );
}
