import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { CONTACT_MAILTO } from "../internal/contact";

/**
 * "Get in touch" in the shared site header — the one nav entry that leaves the
 * site, and therefore the one that is a filled pill rather than a ghost link.
 *
 * A real `<a href="mailto:…">` (via base-ui's `render`), not a click handler, so
 * the reader can copy the address, open it in their own client, or read it off
 * the status bar before committing to anything.
 */
export function ContactNavItem() {
  return (
    <WebsiteNavLink
      label="Get in touch"
      emphasis="strong"
      render={<a href={CONTACT_MAILTO} />}
    />
  );
}
