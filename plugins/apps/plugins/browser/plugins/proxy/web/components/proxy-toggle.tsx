import { MdShield, MdOutlineShield } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useBrowserProxy } from "@plugins/apps/plugins/browser/plugins/shell/web";

/**
 * Proxy-mode toggle for the chrome bar's trailing actions. When on, pages load
 * through the same-origin framing-stripping proxy so framing-blocked sites
 * render. Filled shield when on, outline when off.
 */
export function ProxyToggle() {
  const { enabled, toggle } = useBrowserProxy();
  const label = enabled
    ? "Proxy mode on — bypass embedding blocks"
    : "Proxy mode off — bypass embedding blocks";

  return (
    <IconButton
      icon={enabled ? MdShield : MdOutlineShield}
      label={label}
      tooltip={label}
      aria-pressed={enabled}
      onClick={toggle}
    />
  );
}
